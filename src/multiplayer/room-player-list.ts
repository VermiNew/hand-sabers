import { t } from '../i18n/index.ts';
import { createAvatarBadge } from './avatars.ts';
import type { RoomSnapshot } from './protocol.ts';
import { isVoicePlayerSpeaking } from './voice-speaking.ts';

export function renderRoomPlayerList(
  container: HTMLElement,
  snapshot: RoomSnapshot,
  currentPlayerId: string,
  pendingPreparationMapId: string,
  onKickPlayer?: (playerId: string) => void,
): void {
  container.replaceChildren();
  for (const player of snapshot.players) {
    const row = document.createElement('div');
    row.className = `mp-player-row${player.ready ? ' is-ready' : ''}`;
    row.classList.toggle('is-spectator', player.role === 'spectator');
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
    } else if (player.role === 'spectator') {
      const role = document.createElement('span');
      role.className = 'mp-player-role';
      role.textContent = t('multiplayer.spectatorState');
      identity.append(role);
    }
    if (snapshot.mode === 'coop' && player.role !== 'spectator') {
      const saber = document.createElement('span');
      saber.className = 'mp-player-role';
      saber.textContent = t(`multiplayer.${player.saber}Saber`);
      identity.append(saber);
    }
    const state = document.createElement('span');
    state.className = 'mp-player-state';
    if (player.role === 'spectator') {
      state.textContent = t(snapshot.round && snapshot.round.finishedAt === null
        ? 'multiplayer.spectatorWatchingState'
        : 'multiplayer.spectatorWaitingState');
    } else if (player.ready) {
      state.textContent = t('multiplayer.calibratedState');
    } else if (player.id === currentPlayerId && pendingPreparationMapId) {
      state.textContent = t('multiplayer.calibratingState');
    } else {
      state.textContent = t('multiplayer.waitingCalibrationState');
    }
    const resources = document.createElement('span');
    resources.className = 'mp-player-resources';
    for (const resource of player.role === 'spectator' ? [] : ['map', 'audio', 'tracking'] as const) {
      const ready = player.readiness[resource];
      const badge = document.createElement('span');
      badge.className = `mp-resource-badge${ready ? ' is-ready' : ''}`;
      badge.dataset['resource'] = resource;
      badge.textContent = t(`multiplayer.resource${resource[0]!.toUpperCase()}${resource.slice(1)}`);
      badge.title = t(ready ? 'multiplayer.resourceReady' : 'multiplayer.resourceWaiting');
      resources.append(badge);
    }
    row.append(identity, resources, state);
    if (onKickPlayer && player.role !== 'host' && player.id !== currentPlayerId) {
      const kickButton = document.createElement('button');
      kickButton.type = 'button';
      kickButton.className = 'mp-player-kick';
      kickButton.title = t('multiplayer.kickPlayerAria', { name: player.name });
      kickButton.setAttribute('aria-label', kickButton.title);
      const icon = document.createElement('span');
      icon.className = 'material-symbols-rounded';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'person_remove';
      const label = document.createElement('span');
      label.textContent = t('multiplayer.kickPlayer');
      kickButton.append(icon, label);
      kickButton.addEventListener('click', () => {
        if (kickButton.dataset['confirm'] === 'true') {
          kickButton.disabled = true;
          onKickPlayer(player.id);
          return;
        }
        kickButton.dataset['confirm'] = 'true';
        kickButton.classList.add('is-confirming');
        label.textContent = t('multiplayer.confirmKick');
        window.setTimeout(() => {
          kickButton.dataset['confirm'] = 'false';
          kickButton.classList.remove('is-confirming');
          label.textContent = t('multiplayer.kickPlayer');
        }, 3_500);
      });
      row.append(kickButton);
    }
    container.append(row);
  }
}
