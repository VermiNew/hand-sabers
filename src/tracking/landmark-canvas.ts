import type { DetectResult } from './realtime.ts';

export const HAND_CONNECTIONS: readonly [number, number][] = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]);

export function drawHandLandmarks(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  result: DetectResult,
  video: HTMLVideoElement | null,
): void {
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  if (video && video.readyState >= 2) {
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    context.restore();
  } else {
    context.fillStyle = 'rgba(5,7,13,0.9)';
    context.fillRect(0, 0, width, height);
  }

  if (!result?.landmarks) return;
  for (const hand of result.landmarks) {
    context.strokeStyle = 'rgba(47,124,255,0.85)';
    context.lineWidth = 1.5;
    for (const [start, end] of HAND_CONNECTIONS) {
      const startPoint = hand[start]!;
      const endPoint = hand[end]!;
      context.beginPath();
      context.moveTo((1 - startPoint.x) * width, startPoint.y * height);
      context.lineTo((1 - endPoint.x) * width, endPoint.y * height);
      context.stroke();
    }
    for (const landmark of hand) {
      context.fillStyle = '#7eb8ff';
      context.beginPath();
      context.arc((1 - landmark.x) * width, landmark.y * height, 3, 0, Math.PI * 2);
      context.fill();
    }
  }
}
