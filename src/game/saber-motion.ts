import { S, state } from '../core/state.ts';
import {
  THREE,
  cam3d,
  lSaber,
  lTarget,
  lVel,
  rSaber,
  rTarget,
  rVel,
} from './scene.ts';
import { updateMenuDemo } from './gameplay.ts';

const SABER_INTERVAL_MS = 1000 / 240;
const SABER_SPEED = 3.2;

let lastSaberMs = 0;
const tmpSaberUp = new THREE.Vector3();
const tmpSaberRight = new THREE.Vector3();
const tmpSaberForward = new THREE.Vector3();
const tmpSaberMatrix = new THREE.Matrix4();
const tmpSaberQuat = new THREE.Quaternion();
const lSmoothed = new THREE.Vector3(-0.72, 1.08, 1.55);
const rSmoothed = new THREE.Vector3(0.72, 1.08, 1.55);

function frameScaledLerp(baseAmount: number, deltaScale: number): number {
  return 1 - Math.pow(1 - baseAmount, Math.max(0, deltaScale));
}

function applyTrackedSaberQuaternion(
  saber: THREE.Group,
  trackedQuat: { bladeDir: { x: number; y: number; z: number }; rollDir: { x: number; y: number; z: number } } | null,
  amount = 0.14,
): void {
  if (!trackedQuat) return;
  const { bladeDir: bladeDirection, rollDir: rollDirection } = trackedQuat;
  tmpSaberUp.set(bladeDirection.x, bladeDirection.y, bladeDirection.z);
  tmpSaberRight.set(rollDirection.x, rollDirection.y, rollDirection.z);
  tmpSaberForward.crossVectors(tmpSaberUp, tmpSaberRight).normalize();
  tmpSaberMatrix.makeBasis(tmpSaberRight, tmpSaberUp, tmpSaberForward);
  tmpSaberQuat.setFromRotationMatrix(tmpSaberMatrix);
  saber.quaternion.slerp(tmpSaberQuat, amount);
}

export function updateSabers(now: number): void {
  const elapsed = lastSaberMs ? now - lastSaberMs : SABER_INTERVAL_MS;
  if (elapsed < SABER_INTERVAL_MS) return;
  lastSaberMs = now;
  const deltaScale = THREE.MathUtils.clamp(elapsed / (1000 / 60), 0.25, 3.0);
  const posLerp = frameScaledLerp(0.18, deltaScale);
  const rollLerp = frameScaledLerp(0.12, deltaScale);
  const pitchLerp = frameScaledLerp(0.10, deltaScale);
  const quatLerp = frameScaledLerp(0.14, deltaScale);

  lSaber.position.lerp(lTarget, posLerp);
  rSaber.position.lerp(rTarget, posLerp);
  lVel.subVectors(lTarget, lSaber.position);
  rVel.subVectors(rTarget, rSaber.position);
  lSaber.rotation.z = THREE.MathUtils.lerp(lSaber.rotation.z, -0.2 - lVel.x * 1.5, rollLerp);
  rSaber.rotation.z = THREE.MathUtils.lerp(rSaber.rotation.z, 0.2 - rVel.x * 1.5, rollLerp);
  lSaber.rotation.x = THREE.MathUtils.lerp(lSaber.rotation.x, lVel.y * 0.8, pitchLerp);
  rSaber.rotation.x = THREE.MathUtils.lerp(rSaber.rotation.x, rVel.y * 0.8, pitchLerp);

  applyTrackedSaberQuaternion(lSaber, state.saberQuatL, quatLerp);
  applyTrackedSaberQuaternion(rSaber, state.saberQuatR, quatLerp);
}

export function isMainMenuOpen(): boolean {
  return state.appState === S.MENU;
}

export function updateMenuAutoplay(now: number, timeSec: number): void {
  updateMenuDemo(now, timeSec);
  const target = window.__menuDemoTarget;

  const idleLx = -0.72 + Math.sin(timeSec * 0.55) * 0.07 + Math.sin(timeSec * 0.31) * 0.04;
  const idleLy = 1.10 + Math.sin(timeSec * 0.42) * 0.06 + Math.sin(timeSec * 0.73) * 0.03;
  const idleRx = 0.72 + Math.sin(timeSec * 0.55 + 1.9) * 0.07 + Math.sin(timeSec * 0.28 + 0.8) * 0.04;
  const idleRy = 1.10 + Math.sin(timeSec * 0.39 + 1.2) * 0.06 + Math.sin(timeSec * 0.67 + 0.5) * 0.03;

  let desiredLx = idleLx, desiredLy = idleLy, desiredLz = 1.55;
  let desiredRx = idleRx, desiredRy = idleRy, desiredRz = 1.55;

  if (target) {
    const hitWindow = THREE.MathUtils.clamp((target.z + 2.2) / 4.0, 0, 1);
    const swingArc = Math.sin(hitWindow * Math.PI);
    const cross = swingArc * 0.55;
    if (target.side === 'left') {
      desiredLx = target.x - cross * 0.38;
      desiredLy = target.y + Math.cos(hitWindow * Math.PI) * 0.18;
      desiredLz = 1.48 + swingArc * 0.10;
    } else {
      desiredRx = target.x + cross * 0.38;
      desiredRy = target.y + Math.cos(hitWindow * Math.PI) * 0.18;
      desiredRz = 1.48 + swingArc * 0.10;
    }
  }

  const dt = THREE.MathUtils.clamp(state.deltaSec ?? 0.016, 0, 0.1);
  const maxStep = SABER_SPEED * dt;
  const moveAxis = (current: number, desired: number) => current + THREE.MathUtils.clamp(desired - current, -maxStep, maxStep);
  lSmoothed.x = moveAxis(lSmoothed.x, desiredLx);
  lSmoothed.y = moveAxis(lSmoothed.y, desiredLy);
  lSmoothed.z = moveAxis(lSmoothed.z, desiredLz);
  rSmoothed.x = moveAxis(rSmoothed.x, desiredRx);
  rSmoothed.y = moveAxis(rSmoothed.y, desiredRy);
  rSmoothed.z = moveAxis(rSmoothed.z, desiredRz);

  lTarget.copy(lSmoothed);
  rTarget.copy(rSmoothed);
  updateSabers(now);

  lSaber.rotation.z = THREE.MathUtils.lerp(lSaber.rotation.z, -0.18 + Math.sin(timeSec * 0.44) * 0.08, 0.04);
  rSaber.rotation.z = THREE.MathUtils.lerp(rSaber.rotation.z, 0.18 + Math.sin(timeSec * 0.44 + 1.9) * 0.08, 0.04);
  cam3d.position.x = 0.36 + Math.sin(timeSec * 0.18) * 0.06;
  cam3d.position.y = 1.56 + Math.sin(timeSec * 0.23) * 0.018;
  cam3d.lookAt(0.18, 1.08, -7.5);
}
