export interface RemoteChannelEvent {
  type: string;
  peer?: unknown;
  code?: unknown;
  expiresAt?: unknown;
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
  onBinary?(packet: ArrayBuffer): void;
  onClose(event: CloseEvent): void;
}): WebSocket {
  const socket = new WebSocket(websocketUrl());
  const reportError = (context: string, error: unknown): void => {
    console.error(`[remote-channel:${context}]`, error);
    window.dispatchEvent(new CustomEvent('hand-sabers:remote-channel-error', { detail: { context } }));
  };
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('open', () => {
    try {
      socket.send(JSON.stringify({
        v: 1,
        type: 'join',
        sessionId: options.sessionId,
        token: options.token,
        role: options.role,
      }));
    } catch (error) {
      reportError('join', error);
      socket.close(1011, 'Join failed');
    }
  });
  socket.addEventListener('message', event => {
    try {
      if (event.data instanceof ArrayBuffer) {
        options.onBinary?.(event.data);
        return;
      }
      if (typeof event.data !== 'string') return;
      const payload = JSON.parse(event.data) as RemoteChannelEvent;
      if (payload && typeof payload.type === 'string') options.onEvent(payload);
    } catch (error) {
      reportError('message', error);
    }
  });
  socket.addEventListener('close', event => {
    try {
      options.onClose(event);
    } catch (error) {
      reportError('close', error);
    }
  });
  socket.addEventListener('error', () => {
    window.dispatchEvent(new CustomEvent('hand-sabers:remote-channel-error', { detail: { context: 'socket' } }));
  });
  return socket;
}
