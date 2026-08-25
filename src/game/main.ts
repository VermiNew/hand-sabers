import { S, state } from '../core/state.ts';
import { ui, updateHUD, clearDangerPulse, showGameOver, showMultiplayerResults, hideHandsPaused, updateMapProgress, showMapTitle, hidePauseMenu, fadeTransition } from '../ui/ui.ts';
import {
  THREE, renderer, scene, cam3d, bgMat,
  lSaber, rSaber, lTarget, rTarget, lVel, rVel, lLight, rLight,
  animateIdleSabers, updateArenaPulse, updateLightReflections, updateReflection, resizeRenderer, adaptRenderQuality, disposeSceneResources,
  applyShake, setScenePerformanceProfile, getScenePerformanceProfile, setHitPlaneVisible, setOneHandModeVisuals,
} from './scene.ts';
import { initAudio, initInterfaceSounds, stopMapAudio, hasMapAudio, clearMapAudio, setMusicVolume, applyAudioSettings } from './audio.ts';
import { initMP, setCalibAutoAdvanceHandler, setSaberTargetSetter, stopTracking, restoreCalibrationData } from '../tracking/tracking.ts';
import { setGameOverHandler, startGameplay, clearGameplayEntities, updateBlocks, updateSparks, resetMapSpawn, resetMenuDemo, prewarmGameplayResources, disposeGameplayResources } from './gameplay.ts';
import { updateFpsCounter } from '../ui/fps.ts';
import { initDevPanel, isDeveloperPanelEnabled, tickDevPanel, initCameraPanelToggle } from '../ui/devpanel.ts';
import type { FrameProfile } from '../ui/devpanel.ts';
import { loadSettings, resetSettings, setSetting } from '../core/settings.ts';
import { getAudioOffsetSec, nearestBeats } from '../core/timing.ts';
import { PAUSE_REASONS } from '../core/pause.ts';
import { t, needsLanguageSelection, translateDom } from '../i18n/index.ts';
import { initKeyboardNav } from '../ui/keyboard-nav.ts';
import { initHelpOverlay } from '../ui/help.ts';
import { registerMlAssetCache } from '../core/ml-cache.ts';
import { initMultiplayerOverlay, sendMultiplayerScore, getCurrentPlayerId } from '../multiplayer/client.ts';
import { parseRoomSnapshot } from '../multiplayer/protocol.ts';
import { initRemoteTrackingPreviews } from '../multiplayer/remote-preview.ts';
import { initRemoteTrackingPairing, isRemoteTrackingConnected } from '../remote/host-pairing.ts';
import { isPhoneAudioActive, playPhoneAudio, pausePhoneAudio, stopPhoneAudio } from '../remote/host-audio.ts';
import { narratorShow, narratorQuick, NARRATOR_SPEEDS, isNarratorVisible } from './narrator.ts';
import { initAchievements, recordGameEnd } from '../core/achievements.ts';
import { initLanguageSettings } from '../ui/language-settings.ts';
import { initSettingsTransfer } from '../ui/settings-transfer.ts';
import { bindStyledRange } from '../ui/settings-range.ts';
import { initMapPickerOverlay, openMapPicker } from './map-picker.ts';
import { initProfileOnboarding, initProfileSettings, showProfileOnboardingIfNeeded } from './profile.ts';
import { initAudioSettings } from './audio-settings.ts';
import { initGameplaySettings } from './gameplay-settings.ts';
import { applySaberAppearance, initSaberSettings } from './saber-settings.ts';
import { applyArenaTheme, initArenaSettings } from './arena-settings.ts';
import { initMusicReactiveSettings } from './music-reactive-settings.ts';
import { initGraphicsSettings } from './graphics-settings.ts';
import { initTrackingSettings } from './tracking-settings.ts';
import { initDeveloperSettings } from './developer-settings.ts';
import { initMainMenuShell, triggerMenuEnter } from './main-menu-shell.ts';
import { initAchievementUI, renderAchievementCompactGrid, renderStatsGrid } from './achievement-ui.ts';
import { applyPauseTranslations } from './pause-ui.ts';
import { createGamePauseController } from './game-pause-controller.ts';
import { createCalibrationUI } from './calibration-ui.ts';
import { createCalibrationController } from './calibration-controller.ts';
import { MapTimeline } from './map-timeline.ts';
import { initMapDrop } from './map-drop.ts';
import { ensureCurrentMapAudio, loadMapById, tryLoadMapFromUrl } from './map-session.ts';
import { submitScore } from './score-submission.ts';
import { isMainMenuOpen, updateMenuAutoplay, updateSabers } from './saber-motion.ts';
import { createRuntimeReporter } from './runtime-reporter.ts';
import { getCurrentBeatPulse, getCurrentMusicEnergy, updateMusicVisualizer, getCurrentBassLevel, getCurrentMidLevel, getCurrentHighLevel } from './music-visualizer.ts';
import { updateSaberTrails } from './saber-trails.ts';

declare global {
  interface Window {
    __narratorCombo?: (combo: number) => void;
    __trackingSensitivity?: number;
    __trackingFlip?:        boolean;
    __oneHandMode?:         string;
    __handSabersStopRenderLoop?: () => void;
    __songTimeSec?:         number;
    __audioOffsetMs?:       number;
    __nearestBeatDeltaMs?:  number | null;
    __nearestBeats?:        Array<{ deltaMs: number; side: string; cut: string }> | null;
    __gameplayVisualPressure?: number;
  }
}

