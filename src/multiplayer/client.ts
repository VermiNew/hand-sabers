import { t } from '../i18n/index.ts';
import { setSetting } from '../core/settings.ts';
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
  player?: unknown;
  sentAt?: unknown;
  serverTime?: unknown;
}

interface RoomPlayer {
  id: string;
  streamId: number;
  name: string;
  role: 'host' | 'guest';
  saberAssignment: 'left' | 'right' | 'both';
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
  maxPlayers: number;
  round: { id: number; mapId: string; startAt: number; finishedAt: number | null } | null;
  players: RoomPlayer[];
}

interface MapListItem {
  id: string;
  meta?: {
    title?: string;
    artist?: string;
    difficulty?: string;
    duration?: number;
    bpm?: number;
  };
  beats?: unknown[];
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
let availableMaps: MapListItem[] = [];

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

function saberAssignmentLabel(assignment: RoomPlayer['saberAssignment']): string {
  if (assignment === 'left') return t('multiplayer.leftSaber');
  if (assignment === 'right') return t('multiplayer.rightSaber');
  return t('settings.gameplay.both');
}

function pickedMapLabel(mapId: string | null): string {
  if (!mapId) return t('multiplayer.selectMap');
  const map = availableMaps.find(candidate => candidate.id === mapId);
  return map ? mapTitle(map) : mapId;
}

function mapTitle(map: MapListItem): string {
  return map.meta?.title || map.id;
}

function mapMetaLabel(map: MapListItem): string {
  const parts = [
    map.meta?.artist,
    map.meta?.difficulty,
    Number.isFinite(map.meta?.bpm) ? `${Math.round(Number(map.meta?.bpm))} BPM` : '',
    Array.isArray(map.beats) ? `${map.beats.length} ${t('multiplayer.beats')}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || map.id;
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
    || (player['saberAssignment'] !== 'left' && player['saberAssignment'] !== 'right' && player['saberAssignment'] !== 'both')
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
    saberAssignment: player['saberAssignment'],
    ready: player['ready'],
    score: player['score'] as number,
    combo: player['combo'] as number,
    lives: player['lives'] as number,
    progress: player['progress'],
    finished: player['finished'],
    playing: player['playing'],
  };
}

function parseRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate['code'] !== 'string'
    || !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(candidate['code'])
    || !Number.isSafeInteger(candidate['revision'])
    || Number(candidate['revision']) < 0
    || !Number.isSafeInteger(candidate['maxPlayers'])
    || Number(candidate['maxPlayers']) < 1
    || Number(candidate['maxPlayers']) > 8
    || !Array.isArray(candidate['players'])
    || candidate['players'].length > 8
    || (candidate['mode'] !== 'coop' && candidate['mode'] !== 'score-attack')
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
    players.push(player);
  }
  return {
    code: candidate['code'],
    revision: candidate['revision'] as number,
    mapId: candidate['mapId'] as string | null,
    mode: candidate['mode'],
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
  const mapSelect = element<HTMLSelectElement>('multiplayerMap');
  const mapSummary = element<HTMLElement>('multiplayerMapSummary');
  const pickMapButton = element<HTMLButtonElement>('multiplayerPickMap');
  const mapPicker = element<HTMLElement>('multiplayerMapPicker');
  const mapPickerClose = element<HTMLButtonElement>('multiplayerMapPickerClose');
  const mapPickerList = element<HTMLElement>('multiplayerMapPickerList');
  const modeSelect = element<HTMLSelectElement>('multiplayerMode');
  const saberField = element<HTMLElement>('multiplayerSaberField');
  const saberSelect = element<HTMLSelectElement>('multiplayerSaberAssignment');
  const readyButton = element<HTMLButtonElement>('multiplayerReady');
  const startButton = element<HTMLButtonElement>('multiplayerStart');
  const disconnectButton = element<HTMLButtonElement>('multiplayerDisconnect');
  const lobbyScores = element<HTMLElement>('multiplayerLobbyScores');
  const hudScores = element<HTMLElement>('multiplayerHudScores');

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
    mapSelect.value = '';
    mapSelect.disabled = true;
    mapSummary.textContent = '—';
    pickMapButton.disabled = true;
    mapPicker.hidden = true;
    mapPickerList.replaceChildren();
    modeSelect.disabled = true;
    saberField.hidden = true;
    saberSelect.disabled = true;
    saberSelect.value = 'left';
    readyButton.disabled = true;
    readyButton.classList.remove('is-ready');
    readyButton.textContent = t('multiplayer.ready');
    startButton.hidden = true;
    copyButton.textContent = t('multiplayer.copyLink');
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

  const renderMapPicker = () => {
    mapPickerList.replaceChildren();
    if (!availableMaps.length) {
      const empty = document.createElement('div');
      empty.className = 'mp-map-picker-empty';
      empty.textContent = t('multiplayer.noMaps');
      mapPickerList.append(empty);
      return;
    }
    for (const map of availableMaps) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mp-map-option${currentRoom?.mapId === map.id ? ' is-selected' : ''}`;
      const title = document.createElement('span');
      title.className = 'mp-map-option-title';
      title.textContent = mapTitle(map);
      const meta = document.createElement('span');
      meta.className = 'mp-map-option-meta';
      meta.textContent = mapMetaLabel(map);
      button.append(title, meta);
      button.addEventListener('click', () => {
        if (currentRole !== 'host') return;
        pendingPreparationMapId = '';
        sendControl({ type: 'set-map', mapId: map.id });
        mapPicker.hidden = true;
      });
      mapPickerList.append(button);
    }
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
        saberAssignment: snapshot.mode === 'coop' ? self.saberAssignment : 'both',
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
        saber.className = 'mp-player-role mp-player-saber';
        saber.textContent = saberAssignmentLabel(player.saberAssignment);
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

    if (snapshot.mapId && ![...mapSelect.options].some(option => option.value === snapshot.mapId)) {
      mapSelect.add(new Option(snapshot.mapId, snapshot.mapId));
    }
    mapSelect.value = snapshot.mapId ?? '';
    mapSummary.textContent = pickedMapLabel(snapshot.mapId);
    mapSelect.disabled = currentRole !== 'host';
    pickMapButton.disabled = currentRole !== 'host' || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    if (!mapPicker.hidden) renderMapPicker();
    modeSelect.value = snapshot.mode;
    modeSelect.disabled = currentRole !== 'host' || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    const self = snapshot.players.find(player => player.id === currentPlayerId);
    saberField.hidden = snapshot.mode !== 'coop' || !self;
    saberSelect.disabled = snapshot.mode !== 'coop' || !self || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    if (self?.saberAssignment === 'left' || self?.saberAssignment === 'right') saberSelect.value = self.saberAssignment;
    readyButton.disabled = !snapshot.mapId || !self || Boolean(pendingPreparationMapId);
    readyButton.classList.toggle('is-ready', Boolean(self?.ready));
    readyButton.textContent = pendingPreparationMapId
      ? t('multiplayer.preparing')
      : self?.ready ? t('multiplayer.notReady') : t('multiplayer.ready');
    startButton.hidden = currentRole !== 'host';
    startButton.disabled = !snapshot.mapId
      || snapshot.players.length === 0
      || snapshot.players.some(player => !player.ready)
      || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    renderScores(snapshot);
  };

