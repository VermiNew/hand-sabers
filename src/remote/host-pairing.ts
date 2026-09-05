import { t } from '../i18n/index.ts';
import {
  createRemoteTrackingSession,
  getRemoteTrackingSessionState,
  initRemoteTrackingHost,
  isRemoteTrackingConnected,
  respondToPhoneApproval,
  revokeRemoteTrackingSession,
} from './host-session.ts';
import type { RemoteTrackingSessionState } from './host-session.ts';
import { createModalTransition } from '../ui/modal-transition.ts';

export { isRemoteTrackingConnected, sendPhoneTrackingOptions } from './host-session.ts';

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function initRemoteTrackingPairing(): void {
  initRemoteTrackingHost();

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
  const approvalPanel = element<HTMLElement>('remoteTrackingApproval');
  const approvalAllowButton = element<HTMLButtonElement>('remoteTrackingApprovalAllow');
  const approvalDenyButton = element<HTMLButtonElement>('remoteTrackingApprovalDeny');
  const confirmPanel = element<HTMLElement>('remoteTrackingConfirm');
  const confirmYesButton = element<HTMLButtonElement>('remoteTrackingConfirmYes');
  const confirmNoButton = element<HTMLButtonElement>('remoteTrackingConfirmNo');
  const newCodeButton = element<HTMLButtonElement>('remoteTrackingNewCode');
  if (!openButton || !overlay || !closeButton || !createButton || !sessionPanel || !qr || !code || !phoneLink || !status || !statusText || !errorMessage) return;
  const modal = createModalTransition({
    overlay,
    panel: overlay.querySelector<HTMLElement>('.rt-panel'),
  });

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

  const setStatus = (phase: 'idle' | 'loading' | 'ready' | 'connected', messageKey: string) => {
    status.dataset['state'] = phase;
    statusText.textContent = t(messageKey);
  };

  const render = (sessionState: RemoteTrackingSessionState) => {
    const { session, phase, error } = sessionState;
    errorMessage.textContent = error ? t(`remoteTracking.${error}`) : '';
    errorMessage.hidden = !error;
    sessionPanel.hidden = !session;
    createButton.disabled = phase === 'connecting';
    createButton.hidden = Boolean(session);

    if (session) {
      qr.src = session.qrDataUrl;
      code.textContent = session.code;
      phoneLink.href = session.phoneUrl;
    } else {
      qr.removeAttribute('src');
      code.textContent = '------';
      phoneLink.href = './remote-camera.html';
    }

    if (phase === 'connected') setStatus('connected', 'remoteTracking.phoneConnected');
    else if (phase === 'connecting') setStatus('loading', 'remoteTracking.reconnectingStream');
    else if (phase === 'approvalPending') setStatus('loading', 'remoteTracking.manualApprovalPending');
    else if (phase === 'approvalGranted') setStatus('ready', 'remoteTracking.manualApprovalGranted');
    else if (phase === 'claimed') setStatus('ready', 'remoteTracking.phoneClaimed');
    else if (phase === 'ready') setStatus('ready', 'remoteTracking.scanQr');
    else setStatus('idle', 'remoteTracking.hostIdle');

    const connected = phase === 'connected';
    if (disconnectButton) disconnectButton.hidden = !connected;
    if (approvalPanel) approvalPanel.hidden = phase !== 'approvalPending';
    if (approvalAllowButton) approvalAllowButton.disabled = false;
    if (approvalDenyButton) approvalDenyButton.disabled = false;
    if (confirmPanel && !connected) confirmPanel.hidden = true;
    if (newCodeButton) newCodeButton.hidden = phase !== 'claimed';
  };

  const open = () => {
    const sessionState = getRemoteTrackingSessionState();
    render(sessionState);
    modal.open({
      initialFocus: sessionState.session ? closeButton : createButton,
      returnFocusTo: openButton,
    });
  };

  const close = () => {
    modal.close();
  };

  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  createButton.addEventListener('click', () => {
    void createRemoteTrackingSession().catch(() => undefined);
  });
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) close();
  });
  window.addEventListener('hand-sabers:remote-session-state', event => {
    render((event as CustomEvent<RemoteTrackingSessionState>).detail);
  });

  disconnectButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = false;
    disconnectButton.hidden = true;
  });
  confirmNoButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = true;
    if (disconnectButton) disconnectButton.hidden = !isRemoteTrackingConnected();
  });
  confirmYesButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = true;
    void revokeRemoteTrackingSession();
  });
  newCodeButton?.addEventListener('click', () => {
    void createRemoteTrackingSession().catch(() => undefined);
  });
  const respondToApproval = (approved: boolean) => {
    if (approvalAllowButton) approvalAllowButton.disabled = true;
    if (approvalDenyButton) approvalDenyButton.disabled = true;
    void respondToPhoneApproval(approved).catch(() => {
      if (approvalAllowButton) approvalAllowButton.disabled = false;
      if (approvalDenyButton) approvalDenyButton.disabled = false;
    });
  };
  approvalAllowButton?.addEventListener('click', () => respondToApproval(true));
  approvalDenyButton?.addEventListener('click', () => respondToApproval(false));

  render(getRemoteTrackingSessionState());
}