// ── Ustawienia ────────────────────────────────────────────────────────────────
const settings = loadSettings();
interface MultiplayerRules {
  trainingMode: boolean;
  noFail: boolean;
}
let multiplayerRoundRules: MultiplayerRules | null = null;

applySaberAppearance(settings);
window.__trackingSensitivity = settings.sensitivity;
window.__trackingFlip        = settings.flipCamera;
state.noFail                 = settings.noFail;
state.oneHandMode            = settings.oneHandMode || null;
setOneHandModeVisuals(state.oneHandMode);
window.__oneHandMode         = state.oneHandMode || 'both';
document.body.classList.toggle('training-mode', settings.trainingMode);
document.body.dataset['gameMode'] = settings.gameMode || 'normal';
applyAudioSettings(settings);
applyArenaTheme(settings.arenaTheme || 'cosmic');
setScenePerformanceProfile(settings);
setHitPlaneVisible(Boolean(settings.developerMode) || isDeveloperPanelEnabled());
prewarmGameplayResources();
initAchievements();
initAchievementUI();
setSaberTargetSetter((side, pos) => {
  if (side === 'left') lTarget.set(pos.x, pos.y, pos.z);
  else                 rTarget.set(pos.x, pos.y, pos.z);
});

function applyTranslations(): void {
  translateDom();
  // ov-instruction uses innerHTML (two keys) — handle separately
  const ovInstr = document.getElementById('ovInstr');
  if (ovInstr && !ovInstr.dataset['loading']) {
    ovInstr.innerHTML = `${t('overlay.loadingModel')}<br>${t('overlay.prepareCamera')}`;
  }
}

applyTranslations();
initInterfaceSounds();

let multiplayerRoundActive = false;
let lastMultiplayerScoreAt = 0;

const mapTimeline = new MapTimeline({
  isTrainingMode: () => multiplayerRoundActive
    ? Boolean(multiplayerRoundRules?.trainingMode)
    : settings.trainingMode,
});

function showOverlay(): void {
  if (!ui.overlay) return;
  ui.overlay.classList.add('show');
}

function hideOverlay(): void {
  if (!ui.overlay) return;
  ui.overlay.classList.remove('show', 'is-gameover', 'is-victory', 'is-defeat');
}

let multiplayerPreparationMapId = '';
const calibrationUI = createCalibrationUI();
const calibrationController = createCalibrationController(settings, calibrationUI, {
  async onComplete() {
    if (multiplayerPreparationMapId) {
      completeMultiplayerPreparation();
      return;
    }
    await beginPlaying();
  },
});

const gamePauseController = createGamePauseController({
  isMultiplayerRoundActive: () => multiplayerRoundActive,
  mapTimeline,
});
const { pauseGame, resumeGame } = gamePauseController;

function completeMultiplayerPreparation(): void {
  const mapId = multiplayerPreparationMapId;
  multiplayerPreparationMapId = '';
  calibrationUI.hidePanel();
  hideOverlay();
  state.appState = S.MENU;
  const mainMenu = document.getElementById('mainMenu');
  if (mainMenu) mainMenu.style.display = 'flex';
  document.body.classList.add('menu-open');
  resetMenuDemo();
  const multiplayerOverlay = document.getElementById('multiplayerOverlay');
  if (multiplayerOverlay) multiplayerOverlay.hidden = false;
  window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepared', { detail: { mapId } }));
}

async function prepareMultiplayerMap(mapId: string): Promise<void> {
  multiplayerPreparationMapId = mapId;
  try {
    initAudio();
    if (!await loadMapById(mapId)) throw new Error('MAP_NOT_FOUND');
    await ensureCurrentMapAudio(settings);
    if (calibrationController.isReady()) {
      completeMultiplayerPreparation();
      return;
    }
    const multiplayerOverlay = document.getElementById('multiplayerOverlay');
    if (multiplayerOverlay) multiplayerOverlay.hidden = true;
    await startFromMainMenu({ calibrate: true });
  } catch (error) {
    console.error('Multiplayer preparation failed:', error);
    multiplayerPreparationMapId = '';
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-error'));
  }
}

async function beginMultiplayerRound(detail: {
  mapId: string;
  mode: 'coop' | 'score-attack';
  rules: MultiplayerRules;
  saber: 'left' | 'right' | 'both';
  startAtPerformance: number;
}): Promise<void> {
  if (
    !Number.isFinite(detail.startAtPerformance)
    || !await loadMapById(detail.mapId)
  ) {
    window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-error'));
    return;
  }
  initAudio();
  await ensureCurrentMapAudio(settings);
  gamePauseController.reset();
  clearGameplayEntities();
  stopMapAudio();
  mapTimeline.reset();
  calibrationUI.hidePanel();
  hideOverlay();
  hideHandsPaused();
  hidePauseMenu();
  const multiplayerOverlay = document.getElementById('multiplayerOverlay');
  if (multiplayerOverlay) multiplayerOverlay.hidden = true;
  const mainMenu = document.getElementById('mainMenu');
  if (mainMenu) mainMenu.style.display = 'none';
  document.body.classList.remove('menu-open');
  if (ui.hud) ui.hud.style.display = 'flex';
  if (ui.mapProgress) ui.mapProgress.style.display = 'flex';
  gamePauseController.reset();
  state.pauseReason = PAUSE_REASONS.NONE;
  state.appState = S.PLAYING;
  multiplayerRoundRules = { ...detail.rules };
  multiplayerRoundActive = true;
  lastMultiplayerScoreAt = 0;
  state.noFail = detail.rules.noFail;
  document.body.classList.toggle('training-mode', detail.rules.trainingMode);
  document.body.dataset['multiplayerMode'] = detail.mode;
  resetMapSpawn();
  mapTimeline.startAt(detail.startAtPerformance);
  startGameplay(detail.saber);
  showMapTitle(state.map?.meta?.title ?? t('game.unknownTrack'));
  if (ui.dStatus) ui.dStatus.textContent = 'MULTIPLAYER';
}

