import { S, state } from '../core/state.ts';
import { ui, updateHUD, clearDangerPulse, showGameOver, hideHandsPaused, updateMapProgress, showMapTitle, hidePauseMenu, fadeTransition } from '../ui/ui.ts';
import {
  renderer, cam3d, bgMat,
  lSaber, rSaber, lTarget, rTarget, lVel, rVel,
  animateIdleSabers, resizeRenderer, disposeSceneResources,
  setScenePerformanceProfile, getScenePerformanceProfile, setHitPlaneVisible, setOneHandModeVisuals,
} from './scene.ts';
import { initAudio, initInterfaceSounds, stopMapAudio, hasMapAudio, clearMapAudio, applyAudioSettings } from './audio.ts';
import { initMP, setCalibAutoAdvanceHandler, setSaberTargetSetter, stopTracking, restoreCalibrationData } from '../tracking/tracking.ts';
import { setGameOverHandler, startGameplay, clearGameplayEntities, updateBlocks, resetMapSpawn, resetMenuDemo, prewarmGameplayResources, disposeGameplayResources } from './gameplay.ts';
import { updateFpsCounter } from '../ui/fps.ts';
import { initDevPanel, isDeveloperPanelEnabled, initCameraPanelToggle } from '../ui/devpanel.ts';
import type { FrameProfile } from '../ui/devpanel.ts';
import { loadSettings, setSetting } from '../core/settings.ts';
import { getAudioOffsetSec, nearestBeats } from '../core/timing.ts';
import { PAUSE_REASONS } from '../core/pause.ts';
import { t, translateDom } from '../i18n/index.ts';
import { initKeyboardNav } from '../ui/keyboard-nav.ts';
import { initHelpOverlay } from '../ui/help.ts';
import { registerMlAssetCache } from '../core/ml-cache.ts';
import { initMultiplayerOverlay, sendMultiplayerScore } from '../multiplayer/client.ts';
import { initRemoteTrackingPreviews } from '../multiplayer/remote-preview.ts';
import { initRemoteTrackingPairing, isRemoteTrackingConnected } from '../remote/host-pairing.ts';
import { narratorShow, NARRATOR_SPEEDS } from './narrator.ts';
import { initAchievements, recordGameEnd } from '../core/achievements.ts';
import { initSettingsTransfer } from '../ui/settings-transfer.ts';
import { initMapPickerOverlay, openMapPicker } from './map-picker.ts';
import { initProfileOnboarding, showProfileOnboardingIfNeeded } from './profile.ts';
import { applySaberAppearance } from './saber-settings.ts';
import { applyArenaTheme } from './arena-settings.ts';
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
import { createRenderLoop } from './render-loop.ts';
import { createMultiplayerScorePublisher } from './multiplayer-score-publisher.ts';
import { bindComboNarrator, showFirstRunWelcome } from './narrator-prompts.ts';
import { getCurrentBeatPulse, getCurrentMusicEnergy, updateMusicVisualizer } from './music-visualizer.ts';
import { initSettingsBindings } from './settings-bindings.ts';
import { initMultiplayerEvents, type MultiplayerRoundStart, type MultiplayerRules } from './multiplayer-events.ts';
import { nextFrameTiming, resetFrameTiming, smoothProfileValue } from './frame-timing.ts';
import { initPhoneAudioEvents } from './phone-audio-events.ts';
import { initStartupGuidance } from './startup-guidance.ts';
import { initMapSelectionEvents } from './map-selection-events.ts';
import { initNarratorPauseEvents } from './narrator-pause-events.ts';
import { updateArenaReactiveFrame } from './arena-reactive-frame.ts';
import { updateFrameEffects } from './frame-effects.ts';
import { renderAndReportFrame } from './frame-renderer.ts';

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
const multiplayerScorePublisher = createMultiplayerScorePublisher(() => multiplayerRoundActive);

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
  multiplayerScorePublisher.reset();
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

