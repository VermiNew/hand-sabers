import { t } from '../i18n/index.ts';

const PROTOCOL_VERSION = 1;

interface CreateRoomResponse {
  room: { code: string };
  hostToken: string;
  joinUrl: string;
  qrDataUrl: string;
}

interface JoinCodeResponse {
  code: string;
  joinToken: string;
}

interface ServerMessage {
  v?: unknown;
  type?: unknown;
  message?: unknown;
}

let socket: WebSocket | null = null;
let activeJoinUrl = '';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing multiplayer element: ${id}`);
  return found as T;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload['error'] || `${response.status} ${response.statusText}`));
  return payload as T;
}

function websocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

export function initMultiplayerOverlay(defaultPlayerName: string): void {
  const overlay = element<HTMLElement>('multiplayerOverlay');
  const setup = element<HTMLElement>('multiplayerSetup');
  const room = element<HTMLElement>('multiplayerRoom');
  const share = element<HTMLElement>('multiplayerShare');
  const qr = element<HTMLImageElement>('multiplayerQr');
  const roomCode = element<HTMLElement>('multiplayerRoomCode');
  const status = element<HTMLElement>('multiplayerStatus');
  const message = element<HTMLElement>('multiplayerMessage');
  const nameInput = element<HTMLInputElement>('multiplayerName');
  const codeInput = element<HTMLInputElement>('multiplayerCode');
  const createButton = element<HTMLButtonElement>('multiplayerCreate');
  const joinButton = element<HTMLButtonElement>('multiplayerJoin');
  const copyButton = element<HTMLButtonElement>('multiplayerCopy');

  nameInput.value = defaultPlayerName || 'Gracz';

  const showMessage = (text = '') => {
    message.textContent = text;
    message.hidden = !text;
  };
  const setBusy = (busy: boolean) => {
    createButton.disabled = busy;
    joinButton.disabled = busy;
  };
  const open = () => {
    overlay.hidden = false;
    showMessage();
  };
  const showRoom = () => {
    setup.hidden = true;
    room.hidden = false;
    status.textContent = t('multiplayer.connecting');
  };

  function connect(code: string, token: string, name: string): void {
    socket?.close(1000, 'Replaced');
    showRoom();
    const nextSocket = new WebSocket(websocketUrl());
    nextSocket.binaryType = 'arraybuffer';
    socket = nextSocket;

    nextSocket.addEventListener('open', () => {
      nextSocket.send(JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'join',
        code,
        token,
        name,
      }));
    });
    nextSocket.addEventListener('message', event => {
      if (socket !== nextSocket) return;
      if (typeof event.data !== 'string') {
        window.dispatchEvent(new CustomEvent('hand-sabers:realtime-packet', { detail: event.data }));
        return;
      }
      try {
        const incoming = JSON.parse(event.data) as ServerMessage;
        if (incoming.v !== PROTOCOL_VERSION) return;
        if (incoming.type === 'joined') {
          status.textContent = t('multiplayer.connected');
          setBusy(false);
        } else if (incoming.type === 'error') {
          showMessage(String(incoming.message || t('multiplayer.connectionError')));
        }
      } catch {
        showMessage(t('multiplayer.connectionError'));
      }
    });
    nextSocket.addEventListener('close', () => {
      if (socket !== nextSocket) return;
      status.textContent = t('multiplayer.disconnected');
      setBusy(false);
    });
    nextSocket.addEventListener('error', () => {
      if (socket !== nextSocket) return;
      showMessage(t('multiplayer.connectionError'));
    });
  }

  element('mainMultiplayer').addEventListener('click', open);
  element('multiplayerClose').addEventListener('click', () => {
    overlay.hidden = true;
  });
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) overlay.hidden = true;
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
  });

  createButton.addEventListener('click', async () => {
    setBusy(true);
    showMessage();
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      const created = await responseJson<CreateRoomResponse>(response);
      if (!created.room?.code || !created.hostToken) throw new Error(t('multiplayer.invalidResponse'));
      activeJoinUrl = created.joinUrl;
      roomCode.textContent = created.room.code;
      if (created.qrDataUrl.startsWith('data:image/png;base64,')) qr.src = created.qrDataUrl;
      share.hidden = false;
      connect(created.room.code, created.hostToken, nameInput.value);
    } catch (error) {
      setBusy(false);
      showMessage(error instanceof Error ? error.message : t('multiplayer.connectionError'));
    }
  });

  joinButton.addEventListener('click', async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(code)) {
      showMessage(t('multiplayer.invalidCode'));
      return;
    }
    setBusy(true);
    showMessage();
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST' });
      const credential = await responseJson<JoinCodeResponse>(response);
      share.hidden = true;
      connect(credential.code, credential.joinToken, nameInput.value);
    } catch (error) {
      setBusy(false);
      showMessage(error instanceof Error ? error.message : t('multiplayer.connectionError'));
    }
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '').slice(0, 6);
  });
  copyButton.addEventListener('click', async () => {
    if (!activeJoinUrl) return;
    try {
      await navigator.clipboard.writeText(activeJoinUrl);
      copyButton.textContent = t('multiplayer.copied');
    } catch {
      showMessage(t('multiplayer.copyFailed'));
    }
  });

  const fragment = new URLSearchParams(location.hash.slice(1));
  const linkedCode = fragment.get('room');
  const linkedToken = fragment.get('token');
  if (linkedCode && linkedToken) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    open();
    share.hidden = true;
    connect(linkedCode, linkedToken, nameInput.value);
  }
}
