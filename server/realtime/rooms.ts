import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 30 * 60 * 1000;
const MAX_PLAYERS = 8;

export interface RoomPlayer {
  id: string;
  streamId: number;
  name: string;
  role: 'host' | 'guest';
  ready: boolean;
}

export interface RoomSnapshot {
  code: string;
  createdAt: string;
  expiresAt: string;
  revision: number;
  mapId: string | null;
  players: RoomPlayer[];
}

interface RoomRecord extends RoomSnapshot {
  hostToken: string;
  joinToken: string;
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
      players: room.players.map(player => ({ ...player })),
    };
  }

  join(code: string, token: string, requestedName: string): { player: RoomPlayer; snapshot: RoomSnapshot } {
    this.deleteExpired();
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) throw new Error('Pokój nie istnieje lub wygasł.');
    const role = tokensMatch(token, room.hostToken)
      ? 'host'
      : tokensMatch(token, room.joinToken) ? 'guest' : null;
    if (!role) throw new Error('Nieprawidłowy token pokoju.');
    if (room.players.length >= MAX_PLAYERS) throw new Error('Pokój jest pełny.');
    if (role === 'host' && room.players.some(player => player.role === 'host')) {
      throw new Error('Host jest już połączony.');
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
    room.revision++;
    return this.snapshot(room);
  }

  setReady(code: string, playerId: string, ready: boolean): RoomSnapshot {
    const room = this.requireRoom(code);
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player) throw new Error('Gracz nie należy do pokoju.');
    player.ready = ready;
    room.revision++;
    return this.snapshot(room);
  }

  setMap(code: string, playerId: string, mapId: string): RoomSnapshot {
    const room = this.requireRoom(code);
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player || player.role !== 'host') throw new Error('Tylko host może wybrać mapę.');
    const normalizedMapId = mapId.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(normalizedMapId)) throw new Error('Nieprawidłowa mapa.');
    room.mapId = normalizedMapId;
    for (const roomPlayer of room.players) roomPlayer.ready = false;
    room.revision++;
    return this.snapshot(room);
  }

  getPlayerStreamId(code: string, playerId: string): number | null {
    const room = this.rooms.get(normalizeRoomCode(code));
    return room?.players.find(player => player.id === playerId)?.streamId ?? null;
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
    if (!room) throw new Error('Pokój nie istnieje lub wygasł.');
    return room;
  }

  private snapshot(room: RoomRecord): RoomSnapshot {
    return {
      code: room.code,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      revision: room.revision,
      mapId: room.mapId,
      players: room.players.map(player => ({ ...player })),
    };
  }
}
