import type { GameState } from '../core/state.ts';
import type { RoomPlayer, RoomSnapshot } from '../multiplayer/protocol.ts';
import { createAvatarBadge } from '../multiplayer/avatars.ts';
import { t } from '../i18n/index.ts';

/** Render singleplayer results into the overlay body element. */
export function renderSingleplayerResults(
  goBody: HTMLElement,
  state: GameState,
  victory: boolean,
): void {
  const scoreStr = String(Math.max(0, Math.round(state.score))).padStart(6, '0');
  const combo = Math.max(0, Math.round(state.maxCombo));
  const hits = Math.max(0, Math.round(state.hits));
  const misses = Math.max(0, Math.round(state.misses));
  const attempts = hits + misses;
  const accuracy = attempts > 0 ? Math.round((hits / attempts) * 100) : 0;

  goBody.replaceChildren();

  const mapTitle = document.createElement('div');
  mapTitle.className = 'go-map-title';
  mapTitle.textContent = state.map?.meta?.title ?? t('game.unknownTrack');

  const summary = document.createElement('p');
  summary.className = 'go-summary';
  summary.textContent = t(victory ? 'gameover.victorySummary' : 'gameover.defeatSummary');

  const scoreCard = document.createElement('div');
  scoreCard.className = 'go-score-card';
  const scoreLabel = document.createElement('span');
  scoreLabel.className = 'go-label';
  scoreLabel.textContent = t('gameover.score');
  const scoreValue = document.createElement('span');
  scoreValue.className = 'go-value score-highlight';
  scoreValue.textContent = scoreStr;
  scoreCard.append(scoreLabel, scoreValue);

  const stats = document.createElement('div');
  stats.className = 'go-stats-grid';
  addStat(stats, t('gameover.accuracy'), accuracy + '%', 'go-stat--accent');
  addStat(stats, t('gameover.bestCombo'), '\u00d7' + combo);
  addStat(stats, t('gameover.hits'), String(hits));
  addStat(stats, t('gameover.misses'), String(misses));
  addStat(stats, t('gameover.perfects'), String(Math.max(0, Math.round(state.perfectHits))));

  goBody.append(mapTitle, summary, scoreCard, stats);
}

function addStat(container: HTMLElement, label: string, value: string, className = ''): void {
  const card = document.createElement('div');
  card.className = 'go-stat' + (className ? ' ' + className : '');
  const statLabel = document.createElement('span');
  statLabel.className = 'go-label';
  statLabel.textContent = label;
  const statValue = document.createElement('strong');
  statValue.className = 'go-stat-value';
  statValue.textContent = value;
  card.append(statLabel, statValue);
  container.append(card);
}

/** Render multiplayer round results into the overlay body element. */
export function renderMultiplayerResults(
  goBody: HTMLElement,
  snapshot: RoomSnapshot,
  localPlayerId: string,
): void {
  const playingPlayers = snapshot.players.filter(p => p.playing);
  const sorted = [...playingPlayers].sort(
    (a, b) => b.score - a.score || b.combo - a.combo || b.progress - a.progress,
  );

  goBody.replaceChildren();

  const mapTitle = document.createElement('div');
  mapTitle.className = 'go-map-title';
  mapTitle.textContent = t('multiplayer.resultsTitle');
  goBody.append(mapTitle);

  if (snapshot.mode === 'coop') {
    renderCoopResults(goBody, sorted, localPlayerId);
  } else {
    renderScoreAttackResults(goBody, sorted, localPlayerId);
  }
}

function renderCoopResults(
  container: HTMLElement,
  players: RoomPlayer[],
  localPlayerId: string,
): void {
  const teamScore = players.reduce((sum, p) => sum + p.score, 0);
  const allFinished = players.length > 0 && players.every(p => p.finished);
  const anyDisconnected = players.length < 2;

  const teamCard = document.createElement('div');
  teamCard.className = 'go-score-card go-mp-team-card';
  const teamLabel = document.createElement('span');
  teamLabel.className = 'go-label';
  teamLabel.textContent = t('multiplayer.teamScore');
  const teamValue = document.createElement('span');
  teamValue.className = 'go-value score-highlight';
  teamValue.textContent = teamScore.toLocaleString();
  teamCard.append(teamLabel, teamValue);
  container.append(teamCard);

  const status = document.createElement('p');
  status.className = 'go-summary';
  status.textContent = allFinished
    ? t('multiplayer.coopVictory')
    : anyDisconnected
      ? t('multiplayer.coopIncomplete')
      : t('multiplayer.coopPartialFinish');
  container.append(status);

  const playerGrid = document.createElement('div');
  playerGrid.className = 'go-mp-player-grid';
  for (const player of players) {
    const card = document.createElement('div');
    card.className = 'go-mp-player-card' + (player.id === localPlayerId ? ' is-local' : '');
    const header = document.createElement('div');
    header.className = 'go-mp-player-header';
    header.append(createAvatarBadge(player.avatar, 22));
    const name = document.createElement('span');
    name.className = 'go-mp-player-name';
    name.textContent = player.name;
    header.append(name);
    const saberTag = document.createElement('span');
    saberTag.className = 'go-mp-saber-tag';
    saberTag.textContent = t('multiplayer.' + player.saber + 'Saber');
    header.append(saberTag);
    const scoreEl = document.createElement('strong');
    scoreEl.className = 'go-mp-player-score';
    scoreEl.textContent = player.score.toLocaleString();
    card.append(header, scoreEl);
    playerGrid.append(card);
  }
  container.append(playerGrid);
}

function renderScoreAttackResults(
  container: HTMLElement,
  players: RoomPlayer[],
  localPlayerId: string,
): void {
  const ranking = document.createElement('div');
  ranking.className = 'go-mp-ranking';

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const position = i + 1;
    // Deterministic tie-breaking: same score = same position
    let displayPosition = position;
    if (i > 0 && players[i - 1]!.score === player.score) {
      const lastChild = ranking.lastElementChild as HTMLElement | null;
      displayPosition = Number(lastChild?.dataset['position'] ?? position);
    }

    const row = document.createElement('div');
    row.className = 'go-mp-rank-row' + (player.id === localPlayerId ? ' is-local' : '');
    row.dataset['position'] = String(displayPosition);

    const posEl = document.createElement('span');
    posEl.className = 'go-mp-position';
    posEl.textContent = String(displayPosition);
    if (displayPosition === 1) posEl.classList.add('is-gold');
    else if (displayPosition === 2) posEl.classList.add('is-silver');
    else if (displayPosition === 3) posEl.classList.add('is-bronze');
    row.append(posEl);

    const identity = document.createElement('div');
    identity.className = 'go-mp-identity';
    identity.append(createAvatarBadge(player.avatar, 20));
    const name = document.createElement('span');
    name.className = 'go-mp-player-name';
    name.textContent = player.name;
    identity.append(name);
    if (!player.finished) {
      const dnf = document.createElement('span');
      dnf.className = 'go-mp-dnf';
      dnf.textContent = t('multiplayer.dnf');
      identity.append(dnf);
    }
    row.append(identity);

    const scoreEl = document.createElement('strong');
    scoreEl.className = 'go-mp-player-score';
    scoreEl.textContent = player.score.toLocaleString();
    row.append(scoreEl);

    const progressEl = document.createElement('span');
    progressEl.className = 'go-mp-progress';
    progressEl.textContent = Math.round(player.progress * 100) + '%';
    row.append(progressEl);

    ranking.append(row);
  }

  container.append(ranking);
}
