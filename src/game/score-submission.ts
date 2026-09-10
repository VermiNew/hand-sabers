import { appendLocalScore } from '../core/localstore.ts';
import { state } from '../core/state.ts';
import { t } from '../i18n/index.ts';

export interface ScoreSubmissionOptions {
  playerName: string;
  progress?: number | undefined;
  trainingMode: boolean;
}

let pendingScoreSession: Promise<string | null> | null = null;

export function beginScoreSubmissionSession(mapId: string | undefined, trainingMode: boolean, localOnly = false): void {
  if (trainingMode || localOnly || !mapId || mapId === 'random') {
    pendingScoreSession = null;
    return;
  }
  pendingScoreSession = fetch('/api/score-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId }),
  }).then(async response => {
    if (!response.ok) return null;
    const payload = await response.json() as { token?: unknown; mapId?: unknown };
    return payload.mapId === mapId
      && typeof payload.token === 'string'
      && /^[A-Za-z0-9_-]{32}$/.test(payload.token)
      ? payload.token
      : null;
  }).catch(() => null);
}

export async function submitScore({
  playerName,
  progress,
  trainingMode,
}: ScoreSubmissionOptions): Promise<void> {
  if (trainingMode) return;

  const scoreSession = pendingScoreSession;
  pendingScoreSession = null;

  const payload = {
    mapId: state.map?.id ?? 'random',
    player: playerName || t('player.defaultName'),
    score: state.score,
    combo: state.maxCombo,
    date: new Date().toISOString(),
    ...(progress !== undefined ? { progress } : {}),
  };

  try {
    const sessionToken = await scoreSession;
    if (!sessionToken) throw new Error('Score session unavailable');
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sessionToken }),
    });
    if (!response.ok) throw new Error(`Score submit failed: ${response.status}`);
  } catch {
    appendLocalScore(payload);
  }
}
