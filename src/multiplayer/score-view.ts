import { t } from '../i18n/index.ts';
import type { RoomSnapshot } from './protocol.ts';

function renderScoresInto(container: HTMLElement, snapshot: RoomSnapshot): void {
  const players = snapshot.players.filter(player => player.playing);
  container.replaceChildren();
  container.hidden = !snapshot.round || players.length === 0;
  if (container.hidden) return;

  const sorted = [...players].sort((left, right) => right.score - left.score || right.combo - left.combo);
  if (snapshot.mode === 'coop') {
    const team = document.createElement('div');
    team.className = 'mp-score-row is-team';
    const label = document.createElement('span');
    label.textContent = t('multiplayer.teamScore');
    const value = document.createElement('strong');
    value.textContent = sorted.reduce((total, player) => total + player.score, 0).toLocaleString();
    team.append(label, value);
    container.append(team);
  }

  for (const player of sorted) {
    const row = document.createElement('div');
    row.className = 'mp-score-row';
    const name = document.createElement('span');
    name.textContent = player.name;
    name.style.color = player.color;
    const value = document.createElement('strong');
    value.textContent = player.score.toLocaleString();
    row.append(name, value);
    container.append(row);
  }
}

export function renderMultiplayerScores(
  containers: readonly HTMLElement[],
  snapshot: RoomSnapshot,
): void {
  for (const container of containers) renderScoresInto(container, snapshot);
}
