import { t } from '../i18n/index.ts';

type TrackingSource = 'camera' | 'remote' | null;

export function updateCalibrationSourceUI(source: TrackingSource, remoteConnected: boolean): void {
  const badge = document.getElementById('calibTrackingSource');
  const icon = document.getElementById('calibSourceIcon');
  const text = document.getElementById('calibSourceText');
  const feedLabel = document.getElementById('calibFeedLabel');
  if (!badge || !icon || !text || !feedLabel) return;

  if (source === 'remote') {
    badge.dataset['state'] = remoteConnected ? 'phone-connected' : 'phone-disconnected';
    icon.textContent = remoteConnected ? 'smartphone' : 'phonelink_off';
    text.textContent = t(remoteConnected ? 'calib.sourcePhoneConnected' : 'calib.sourcePhoneDisconnected');
    feedLabel.textContent = t('calib.landmarkFeed');
    return;
  }

  badge.dataset['state'] = 'camera';
  icon.textContent = 'videocam';
  text.textContent = t('calib.sourceCamera');
  feedLabel.textContent = t('calib.cameraFeed');
}