// ── Główna pętla ──────────────────────────────────────────────────────────────
let _nearestBeatAt   = 0;
const frameProfile: FrameProfile = { gameMs: 0, effectsMs: 0, reflectionMs: 0, cpuMs: 0 };

function renderFrame(timestamp: number): void {
  const now = timestamp;
  updateFpsCounter(now);
  const t = now * 0.001;

  const frameTiming   = nextFrameTiming(now);
  state.deltaMs       = frameTiming.deltaMs;
  state.deltaSec      = frameTiming.deltaSec;
  state.deltaScale    = frameTiming.deltaScale;
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
      if (mapTimeSec >= 0) multiplayerScorePublisher.publish(now, duration > 0 ? progressTime / duration : 0);
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
  updateArenaReactiveFrame({
    material: bgMat,
    camera: cam3d,
    musicEnergy,
    beatPulse,
    visualPressure,
    deltaSec: state.deltaSec,
  });
  if (profiling) frameProfile.gameMs = smoothProfileValue(frameProfile.gameMs, performance.now() - gamePhaseStart);

  const effectsProfile = updateFrameEffects({
    timeSec: t,
    musicEnergy,
    beatPulse,
    visualPressure,
    profiling,
  });
  if (profiling) {
    frameProfile.reflectionMs = smoothProfileValue(frameProfile.reflectionMs, effectsProfile.reflectionMs);
    frameProfile.effectsMs = smoothProfileValue(frameProfile.effectsMs, effectsProfile.effectsMs);
  }

  renderAndReportFrame({
    now,
    frameDeltaMs: frameTiming.deltaMs,
    profiling,
    frameProfile,
    profileStart,
  });
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

bindComboNarrator();

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
      settingsBindingsController.updateTrackingSourceHint();
      return;
    }
    menuShell.closeSettings();
    runAsyncTask('game-start', () => startFromMainMenu({ calibrate: false }));
  });
  menuShell.bindAction('mainCalibrate', () => {
    if (settings.trackingSource === 'phone' && !isRemoteTrackingConnected()) {
      menuShell.openSettings('remoteTracking');
      settingsBindingsController.updateTrackingSourceHint();
      return;
    }
    menuShell.closeSettings();
    runAsyncTask('calibration-start', () => startFromMainMenu({ calibrate: true }));
  });
  menuShell.bindAction('mainMaps', () => {
    openMapPicker();
  });

  const settingsBindingsController = initSettingsBindings({
    settings,
    applyTranslations,
    isTrackingStarted: () => trackingStarted,
    onStopTracking() {
      stopTracking();
      trackingStarted = false;
    },
    onCalibrationInvalidated() {
      calibrationController.setReady(false);
    },
  });
}

const { reportRuntimeError, runAsyncTask } = createRuntimeReporter({ showOverlay });
const renderLoop = createRenderLoop(renderFrame, reportRuntimeError);

function startRenderLoop(): void {
  resetFrameTiming();
  renderLoop.start();
}

function stopRenderLoop(): void {
  renderLoop.stop();
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
initMultiplayerEvents({
  onPrepare(mapId) {
    runAsyncTask('multiplayer-prepare', () => prepareMultiplayerMap(mapId));
  },
  onStart(detail: MultiplayerRoundStart) {
    runAsyncTask(
      'multiplayer-round-start',
      () => beginMultiplayerRound(detail),
      () => window.dispatchEvent(new CustomEvent('hand-sabers:multiplayer-prepare-error')),
    );
  },
});

initNarratorPauseEvents({ mapTimeline, resumeGame });

initRemoteTrackingPreviews();
initMultiplayerOverlay(settings.playerName);
initMapPickerOverlay();
initProfileOnboarding();
gamePauseController.bindFocusProtection();
initMainMenu();
showFirstRunWelcome();
showProfileOnboardingIfNeeded();

initPhoneAudioEvents(settings);
initMapSelectionEvents();

initStartupGuidance();

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
