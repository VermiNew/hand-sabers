import { S, state } from '../core/state.ts';
import { ui, updateHUD, showGameOver, showHandsPaused, hideHandsPaused, updateMapProgress, showMapTitle, showPauseMenu, hidePauseMenu } from '../ui/ui.ts';
import {
  THREE, renderer, scene, cam3d, bgMat,
  lSaber, rSaber, lTarget, rTarget, lVel, rVel, lLight, rLight,
  animateIdleSabers, updateLightReflections, updateReflection, resizeRenderer, adaptRenderQuality, disposeSceneResources,
  applyShake, setScenePerformanceProfile, getScenePerformanceProfile, setSaberColor, setHitPlaneVisible,
} from './scene.ts';
import { initAudio, startMapAudio, stopMapAudio, pauseMapAudio, getMapTime, getMapDuration, setVolume, setMusicVolume, setSfxVolume, setSoundVolume, applyAudioSettings, loadMapAudio, hasMapAudio, clearMapAudio } from './audio.ts';
import { CALIB_STEPS, initMP, resetCalibration, finishCalibStep, renderCalibStep, setCalibAutoAdvanceHandler, setAutoFlipSuggestionHandler, setSaberTargetSetter, applyTrackingSettings, stopTracking } from '../tracking/tracking.ts';
import { setGameOverHandler, startGameplay, clearGameplayEntities, updateBlocks, updateSparks, resetMapSpawn, updateMenuDemo, resetMenuDemo, prewarmGameplayResources, disposeGameplayResources } from './gameplay.ts';
import { updateFpsCounter } from '../ui/fps.ts';
import { initDevPanel, isDeveloperPanelEnabled, setDeveloperPanelEnabled, tickDevPanel } from '../ui/devpanel.ts';
import { loadMapFromFile, validateMap } from './maploader.ts';
import { loadSettings, setSetting } from '../core/settings.ts';
import { SABER_COLORS, findClosestSaberColor } from '../core/saber-colors.ts';
import { getPerformanceMode, getPerformanceModeDescription, getPerformanceModes, getPerformanceProfile } from '../core/performance.ts';
import { getAudioOffsetSec, getEffectiveMapDuration, getSongTimeSec, nearestBeatDeltaMs, nearestBeats } from '../core/timing.ts';
import { PAUSE_REASONS, canAutoResumeFromHands } from '../core/pause.ts';
import { appendLocalScore, getLocalMapById, loadLocalMapAudio } from '../core/localstore.ts';
import { t } from '../i18n/index.ts';
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
if (settings.saberColorLeft)  setSaberColor('left',  settings.saberColorLeft);
if (settings.saberColorRight) setSaberColor('right', settings.saberColorRight);
window.__trackingSensitivity = settings.sensitivity;
window.__trackingFlip        = settings.flipCamera;
state.noFail                 = settings.noFail;
state.oneHandMode            = settings.oneHandMode || null;
window.__oneHandMode         = state.oneHandMode || 'both';
applyAudioSettings(settings);
setScenePerformanceProfile(settings);
setHitPlaneVisible(Boolean(settings.developerMode) || isDeveloperPanelEnabled());
prewarmGameplayResources();
setSaberTargetSetter((side, pos) => {
  if (side === 'left') lTarget.set(pos.x, pos.y, pos.z);
  else                 rTarget.set(pos.x, pos.y, pos.z);
});

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
async function submitScore(): Promise<void> {
  const payload = {
    mapId:  state.map?.id ?? 'random',
    player: settings.playerName || 'Gracz',
    score:  state.score,
    combo:  state.maxCombo,
    date:   new Date().toISOString(),
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
async function tryLoadMapFromUrl(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const mapId  = params.get('map');
  if (!mapId) return;

  try {
    const res = await fetch(`/api/maps/${encodeURIComponent(mapId)}`);
    if (res.ok) {
      const map = await res.json() as Record<string, unknown>;
      if (validateMap(map)) {
        state.map = { ...map, _serverAudioPending: true } as unknown as typeof state.map;
        return;
      }
    }
  } catch { /* fallback to local */ }

  const localMap = getLocalMapById(mapId);
  if (validateMap(localMap)) {
    state.map = { ...localMap, _localAudioPending: true, localOnly: true } as unknown as typeof state.map;
  }
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
let mapTimelineZeroAtMs  = 0;
let mapAudioStarted      = false;
let pausedMapTimelineSec: number | null = null;

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

function getMapTimelineSec(now = performance.now()): number {
  if (!state.map) return 0;
  if (hasMapAudio() && mapAudioStarted) return getSongTimeSec(getMapTime(), settings, state.map);
  if (!mapTimelineZeroAtMs) return 0;
  return getSongTimeSec((now - mapTimelineZeroAtMs) / 1000, settings, state.map);
}

function getCurrentMapDuration(): number {
  return getEffectiveMapDuration(state.map, getMapDuration());
}

function showOverlay(): void {
  if (!ui.overlay) return;
  ui.overlay.style.display = '';
  ui.overlay.classList.add('show');
}

function hideOverlay(): void {
  if (!ui.overlay) return;
  ui.overlay.classList.remove('show');
  ui.overlay.style.display = '';
}

function updateMapAudioSchedule(now = performance.now()): void {
  if (!state.map || !hasMapAudio() || mapAudioStarted || !mapTimelineZeroAtMs) return;
  if (now >= mapTimelineZeroAtMs) {
    startMapAudio(0);
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
  mapTimelineZeroAtMs = now - pausedMapTimelineSec * 1000;
  if (hasMapAudio()) {
    if (pausedMapTimelineSec >= 0) {
      startMapAudio(Math.max(0, pausedMapTimelineSec - getAudioOffsetSec(settings, state.map)));
      mapAudioStarted = true;
    } else {
      mapAudioStarted = false;
    }
  }
  pausedMapTimelineSec = null;
}

let calibrationReady = false;

function startCalib(): void {
  state.calibIdx = 0;
  showOverlay();
  resetCalibration();
  state.appState = S.CALIB;
  if (ui.spinner)    ui.spinner.style.display    = 'none';
  if (ui.ovStep)     ui.ovStep.style.display     = 'block';
  if (ui.ovVisual)   ui.ovVisual.style.display   = 'flex';
  if (ui.ovProgress) ui.ovProgress.style.display = 'block';
  if (ui.ovBtn)      ui.ovBtn.style.display      = 'inline-block';
  if (ui.ovBtnMenu)  ui.ovBtnMenu.style.display  = 'none';
  if (ui.dStatus)    ui.dStatus.textContent       = 'CALIB';
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
  await beginPlaying();
}

async function beginPlaying(): Promise<void> {
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
  stopMapAudio();
  resetMapTimeline();
  void submitScore();
  showGameOver(state);
}

function restartGame(): void {
  clearGameplayEntities();
  stopMapAudio();
  resetMapTimeline();
  hideHandsPaused();
  hidePauseMenu();
  handsLostSince = handsReturnedSince = 0;
  state.pauseReason = PAUSE_REASONS.NONE;
  if (ui.ovVisual)   ui.ovVisual.style.display   = 'flex';
  if (ui.ovProgress) ui.ovProgress.style.display = 'block';
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
const HANDS_RESUME_MS     = 400;
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
      if (now - handsReturnedSince >= HANDS_RESUME_MS) {
        resumeGame(now);
        handsReturnedSince = 0;
      }
    } else {
      handsReturnedSince = 0;
      if (ui.pauseSub) ui.pauseSub.textContent = missingHandsText();
    }
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

function updateMenuAutoplay(now: number, t: number): void {
  updateMenuDemo(now, t);
  const target = window.__menuDemoTarget;

  const idleLeft  = { x: -0.72 + Math.sin(t * 1.35) * 0.22,      y: 1.08 + Math.sin(t * 1.75) * 0.26,      z: 1.55 };
  const idleRight = { x:  0.72 + Math.sin(t * 1.35 + 1.6) * 0.22, y: 1.08 + Math.sin(t * 1.65 + 0.8) * 0.26, z: 1.55 };

  lTarget.set(idleLeft.x,  idleLeft.y,  idleLeft.z);
  rTarget.set(idleRight.x, idleRight.y, idleRight.z);

  if (target) {
    const hitWindow  = THREE.MathUtils.clamp((target.z + 1.9) / 3.4, 0, 1);
    const slash      = Math.sin(hitWindow * Math.PI) * 0.72;
    const activeTarget = target.side === 'left' ? lTarget : rTarget;
    const cross      = target.side === 'left' ? -slash : slash;
    activeTarget.set(
      target.x + cross * 0.42,
      target.y + Math.cos(hitWindow * Math.PI) * 0.24,
      1.48 + Math.sin(hitWindow * Math.PI) * 0.12
    );
  }

  updateSabers(now);

  const idleDeltaScale = THREE.MathUtils.clamp(state.deltaScale || 1, 0, 3);
  lSaber.rotation.z += Math.sin(t * 5.2) * 0.035 * idleDeltaScale;
  rSaber.rotation.z += Math.sin(t * 5.2 + 1.4) * 0.035 * idleDeltaScale;

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
      updateMapProgress(progressTime, getCurrentMapDuration());
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

ui.ovBtn?.addEventListener('click',      handleOverlayButton);
ui.ovBtnCalib?.addEventListener('click', handleCalibButton);
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
  stopMapAudio();
  resetMapTimeline();
  clearGameplayEntities();
  hidePauseMenu();
  hideHandsPaused();
  if (ui.hud) ui.hud.style.display = 'none';
  hideOverlay();
  const mainMenu = document.getElementById('mainMenu');
  if (mainMenu) mainMenu.style.display = 'flex';
  document.body.classList.add('menu-open');
  state.appState    = S.MENU;
  state.pauseReason = PAUSE_REASONS.NONE;
  resetMenuDemo();
}

document.getElementById('pauseQuit')?.addEventListener('click', returnToMainMenu);
ui.ovBtnMenu?.addEventListener('click', returnToMainMenu);

window.addEventListener('resize',  resizeRenderer);
window.addEventListener('keydown', handleKeydown);
setGameOverHandler(endGame);
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
  if (mainMenu) mainMenu.style.display = 'none';
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

function initMainMenu(): void {
  document.body.classList.add('menu-open');
  preserveDevQueryOnMenuLinks();
  resetMenuDemo();

  const navItems         = [...document.querySelectorAll<HTMLElement>('.main-nav-item:not(.is-disabled)')];
  const settingsBackdrop = document.getElementById('mainSettingsBackdrop');
  const settingsPanel    = document.getElementById('mainSettingsPanel');
  const settingsButton   = document.getElementById('mainSettings');
  const settingsClose    = document.getElementById('mainSettingsClose');
  const volumeInput      = document.getElementById('menuVolume')    as HTMLInputElement | null;
  const soundInputs      = [...document.querySelectorAll<HTMLInputElement>('[data-audio-setting]')];
  const noFailInput      = document.getElementById('menuNoFail')    as HTMLInputElement | null;
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

  function selectItem(item: Element): void {
    navItems.forEach(el => el.classList.toggle('is-selected', el === item));
  }

  function isSettingsPanelVisible(): boolean {
    return Boolean(settingsBackdrop && !settingsBackdrop.hidden);
  }

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

  function updateRangeProgress(input: HTMLInputElement): void {
    const min   = Number(input.min   || 0);
    const max   = Number(input.max   || 100);
    const value = Number(input.value || 0);
    const pct   = max === min ? 0 : ((value - min) / (max - min)) * 100;
    input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, pct))}%`);
  }

  function updateSettingsSliderValue(input: HTMLInputElement): void {
    if (!input?.id) return;
    const valueEl = document.querySelector<HTMLElement>(`.settings-slider-value[data-for="${input.id}"]`);
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

  for (const item of navItems) {
    item.addEventListener('mouseenter', () => selectItem(item));
    item.addEventListener('focus',      () => selectItem(item));
    item.addEventListener('pointerdown',  () => item.classList.add('is-pressed'));
    item.addEventListener('pointerup',    () => item.classList.remove('is-pressed'));
    item.addEventListener('pointerleave', () => item.classList.remove('is-pressed'));
    item.addEventListener('click', () => {
      if (item.classList.contains('is-disabled')) return;
      const sliceTimer = (item as HTMLElement & { _sliceTimer?: ReturnType<typeof setTimeout> })._sliceTimer;
      if (sliceTimer !== undefined) clearTimeout(sliceTimer);
      item.classList.remove('slicing');
      void item.offsetWidth;
      item.classList.add('slicing');
      (item as HTMLElement & { _sliceTimer?: ReturnType<typeof setTimeout> })._sliceTimer = setTimeout(() => item.classList.remove('slicing'), 400);
    });
  }

  document.getElementById('mainStart')?.addEventListener('click', () => {
    setSettingsPanelVisible(false);
    void startFromMainMenu({ calibrate: false });
  });
  document.getElementById('mainCalibrate')?.addEventListener('click', () => {
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

initMainMenu();

(async () => {
  await tryLoadMapFromUrl();
  startRenderLoop();
})();
