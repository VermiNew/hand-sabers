import { randomBytes, randomInt } from 'node:crypto';

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 30 * 60 * 1000;

export interface RoomSnapshot {
  code: string;
  createdAt: string;
  expiresAt: string;
  players: number;
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

function createRoomCode(): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  }
  return code;
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
      players: 0,
    };
    this.rooms.set(code, room);
    return { ...room };
  }

  get(code: string): RoomSnapshot | null {
    this.deleteExpired();
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return null;
    return {
      code: room.code,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      players: room.players,
    };
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
}
