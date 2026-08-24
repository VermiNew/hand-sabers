import { S, state } from '../core/state.ts';
import { ui, updateHUD, clearDangerPulse, showGameOver, showMultiplayerResults, showHandsPaused, hideHandsPaused, updateHandsResumeProgress, updateMapProgress, showMapTitle, showPauseMenu, hidePauseMenu, fadeTransition, showCameraError } from '../ui/ui.ts';
import {
  THREE, renderer, scene, cam3d, bgMat,
  lSaber, rSaber, lTarget, rTarget, lVel, rVel, lLight, rLight,
  animateIdleSabers, updateArenaPulse, updateLightReflections, updateReflection, resizeRenderer, adaptRenderQuality, disposeSceneResources,
  applyShake, setScenePerformanceProfile, getScenePerformanceProfile, setHitPlaneVisible, setOneHandModeVisuals,
} from './scene.ts';
import { initAudio, initInterfaceSounds, resumeAudioContext, stopMapAudio, getMapDuration, setMusicVolume, applyAudioSettings, loadMapAudio, hasMapAudio, clearMapAudio } from './audio.ts';
import { CALIB_STEPS, initMP, resetCalibration, finishCalibStep, renderCalibStep, setCalibAutoAdvanceHandler, setAutoFlipSuggestionHandler, setSaberTargetSetter, applyTrackingSettings, stopTracking, setManualCalibrationMode, getCalibrationData, restoreCalibrationData } from '../tracking/tracking.ts';
import { setGameOverHandler, startGameplay, clearGameplayEntities, updateBlocks, updateSparks, resetMapSpawn, updateMenuDemo, resetMenuDemo, prewarmGameplayResources, disposeGameplayResources } from './gameplay.ts';
import { updateFpsCounter } from '../ui/fps.ts';
import { initDevPanel, isDeveloperPanelEnabled, setDeveloperPanelEnabled, tickDevPanel, applyDevAccent, initCameraPanelToggle } from '../ui/devpanel.ts';
import type { FrameProfile } from '../ui/devpanel.ts';
import { loadMapFromFile, validateMap } from './maploader.ts';
import { loadSettings, resetSettings, setSetting } from '../core/settings.ts';
import { getPerformanceMode, getPerformanceModeDescription, getPerformanceModes, getPerformanceProfile } from '../core/performance.ts';
import { getAudioOffsetSec, nearestBeats } from '../core/timing.ts';
import { PAUSE_REASONS, canAutoResumeFromHands } from '../core/pause.ts';
import { appendLocalScore, getLocalMapById, loadLocalMapAudio } from '../core/localstore.ts';
import { t, needsLanguageSelection, translateDom } from '../i18n/index.ts';
import { initKeyboardNav } from '../ui/keyboard-nav.ts';
import { initHelpOverlay } from '../ui/help.ts';
import { registerMlAssetCache } from '../core/ml-cache.ts';
import { initMultiplayerOverlay, sendMultiplayerScore, getCurrentPlayerId } from '../multiplayer/client.ts';
import { parseRoomSnapshot } from '../multiplayer/protocol.ts';
import { initRemoteTrackingPreviews } from '../multiplayer/remote-preview.ts';
import { initRemoteTrackingPairing, isRemoteTrackingConnected } from '../remote/host-pairing.ts';
import { isPhoneAudioActive, preparePhoneAudio, playPhoneAudio, pausePhoneAudio, stopPhoneAudio } from '../remote/host-audio.ts';
import { narratorShow, narratorQuick, NARRATOR_SPEEDS, isNarratorVisible } from './narrator.ts';
import { initAchievements, getAllAchievements, getUnlockedCount, getTotalAchievements, getStats, recordGameEnd, resetAchievements, getDefinition, getUnlockedSet } from '../core/achievements.ts';
import { initLanguageSettings } from '../ui/language-settings.ts';
import { initSettingsTransfer } from '../ui/settings-transfer.ts';
import { initMapPickerOverlay, openMapPicker } from './map-picker.ts';
import { initProfileOnboarding, initProfileSettings, showProfileOnboardingIfNeeded } from './profile.ts';
import { initAudioSettings } from './audio-settings.ts';
import { initGameplaySettings } from './gameplay-settings.ts';
import { applySaberAppearance, initSaberSettings } from './saber-settings.ts';
import { applyArenaTheme, initArenaSettings } from './arena-settings.ts';
import { MapTimeline } from './map-timeline.ts';
import { getCurrentBeatPulse, getCurrentMusicEnergy, updateMusicVisualizer, getCurrentBassLevel, getCurrentMidLevel, getCurrentHighLevel } from './music-visualizer.ts';
import { updateSaberTrails } from './saber-trails.ts';
import type { PauseReason, PerformanceMode, Settings, TrackingSourcePreference } from '../types/index.js';

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

let lastRuntimeError = '';
let lastRuntimeErrorAt = 0;

function reportRuntimeError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const signature = `${context}:${message}`;
  const now = Date.now();
  if (signature !== lastRuntimeError || now - lastRuntimeErrorAt > 5_000) {
    console.error(`[${context}]`, error);
    lastRuntimeError = signature;
    lastRuntimeErrorAt = now;
  }
  if (ui.dStatus) ui.dStatus.textContent = `${t('errors.error')}: ${message}`;
  if (state.appState === S.LOADING || state.appState === S.CALIB) {
    showCameraError(error);
    showOverlay();
  }
}

function runAsyncTask(context: string, task: () => Promise<unknown>, onError?: () => void): void {
  void Promise.resolve()
    .then(task)
    .catch(error => {
      reportRuntimeError(context, error);
      try {
        onError?.();
      } catch (recoveryError) {
        reportRuntimeError(`${context}:recovery`, recoveryError);
      }
    });
}

function withDevQuery(url: string): string {
  const current = new URLSearchParams(location.search);
  const target  = new URL(url, location.href);
  for (const key of ['dev', 'testing']) {
    if (current.has(key)) target.searchParams.set(key, current.get(key) ?? '');
  }
  return `${target.pathname.split('/').pop()}${target.search}${target.hash}`;
}

function preserveDevQueryOnMenuLinks(): void {
  const current = new URLSearchParams(location.search);
  if (!current.has('dev') && !current.has('testing')) return;
  for (const link of document.querySelectorAll('.main-menu-footer a[href]')) {
    link.setAttribute('href', withDevQuery(link.getAttribute('href') ?? ''));
  }
}

