import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { RoomError } from './room-registry.js';
import type { RoomRegistry, RoomSnapshot } from './room-registry.js';

const PROTOCOL_VERSION = 1;
const MAX_CONTROL_MESSAGES_PER_MINUTE = 1_200;
const REALTIME_PACKETS_PER_SECOND = 120;
const REALTIME_BURST_PACKETS = 180;
const MAX_CONNECTIONS = 512;
const MAX_UPGRADES_PER_IP_PER_MINUTE = 120;
const MAX_OUTGOING_BUFFER_BYTES = 256 * 1024;
const POSE_PACKET_BYTES = 96;
const LANDMARK_PACKET_BYTES = 528;
const JOIN_TIMEOUT_MS = 10_000;

interface ClientState {
  roomCode: string | null;
  playerId: string | null;
  messageTimes: number[];
  realtimeTokens: number;
  realtimeUpdatedAt: number;
  realtimeViolations: number;
  alive: boolean;
}

interface ClientMessage {
  v?: unknown;
  type?: unknown;
  code?: unknown;
  token?: unknown;
  name?: unknown;
  ready?: unknown;
  mapId?: unknown;
  mode?: unknown;
  trainingMode?: unknown;
  noFail?: unknown;
  score?: unknown;
  combo?: unknown;
  lives?: unknown;
  progress?: unknown;
  finished?: unknown;
  sentAt?: unknown;
}

function isAllowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = String(request.headers.host || '').toLowerCase();
    if (originUrl.host.toLowerCase() === host) return true;
    const [hostName = '', hostPort = ''] = host.split(':');
    return originUrl.hostname.toLowerCase() === hostName
      && ['3000', '5173'].includes(originUrl.port)
      && ['3000', '5173'].includes(hostPort);
  } catch {
    return false;
  }
}

function send(socket: WebSocket, payload: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payload }));
  }
}

function parseMessage(data: RawData): ClientMessage {
  const parsed = JSON.parse(data.toString()) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_MESSAGE');
  }
  const message = parsed as ClientMessage;
  if (message.v !== PROTOCOL_VERSION) throw new Error('UNSUPPORTED_PROTOCOL');
  return message;
}

