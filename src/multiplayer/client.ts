import { t } from '../i18n/index.ts';
import { setSetting, getSettings } from '../core/settings.ts';
import { decodeRealtimePacket } from './realtime.ts';
import { remoteTracking } from './remote-state.ts';
import { initMultiplayerMapPicker } from './map-picker.ts';
import { PROTOCOL_VERSION, parseChatMessage, parseRoomPlayer, parseRoomSnapshot, parseVoiceSignal } from './protocol.ts';
import type { CreateRoomResponse, JoinCodeResponse, RoomSnapshot, ServerMessage } from './protocol.ts';
import {
  copyText,
  element,
  normalizePlayerName,
  requestErrorMessage,
  responseJson,
  translateServerError,
  websocketUrl,
} from './client-utils.ts';
import { recordClockPong, resetClockSync, serverTimeToPerformance } from './clock-sync.ts';
import { createMultiplayerChatView } from './chat-view.ts';
import { renderMultiplayerScores } from './score-view.ts';
import { renderRoomPlayerList } from './room-player-list.ts';
import { createModalTransition, type ModalTransitionController } from '../ui/modal-transition.ts';
import { createVoiceChat, type VoiceChatController } from './voice-chat.ts';
import { clearVoiceSpeaking, setVoicePlayerSpeaking } from './voice-speaking.ts';

export { PROTOCOL_VERSION } from './protocol.ts';
export { serverTimeToPerformance } from './clock-sync.ts';

let socket: WebSocket | null = null;
let activeJoinUrl = '';
let activeRoomCode = '';
let currentPlayerId = '';
let currentRole: 'host' | 'guest' | null = null;
let currentRoom: RoomSnapshot | null = null;
let pendingPreparationMapId = '';
let announcedRoundId = 0;
let lastFinishedRoundId = 0;
let multiplayerModal: ModalTransitionController | null = null;
const PREPARATION_TIMEOUT_MS = 45_000;
const MODERATION_ID_STORAGE_KEY = 'hand-sabers.multiplayer-moderation-id.v1';

function getModerationId(): string {
  try {
    const stored = localStorage.getItem(MODERATION_ID_STORAGE_KEY);
    if (stored && /^[a-f0-9]{32}$/.test(stored)) return stored;
  } catch {}
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(MODERATION_ID_STORAGE_KEY, id);
  } catch {}
  return id;
}

function trySocketSend(target: WebSocket | null, payload: string | ArrayBuffer, context: string): boolean {
  if (target?.readyState !== WebSocket.OPEN) return false;
  try {
    target.send(payload);
    return true;
  } catch (error) {
    console.error(`[multiplayer:${context}]`, error);
    return false;
  }
}

export function canSendRealtime(): boolean {
  return Boolean(currentPlayerId) && socket?.readyState === WebSocket.OPEN;
}

export function getCurrentPlayerId(): string {
  return currentPlayerId;
}

export function sendRealtimePacket(packet: ArrayBuffer): boolean {
  const activeSocket = socket;
  if (
    !currentPlayerId
    || activeSocket?.readyState !== WebSocket.OPEN
    || (packet.byteLength !== 96 && packet.byteLength !== 528)
  ) return false;
  return trySocketSend(activeSocket, packet, 'realtime-send');
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
  return trySocketSend(
    activeSocket,
    JSON.stringify({ v: PROTOCOL_VERSION, type: 'score', ...payload }),
    'score-send',
  );
}

export function showMultiplayerOverlay(returnFocusTo?: HTMLElement | null): void {
  multiplayerModal?.open({ returnFocusTo });
}

export function hideMultiplayerOverlay(): void {
  multiplayerModal?.close();
}

