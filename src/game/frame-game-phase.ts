import { S, state } from '../core/state.ts';
import { getAudioOffsetSec, nearestBeats } from '../core/timing.ts';
import type { PerformanceProfile, Settings } from '../types/index.js';
import { isDeveloperPanelEnabled } from '../ui/devpanel.ts';
import { updateMapProgress } from '../ui/ui.ts';
import { hasMapAudio } from './audio.ts';
import type { GamePauseController } from './game-pause-controller.ts';
import { updateBlocks } from './gameplay.ts';
import type { MapTimeline } from './map-timeline.ts';
import type { MultiplayerScorePublisher } from './multiplayer-score-publisher.ts';
import { isMainMenuOpen, updateMenuAutoplay, updateSabers } from './saber-motion.ts';
import {
  animateIdleSabers,
  lSaber,
  lVel,
  rSaber,
  rVel,
} from './scene.ts';

interface FrameGamePhaseOptions {
  now: number;
  timeSec: number;
  settings: Settings;
  performanceProfile: PerformanceProfile;
  mapTimeline: MapTimeline;
  pauseController: Pick<GamePauseController, 'updateHands'>;
  scorePublisher: Pick<MultiplayerScorePublisher, 'publish'>;
  onMapComplete(): void;
}

let nearestBeatUpdatedAt = 0;

function setBladeGlow(leftOpacity: number, rightOpacity = leftOpacity): void {
  (lSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = leftOpacity;
  (rSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = rightOpacity;
}

export function updateFrameGamePhase({
  now,
  timeSec,
  settings,
  performanceProfile,
  mapTimeline,
  pauseController,
  scorePublisher,
  onMapComplete,
}: FrameGamePhaseOptions): void {
  pauseController.updateHands(now);

  if (isMainMenuOpen()) {
    if (performanceProfile.menuDemo) updateMenuAutoplay(now, timeSec);
    else animateIdleSabers(timeSec);
    setBladeGlow(0.76 + Math.sin(timeSec * 7) * 0.12);
    return;
  }

  if (state.appState === S.PLAYING) {
    updateSabers(now);
    mapTimeline.updateAudioSchedule(now);

    const mapBeats = state.map?.beats ?? null;
    const mapTimeSec = state.map ? mapTimeline.getTime(now) : 0;
    window.__songTimeSec = mapTimeSec;
    updateBlocks(now, mapBeats, mapTimeSec);

    if (state.map) {
      const progressTime = Math.max(0, mapTimeSec);
      const duration = mapTimeline.getDuration();
      updateMapProgress(progressTime, duration);
      if (mapTimeSec >= 0) scorePublisher.publish(now, duration > 0 ? progressTime / duration : 0);
      if (isDeveloperPanelEnabled() && now - nearestBeatUpdatedAt > 250) {
        nearestBeatUpdatedAt = now;
        const raw = nearestBeats(state.map.beats, mapTimeSec, 3);
        window.__nearestBeatDeltaMs = raw[0]?.deltaMs ?? null;
        window.__nearestBeats = raw.map(nearest => ({
          deltaMs: nearest.deltaMs,
          side: nearest.beat.side ?? '—',
          cut: nearest.beat.cut ?? '—',
        }));
      }
      window.__audioOffsetMs = Math.round(getAudioOffsetSec(settings, state.map) * 1000);
      if ((mapTimeline.hasStartedAudio || !hasMapAudio()) && progressTime >= duration && duration > 0) {
        onMapComplete();
      }
    }

    setBladeGlow(0.65 + Math.sin(timeSec * 8) * 0.1);
    return;
  }

  if (state.appState === S.PAUSED) {
    lVel.set(0, 0, 0);
    rVel.set(0, 0, 0);
    setBladeGlow(0.35 + Math.sin(timeSec * 3) * 0.1);
    return;
  }

  animateIdleSabers(timeSec);
  setBladeGlow(
    0.7 + Math.sin(timeSec * 4) * 0.15,
    0.7 + Math.sin(timeSec * 4 + 1) * 0.15,
  );
}
