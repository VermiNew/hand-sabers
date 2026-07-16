import { t } from '../i18n/index.ts';
import { setSetting } from '../core/settings.ts';
import { decodeRealtimePacket } from './realtime.ts';
import { remoteTracking } from './remote-state.ts';
import { initMultiplayerMapPicker } from './map-picker.ts';

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
  player?: unknown;
  message?: unknown;
  sentAt?: unknown;
  serverTime?: unknown;
}

interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
}

interface RoomPlayer {
  id: string;
  streamId: number;
  name: string;
  role: 'host' | 'guest';
  saber: 'left' | 'right' | 'both';
  ready: boolean;
  score: number;
  combo: number;
  lives: number;
  progress: number;
  finished: boolean;
  playing: boolean;
}

interface RoomSnapshot {
  code: string;
  revision: number;
  mapId: string | null;
  mode: 'coop' | 'score-attack';
  rules: { trainingMode: boolean; noFail: boolean };
  maxPlayers: number;
  round: { id: number; mapId: string; startAt: number; finishedAt: number | null } | null;
  players: RoomPlayer[];
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

export function sendMultiplayerScore(payload: {
  score: number;
  combo: number;
  lives: number;
  progress: number;
  finished?: boolean;
}): boolean {
  const activeSocket = socket;
  if (!currentPlayerId || activeSocket?.readyState !== WebSocket.OPEN) return false;
  activeSocket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'score', ...payload }));
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

function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 32) || 'Gracz';
}

function websocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

function parseRoomPlayer(value: unknown): RoomPlayer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const player = value as Record<string, unknown>;
  if (
    typeof player['id'] !== 'string'
    || player['id'].length > 64
    || !Number.isSafeInteger(player['streamId'])
    || Number(player['streamId']) < 1
    || Number(player['streamId']) > 0xffff_ffff
    || typeof player['name'] !== 'string'
    || player['name'].length > 32
    || (player['role'] !== 'host' && player['role'] !== 'guest')
    || (player['saber'] !== 'left' && player['saber'] !== 'right' && player['saber'] !== 'both')
    || typeof player['ready'] !== 'boolean'
    || !Number.isSafeInteger(player['score'])
    || Number(player['score']) < 0
    || Number(player['score']) > 1_000_000_000
    || !Number.isSafeInteger(player['combo'])
    || Number(player['combo']) < 0
    || Number(player['combo']) > 1_000_000
    || !Number.isSafeInteger(player['lives'])
    || Number(player['lives']) < 0
    || Number(player['lives']) > 100
    || typeof player['progress'] !== 'number'
    || !Number.isFinite(player['progress'])
    || player['progress'] < 0
    || player['progress'] > 1
    || typeof player['finished'] !== 'boolean'
    || typeof player['playing'] !== 'boolean'
  ) return null;
  return {
    id: player['id'],
    streamId: player['streamId'] as number,
    name: player['name'],
    role: player['role'],
    saber: player['saber'],
    ready: player['ready'],
    score: player['score'] as number,
    combo: player['combo'] as number,
    lives: player['lives'] as number,
    progress: player['progress'],
    finished: player['finished'],
    playing: player['playing'],
  };
}

function parseChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (
    typeof message['playerId'] !== 'string'
    || message['playerId'].length > 64
    || typeof message['playerName'] !== 'string'
    || message['playerName'].length > 32
    || typeof message['text'] !== 'string'
    || message['text'].length < 1
    || message['text'].length > 240
    || typeof message['sentAt'] !== 'number'
    || !Number.isFinite(message['sentAt'])
    || message['sentAt'] < 0
    || message['sentAt'] > 8_640_000_000_000_000
  ) return null;
  return {
    playerId: message['playerId'],
    playerName: message['playerName'],
    text: message['text'],
    sentAt: message['sentAt'],
  };
}

function parseRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const rulesValue = candidate['rules'];
  if (
    typeof candidate['code'] !== 'string'
    || !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(candidate['code'])
    || !Number.isSafeInteger(candidate['revision'])
    || Number(candidate['revision']) < 0
    || !Array.isArray(candidate['players'])
    || (candidate['mode'] !== 'coop' && candidate['mode'] !== 'score-attack')
    || !Number.isSafeInteger(candidate['maxPlayers'])
    || (candidate['mode'] === 'coop' && candidate['maxPlayers'] !== 2)
    || (candidate['mode'] === 'score-attack' && candidate['maxPlayers'] !== 8)
    || candidate['players'].length > Number(candidate['maxPlayers'])
    || (candidate['mapId'] !== null && typeof candidate['mapId'] !== 'string')
    || (typeof candidate['mapId'] === 'string' && !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(candidate['mapId']))
    || !rulesValue
    || typeof rulesValue !== 'object'
    || Array.isArray(rulesValue)
  ) return null;
  const candidateRules = rulesValue as Record<string, unknown>;
  if (typeof candidateRules['trainingMode'] !== 'boolean' || typeof candidateRules['noFail'] !== 'boolean') {
    return null;
  }
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
      || (candidateRound['finishedAt'] !== null
        && (typeof candidateRound['finishedAt'] !== 'number'
          || !Number.isFinite(candidateRound['finishedAt'])
          || candidateRound['finishedAt'] < candidateRound['startAt']))
    ) return null;
    round = {
      id: candidateRound['id'] as number,
      mapId: candidateRound['mapId'],
      startAt: candidateRound['startAt'],
      finishedAt: candidateRound['finishedAt'] as number | null,
    };
  }

  const players: RoomPlayer[] = [];
  for (const valuePlayer of candidate['players']) {
    const player = parseRoomPlayer(valuePlayer);
    if (!player) return null;
    if (
      (candidate['mode'] === 'score-attack' && player.saber !== 'both')
      || (candidate['mode'] === 'coop' && player.saber !== (player.role === 'host' ? 'left' : 'right'))
    ) return null;
    players.push(player);
  }
  return {
    code: candidate['code'],
    revision: candidate['revision'] as number,
    mapId: candidate['mapId'] as string | null,
    mode: candidate['mode'],
    rules: {
      trainingMode: candidateRules['trainingMode'],
      noFail: candidateRules['noFail'],
    },
    maxPlayers: candidate['maxPlayers'] as number,
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
  const modeSelect = element<HTMLSelectElement>('multiplayerMode');
  const rulesPanel = element<HTMLFieldSetElement>('multiplayerRules');
  const trainingModeInput = element<HTMLInputElement>('multiplayerTrainingMode');
  const noFailInput = element<HTMLInputElement>('multiplayerNoFail');
  const readyButton = element<HTMLButtonElement>('multiplayerReady');
  const startButton = element<HTMLButtonElement>('multiplayerStart');
  const disconnectButton = element<HTMLButtonElement>('multiplayerDisconnect');
  const lobbyScores = element<HTMLElement>('multiplayerLobbyScores');
  const hudScores = element<HTMLElement>('multiplayerHudScores');
  const chatMessages = element<HTMLElement>('multiplayerChatMessages');
  const chatForm = element<HTMLFormElement>('multiplayerChatForm');
  const chatInput = element<HTMLInputElement>('multiplayerChatInput');
  const chatSend = element<HTMLButtonElement>('multiplayerChatSend');

  chatInput.placeholder = t('multiplayer.chatPlaceholder');
  chatInput.setAttribute('aria-label', t('multiplayer.chatPlaceholder'));

  const resetChat = () => {
    chatMessages.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'mp-chat-empty';
    empty.textContent = t('multiplayer.chatEmpty');
    chatMessages.append(empty);
    chatInput.value = '';
    chatInput.disabled = true;
    chatSend.disabled = true;
  };
  const appendChatMessage = (chatMessage: ChatMessage) => {
    chatMessages.querySelector('.mp-chat-empty')?.remove();
    const row = document.createElement('article');
    row.className = `mp-chat-message${chatMessage.playerId === currentPlayerId ? ' is-own' : ''}`;
    const playerName = document.createElement('strong');
    playerName.textContent = chatMessage.playerName;
    const text = document.createElement('p');
    text.textContent = chatMessage.text;
    const time = document.createElement('time');
    const timestamp = new Date(chatMessage.sentAt);
    time.dateTime = timestamp.toISOString();
    time.textContent = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    row.append(playerName, text, time);
    chatMessages.append(row);
    while (chatMessages.childElementCount > 50) chatMessages.firstElementChild?.remove();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  resetChat();

  nameInput.value = normalizePlayerName(defaultPlayerName);

  const getPlayerName = (): string => {
    const playerName = normalizePlayerName(nameInput.value);
    nameInput.value = playerName;
    setSetting('playerName', playerName);
    return playerName;
  };

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
  const resetRoomView = () => {
    currentPlayerId = '';
    currentRole = null;
    currentRoom = null;
    pendingPreparationMapId = '';
    announcedRoundId = 0;
    activeJoinUrl = '';
    setup.hidden = false;
    room.hidden = true;
    share.hidden = true;
    lobby.hidden = true;
    lobbyScores.hidden = true;
    hudScores.hidden = true;
    roomCode.textContent = '—';
    lobbyCode.textContent = '—';
    playerCount.textContent = '0 / 8';
    playerList.replaceChildren();
    mapPicker.setSelected(null);
    mapPicker.setEnabled(false);
    modeSelect.disabled = true;
    rulesPanel.disabled = true;
    trainingModeInput.checked = false;
    noFailInput.checked = false;
    readyButton.disabled = true;
    readyButton.classList.remove('is-ready');
    readyButton.textContent = t('multiplayer.ready');
    startButton.hidden = true;
    copyButton.textContent = t('multiplayer.copyLink');
    resetChat();
  };
  const disconnectRoom = () => {
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'Left room');
      return;
    }
    socket = null;
    remoteTracking.clear();
    resetRoomView();
    window.dispatchEvent(new CustomEvent('hand-sabers:room-state', { detail: null }));
  };
  const sendControl = (payload: object) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payload }));
    }
  };
  const mapPicker = initMultiplayerMapPicker(mapId => {
    if (currentRole !== 'host') return;
    pendingPreparationMapId = '';
    sendControl({ type: 'set-map', mapId });
  });

  const renderScoresInto = (container: HTMLElement, snapshot: RoomSnapshot) => {
    const players = snapshot.players.filter(player => player.playing);
    container.replaceChildren();
    container.hidden = !snapshot.round || players.length === 0;
    if (container.hidden) return;
    const sorted = [...players].sort((left, right) => right.score - left.score || right.combo - left.combo);
    if (snapshot.mode === 'coop') {
      const team = document.createElement('div');
      team.className = 'mp-score-row is-team';
      const label = document.createElement('span');
      label.textContent = t('multiplayer.teamScore');
      const value = document.createElement('strong');
      value.textContent = sorted.reduce((total, player) => total + player.score, 0).toLocaleString();
      team.append(label, value);
      container.append(team);
    }
    for (const player of sorted) {
      const row = document.createElement('div');
      row.className = 'mp-score-row';
      const name = document.createElement('span');
      name.textContent = player.name;
      const value = document.createElement('strong');
      value.textContent = player.score.toLocaleString();
      row.append(name, value);
      container.append(row);
    }
  };

  const renderScores = (snapshot: RoomSnapshot) => {
    renderScoresInto(lobbyScores, snapshot);
    renderScoresInto(hudScores, snapshot);
  };

  const announceRoundStarted = (snapshot: RoomSnapshot) => {
    const self = snapshot.players.find(player => player.id === currentPlayerId);
    if (!snapshot.round || snapshot.round.finishedAt !== null || !self?.playing || snapshot.round.id <= announcedRoundId) {
      return;
    }
    announcedRoundId = snapshot.round.id;
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-start', {
      detail: {
        ...snapshot.round,
        mode: snapshot.mode,
        rules: { ...snapshot.rules },
        saber: self.saber,
        startAtPerformance: serverTimeToPerformance(snapshot.round.startAt),
      },
    }));
  };

  const renderRoom = (snapshot: RoomSnapshot) => {
    if (currentRoom && snapshot.revision < currentRoom.revision) return;
    currentRoom = snapshot;
    remoteTracking.retainStreams(new Set(snapshot.players.map(player => player.streamId)));
    window.dispatchEvent(new CustomEvent('hand-sabers:room-state', { detail: snapshot }));
    lobby.hidden = false;
    lobbyCode.textContent = snapshot.code;
    playerCount.textContent = `${snapshot.players.length} / ${snapshot.maxPlayers}`;
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
      if (snapshot.mode === 'coop') {
        const saber = document.createElement('span');
        saber.className = 'mp-player-role';
        saber.textContent = t(`multiplayer.${player.saber}Saber`);
        identity.append(saber);
      }
      const state = document.createElement('span');
      state.className = 'mp-player-state';
      if (snapshot.round && !player.playing) {
        state.textContent = t('multiplayer.spectatorState');
      } else if (player.ready) {
        state.textContent = t('multiplayer.calibratedState');
      } else if (player.id === currentPlayerId && pendingPreparationMapId) {
        state.textContent = t('multiplayer.calibratingState');
      } else {
        state.textContent = t('multiplayer.waitingCalibrationState');
      }
      row.append(identity, state);
      playerList.append(row);
    }

    mapPicker.setSelected(snapshot.mapId);
    mapPicker.setEnabled(currentRole === 'host' && !Boolean(snapshot.round && snapshot.round.finishedAt === null));
    modeSelect.value = snapshot.mode;
    modeSelect.disabled = currentRole !== 'host' || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    trainingModeInput.checked = snapshot.rules.trainingMode;
    noFailInput.checked = snapshot.rules.noFail;
    rulesPanel.disabled = currentRole !== 'host' || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    const self = snapshot.players.find(player => player.id === currentPlayerId);
    readyButton.disabled = !snapshot.mapId || !self || Boolean(pendingPreparationMapId);
    readyButton.classList.toggle('is-ready', Boolean(self?.ready));
    readyButton.textContent = pendingPreparationMapId
      ? t('multiplayer.preparing')
      : self?.ready ? t('multiplayer.notReady') : t('multiplayer.ready');
    startButton.hidden = currentRole !== 'host';
    startButton.disabled = !snapshot.mapId
      || snapshot.players.length === 0
      || (snapshot.mode === 'coop' && snapshot.players.length !== snapshot.maxPlayers)
      || snapshot.players.some(player => !player.ready)
      || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    renderScores(snapshot);
  };

  async function loadMaps(): Promise<void> {
    try {
      await mapPicker.load();
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
    resetChat();
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
          chatInput.disabled = false;
          chatSend.disabled = false;
          status.textContent = t('multiplayer.connected');
          setBusy(false);
          const snapshot = parseRoomSnapshot(incoming.room);
          if (snapshot) renderRoom(snapshot);
          else showMessage(t('multiplayer.invalidResponse'));
          void loadMaps();
        } else if (incoming.type === 'room') {
          const snapshot = parseRoomSnapshot(incoming.room);
          if (snapshot) renderRoom(snapshot);
        } else if (incoming.type === 'round-started') {
          const snapshot = parseRoomSnapshot(incoming.room);
          if (snapshot) {
            renderRoom(snapshot);
            announceRoundStarted(snapshot);
          }
        } else if (incoming.type === 'score') {
          const player = parseRoomPlayer(incoming.player);
          const playerIndex = currentRoom?.players.findIndex(candidate => candidate.id === player?.id) ?? -1;
          if (player && currentRoom && playerIndex >= 0) {
            currentRoom.players[playerIndex] = player;
            renderScores(currentRoom);
            window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-score', { detail: player }));
          }
        } else if (incoming.type === 'chat') {
          const chatMessage = parseChatMessage(incoming.message);
          if (chatMessage) appendChatMessage(chatMessage);
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
      socket = null;
      resetRoomView();
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
      connect(created.room.code, created.hostToken, getPlayerName());
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
      connect(credential.code, credential.joinToken, getPlayerName());
    } catch (error) {
      setBusy(false);
      showMessage(requestErrorMessage(error));
    }
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '').slice(0, 6);
  });
  nameInput.addEventListener('change', getPlayerName);
  nameInput.addEventListener('blur', getPlayerName);
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
  disconnectButton.addEventListener('click', disconnectRoom);
  modeSelect.addEventListener('change', () => {
    if (currentRole !== 'host' || !['coop', 'score-attack'].includes(modeSelect.value)) return;
    if (modeSelect.value === 'coop' && (currentRoom?.players.length ?? 0) > 2) {
      modeSelect.value = currentRoom?.mode ?? 'score-attack';
      showMessage(translateServerError('ROOM_FULL'));
      return;
    }
    pendingPreparationMapId = '';
    sendControl({ type: 'set-mode', mode: modeSelect.value });
  });
  chatForm.addEventListener('submit', event => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !currentPlayerId) return;
    sendControl({ type: 'chat', text });
    chatInput.value = '';
  });
  const sendRules = () => {
    if (currentRole !== 'host') return;
    sendControl({
      type: 'set-rules',
      trainingMode: trainingModeInput.checked,
      noFail: noFailInput.checked,
    });
  };
  trainingModeInput.addEventListener('change', sendRules);
  noFailInput.addEventListener('change', sendRules);
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
  window.addEventListener('hand-sabers:multiplayer-leave', disconnectRoom);

  const fragment = new URLSearchParams(location.hash.slice(1));
  const linkedCode = fragment.get('room');
  const linkedToken = fragment.get('token');
  if (linkedCode && linkedToken) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    open();
    share.hidden = true;
    connect(linkedCode, linkedToken, getPlayerName());
  }
}
