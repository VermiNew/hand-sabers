import type { RemoteLandmarkPacket, RemoteRealtimePacket } from './realtime.ts';
import { avatarIcon } from './avatars.ts';
import { sanitizeProfileColor } from '../core/profile-color.ts';
import { isVoicePlayerSpeaking } from './voice-speaking.ts';

interface RoomStatePlayer {
  id: string;
  streamId: number;
  name: string;
  avatar: string;
  color?: unknown;
}

interface RoomStateDetail {
  players: RoomStatePlayer[];
}

const HAND_CONNECTIONS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

interface PlayerInfo {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

const playerInfo = new Map<number, PlayerInfo>();
const previews = new Map<number, HTMLElement>();
const previewTimers = new Map<number, number>();
const PREVIEW_STALE_MS = 1_000;

function updateOverlayVisibility(): void {
  const overlay = document.getElementById('multiplayerCameras');
  if (overlay) overlay.hidden = document.body.classList.contains('dev-tools') || previews.size === 0;
}

function drawHand(
  context: CanvasRenderingContext2D,
  landmarks: Float32Array,
  width: number,
  height: number,
  color: string,
): void {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.5;
  for (const [from, to] of HAND_CONNECTIONS) {
    const fromOffset = from * 3;
    const toOffset = to * 3;
    context.beginPath();
    context.moveTo((1 - landmarks[fromOffset]!) * width, landmarks[fromOffset + 1]! * height);
    context.lineTo((1 - landmarks[toOffset]!) * width, landmarks[toOffset + 1]! * height);
    context.stroke();
  }
  for (let index = 0; index < 21; index++) {
    const offset = index * 3;
    context.beginPath();
    context.arc((1 - landmarks[offset]!) * width, landmarks[offset + 1]! * height, 2.2, 0, Math.PI * 2);
    context.fill();
  }
}

/** In dev mode attach to the existing cam panel; otherwise use the gameplay overlay. */
function getContainer(): HTMLElement | null {
  if (document.body.classList.contains('dev-tools')) {
    return document.querySelector<HTMLElement>('#camPanel .cam-feeds');
  }
  return document.getElementById('multiplayerCameras');
}

function renderPlayerLabel(label: HTMLElement, info: PlayerInfo): void {
  const icon = document.createElement('span');
  icon.className = 'material-symbols-rounded';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.fontSize = '12px';
  icon.style.verticalAlign = 'middle';
  icon.style.marginRight = '2px';
  icon.textContent = avatarIcon(info.avatar);

  const name = document.body.classList.contains('dev-tools') ? `ML · ${info.name}` : info.name;
  label.style.color = info.color;
  label.replaceChildren(icon, document.createTextNode(name));
}

function previewFor(streamId: number): { element: HTMLElement; canvas: HTMLCanvasElement } | null {
  const container = getContainer();
  const info = playerInfo.get(streamId);
  if (!container || !info) return null;
  let element = previews.get(streamId);
  if (!element) {
    element = document.createElement('div');
    element.className = 'cam-box remote-ml-preview';
    element.dataset['streamId'] = String(streamId);
    element.dataset['voicePlayerId'] = info.id;
    element.classList.toggle('is-voice-speaking', isVoicePlayerSpeaking(info.id));
    const label = document.createElement('span');
    label.className = 'cam-tag ml';
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 260;
    element.append(label, canvas);
    container.append(element);
    previews.set(streamId, element);
  }
  if (element.parentElement !== container) container.append(element);
  element.dataset['voicePlayerId'] = info.id;
  element.classList.toggle('is-voice-speaking', isVoicePlayerSpeaking(info.id));
  const label = element.querySelector<HTMLElement>('.cam-tag');
  if (label) renderPlayerLabel(label, info);
  updateOverlayVisibility();
  const canvas = element.querySelector<HTMLCanvasElement>('canvas');
  return canvas ? { element, canvas } : null;
}

function renderLandmarks(packet: RemoteLandmarkPacket): void {
  const preview = previewFor(packet.streamId);
  const context = preview?.canvas.getContext('2d');
  if (!preview || !context) return;
  const { width, height } = preview.canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#03060f';
  context.fillRect(0, 0, width, height);
  preview.element.classList.remove('is-stale');
  const previousTimer = previewTimers.get(packet.streamId);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  previewTimers.set(packet.streamId, window.setTimeout(() => {
    previewTimers.delete(packet.streamId);
    const current = previews.get(packet.streamId);
    const currentCanvas = current?.querySelector<HTMLCanvasElement>('canvas');
    const currentContext = currentCanvas?.getContext('2d');
    if (currentCanvas && currentContext) {
      currentContext.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
      currentContext.fillStyle = '#03060f';
      currentContext.fillRect(0, 0, currentCanvas.width, currentCanvas.height);
    }
    current?.classList.add('is-stale');
  }, PREVIEW_STALE_MS));
  const color = playerInfo.get(packet.streamId)?.color;
  if (!color) return;
  if (packet.left) drawHand(context, packet.left, width, height, color);
  if (packet.right) drawHand(context, packet.right, width, height, color);
}

function updatePlayers(detail: RoomStateDetail | null): void {
  playerInfo.clear();
  for (const player of detail?.players ?? []) {
    if (Number.isSafeInteger(player.streamId) && player.streamId > 0) {
      playerInfo.set(player.streamId, {
        id: player.id,
        name: player.name.slice(0, 32),
        avatar: player.avatar ?? 'default',
        color: sanitizeProfileColor(player.color),
      });
    }
  }
  for (const [streamId, preview] of previews) {
    const info = playerInfo.get(streamId);
    if (!info) {
      const timer = previewTimers.get(streamId);
      if (timer !== undefined) window.clearTimeout(timer);
      previewTimers.delete(streamId);
      preview.remove();
      previews.delete(streamId);
      continue;
    }
    const label = preview.querySelector<HTMLElement>('.cam-tag');
    if (label) renderPlayerLabel(label, info);
  }
  // Show the gameplay overlay only when there are remote players and not in dev mode
  updateOverlayVisibility();
}

export function initRemoteTrackingPreviews(): void {
  window.addEventListener('hand-sabers:room-state', event => {
    const detail = (event as CustomEvent<RoomStateDetail | null>).detail;
    updatePlayers(detail);
  });
  window.addEventListener('hand-sabers:realtime-packet', event => {
    const packet = (event as CustomEvent<RemoteRealtimePacket>).detail;
    if (packet?.kind === 'landmarks') renderLandmarks(packet);
  });
}
