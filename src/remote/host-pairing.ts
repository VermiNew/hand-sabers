import { t } from '../i18n/index.ts';
import { openRemoteTrackingChannel } from './channel.ts';
import { setHostAudioSocket, onPhoneAudioReady, onPhoneAudioError } from './host-audio.ts';
import { isAudioEvent } from './audio-protocol.ts';

interface TrackingSessionResponse {
  session?: {
    id?: unknown;
    code?: unknown;
    expiresAt?: unknown;
  };
  hostToken?: unknown;
  phoneUrl?: unknown;
  qrDataUrl?: unknown;
}

interface TrackingSessionStatus {
  phoneCredentialIssued?: unknown;
  phoneConnected?: unknown;
}

interface ActiveSession {
  id: string;
  hostToken: string;
  expiresAt: number;
  pollTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  socket: WebSocket | null;
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

let activeSession: ActiveSession | null = null;
let remoteTrackingConnected = false;

export function isRemoteTrackingConnected(): boolean {
  return remoteTrackingConnected;
}

function setRemoteTrackingConnected(connected: boolean): void {
  if (remoteTrackingConnected === connected) return;
  remoteTrackingConnected = connected;
  window.dispatchEvent(new CustomEvent('hand-sabers:remote-tracking-state', { detail: { connected } }));
}

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function bearer(session: ActiveSession): HeadersInit {
  return { Authorization: `Bearer ${session.hostToken}` };
}

export function initRemoteTrackingPairing(): void {
  const openButton = element<HTMLButtonElement>('settingsRemoteTracking');
  const overlay = element<HTMLElement>('remoteTrackingOverlay');
  const closeButton = element<HTMLButtonElement>('remoteTrackingClose');
  const createButton = element<HTMLButtonElement>('remoteTrackingCreate');
  const sessionPanel = element<HTMLElement>('remoteTrackingSession');
  const qr = element<HTMLImageElement>('remoteTrackingQr');
  const code = element<HTMLElement>('remoteTrackingCode');
  const phoneLink = element<HTMLAnchorElement>('remoteTrackingPhoneLink');
  const status = element<HTMLElement>('remoteTrackingStatus');
  const statusText = element<HTMLElement>('remoteTrackingStatusText');
  const errorMessage = element<HTMLElement>('remoteTrackingError');
  const disconnectButton = element<HTMLButtonElement>('remoteTrackingDisconnect');
  const confirmPanel = element<HTMLElement>('remoteTrackingConfirm');
  const confirmYesButton = element<HTMLButtonElement>('remoteTrackingConfirmYes');
  const confirmNoButton = element<HTMLButtonElement>('remoteTrackingConfirmNo');
  const newCodeButton = element<HTMLButtonElement>('remoteTrackingNewCode');
  if (!openButton || !overlay || !closeButton || !createButton || !sessionPanel || !qr || !code || !phoneLink || !status || !statusText || !errorMessage) return;

  const badgeTargets = [
    document.querySelector<HTMLElement>('.sp-tab[data-tab="remoteTracking"] .sp-tab-title'),
    element<HTMLElement>('remoteTrackingTitle'),
  ];
  for (const target of badgeTargets) {
    if (!target || target.querySelector('.experimental-badge')) continue;
    const badge = document.createElement('span');
    badge.className = 'experimental-badge';
    badge.dataset['i18n'] = 'remoteTracking.experimentalBadge';
    badge.textContent = t('remoteTracking.experimentalBadge');
    target.append(badge);
  }

  const showError = (message = '') => {
    errorMessage.textContent = message;
    errorMessage.hidden = !message;
  };

  const setStatus = (state: 'idle' | 'loading' | 'ready' | 'connected', messageKey: string) => {
    status.dataset['state'] = state;
    statusText.textContent = t(messageKey);
  };

  const clearPoll = () => {
    if (activeSession?.pollTimer) clearInterval(activeSession.pollTimer);
    if (activeSession) activeSession.pollTimer = null;
  };

  const clearReconnect = () => {
    if (activeSession?.reconnectTimer) clearTimeout(activeSession.reconnectTimer);
    if (activeSession) activeSession.reconnectTimer = null;
  };

  const resetSessionUi = () => {
    clearPoll();
    clearReconnect();
    activeSession?.socket?.close();
    activeSession = null;
    setHostAudioSocket(null);
    setRemoteTrackingConnected(false);
    sessionPanel.hidden = true;
    qr.removeAttribute('src');
    code.textContent = '------';
    phoneLink.href = './remote-camera.html';
    createButton.disabled = false;
    createButton.hidden = false;
    setStatus('idle', 'remoteTracking.hostIdle');
    // Hide disconnect/confirm/new-code UI
    if (disconnectButton) disconnectButton.hidden = true;
    if (confirmPanel) confirmPanel.hidden = true;
    if (newCodeButton) newCodeButton.hidden = true;
  };

  /** Show disconnect button when phone connects, hide when disconnected */
  const updateActionButtons = (connected: boolean) => {
    if (disconnectButton) disconnectButton.hidden = !connected;
    if (confirmPanel) confirmPanel.hidden = true;
    // Show "new code" button when session was active but phone is now disconnected
    // (not on initial idle state — only after a disconnection)
    if (newCodeButton) newCodeButton.hidden = connected || !activeSession;
  };

  const revokeActiveSession = async () => {
    const session = activeSession;
    resetSessionUi();
    if (!session) return;
    try {
      await fetch(`/api/tracking-sessions/${encodeURIComponent(session.id)}`, {
        method: 'DELETE',
        headers: bearer(session),
      });
    } catch {
      // The session is short-lived; failed revoke should not expose credentials because tokens stay in memory only.
    }
  };

  const readStatus = async (session: ActiveSession) => {
    const response = await fetch(`/api/tracking-sessions/${encodeURIComponent(session.id)}`, {
      headers: bearer(session),
    });
    if (!response.ok) throw new Error('STATUS_FAILED');
    const payload = await response.json().catch(() => ({})) as TrackingSessionStatus;
    if (payload.phoneConnected === true) {
      setStatus('connected', 'remoteTracking.phoneConnected');
      clearPoll();
    } else if (payload.phoneCredentialIssued === true) {
      setStatus('ready', 'remoteTracking.phoneClaimed');
    }
  };

  const startPolling = (session: ActiveSession) => {
    clearPoll();
    session.pollTimer = setInterval(() => {
      void readStatus(session).catch(() => {
        if (activeSession?.id !== session.id) return;
        if (Date.now() >= session.expiresAt) {
          resetSessionUi();
          showError(t('remoteTracking.sessionExpired'));
        } else {
          showError(t('remoteTracking.statusFailed'));
        }
      });
    }, 2_000);
  };

  const connectHostChannel = (session: ActiveSession) => {
    clearReconnect();
    let authenticationRejected = false;
    const socket = openRemoteTrackingChannel({
      sessionId: session.id,
      token: session.hostToken,
      role: 'host',
      onEvent: event => {
        if (activeSession !== session) return;
        if (event.type === 'joined') {
          session.reconnectAttempt = 0;
          if (typeof event.expiresAt === 'number' && Number.isFinite(event.expiresAt)) session.expiresAt = event.expiresAt;
          showError();
        } else if (event.type === 'peer-connected') {
          setRemoteTrackingConnected(true);
          setStatus('connected', 'remoteTracking.phoneConnected');
          clearPoll();
          updateActionButtons(true);
          setHostAudioSocket(session.socket);
        } else if (event.type === 'peer-disconnected') {
          setRemoteTrackingConnected(false);
          setStatus('ready', 'remoteTracking.phoneClaimed');
          startPolling(session);
          updateActionButtons(false);
          setHostAudioSocket(null);
        } else if (event.type === 'error') {
          authenticationRejected = true;
        } else if (isAudioEvent(event)) {
          if (event.type === 'audio-ready') onPhoneAudioReady();
          else if (event.type === 'audio-error') onPhoneAudioError();
        }
      },
      onBinary: packet => {
        if (activeSession === session) {
          window.dispatchEvent(new CustomEvent('hand-sabers:remote-tracking-packet', { detail: packet }));
        }
      },
      onClose: () => {
        if (activeSession === session) {
          session.socket = null;
          setHostAudioSocket(null);
          setRemoteTrackingConnected(false);
          if (Date.now() >= session.expiresAt) {
            resetSessionUi();
            showError(t('remoteTracking.sessionExpired'));
            return;
          }
          if (authenticationRejected && session.reconnectAttempt >= 2) {
            resetSessionUi();
            showError(t('remoteTracking.sessionExpired'));
            return;
          }
          setStatus('loading', 'remoteTracking.reconnectingStream');
          const delay = Math.min(10_000, 750 * 2 ** session.reconnectAttempt++);
          session.reconnectTimer = setTimeout(() => {
            if (activeSession === session) connectHostChannel(session);
          }, delay);
        }
      },
    });
    session.socket = socket;
  };

  const createSession = async () => {
    createButton.disabled = true;
    showError();
    setStatus('loading', 'remoteTracking.hostCreating');
    try {
      const response = await fetch('/api/tracking-sessions', { method: 'POST' });
      const payload = await response.json().catch(() => ({})) as TrackingSessionResponse;
      const session = payload.session;
      if (
        !response.ok
        || typeof session?.id !== 'string'
        || !SESSION_ID_RE.test(session.id)
        || typeof session.code !== 'string'
        || !CODE_RE.test(session.code)
        || typeof payload.hostToken !== 'string'
        || !TOKEN_RE.test(payload.hostToken)
        || typeof session.expiresAt !== 'number'
        || !Number.isFinite(session.expiresAt)
        || typeof payload.phoneUrl !== 'string'
        || typeof payload.qrDataUrl !== 'string'
        || !payload.qrDataUrl.startsWith('data:image/png;base64,')
      ) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'CREATE_FAILED');

      await revokeActiveSession();
      activeSession = {
        id: session.id,
        hostToken: payload.hostToken,
        expiresAt: session.expiresAt,
        pollTimer: null,
        reconnectTimer: null,
        reconnectAttempt: 0,
        socket: null,
      };
      qr.src = payload.qrDataUrl;
      code.textContent = session.code;
      phoneLink.href = payload.phoneUrl;
      sessionPanel.hidden = false;
      createButton.disabled = false;
      setStatus('ready', 'remoteTracking.scanQr');
      connectHostChannel(activeSession);
      startPolling(activeSession);
    } catch (error) {
      resetSessionUi();
      showError(t(error instanceof Error && error.message === 'RATE_LIMITED'
        ? 'remoteTracking.rateLimited'
        : 'remoteTracking.createFailed'));
    }
  };

