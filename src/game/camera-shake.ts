import type { Camera } from 'three';

const SHAKE_DECAY = 0.88;
let shakeIntensity = 0;

export function triggerCameraShake(intensity = 0.06): void {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

export function applyCameraShake(camera: Camera, deltaScale = 1): void {
  if (shakeIntensity < 0.001) {
    shakeIntensity = 0;
    return;
  }
  const scale = Math.max(0, Math.min(deltaScale, 3));
  if (scale <= 0) return;
  const impulseScale = Math.sqrt(scale);
  camera.position.x += (Math.random() - 0.5) * shakeIntensity * impulseScale;
  camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.5 * impulseScale;
  shakeIntensity *= Math.pow(SHAKE_DECAY, scale);
}
