import { t } from '../i18n/index.ts';
import { createAvatarBadge } from './avatars.ts';
import type { RoomSnapshot } from './protocol.ts';
import { isVoicePlayerSpeaking } from './voice-speaking.ts';

export function renderRoomPlayerList(
  container: HTMLElement,
  snapshot: RoomSnapshot,
  currentPlayerId: string,
  pendingPreparationMapId: string,
): void {
  container.replaceChildren();
  for (const player of snapshot.players) {
    const row = document.createElement('div');
    row.className = `mp-player-row${player.ready ? ' is-ready' : ''}`;
    row.dataset['voicePlayerId'] = player.id;
    row.classList.toggle('is-voice-speaking', isVoicePlayerSpeaking(player.id));
    const identity = document.createElement('span');
    identity.className = 'mp-player-name';
    identity.append(createAvatarBadge(player.avatar, 18, player.color));
    const nameText = document.createElement('span');
    nameText.textContent = player.name;
    nameText.style.color = player.color;
    identity.append(nameText);
    if (player.role === 'host') {
      const role = document.createElement('span');
      role.className = 'mp-player-role';
      role.textContent = 'HOST';
      identity.append(role);
    }
    if (snapshot.mode === 'coop') {
      const saber = document.createElement('span');
      saber.className = 'mp-player-role';
      saber.textContent = t(`multiplayer.${player.saber}Saber`);
      identity.append(saber);
    }
    const state = document.createElement('span');
    state.className = 'mp-player-state';
    if (snapshot.round && !player.playing) {
      state.textContent = t('multiplayer.spectatorState');
    } else if (player.ready) {
      state.textContent = t('multiplayer.calibratedState');
    } else if (player.id === currentPlayerId && pendingPreparationMapId) {
      state.textContent = t('multiplayer.calibratingState');
    } else {
      state.textContent = t('multiplayer.waitingCalibrationState');
    }
    row.append(identity, state);
    container.append(row);
  }
}