  const open = () => {
    overlay.hidden = false;
    showError();
    // Restore UI based on current session state
    if (activeSession) {
      if (isRemoteTrackingConnected()) {
        setStatus('connected', 'remoteTracking.phoneConnected');
        if (disconnectButton) disconnectButton.hidden = false;
        if (newCodeButton) newCodeButton.hidden = true;
      } else {
        // Session exists but phone not connected — show waiting state
        if (disconnectButton) disconnectButton.hidden = true;
        if (newCodeButton) newCodeButton.hidden = false;
      }
    } else {
      createButton.focus({ preventScroll: true });
    }
  };

  const close = () => {
    overlay.hidden = true;
    openButton.focus({ preventScroll: true });
  };

  openButton.addEventListener('click', open);
  createButton.addEventListener('click', () => void createSession());
  closeButton.addEventListener('click', close);
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) close();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) close();
  });
  window.addEventListener('pagehide', () => void revokeActiveSession(), { once: true });

  // ── Disconnect / confirm / new code ──────────────────────────────────────
  disconnectButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = false;
    if (disconnectButton) disconnectButton.hidden = true;
  });

  confirmNoButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = true;
    // Restore disconnect button visibility based on current connection state
    if (disconnectButton) disconnectButton.hidden = !isRemoteTrackingConnected();
  });

  confirmYesButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = true;
    void revokeActiveSession().then(() => {
      // After disconnection, show "new code" button and hide the original create button
      if (newCodeButton) newCodeButton.hidden = false;
      if (createButton) createButton.hidden = true;
      setStatus('idle', 'remoteTracking.hostIdle');
    });
  });

  newCodeButton?.addEventListener('click', () => {
    if (newCodeButton) newCodeButton.hidden = true;
    // Restore the original create button for future idle states
    if (createButton) createButton.hidden = false;
    void createSession();
  });
}
