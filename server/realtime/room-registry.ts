import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 30 * 60 * 1000;
const SCORE_ATTACK_MAX_PLAYERS = 8;
const COOP_MAX_PLAYERS = 2;

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'INVALID_ROOM_TOKEN'
  | 'ROOM_FULL'
  | 'HOST_ALREADY_CONNECTED'
  | 'PLAYER_NOT_FOUND'
  | 'MAP_REQUIRED'
  | 'PLAYERS_NOT_READY'
  | 'ROUND_ALREADY_STARTED'
  | 'ROUND_REQUIRED'
  | 'HOST_ONLY'
  | 'INVALID_MAP'
  | 'INVALID_MODE'
  | 'INVALID_SCORE';

export class RoomError extends Error {
  readonly code: RoomErrorCode;

  constructor(code: RoomErrorCode) {
    super(code);
    this.name = 'RoomError';
    this.code = code;
  }
}

export interface RoomPlayer {
  id: string;
  streamId: number;
  name: string;
  role: 'host' | 'guest';
  ready: boolean;
  score: number;
  combo: number;
  lives: number;
  progress: number;
  finished: boolean;
  playing: boolean;
}

export type RoomMode = 'coop' | 'score-attack';

export interface RoomSnapshot {
  code: string;
  createdAt: string;
  expiresAt: string;
  revision: number;
  mapId: string | null;
  mode: RoomMode;
  maxPlayers: number;
  round: RoomRound | null;
  players: RoomPlayer[];
}

export interface RoomRound {
  id: number;
  mapId: string;
  startAt: number;
  finishedAt: number | null;
}

interface RoomRecord extends RoomSnapshot {
  hostToken: string;
  joinToken: string;
  nextRoundId: number;
}

export interface CreatedRoom extends RoomSnapshot {
  hostToken: string;
  joinToken: string;
}

function createToken(): string {
  return randomBytes(16).toString('base64url');
}

function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createRoomCode(): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  }
  return code;
}

function normalizeRoomCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(normalized) ? normalized : '';
}

function sanitizePlayerName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
}

function getMaxPlayers(mode: RoomMode): number {
  return mode === 'coop' ? COOP_MAX_PLAYERS : SCORE_ATTACK_MAX_PLAYERS;
}

