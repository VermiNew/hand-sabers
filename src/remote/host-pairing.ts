import { t } from '../i18n/index.ts';

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
  pollTimer: ReturnType<typeof setInterval> | null;
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

let activeSession: ActiveSession | null = null;

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
  if (!openButton || !overlay || !closeButton || !createButton || !sessionPanel || !qr || !code || !phoneLink || !status || !statusText || !errorMessage) return;

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

  const resetSessionUi = () => {
    clearPoll();
    activeSession = null;
    sessionPanel.hidden = true;
    qr.removeAttribute('src');
    code.textContent = '------';
    phoneLink.href = './remote-camera.html';
    createButton.disabled = false;
    setStatus('idle', 'remoteTracking.hostIdle');
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
        if (activeSession?.id === session.id) showError(t('remoteTracking.statusFailed'));
      });
    }, 2_000);
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
        || typeof payload.phoneUrl !== 'string'
        || typeof payload.qrDataUrl !== 'string'
        || !payload.qrDataUrl.startsWith('data:image/png;base64,')
      ) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'CREATE_FAILED');

      await revokeActiveSession();
      activeSession = { id: session.id, hostToken: payload.hostToken, pollTimer: null };
      qr.src = payload.qrDataUrl;
      code.textContent = session.code;
      phoneLink.href = payload.phoneUrl;
      sessionPanel.hidden = false;
      createButton.disabled = false;
      setStatus('ready', 'remoteTracking.scanQr');
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
    createButton.focus({ preventScroll: true });
  };

  const close = () => {
    overlay.hidden = true;
    void revokeActiveSession();
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
}
