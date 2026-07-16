export interface RemoteChannelEvent {
  type: string;
  peer?: unknown;
  code?: unknown;
}

function websocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/tracking-ws`;
}

export function openRemoteTrackingChannel(options: {
  sessionId: string;
  token: string;
  role: 'host' | 'phone';
  onEvent(event: RemoteChannelEvent): void;
  onClose(): void;
}): WebSocket {
  const socket = new WebSocket(websocketUrl());
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
      v: 1,
      type: 'join',
      sessionId: options.sessionId,
      token: options.token,
      role: options.role,
    }));
  });
  socket.addEventListener('message', event => {
    if (typeof event.data !== 'string') return;
    try {
      const payload = JSON.parse(event.data) as RemoteChannelEvent;
      if (payload && typeof payload.type === 'string') options.onEvent(payload);
    } catch {}
  });
  socket.addEventListener('close', options.onClose);
  return socket;
}
