import type { RawData } from 'ws';

export const PROTOCOL_VERSION = 1;
const MAX_CHAT_LENGTH = 240;
const POSE_PACKET_BYTES = 96;
const LANDMARK_PACKET_BYTES = 528;

export interface ClientMessage {
  v?: unknown;
  type?: unknown;
  code?: unknown;
  token?: unknown;
  name?: unknown;
  avatar?: unknown;
  playerColor?: unknown;
  ready?: unknown;
  mapId?: unknown;
  mode?: unknown;
  trainingMode?: unknown;
  noFail?: unknown;
  gameMode?: unknown;
  noteSpeed?: unknown;
  score?: unknown;
  combo?: unknown;
  lives?: unknown;
  progress?: unknown;
  finished?: unknown;
  sentAt?: unknown;
  text?: unknown;
  targetPlayerId?: unknown;
  signal?: unknown;
}

export type VoiceSignal =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export function parseMessage(data: RawData): ClientMessage {
  const parsed = JSON.parse(data.toString()) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_MESSAGE');
  const message = parsed as ClientMessage;
  if (message.v !== PROTOCOL_VERSION) throw new Error('UNSUPPORTED_PROTOCOL');
  return message;
}

export function sanitizeChatText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_CHAT');
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > MAX_CHAT_LENGTH) throw new Error('INVALID_CHAT');
  return text;
}

export function parseVoiceSignal(value: unknown): VoiceSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_VOICE_SIGNAL');
  const signal = value as Record<string, unknown>;
  if (signal['type'] === 'offer' || signal['type'] === 'answer') {
    if (typeof signal['sdp'] !== 'string' || !signal['sdp'] || signal['sdp'].length > 50_000) {
      throw new Error('INVALID_VOICE_SIGNAL');
    }
    return { type: signal['type'], sdp: signal['sdp'] };
  }
  if (signal['type'] === 'ice') {
    const candidate = signal['candidate'];
    const sdpMid = signal['sdpMid'];
    const sdpMLineIndex = signal['sdpMLineIndex'];
    if (
      typeof candidate !== 'string'
      || !candidate
      || candidate.length > 2_048
      || (sdpMid !== null && (typeof sdpMid !== 'string' || sdpMid.length > 256))
      || (sdpMLineIndex !== null
        && (!Number.isSafeInteger(sdpMLineIndex) || Number(sdpMLineIndex) < 0 || Number(sdpMLineIndex) > 65_535))
    ) throw new Error('INVALID_VOICE_SIGNAL');
    return { type: 'ice', candidate, sdpMid, sdpMLineIndex: sdpMLineIndex as number | null };
  }
  throw new Error('INVALID_VOICE_SIGNAL');
}

export function validateRealtimePacket(packet: Buffer): 1 | 2 {
  if (packet.length < 16 || packet[0] !== PROTOCOL_VERSION) throw new Error('Nieprawidłowy pakiet realtime.');
  const kind = packet[1];
  if (kind !== 1 && kind !== 2) throw new Error('Nieznany typ pakietu realtime.');
  if ((kind === 1 && packet.length !== POSE_PACKET_BYTES) || (kind === 2 && packet.length !== LANDMARK_PACKET_BYTES)) {
    throw new Error('Nieprawidłowy rozmiar pakietu realtime.');
  }
  if ((packet[2] ?? 0) > 3 || packet[3] !== 0) throw new Error('Nieprawidłowe flagi pakietu realtime.');
  const timestamp = packet.readDoubleLE(8);
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('Nieprawidłowy czas pakietu realtime.');

  for (let offset = 16; offset < packet.length; offset += 4) {
    const value = packet.readFloatLE(offset);
    if (!Number.isFinite(value)) throw new Error('Pakiet realtime zawiera nieprawidłową liczbę.');
    if (kind === 1 && Math.abs(value) > 10) throw new Error('Poza zakresem danych pozycji.');
    if (kind === 2 && Math.abs(value) > 4) throw new Error('Poza zakresem danych landmarków.');
  }
  if (kind === 2 && (packet.readFloatLE(16) < 0 || packet.readFloatLE(16) > 1
    || packet.readFloatLE(20) < 0 || packet.readFloatLE(20) > 1)) {
    throw new Error('Nieprawidłowy confidence landmarków.');
  }
  return kind;
}
