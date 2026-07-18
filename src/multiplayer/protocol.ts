export const PROTOCOL_VERSION = 1;

export interface CreateRoomResponse {
  room: { code: string };
  hostToken: string;
  joinUrl: string;
  qrDataUrl: string;
}

export interface JoinCodeResponse {
  code: string;
  joinToken: string;
}

export interface ServerMessage {
  v?: unknown;
  type?: unknown;
  code?: unknown;
  playerId?: unknown;
  role?: unknown;
  room?: unknown;
  player?: unknown;
  message?: unknown;
  sentAt?: unknown;
  serverTime?: unknown;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
}

export interface RoomPlayer {
  id: string;
  streamId: number;
  name: string;
  role: 'host' | 'guest';
  saber: 'left' | 'right' | 'both';
  ready: boolean;
  score: number;
  combo: number;
  lives: number;
  progress: number;
  finished: boolean;
  playing: boolean;
}

export interface RoomSnapshot {
  code: string;
  revision: number;
  mapId: string | null;
  mode: 'coop' | 'score-attack';
  rules: { trainingMode: boolean; noFail: boolean };
  maxPlayers: number;
  round: { id: number; mapId: string; startAt: number; finishedAt: number | null } | null;
  players: RoomPlayer[];
}

export function parseRoomPlayer(value: unknown): RoomPlayer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const player = value as Record<string, unknown>;
  if (
    typeof player['id'] !== 'string'
    || player['id'].length > 64
    || !Number.isSafeInteger(player['streamId'])
    || Number(player['streamId']) < 1
    || Number(player['streamId']) > 0xffff_ffff
    || typeof player['name'] !== 'string'
    || player['name'].length > 32
    || (player['role'] !== 'host' && player['role'] !== 'guest')
    || (player['saber'] !== 'left' && player['saber'] !== 'right' && player['saber'] !== 'both')
    || typeof player['ready'] !== 'boolean'
    || !Number.isSafeInteger(player['score'])
    || Number(player['score']) < 0
    || Number(player['score']) > 1_000_000_000
    || !Number.isSafeInteger(player['combo'])
    || Number(player['combo']) < 0
    || Number(player['combo']) > 1_000_000
    || !Number.isSafeInteger(player['lives'])
    || Number(player['lives']) < 0
    || Number(player['lives']) > 100
    || typeof player['progress'] !== 'number'
    || !Number.isFinite(player['progress'])
    || player['progress'] < 0
    || player['progress'] > 1
    || typeof player['finished'] !== 'boolean'
    || typeof player['playing'] !== 'boolean'
  ) return null;
  return {
    id: player['id'],
    streamId: player['streamId'] as number,
    name: player['name'],
    role: player['role'],
    saber: player['saber'],
    ready: player['ready'],
    score: player['score'] as number,
    combo: player['combo'] as number,
    lives: player['lives'] as number,
    progress: player['progress'],
    finished: player['finished'],
    playing: player['playing'],
  };
}

export function parseChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (
    typeof message['playerId'] !== 'string'
    || message['playerId'].length > 64
    || typeof message['playerName'] !== 'string'
    || message['playerName'].length > 32
    || typeof message['text'] !== 'string'
    || message['text'].length < 1
    || message['text'].length > 240
    || typeof message['sentAt'] !== 'number'
    || !Number.isFinite(message['sentAt'])
    || message['sentAt'] < 0
    || message['sentAt'] > 8_640_000_000_000_000
  ) return null;
  return {
    playerId: message['playerId'],
    playerName: message['playerName'],
    text: message['text'],
    sentAt: message['sentAt'],
  };
}

export function parseRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const rulesValue = candidate['rules'];
  if (
    typeof candidate['code'] !== 'string'
    || !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(candidate['code'])
    || !Number.isSafeInteger(candidate['revision'])
    || Number(candidate['revision']) < 0
    || !Array.isArray(candidate['players'])
    || (candidate['mode'] !== 'coop' && candidate['mode'] !== 'score-attack')
    || !Number.isSafeInteger(candidate['maxPlayers'])
    || (candidate['mode'] === 'coop' && candidate['maxPlayers'] !== 2)
    || (candidate['mode'] === 'score-attack' && candidate['maxPlayers'] !== 8)
    || candidate['players'].length > Number(candidate['maxPlayers'])
    || (candidate['mapId'] !== null && typeof candidate['mapId'] !== 'string')
    || (typeof candidate['mapId'] === 'string' && !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(candidate['mapId']))
    || !rulesValue
    || typeof rulesValue !== 'object'
    || Array.isArray(rulesValue)
  ) return null;
  const candidateRules = rulesValue as Record<string, unknown>;
  if (typeof candidateRules['trainingMode'] !== 'boolean' || typeof candidateRules['noFail'] !== 'boolean') {
    return null;
  }
  const roundValue = candidate['round'];
  let round: RoomSnapshot['round'] = null;
  if (roundValue !== null) {
    if (!roundValue || typeof roundValue !== 'object' || Array.isArray(roundValue)) return null;
    const candidateRound = roundValue as Record<string, unknown>;
    if (
      !Number.isSafeInteger(candidateRound['id'])
      || Number(candidateRound['id']) < 1
      || typeof candidateRound['mapId'] !== 'string'
      || !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(candidateRound['mapId'])
      || typeof candidateRound['startAt'] !== 'number'
      || !Number.isFinite(candidateRound['startAt'])
      || candidateRound['startAt'] < 0
      || (candidateRound['finishedAt'] !== null
        && (typeof candidateRound['finishedAt'] !== 'number'
          || !Number.isFinite(candidateRound['finishedAt'])
          || candidateRound['finishedAt'] < candidateRound['startAt']))
    ) return null;
    round = {
      id: candidateRound['id'] as number,
      mapId: candidateRound['mapId'],
      startAt: candidateRound['startAt'],
      finishedAt: candidateRound['finishedAt'] as number | null,
    };
  }

  const players: RoomPlayer[] = [];
  for (const valuePlayer of candidate['players']) {
    const player = parseRoomPlayer(valuePlayer);
    if (!player) return null;
    if (
      (candidate['mode'] === 'score-attack' && player.saber !== 'both')
      || (candidate['mode'] === 'coop' && player.saber !== (player.role === 'host' ? 'left' : 'right'))
    ) return null;
    players.push(player);
  }
  return {
    code: candidate['code'],
    revision: candidate['revision'] as number,
    mapId: candidate['mapId'] as string | null,
    mode: candidate['mode'],
    rules: {
      trainingMode: candidateRules['trainingMode'],
      noFail: candidateRules['noFail'],
    },
    maxPlayers: candidate['maxPlayers'] as number,
    round,
    players,
  };
}
