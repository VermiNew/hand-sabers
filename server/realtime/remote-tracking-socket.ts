import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { TrackingSessionRegistry } from './tracking-session-registry.js';

const PROTOCOL_VERSION = 1;
const JOIN_TIMEOUT_MS = 10_000;
const MAX_CONNECTIONS = 64;

interface Peer {
  sessionId: string;
  role: 'host' | 'phone';
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
    socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payload }));
  }
}

export function registerRemoteTrackingServer(
  server: Server,
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
      if (isBinary || peers.has(socket)) {
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
        peers.set(socket, { sessionId, role });
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
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/tracking-ws') return;
    if (!isAllowedOrigin(request) || webSocketServer.clients.size >= MAX_CONNECTIONS) {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, upgraded => {
      webSocketServer.emit('connection', upgraded, request);
    });
  };
  server.on('upgrade', handleUpgrade);

  return {
    close() {
      server.off('upgrade', handleUpgrade);
      for (const socket of peers.keys()) socket.close(1001, 'Server shutdown');
      peers.clear();
      webSocketServer.close();
    },
  };
}
