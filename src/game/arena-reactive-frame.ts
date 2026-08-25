import * as THREE from 'three';
import {
  getCurrentBassLevel,
  getCurrentHighLevel,
  getCurrentMidLevel,
} from './music-visualizer.ts';

interface ArenaReactiveFrameOptions {
  material: THREE.ShaderMaterial;
  camera: THREE.Camera;
  musicEnergy: number;
  beatPulse: number;
  visualPressure: number;
  deltaSec: number;
}

export function updateArenaReactiveFrame({
  material,
  camera,
  musicEnergy,
  beatPulse,
  visualPressure,
  deltaSec,
}: ArenaReactiveFrameOptions): void {
  if (material.uniforms['uMusic']) material.uniforms['uMusic'].value = musicEnergy;
  if (material.uniforms['uBeat']) material.uniforms['uBeat'].value = beatPulse;
  if (material.uniforms['uPressure']) {
    material.uniforms['uPressure'].value = THREE.MathUtils.lerp(
      Number(material.uniforms['uPressure'].value) || 0,
      visualPressure,
      0.12,
    );
  }
  if (material.uniforms['uBass']) material.uniforms['uBass'].value = getCurrentBassLevel();
  if (material.uniforms['uMid']) material.uniforms['uMid'].value = getCurrentMidLevel();
  if (material.uniforms['uHigh']) material.uniforms['uHigh'].value = getCurrentHighLevel();
  if (material.uniforms['uBeatFlash']) {
    const flashTarget = Math.min(1, beatPulse);
    material.uniforms['uBeatFlash'].value = THREE.MathUtils.lerp(
      Number(material.uniforms['uBeatFlash'].value) || 0,
      flashTarget,
      0.35,
    ) * Math.exp(-6.0 * Math.max(0, deltaSec));
  }
  if (material.uniforms['uCamOffset'] && material.uniforms['uCamOffset'].value instanceof THREE.Vector2) {
    (material.uniforms['uCamOffset'].value as THREE.Vector2).set(
      THREE.MathUtils.clamp(camera.position.x * 0.05, -0.5, 0.5),
      THREE.MathUtils.clamp((camera.position.y - 1.55) * 0.08, -0.5, 0.5),
    );
  }
}