export class RoomRegistry {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.deleteExpired(), 60_000);
    this.cleanupTimer.unref();
  }

  create(): CreatedRoom {
    this.deleteExpired();
    let code = createRoomCode();
    while (this.rooms.has(code)) code = createRoomCode();

    const createdAt = new Date();
    const room: RoomRecord = {
      code,
      hostToken: createToken(),
      joinToken: createToken(),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + ROOM_TTL_MS).toISOString(),
      revision: 0,
      mapId: null,
      mode: 'score-attack',
      maxPlayers: SCORE_ATTACK_MAX_PLAYERS,
      round: null,
      nextRoundId: 1,
      players: [],
    };
    this.rooms.set(code, room);
    return { ...room };
  }

  get(code: string): RoomSnapshot | null {
    this.deleteExpired();
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) return null;
    return {
      code: room.code,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      revision: room.revision,
      mapId: room.mapId,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      round: room.round ? { ...room.round } : null,
      players: room.players.map(player => ({ ...player })),
    };
  }

  join(code: string, token: string, requestedName: string): { player: RoomPlayer; snapshot: RoomSnapshot } {
    this.deleteExpired();
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) throw new RoomError('ROOM_NOT_FOUND');
    const role = tokensMatch(token, room.hostToken)
      ? 'host'
      : tokensMatch(token, room.joinToken) ? 'guest' : null;
    if (!role) throw new RoomError('INVALID_ROOM_TOKEN');
    if (room.players.length >= room.maxPlayers) throw new RoomError('ROOM_FULL');
    if (role === 'host' && room.players.some(player => player.role === 'host')) {
      throw new RoomError('HOST_ALREADY_CONNECTED');
    }

    const defaultName = role === 'host' ? 'Host' : `Gracz ${room.players.length + 1}`;
    const name = sanitizePlayerName(requestedName) || defaultName;
    let streamId = randomInt(1, 0x1_0000_0000);
    while (room.players.some(player => player.streamId === streamId)) {
      streamId = randomInt(1, 0x1_0000_0000);
    }
    const player: RoomPlayer = {
      id: createToken(),
      streamId,
      name,
      role,
      ready: false,
      score: 0,
      combo: 0,
      lives: 10,
      progress: 0,
      finished: false,
      playing: false,
    };
    room.players.push(player);
    room.revision++;
    return { player: { ...player }, snapshot: this.snapshot(room) };
  }

  leave(code: string, playerId: string): RoomSnapshot | null {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) return null;
    const index = room.players.findIndex(player => player.id === playerId);
    if (index < 0) return this.snapshot(room);
    room.players.splice(index, 1);
    if (
      room.round?.finishedAt === null
      && room.players.some(player => player.playing)
      && room.players.every(player => !player.playing || player.finished)
    ) {
      room.round.finishedAt = Date.now();
    }
    room.revision++;
    return this.snapshot(room);
  }

  setReady(code: string, playerId: string, ready: boolean): RoomSnapshot {
    const room = this.requireRoom(code);
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player) throw new RoomError('PLAYER_NOT_FOUND');
    if (ready && !room.mapId) throw new RoomError('MAP_REQUIRED');
    player.ready = ready;
    room.revision++;
    return this.snapshot(room);
  }

  setMap(code: string, playerId: string, mapId: string): RoomSnapshot {
    const room = this.requireRoom(code);
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player || player.role !== 'host') throw new RoomError('HOST_ONLY');
    const normalizedMapId = mapId.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(normalizedMapId)) throw new RoomError('INVALID_MAP');
    room.mapId = normalizedMapId;
    room.round = null;
    for (const roomPlayer of room.players) roomPlayer.ready = false;
    room.revision++;
    return this.snapshot(room);
  }

  setMode(code: string, playerId: string, mode: string): RoomSnapshot {
    const room = this.requireRoom(code);
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player || player.role !== 'host') throw new RoomError('HOST_ONLY');
    if (mode !== 'coop' && mode !== 'score-attack') throw new RoomError('INVALID_MODE');
    const maxPlayers = getMaxPlayers(mode);
    if (room.players.length > maxPlayers) throw new RoomError('ROOM_FULL');
    room.mode = mode;
    room.maxPlayers = maxPlayers;
    room.round = null;
    for (const roomPlayer of room.players) roomPlayer.ready = false;
    room.revision++;
    return this.snapshot(room);
  }

  getPlayerStreamId(code: string, playerId: string): number | null {
    const room = this.rooms.get(normalizeRoomCode(code));
    return room?.players.find(player => player.id === playerId)?.streamId ?? null;
  }

  startRound(code: string, playerId: string, now = Date.now()): RoomSnapshot {
    const room = this.requireRoom(code);
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player || player.role !== 'host') throw new RoomError('HOST_ONLY');
    if (!room.mapId) throw new RoomError('MAP_REQUIRED');
    if (!room.players.length || room.players.some(candidate => !candidate.ready)) {
      throw new RoomError('PLAYERS_NOT_READY');
    }
    if (room.round && room.round.finishedAt === null) {
      throw new RoomError('ROUND_ALREADY_STARTED');
    }
    room.round = {
      id: room.nextRoundId++,
      mapId: room.mapId,
      startAt: now + 3_000,
      finishedAt: null,
    };
    for (const roomPlayer of room.players) {
      roomPlayer.score = 0;
      roomPlayer.combo = 0;
      roomPlayer.lives = 10;
      roomPlayer.progress = 0;
      roomPlayer.finished = false;
      roomPlayer.playing = true;
    }
    room.revision++;
    return this.snapshot(room);
  }

  updateScore(
    code: string,
    playerId: string,
    payload: { score: number; combo: number; lives: number; progress: number; finished: boolean },
    now = Date.now(),
  ): { player: RoomPlayer; completedSnapshot: RoomSnapshot | null } {
    const room = this.requireRoom(code);
    if (!room.round || room.round.finishedAt !== null) throw new RoomError('ROUND_REQUIRED');
    if (now + 250 < room.round.startAt) throw new RoomError('ROUND_REQUIRED');
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player) throw new RoomError('PLAYER_NOT_FOUND');
    if (!player.playing) throw new RoomError('ROUND_REQUIRED');
    const valid = Number.isSafeInteger(payload.score)
      && payload.score >= player.score
      && payload.score <= 1_000_000_000
      && Number.isSafeInteger(payload.combo)
      && payload.combo >= 0
      && payload.combo <= 1_000_000
      && Number.isSafeInteger(payload.lives)
      && payload.lives >= 0
      && payload.lives <= 100
      && Number.isFinite(payload.progress)
      && payload.progress >= player.progress
      && payload.progress <= 1;
    if (!valid) throw new RoomError('INVALID_SCORE');
    player.score = payload.score;
    player.combo = payload.combo;
    player.lives = payload.lives;
    player.progress = payload.progress;
    player.finished ||= payload.finished;

    let completedSnapshot: RoomSnapshot | null = null;
    if (room.players.some(candidate => candidate.playing)
      && room.players.every(candidate => !candidate.playing || candidate.finished)) {
      room.round.finishedAt = Math.max(now, room.round.startAt);
      room.revision++;
      completedSnapshot = this.snapshot(room);
    }
    return { player: { ...player }, completedSnapshot };
  }

  getGuestToken(code: string): string | null {
    this.deleteExpired();
    return this.rooms.get(normalizeRoomCode(code))?.joinToken ?? null;
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.rooms.clear();
  }

  private deleteExpired(now = Date.now()): void {
    for (const [code, room] of this.rooms) {
      if (Date.parse(room.expiresAt) <= now) this.rooms.delete(code);
    }
  }

  private requireRoom(code: string): RoomRecord {
    this.deleteExpired();
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) throw new RoomError('ROOM_NOT_FOUND');
    return room;
  }

  private snapshot(room: RoomRecord): RoomSnapshot {
    return {
      code: room.code,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      revision: room.revision,
      mapId: room.mapId,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      round: room.round ? { ...room.round } : null,
      players: room.players.map(player => ({ ...player })),
    };
  }
}