export function initMultiplayerOverlay(defaultPlayerName: string): void {
  const overlay = element<HTMLElement>('multiplayerOverlay');
  const panel = overlay.querySelector<HTMLElement>('.mp-panel');
  const openButton = element<HTMLButtonElement>('mainMultiplayer');
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
  const copyCodeButton = element<HTMLButtonElement>('multiplayerCopyCode');
  const lobby = element<HTMLElement>('multiplayerLobby');
  const lobbyCode = element<HTMLElement>('multiplayerLobbyCode');
  const playerCount = element<HTMLElement>('multiplayerPlayerCount');
  const playerList = element<HTMLElement>('multiplayerPlayers');
  const waitingCard = element<HTMLElement>('multiplayerWaiting');
  const waitingProgress = element<HTMLProgressElement>('multiplayerWaitingProgress');
  const waitingCount = element<HTMLElement>('multiplayerWaitingCount');
  const waitingLeaveButton = element<HTMLButtonElement>('multiplayerWaitingLeave');
  const modeSelect = element<HTMLSelectElement>('multiplayerMode');
  const rulesPanel = element<HTMLFieldSetElement>('multiplayerRules');
  const trainingModeInput = element<HTMLInputElement>('multiplayerTrainingMode');
  const noFailInput = element<HTMLInputElement>('multiplayerNoFail');
  const gameModeSelect = element<HTMLSelectElement>('multiplayerGameMode');
  const noteSpeedSelect = element<HTMLSelectElement>('multiplayerNoteSpeed');
  const readyButton = element<HTMLButtonElement>('multiplayerReady');
  const startButton = element<HTMLButtonElement>('multiplayerStart');
  const coopHint = element<HTMLElement>('multiplayerCoopHint');
  const disconnectButton = element<HTMLButtonElement>('multiplayerDisconnect');
  const lobbyScores = element<HTMLElement>('multiplayerLobbyScores');
  const hudScores = element<HTMLElement>('multiplayerHudScores');
  const voiceButtons = [
    element<HTMLButtonElement>('multiplayerVoiceToggle'),
    element<HTMLButtonElement>('multiplayerGameVoiceToggle'),
  ];
  const copyFeedbackTimers = new Map<HTMLButtonElement, number>();
  let voiceChat: VoiceChatController | null = null;
  let voiceState: 'off' | 'starting' | 'on' | 'error' = 'off';
  let voiceErrorVisible = false;
  let preparationTimeout: number | null = null;
  multiplayerModal = createModalTransition({ overlay, panel });

  const clearPreparationTimeout = () => {
    if (preparationTimeout !== null) window.clearTimeout(preparationTimeout);
    preparationTimeout = null;
  };

  const secureHostingWarning = document.createElement('aside');
  secureHostingWarning.className = 'mp-network-warning';
  secureHostingWarning.classList.toggle(
    'is-insecure',
    location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname),
  );
  secureHostingWarning.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">https</span><p></p>';
  secureHostingWarning.querySelector('p')!.textContent = t('multiplayer.secureHostingWarning');
  setup.prepend(secureHostingWarning);

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
    showMessage();
    multiplayerModal?.open({ initialFocus: nameInput, returnFocusTo: openButton });
  };
  const showRoom = () => {
    setup.hidden = true;
    room.hidden = false;
    status.textContent = t('multiplayer.connecting');
  };
  const resetRoomView = () => {
    voiceChat?.setRoom(null);
    clearVoiceSpeaking();
    currentPlayerId = '';
    currentRole = null;
    currentRoom = null;
    pendingPreparationMapId = '';
    clearPreparationTimeout();
    announcedRoundId = 0;
    lastFinishedRoundId = 0;
    activeJoinUrl = '';
    activeRoomCode = '';
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
    waitingCard.hidden = true;
    waitingProgress.max = 1;
    waitingProgress.value = 0;
    waitingCount.textContent = '0 / 0';
    mapPicker.setSelected(null);
    mapPicker.setEnabled(false);
    modeSelect.disabled = true;
    rulesPanel.disabled = true;
    trainingModeInput.checked = false;
    noFailInput.checked = false;
    gameModeSelect.value = 'normal';
    noteSpeedSelect.value = '1';
    readyButton.disabled = true;
    readyButton.classList.remove('is-ready');
    readyButton.textContent = t('multiplayer.ready');
    startButton.hidden = true;
    coopHint.hidden = true;
    copyButton.textContent = t('multiplayer.copyLink');
    copyCodeButton.textContent = t('multiplayer.copyCode');
    for (const timer of copyFeedbackTimers.values()) window.clearTimeout(timer);
    copyFeedbackTimers.clear();
    chatView.reset();
    renderVoiceControls('off');
  };
  const disconnectRoom = () => {
    if (pendingPreparationMapId) {
      pendingPreparationMapId = '';
      clearPreparationTimeout();
      window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-cancel'));
    }
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
    if (!trySocketSend(socket, JSON.stringify({ v: PROTOCOL_VERSION, ...payload }), 'control-send')) {
      showMessage(t('multiplayer.connectionError'));
    }
  };
  const renderVoiceControls = (state: typeof voiceState) => {
    voiceState = state;
    const labelKey = state === 'on'
      ? 'multiplayer.voiceDisable'
      : state === 'starting'
        ? 'multiplayer.voiceStarting'
        : state === 'error'
          ? 'multiplayer.voiceRetry'
          : 'multiplayer.voiceEnable';
    for (const button of voiceButtons) {
      button.disabled = !currentPlayerId || state === 'starting';
      button.dataset['state'] = state;
      button.setAttribute('aria-pressed', String(state === 'on'));
      const icon = button.querySelector<HTMLElement>('.material-symbols-rounded');
      const label = button.querySelector<HTMLElement>('[data-i18n]');
      if (icon) icon.textContent = state === 'on' ? 'mic' : state === 'starting' ? 'hourglass_top' : 'mic_off';
      if (label) label.textContent = t(labelKey);
    }
    if (state === 'error') {
      showMessage(t('multiplayer.voicePermissionError'));
      voiceErrorVisible = true;
    } else if (voiceErrorVisible) {
      if (message.textContent === t('multiplayer.voicePermissionError')) showMessage();
      voiceErrorVisible = false;
    }
  };
  voiceChat = createVoiceChat({
    getCurrentPlayerId: () => currentPlayerId,
    sendSignal: (targetPlayerId, signal) => trySocketSend(
      socket,
      JSON.stringify({ v: PROTOCOL_VERSION, type: 'voice-signal', targetPlayerId, signal }),
      'voice-signal',
    ),
    onStateChange: renderVoiceControls,
    onSpeakingChange: setVoicePlayerSpeaking,
  });
  const chatView = createMultiplayerChatView({
    canSend: () => Boolean(currentPlayerId),
    getCurrentPlayerId: () => currentPlayerId,
    onSend: text => sendControl({ type: 'chat', text }),
  });
  const mapPicker = initMultiplayerMapPicker(mapId => {
    if (currentRole !== 'host') return;
    if (pendingPreparationMapId) {
      window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-cancel'));
    }
    pendingPreparationMapId = '';
    clearPreparationTimeout();
    sendControl({ type: 'set-map', mapId });
  });

  const renderScores = (snapshot: RoomSnapshot) => {
    renderMultiplayerScores([lobbyScores, hudScores], snapshot);
  };

  const renderWaitingState = (snapshot: RoomSnapshot) => {
    const readyPlayers = snapshot.players.filter(player => player.ready).length;
    waitingCard.hidden = !pendingPreparationMapId && readyPlayers === 0;
    waitingProgress.max = Math.max(1, snapshot.players.length);
    waitingProgress.value = readyPlayers;
    waitingCount.textContent = `${readyPlayers} / ${snapshot.players.length}`;
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

  const announceRoundFinished = (snapshot: RoomSnapshot) => {
    if (!snapshot.round || snapshot.round.finishedAt === null) return;
    if (snapshot.round.id <= lastFinishedRoundId) return;
    lastFinishedRoundId = snapshot.round.id;
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-results', {
      detail: { snapshot },
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
    renderRoomPlayerList(playerList, snapshot, currentPlayerId, pendingPreparationMapId);
    voiceChat?.setRoom(snapshot);
    renderVoiceControls(voiceState);

    mapPicker.setSelected(snapshot.mapId);
    mapPicker.setEnabled(currentRole === 'host' && !Boolean(snapshot.round && snapshot.round.finishedAt === null));
    modeSelect.value = snapshot.mode;
    modeSelect.disabled = currentRole !== 'host' || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    trainingModeInput.checked = snapshot.rules.trainingMode;
    noFailInput.checked = snapshot.rules.noFail;
    gameModeSelect.value = snapshot.rules.gameMode;
    noteSpeedSelect.value = String(snapshot.rules.noteSpeed);
    rulesPanel.disabled = currentRole !== 'host' || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    const self = snapshot.players.find(player => player.id === currentPlayerId);
    renderWaitingState(snapshot);
    readyButton.disabled = !snapshot.mapId || !self || Boolean(pendingPreparationMapId);
    readyButton.classList.toggle('is-ready', Boolean(self?.ready));
    readyButton.textContent = pendingPreparationMapId
      ? t('multiplayer.preparing')
      : self?.ready ? t('multiplayer.notReady') : t('multiplayer.ready');
    startButton.hidden = currentRole !== 'host';
    coopHint.hidden = currentRole !== 'host' || snapshot.mode !== 'coop' || snapshot.players.length <= snapshot.maxPlayers;
    startButton.disabled = !snapshot.mapId
      || snapshot.players.length === 0
      || (snapshot.mode === 'coop' && snapshot.players.length !== snapshot.maxPlayers)
      || snapshot.players.some(player => !player.ready)
      || Boolean(snapshot.round && snapshot.round.finishedAt === null);
    renderScores(snapshot);
    announceRoundFinished(snapshot);
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
    resetClockSync();
    currentPlayerId = '';
    currentRole = null;
    currentRoom = null;
    pendingPreparationMapId = '';
    announcedRoundId = 0;
    lastFinishedRoundId = 0;
    lobby.hidden = true;
    chatView.reset();
    showRoom();
    const nextSocket = new WebSocket(websocketUrl());
    nextSocket.binaryType = 'arraybuffer';
    socket = nextSocket;
    let clockTimer: ReturnType<typeof setInterval> | null = null;

    const pingClock = () => {
      trySocketSend(
        nextSocket,
        JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', sentAt: Date.now() }),
        'clock-sync',
      );
    };

    nextSocket.addEventListener('open', () => {
      const settings = getSettings();
      const joined = trySocketSend(nextSocket, JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'join',
        code,
        token,
        name,
        avatar: settings.avatar,
        playerColor: settings.playerColor,
        moderationId: getModerationId(),
      }), 'join');
      if (!joined) {
        showMessage(t('multiplayer.connectionError'));
        nextSocket.close(1011, 'Join send failed');
        return;
      }
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
          chatView.setConnected(true);
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
          if (chatMessage) chatView.append(chatMessage);
        } else if (incoming.type === 'voice-signal') {
          const fromPlayerId = typeof incoming.fromPlayerId === 'string' ? incoming.fromPlayerId : '';
          const signal = parseVoiceSignal(incoming.signal);
          if (signal && currentRoom?.players.some(player => player.id === fromPlayerId)) {
            void voiceChat?.handleSignal(fromPlayerId, signal);
          }
        } else if (incoming.type === 'pong') {
          recordClockPong(incoming.sentAt, incoming.serverTime, Date.now());
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

  openButton.addEventListener('click', open);
  element('multiplayerClose').addEventListener('click', hideMultiplayerOverlay);
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) hideMultiplayerOverlay();
  });

  createButton.addEventListener('click', async () => {
    setBusy(true);
    showMessage();
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      const created = await responseJson<CreateRoomResponse>(response);
      if (!created.room?.code || !created.hostToken) throw new Error(t('multiplayer.invalidResponse'));
      activeJoinUrl = created.joinUrl;
      activeRoomCode = created.room.code;
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
  const bindCopyButton = (button: HTMLButtonElement, getValue: () => string, defaultLabel: string, failureMessage: string) => {
    button.addEventListener('click', async () => {
      const value = getValue();
      if (!value) return;
      try {
        await copyText(value);
        button.textContent = t('multiplayer.copied');
        window.clearTimeout(copyFeedbackTimers.get(button));
        copyFeedbackTimers.set(button, window.setTimeout(() => {
          button.textContent = defaultLabel;
          copyFeedbackTimers.delete(button);
        }, 1500));
      } catch {
        showMessage(failureMessage);
      }
    });
  };
  bindCopyButton(copyButton, () => activeJoinUrl, t('multiplayer.copyLink'), t('multiplayer.copyFailed'));
  bindCopyButton(copyCodeButton, () => activeRoomCode, t('multiplayer.copyCode'), t('multiplayer.copyCodeFailed'));
  readyButton.addEventListener('click', () => {
    const self = currentRoom?.players.find(player => player.id === currentPlayerId);
    if (self?.ready) {
      sendControl({ type: 'ready', ready: false });
      return;
    }
    const mapId = currentRoom?.mapId;
    if (!mapId || pendingPreparationMapId) return;
    pendingPreparationMapId = mapId;
    sendControl({ type: 'ready', ready: false });
    readyButton.disabled = true;
    readyButton.textContent = t('multiplayer.preparing');
    if (currentRoom) renderWaitingState(currentRoom);
    clearPreparationTimeout();
    preparationTimeout = window.setTimeout(() => {
      if (pendingPreparationMapId !== mapId) return;
      pendingPreparationMapId = '';
      preparationTimeout = null;
      window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-cancel'));
      sendControl({ type: 'ready', ready: false });
      readyButton.disabled = false;
      readyButton.textContent = t('multiplayer.ready');
      if (currentRoom) renderWaitingState(currentRoom);
      showMessage(t('multiplayer.prepareTimeout'));
    }, PREPARATION_TIMEOUT_MS);
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare', { detail: { mapId } }));
  });
  startButton.addEventListener('click', () => sendControl({ type: 'start-game' }));
  disconnectButton.addEventListener('click', disconnectRoom);
  waitingLeaveButton.addEventListener('click', disconnectRoom);
  for (const button of voiceButtons) {
    button.addEventListener('click', () => {
      if (voiceChat?.isEnabled()) voiceChat.disable();
      else void voiceChat?.enable().catch(() => undefined);
    });
  }
  modeSelect.addEventListener('change', () => {
    if (currentRole !== 'host' || !['coop', 'score-attack'].includes(modeSelect.value)) return;
    if (pendingPreparationMapId) {
      window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-cancel'));
    }
    pendingPreparationMapId = '';
    clearPreparationTimeout();
    sendControl({ type: 'set-mode', mode: modeSelect.value });
  });
  const sendRules = () => {
    if (currentRole !== 'host') return;
    sendControl({
      type: 'set-rules',
      trainingMode: trainingModeInput.checked,
      noFail: noFailInput.checked,
      gameMode: gameModeSelect.value,
      noteSpeed: Number(noteSpeedSelect.value),
    });
  };
  trainingModeInput.addEventListener('change', sendRules);
  noFailInput.addEventListener('change', sendRules);
  gameModeSelect.addEventListener('change', sendRules);
  noteSpeedSelect.addEventListener('change', sendRules);
  window.addEventListener('hand-sabers:multiplayer-preparation-progress', event => {
    const detail = (event as CustomEvent<{
      mapId?: unknown;
      readiness?: { map?: unknown; audio?: unknown; tracking?: unknown };
    }>).detail;
    const readiness = detail?.readiness;
    if (
      detail?.mapId !== pendingPreparationMapId
      || currentRoom?.mapId !== detail.mapId
      || typeof readiness?.map !== 'boolean'
      || typeof readiness.audio !== 'boolean'
      || typeof readiness.tracking !== 'boolean'
    ) return;
    sendControl({ type: 'resource-readiness', readiness });
  });
  window.addEventListener('hand-sabers:multiplayer-prepared', event => {
    const detail = (event as CustomEvent<{
      mapId?: unknown;
      readiness?: { map?: unknown; audio?: unknown; tracking?: unknown };
    }>).detail;
    const mapId = detail?.mapId;
    const readiness = detail?.readiness;
    if (
      typeof mapId !== 'string'
      || mapId !== pendingPreparationMapId
      || currentRoom?.mapId !== mapId
      || readiness?.map !== true
      || readiness.audio !== true
      || readiness.tracking !== true
    ) return;
    pendingPreparationMapId = '';
    clearPreparationTimeout();
    sendControl({ type: 'ready', ready: true, readiness });
  });
  window.addEventListener('hand-sabers:multiplayer-prepare-error', event => {
    if (!pendingPreparationMapId) return;
    pendingPreparationMapId = '';
    clearPreparationTimeout();
    sendControl({ type: 'ready', ready: false });
    readyButton.disabled = false;
    readyButton.textContent = t('multiplayer.ready');
    if (currentRoom) renderWaitingState(currentRoom);
    const code = (event as CustomEvent<{ code?: unknown }>).detail?.code;
    const reasonKey = typeof code === 'string' ? `multiplayer.prepareErrors.${code}` : '';
    const translatedReason = reasonKey ? t(reasonKey) : '';
    const reason = translatedReason && translatedReason !== reasonKey
      ? translatedReason
      : t('multiplayer.prepareErrors.PREPARATION_FAILED');
    showMessage(t('multiplayer.prepareFailedWithReason', { reason }));
  });
  window.addEventListener('hand-sabers:multiplayer-leave', disconnectRoom);

  // Live profile updates — propagate to server when in a room
  window.addEventListener('hand-sabers:profile-updated', event => {
    const detail = (event as CustomEvent<{ playerName: string; avatar: string; playerColor: string }>).detail;
    if (!detail) return;
    nameInput.value = normalizePlayerName(detail.playerName);
    if (currentPlayerId && socket?.readyState === WebSocket.OPEN) {
      sendControl({ type: 'set-profile', name: detail.playerName, avatar: detail.avatar, playerColor: detail.playerColor });
    }
  });

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
