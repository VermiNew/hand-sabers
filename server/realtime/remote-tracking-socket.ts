import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { TrackingSessionRegistry } from './tracking-session-registry.js';

const PROTOCOL_VERSION = 1;
const JOIN_TIMEOUT_MS = 10_000;
const MAX_CONNECTIONS = 64;
const MAX_PACKETS_PER_SECOND = 60;
const MAX_OUTGOING_BUFFER_BYTES = 64 * 1024;

interface Peer {
  sessionId: string;
  role: 'host' | 'phone';
  tokens: number;
  tokensUpdatedAt: number;
}

function validateTrackingPacket(packet: Buffer): void {
  if ((packet.length !== 96 && packet.length !== 528) || packet[0] !== PROTOCOL_VERSION) {
    throw new Error('INVALID_PACKET');
  }
  const kind = packet[1];
  if (kind !== 1 && kind !== 2) throw new Error('INVALID_PACKET');
  if ((kind === 1 && packet.length !== 96) || (kind === 2 && packet.length !== 528)) {
    throw new Error('INVALID_PACKET');
  }
  if ((packet[2] ?? 0) > 3 || packet[3] !== 0) throw new Error('INVALID_PACKET');
  const timestamp = packet.readDoubleLE(8);
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('INVALID_PACKET');
  for (let offset = 16; offset < packet.length; offset += 4) {
    const value = packet.readFloatLE(offset);
    if (!Number.isFinite(value) || Math.abs(value) > (kind === 1 ? 10 : 4)) throw new Error('INVALID_PACKET');
  }
  if (kind === 2 && (packet.readFloatLE(16) < 0 || packet.readFloatLE(16) > 1
    || packet.readFloatLE(20) < 0 || packet.readFloatLE(20) > 1)) throw new Error('INVALID_PACKET');
}

function consumeToken(peer: Peer, now = Date.now()): boolean {
  const elapsed = Math.max(0, now - peer.tokensUpdatedAt) / 1000;
  peer.tokens = Math.min(MAX_PACKETS_PER_SECOND, peer.tokens + elapsed * MAX_PACKETS_PER_SECOND);
  peer.tokensUpdatedAt = now;
  if (peer.tokens < 1) return false;
  peer.tokens--;
  return true;
}

function isAllowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === String(request.headers.host || '').toLowerCase();
  } catch {
    return false;
  }
}

function send(socket: WebSocket, payload: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payload }));
    } catch (error) {
      console.error('Remote tracking WebSocket send failed:', error);
      socket.terminate();
    }
  }
}

export function registerRemoteTrackingServer(
  server: HttpServer | HttpsServer,
  sessions: TrackingSessionRegistry,
): { close(): void } {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const peers = new Map<WebSocket, Peer>();

  const peerFor = (sessionId: string, role: Peer['role']): WebSocket | null => {
    for (const [socket, peer] of peers) {
      if (peer.sessionId === sessionId && peer.role === role && socket.readyState === WebSocket.OPEN) return socket;
    }
    return null;
  };

  const notifyPair = (sessionId: string) => {
    const host = peerFor(sessionId, 'host');
    const phone = peerFor(sessionId, 'phone');
    if (!host || !phone) return;
    send(host, { type: 'peer-connected', peer: 'phone' });
    send(phone, { type: 'peer-connected', peer: 'host' });
  };

  webSocketServer.on('connection', socket => {
    const joinTimer = setTimeout(() => socket.close(1008, 'Join timeout'), JOIN_TIMEOUT_MS);
    joinTimer.unref();

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        const peer = peers.get(socket);
        if (!peer || peer.role !== 'phone') {
          socket.close(1008, 'Phone authentication required');
          return;
        }
        const packet = Buffer.isBuffer(data)
          ? data
          : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
        try {
          validateTrackingPacket(packet);
        } catch {
          socket.close(1003, 'Invalid tracking packet');
          return;
        }
        if (!consumeToken(peer)) return;
        const host = peerFor(peer.sessionId, 'host');
        if (host && host.bufferedAmount <= MAX_OUTGOING_BUFFER_BYTES) {
          try {
            host.send(packet, { binary: true });
          } catch (error) {
            console.error('Remote tracking packet relay failed:', error);
            host.terminate();
          }
        }
        return;
      }
      if (peers.has(socket)) {
        socket.close(1008, 'Unexpected message');
        return;
      }
      try {
        const value = JSON.parse(data.toString()) as Record<string, unknown>;
        const sessionId = typeof value['sessionId'] === 'string' ? value['sessionId'] : '';
        const token = typeof value['token'] === 'string' ? value['token'] : '';
        const role = value['role'];
        if (value['v'] !== PROTOCOL_VERSION || value['type'] !== 'join' || (role !== 'host' && role !== 'phone')) {
          throw new Error('INVALID_JOIN');
        }
        const status = role === 'host'
          ? sessions.authenticateHost(sessionId, token)
          : sessions.authenticatePhone(sessionId, token);
        if (!status) throw new Error('UNAUTHORIZED');
        clearTimeout(joinTimer);
        peers.set(socket, {
          sessionId,
          role,
          tokens: MAX_PACKETS_PER_SECOND,
          tokensUpdatedAt: Date.now(),
        });
        send(socket, { type: 'joined', role, expiresAt: status.expiresAt });
        notifyPair(sessionId);
      } catch {
        send(socket, { type: 'error', code: 'UNAUTHORIZED' });
        socket.close(1008, 'Unauthorized');
      }
    });

    socket.once('close', () => {
      clearTimeout(joinTimer);
      const peer = peers.get(socket);
      peers.delete(socket);
      if (!peer) return;
      sessions.setDisconnected(peer.sessionId, peer.role);
      const counterpart = peerFor(peer.sessionId, peer.role === 'host' ? 'phone' : 'host');
      if (counterpart) send(counterpart, { type: 'peer-disconnected', peer: peer.role });
    });
    socket.once('error', () => socket.terminate());
  });

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (url.pathname !== '/tracking-ws') return;
      if (!isAllowedOrigin(request) || webSocketServer.clients.size >= MAX_CONNECTIONS) {
        socket.destroy();
        return;
      }
      webSocketServer.handleUpgrade(request, socket, head, upgraded => {
        webSocketServer.emit('connection', upgraded, request);
      });
    } catch (error) {
      console.error('Remote tracking WebSocket upgrade failed:', error);
      socket.destroy();
    }
  };
  server.on('upgrade', handleUpgrade);

  return {
    close() {
      server.off('upgrade', handleUpgrade);
      for (const socket of peers.keys()) {
        try {
          socket.close(1001, 'Server shutdown');
        } catch (error) {
          console.error('Remote tracking WebSocket close failed:', error);
          socket.terminate();
        }
      }
      peers.clear();
      try {
        webSocketServer.close();
      } catch (error) {
        console.error('Remote tracking WebSocket server close failed:', error);
      }
    },
  };
}
