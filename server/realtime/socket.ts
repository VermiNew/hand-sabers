import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomError } from './room-registry.js';
import type { RoomRegistry, RoomSnapshot } from './room-registry.js';
import { PROTOCOL_VERSION, parseMessage, sanitizeChatText, validateRealtimePacket } from './protocol.js';

const MAX_CONTROL_MESSAGES_PER_MINUTE = 1_200;
const MAX_CHAT_MESSAGES_PER_WINDOW = 8;
const CHAT_RATE_WINDOW_MS = 10_000;
const REALTIME_PACKETS_PER_SECOND = 120;
const REALTIME_BURST_PACKETS = 180;
const MAX_CONNECTIONS = 512;
const MAX_UPGRADES_PER_IP_PER_MINUTE = 120;
const MAX_OUTGOING_BUFFER_BYTES = 256 * 1024;
const JOIN_TIMEOUT_MS = 10_000;

interface ClientState {
  roomCode: string | null;
  playerId: string | null;
  messageTimes: number[];
  chatTimes: number[];
  realtimeTokens: number;
  realtimeUpdatedAt: number;
  realtimeViolations: number;
  alive: boolean;
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
    try {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payload }));
    } catch (error) {
      console.error('Multiplayer WebSocket send failed:', error);
      socket.terminate();
    }
  }
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

  function broadcastChat(
    roomCode: string,
    message: { playerId: string; playerName: string; text: string; sentAt: number },
  ): void {
    for (const [socket, client] of clients) {
      if (client.roomCode === roomCode) send(socket, { type: 'chat', message });
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
      chatTimes: [],
      realtimeTokens: REALTIME_BURST_PACKETS,
      realtimeUpdatedAt: Date.now(),
      realtimeViolations: 0,
      alive: true,
    };
    clients.set(socket, client);
    const joinTimeout = setTimeout(() => {
      try {
        socket.close(1008, 'Join timeout');
      } catch (error) {
        console.error('Multiplayer join timeout close failed:', error);
        socket.terminate();
      }
    }, JOIN_TIMEOUT_MS);
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

        if (type === 'chat') {
          const text = sanitizeChatText(message.text);
          client.chatTimes = client.chatTimes.filter(timestamp => now - timestamp < CHAT_RATE_WINDOW_MS);
          if (client.chatTimes.length >= MAX_CHAT_MESSAGES_PER_WINDOW) throw new Error('CHAT_RATE_LIMIT');
          client.chatTimes.push(now);
          const player = rooms.get(client.roomCode)?.players.find(candidate => candidate.id === client.playerId);
          if (!player) throw new RoomError('PLAYER_NOT_FOUND');
          broadcastChat(client.roomCode, {
            playerId: player.id,
            playerName: player.name,
            text,
            sentAt: now,
          });
          return;
        }

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
    try {
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
    } catch (error) {
      console.error('Multiplayer WebSocket upgrade failed:', error);
      socket.destroy();
    }
  };
  server.on('upgrade', handleUpgrade);
  const heartbeat = setInterval(() => {
    for (const [socket, client] of clients) {
      try {
        if (!client.alive) {
          socket.terminate();
          continue;
        }
        client.alive = false;
        socket.ping();
      } catch (error) {
        console.error('Multiplayer WebSocket heartbeat failed:', error);
        socket.terminate();
      }
    }
  }, 30_000);
  heartbeat.unref();

  return {
    close(): void {
      clearInterval(heartbeat);
      server.off('upgrade', handleUpgrade);
      for (const socket of clients.keys()) {
        try {
          socket.close(1001, 'Server shutdown');
        } catch (error) {
          console.error('Multiplayer WebSocket close failed:', error);
          socket.terminate();
        }
      }
      clients.clear();
      try {
        webSocketServer.close();
      } catch (error) {
        console.error('Multiplayer WebSocket server close failed:', error);
      }
    },
  };
}