// ── Score submit ──────────────────────────────────────────────────────────────
async function submitScore(progress?: number, trainingMode = settings.trainingMode): Promise<void> {
  if (trainingMode) return;

  const payload = {
    mapId:  state.map?.id ?? 'random',
    player: settings.playerName || t('player.defaultName'),
    score:  state.score,
    combo:  state.maxCombo,
    date:   new Date().toISOString(),
    ...(progress !== undefined ? { progress } : {}),
  };

  try {
    const res = await fetch('/api/scores', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Score submit failed: ${res.status}`);
  } catch {
    appendLocalScore(payload);
  }
}

// ── ?map= URL param ───────────────────────────────────────────────────────────
async function loadMapById(mapId: string): Promise<boolean> {
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(mapId)) return false;
  if (state.map?.id === mapId) return true;
  try {
    const res = await fetch(`/api/maps/${encodeURIComponent(mapId)}`);
    if (res.ok) {
      const map = await res.json() as Record<string, unknown>;
      if (validateMap(map)) {
        clearMapAudio();
        state.map = { ...map, _serverAudioPending: true } as unknown as typeof state.map;
        return true;
      }
    }
  } catch { /* fallback to local */ }

  const localMap = getLocalMapById(mapId);
  if (validateMap(localMap)) {
    clearMapAudio();
    state.map = { ...localMap, _localAudioPending: true, localOnly: true } as unknown as typeof state.map;
    return true;
  }
  return false;
}

async function tryLoadMapFromUrl(): Promise<void> {
  const mapId = new URLSearchParams(location.search).get('map');
  if (mapId) await loadMapById(mapId);
}

async function ensureCurrentMapAudio(): Promise<void> {
  if (!state.map || hasMapAudio()) return;

  if (state.map._serverAudioPending) {
    state.map._serverAudioPending = false;
    try {
      const audioUrl = state.map.meta?.audioUrl ?? `/api/maps/${encodeURIComponent(state.map.id ?? '')}/audio`;
      const res = await fetch(audioUrl);
      if (res.ok) {
        await loadMapAudio(await res.arrayBuffer());
        state.map._audioReady = true;
        const dur = getMapDuration();
        if (dur && !state.map.meta?.duration) state.map.meta = { ...(state.map.meta ?? {}), duration: dur };
        // Tell the phone to prepare audio if phone audio output is enabled
        if (settings.phoneAudioOutput && state.map.id) {
          preparePhoneAudio(audioUrl, state.map.id);
        }
        return;
      }
    } catch (err) {
      console.warn('Server map audio restore failed:', err);
    }
  }

  if (!state.map._localAudioPending && !state.map.localOnly) return;

  try {
    const rec = await loadLocalMapAudio(state.map.id ?? '');
    if (!rec?.arrayBuffer) return;
    await loadMapAudio(rec.arrayBuffer);
    state.map._localAudioPending = false;
    state.map._audioReady        = true;
    const dur = getMapDuration();
    if (dur && !state.map.meta?.duration) state.map.meta = { ...(state.map.meta ?? {}), duration: dur };
  } catch (err) {
    console.warn('Local map audio restore failed:', err);
  }
}

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

let calibrationReady = false;
let multiplayerPreparationMapId = '';

function showCalibPanel(): void {
  if (ui.calibPanel) ui.calibPanel.classList.add('show');
}

function hideCalibPanel(): void {
  if (ui.calibPanel) ui.calibPanel.classList.remove('show');
}

function startCalib(): void {
  // Guard: if the user aborted during loading, don't enter calibration
  if (state.appState !== S.LOADING) return;
  showCalibPanel();
  resetCalibration();
  state.appState = S.CALIB;
  if (ui.dStatus) ui.dStatus.textContent = 'CALIB';
  // Show mode selector first; actual calibration starts when user picks a mode
  showCalibModeSelector();
}

function showCalibModeSelector(): void {
  const selector = document.getElementById('calibModeSelector');
  if (selector) selector.hidden = false;
  // Hide step content while selector is visible
  const badge = document.getElementById('calibStepBadge');
  const stepTitle = document.getElementById('calibStep');
  const stepDesc = document.getElementById('calibInstr');
  const progressWrap = document.querySelector('.calib-progress-wrap');
  const progressLabel = document.getElementById('calibProgressLabel');
  const actions = document.querySelector('.calib-actions');
  if (badge) badge.hidden = true;
  if (stepTitle) stepTitle.hidden = true;
  if (stepDesc) stepDesc.hidden = true;
  if (progressWrap) (progressWrap as HTMLElement).hidden = true;
  if (progressLabel) progressLabel.hidden = true;
  if (actions) (actions as HTMLElement).hidden = true;

  // Restore checkbox state from settings
  const checkbox = document.getElementById('calibRememberCheckbox') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = settings.rememberCalibration;
}

function hideCalibModeSelector(): void {
  const selector = document.getElementById('calibModeSelector');
  if (selector) selector.hidden = true;
  // Show step content
  const badge = document.getElementById('calibStepBadge');
  const stepTitle = document.getElementById('calibStep');
  const stepDesc = document.getElementById('calibInstr');
  const progressWrap = document.querySelector('.calib-progress-wrap');
  const progressLabel = document.getElementById('calibProgressLabel');
  const actions = document.querySelector('.calib-actions');
  if (badge) badge.hidden = false;
  if (stepTitle) stepTitle.hidden = false;
  if (stepDesc) stepDesc.hidden = false;
  if (progressWrap) (progressWrap as HTMLElement).hidden = false;
  if (progressLabel) progressLabel.hidden = false;
  if (actions) (actions as HTMLElement).hidden = false;
}

function beginCalibrationSteps(mode: 'manual' | 'auto'): void {
  setSetting('calibrationMode', mode);
  const isManual = mode === 'manual';
  setManualCalibrationMode(isManual);
  const nextBtn = document.getElementById('calibBtnNext');
  if (nextBtn) nextBtn.style.display = isManual ? '' : 'none';

  // Save "remember calibration" checkbox state
  const checkbox = document.getElementById('calibRememberCheckbox') as HTMLInputElement | null;
  if (checkbox) setSetting('rememberCalibration', checkbox.checked);

  hideCalibModeSelector();
  state.calibIdx = 0;
  renderCalibStep();
}

async function advanceCalib(): Promise<void> {
  finishCalibStep(state.calibIdx);
  if (state.calibIdx < CALIB_STEPS.length - 1) {
    state.calibIdx++;
    renderCalibStep();
    return;
  }
  calibrationReady = true;
  // Save calibration data if "remember calibration" is enabled
  if (settings.rememberCalibration) {
    const data = getCalibrationData();
    setSetting('savedCalibration', {
      minX: data.minX, maxX: data.maxX,
      minY: data.minY, maxY: data.maxY,
      rangeX: data.rangeX, rangeY: data.rangeY,
    });
  }
  if (multiplayerPreparationMapId) {
    completeMultiplayerPreparation();
    return;
  }
  await beginPlaying();
}

function completeMultiplayerPreparation(): void {
  const mapId = multiplayerPreparationMapId;
  multiplayerPreparationMapId = '';
  hideCalibPanel();
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
    await ensureCurrentMapAudio();
    if (calibrationReady) {
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
  await ensureCurrentMapAudio();
  resetGameplayFocusProtection();
  clearGameplayEntities();
  stopMapAudio();
  mapTimeline.reset();
  hideCalibPanel();
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
  handsLostSince = 0;
  handsReturnedSince = 0;
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
  resetGameplayFocusProtection();
  hideCalibPanel();
  hideOverlay();
  if (ui.hud)                       ui.hud.style.display        = 'flex';
  if (ui.mapProgress && state.map)  ui.mapProgress.style.display = 'flex';
  hideHandsPaused();
  hidePauseMenu();
  handsLostSince     = 0;
  handsReturnedSince = 0;
  state.pauseReason  = PAUSE_REASONS.NONE;
  state.appState     = S.PLAYING;

  if (state.map) {
    await ensureCurrentMapAudio();
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
  resetGameplayFocusProtection();
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
  runAsyncTask('score-submit', () => submitScore(progress, wasTrainingMode));
  fadeTransition(() => { showGameOver(state, victory); });
}

function restartGame(): void {
  clearDangerPulse();
  clearGameplayEntities();
  stopMapAudio();
  mapTimeline.reset();
  hideHandsPaused();
  hidePauseMenu();
  handsLostSince = handsReturnedSince = 0;
  state.pauseReason = PAUSE_REASONS.NONE;
  startCalib();
}

function restartWithoutCalib(): void {
  clearDangerPulse();
  clearGameplayEntities();
  stopMapAudio();
  mapTimeline.reset();
  hideHandsPaused();
  hidePauseMenu();
  handsLostSince = handsReturnedSince = 0;
  state.pauseReason = PAUSE_REASONS.NONE;
  runAsyncTask('game-restart', beginPlaying);
}

// ── Pauza ─────────────────────────────────────────────────────────────────────
const HANDS_LOST_PAUSE_MS = 330;
const HANDS_RESUME_MS     = 1000;
let handsLostSince     = 0;
let handsReturnedSince = 0;

function hasRequiredHands(): boolean {
  if (state.oneHandMode === 'left')  return state.handsLeftActive;
  if (state.oneHandMode === 'right') return state.handsRightActive;
  return state.handsLeftActive && state.handsRightActive;
}

function missingHandsText(): string {
  if (state.oneHandMode === 'left')  return t('hands.oneHandLeft');
  if (state.oneHandMode === 'right') return t('hands.oneHandRight');
  return !state.handsLeftActive && !state.handsRightActive
    ? t('hands.bothMissing')
    : !state.handsLeftActive ? t('hands.leftMissing')
    : t('hands.rightMissing');
}

type ResumeSource = 'ui' | 'keyboard' | 'hands';

const FOCUS_RESUME_GUARD_MS = 450;
let focusResumeAllowedAt = 0;
let focusResumeGuardTimer = 0;
let resumeInFlight = false;

function setPauseMenuMessage(reason: PauseReason): void {
  const message = document.getElementById('pauseMenuSub');
  if (!message) return;
  if (reason === PAUSE_REASONS.FOCUS) {
    message.textContent = `${t('pause.focusLost')} ${t('pause.focusResumeHint')}`;
    message.hidden = false;
  } else if (reason === PAUSE_REASONS.HANDS) {
    message.textContent = t('pause.handsLostManual');
    message.hidden = false;
  } else {
    message.textContent = '';
    message.hidden = true;
  }
}

function setFocusResumeButtonDisabled(disabled: boolean): void {
  const resumeButton = document.getElementById('pauseResume') as HTMLButtonElement | null;
  if (resumeButton) resumeButton.disabled = disabled;
}

function armFocusResumeGuard(now = performance.now()): void {
  window.clearTimeout(focusResumeGuardTimer);
  focusResumeAllowedAt = now + FOCUS_RESUME_GUARD_MS;
  setFocusResumeButtonDisabled(true);
  focusResumeGuardTimer = window.setTimeout(() => {
    if (
      state.appState === S.PAUSED
      && state.pauseReason === PAUSE_REASONS.FOCUS
      && !document.hidden
      && document.hasFocus()
    ) {
      setFocusResumeButtonDisabled(false);
    }
  }, FOCUS_RESUME_GUARD_MS);
}

function pauseGame(reason: PauseReason, now = performance.now()): void {
  if (state.appState !== S.PLAYING) return;
  state.appState    = S.PAUSED;
  state.pauseReason = reason;
  clearDangerPulse();
  mapTimeline.pause(now);
  if (reason === PAUSE_REASONS.HANDS) {
    // Show hands banner (camera preview + resume progress) AND full pause menu
    // so the player can manually resume, restart, or quit
    showHandsPaused(missingHandsText());
    setFocusResumeButtonDisabled(false);
    setPauseMenuMessage(reason);
    syncPauseMenuActions();
    showPauseMenu();
  } else {
    if (reason === PAUSE_REASONS.FOCUS) {
      focusResumeAllowedAt = Number.POSITIVE_INFINITY;
      setFocusResumeButtonDisabled(true);
    } else {
      setFocusResumeButtonDisabled(false);
    }
    hideHandsPaused();
    setPauseMenuMessage(reason);
    syncPauseMenuActions();
    showPauseMenu();
  }
  if (ui.dStatus) ui.dStatus.textContent = reason === PAUSE_REASONS.HANDS ? t('game.pauseHands') : t('game.pause');
}

async function resumeGame(now = performance.now(), source: ResumeSource = 'ui'): Promise<boolean> {
  if (state.appState !== S.PAUSED || resumeInFlight) return false;
  const pausedReason = state.pauseReason;
  if (
    pausedReason === PAUSE_REASONS.FOCUS
    && (source === 'hands' || document.hidden || !document.hasFocus() || now < focusResumeAllowedAt)
  ) {
    return false;
  }

  resumeInFlight = true;
  try {
    const audioReady = !hasMapAudio() || await resumeAudioContext();
    if (!audioReady) {
      console.warn('Gameplay resume blocked because the audio context is not running.');
      return false;
    }
    if (state.appState !== S.PAUSED || state.pauseReason !== pausedReason) return false;

    const syncNow = performance.now();
    mapTimeline.resume(syncNow);
    state.appState    = S.PLAYING;
    state.pauseReason = PAUSE_REASONS.NONE;
    focusResumeAllowedAt = 0;
    window.clearTimeout(focusResumeGuardTimer);
    focusResumeGuardTimer = 0;
    setFocusResumeButtonDisabled(false);
    setPauseMenuMessage(PAUSE_REASONS.NONE);
    hideHandsPaused();
    hidePauseMenu();
    if (ui.dStatus) ui.dStatus.textContent = 'PLAYING';
    return true;
  } finally {
    resumeInFlight = false;
  }
}

let multiplayerFocusWarningPending = false;
let multiplayerFocusWarningOpen = false;
let multiplayerFocusViolationActive = false;

function resetGameplayFocusProtection(): void {
  focusResumeAllowedAt = 0;
  window.clearTimeout(focusResumeGuardTimer);
  focusResumeGuardTimer = 0;
  setFocusResumeButtonDisabled(false);
  resumeInFlight = false;
  multiplayerFocusWarningPending = false;
  multiplayerFocusWarningOpen = false;
  multiplayerFocusViolationActive = false;
  setPauseMenuMessage(PAUSE_REASONS.NONE);
}

function showMultiplayerFocusWarning(): void {
  if (!multiplayerFocusWarningPending || multiplayerFocusWarningOpen) return;
  if (!multiplayerRoundActive || state.appState !== S.PLAYING) {
    multiplayerFocusWarningPending = false;
    multiplayerFocusViolationActive = false;
    return;
  }
  if (document.hidden) return;

  multiplayerFocusWarningPending = false;
  multiplayerFocusWarningOpen = true;
  try {
    window.alert(t('multiplayer.focusWarning'));
    window.focus();
  } finally {
    multiplayerFocusWarningOpen = false;
    window.setTimeout(() => { multiplayerFocusViolationActive = false; }, 0);
  }
}

function handleGameplayFocusLoss(): void {
  if (state.appState !== S.PLAYING) return;

  if (!multiplayerRoundActive) {
    pauseGame(PAUSE_REASONS.FOCUS, performance.now());
    return;
  }

  if (multiplayerFocusViolationActive) return;
  multiplayerFocusViolationActive = true;
  multiplayerFocusWarningPending = true;
  window.setTimeout(showMultiplayerFocusWarning, 0);
}

function handleGameplayFocusReturn(): void {
  if (!document.hidden && document.hasFocus() && state.pauseReason === PAUSE_REASONS.FOCUS) {
    armFocusResumeGuard(performance.now());
  }
  showMultiplayerFocusWarning();
}

function bindGameplayFocusProtection(): void {
  window.addEventListener('blur', handleGameplayFocusLoss);
  window.addEventListener('focus', handleGameplayFocusReturn);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handleGameplayFocusLoss();
    else handleGameplayFocusReturn();
  });
}

function updateHandsPauseState(now: number): void {
  if (multiplayerRoundActive) {
    handsLostSince = 0;
    handsReturnedSince = 0;
    return;
  }
  const ready = hasRequiredHands();

  if (state.appState === S.PLAYING) {
    if (!ready) {
      if (!handsLostSince) handsLostSince = now;
      if (now - handsLostSince >= HANDS_LOST_PAUSE_MS) {
        pauseGame(PAUSE_REASONS.HANDS, now);
        handsLostSince = handsReturnedSince = 0;
      }
    } else {
      handsLostSince = 0;
    }
  } else if (state.appState === S.PAUSED && state.pauseReason !== null && canAutoResumeFromHands(state.pauseReason)) {
    if (ready) {
      if (!handsReturnedSince) handsReturnedSince = now;
      const stableMs = now - handsReturnedSince;
      updateHandsResumeProgress(stableMs / HANDS_RESUME_MS);
      if (stableMs >= HANDS_RESUME_MS) {
        void resumeGame(now, 'hands');
        handsReturnedSince = 0;
      }
    } else {
      handsReturnedSince = 0;
      updateHandsResumeProgress(0);
      if (ui.pauseSub) ui.pauseSub.textContent = missingHandsText();
    }
  }
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

// ── Miecze 240 Hz ─────────────────────────────────────────────────────────────
const SABER_INTERVAL_MS = 1000 / 240;
let lastSaberMs = 0;

const tmpSaberUp      = new THREE.Vector3();
const tmpSaberRight   = new THREE.Vector3();
const tmpSaberForward = new THREE.Vector3();
const tmpSaberMatrix  = new THREE.Matrix4();
const tmpSaberQuat    = new THREE.Quaternion();

function frameScaledLerp(baseAmount: number, deltaScale: number): number {
  return 1 - Math.pow(1 - baseAmount, Math.max(0, deltaScale));
}

function applyTrackedSaberQuaternion(saber: THREE.Group, trackedQuat: { bladeDir: { x: number; y: number; z: number }; rollDir: { x: number; y: number; z: number } } | null, amount = 0.14): void {
  if (!trackedQuat) return;
  const { bladeDir: bd, rollDir: rd } = trackedQuat;
  tmpSaberUp.set(bd.x, bd.y, bd.z);
  tmpSaberRight.set(rd.x, rd.y, rd.z);
  tmpSaberForward.crossVectors(tmpSaberUp, tmpSaberRight).normalize();
  tmpSaberMatrix.makeBasis(tmpSaberRight, tmpSaberUp, tmpSaberForward);
  tmpSaberQuat.setFromRotationMatrix(tmpSaberMatrix);
  saber.quaternion.slerp(tmpSaberQuat, amount);
}

function updateSabers(now: number): void {
  const elapsed = lastSaberMs ? now - lastSaberMs : SABER_INTERVAL_MS;
  if (elapsed < SABER_INTERVAL_MS) return;
  lastSaberMs = now;
  const deltaScale = THREE.MathUtils.clamp(elapsed / (1000 / 60), 0.25, 3.0);
  const posLerp    = frameScaledLerp(0.18, deltaScale);
  const rollLerp   = frameScaledLerp(0.12, deltaScale);
  const pitchLerp  = frameScaledLerp(0.10, deltaScale);
  const quatLerp   = frameScaledLerp(0.14, deltaScale);

  lSaber.position.lerp(lTarget, posLerp);
  rSaber.position.lerp(rTarget, posLerp);
  lVel.subVectors(lTarget, lSaber.position);
  rVel.subVectors(rTarget, rSaber.position);
  lSaber.rotation.z = THREE.MathUtils.lerp(lSaber.rotation.z, -0.2 - lVel.x * 1.5, rollLerp);
  rSaber.rotation.z = THREE.MathUtils.lerp(rSaber.rotation.z,  0.2 - rVel.x * 1.5, rollLerp);
  lSaber.rotation.x = THREE.MathUtils.lerp(lSaber.rotation.x, lVel.y * 0.8, pitchLerp);
  rSaber.rotation.x = THREE.MathUtils.lerp(rSaber.rotation.x, rVel.y * 0.8, pitchLerp);

  applyTrackedSaberQuaternion(lSaber, state.saberQuatL, quatLerp);
  applyTrackedSaberQuaternion(rSaber, state.saberQuatR, quatLerp);
}

// ── Main menu autoplay demo ───────────────────────────────────────────────────
function isMainMenuOpen(): boolean {
  return state.appState === S.MENU;
}

const lSmoothed = new THREE.Vector3(-0.72, 1.08, 1.55);
const rSmoothed = new THREE.Vector3( 0.72, 1.08, 1.55);

function updateMenuAutoplay(now: number, t: number): void {
  updateMenuDemo(now, t);
  const target = window.__menuDemoTarget;

  // Gentle breathing idle — low frequency, small amplitude, offset phases
  const idleLx = -0.72 + Math.sin(t * 0.55) * 0.07 + Math.sin(t * 0.31) * 0.04;
  const idleLy =  1.10 + Math.sin(t * 0.42) * 0.06 + Math.sin(t * 0.73) * 0.03;
  const idleRx =  0.72 + Math.sin(t * 0.55 + 1.9) * 0.07 + Math.sin(t * 0.28 + 0.8) * 0.04;
  const idleRy =  1.10 + Math.sin(t * 0.39 + 1.2) * 0.06 + Math.sin(t * 0.67 + 0.5) * 0.03;

  let desiredLx = idleLx, desiredLy = idleLy, desiredLz = 1.55;
  let desiredRx = idleRx, desiredRy = idleRy, desiredRz = 1.55;

  if (target) {
    // hitWindow: 0 = block far away, 1 = block at hit plane
    const hitWindow = THREE.MathUtils.clamp((target.z + 2.2) / 4.0, 0, 1);
    const swingArc  = Math.sin(hitWindow * Math.PI);
    const cross     = swingArc * 0.55;
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

  // Speed-capped move: constant units/s so distant and close targets feel the same
  const SABER_SPEED = 3.2; // world units per second
  const dt = THREE.MathUtils.clamp((state.deltaSec ?? 0.016), 0, 0.1);
  const maxStep = SABER_SPEED * dt;

  const moveAxis = (cur: number, des: number) => cur + THREE.MathUtils.clamp(des - cur, -maxStep, maxStep);
  lSmoothed.x = moveAxis(lSmoothed.x, desiredLx);
  lSmoothed.y = moveAxis(lSmoothed.y, desiredLy);
  lSmoothed.z = moveAxis(lSmoothed.z, desiredLz);
  rSmoothed.x = moveAxis(rSmoothed.x, desiredRx);
  rSmoothed.y = moveAxis(rSmoothed.y, desiredRy);
  rSmoothed.z = moveAxis(rSmoothed.z, desiredRz);

  lTarget.copy(lSmoothed);
  rTarget.copy(rSmoothed);

  updateSabers(now);

  // Gentle tilt matching idle drift — no additive accumulation
  lSaber.rotation.z = THREE.MathUtils.lerp(lSaber.rotation.z, -0.18 + Math.sin(t * 0.44) * 0.08, 0.04);
  rSaber.rotation.z = THREE.MathUtils.lerp(rSaber.rotation.z,  0.18 + Math.sin(t * 0.44 + 1.9) * 0.08, 0.04);

  cam3d.position.x = 0.36 + Math.sin(t * 0.18) * 0.06;
  cam3d.position.y = 1.56 + Math.sin(t * 0.23) * 0.018;
  cam3d.lookAt(0.18, 1.08, -7.5);
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
  updateHandsPauseState(now);

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
  else runAsyncTask('calibration-advance', advanceCalib);
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

// ── Wczytanie mapy (drag & drop na ekranie gry) ───────────────────────────────
function bindMapDrop(canvas: HTMLElement): void {
  canvas.addEventListener('dragover', e => e.preventDefault());
  canvas.addEventListener('drop', async (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    try {
      const wasInGame = state.appState === S.PLAYING || state.appState === S.PAUSED || state.appState === S.GAMEOVER;
      initAudio();
      stopMapAudio();
      clearMapAudio();
      clearGameplayEntities();
      resetMapSpawn();
      mapTimeline.reset();

      const map = await loadMapFromFile(file);
      state.map = validateMap(map) ? map : { ...map, beats: null } as typeof state.map;
      if (ui.dStatus) ui.dStatus.textContent = `MAP: ${map.meta?.title ?? file.name}`;

      if (wasInGame) {
        hideHandsPaused();
        hidePauseMenu();
        hideOverlay();
        state.pauseReason = PAUSE_REASONS.NONE;
        state.appState    = S.PLAYING;
        if (ui.hud) ui.hud.style.display = 'flex';
        if (ui.mapProgress && state.map) ui.mapProgress.style.display = 'flex';
        mapTimeline.start(performance.now());
        startGameplay();
        showMapTitle(state.map?.meta?.title ?? file.name);
      }
    } catch (err) {
      console.error('Map load error:', err);
      if (ui.dStatus) ui.dStatus.textContent = `MAP ERROR: ${(err as Error).message}`;
    }
  });
}

function initMapDrop(): void {
  const canvas = document.getElementById('gameCanvas');
  if (canvas) bindMapDrop(canvas);
  window.addEventListener('hand-sabers:renderer-canvas-replaced', event => {
    const nextCanvas = (event as CustomEvent<HTMLCanvasElement>).detail;
    if (nextCanvas) bindMapDrop(nextCanvas);
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

// Apply translations to static pause UI elements
const applyPauseTranslations = (): void => {
  document.querySelectorAll('.pause-title, .pause-menu-title').forEach(el => { el.textContent = t('pause.title'); });
  const pauseSub = document.getElementById('pauseSub');
  if (pauseSub) pauseSub.textContent = t('pause.handsLost');
  const el = (id: string) => document.getElementById(id);
  const setText = (id: string, key: string) => { const e = el(id); if (e) e.textContent = t(key); };
  setText('pauseResume',  'pause.resume');
  setText('pauseRestart', 'pause.restart');
  setText('pauseMaps',    'pause.maps');
  setText('pauseQuit',    'pause.mainMenu');
};
applyPauseTranslations();

function syncPauseMenuActions(): void {
  const restart = document.getElementById('pauseRestart') as HTMLButtonElement | null;
  const maps = document.getElementById('pauseMaps') as HTMLButtonElement | null;
  const quit = document.getElementById('pauseQuit') as HTMLButtonElement | null;
  const title = document.querySelector('.pause-menu-title');
  if (restart) restart.hidden = multiplayerRoundActive;
  if (maps) maps.hidden = multiplayerRoundActive;
  if (quit) quit.textContent = t(multiplayerRoundActive ? 'pause.leaveRoomMenu' : 'pause.mainMenu');
  if (title) title.textContent = t(multiplayerRoundActive ? 'pause.titleMP' : 'pause.title');
}

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

function initAchievementUI(): void {
  window.addEventListener('hand-sabers:achievement', (event) => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    showAchievementToast(id);
  });

  const resetBtn = document.getElementById('achResetBtn');
  resetBtn?.addEventListener('click', () => {
    if (confirm(t('settings.resetConfirm'))) {
      resetAchievements();
      renderAchievementCompactGrid();
    }
  });
}

function showAchievementToast(id: string): void {
  const def = getDefinition(id);
  if (!def) return;
  const toast = document.getElementById('achievementToast');
  const icon = document.getElementById('achToastIcon');
  const title = document.getElementById('achToastTitle');
  if (!toast || !icon || !title) return;
  icon.textContent = def.icon;
  icon.className = `material-symbols-rounded ach-toast-icon ach-tier-${def.tier}`;
  title.textContent = t(`achievements.names.${id}`);
  let tier = document.getElementById('achToastTier');
  if (!tier) {
    tier = document.createElement('span');
    tier.id = 'achToastTier';
    tier.className = 'ach-toast-tier';
    title.insertAdjacentElement('afterend', tier);
  }
  tier.className = `ach-toast-tier ach-tier-${def.tier}`;
  tier.textContent = t(`achievements.tiers.${def.tier}`);
  toast.hidden = false;
  toast.classList.add('is-visible');
  clearTimeout((toast as unknown as { _timer?: ReturnType<typeof setTimeout> })._timer);
  (toast as unknown as { _timer?: ReturnType<typeof setTimeout> })._timer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => { toast.hidden = true; }, 350);
  }, 4000);
}

function renderStatsGrid(): void {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;
  const stats = getStats();
  const accuracy = (stats.totalHits + stats.totalMisses) > 0
    ? Math.round((stats.totalHits / (stats.totalHits + stats.totalMisses)) * 100)
    : 0;
  const hours = Math.floor(stats.totalPlayTimeMs / 3600000);
  const minutes = Math.floor((stats.totalPlayTimeMs % 3600000) / 60000);
  const fullTotalScore = String(stats.totalScore);
  const totalScoreValue = new Intl.NumberFormat(document.documentElement.lang || 'pl', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(stats.totalScore);

  const items = [
    { key: 'totalGames', value: String(stats.totalGames) },
    { key: 'gamesWon', value: String(stats.gamesWon) },
    { key: 'gamesLost', value: String(stats.gamesLost) },
    { key: 'totalHits', value: String(stats.totalHits) },
    { key: 'totalMisses', value: String(stats.totalMisses) },
    { key: 'accuracy', value: `${accuracy}%` },
    { key: 'bestCombo', value: `×${stats.maxCombo}` },
    { key: 'totalScore', value: totalScoreValue, fullValue: fullTotalScore },
    { key: 'perfectHits', value: String(stats.perfectHits) },
    { key: 'mapsCompleted', value: String(stats.mapsCompleted) },
    { key: 'totalPlayTime', value: `${hours}h ${minutes}m` },
  ];

  grid.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('div');
    card.className = `stat-card${item.key === 'totalScore' ? ' stat-card-score' : ''}`;
    card.innerHTML = `
      <span class="stat-value">${item.value}</span>
      <span class="stat-label">${t(`stats.${item.key}`)}</span>
    `;
    if (item.fullValue) {
      card.title = item.fullValue;
      card.setAttribute('aria-label', `${t('stats.totalScore')}: ${item.fullValue}`);
    }
    grid.appendChild(card);
  }
}

function renderAchievementCompactGrid(): void {
  const grid = document.getElementById('achCompactGrid');
  if (!grid) return;
  const defs = getAllAchievements();
  const unlocked = getUnlockedSet();
  grid.innerHTML = '';
  for (const a of defs) {
    const card = document.createElement('div');
    card.className = 'ach-compact-card' + (unlocked.has(a.id) ? '' : ' is-locked');
    card.innerHTML = `<span class="material-symbols-rounded">${a.icon}</span><span class="ach-compact-name">${t(`achievements.names.${a.id}`)}</span>`;
    grid.appendChild(card);
  }
  const progressText = document.getElementById('achProgressText');
  const progressFill = document.getElementById('achProgressFill');
  const unlockedCount = getUnlockedCount();
  const total = getTotalAchievements();
  if (progressText) progressText.textContent = `${unlockedCount} / ${total}`;
  if (progressFill) progressFill.style.width = `${total > 0 ? (unlockedCount / total) * 100 : 0}%`;
}

ui.ovBtn?.addEventListener('click',       handleOverlayButton);
ui.ovBtnMaps?.addEventListener('click',   () => { openMapPicker(); });
ui.ovBtnCalib?.addEventListener('click',  handleCalibButton);
ui.calibBtnNext?.addEventListener('click',  () => { initAudio(); runAsyncTask('calibration-advance', advanceCalib); });
ui.calibBtnRetry?.addEventListener('click', () => { initAudio(); restartGame(); });
ui.calibBtnMenu?.addEventListener('click',  returnToMainMenu);
document.getElementById('calibModeAuto')?.addEventListener('click',   () => { initAudio(); beginCalibrationSteps('auto'); });
document.getElementById('calibModeManual')?.addEventListener('click', () => { initAudio(); beginCalibrationSteps('manual'); });
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
  resetGameplayFocusProtection();
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
    hideCalibPanel();
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
ui.ovBtnMenu?.addEventListener('click', returnToMainMenu);
ui.calibAbortBtn?.addEventListener('click', returnToMainMenu);

// Abort button on loading screen — cancels tracking init and returns to menu
function abortLoading(): void {
  if (trackingStarting || (trackingStarted && state.appState === S.LOADING)) {
    stopTracking();
    trackingStarted = false;
    trackingStarting = false;
  }
  calibrationReady = false;
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
  if (state.appState === S.CALIB) runAsyncTask('calibration-auto-advance', advanceCalib);
});
initDevPanel(renderer, null);
initCameraPanelToggle();
initMapDrop();
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
    if (calibrate || !calibrationReady) restartGame();
    else restartWithoutCalib();
    return;
  }

  // If "remember calibration" is enabled and we have saved data, skip calibration
  if (!calibrate && settings.rememberCalibration && settings.savedCalibration) {
    calibrationReady = true;
  } else if (calibrate) {
    // Explicit recalibration — invalidate saved calibration
    calibrationReady = false;
    if (settings.savedCalibration) setSetting('savedCalibration', null);
  }

  if (trackingStarting) return;
  trackingStarting = true;
  trackingStarted = await initMP(() => {
    // After tracking init, if we have saved calibration, restore it and skip calibration steps
    if (calibrationReady && settings.savedCalibration) {
      restoreCalibrationData(settings.savedCalibration);
      if (multiplayerPreparationMapId) {
        completeMultiplayerPreparation();
        return;
      }
      runAsyncTask('game-start-skip-calib', beginPlaying);
    } else {
      startCalib();
    }
  });
  trackingStarting = false;
}

function triggerMenuEnter(): void {
  const mainMenu = document.getElementById('mainMenu');
  if (!mainMenu) return;
  mainMenu.classList.remove('is-leaving');
  mainMenu.classList.remove('is-entering');
  void mainMenu.offsetWidth;
  mainMenu.classList.add('is-entering');
  setTimeout(() => mainMenu.classList.remove('is-entering'), 800);
}

function initMainMenu(): void {
  document.body.classList.add('menu-open');
  preserveDevQueryOnMenuLinks();
  resetMenuDemo();
  triggerMenuEnter();

  const navItems         = [...document.querySelectorAll<HTMLElement>('.main-nav-item:not(.is-disabled)')];
  const settingsBackdrop = document.getElementById('mainSettingsBackdrop');
  const settingsPanel    = document.getElementById('mainSettingsPanel');
  const settingsButton   = document.getElementById('mainSettings');
  const settingsClose    = document.getElementById('mainSettingsClose');
  const settingsReset    = document.getElementById('mainSettingsReset');
  const flipCameraInput  = document.getElementById('menuFlipCamera')as HTMLInputElement | null;
  const performanceInput = document.getElementById('menuPerformanceMode') as HTMLSelectElement | null;
  const customGraphicsSection = document.getElementById('menuCustomGraphicsSection');
  const customAntialiasInput = document.getElementById('menuCustomAntialias') as HTMLInputElement | null;
  const customReflectionsInput = document.getElementById('menuCustomReflections') as HTMLInputElement | null;
  const customFloorGlowsInput = document.getElementById('menuCustomFloorGlows') as HTMLInputElement | null;
  const customSaberGlintsInput = document.getElementById('menuCustomSaberGlints') as HTMLInputElement | null;
  const customSaberTrailsInput = document.getElementById('menuCustomSaberTrails') as HTMLInputElement | null;
  const customSaberTrailSamplesInput = document.getElementById('menuCustomSaberTrailSamples') as HTMLInputElement | null;
  const customSaberTrailSamplesValue = document.getElementById('menuCustomSaberTrailSamplesValue');
  const customSaberTrailIntensityInput = document.getElementById('menuCustomSaberTrailIntensity') as HTMLInputElement | null;
  const customSaberTrailIntensityValue = document.getElementById('menuCustomSaberTrailIntensityValue');
  const customArenaDetailInput = document.getElementById('menuCustomArenaDetail') as HTMLInputElement | null;
  const customArenaDetailValue = document.getElementById('menuCustomArenaDetailValue');
  const customBackgroundShaderInput = document.getElementById('menuCustomBackgroundShader') as HTMLInputElement | null;
  const customFogInput = document.getElementById('menuCustomFog') as HTMLInputElement | null;
  const customGridInput = document.getElementById('menuCustomGrid') as HTMLInputElement | null;
  const customHitShardsInput = document.getElementById('menuCustomHitShards') as HTMLInputElement | null;
  const customHitShardsValue = document.getElementById('menuCustomHitShardsValue');
  const customRenderScaleInput = document.getElementById('menuCustomRenderScale') as HTMLInputElement | null;
  const customRenderScaleValue = document.getElementById('menuCustomRenderScaleValue');
  const musicReactiveInput = document.getElementById('menuMusicReactive') as HTMLInputElement | null;
  const musicIntensityAutoButton = document.getElementById('btnMusicIntensityAuto');
  const musicIntensityManualButton = document.getElementById('btnMusicIntensityManual');
  const musicIntensityManualRow = document.getElementById('menuMusicIntensityManualRow');
  const musicReactiveIntensityInput = document.getElementById('menuMusicReactiveIntensity') as HTMLInputElement | null;
  const musicReactiveIntensityValue = document.getElementById('menuMusicReactiveIntensityValue');
  const trackingSourceInput = document.getElementById('menuTrackingSource') as HTMLSelectElement | null;
  const trackingSourceHint = document.getElementById('menuTrackingSourceHint');
  const performanceHint  = document.getElementById('menuPerformanceHint');
  const graphicsModeInfo = document.getElementById('menuGraphicsModeInfo');
  const developerModeInput = document.getElementById('menuDeveloperMode') as HTMLInputElement | null;
  setAutoFlipSuggestionHandler(({ flipCamera }) => {
    settings.flipCamera      = flipCamera;
    window.__trackingFlip    = flipCamera;
    setSetting('flipCamera', flipCamera);
    if (flipCameraInput) flipCameraInput.checked = flipCamera;
  });

  function selectItem(item: Element): void {
    navItems.forEach(el => el.classList.toggle('is-selected', el === item));
  }

  function isSettingsPanelVisible(): boolean {
    return Boolean(settingsBackdrop && !settingsBackdrop.hidden);
  }

  function switchSettingsTab(tabName: string): void {
    document.querySelectorAll<HTMLElement>('.sp-nav-item').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset['tab'] === tabName);
    });
    document.querySelectorAll<HTMLElement>('.sp-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset['tab'] === tabName);
    });
    if (tabName === 'achievements') {
      renderStatsGrid();
      renderAchievementCompactGrid();
    }
  }

  document.querySelectorAll<HTMLElement>('.sp-nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset['tab'] ?? 'audio'));
  });

  initSettingsTransfer(settings);

  function setSettingsPanelVisible(visible: boolean): void {
    if (settingsBackdrop) {
      settingsBackdrop.hidden = !visible;
      settingsBackdrop.classList.toggle('show', visible);
    }
    settingsPanel?.classList.toggle('show', visible);
    settingsButton?.setAttribute('aria-expanded', String(visible));
    if (visible) {
      requestAnimationFrame(() => (settingsPanel?.querySelector('input,button,summary') as HTMLElement | null)?.focus());
    } else {
      (settingsButton as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hand-sabers:open-settings', event => {
    const detail = (event as CustomEvent<{ tab?: string }>).detail;
    switchSettingsTab(detail?.tab ?? 'audio');
    setSettingsPanelVisible(true);
  });

  function updateRangeProgress(input: HTMLInputElement): void {
    const min   = Number(input.min   || 0);
    const max   = Number(input.max   || 100);
    const value = Number(input.value || 0);
    const pct   = max === min ? 0 : ((value - min) / (max - min)) * 100;
    input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, pct))}%`);
  }

  function updateSettingsSliderValue(input: HTMLInputElement): void {
    if (!input?.id) return;
    const valueEl = document.querySelector<HTMLElement>(`.sp-value[data-for="${input.id}"]`);
    if (!valueEl) return;
    const min   = Number(input.min   || 0);
    const max   = Number(input.max   || 100);
    const value = Number(input.value || 0);
    const pct   = max === min ? 0 : ((value - min) / (max - min)) * 100;
    valueEl.textContent = `${Math.round(Math.max(0, Math.min(100, pct)))}%`;
  }

  function bindStyledRange(input: HTMLInputElement | null): void {
    if (!input) return;
    const update = () => {
      updateRangeProgress(input);
      updateSettingsSliderValue(input);
    };
    update();
    input.addEventListener('input', update);
  }

  function getGraphicsModeSummary(): string {
    const selected = getPerformanceMode(settings);
    const profile  = getScenePerformanceProfile();
    const active   = window.__graphicsQualityMode ?? profile.qualityMode ?? selected;
    const label    = window.__graphicsProfile     ?? profile.label       ?? active;
    const dpr      = window.__graphicsDpr ? `, DPR ${Number(window.__graphicsDpr).toFixed(2)}` : '';
    return selected === 'auto'
      ? t('settings.performance.currentModeAuto', { active, details: `${label}${dpr}` })
      : t('settings.performance.currentModeActive', { active, details: `${label}${dpr}` });
  }

  function updateGraphicsModeInfo(): void {
    if (graphicsModeInfo) graphicsModeInfo.textContent = getGraphicsModeSummary();
  }

  function updateTrackingSourceHint(): void {
    if (!trackingSourceHint) return;
    const source = settings.trackingSource;
    const connected = isRemoteTrackingConnected();
    const key = source === 'camera'
      ? 'remoteTracking.sourceCameraHint'
      : source === 'phone'
        ? connected ? 'remoteTracking.sourcePhoneReady' : 'remoteTracking.sourcePhoneMissing'
        : connected ? 'remoteTracking.sourceAutoPhone' : 'remoteTracking.sourceAutoCamera';
    trackingSourceHint.textContent = t(key);
    trackingSourceHint.classList.toggle('is-error', source === 'phone' && !connected);
  }

  function updateCustomGraphicsVisibility(): void {
    customGraphicsSection?.classList.toggle('is-hidden', performanceInput?.value !== 'custom');
  }

  function updateMusicIntensityMode(): void {
    const manual = settings.musicReactiveIntensityMode === 'manual';
    musicIntensityAutoButton?.classList.toggle('is-active', !manual);
    musicIntensityManualButton?.classList.toggle('is-active', manual);
    musicIntensityAutoButton?.setAttribute('aria-pressed', String(!manual));
    musicIntensityManualButton?.setAttribute('aria-pressed', String(manual));
    musicIntensityManualRow?.classList.toggle('is-hidden', !manual);
    if (musicReactiveIntensityInput) musicReactiveIntensityInput.disabled = !manual;
  }

  function applyLivePerformanceSettings(): void {
    setScenePerformanceProfile(settings);
    updateGraphicsModeInfo();
  }

  type CustomBooleanSetting =
    | 'customAntialias'
    | 'customReflections'
    | 'customFloorGlows'
    | 'customSaberGlints'
    | 'customSaberTrails'
    | 'customBackgroundShader'
    | 'customFog'
    | 'customGrid';

  function bindCustomToggle(input: HTMLInputElement | null, key: CustomBooleanSetting): void {
    if (!input) return;
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      setSetting(key, input.checked);
      if (performanceInput?.value === 'custom') applyLivePerformanceSettings();
    });
  }

  function syncAdvancedSettings(): void {
    const customToggles: Array<[HTMLInputElement | null, CustomBooleanSetting]> = [
      [customAntialiasInput, 'customAntialias'],
      [customReflectionsInput, 'customReflections'],
      [customFloorGlowsInput, 'customFloorGlows'],
      [customSaberGlintsInput, 'customSaberGlints'],
      [customSaberTrailsInput, 'customSaberTrails'],
      [customBackgroundShaderInput, 'customBackgroundShader'],
      [customFogInput, 'customFog'],
      [customGridInput, 'customGrid'],
    ];
    for (const [input, key] of customToggles) if (input) input.checked = settings[key];
    if (customHitShardsInput) {
      customHitShardsInput.value = String(settings.customHitShards);
      updateRangeProgress(customHitShardsInput);
    }
    if (customHitShardsValue) customHitShardsValue.textContent = String(settings.customHitShards);
    if (customSaberTrailSamplesInput) {
      customSaberTrailSamplesInput.value = String(settings.customSaberTrailSamples);
      updateRangeProgress(customSaberTrailSamplesInput);
    }
    if (customSaberTrailSamplesValue) customSaberTrailSamplesValue.textContent = String(settings.customSaberTrailSamples);
    if (customSaberTrailIntensityInput) {
      customSaberTrailIntensityInput.value = String(settings.customSaberTrailIntensity);
      updateRangeProgress(customSaberTrailIntensityInput);
    }
    if (customSaberTrailIntensityValue) customSaberTrailIntensityValue.textContent = `${Math.round(settings.customSaberTrailIntensity * 100)}%`;
    if (customArenaDetailInput) {
      customArenaDetailInput.value = String(settings.customArenaDetail);
      updateRangeProgress(customArenaDetailInput);
    }
    if (customArenaDetailValue) customArenaDetailValue.textContent = `${Math.round(settings.customArenaDetail * 100)}%`;
    if (customRenderScaleInput) {
      customRenderScaleInput.value = String(settings.customRenderScale);
      updateRangeProgress(customRenderScaleInput);
    }
    if (customRenderScaleValue) customRenderScaleValue.textContent = `${Math.round(settings.customRenderScale * 100)}%`;
    if (musicReactiveInput) musicReactiveInput.checked = settings.musicReactiveEnabled;
    if (musicReactiveIntensityInput) {
      musicReactiveIntensityInput.value = String(settings.musicReactiveIntensity);
      updateRangeProgress(musicReactiveIntensityInput);
    }
    if (musicReactiveIntensityValue) musicReactiveIntensityValue.textContent = `${settings.musicReactiveIntensity.toFixed(1)}×`;
    updateCustomGraphicsVisibility();
    updateMusicIntensityMode();
  }

  const allNavItems = [...document.querySelectorAll<HTMLElement>('.main-nav-item')];
  allNavItems.forEach((item, i) => item.style.setProperty('--i', String(i)));

  for (const item of navItems) {
    item.addEventListener('mouseenter', () => selectItem(item));
    item.addEventListener('focus',      () => selectItem(item));
    item.addEventListener('pointerdown',  () => item.classList.add('is-pressed'));
    item.addEventListener('pointerup',    () => item.classList.remove('is-pressed'));
    item.addEventListener('pointerleave', () => item.classList.remove('is-pressed'));
  }

  for (const item of allNavItems) {
    item.addEventListener('click', () => {
      if (item.classList.contains('is-disabled')) {
        item.classList.remove('is-locked-attempt');
        void item.offsetWidth;
        item.classList.add('is-locked-attempt');
        setTimeout(() => item.classList.remove('is-locked-attempt'), 420);
        return;
      }
      item.classList.remove('is-clicked');
      void item.offsetWidth;
      item.classList.add('is-clicked');
      setTimeout(() => item.classList.remove('is-clicked'), 380);
    });
  }

  function dispatchMenuAction(id: string, action: () => void): void {
    document.getElementById(id)?.addEventListener('click', () => {
      if (document.getElementById(id)?.classList.contains('is-disabled')) return;
      setTimeout(action, 350);
    });
  }

  dispatchMenuAction('mainStart', () => {
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
      switchSettingsTab('remoteTracking');
      setSettingsPanelVisible(true);
      updateTrackingSourceHint();
      return;
    }
    setSettingsPanelVisible(false);
    runAsyncTask('game-start', () => startFromMainMenu({ calibrate: false }));
  });
  dispatchMenuAction('mainCalibrate', () => {
    if (settings.trackingSource === 'phone' && !isRemoteTrackingConnected()) {
      switchSettingsTab('remoteTracking');
      setSettingsPanelVisible(true);
      updateTrackingSourceHint();
      return;
    }
    setSettingsPanelVisible(false);
    runAsyncTask('calibration-start', () => startFromMainMenu({ calibrate: true }));
  });
  dispatchMenuAction('mainMaps', () => {
    openMapPicker();
  });
  settingsButton?.addEventListener('click', () => {
    selectItem(settingsButton);
    setSettingsPanelVisible(!isSettingsPanelVisible());
  });
  settingsClose?.addEventListener('click', () => setSettingsPanelVisible(false));
  settingsBackdrop?.addEventListener('pointerdown', (event) => {
    if (event.target === settingsBackdrop) setSettingsPanelVisible(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isSettingsPanelVisible()) setSettingsPanelVisible(false);
  });

  initLanguageSettings(applyTranslations);

  if (trackingSourceInput) {
    trackingSourceInput.value = settings.trackingSource;
    trackingSourceInput.addEventListener('change', () => {
      const value = trackingSourceInput.value as TrackingSourcePreference;
      const changed = settings.trackingSource !== value;
      settings.trackingSource = value;
      setSetting('trackingSource', value);
      if (changed && trackingStarted) {
        stopTracking();
        trackingStarted = false;
        calibrationReady = false;
      }
      updateTrackingSourceHint();
    });
  }
  window.addEventListener('hand-sabers:remote-tracking-state', updateTrackingSourceHint);
  updateTrackingSourceHint();

  const audioSettingsController = initAudioSettings(settings, bindStyledRange);

  initProfileSettings(settings);
  const gameplaySettingsController = initGameplaySettings(settings);
  const saberSettingsController = initSaberSettings(settings);
  const arenaSettingsController = initArenaSettings(settings);

  if (performanceInput) {
    const updatePerformanceHint = () => {
      if (!performanceHint) return;
      const mode        = getPerformanceMode({ performanceMode: performanceInput.value } as Settings);
      const activeProfile = window.__graphicsQualityMode ? t('performance.activeProfile', { mode: window.__graphicsQualityMode }) : '';
      performanceHint.textContent = `${getPerformanceModeDescription(mode)}${mode === 'auto' ? activeProfile : ''}`;
      updateGraphicsModeInfo();
    };
    performanceInput.innerHTML = getPerformanceModes()
      .map(mode => `<option value="${mode.value}">${mode.label}</option>`)
      .join('');
    performanceInput.value = getPerformanceMode(settings);
    updateCustomGraphicsVisibility();
    updatePerformanceHint();
    performanceInput.addEventListener('change', () => {
      const value = performanceInput.value as PerformanceMode;
      settings.performanceMode = value;
      setSetting('performanceMode', value);
      setScenePerformanceProfile(settings);
      prewarmGameplayResources();
      applyTrackingSettings({ performanceMode: value });
      const profile = getPerformanceProfile(settings);
      if (ui.dStatus) ui.dStatus.textContent = `PERF: ${profile.label}`;
      updateCustomGraphicsVisibility();
      updatePerformanceHint();
    });
  }

  bindCustomToggle(customAntialiasInput, 'customAntialias');
  bindCustomToggle(customReflectionsInput, 'customReflections');
  bindCustomToggle(customFloorGlowsInput, 'customFloorGlows');
  bindCustomToggle(customSaberGlintsInput, 'customSaberGlints');
  bindCustomToggle(customSaberTrailsInput, 'customSaberTrails');
  bindCustomToggle(customBackgroundShaderInput, 'customBackgroundShader');
  bindCustomToggle(customFogInput, 'customFog');
  bindCustomToggle(customGridInput, 'customGrid');

  customHitShardsInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(7, Math.round(Number(customHitShardsInput.value))));
    settings.customHitShards = value;
    setSetting('customHitShards', value);
    updateRangeProgress(customHitShardsInput);
    if (customHitShardsValue) customHitShardsValue.textContent = String(value);
    if (performanceInput?.value === 'custom') applyLivePerformanceSettings();
  });

  customSaberTrailSamplesInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(16, Math.round(Number(customSaberTrailSamplesInput.value))));
    settings.customSaberTrailSamples = value;
    setSetting('customSaberTrailSamples', value);
    updateRangeProgress(customSaberTrailSamplesInput);
    if (customSaberTrailSamplesValue) customSaberTrailSamplesValue.textContent = String(value);
    if (performanceInput?.value === 'custom') applyLivePerformanceSettings();
  });

  customSaberTrailIntensityInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(1.25, Number(customSaberTrailIntensityInput.value)));
    settings.customSaberTrailIntensity = value;
    setSetting('customSaberTrailIntensity', value);
    updateRangeProgress(customSaberTrailIntensityInput);
    if (customSaberTrailIntensityValue) customSaberTrailIntensityValue.textContent = `${Math.round(value * 100)}%`;
    if (performanceInput?.value === 'custom') applyLivePerformanceSettings();
  });

  customArenaDetailInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(1.25, Number(customArenaDetailInput.value)));
    settings.customArenaDetail = value;
    setSetting('customArenaDetail', value);
    updateRangeProgress(customArenaDetailInput);
    if (customArenaDetailValue) customArenaDetailValue.textContent = `${Math.round(value * 100)}%`;
    if (performanceInput?.value === 'custom') applyLivePerformanceSettings();
  });

  customRenderScaleInput?.addEventListener('input', () => {
    const value = Math.max(0.5, Math.min(1.5, Number(customRenderScaleInput.value)));
    settings.customRenderScale = value;
    setSetting('customRenderScale', value);
    updateRangeProgress(customRenderScaleInput);
    if (customRenderScaleValue) customRenderScaleValue.textContent = `${Math.round(value * 100)}%`;
    if (performanceInput?.value === 'custom') applyLivePerformanceSettings();
  });

  musicReactiveInput?.addEventListener('change', () => {
    settings.musicReactiveEnabled = musicReactiveInput.checked;
    setSetting('musicReactiveEnabled', musicReactiveInput.checked);
    applyLivePerformanceSettings();
  });

  function setMusicIntensityMode(mode: Settings['musicReactiveIntensityMode']): void {
    settings.musicReactiveIntensityMode = mode;
    setSetting('musicReactiveIntensityMode', mode);
    updateMusicIntensityMode();
    applyLivePerformanceSettings();
  }

  musicIntensityAutoButton?.addEventListener('click', () => setMusicIntensityMode('auto'));
  musicIntensityManualButton?.addEventListener('click', () => setMusicIntensityMode('manual'));
  musicReactiveIntensityInput?.addEventListener('input', () => {
    const value = Math.max(0, Math.min(1.5, Number(musicReactiveIntensityInput.value)));
    settings.musicReactiveIntensity = value;
    setSetting('musicReactiveIntensity', value);
    updateRangeProgress(musicReactiveIntensityInput);
    if (musicReactiveIntensityValue) musicReactiveIntensityValue.textContent = `${value.toFixed(1)}×`;
    applyLivePerformanceSettings();
  });
  syncAdvancedSettings();

  if (developerModeInput) {
    developerModeInput.checked = Boolean(settings.developerMode) || isDeveloperPanelEnabled();
    developerModeInput.addEventListener('change', () => {
      const value = developerModeInput.checked;
      settings.developerMode = value;
      setDeveloperPanelEnabled(renderer, value);
      setHitPlaneVisible(value);
    });
  }

  const devAccentInput = document.getElementById('menuDevAccent') as HTMLSelectElement | null;
  if (devAccentInput) {
    devAccentInput.value = settings.devAccent || 'green';
    devAccentInput.addEventListener('change', () => {
      applyDevAccent(devAccentInput.value);
    });
  }

  updateGraphicsModeInfo();
  window.setInterval(updateGraphicsModeInfo, 1200);

  if (flipCameraInput) {
    flipCameraInput.checked = Boolean(settings.flipCamera);
    flipCameraInput.addEventListener('change', () => {
      const value           = flipCameraInput.checked;
      settings.flipCamera   = value;
      window.__trackingFlip = value;
      setSetting('flipCamera', value);
      applyTrackingSettings({ flipCamera: value });
    });
  }

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
      calibrationReady = false;
    }
    const emit = (element: HTMLElement | null, eventName: 'input' | 'change') => {
      element?.dispatchEvent(new Event(eventName));
    };

    audioSettingsController.sync();
    gameplaySettingsController.sync();
    saberSettingsController.sync();
    arenaSettingsController.sync();
    if (performanceInput) {
      performanceInput.value = settings.performanceMode;
      emit(performanceInput, 'change');
    }
    syncAdvancedSettings();
    if (trackingSourceInput) {
      trackingSourceInput.value = settings.trackingSource;
      emit(trackingSourceInput, 'change');
    }
    if (developerModeInput) {
      developerModeInput.checked = settings.developerMode;
      emit(developerModeInput, 'change');
    }
    if (devAccentInput) {
      devAccentInput.value = settings.devAccent;
      emit(devAccentInput, 'change');
    }
    if (flipCameraInput) {
      flipCameraInput.checked = settings.flipCamera;
      emit(flipCameraInput, 'change');
    }

    window.__trackingSensitivity = settings.sensitivity;
    applyAudioSettings(settings);
    applyTrackingSettings(settings);
  });

  document.getElementById('mainDevMode')?.addEventListener('click', () => {
    const current = new URLSearchParams(location.search);
    if (!current.has('dev')) current.set('dev', '');
    const qs = current.toString().replace(/=(?=&|$)/g, '');
    location.href = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
  });
}

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
bindGameplayFocusProtection();
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
