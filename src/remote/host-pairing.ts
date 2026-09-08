import { t } from '../i18n/index.ts';
import {
  createRemoteTrackingSession,
  getRemoteTrackingSessionState,
  initRemoteTrackingHost,
  isRemoteTrackingConnected,
  respondToPhoneApproval,
  revokeRemoteTrackingSession,
  sendPhoneCameraProcessing,
} from './host-session.ts';
import type { RemoteTrackingSessionState } from './host-session.ts';
import { createModalTransition } from '../ui/modal-transition.ts';
import {
  getSettings,
  SETTINGS_CHANGED_EVENT,
  setSetting,
  type SettingsChangedDetail,
} from '../core/settings.ts';
import { supportsPhoneAudio, type PhoneCapabilitiesEvent } from './phone-capabilities.ts';
import type { TrackingSourcePreference } from '../types/index.js';

export { isRemoteTrackingConnected, sendPhoneCameraProcessing, sendPhoneTrackingOptions } from './host-session.ts';

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
  const cameraRoleCard = element<HTMLElement>('remoteCameraRoleCard');
  const cameraRoleToggle = element<HTMLInputElement>('remoteCameraRole');
  const cameraRoleStatus = element<HTMLElement>('remoteCameraRoleStatus');
  const cameraProcessing = element<HTMLSelectElement>('remoteCameraProcessing');
  const cameraProcessingHint = element<HTMLElement>('remoteCameraProcessingHint');
  const audioRoleCard = element<HTMLElement>('remoteAudioRoleCard');
  const audioRoleToggle = element<HTMLInputElement>('remoteAudioRole');
  const audioRoleStatus = element<HTMLElement>('remoteAudioRoleStatus');
  const audioProgress = element<HTMLElement>('remoteAudioProgress');
  const audioProgressBar = element<HTMLProgressElement>('remoteAudioProgressBar');
  const audioProgressText = element<HTMLElement>('remoteAudioProgressText');
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

  let currentPhase = getRemoteTrackingSessionState().phase;
  let phoneAudioReady = false;
  let phoneAudioSupported: boolean | null = null;
  let audioPreloadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let lastPhoneTrackingSource: TrackingSourcePreference = getSettings().trackingSource === 'camera'
    ? 'phone'
    : getSettings().trackingSource;

  const interpolate = (key: string, values: Record<string, string | number>): string => {
    let message = t(key);
    for (const [name, value] of Object.entries(values)) {
      message = message.replace(`{{${name}}}`, String(value));
    }
    return message;
  };

  const resetAudioProgress = () => {
    audioPreloadState = 'idle';
    if (audioProgress) audioProgress.hidden = true;
    if (audioProgressBar) {
      audioProgressBar.max = 1;
      audioProgressBar.value = 0;
    }
    if (audioProgressText) audioProgressText.textContent = '';
  };

  const renderRoles = () => {
    const settings = getSettings();
    const connected = currentPhase === 'connected';
    const cameraEnabled = settings.trackingSource !== 'camera';
    const audioEnabled = settings.phoneAudioOutput;
    if (cameraRoleToggle) cameraRoleToggle.checked = cameraEnabled;
    if (audioRoleToggle) audioRoleToggle.checked = audioEnabled;
    if (cameraRoleCard && cameraRoleStatus) {
      cameraRoleCard.dataset['state'] = cameraEnabled ? connected ? 'ready' : 'waiting' : 'off';
      cameraRoleStatus.textContent = t(cameraEnabled
        ? connected ? 'remoteTracking.roleReady' : 'remoteTracking.roleWaitingPhone'
        : 'remoteTracking.roleDisabled');
    }
    if (cameraProcessing) cameraProcessing.value = settings.phoneCameraProcessing;
    if (cameraProcessingHint) {
      cameraProcessingHint.textContent = t(settings.phoneCameraProcessing === 'computer'
        ? 'remoteTracking.processingComputerHint'
        : 'remoteTracking.processingPhoneHint');
    }
    if (audioRoleCard && audioRoleStatus) {
      const state = !audioEnabled
        ? 'off'
        : phoneAudioSupported === false || audioPreloadState === 'error'
          ? 'error'
          : audioPreloadState === 'loading'
            ? 'waiting'
            : phoneAudioReady ? 'ready' : 'waiting';
      const statusKey = !audioEnabled
        ? 'remoteTracking.roleDisabled'
        : phoneAudioSupported === false
          ? 'remoteTracking.roleUnsupported'
          : audioPreloadState === 'error'
            ? 'remoteTracking.rolePcFallback'
            : audioPreloadState === 'loading'
              ? 'remoteTracking.rolePreparingAudio'
              : phoneAudioReady
                ? 'remoteTracking.roleReady'
                : connected ? 'remoteTracking.roleWaitingActivation' : 'remoteTracking.roleWaitingPhone';
      audioRoleCard.dataset['state'] = state;
      audioRoleStatus.textContent = t(statusKey);
    }
  };

  const render = (sessionState: RemoteTrackingSessionState) => {
    const { session, phase, error } = sessionState;
    currentPhase = phase;
    if (phase !== 'connected') {
      phoneAudioReady = false;
      phoneAudioSupported = null;
      resetAudioProgress();
    }
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
    renderRoles();
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
  window.addEventListener(SETTINGS_CHANGED_EVENT, event => {
    const { changedKeys } = (event as CustomEvent<SettingsChangedDetail>).detail;
    if (changedKeys.includes('trackingSource') || changedKeys.includes('phoneAudioOutput') || changedKeys.includes('phoneCameraProcessing')) renderRoles();
    if (changedKeys.includes('phoneCameraProcessing')) sendPhoneCameraProcessing();
  });
  window.addEventListener('hand-sabers:phone-capabilities', event => {
    const capabilities = (event as CustomEvent<PhoneCapabilitiesEvent>).detail;
    phoneAudioSupported = supportsPhoneAudio(capabilities);
    renderRoles();
  });
  window.addEventListener('hand-sabers:phone-audio-ready', () => {
    phoneAudioReady = true;
    renderRoles();
  });
  window.addEventListener('hand-sabers:phone-audio-error', () => {
    phoneAudioReady = false;
    renderRoles();
  });
  window.addEventListener('hand-sabers:phone-audio-bank-progress', event => {
    if (!getSettings().phoneAudioOutput || !audioProgress || !audioProgressBar || !audioProgressText) return;
    const detail = (event as CustomEvent<{
      loadedAssets: number;
      totalAssets: number;
      loadedBytes: number;
      totalBytes: number;
    }>).detail;
    audioPreloadState = 'loading';
    audioProgress.hidden = false;
    audioProgress.dataset['state'] = 'loading';
    const useBytes = detail.totalBytes > 0;
    audioProgressBar.max = Math.max(1, useBytes ? detail.totalBytes : detail.totalAssets);
    audioProgressBar.value = Math.min(audioProgressBar.max, useBytes ? detail.loadedBytes : detail.loadedAssets);
    audioProgressText.textContent = interpolate('remoteTracking.audioProgress', {
      loaded: detail.loadedAssets,
      total: detail.totalAssets,
      loadedMb: (detail.loadedBytes / 1024 / 1024).toFixed(1),
      totalMb: (detail.totalBytes / 1024 / 1024).toFixed(1),
    });
    renderRoles();
  });
  window.addEventListener('hand-sabers:phone-audio-bank-ready', event => {
    if (!getSettings().phoneAudioOutput || !audioProgress || !audioProgressBar || !audioProgressText) return;
    const detail = (event as CustomEvent<{ cachedAssets: number; totalAssets: number }>).detail;
    audioPreloadState = 'ready';
    audioProgress.hidden = false;
    audioProgress.dataset['state'] = 'ready';
    audioProgressBar.max = 1;
    audioProgressBar.value = 1;
    audioProgressText.textContent = interpolate('remoteTracking.audioBankReady', {
      total: detail.totalAssets,
      cached: detail.cachedAssets,
    });
    renderRoles();
  });
  window.addEventListener('hand-sabers:phone-audio-bank-error', event => {
    if (!getSettings().phoneAudioOutput || !audioProgress || !audioProgressBar || !audioProgressText) return;
    const detail = (event as CustomEvent<{ code: string }>).detail;
    audioPreloadState = 'error';
    audioProgress.hidden = false;
    audioProgress.dataset['state'] = 'error';
    audioProgressBar.removeAttribute('value');
    audioProgressText.textContent = interpolate('remoteTracking.audioBankFallback', { code: detail.code });
    renderRoles();
  });

  cameraRoleToggle?.addEventListener('change', () => {
    const settings = getSettings();
    if (!cameraRoleToggle.checked && settings.trackingSource !== 'camera') {
      lastPhoneTrackingSource = settings.trackingSource;
    }
    const value: TrackingSourcePreference = cameraRoleToggle.checked ? lastPhoneTrackingSource : 'camera';
    const sourceInput = element<HTMLSelectElement>('menuTrackingSource');
    if (sourceInput) {
      sourceInput.value = value;
      sourceInput.dispatchEvent(new Event('change'));
    }
    if (getSettings().trackingSource !== value) setSetting('trackingSource', value);
    renderRoles();
  });
  audioRoleToggle?.addEventListener('change', () => {
    const enabled = audioRoleToggle.checked;
    const audioInput = element<HTMLInputElement>('menuPhoneAudioOutput');
    if (audioInput) {
      audioInput.checked = enabled;
      audioInput.dispatchEvent(new Event('change'));
    }
    if (getSettings().phoneAudioOutput !== enabled) setSetting('phoneAudioOutput', enabled);
    if (!enabled) resetAudioProgress();
    renderRoles();
  });
  cameraProcessing?.addEventListener('change', () => {
    const value = cameraProcessing.value === 'computer' ? 'computer' : 'phone';
    if (getSettings().phoneCameraProcessing !== value) setSetting('phoneCameraProcessing', value);
    renderRoles();
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
