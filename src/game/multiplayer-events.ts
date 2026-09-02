import { S, state } from '../core/state.ts';
import { showMultiplayerResults } from '../ui/ui.ts';
import { getCurrentPlayerId } from '../multiplayer/client.ts';
import { parseRoomSnapshot } from '../multiplayer/protocol.ts';
import { recordMultiplayerGame } from '../core/achievements.ts';
import type { GameMode } from '../types/index.js';

export interface MultiplayerRules {
  trainingMode: boolean;
  noFail: boolean;
  gameMode: GameMode;
  noteSpeed: 0.75 | 1 | 1.35 | 1.75;
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
      && ['normal', 'no-arrows', 'pro', 'speed-trials'].includes(String((rules as Record<string, unknown>)['gameMode']))
      && [0.75, 1, 1.35, 1.75].includes(Number((rules as Record<string, unknown>)['noteSpeed']))
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
    if (!parsed) return;
    const playingPlayers = parsed.players.filter(player => player.playing);
    const localPlayer = playingPlayers.find(player => player.id === localPlayerId);
    if (localPlayer) {
      const won = parsed.mode === 'coop'
        ? playingPlayers.length === 2 && playingPlayers.every(player => player.finished)
        : playingPlayers.length >= 2
          && localPlayer.finished
          && localPlayer.score === Math.max(...playingPlayers.map(player => player.score));
      recordMultiplayerGame(won, localPlayer.score, parsed.mode);
    }
    showMultiplayerResults(parsed, localPlayerId);
  });
}
