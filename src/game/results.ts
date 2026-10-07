import type { GameState } from '../core/state.ts';
import type { RoomPlayer, RoomSnapshot } from '../multiplayer/protocol.ts';
import { createAvatarBadge } from '../multiplayer/avatars.ts';
import { t } from '../i18n/index.ts';
import { currentRunLog, summarizeRun, type RunSummary } from '../core/run-analysis.ts';
import { PRACTICE_MAX_RATE, PRACTICE_PASS_ACCURACY, getLastPracticeRun } from '../core/practice.ts';

/** Render singleplayer results into the overlay body element. */
export function renderSingleplayerResults(
  goBody: HTMLElement,
  state: GameState,
  victory: boolean,
): void {
  const score = Math.max(0, Math.round(state.score));
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
  scoreValue.setAttribute('aria-label', String(score));
  scoreCard.append(scoreLabel, scoreValue);

  const stats = document.createElement('div');
  stats.className = 'go-stats-grid';
  addStat(stats, t('gameover.accuracy'), accuracy + '%', 'go-stat--accent');
  addStat(stats, t('gameover.bestCombo'), '\u00d7' + combo);
  addStat(stats, t('gameover.hits'), String(hits));
  addStat(stats, t('gameover.misses'), String(misses));
  addStat(stats, t('gameover.perfects'), String(Math.max(0, Math.round(state.perfectHits))));

  goBody.append(mapTitle, summary, scoreCard, stats);
  const analysis = renderRunAnalysis(summarizeRun(currentRunLog));
  if (analysis) goBody.append(analysis);
  const practiceNote = renderPracticeNote();
  if (practiceNote) goBody.append(practiceNote);
  animateScoreValue(scoreValue, score);
}

/** One line on how the practice tempo moves on; null outside practice runs. */
function renderPracticeNote(): HTMLElement | null {
  const run = getLastPracticeRun();
  if (!run) return null;
  const note = document.createElement('p');
  note.className = 'go-summary go-practice-note';
  const percent = (rate: number): number => Math.round(rate * 100);
  if (run.passed) {
    note.textContent = t('gameover.practice.passed', { next: percent(run.nextRate) });
  } else if (run.rate >= PRACTICE_MAX_RATE) {
    note.textContent = t('gameover.practice.max', { rate: percent(run.rate) });
  } else {
    note.textContent = t('gameover.practice.retry', { rate: percent(run.rate), accuracy: PRACTICE_PASS_ACCURACY });
  }
  return note;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(Math.round(totalSeconds % 60)).padStart(2, '0')}`;
}

/** Explains how the run went (timing bias, weaker hand, trouble spot); null when there is too little data. */
function renderRunAnalysis(summary: RunSummary | null): HTMLElement | null {
  if (!summary) return null;

  const section = document.createElement('section');
  section.className = 'go-analysis';
  const heading = document.createElement('span');
  heading.className = 'go-label go-analysis-title';
  heading.textContent = t('gameover.analysis.title');
  const grid = document.createElement('div');
  grid.className = 'go-stats-grid go-analysis-grid';

  const timing = summary.meanDeltaMs === 0 || Math.abs(summary.meanDeltaMs) <= 10
    ? t('gameover.analysis.onBeat')
    : t(summary.meanDeltaMs > 0 ? 'gameover.analysis.late' : 'gameover.analysis.early', { ms: Math.abs(summary.meanDeltaMs) });
  addStat(grid, t('gameover.analysis.timing'), timing);
  addStat(grid, t('gameover.analysis.earlyLate'), `${summary.earlyPercent}% / ${summary.latePercent}%`);

  const side = (value: number | null): string => (value === null ? '\u2014' : `${value}%`);
  addStat(grid, t('gameover.analysis.hands'), `${side(summary.left.accuracy)} / ${side(summary.right.accuracy)}`);

  if (summary.worstSegment) {
    const { startSec, endSec, misses } = summary.worstSegment;
    addStat(grid, t('gameover.analysis.weakSegment'), `${formatClock(startSec)}\u2013${formatClock(endSec)} (${misses})`);
  }

  section.append(heading, grid);
  return section;
}

function animateScoreValue(element: HTMLElement, target: number): void {
  const format = (value: number) => String(value).padStart(6, '0');
  if (target === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = format(target);
    return;
  }
  const durationMs = 700;
  const startedAt = performance.now();
  const frame = (now: number) => {
    // rAF timestamps can precede the performance.now() captured above, giving a negative first frame.
    const progress = Math.max(0, Math.min(1, (now - startedAt) / durationMs));
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = format(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
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
