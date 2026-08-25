import { S, state } from '../core/state.ts';
import { updateSparks } from './gameplay.ts';
import { isMainMenuOpen } from './saber-motion.ts';
import {
  applyShake,
  cam3d,
  lLight,
  lSaber,
  rLight,
  rSaber,
  updateArenaPulse,
  updateLightReflections,
  updateReflection,
} from './scene.ts';
import { updateSaberTrails } from './saber-trails.ts';

interface FrameEffectsOptions {
  timeSec: number;
  musicEnergy: number;
  beatPulse: number;
  visualPressure: number;
  profiling: boolean;
}

export interface FrameEffectsProfile {
  effectsMs: number;
  reflectionMs: number;
}

export function updateFrameEffects({
  timeSec,
  musicEnergy,
  beatPulse,
  visualPressure,
  profiling,
}: FrameEffectsOptions): FrameEffectsProfile {
  const effectsPhaseStart = profiling ? performance.now() : 0;
  lLight.position.set(lSaber.position.x, lSaber.position.y + 0.5, lSaber.position.z);
  rLight.position.set(rSaber.position.x, rSaber.position.y + 0.5, rSaber.position.z);
  updateArenaPulse(timeSec, musicEnergy, beatPulse, visualPressure);
  updateLightReflections(timeSec);
  updateSaberTrails(state.appState === S.PLAYING || isMainMenuOpen(), state.deltaSec);
  updateSparks(state.deltaScale);

  if (state.appState === S.PLAYING) {
    cam3d.position.x = Math.sin(timeSec * 0.15) * 0.04;
    cam3d.position.y = 1.55 + Math.sin(timeSec * 0.2) * 0.015;
  }

  let effectsMs = profiling ? performance.now() - effectsPhaseStart : 0;
  const reflectionPhaseStart = profiling ? performance.now() : 0;
  updateReflection();
  const reflectionMs = profiling ? performance.now() - reflectionPhaseStart : 0;
  const shakePhaseStart = profiling ? performance.now() : 0;
  applyShake(state.deltaScale);
  if (profiling) effectsMs += performance.now() - shakePhaseStart;
  return { effectsMs, reflectionMs };
}
