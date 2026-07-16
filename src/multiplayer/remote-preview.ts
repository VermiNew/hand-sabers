import type { RemoteLandmarkPacket, RemoteRealtimePacket } from './realtime.ts';

interface RoomStatePlayer {
  streamId: number;
  name: string;
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

const playerNames = new Map<number, string>();
const previews = new Map<number, HTMLElement>();

function updateOverlayVisibility(): void {
  const overlay = document.getElementById('multiplayerCameras');
  if (overlay) overlay.hidden = document.body.classList.contains('dev-tools') || previews.size === 0;
}

function drawHand(
  context: CanvasRenderingContext2D,
  landmarks: Float32Array,
  width: number,
  height: number,
): void {
  context.strokeStyle = 'rgba(54, 242, 161, 0.82)';
  context.fillStyle = 'rgba(126, 255, 207, 0.95)';
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

function previewFor(streamId: number): { element: HTMLElement; canvas: HTMLCanvasElement } | null {
  const container = getContainer();
  const name = playerNames.get(streamId);
  if (!container || !name) return null;
  let element = previews.get(streamId);
  if (!element) {
    element = document.createElement('div');
    element.className = 'cam-box remote-ml-preview';
    element.dataset['streamId'] = String(streamId);
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
  const label = element.querySelector<HTMLElement>('.cam-tag');
  if (label) label.textContent = document.body.classList.contains('dev-tools') ? `ML · ${name}` : name;
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
  if (packet.left) drawHand(context, packet.left, width, height);
  if (packet.right) drawHand(context, packet.right, width, height);
}

function updatePlayers(detail: RoomStateDetail | null): void {
  playerNames.clear();
  for (const player of detail?.players ?? []) {
    if (Number.isSafeInteger(player.streamId) && player.streamId > 0) {
      playerNames.set(player.streamId, player.name.slice(0, 32));
    }
  }
  for (const [streamId, preview] of previews) {
    const name = playerNames.get(streamId);
    if (!name) {
      preview.remove();
      previews.delete(streamId);
      continue;
    }
    const label = preview.querySelector<HTMLElement>('.cam-tag');
    if (label) {
      label.textContent = document.body.classList.contains('dev-tools') ? `ML · ${name}` : name;
    }
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