function validateRealtimePacket(packet: Buffer): 1 | 2 {
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

function consumeRealtimeToken(client: ClientState, now: number): boolean {
  const elapsedSeconds = Math.max(0, now - client.realtimeUpdatedAt) / 1000;
  client.realtimeTokens = Math.min(
    REALTIME_BURST_PACKETS,
    client.realtimeTokens + elapsedSeconds * REALTIME_PACKETS_PER_SECOND,
  );
  client.realtimeUpdatedAt = now;
  if (client.realtimeTokens < 1) return false;
  client.realtimeTokens--;
  return true;
}

export function registerRealtimeServer(server: HttpServer | HttpsServer, rooms: RoomRegistry): { close(): void } {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  });
  const clients = new Map<WebSocket, ClientState>();
  const upgradesByIp = new Map<string, number[]>();

  function broadcast(roomCode: string, snapshot: RoomSnapshot | null): void {
    if (!snapshot) return;
    for (const [socket, client] of clients) {
      if (client.roomCode === roomCode) send(socket, { type: 'room', room: snapshot });
    }
  }

  function broadcastRoundStarted(roomCode: string, snapshot: RoomSnapshot): void {
    for (const [socket, client] of clients) {
      if (client.roomCode === roomCode) send(socket, { type: 'round-started', room: snapshot });
    }
  }

  function broadcastScore(roomCode: string, player: RoomSnapshot['players'][number]): void {
    for (const [socket, client] of clients) {
      if (client.roomCode === roomCode) send(socket, { type: 'score', player });
    }
  }

  function leave(socket: WebSocket): void {
    const client = clients.get(socket);
    clients.delete(socket);
    if (!client?.roomCode || !client.playerId) return;
    broadcast(client.roomCode, rooms.leave(client.roomCode, client.playerId));
  }

  function relayRealtime(sender: WebSocket, client: ClientState, packet: Buffer): void {
    if (!client.roomCode || !client.playerId) {
      sender.close(1008, 'Join required');
      return;
    }
    validateRealtimePacket(packet);
    const now = Date.now();
    if (!consumeRealtimeToken(client, now)) {
      client.realtimeViolations++;
      if (client.realtimeViolations > 30) sender.close(1008, 'Realtime rate limit');
      return;
    }
    client.realtimeViolations = Math.max(0, client.realtimeViolations - 1);
    const streamId = rooms.getPlayerStreamId(client.roomCode, client.playerId);
    if (streamId === null) throw new RoomError('PLAYER_NOT_FOUND');

    const outgoing = Buffer.allocUnsafe(4 + packet.length);
    outgoing.writeUInt32LE(streamId, 0);
    packet.copy(outgoing, 4);
    for (const [socket, recipient] of clients) {
      if (socket === sender || recipient.roomCode !== client.roomCode || socket.readyState !== WebSocket.OPEN) continue;
      // Pose data expires quickly. A slow client gets the newest future packet
      // instead of accumulating seconds of latency in the WebSocket buffer.
      if (socket.bufferedAmount > MAX_OUTGOING_BUFFER_BYTES) continue;
      socket.send(outgoing, { binary: true });
    }
  }

  webSocketServer.on('connection', socket => {
    const client: ClientState = {
      roomCode: null,
      playerId: null,
      messageTimes: [],
      realtimeTokens: REALTIME_BURST_PACKETS,
      realtimeUpdatedAt: Date.now(),
      realtimeViolations: 0,
      alive: true,
    };
    clients.set(socket, client);
    const joinTimeout = setTimeout(() => socket.close(1008, 'Join timeout'), JOIN_TIMEOUT_MS);
    joinTimeout.unref();

    socket.on('message', (data, isBinary) => {
      try {
        if (isBinary) {
          const packet = Buffer.isBuffer(data)
            ? data
            : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
          relayRealtime(socket, client, packet);
          return;
        }
        const now = Date.now();
        client.messageTimes = client.messageTimes.filter(timestamp => now - timestamp < 60_000);
        client.messageTimes.push(now);
        if (client.messageTimes.length > MAX_CONTROL_MESSAGES_PER_MINUTE) {
          socket.close(1008, 'Control rate limit');
          return;
        }

        const message = parseMessage(data);
        const type = String(message.type || '');
        if (type === 'join') {
          if (client.roomCode) throw new Error('ALREADY_JOINED');
          const joined = rooms.join(
            String(message.code || ''),
            String(message.token || ''),
            String(message.name || ''),
          );
          client.roomCode = joined.snapshot.code;
          client.playerId = joined.player.id;
          clearTimeout(joinTimeout);
          send(socket, {
            type: 'joined',
            playerId: joined.player.id,
            role: joined.player.role,
            room: joined.snapshot,
          });
          broadcast(joined.snapshot.code, joined.snapshot);
          return;
        }

        if (type === 'ping') {
          send(socket, { type: 'pong', sentAt: message.sentAt, serverTime: Date.now() });
          return;
        }
        if (!client.roomCode || !client.playerId) throw new Error('JOIN_REQUIRED');

        if (type === 'ready') {
          broadcast(client.roomCode, rooms.setReady(client.roomCode, client.playerId, message.ready === true));
          return;
        }
        if (type === 'set-map') {
          broadcast(client.roomCode, rooms.setMap(client.roomCode, client.playerId, String(message.mapId || '')));
          return;
        }
        if (type === 'set-mode') {
          broadcast(client.roomCode, rooms.setMode(client.roomCode, client.playerId, String(message.mode || '')));
          return;
        }
        if (type === 'set-rules') {
          broadcast(client.roomCode, rooms.setRules(client.roomCode, client.playerId, {
            trainingMode: message.trainingMode,
            noFail: message.noFail,
          }));
          return;
        }
        if (type === 'start-game') {
          const snapshot = rooms.startRound(client.roomCode, client.playerId);
          broadcast(client.roomCode, snapshot);
          broadcastRoundStarted(client.roomCode, snapshot);
          return;
        }
        if (type === 'score') {
          const updated = rooms.updateScore(client.roomCode, client.playerId, {
            score: typeof message.score === 'number' ? message.score : Number.NaN,
            combo: typeof message.combo === 'number' ? message.combo : Number.NaN,
            lives: typeof message.lives === 'number' ? message.lives : Number.NaN,
            progress: typeof message.progress === 'number' ? message.progress : Number.NaN,
            finished: message.finished === true,
          });
          broadcastScore(client.roomCode, updated.player);
          if (updated.completedSnapshot) broadcast(client.roomCode, updated.completedSnapshot);
          return;
        }
        throw new Error('UNKNOWN_MESSAGE');
      } catch (error) {
        if (isBinary) {
          socket.close(1003, 'Invalid realtime packet');
          return;
        }
        const code = error instanceof RoomError
          ? error.code
          : error instanceof Error && /^[A-Z_]+$/.test(error.message)
            ? error.message
            : 'INVALID_MESSAGE';
        send(socket, { type: 'error', code });
      }
    });

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.once('close', () => {
      clearTimeout(joinTimeout);
      leave(socket);
    });
    socket.once('error', () => socket.terminate());
  });

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') return;
    const ip = request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recentUpgrades = (upgradesByIp.get(ip) ?? []).filter(timestamp => now - timestamp < 60_000);
    recentUpgrades.push(now);
    upgradesByIp.set(ip, recentUpgrades);
    if (
      !isAllowedOrigin(request)
      || clients.size >= MAX_CONNECTIONS
      || recentUpgrades.length > MAX_UPGRADES_PER_IP_PER_MINUTE
    ) {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, upgraded => {
      webSocketServer.emit('connection', upgraded, request);
    });
  };
  server.on('upgrade', handleUpgrade);
  const heartbeat = setInterval(() => {
    for (const [socket, client] of clients) {
      if (!client.alive) {
        socket.terminate();
        continue;
      }
      client.alive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return {
    close(): void {
      clearInterval(heartbeat);
      server.off('upgrade', handleUpgrade);
      for (const socket of clients.keys()) socket.close(1001, 'Server shutdown');
      clients.clear();
      webSocketServer.close();
    },
  };
}