async function beginPlaying(): Promise<void> {
  gamePauseController.reset();
  calibrationUI.hidePanel();
  hideOverlay();
  if (ui.hud)                       ui.hud.style.display        = 'flex';
  if (ui.mapProgress && state.map)  ui.mapProgress.style.display = 'flex';
  hideHandsPaused();
  hidePauseMenu();
  gamePauseController.reset();
  state.pauseReason  = PAUSE_REASONS.NONE;
  state.appState     = S.PLAYING;

  if (state.map) {
    await ensureCurrentMapAudio(settings);
    resetMapSpawn();
    mapTimeline.start(performance.now());
    showMapTitle(state.map.meta?.title ?? t('game.unknownTrack'));
  } else {
    mapTimeline.reset();
  }

  startGameplay();
  if (ui.dStatus) ui.dStatus.textContent = 'PLAYING';
}

function endGame(victory = false): void {
  const playTimeMs = state.map && mapTimeline ? mapTimeline.getTime() * 1000 : 0;
  recordGameEnd(state, victory, playTimeMs);
  gamePauseController.reset();
  clearDangerPulse();
  state.appState    = S.GAMEOVER;
  state.pauseReason = PAUSE_REASONS.NONE;
  const dur = mapTimeline.getDuration();
  const pos = mapTimeline.getTime();
  const progress = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : undefined;
  const wasMultiplayerRound = multiplayerRoundActive;
  const wasTrainingMode = wasMultiplayerRound
    ? Boolean(multiplayerRoundRules?.trainingMode)
    : settings.trainingMode;
  if (wasMultiplayerRound) {
    sendMultiplayerScore({
      score: Math.max(0, Math.round(state.score)),
      combo: Math.max(0, Math.round(state.combo)),
      lives: Math.max(0, Math.round(state.lives)),
      progress: progress ?? 0,
      finished: true,
    });
  }
  multiplayerRoundActive = false;
  multiplayerRoundRules = null;
  state.noFail = settings.noFail;
  document.body.classList.toggle('training-mode', settings.trainingMode);
  delete document.body.dataset['multiplayerMode'];
  stopMapAudio();
  mapTimeline.reset();
  clearGameplayEntities();
  runAsyncTask('score-submit', () => submitScore({
    playerName: settings.playerName,
    progress,
    trainingMode: wasTrainingMode,
  }));
  fadeTransition(() => { showGameOver(state, victory); });
}

function restartGame(): void {
  clearDangerPulse();
  clearGameplayEntities();
  stopMapAudio();
  mapTimeline.reset();
  hideHandsPaused();
  hidePauseMenu();
  gamePauseController.reset();
  state.pauseReason = PAUSE_REASONS.NONE;
  calibrationController.start();
}

function restartWithoutCalib(): void {
  clearDangerPulse();
  clearGameplayEntities();
  stopMapAudio();
  mapTimeline.reset();
  hideHandsPaused();
  hidePauseMenu();
  gamePauseController.reset();
  state.pauseReason = PAUSE_REASONS.NONE;
  runAsyncTask('game-restart', beginPlaying);
}

function publishMultiplayerScore(now: number, progress: number): void {
  if (!multiplayerRoundActive || now - lastMultiplayerScoreAt < 100) return;
  if (sendMultiplayerScore({
    score: Math.max(0, Math.round(state.score)),
    combo: Math.max(0, Math.round(state.combo)),
    lives: Math.max(0, Math.round(state.lives)),
    progress: Math.max(0, Math.min(1, progress)),
  })) {
    lastMultiplayerScoreAt = now;
  }
}

// ── Główna pętla ──────────────────────────────────────────────────────────────
let renderMs         = 0;
let detectMs         = 0;
let mainLoopRaf: number | null = null;
let mainLoopRunning  = false;
let _nearestBeatAt   = 0;
const BASE_FRAME_MS      = 1000 / 60;
const MAX_FRAME_DELTA_MS = 250;
const MAX_SIM_DELTA_SCALE = 3;

let loopLastNow: number | undefined;
const frameProfile: FrameProfile = { gameMs: 0, effectsMs: 0, reflectionMs: 0, cpuMs: 0 };

function smoothProfileValue(previous: number, sample: number): number {
  return previous === 0 ? sample : previous * 0.88 + sample * 0.12;
}

function loop(timestamp: number): void {
  if (!mainLoopRunning) return;
  mainLoopRaf = requestAnimationFrame(loop);
  try {
    renderFrame(timestamp);
  } catch (error) {
    reportRuntimeError('render-loop', error);
  }
}