  async function loadMaps(): Promise<void> {
    try {
      const response = await fetch('/api/maps');
      const maps = await responseJson<unknown>(response);
      if (!Array.isArray(maps)) throw new Error(t('multiplayer.invalidResponse'));
      const selected = currentRoom?.mapId ?? '';
      mapSelect.replaceChildren(new Option(t('multiplayer.selectMap'), ''));
      availableMaps = await Promise.all(maps.map(async value => {
        const map = value as Partial<MapListItem> | null;
        if (typeof map?.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(map.id)) return null;
        try {
          const detailResponse = await fetch(`/api/maps/${encodeURIComponent(map.id)}`);
          if (!detailResponse.ok) throw new Error('MAP_DETAIL_FAILED');
          const detail = await responseJson<MapListItem>(detailResponse);
          return { ...detail, id: map.id };
        } catch {
          return { id: map.id };
        }
      })).then(items => items.filter((item): item is MapListItem => Boolean(item)));
      for (const map of availableMaps) mapSelect.add(new Option(mapTitle(map), map.id));
      mapSelect.value = selected;
      mapSummary.textContent = pickedMapLabel(currentRoom?.mapId ?? null);
      renderMapPicker();
    } catch (error) {
      availableMaps = [];
      renderMapPicker();
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
  mapPickerClose.addEventListener('click', () => {
    mapPicker.hidden = true;
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
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare', {
      detail: {
        mapId,
        saberAssignment: currentRoom?.mode === 'coop' ? self?.saberAssignment : 'both',
      },
    }));
  });
  startButton.addEventListener('click', () => sendControl({ type: 'start-game' }));
  disconnectButton.addEventListener('click', disconnectRoom);
  pickMapButton.addEventListener('click', () => {
    if (currentRole !== 'host') return;
    mapPicker.hidden = !mapPicker.hidden;
    if (!mapPicker.hidden) {
      renderMapPicker();
      if (!availableMaps.length) void loadMaps();
    }
  });
  mapSelect.addEventListener('change', () => {
    if (currentRole !== 'host' || !mapSelect.value) return;
    pendingPreparationMapId = '';
    sendControl({ type: 'set-map', mapId: mapSelect.value });
  });
  modeSelect.addEventListener('change', () => {
    if (currentRole !== 'host' || !['coop', 'score-attack'].includes(modeSelect.value)) return;
    pendingPreparationMapId = '';
    sendControl({ type: 'set-mode', mode: modeSelect.value });
  });
  saberSelect.addEventListener('change', () => {
    if (currentRoom?.mode !== 'coop' || !['left', 'right'].includes(saberSelect.value)) return;
    pendingPreparationMapId = '';
    sendControl({ type: 'set-saber-assignment', saberAssignment: saberSelect.value });
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
