import { S, state } from '../core/state.ts';
import { ui, updateHUD, showGameOver, showHandsPaused, hideHandsPaused, updateHandsResumeProgress, updateMapProgress, showMapTitle, showPauseMenu, hidePauseMenu, fadeTransition } from '../ui/ui.ts';
import {
  THREE, renderer, scene, cam3d, bgMat,
  lSaber, rSaber, lTarget, rTarget, lVel, rVel, lLight, rLight,
  animateIdleSabers, updateLightReflections, updateReflection, resizeRenderer, adaptRenderQuality, disposeSceneResources,
  applyShake, setScenePerformanceProfile, getScenePerformanceProfile, setSaberColor, setHitPlaneVisible, setSaberModel,
} from './scene.ts';
import { initAudio, startMapAudio, stopMapAudio, pauseMapAudio, getMapTime, getMapDuration, setVolume, setMusicVolume, setSfxVolume, setSoundVolume, applyAudioSettings, loadMapAudio, hasMapAudio, clearMapAudio } from './audio.ts';
import { CALIB_STEPS, initMP, resetCalibration, finishCalibStep, renderCalibStep, setCalibAutoAdvanceHandler, setAutoFlipSuggestionHandler, setSaberTargetSetter, applyTrackingSettings, stopTracking } from '../tracking/tracking.ts';
import { setGameOverHandler, startGameplay, clearGameplayEntities, updateBlocks, updateSparks, resetMapSpawn, updateMenuDemo, resetMenuDemo, prewarmGameplayResources, disposeGameplayResources, setBlockColor } from './gameplay.ts';
import { updateFpsCounter } from '../ui/fps.ts';
import { initDevPanel, isDeveloperPanelEnabled, setDeveloperPanelEnabled, tickDevPanel, applyDevAccent } from '../ui/devpanel.ts';
import { loadMapFromFile, validateMap } from './maploader.ts';
import { loadSettings, resetSettings, setSetting } from '../core/settings.ts';
import { SABER_COLORS, findClosestSaberColor } from '../core/saber-colors.ts';
import { getPerformanceMode, getPerformanceModeDescription, getPerformanceModes, getPerformanceProfile } from '../core/performance.ts';
import { getAudioOffsetSec, getEffectiveMapDuration, getSongTimeSec, nearestBeatDeltaMs, nearestBeats } from '../core/timing.ts';
import { PAUSE_REASONS, canAutoResumeFromHands } from '../core/pause.ts';
import { appendLocalScore, getLocalMapById, loadLocalMapAudio } from '../core/localstore.ts';
import { t, setLang, getCurrentLang } from '../i18n/index.ts';
import { initKeyboardNav } from '../ui/keyboard-nav.ts';
import { initHelpOverlay } from '../ui/help.ts';
import { registerMlAssetCache } from '../core/ml-cache.ts';
import { initMultiplayerOverlay, sendMultiplayerScore } from '../multiplayer/client.ts';
import { initRemoteTrackingPreviews } from '../multiplayer/remote-preview.ts';
import { initRemoteTrackingPairing } from '../remote/host-pairing.ts';
import { narratorShow, NARRATOR_SPEEDS } from './narrator.ts';
import type { OneHandMode, PauseReason, PerformanceMode, Settings } from '../types/index.js';

declare global {
  interface Window {
    __trackingSensitivity?: number;
    __trackingFlip?:        boolean;
    __oneHandMode?:         string;
    __handSabersStopRenderLoop?: () => void;
    __songTimeSec?:         number;
    __audioOffsetMs?:       number;
    __nearestBeatDeltaMs?:  number | null;
    __nearestBeats?:        Array<{ deltaMs: number; side: string; cut: string }> | null;
  }
}

// ── Ustawienia ────────────────────────────────────────────────────────────────
const settings = loadSettings();
if (settings.saberColorLeft) {
  setSaberColor('left', settings.saberColorLeft);
  setBlockColor('left', parseInt(settings.saberColorLeft.replace('#', ''), 16));
}
if (settings.saberModel) {
  setSaberModel('left',  settings.saberModel as Parameters<typeof setSaberModel>[1]);
  setSaberModel('right', settings.saberModel as Parameters<typeof setSaberModel>[1]);
}
if (settings.saberColorRight) {
  setSaberColor('right', settings.saberColorRight);
  setBlockColor('right', parseInt(settings.saberColorRight.replace('#', ''), 16));
}
window.__trackingSensitivity = settings.sensitivity;
window.__trackingFlip        = settings.flipCamera;
state.noFail                 = settings.noFail;
state.oneHandMode            = settings.oneHandMode || null;
window.__oneHandMode         = state.oneHandMode || 'both';
document.body.classList.toggle('training-mode', settings.trainingMode);
applyAudioSettings(settings);
setScenePerformanceProfile(settings);
setHitPlaneVisible(Boolean(settings.developerMode) || isDeveloperPanelEnabled());
prewarmGameplayResources();
setSaberTargetSetter((side, pos) => {
  if (side === 'left') lTarget.set(pos.x, pos.y, pos.z);
  else                 rTarget.set(pos.x, pos.y, pos.z);
});

function applyTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset['i18n'];
    if (key) el.textContent = t(key);
  });
  // ov-instruction uses innerHTML (two keys) — handle separately
  const ovInstr = document.getElementById('ovInstr');
  if (ovInstr && !ovInstr.dataset['loading']) {
    ovInstr.innerHTML = `${t('overlay.loadingModel')}<br>${t('overlay.prepareCamera')}`;
  }
}

applyTranslations();

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
async function submitScore(progress?: number, allowTrainingMode = false): Promise<void> {
  if (settings.trainingMode && !allowTrainingMode) return;

  const payload = {
    mapId:  state.map?.id ?? 'random',
    player: settings.playerName || 'Gracz',
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

const MAP_LEAD_IN_MS = 1800;
const TRAINING_RATE  = 0.75;
let mapTimelineZeroAtMs  = 0;
let mapAudioStarted      = false;
let pausedMapTimelineSec: number | null = null;
let multiplayerRoundActive = false;
let lastMultiplayerScoreAt = 0;

function resetMapTimeline(): void {
  mapTimelineZeroAtMs  = 0;
  mapAudioStarted      = false;
  pausedMapTimelineSec = null;
}

function startMapTimeline(now = performance.now()): void {
  mapTimelineZeroAtMs  = now + MAP_LEAD_IN_MS;
  mapAudioStarted      = false;
  pausedMapTimelineSec = null;
}

function startMapTimelineAt(zeroAtMs: number): void {
  mapTimelineZeroAtMs = zeroAtMs;
  mapAudioStarted = false;
  pausedMapTimelineSec = null;
}

function getPlaybackRate(): number {
  return !multiplayerRoundActive && settings.trainingMode ? TRAINING_RATE : 1;
}

function getMapTimelineSec(now = performance.now()): number {
  if (!state.map) return 0;
  if (hasMapAudio() && mapAudioStarted) return getSongTimeSec(getMapTime(), settings, state.map);
  if (!mapTimelineZeroAtMs) return 0;
  const elapsedSec = (now - mapTimelineZeroAtMs) / 1000;
  const songElapsedSec = elapsedSec < 0 ? elapsedSec : elapsedSec * getPlaybackRate();
  return getSongTimeSec(songElapsedSec, settings, state.map);
}

function getCurrentMapDuration(): number {
  return getEffectiveMapDuration(state.map, getMapDuration());
}

function showOverlay(): void {
  if (!ui.overlay) return;
  ui.overlay.classList.add('show');
}

function hideOverlay(): void {
  if (!ui.overlay) return;
  ui.overlay.classList.remove('show', 'is-gameover');
}

function updateMapAudioSchedule(now = performance.now()): void {
  if (!state.map || !hasMapAudio() || mapAudioStarted || !mapTimelineZeroAtMs) return;
  if (now >= mapTimelineZeroAtMs) {
    const elapsedSec = Math.max(0, (now - mapTimelineZeroAtMs) / 1000) * getPlaybackRate();
    if (getMapDuration() > 0 && elapsedSec >= getMapDuration()) {
      mapAudioStarted = true;
      return;
    }
    startMapAudio(elapsedSec, 0, getPlaybackRate());
    mapAudioStarted = true;
  }
}

function pauseMapTimeline(now = performance.now()): void {
  if (!state.map) return;
  pausedMapTimelineSec = getMapTimelineSec(now);
  if (hasMapAudio() && mapAudioStarted) pauseMapAudio();
}

function resumeMapTimeline(now = performance.now()): void {
  if (!state.map || pausedMapTimelineSec === null) return;
  const rawElapsedSec = pausedMapTimelineSec - getAudioOffsetSec(settings, state.map);
  const realElapsedSec = rawElapsedSec < 0 ? rawElapsedSec : rawElapsedSec / getPlaybackRate();
  mapTimelineZeroAtMs = now - realElapsedSec * 1000;
  if (hasMapAudio()) {
    if (rawElapsedSec >= 0) {
      startMapAudio(rawElapsedSec, 0, getPlaybackRate());
      mapAudioStarted = true;
    } else {
      mapAudioStarted = false;
    }
  }
  pausedMapTimelineSec = null;
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
  state.calibIdx = 0;
  showCalibPanel();
  resetCalibration();
  state.appState = S.CALIB;
  if (ui.dStatus) ui.dStatus.textContent = 'CALIB';
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
  clearGameplayEntities();
  stopMapAudio();
  resetMapTimeline();
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
  multiplayerRoundActive = true;
  lastMultiplayerScoreAt = 0;
  document.body.classList.remove('training-mode');
  document.body.dataset['multiplayerMode'] = detail.mode;
  resetMapSpawn();
  startMapTimelineAt(detail.startAtPerformance);
  startGameplay();
  showMapTitle(state.map?.meta?.title ?? t('game.unknownTrack'));
  if (ui.dStatus) ui.dStatus.textContent = 'MULTIPLAYER';
}

async function beginPlaying(): Promise<void> {
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
    startMapTimeline(performance.now());
    showMapTitle(state.map.meta?.title ?? t('game.unknownTrack'));
  } else {
    resetMapTimeline();
  }

  startGameplay();
  if (ui.dStatus) ui.dStatus.textContent = 'PLAYING';
}

function endGame(): void {
  state.appState    = S.GAMEOVER;
  state.pauseReason = PAUSE_REASONS.NONE;
  const dur = getCurrentMapDuration();
  const pos = getMapTimelineSec();
  const progress = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : undefined;
  const wasMultiplayerRound = multiplayerRoundActive;
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
  document.body.classList.toggle('training-mode', settings.trainingMode);
  delete document.body.dataset['multiplayerMode'];
  stopMapAudio();
  resetMapTimeline();
  clearGameplayEntities();
  void submitScore(progress, wasMultiplayerRound);
  fadeTransition(() => { showGameOver(state); });
}

function restartGame(): void {
  clearGameplayEntities();
  stopMapAudio();
  resetMapTimeline();
  hideHandsPaused();
  hidePauseMenu();
  handsLostSince = handsReturnedSince = 0;
  state.pauseReason = PAUSE_REASONS.NONE;
  startCalib();
}

function restartWithoutCalib(): void {
  clearGameplayEntities();
  stopMapAudio();
  resetMapTimeline();
  hideHandsPaused();
  hidePauseMenu();
  handsLostSince = handsReturnedSince = 0;
  state.pauseReason = PAUSE_REASONS.NONE;
  void beginPlaying();
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

function pauseGame(reason: PauseReason, now = performance.now()): void {
  if (state.appState !== S.PLAYING) return;
  state.appState    = S.PAUSED;
  state.pauseReason = reason;
  pauseMapTimeline(now);
  if (reason === PAUSE_REASONS.HANDS) {
    showHandsPaused(missingHandsText());
  } else {
    hideHandsPaused();
    showPauseMenu();
  }
  if (ui.dStatus) ui.dStatus.textContent = reason === PAUSE_REASONS.HANDS ? t('game.pauseHands') : t('game.pause');
}

function resumeGame(now = performance.now()): void {
  if (state.appState !== S.PAUSED) return;
  state.appState    = S.PLAYING;
  state.pauseReason = PAUSE_REASONS.NONE;
  resumeMapTimeline(now);
  hideHandsPaused();
  hidePauseMenu();
  if (ui.dStatus) ui.dStatus.textContent = 'PLAYING';
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
        resumeGame(now);
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
let _nearestBeat:    ReturnType<typeof nearestBeatDeltaMs> | null = null;
let _nearestBeatAt   = 0;
let _nearestBeats:   Array<{ deltaMs: number; side: string; cut: string }> | null = null;
const BASE_FRAME_MS      = 1000 / 60;
const MAX_FRAME_DELTA_MS = 250;
const MAX_SIM_DELTA_SCALE = 3;

let loopLastNow: number | undefined;

function loop(timestamp: number): void {
  if (!mainLoopRunning) return;
  mainLoopRaf = requestAnimationFrame(loop);
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

  const perfProfile = getScenePerformanceProfile();
  if (bgMat.uniforms['uTime']) bgMat.uniforms['uTime'].value = t;
  updateHandsPauseState(now);

  if (isMainMenuOpen()) {
    if (perfProfile.menuDemo) updateMenuAutoplay(now, t);
    else animateIdleSabers(t);
    const pulse = 0.76 + Math.sin(t * 7) * 0.12;
    (lSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
    (rSaber.userData as { bladeGlow: { opacity: number } }).bladeGlow.opacity = pulse;
  } else if (state.appState === S.PLAYING) {
    updateSabers(now);

    updateMapAudioSchedule(now);
    const mapBeats   = state.map?.beats ?? null;
    const mapTimeSec = state.map ? getMapTimelineSec(now) : 0;
    window.__songTimeSec = mapTimeSec;
    updateBlocks(now, mapBeats, mapTimeSec);

    if (state.map) {
      const progressTime = Math.max(0, mapTimeSec);
      const duration = getCurrentMapDuration();
      updateMapProgress(progressTime, getCurrentMapDuration());
      if (mapTimeSec >= 0) publishMultiplayerScore(now, duration > 0 ? progressTime / duration : 0);
      if (now - _nearestBeatAt > 250) {
        _nearestBeat   = nearestBeatDeltaMs(state.map?.beats, mapTimeSec);
        _nearestBeatAt = now;
        const raw = nearestBeats(state.map?.beats, mapTimeSec, 3);
        _nearestBeats = raw.map(n => ({
          deltaMs: n.deltaMs,
          side: n.beat.side ?? '—',
          cut: n.beat.cut ?? '—',
        }));
      }
      window.__audioOffsetMs      = Math.round(getAudioOffsetSec(settings, state.map) * 1000);
      window.__nearestBeatDeltaMs = _nearestBeat?.deltaMs ?? null;
      window.__nearestBeats       = _nearestBeats;
      if ((mapAudioStarted || !hasMapAudio()) && progressTime >= getCurrentMapDuration() && getCurrentMapDuration() > 0) {
        endGame();
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

  lLight.position.set(lSaber.position.x, lSaber.position.y + 0.5, lSaber.position.z);
  rLight.position.set(rSaber.position.x, rSaber.position.y + 0.5, rSaber.position.z);
  updateLightReflections(t);
  updateSparks(state.deltaScale);

  if (state.appState === S.PLAYING) {
    cam3d.position.x = Math.sin(t * 0.15) * 0.04;
    cam3d.position.y = 1.55 + Math.sin(t * 0.2) * 0.015;
  }

  updateReflection();
  applyShake(state.deltaScale);

  const rStart = performance.now();
  renderer.render(scene, cam3d);
  renderMs = performance.now() - rStart;
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
  });
};

// ── Przyciski overlay ─────────────────────────────────────────────────────────
function handleOverlayButton(): void {
  initAudio();
  if (state.appState === S.GAMEOVER) restartWithoutCalib();
  else void advanceCalib();
}

function handleCalibButton(): void {
  initAudio();
  if (state.appState === S.GAMEOVER) restartGame();
}

// ── Menu pauzy (Escape) ───────────────────────────────────────────────────────
function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (multiplayerRoundActive) return;
    if (state.appState === S.PLAYING) {
      pauseGame(PAUSE_REASONS.MANUAL, performance.now());
    } else if (state.appState === S.PAUSED && state.pauseReason === PAUSE_REASONS.MANUAL) {
      resumeGame(performance.now());
    }
  }
}

// ── Wczytanie mapy (drag & drop na ekranie gry) ───────────────────────────────
function initMapDrop(): void {
  const canvas = document.getElementById('gameCanvas')!;
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
      resetMapTimeline();

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
        startMapTimeline(performance.now());
        startGameplay();
        showMapTitle(state.map?.meta?.title ?? file.name);
      }
    } catch (err) {
      console.error('Map load error:', err);
      if (ui.dStatus) ui.dStatus.textContent = `MAP ERROR: ${(err as Error).message}`;
    }
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

ui.ovBtn?.addEventListener('click',       handleOverlayButton);
ui.ovBtnCalib?.addEventListener('click',  handleCalibButton);
ui.calibBtnNext?.addEventListener('click',  () => { initAudio(); void advanceCalib(); });
ui.calibBtnRetry?.addEventListener('click', () => { initAudio(); restartGame(); });
ui.calibBtnMenu?.addEventListener('click',  returnToMainMenu);
document.getElementById('pauseResume')?.addEventListener('click',  () => resumeGame(performance.now()));
document.getElementById('pauseRestart')?.addEventListener('click', () => {
  hidePauseMenu();
  restartWithoutCalib();
});
document.getElementById('pauseMaps')?.addEventListener('click', () => {
  const params = new URLSearchParams(location.search);
  const keep   = new URLSearchParams();
  for (const key of ['dev', 'testing']) if (params.has(key)) keep.set(key, params.get(key) ?? '');
  const qs = keep.toString();
  location.href = './maps.html' + (qs ? `?${qs}` : '');
});

function returnToMainMenu(): void {
  fadeTransition(() => {
    stopMapAudio();
    resetMapTimeline();
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

window.addEventListener('resize',  resizeRenderer);
window.addEventListener('keydown', handleKeydown);
setGameOverHandler(endGame);

// Keyboard navigation — focus traps, arrow keys, escape stack
initKeyboardNav({
  onEscapePause: () => {
    if (state.appState === S.PAUSED && state.pauseReason === PAUSE_REASONS.MANUAL) {
      resumeGame(performance.now());
    }
  },
  onEscapeSettings: () => {
    const backdrop = document.getElementById('mainSettingsBackdrop');
    if (backdrop && !backdrop.hidden) backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  },
});
setCalibAutoAdvanceHandler(() => { if (state.appState === S.CALIB) void advanceCalib(); });
initDevPanel(renderer, null);
initMapDrop();
updateHUD(state);

let trackingStarted = false;
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

  trackingStarted = true;
  initMP(startCalib);
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
  const volumeInput      = document.getElementById('menuVolume')    as HTMLInputElement | null;
  const soundInputs      = [...document.querySelectorAll<HTMLInputElement>('[data-audio-setting]')];
  const noFailInput      = document.getElementById('menuNoFail')    as HTMLInputElement | null;
  const trainingModeInput = document.getElementById('menuTrainingMode') as HTMLInputElement | null;
  const beatLimitInput   = document.getElementById('menuBeatLimit') as HTMLInputElement | null;
  const flipCameraInput  = document.getElementById('menuFlipCamera')as HTMLInputElement | null;
  const performanceInput = document.getElementById('menuPerformanceMode') as HTMLSelectElement | null;
  const performanceHint  = document.getElementById('menuPerformanceHint');
  const graphicsModeInfo = document.getElementById('menuGraphicsModeInfo');
  const developerModeInput = document.getElementById('menuDeveloperMode') as HTMLInputElement | null;

  setAutoFlipSuggestionHandler(({ flipCamera }) => {
    settings.flipCamera      = flipCamera;
    window.__trackingFlip    = flipCamera;
    setSetting('flipCamera', flipCamera);
    if (flipCameraInput) flipCameraInput.checked = flipCamera;
  });

  const audioOffsetInput = document.getElementById('menuAudioOffset')      as HTMLInputElement | null;
  const audioOffsetValue = document.getElementById('menuAudioOffsetValue');
  const oneHandButtons   = [...document.querySelectorAll<HTMLElement>('[data-one-hand]')];
  const noteSpeedButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-note-speed]')];
  const hitboxSensitivityButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-hitbox-sensitivity]')];

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
  }

  document.querySelectorAll<HTMLElement>('.sp-nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset['tab'] ?? 'audio'));
  });

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

  function syncOneHandButtons(): void {
    oneHandButtons.forEach(btn => {
      btn.classList.toggle('is-active', (btn.dataset['oneHand'] ?? '') === (state.oneHandMode ?? ''));
    });
  }

  function syncNoteSpeedButtons(): void {
    const activeSpeed = Number(settings.noteSpeed) || 1;
    noteSpeedButtons.forEach(button => {
      const selected = Math.abs(Number(button.dataset['noteSpeed']) - activeSpeed) < 0.001;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function syncHitboxSensitivityButtons(): void {
    const activeSensitivity = Number(settings.hitboxSensitivity) || 1;
    hitboxSensitivityButtons.forEach(button => {
      const selected = Math.abs(Number(button.dataset['hitboxSensitivity']) - activeSensitivity) < 0.001;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

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
      ? `Obecny tryb: Auto → ${active} (${label}${dpr})`
      : `Obecny tryb: ${active} (${label}${dpr})`;
  }

  function updateGraphicsModeInfo(): void {
    if (graphicsModeInfo) graphicsModeInfo.textContent = getGraphicsModeSummary();
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
    setSettingsPanelVisible(false);
    void startFromMainMenu({ calibrate: false });
  });
  dispatchMenuAction('mainCalibrate', () => {
    setSettingsPanelVisible(false);
    void startFromMainMenu({ calibrate: true });
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

  const btnLangPl = document.getElementById('btnLangPl');
  const btnLangEn = document.getElementById('btnLangEn');

  function updateLangButtons(): void {
    const currentLang = getCurrentLang();
    btnLangPl?.classList.toggle('lang-active', currentLang === 'pl');
    btnLangEn?.classList.toggle('lang-active', currentLang === 'en');
  }

  btnLangPl?.addEventListener('click', () => {
    setLang('pl');
    updateLangButtons();
    applyTranslations();
  });

  btnLangEn?.addEventListener('click', () => {
    setLang('en');
    updateLangButtons();
    applyTranslations();
  });

  updateLangButtons();

  if (volumeInput) {
    volumeInput.value = String(settings.volume ?? 0.8);
    bindStyledRange(volumeInput);
    volumeInput.addEventListener('input', () => {
      const value = Number(volumeInput.value);
      settings.volume = value;
      setSetting('volume', value);
      setVolume(value);
    });
  }

  const audioSetters: Record<string, (v: number) => void> = {
    musicVolume: setMusicVolume,
    sfxVolume:   setSfxVolume,
  };
  for (const input of soundInputs) {
    const key = input.dataset['audioSetting'] ?? '';
    input.value = String((settings as unknown as Record<string, unknown>)[key] ?? 1);
    bindStyledRange(input);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      (settings as unknown as Record<string, unknown>)[key] = value;
      setSetting(key as keyof Settings, value);
      if (audioSetters[key]) audioSetters[key]!(value);
      else setSoundVolume(key, value);
    });
  }

  if (audioOffsetInput) {
    audioOffsetInput.value = String(settings.audioOffsetMs ?? 0);
    bindStyledRange(audioOffsetInput);
    if (audioOffsetValue) audioOffsetValue.textContent = `${settings.audioOffsetMs ?? 0} ms`;
    audioOffsetInput.addEventListener('input', () => {
      const value = Number(audioOffsetInput.value);
      settings.audioOffsetMs = value;
      setSetting('audioOffsetMs', value);
      if (audioOffsetValue) audioOffsetValue.textContent = `${value} ms`;
    });
  }

  if (noFailInput) {
    noFailInput.checked = Boolean(settings.noFail);
    noFailInput.addEventListener('change', () => {
      settings.noFail = noFailInput.checked;
      state.noFail    = noFailInput.checked;
      setSetting('noFail', noFailInput.checked);
    });
  }

  if (trainingModeInput) {
    trainingModeInput.checked = Boolean(settings.trainingMode);
    trainingModeInput.addEventListener('change', () => {
      settings.trainingMode = trainingModeInput.checked;
      document.body.classList.toggle('training-mode', trainingModeInput.checked);
      setSetting('trainingMode', trainingModeInput.checked);
    });
  }

  if (beatLimitInput) {
    beatLimitInput.checked = settings.beatLimitEnabled !== false;
    beatLimitInput.addEventListener('change', () => {
      settings.beatLimitEnabled = beatLimitInput.checked;
      setSetting('beatLimitEnabled', beatLimitInput.checked);
    });
  }

  if (performanceInput) {
    const updatePerformanceHint = () => {
      if (!performanceHint) return;
      const mode        = getPerformanceMode({ performanceMode: performanceInput.value } as Settings);
      const activeProfile = window.__graphicsQualityMode ? ` Aktywnie: ${window.__graphicsQualityMode}.` : '';
      performanceHint.textContent = `${getPerformanceModeDescription(mode)}${mode === 'auto' ? activeProfile : ''}`;
      updateGraphicsModeInfo();
    };
    performanceInput.innerHTML = getPerformanceModes()
      .map(mode => `<option value="${mode.value}">${mode.label}</option>`)
      .join('');
    performanceInput.value = getPerformanceMode(settings);
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
      updatePerformanceHint();
    });
  }

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

  for (const btn of oneHandButtons) {
    btn.addEventListener('click', () => {
      const value           = (btn.dataset['oneHand'] ?? null) as OneHandMode;
      settings.oneHandMode  = value;
      state.oneHandMode     = value;
      window.__oneHandMode  = value ?? 'both';
      setSetting('oneHandMode', value);
      applyTrackingSettings({ oneHandMode: value });
      syncOneHandButtons();
    });
  }
  syncOneHandButtons();

  for (const button of noteSpeedButtons) {
    button.addEventListener('click', () => {
      const speed = Number(button.dataset['noteSpeed']);
      if (!Number.isFinite(speed)) return;
      settings.noteSpeed = speed;
      setSetting('noteSpeed', speed);
      syncNoteSpeedButtons();
    });
  }
  syncNoteSpeedButtons();

  for (const button of hitboxSensitivityButtons) {
    button.addEventListener('click', () => {
      const sensitivity = Number(button.dataset['hitboxSensitivity']);
      if (!Number.isFinite(sensitivity)) return;
      settings.hitboxSensitivity = sensitivity;
      setSetting('hitboxSensitivity', sensitivity);
      syncHitboxSensitivityButtons();
    });
  }
  syncHitboxSensitivityButtons();

  // ── Kolory mieczy ─────────────────────────────────────────────────────────
  function updateColorPreview(previewBar: HTMLElement | null, previewName: HTMLElement | null, colorDef: { hex: string; label: string }): void {
    if (previewBar) {
      previewBar.style.background  = colorDef.hex;
      previewBar.style.boxShadow   = `0 0 8px 2px ${colorDef.hex}88`;
    }
    if (previewName) previewName.textContent = colorDef.label;
  }

  function buildColorGrid(gridEl: HTMLElement | null, previewBar: HTMLElement | null, previewName: HTMLElement | null, side: 'left' | 'right', currentHex: string): void {
    if (!gridEl) return;
    const selectedColor = findClosestSaberColor(currentHex);
    gridEl.innerHTML    = '';

    for (const colorDef of SABER_COLORS) {
      const selected = colorDef.hex.toLowerCase() === selectedColor.hex.toLowerCase();
      const btn      = document.createElement('button');
      btn.type       = 'button';
      btn.className  = 'saber-color-swatch' + (selected ? ' is-selected' : '');
      btn.title      = colorDef.label;
      btn.setAttribute('aria-label',   colorDef.label);
      btn.setAttribute('aria-checked', String(selected));
      btn.setAttribute('role', 'radio');
      btn.style.setProperty('background-color', colorDef.hex);
      btn.style.setProperty('--saber-glow', `${colorDef.hex}66`);

      btn.addEventListener('click', () => {
        gridEl.querySelectorAll('.saber-color-swatch').forEach(s => {
          s.classList.remove('is-selected');
          s.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('is-selected');
        btn.setAttribute('aria-checked', 'true');

        setSaberColor(side, colorDef.hex);
        setBlockColor(side, parseInt(colorDef.hex.replace('#', ''), 16));
        const settingKey = side === 'left' ? 'saberColorLeft' : 'saberColorRight';
        (settings as unknown as Record<string, unknown>)[settingKey] = colorDef.hex;
        setSetting(settingKey as keyof Settings, colorDef.hex);
        updateColorPreview(previewBar, previewName, colorDef);
      });

      gridEl.appendChild(btn);
    }

    updateColorPreview(previewBar, previewName, selectedColor);
  }

  const leftHex  = settings.saberColorLeft  || '#36f2a1';
  const rightHex = settings.saberColorRight || '#2f7cff';

  buildColorGrid(
    document.getElementById('saberColorGridLeft'),
    document.getElementById('saberColorPreviewLeft'),
    document.getElementById('saberColorNameLeft'),
    'left', leftHex
  );
  buildColorGrid(
    document.getElementById('saberColorGridRight'),
    document.getElementById('saberColorPreviewRight'),
    document.getElementById('saberColorNameRight'),
    'right', rightHex
  );

  // ── Custom color picker modal ────────────────────────────────────────────
  function hexToHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else                h = ((r - g) / d + 4) / 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function hslToHex(h: number, s: number, l: number): string {
    const sl = s / 100, ll = l / 100;
    const c  = (1 - Math.abs(2 * ll - 1)) * sl;
    const x  = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m  = ll - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h < 60)  { r=c; g=x; b=0; }
    else if (h < 120) { r=x; g=c; b=0; }
    else if (h < 180) { r=0; g=c; b=x; }
    else if (h < 240) { r=0; g=x; b=c; }
    else if (h < 300) { r=x; g=0; b=c; }
    else              { r=c; g=0; b=x; }
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function hexToRgb(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1,3),16),
      parseInt(hex.slice(3,5),16),
      parseInt(hex.slice(5,7),16),
    ];
  }

  {
    const modal      = document.getElementById('cpModal');
    const backdrop   = modal?.querySelector<HTMLElement>('.cp-modal-backdrop');
    const sideBadge  = document.getElementById('cpModalSideBadge');
    const swatch     = document.getElementById('cpModalSwatch');
    const hexVal     = document.getElementById('cpModalHexVal');
    const rgbVal     = document.getElementById('cpModalRgbVal');
    const slH        = document.getElementById('cpModalH')  as HTMLInputElement | null;
    const slS        = document.getElementById('cpModalS')  as HTMLInputElement | null;
    const slL        = document.getElementById('cpModalL')  as HTMLInputElement | null;
    const vH         = document.getElementById('cpModalHVal');
    const vS         = document.getElementById('cpModalSVal');
    const vL         = document.getElementById('cpModalLVal');
    const rVal       = document.getElementById('cpModalR');
    const gVal       = document.getElementById('cpModalG');
    const bVal       = document.getElementById('cpModalB');
    const hexInput   = document.getElementById('cpModalHexInput') as HTMLInputElement | null;
    const applyBtn   = document.getElementById('cpModalApply');
    const rejectBtn  = document.getElementById('cpModalReject');

    let cpSide: 'left' | 'right' = 'left';
    let cpH = 0, cpS = 100, cpL = 55;

    function cpSync(): void {
      if (slH) { slH.value = String(cpH); }
      if (slS) { slS.value = String(cpS); }
      if (slL) { slL.value = String(cpL); }
      if (vH) vH.textContent = String(cpH);
      if (vS) vS.textContent = String(cpS);
      if (vL) vL.textContent = String(cpL);
      modal?.style.setProperty('--cp-h', String(cpH));
      const hex = hslToHex(cpH, cpS, cpL);
      const [r, g, b] = hexToRgb(hex);
      if (swatch) {
        swatch.style.background = hex;
        swatch.style.setProperty('--cp-glow', `${hex}88`);
      }
      if (hexVal)  hexVal.textContent  = hex.toUpperCase();
      if (rgbVal)  rgbVal.textContent  = `RGB(${r}, ${g}, ${b})`;
      if (rVal)    rVal.textContent    = String(r);
      if (gVal)    gVal.textContent    = String(g);
      if (bVal)    bVal.textContent    = String(b);
      if (hexInput) hexInput.value     = hex;
    }

    function cpOpen(side: 'left' | 'right'): void {
      cpSide = side;
      const initHex = side === 'left'
        ? (settings.saberColorLeft  || '#36f2a1')
        : (settings.saberColorRight || '#2f7cff');
      [cpH, cpS, cpL] = hexToHsl(initHex);
      if (sideBadge) sideBadge.textContent = side === 'left'
        ? t('settings.gameplay.leftHand')
        : t('settings.gameplay.rightHand');
      cpSync();
      modal?.classList.add('is-open');
    }

    function cpClose(): void {
      modal?.classList.remove('is-open');
    }

    function cpApply(): void {
      const hex = hslToHex(cpH, cpS, cpL);
      setSaberColor(cpSide, hex);
      setBlockColor(cpSide, parseInt(hex.replace('#', ''), 16));
      const key = cpSide === 'left' ? 'saberColorLeft' : 'saberColorRight';
      (settings as unknown as Record<string, unknown>)[key] = hex;
      setSetting(key as keyof Settings, hex);
      const previewBar  = document.getElementById(cpSide === 'left' ? 'saberColorPreviewLeft'  : 'saberColorPreviewRight');
      const previewName = document.getElementById(cpSide === 'left' ? 'saberColorNameLeft'      : 'saberColorNameRight');
      updateColorPreview(previewBar, previewName, { hex, label: t('settings.gameplay.custom') });
      cpClose();
    }

    slH?.addEventListener('input', () => { cpH = Number(slH.value); cpSync(); });
    slS?.addEventListener('input', () => { cpS = Number(slS.value); cpSync(); });
    slL?.addEventListener('input', () => { cpL = Number(slL.value); cpSync(); });
    hexInput?.addEventListener('input', () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        [cpH, cpS, cpL] = hexToHsl(v);
        cpSync();
      }
    });
    applyBtn?.addEventListener('click',  cpApply);
    rejectBtn?.addEventListener('click', cpClose);
    backdrop?.addEventListener('pointerdown', cpClose);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal?.classList.contains('is-open')) cpClose();
    });

    document.querySelectorAll<HTMLButtonElement>('.cp-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = (btn.dataset['side'] ?? 'left') as 'left' | 'right';
        cpOpen(side);
      });
    });
  }

  // ── Picker modelu miecza ──────────────────────────────────────────────────
  const modelPicker = document.getElementById('saberModelPicker');
  if (modelPicker) {
    const currentModel = (settings.saberModel || 'classic') as Parameters<typeof setSaberModel>[1];
    modelPicker.querySelectorAll<HTMLButtonElement>('[data-saber-model]').forEach(btn => {
      if (btn.dataset['saberModel'] === currentModel) btn.classList.add('is-active');
      else                                             btn.classList.remove('is-active');
      btn.addEventListener('click', () => {
        const model = btn.dataset['saberModel'] as Parameters<typeof setSaberModel>[1];
        if (!model) return;
        modelPicker.querySelectorAll('[data-saber-model]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        setSaberModel('left',  model);
        setSaberModel('right', model);
        (settings as unknown as Record<string, unknown>)['saberModel'] = model;
        setSetting('saberModel' as keyof Settings, model);
      });
    });
  }

  settingsReset?.addEventListener('click', () => {
    if (!window.confirm(t('settings.resetConfirm'))) return;

    resetSettings();
    syncNoteSpeedButtons();
    syncHitboxSensitivityButtons();

    const emit = (element: HTMLElement | null, eventName: 'input' | 'change') => {
      element?.dispatchEvent(new Event(eventName));
    };

    if (volumeInput) {
      volumeInput.value = String(settings.volume);
      emit(volumeInput, 'input');
    }
    for (const input of soundInputs) {
      const key = input.dataset['audioSetting'] as keyof Settings | undefined;
      if (!key) continue;
      input.value = String(settings[key]);
      emit(input, 'input');
    }
    if (audioOffsetInput) {
      audioOffsetInput.value = String(settings.audioOffsetMs);
      emit(audioOffsetInput, 'input');
    }
    if (noFailInput) {
      noFailInput.checked = settings.noFail;
      emit(noFailInput, 'change');
    }
    if (trainingModeInput) {
      trainingModeInput.checked = settings.trainingMode;
      emit(trainingModeInput, 'change');
    }
    if (beatLimitInput) {
      beatLimitInput.checked = settings.beatLimitEnabled;
      emit(beatLimitInput, 'change');
    }
    if (performanceInput) {
      performanceInput.value = settings.performanceMode;
      emit(performanceInput, 'change');
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

    state.oneHandMode = settings.oneHandMode;
    window.__oneHandMode = settings.oneHandMode ?? 'both';
    syncOneHandButtons();

    const leftColor = settings.saberColorLeft;
    const rightColor = settings.saberColorRight;
    setSaberColor('left', leftColor);
    setSaberColor('right', rightColor);
    setBlockColor('left', parseInt(leftColor.slice(1), 16));
    setBlockColor('right', parseInt(rightColor.slice(1), 16));
    buildColorGrid(
      document.getElementById('saberColorGridLeft'),
      document.getElementById('saberColorPreviewLeft'),
      document.getElementById('saberColorNameLeft'),
      'left',
      leftColor,
    );
    buildColorGrid(
      document.getElementById('saberColorGridRight'),
      document.getElementById('saberColorPreviewRight'),
      document.getElementById('saberColorNameRight'),
      'right',
      rightColor,
    );

    const model = settings.saberModel as Parameters<typeof setSaberModel>[1];
    setSaberModel('left', model);
    setSaberModel('right', model);
    modelPicker?.querySelectorAll<HTMLElement>('[data-saber-model]').forEach(button => {
      button.classList.toggle('is-active', button.dataset['saberModel'] === model);
    });

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
  if (typeof mapId === 'string') void prepareMultiplayerMap(mapId);
});
window.addEventListener('hand-sabers:multiplayer-start', event => {
  const detail = (event as CustomEvent<{ mapId?: unknown; mode?: unknown; startAtPerformance?: unknown }>).detail;
  if (
    typeof detail?.mapId === 'string'
    && (detail.mode === 'coop' || detail.mode === 'score-attack')
    && typeof detail.startAtPerformance === 'number'
  ) {
    void beginMultiplayerRound({
      mapId: detail.mapId,
      mode: detail.mode,
      startAtPerformance: detail.startAtPerformance,
    });
  }
});
initRemoteTrackingPreviews();
initMultiplayerOverlay(settings.playerName);
initMainMenu();

(async () => {
  await tryLoadMapFromUrl();
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
})();
