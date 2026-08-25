import { appendLocalScore } from '../core/localstore.ts';
import { state } from '../core/state.ts';
import { t } from '../i18n/index.ts';

export interface ScoreSubmissionOptions {
  playerName: string;
  progress?: number | undefined;
  trainingMode: boolean;
}

export async function submitScore({
  playerName,
  progress,
  trainingMode,
}: ScoreSubmissionOptions): Promise<void> {
  if (trainingMode) return;

  const payload = {
    mapId: state.map?.id ?? 'random',
    player: playerName || t('player.defaultName'),
    score: state.score,
    combo: state.maxCombo,
    date: new Date().toISOString(),
    ...(progress !== undefined ? { progress } : {}),
  };

  try {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Score submit failed: ${response.status}`);
  } catch {
    appendLocalScore(payload);
  }
}
