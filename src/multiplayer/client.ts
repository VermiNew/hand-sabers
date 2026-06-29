import { t } from '../i18n/index.ts';
import { decodeRealtimePacket } from './realtime.ts';
import { remoteTracking } from './remote-state.ts';

export const PROTOCOL_VERSION = 1;

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
  code?: unknown;
  playerId?: unknown;
  role?: unknown;
  room?: unknown;
  sentAt?: unknown;
  serverTime?: unknown;
}

interface RoomPlayer {
  id: string;
  streamId: number;
  name: string;
  role: 'host' | 'guest';
  ready: boolean;
}

interface RoomSnapshot {
  code: string;
  revision: number;
  mapId: string | null;
  round: { id: number; mapId: string; startAt: number } | null;
  players: RoomPlayer[];
}

interface MapListItem {
  id: string;
}

let socket: WebSocket | null = null;
let activeJoinUrl = '';
let currentPlayerId = '';
let currentRole: 'host' | 'guest' | null = null;
let currentRoom: RoomSnapshot | null = null;
let serverClockOffsetMs = 0;
const clockSamples: Array<{ offset: number; rtt: number }> = [];
let pendingPreparationMapId = '';
let announcedRoundId = 0;

export function canSendRealtime(): boolean {
  return Boolean(currentPlayerId) && socket?.readyState === WebSocket.OPEN;
}

export function sendRealtimePacket(packet: ArrayBuffer): boolean {
  const activeSocket = socket;
  if (
    !currentPlayerId
    || activeSocket?.readyState !== WebSocket.OPEN
    || (packet.byteLength !== 96 && packet.byteLength !== 528)
  ) return false;
  activeSocket.send(packet);
  return true;
}