function renderFrame(timestamp: number): void {
  const now = timestamp;
  updateFpsCounter(now);
  const t = now * 0.001;

  const previousNow   = Number.isFinite(loopLastNow) ? loopLastNow! : now - BASE_FRAME_MS;
  const frameDeltaMs  = THREE.MathUtils.clamp(now - previousNow, 0, MAX_FRAME_DELTA_MS);
  loopLastNow         = now;
  state.deltaMs       = frameDeltaMs;
  state.deltaSec      = frameDeltaMs / 1000;
  state.deltaScale    = Math.min(frameDeltaMs / BASE_FRAME_MS, MAX_SIM_DELTA_SCALE);
  state.tick++;
  const profiling = isDeveloperPanelEnabled();
  const profileStart = profiling ? performance.now() : 0;

  const perfProfile = getScenePerformanceProfile();
  if (bgMat.uniforms['uTime']) bgMat.uniforms['uTime'].value = t;
  gamePauseController.updateHands(now);

  const gamePhaseStart = profiling ? performance.now() : 0;
  if (isMainMenuOpen()) {
    if (perfProfile.menuDemo) updateMenuAutoplay(now, t);
    else animateIdleSabers(t);
    const pulse = 0.76 + Math.sin(t * 7) * 0.12;
    (lSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
    (rSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
  } else if (state.appState === S.PLAYING) {
    updateSabers(now);

    mapTimeline.updateAudioSchedule(now);
    const mapBeats   = state.map?.beats ?? null;
    const mapTimeSec = state.map ? mapTimeline.getTime(now) : 0;
    window.__songTimeSec = mapTimeSec;
    updateBlocks(now, mapBeats, mapTimeSec);

    if (state.map) {
      const progressTime = Math.max(0, mapTimeSec);
      const duration = mapTimeline.getDuration();
      updateMapProgress(progressTime, duration);
      if (mapTimeSec >= 0) publishMultiplayerScore(now, duration > 0 ? progressTime / duration : 0);
      if (isDeveloperPanelEnabled() && now - _nearestBeatAt > 250) {
        _nearestBeatAt = now;
        const raw = nearestBeats(state.map?.beats, mapTimeSec, 3);
        window.__nearestBeatDeltaMs = raw[0]?.deltaMs ?? null;
        window.__nearestBeats = raw.map(n => ({
          deltaMs: n.deltaMs,
          side: n.beat.side ?? '—',
          cut: n.beat.cut ?? '—',
        }));
      }
      window.__audioOffsetMs      = Math.round(getAudioOffsetSec(settings, state.map) * 1000);
      if ((mapTimeline.hasStartedAudio || !hasMapAudio()) && progressTime >= duration && duration > 0) {
        endGame(true);
      }
    }

    const pulse = 0.65 + Math.sin(t * 8) * 0.1;
    (lSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
    (rSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
  } else if (state.appState === S.PAUSED) {
    lVel.set(0, 0, 0); rVel.set(0, 0, 0);
    const pulse = 0.35 + Math.sin(t * 3) * 0.1;
    (lSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
    (rSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
  } else {
    animateIdleSabers(t);
    (lSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = 0.7 + Math.sin(t * 4) * 0.15;
    (rSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = 0.7 + Math.sin(t * 4 + 1) * 0.15;
  }
  updateMusicVisualizer({
    active: state.appState === S.PLAYING,
    beats: state.map?.beats ?? null,
    deltaSec: state.deltaSec,
    nowSec: t,
    profile: perfProfile,
    songTimeSec: state.map ? mapTimeline.getTime(now) : t,
  });
  const musicEnergy = getCurrentMusicEnergy();
  const beatPulse = getCurrentBeatPulse();
  const visualPressure = state.appState === S.PLAYING ? window.__gameplayVisualPressure ?? 0 : 0;
  if (bgMat.uniforms['uMusic']) bgMat.uniforms['uMusic'].value = musicEnergy;
  if (bgMat.uniforms['uBeat']) bgMat.uniforms['uBeat'].value = beatPulse;
  if (bgMat.uniforms['uPressure']) {
    const targetPressure = visualPressure;
    bgMat.uniforms['uPressure'].value = THREE.MathUtils.lerp(
      Number(bgMat.uniforms['uPressure'].value) || 0,
      targetPressure,
      0.12,
    );
  }
  // Music bands feed layered shader effects.
  if (bgMat.uniforms['uBass']) bgMat.uniforms['uBass'].value = getCurrentBassLevel();
  if (bgMat.uniforms['uMid'])  bgMat.uniforms['uMid'].value  = getCurrentMidLevel();
  if (bgMat.uniforms['uHigh']) bgMat.uniforms['uHigh'].value = getCurrentHighLevel();
  // Beat flash — sharp decay from the current beat pulse.
  if (bgMat.uniforms['uBeatFlash']) {
    const flashTarget = Math.min(1, beatPulse);
    bgMat.uniforms['uBeatFlash'].value = THREE.MathUtils.lerp(
      Number(bgMat.uniforms['uBeatFlash'].value) || 0,
      flashTarget,
      0.35,
    ) * Math.exp(-6.0 * Math.max(0, state.deltaSec));
  }
  // Subtle parallax from camera position (head bob) — keep small for readability.
  if (bgMat.uniforms['uCamOffset'] && bgMat.uniforms['uCamOffset'].value instanceof THREE.Vector2) {
    (bgMat.uniforms['uCamOffset'].value as THREE.Vector2).set(
      THREE.MathUtils.clamp((cam3d.position.x) * 0.05, -0.5, 0.5),
      THREE.MathUtils.clamp((cam3d.position.y - 1.55) * 0.08, -0.5, 0.5),
    );
  }
  if (profiling) frameProfile.gameMs = smoothProfileValue(frameProfile.gameMs, performance.now() - gamePhaseStart);

  const effectsPhaseStart = profiling ? performance.now() : 0;
  lLight.position.set(lSaber.position.x, lSaber.position.y + 0.5, lSaber.position.z);
  rLight.position.set(rSaber.position.x, rSaber.position.y + 0.5, rSaber.position.z);
  updateArenaPulse(t, musicEnergy, beatPulse, visualPressure);
  updateLightReflections(t);
  updateSaberTrails(state.appState === S.PLAYING || isMainMenuOpen(), state.deltaSec);
  updateSparks(state.deltaScale);

  if (state.appState === S.PLAYING) {
    cam3d.position.x = Math.sin(t * 0.15) * 0.04;
    cam3d.position.y = 1.55 + Math.sin(t * 0.2) * 0.015;
  }

  let effectsSampleMs = profiling ? performance.now() - effectsPhaseStart : 0;

  const reflectionPhaseStart = profiling ? performance.now() : 0;
  updateReflection();
  if (profiling) frameProfile.reflectionMs = smoothProfileValue(frameProfile.reflectionMs, performance.now() - reflectionPhaseStart);
  const shakePhaseStart = profiling ? performance.now() : 0;
  applyShake(state.deltaScale);
  if (profiling) {
    effectsSampleMs += performance.now() - shakePhaseStart;
    frameProfile.effectsMs = smoothProfileValue(frameProfile.effectsMs, effectsSampleMs);
  }

  const rStart = performance.now();
  renderer.render(scene, cam3d);
  renderMs = performance.now() - rStart;
  if (profiling) frameProfile.cpuMs = smoothProfileValue(frameProfile.cpuMs, performance.now() - profileStart);
  detectMs = window.__lastDetectMs ?? detectMs;
  adaptRenderQuality(frameDeltaMs, state.fps);

  const drawCalls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;
  if (ui.dRender) ui.dRender.textContent = `${renderMs.toFixed(1)}ms`;

  tickDevPanel(renderer, now, renderMs, detectMs, {
    drawCalls, triangles,
    activeBlocks:  window.__activeBlockCount  ?? 0,
    activeSparks:  window.__activeSparkCount  ?? 0,
    conf:          window.__lastHandConf      ?? 0,
    filteredHands: window.__filteredHandCount ?? 0,
    rawHands:      window.__rawHandCount      ?? 0,
  }, profiling ? frameProfile : undefined);
}

// ── Przyciski overlay ─────────────────────────────────────────────────────────
function handleOverlayButton(): void {
  initAudio();
  if (state.appState === S.GAMEOVER) restartWithoutCalib();
  else runAsyncTask('calibration-advance', () => calibrationController.advance());
}

function handleCalibButton(): void {
  initAudio();
  if (state.appState === S.GAMEOVER) restartGame();
}

// ── Menu pauzy (Escape) ───────────────────────────────────────────────────────
function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (state.appState === S.PLAYING) {
      e.preventDefault();
      pauseGame(PAUSE_REASONS.MANUAL, performance.now());
    } else if (
      state.appState === S.PAUSED
      && (state.pauseReason === PAUSE_REASONS.MANUAL || state.pauseReason === PAUSE_REASONS.FOCUS)
    ) {
      e.preventDefault();
      void resumeGame(performance.now(), 'keyboard');
    }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

applyPauseTranslations();

function showFirstRunWelcome(): void {
  const seenRaw = localStorage.getItem('hs_welcome_seen');
  if (seenRaw === '1') return;
  try { localStorage.setItem('hs_welcome_seen', '1'); } catch {}
  setTimeout(() => {
    if (document.body.classList.contains('menu-open') && state.appState === 'menu') {
      void narratorShow({
        text: t('narrator.welcome'),
        buttons: [t('narrator.letsGo'), t('narrator.openTutorial')],
        mood: 'happy',
      }).then(choice => {
        if (choice === 1) {
          window.dispatchEvent(new CustomEvent('hand-sabers:open-tutorial', { detail: { force: true } }));
        }
      });
    }
  }, 1200);
}

const COMBO_NARRATOR_MSGS: Record<number, { key: string; mood: 'happy' | 'excited' | 'celebrate' }> = {
  50: { key: 'narrator.combo50', mood: 'happy' },
  100: { key: 'narrator.combo100', mood: 'excited' },
  200: { key: 'narrator.combo200', mood: 'celebrate' },
};

window.__narratorCombo = (combo: number) => {
  if (isNarratorVisible()) return;
  const msg = COMBO_NARRATOR_MSGS[combo];
  if (!msg) return;
  narratorQuick(t(msg.key), msg.mood, 3500);
};

ui.ovBtn?.addEventListener('click',       handleOverlayButton);
ui.ovBtnMaps?.addEventListener('click',   () => { openMapPicker(); });
ui.ovBtnCalib?.addEventListener('click',  handleCalibButton);
ui.calibBtnNext?.addEventListener('click',  () => { initAudio(); runAsyncTask('calibration-advance', () => calibrationController.advance()); });
ui.calibBtnRetry?.addEventListener('click', () => { initAudio(); restartGame(); });
ui.calibBtnMenu?.addEventListener('click',  returnToMainMenu);
document.getElementById('calibModeAuto')?.addEventListener('click',   () => { initAudio(); calibrationController.beginSteps('auto'); });
document.getElementById('calibModeManual')?.addEventListener('click', () => { initAudio(); calibrationController.beginSteps('manual'); });
document.getElementById('pauseResume')?.addEventListener('click', () => { void resumeGame(performance.now(), 'ui'); });
document.getElementById('pauseRestart')?.addEventListener('click', () => {
  hidePauseMenu();
  restartWithoutCalib();
});
document.getElementById('pauseMaps')?.addEventListener('click', () => {
  hidePauseMenu();
  openMapPicker();
});

function returnToMainMenu(): void {
  gamePauseController.reset();
  clearDangerPulse();
  fadeTransition(() => {
    if (multiplayerRoundActive) {
      window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-leave'));
    }
    multiplayerRoundActive = false;
    multiplayerRoundRules = null;
    state.noFail = settings.noFail;
    document.body.classList.toggle('training-mode', settings.trainingMode);
    stopMapAudio();
    mapTimeline.reset();
    clearGameplayEntities();
    hidePauseMenu();
    hideHandsPaused();
    if (ui.hud) ui.hud.style.display = 'none';
    hideOverlay();
  calibrationUI.hidePanel();
    const mainMenu = document.getElementById('mainMenu');
    if (mainMenu) mainMenu.style.display = 'flex';
    document.body.classList.add('menu-open');
    state.appState    = S.MENU;
    state.pauseReason = PAUSE_REASONS.NONE;
    resetMenuDemo();
    triggerMenuEnter();
  });
}

document.getElementById('pauseQuit')?.addEventListener('click', returnToMainMenu);
document.getElementById('handsPauseQuit')?.addEventListener('click', returnToMainMenu);
ui.ovBtnMenu?.addEventListener('click', returnToMainMenu);
ui.calibAbortBtn?.addEventListener('click', returnToMainMenu);

// Abort button on loading screen — cancels tracking init and returns to menu
function abortLoading(): void {
  if (trackingStarting || (trackingStarted && state.appState === S.LOADING)) {
    stopTracking();
    trackingStarted = false;
    trackingStarting = false;
  }
  calibrationController.setReady(false);
  returnToMainMenu();
}
document.getElementById('ovAbortBtn')?.addEventListener('click', abortLoading);

window.addEventListener('resize',  resizeRenderer);
window.addEventListener('keydown', handleKeydown);
setGameOverHandler(() => endGame(false));

// Keyboard navigation — focus traps, arrow keys, escape stack
initKeyboardNav({
  onEscapePause: () => {
    if (
      state.appState === S.PAUSED
      && (state.pauseReason === PAUSE_REASONS.MANUAL || state.pauseReason === PAUSE_REASONS.FOCUS)
    ) {
      void resumeGame(performance.now(), 'keyboard');
    }
  },
  onEscapeSettings: () => {
    const backdrop = document.getElementById('mainSettingsBackdrop');
    if (backdrop && !backdrop.hidden) backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  },
});
setCalibAutoAdvanceHandler(() => {
  if (state.appState === S.CALIB) runAsyncTask('calibration-auto-advance', () => calibrationController.advance());
});
initDevPanel(renderer, null);
initCameraPanelToggle();
initMapDrop({ hideOverlay, mapTimeline });
updateHUD(state);

let trackingStarted = false;
let trackingStarting = false;
async function startFromMainMenu({ calibrate = false } = {}): Promise<void> {
  initAudio();
  applyAudioSettings(settings);
  setScenePerformanceProfile(settings);
  prewarmGameplayResources();
  const mainMenu = document.getElementById('mainMenu');
  if (mainMenu) {
    mainMenu.classList.remove('is-entering');
    mainMenu.classList.add('is-leaving');
    await new Promise<void>(r => setTimeout(r, 280));
    mainMenu.classList.remove('is-leaving');
    mainMenu.style.display = 'none';
  }
  document.body.classList.remove('menu-open');
  clearGameplayEntities();
  showOverlay();
  state.appState = S.LOADING;

  if (trackingStarted) {
    if (calibrate || !calibrationController.isReady()) restartGame();
    else restartWithoutCalib();
    return;
  }

  // If "remember calibration" is enabled and we have saved data, skip calibration
  if (!calibrate && settings.rememberCalibration && settings.savedCalibration) {
    calibrationController.setReady(true);
  } else if (calibrate) {
    // Explicit recalibration — invalidate saved calibration
    calibrationController.setReady(false);
    if (settings.savedCalibration) setSetting('savedCalibration', null);
  }

  if (trackingStarting) return;
  trackingStarting = true;
  trackingStarted = await initMP(() => {
    // After tracking init, if we have saved calibration, restore it and skip calibration steps
    if (calibrationController.isReady() && settings.savedCalibration) {
      restoreCalibrationData(settings.savedCalibration);
      if (multiplayerPreparationMapId) {
        completeMultiplayerPreparation();
        return;
      }
      runAsyncTask('game-start-skip-calib', beginPlaying);
    } else {
      calibrationController.start();
    }
  });
  trackingStarting = false;
}

function initMainMenu(): void {
  resetMenuDemo();
  const settingsReset    = document.getElementById('mainSettingsReset');
  const trackingSettingsController = initTrackingSettings(settings, {
    onSourceChange(changed) {
      if (!changed || !trackingStarted) return;
      stopTracking();
      trackingStarted = false;
      calibrationController.setReady(false);
    },
  });
  const menuShell = initMainMenuShell({
    onAchievementsOpen() {
      renderStatsGrid();
      renderAchievementCompactGrid();
    },
  });

  initSettingsTransfer(settings);

  menuShell.bindAction('mainStart', () => {
    if (!state.map) {
      runAsyncTask('map-selection-prompt', async () => {
        const choice = await narratorShow({
          text: t('narrator.selectMap'),
          buttons: [t('narrator.openMaps'), t('narrator.cancel')],
        });
        if (choice === 0) openMapPicker();
      });
      return;
    }
    if (settings.trackingSource === 'phone' && !isRemoteTrackingConnected()) {
      menuShell.openSettings('remoteTracking');
      trackingSettingsController.updateSourceHint();
      return;
    }
    menuShell.closeSettings();
    runAsyncTask('game-start', () => startFromMainMenu({ calibrate: false }));
  });
  menuShell.bindAction('mainCalibrate', () => {
    if (settings.trackingSource === 'phone' && !isRemoteTrackingConnected()) {
      menuShell.openSettings('remoteTracking');
      trackingSettingsController.updateSourceHint();
      return;
    }
    menuShell.closeSettings();
    runAsyncTask('calibration-start', () => startFromMainMenu({ calibrate: true }));
  });
  menuShell.bindAction('mainMaps', () => {
    openMapPicker();
  });

  initLanguageSettings(applyTranslations);

  const audioSettingsController = initAudioSettings(settings, bindStyledRange);

  initProfileSettings(settings);
  const gameplaySettingsController = initGameplaySettings(settings);
  const saberSettingsController = initSaberSettings(settings);
  const arenaSettingsController = initArenaSettings(settings);
  const musicReactiveSettingsController = initMusicReactiveSettings(settings);
  const graphicsSettingsController = initGraphicsSettings(settings);
  const developerSettingsController = initDeveloperSettings(settings);

  settingsReset?.addEventListener('click', () => {
    if (!window.confirm(t('settings.resetConfirm'))) return;

    const localNoFail = settings.noFail;
    const localTrainingMode = settings.trainingMode;
    const previousTrackingSource = settings.trackingSource;
    resetSettings();
    if (gameplaySettingsController.hasMultiplayerRules()) {
      setSetting('noFail', localNoFail);
      setSetting('trainingMode', localTrainingMode);
    }
    if (trackingStarted && previousTrackingSource !== settings.trackingSource) {
      stopTracking();
      trackingStarted = false;
      calibrationController.setReady(false);
    }
    audioSettingsController.sync();
    gameplaySettingsController.sync();
    saberSettingsController.sync();
    arenaSettingsController.sync();
    musicReactiveSettingsController.sync();
    graphicsSettingsController.sync();
    trackingSettingsController.sync();
    developerSettingsController.sync();
    applyAudioSettings(settings);
  });
}

const { reportRuntimeError, runAsyncTask } = createRuntimeReporter({ showOverlay });

function startRenderLoop(): void {
  if (mainLoopRunning) return;
  loopLastNow      = undefined;
  mainLoopRunning  = true;
  mainLoopRaf      = requestAnimationFrame(loop);
}

function stopRenderLoop(): void {
  mainLoopRunning = false;
  if (mainLoopRaf !== null) {
    cancelAnimationFrame(mainLoopRaf);
    mainLoopRaf = null;
  }
}

window.__handSabersStopRenderLoop = stopRenderLoop;
window.addEventListener('beforeunload', () => {
  stopRenderLoop();
  stopTracking();
  clearMapAudio();
  disposeGameplayResources();
  disposeSceneResources();
});

initHelpOverlay();
registerMlAssetCache();
initRemoteTrackingPairing();
window.addEventListener('hand-sabers:multiplayer-prepare', event => {
  const mapId = (event as CustomEvent<{ mapId?: unknown }>).detail?.mapId;
  if (typeof mapId === 'string') runAsyncTask('multiplayer-prepare', () => prepareMultiplayerMap(mapId));
});
window.addEventListener('hand-sabers:multiplayer-start', event => {
  const detail = (event as CustomEvent<{
    mapId?: unknown;
    mode?: unknown;
    rules?: unknown;
    saber?: unknown;
    startAtPerformance?: unknown;
  }>).detail;
  const rules = detail?.rules;
  if (
    typeof detail?.mapId === 'string'
    && (detail.mode === 'coop' || detail.mode === 'score-attack')
    && (detail.saber === 'left' || detail.saber === 'right' || detail.saber === 'both')
    && ((detail.mode === 'coop' && detail.saber !== 'both')
      || (detail.mode === 'score-attack' && detail.saber === 'both'))
    && rules
    && typeof rules === 'object'
    && !Array.isArray(rules)
    && typeof (rules as Record<string, unknown>)['trainingMode'] === 'boolean'
    && typeof (rules as Record<string, unknown>)['noFail'] === 'boolean'
    && typeof detail.startAtPerformance === 'number'
  ) {
    const roundDetail: Parameters<typeof beginMultiplayerRound>[0] = {
      mapId: detail.mapId,
      mode: detail.mode,
      rules: rules as MultiplayerRules,
      saber: detail.saber,
      startAtPerformance: detail.startAtPerformance,
    };
    runAsyncTask(
      'multiplayer-round-start',
      () => beginMultiplayerRound(roundDetail),
      () => window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-error')),
    );
  }
});

// ── Multiplayer round results — show ranking when server confirms round end
window.addEventListener('hand-sabers:multiplayer-results', event => {
  const detail = (event as CustomEvent<{ snapshot?: unknown }>).detail;
  const snapshot = detail?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') return;
  if (state.appState !== S.GAMEOVER) return;
  const localPlayerId = getCurrentPlayerId();
  if (!localPlayerId) return;
  const s = snapshot as Record<string, unknown>;
  if (!Array.isArray(s['players']) || !s['round']) return;
  const parsed = parseRoomSnapshot(snapshot);
  if (parsed) showMultiplayerResults(parsed, localPlayerId);
});

// ── Narrator pause/resume — pause gameplay while narrator buttons are visible
window.addEventListener('hand-sabers:narrator-pause', () => {
  if (state.appState === S.PLAYING) {
    state.appState = S.PAUSED;
    state.pauseReason = PAUSE_REASONS.NARRATOR;
    mapTimeline.pause(performance.now());
    hidePauseMenu();
  }
});
window.addEventListener('hand-sabers:narrator-resume', () => {
  if (state.appState === S.PAUSED && state.pauseReason === PAUSE_REASONS.NARRATOR) {
    void resumeGame(performance.now(), 'ui');
  }
});

initRemoteTrackingPreviews();
initMultiplayerOverlay(settings.playerName);
initMapPickerOverlay();
initProfileOnboarding();
gamePauseController.bindFocusProtection();
initMainMenu();
showFirstRunWelcome();
showProfileOnboardingIfNeeded();

// ── Phone audio remote playback ──────────────────────────────────────────
// Forward map audio events to the phone when phone audio output is active
window.addEventListener('hand-sabers:map-audio-start', event => {
  if (!isPhoneAudioActive()) return;
  const detail = (event as CustomEvent<{ offsetSec: number; playbackRate: number }>).detail;
  if (!detail) return;
  playPhoneAudio(detail.offsetSec, Date.now(), detail.playbackRate);
});
window.addEventListener('hand-sabers:map-audio-pause', () => {
  if (isPhoneAudioActive()) pausePhoneAudio();
});
window.addEventListener('hand-sabers:map-audio-stop', () => {
  if (isPhoneAudioActive()) stopPhoneAudio();
});
// Mute/restore PC music when phone takes over audio
window.addEventListener('hand-sabers:phone-audio-mute', () => {
  setMusicVolume(0);
});
window.addEventListener('hand-sabers:phone-audio-restore', (event) => {
  const detail = (event as CustomEvent<{ volume: number }>).detail;
  setMusicVolume(detail?.volume ?? settings.musicVolume);
});

// Handle map selection from the in-game map picker overlay
window.addEventListener('hand-sabers:map-selected', (event) => {
  const detail = (event as CustomEvent).detail as { mapId: string } | undefined;
  if (!detail?.mapId) return;
  void loadMapById(detail.mapId).then(success => {
    if (success) {
      void narratorQuick(t('narrator.mapLoaded'));
    } else {
      void narratorQuick(t('narrator.mapLoadFailed'));
    }
  });
});

const requestFirstRunTutorial = (force = false): void => {
  window.dispatchEvent(new CustomEvent('hand-sabers:open-tutorial', { detail: { force } }));
};

if (needsLanguageSelection()) {
  window.dispatchEvent(new CustomEvent('hand-sabers:open-settings', { detail: { tab: 'language' } }));
  window.setTimeout(() => {
    void narratorShow({ text: t('narrator.chooseLanguage'), buttons: [t('calib.ok')] });
  }, 250);
} else if (localStorage.getItem('hs_settings_recommendation_seen') !== '1') {
  localStorage.setItem('hs_settings_recommendation_seen', '1');
  window.setTimeout(() => {
    void narratorShow({
      text: t('narrator.configureSettings'),
      buttons: [t('narrator.openSettings'), t('narrator.quickGuide'), t('narrator.later')],
    }).then(choice => {
      if (choice === 0) {
        window.dispatchEvent(new CustomEvent('hand-sabers:open-settings', { detail: { tab: 'gameplay' } }));
      } else if (choice === 1) {
        requestFirstRunTutorial(true);
      }
    });
  }, 900);
} else {
  window.setTimeout(() => requestFirstRunTutorial(), 650);
}

runAsyncTask('application-startup', async () => {
  try {
    await tryLoadMapFromUrl();
  } catch (error) {
    reportRuntimeError('startup-map-load', error);
  }
  startRenderLoop();

  // Dev/test: ?narrator&text=Hello+world!&speed=slow&narrator_timeout_start=1000&narrator_timeout_end=5000
  const params = new URLSearchParams(location.search);
  if (params.has('narrator')) {
    const text       = params.get('text') ?? 'Hej! Jestem Lyra.';
    const speedKey   = params.get('speed') ?? 'default';
    const charMs     = NARRATOR_SPEEDS[speedKey] ?? NARRATOR_SPEEDS['default']!;
    const timeoutStart = params.has('narrator_timeout_start') ? Number(params.get('narrator_timeout_start')) : 0;
    const timeoutEnd   = params.has('narrator_timeout_end')   ? Number(params.get('narrator_timeout_end'))   : 0;

    if (timeoutStart > 0) await new Promise<void>(r => setTimeout(r, timeoutStart));
    await narratorShow({ text, charMs });
    if (timeoutEnd > 0) await new Promise<void>(r => setTimeout(r, timeoutEnd));
  }
});
