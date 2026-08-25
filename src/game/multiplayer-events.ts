import { S, state } from '../core/state.ts';
import { showMultiplayerResults } from '../ui/ui.ts';
import { getCurrentPlayerId } from '../multiplayer/client.ts';
import { parseRoomSnapshot } from '../multiplayer/protocol.ts';

export interface MultiplayerRules {
  trainingMode: boolean;
  noFail: boolean;
}

export interface MultiplayerRoundStart {
  mapId: string;
  mode: 'coop' | 'score-attack';
  rules: MultiplayerRules;
  saber: 'left' | 'right' | 'both';
  startAtPerformance: number;
}

interface MultiplayerEventsOptions {
  onPrepare(mapId: string): void;
  onStart(detail: MultiplayerRoundStart): void;
}

export function initMultiplayerEvents({ onPrepare, onStart }: MultiplayerEventsOptions): void {
  window.addEventListener('hand-sabers:multiplayer-prepare', event => {
    const mapId = (event as CustomEvent<{ mapId?: unknown }>).detail?.mapId;
    if (typeof mapId === 'string') onPrepare(mapId);
  });

  window.addEventListener('hand-sabers:multiplayer-start', event => {
    const detail = (event as CustomEvent<{
      mapId?: unknown;
      mode?: unknown;
      rules?: unknown;
      saber?: unknown;
      startAtPerformance?: unknown;
    }>).detail;
    const rules = detail?.rules;
    if (
      typeof detail?.mapId === 'string'
      && (detail.mode === 'coop' || detail.mode === 'score-attack')
      && (detail.saber === 'left' || detail.saber === 'right' || detail.saber === 'both')
      && ((detail.mode === 'coop' && detail.saber !== 'both')
        || (detail.mode === 'score-attack' && detail.saber === 'both'))
      && rules
      && typeof rules === 'object'
      && !Array.isArray(rules)
      && typeof (rules as Record<string, unknown>)['trainingMode'] === 'boolean'
      && typeof (rules as Record<string, unknown>)['noFail'] === 'boolean'
      && typeof detail.startAtPerformance === 'number'
    ) {
      onStart({
        mapId: detail.mapId,
        mode: detail.mode,
        rules: rules as MultiplayerRules,
        saber: detail.saber,
        startAtPerformance: detail.startAtPerformance,
      });
    }
  });

  window.addEventListener('hand-sabers:multiplayer-results', event => {
    const snapshot = (event as CustomEvent<{ snapshot?: unknown }>).detail?.snapshot;
    if (!snapshot || typeof snapshot !== 'object' || state.appState !== S.GAMEOVER) return;
    const localPlayerId = getCurrentPlayerId();
    if (!localPlayerId) return;
    const value = snapshot as Record<string, unknown>;
    if (!Array.isArray(value['players']) || !value['round']) return;
    const parsed = parseRoomSnapshot(snapshot);
    if (parsed) showMultiplayerResults(parsed, localPlayerId);
  });
}