export function serverTimeToPerformance(serverTime: number): number {
  const estimatedServerNow = Date.now() + serverClockOffsetMs;
  return performance.now() + (serverTime - estimatedServerNow);
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing multiplayer element: ${id}`);
  return found as T;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const serverCode = typeof payload['error'] === 'string' && /^[A-Z_]+$/.test(payload['error'])
      ? payload['error']
      : '';
    const code = serverCode
      || (response.status === 404
        ? 'ROOM_NOT_FOUND'
        : response.status === 429
          ? 'RATE_LIMITED'
          : response.status >= 500 ? 'SERVER_UNAVAILABLE' : 'REQUEST_FAILED');
    throw new Error(translateServerError(code));
  }
  return payload as T;
}

function translateServerError(code: string): string {
  const key = `multiplayer.errors.${code}`;
  const translated = t(key);
  return translated === key ? t('multiplayer.errors.REQUEST_FAILED') : translated;
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return translateServerError('SERVER_UNAVAILABLE');
  return error instanceof Error ? error.message : translateServerError('REQUEST_FAILED');
}

function websocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

function parseRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate['code'] !== 'string'
    || !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(candidate['code'])
    || !Number.isSafeInteger(candidate['revision'])
    || Number(candidate['revision']) < 0
    || !Array.isArray(candidate['players'])
    || candidate['players'].length > 8
    || (candidate['mapId'] !== null && typeof candidate['mapId'] !== 'string')
    || (typeof candidate['mapId'] === 'string' && !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(candidate['mapId']))
  ) return null;
  const roundValue = candidate['round'];
  let round: RoomSnapshot['round'] = null;
  if (roundValue !== null) {
    if (!roundValue || typeof roundValue !== 'object' || Array.isArray(roundValue)) return null;
    const candidateRound = roundValue as Record<string, unknown>;
    if (
      !Number.isSafeInteger(candidateRound['id'])
      || Number(candidateRound['id']) < 1
      || typeof candidateRound['mapId'] !== 'string'
      || !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(candidateRound['mapId'])
      || typeof candidateRound['startAt'] !== 'number'
      || !Number.isFinite(candidateRound['startAt'])
      || candidateRound['startAt'] < 0
    ) return null;
    round = {
      id: candidateRound['id'] as number,
      mapId: candidateRound['mapId'],
      startAt: candidateRound['startAt'],
    };
  }

  const players: RoomPlayer[] = [];
  for (const valuePlayer of candidate['players']) {
    if (!valuePlayer || typeof valuePlayer !== 'object' || Array.isArray(valuePlayer)) return null;
    const player = valuePlayer as Record<string, unknown>;
    if (
      typeof player['id'] !== 'string'
      || player['id'].length > 64
      || !Number.isSafeInteger(player['streamId'])
      || Number(player['streamId']) < 1
      || Number(player['streamId']) > 0xffff_ffff
      || typeof player['name'] !== 'string'
      || player['name'].length > 32
      || (player['role'] !== 'host' && player['role'] !== 'guest')
      || typeof player['ready'] !== 'boolean'
    ) return null;
    players.push({
      id: player['id'],
      streamId: player['streamId'] as number,
      name: player['name'],
      role: player['role'],
      ready: player['ready'],
    });
  }
  return {
    code: candidate['code'],
    revision: candidate['revision'] as number,
    mapId: candidate['mapId'] as string | null,
    round,
    players,
  };
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
  const lobby = element<HTMLElement>('multiplayerLobby');
  const lobbyCode = element<HTMLElement>('multiplayerLobbyCode');
  const playerCount = element<HTMLElement>('multiplayerPlayerCount');
  const playerList = element<HTMLElement>('multiplayerPlayers');
  const mapSelect = element<HTMLSelectElement>('multiplayerMap');
  const readyButton = element<HTMLButtonElement>('multiplayerReady');
  const startButton = element<HTMLButtonElement>('multiplayerStart');

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
  const sendControl = (payload: object) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payload }));
    }
  };

  const renderRoom = (snapshot: RoomSnapshot) => {
    if (currentRoom && snapshot.revision < currentRoom.revision) return;
    currentRoom = snapshot;
    remoteTracking.retainStreams(new Set(snapshot.players.map(player => player.streamId)));
    window.dispatchEvent(new CustomEvent('hand-sabers:room-state', { detail: snapshot }));
    lobby.hidden = false;
    lobbyCode.textContent = snapshot.code;
    playerCount.textContent = `${snapshot.players.length} / 8`;
    playerList.replaceChildren();
    for (const player of snapshot.players) {
      const row = document.createElement('div');
      row.className = `mp-player-row${player.ready ? ' is-ready' : ''}`;
      const identity = document.createElement('span');
      identity.className = 'mp-player-name';
      identity.textContent = player.name;
      if (player.role === 'host') {
        const role = document.createElement('span');
        role.className = 'mp-player-role';
        role.textContent = 'HOST';
        identity.append(role);
      }
      const state = document.createElement('span');
      state.className = 'mp-player-state';
      state.textContent = player.ready ? t('multiplayer.readyState') : t('multiplayer.waitingState');
      row.append(identity, state);
      playerList.append(row);
    }

    if (snapshot.mapId && ![...mapSelect.options].some(option => option.value === snapshot.mapId)) {
      mapSelect.add(new Option(snapshot.mapId, snapshot.mapId));
    }
    mapSelect.value = snapshot.mapId ?? '';
    mapSelect.disabled = currentRole !== 'host';
    const self = snapshot.players.find(player => player.id === currentPlayerId);
    readyButton.disabled = !snapshot.mapId || !self || Boolean(pendingPreparationMapId);
    readyButton.classList.toggle('is-ready', Boolean(self?.ready));
    readyButton.textContent = pendingPreparationMapId
      ? t('multiplayer.preparing')
      : self?.ready ? t('multiplayer.notReady') : t('multiplayer.ready');
    startButton.hidden = currentRole !== 'host';
    startButton.disabled = !snapshot.mapId
      || snapshot.players.length === 0
      || snapshot.players.some(player => !player.ready)
      || Boolean(snapshot.round);
    if (snapshot.round && snapshot.round.id > announcedRoundId) {
      announcedRoundId = snapshot.round.id;
      window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-start', {
        detail: {
          ...snapshot.round,
          startAtPerformance: serverTimeToPerformance(snapshot.round.startAt),
        },
      }));
    }
  };

  async function loadMaps(): Promise<void> {
    try {
      const response = await fetch('/api/maps');
      const maps = await responseJson<unknown>(response);
      if (!Array.isArray(maps)) throw new Error(t('multiplayer.invalidResponse'));
      const selected = currentRoom?.mapId ?? '';
      mapSelect.replaceChildren(new Option(t('multiplayer.selectMap'), ''));
      for (const value of maps) {
        const map = value as Partial<MapListItem> | null;
        if (typeof map?.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,119}$/i.test(map.id)) {
          mapSelect.add(new Option(map.id, map.id));
        }
      }
      mapSelect.value = selected;
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t('multiplayer.mapsError'));
    }
  }

  function connect(code: string, token: string, name: string): void {
    socket?.close(1000, 'Replaced');
    clockSamples.length = 0;
    serverClockOffsetMs = 0;
    currentPlayerId = '';
    currentRole = null;
    currentRoom = null;
    pendingPreparationMapId = '';
    announcedRoundId = 0;
    lobby.hidden = true;
    showRoom();
    const nextSocket = new WebSocket(websocketUrl());
    nextSocket.binaryType = 'arraybuffer';
    socket = nextSocket;
    let clockTimer: ReturnType<typeof setInterval> | null = null;

    const pingClock = () => {
      if (nextSocket.readyState === WebSocket.OPEN) {
        nextSocket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', sentAt: Date.now() }));
      }
    };

    nextSocket.addEventListener('open', () => {
      nextSocket.send(JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'join',
        code,
        token,
        name,
      }));
      pingClock();
      clockTimer = setInterval(pingClock, 5_000);
    });
    nextSocket.addEventListener('message', event => {
      if (socket !== nextSocket) return;
      if (typeof event.data !== 'string') {
        const packet = event.data instanceof ArrayBuffer ? decodeRealtimePacket(event.data) : null;
        if (packet) {
          remoteTracking.ingest(packet);
          window.dispatchEvent(new CustomEvent('hand-sabers:realtime-packet', { detail: packet }));
        }
        return;
      }
      try {
        const incoming = JSON.parse(event.data) as ServerMessage;
        if (incoming.v !== PROTOCOL_VERSION) return;
        if (incoming.type === 'joined') {
          currentPlayerId = String(incoming.playerId || '');
          currentRole = incoming.role === 'host' ? 'host' : 'guest';
          status.textContent = t('multiplayer.connected');
          setBusy(false);
          const snapshot = parseRoomSnapshot(incoming.room);
          if (snapshot) renderRoom(snapshot);
          else showMessage(t('multiplayer.invalidResponse'));
          void loadMaps();
        } else if (incoming.type === 'room') {
          const snapshot = parseRoomSnapshot(incoming.room);
          if (snapshot) renderRoom(snapshot);
        } else if (incoming.type === 'pong') {
          const sentAt = Number(incoming.sentAt);
          const serverTime = Number(incoming.serverTime);
          const receivedAt = Date.now();
          if (Number.isFinite(sentAt) && Number.isFinite(serverTime) && sentAt <= receivedAt) {
            const rtt = receivedAt - sentAt;
            if (rtt <= 10_000) {
              clockSamples.push({ rtt, offset: serverTime - (sentAt + receivedAt) / 2 });
              clockSamples.sort((left, right) => left.rtt - right.rtt);
              if (clockSamples.length > 8) clockSamples.length = 8;
              const bestOffsets = clockSamples.slice(0, 3).map(sample => sample.offset).sort((a, b) => a - b);
              serverClockOffsetMs = bestOffsets[Math.floor(bestOffsets.length / 2)] ?? 0;
            }
          }
        } else if (incoming.type === 'error') {
          showMessage(translateServerError(String(incoming.code || 'REQUEST_FAILED')));
        }
      } catch {
        showMessage(t('multiplayer.connectionError'));
      }
    });
    nextSocket.addEventListener('close', () => {
      if (clockTimer) clearInterval(clockTimer);
      if (socket !== nextSocket) return;
      status.textContent = t('multiplayer.disconnected');
      remoteTracking.clear();
      window.dispatchEvent(new CustomEvent('hand-sabers:room-state', { detail: null }));
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
      showMessage(requestErrorMessage(error));
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
      showMessage(requestErrorMessage(error));
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
  readyButton.addEventListener('click', () => {
    const self = currentRoom?.players.find(player => player.id === currentPlayerId);
    if (self?.ready) {
      sendControl({ type: 'ready', ready: false });
      return;
    }
    const mapId = currentRoom?.mapId;
    if (!mapId || pendingPreparationMapId) return;
    pendingPreparationMapId = mapId;
    readyButton.disabled = true;
    readyButton.textContent = t('multiplayer.preparing');
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare', { detail: { mapId } }));
  });
  startButton.addEventListener('click', () => sendControl({ type: 'start-game' }));
  mapSelect.addEventListener('change', () => {
    if (currentRole !== 'host' || !mapSelect.value) return;
    pendingPreparationMapId = '';
    sendControl({ type: 'set-map', mapId: mapSelect.value });
  });
  window.addEventListener('hand-sabers:multiplayer-prepared', event => {
    const mapId = (event as CustomEvent<{ mapId?: unknown }>).detail?.mapId;
    if (typeof mapId !== 'string' || mapId !== pendingPreparationMapId || currentRoom?.mapId !== mapId) return;
    pendingPreparationMapId = '';
    sendControl({ type: 'ready', ready: true });
  });
  window.addEventListener('hand-sabers:multiplayer-prepare-error', () => {
    if (!pendingPreparationMapId) return;
    pendingPreparationMapId = '';
    readyButton.disabled = false;
    readyButton.textContent = t('multiplayer.ready');
    showMessage(t('multiplayer.prepareFailed'));
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
