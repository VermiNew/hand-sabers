import { iconMarkup, refreshIcons, setIconButton } from '../core/icons.ts';
import type { GameState } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { renderSingleplayerResults, renderMultiplayerResults } from '../game/results.ts';
import type { RoomSnapshot } from '../multiplayer/protocol.ts';
import type { AudioBankErrorEvent, AudioBankProgressEvent, AudioBankReadyEvent } from '../remote/audio-protocol.ts';

interface UiRefs {
  overlay:         HTMLElement | null;
  hud:             HTMLElement | null;
  spinner:         HTMLElement | null;
  ovStep:          HTMLElement | null;
  ovInstr:         HTMLElement | null;
  ovLoadDetail:    HTMLElement | null;
  ovProgress:      HTMLElement | null;
  ovBar:           HTMLElement | null;
  ovProgressPct:   HTMLElement | null;
  ovRetryCamera:   HTMLButtonElement | null;
  ovRoundPrep:     HTMLElement | null;
  ovRoundMapTitle: HTMLElement | null;
  ovRoundAudioDetail: HTMLElement | null;
  goTitle:         HTMLElement | null;
  goBody:          HTMLElement | null;
  ovBtn:           HTMLElement | null;
  ovBtnMaps:       HTMLElement | null;
  ovBtnCalib:      HTMLElement | null;
  ovBtnMenu:       HTMLElement | null;
  dFps:            HTMLElement | null;
  dFrame:          HTMLElement | null;
  dRender:         HTMLElement | null;
  dDetect:         HTMLElement | null;
  dLat:            HTMLElement | null;
  dConf:           HTMLElement | null;
  dHandsBackend:   HTMLElement | null;
  dCam:            HTMLElement | null;
  dStatus:         HTMLElement | null;
  dHandL:          HTMLElement | null;
  dHandR:          HTMLElement | null;
  dotL:            HTMLElement | null;
  dotR:            HTMLElement | null;
  score:           HTMLElement | null;
  combo:           HTMLElement | null;
  lives:           HTMLElement | null;
  hpHud:           HTMLElement | null;
  hpLeftFill:      HTMLElement | null;
  hpRightFill:     HTMLElement | null;
  hpMeter:         HTMLElement | null;
  calibPanel:          HTMLElement | null;
  calibStepsTrack:     HTMLElement | null;
  calibStepBadge:      HTMLElement | null;
  calibProgressLabel:  HTMLElement | null;
  calibAbortBtn:       HTMLElement | null;
  calibStep:           HTMLElement | null;
  calibInstr:          HTMLElement | null;
  calibBar:            HTMLElement | null;
  calibBtnNext:        HTMLElement | null;
  calibBtnRetry:       HTMLElement | null;
  calibBtnMenu:        HTMLElement | null;
  calibVerdict:        HTMLElement | null;
  calibHint:           HTMLElement | null;
  pauseBanner:         HTMLElement | null;
  pauseSub:            HTMLElement | null;
  handsResumeStatus:   HTMLElement | null;
  handsResumeFill:     HTMLElement | null;
  mapTitle:            HTMLElement | null;
  mapProgress:         HTMLElement | null;
  mapProgressFill: HTMLElement | null;
  mapProgressMeter: HTMLElement | null;
  mapProgressPercent: HTMLElement | null;
}

export const ui: UiRefs = {
  overlay:         document.getElementById('overlay'),
  hud:             document.getElementById('hud'),
  spinner:         document.getElementById('spinner'),
  ovStep:          document.getElementById('ovStep'),
  ovInstr:         document.getElementById('ovInstr'),
  ovLoadDetail:    document.getElementById('ovLoadDetail'),
  ovProgress:      document.getElementById('ovProgress'),
  ovBar:           document.getElementById('ovBar'),
  ovProgressPct:   document.getElementById('ovProgressPct'),
  ovRetryCamera:   document.getElementById('ovRetryCamera') as HTMLButtonElement | null,
  ovRoundPrep:     document.getElementById('ovRoundPrep'),
  ovRoundMapTitle: document.getElementById('ovRoundMapTitle'),
  ovRoundAudioDetail: document.getElementById('ovRoundAudioDetail'),
  goTitle:         document.getElementById('goTitle'),
  goBody:          document.getElementById('goBody'),
  ovBtn:           document.getElementById('ovBtn'),
  ovBtnMaps:       document.getElementById('ovBtnMaps'),
  ovBtnCalib:      document.getElementById('ovBtnCalib'),
  ovBtnMenu:       document.getElementById('ovBtnMenu'),
  dFps:            document.getElementById('dFps'),
  dFrame:          document.getElementById('dFrame'),
  dRender:         document.getElementById('dRender'),
  dDetect:         document.getElementById('dDetect'),
  dLat:            document.getElementById('dLat'),
  dConf:           document.getElementById('dConf'),
  dHandsBackend:   document.getElementById('dHandsBackend'),
  dCam:            document.getElementById('dCam'),
  dStatus:         document.getElementById('dStatus'),
  dHandL:          document.getElementById('dHandL'),
  dHandR:          document.getElementById('dHandR'),
  dotL:            document.getElementById('dotL'),
  dotR:            document.getElementById('dotR'),
  score:           document.getElementById('score'),
  combo:           document.getElementById('combo'),
  lives:           document.getElementById('lives'),
  hpHud:           document.getElementById('hpHud'),
  hpLeftFill:      document.getElementById('hpLeftFill'),
  hpRightFill:     document.getElementById('hpRightFill'),
  hpMeter:         document.getElementById('hpMeter'),
  calibPanel:          document.getElementById('calibPanel'),
  calibStepsTrack:     document.getElementById('calibStepsTrack'),
  calibStepBadge:      document.getElementById('calibStepBadge'),
  calibProgressLabel:  document.getElementById('calibProgressLabel'),
  calibAbortBtn:       document.getElementById('calibAbortBtn'),
  calibStep:           document.getElementById('calibStep'),
  calibInstr:          document.getElementById('calibInstr'),
  calibBar:            document.getElementById('calibBar'),
  calibBtnNext:        document.getElementById('calibBtnNext'),
  calibBtnRetry:       document.getElementById('calibBtnRetry'),
  calibBtnMenu:        document.getElementById('calibBtnMenu'),
  calibVerdict:        document.getElementById('calibVerdict'),
  calibHint:           document.getElementById('calibHint'),
  pauseBanner:         document.getElementById('pauseBanner'),
  pauseSub:            document.getElementById('pauseSub'),
  handsResumeStatus:   document.getElementById('handsResumeStatus'),
  handsResumeFill:     document.getElementById('handsResumeFill'),
  mapTitle:            document.getElementById('mapTitle'),
  mapProgress:         document.getElementById('mapProgress'),
  mapProgressFill: document.getElementById('mapProgressFill'),
  mapProgressMeter: document.getElementById('mapProgressMeter'),
  mapProgressPercent: document.getElementById('mapProgressPercent'),
};

function showModalElement(el: HTMLElement | null): void {
  if (!el) return;
  el.style.display = '';
  el.classList.add('show');
}

function hideModalElement(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.remove('show');
  el.style.display = '';
}

export function clearDangerPulse(): void {
  document.body.classList.remove('danger-pulse', 'danger-low', 'danger-crit');
}

export function showHandsPaused(text = t('pause.handsLost')): void {
  if (ui.pauseSub)    ui.pauseSub.textContent = text;
  updateHandsResumeProgress(0);
  if (ui.pauseBanner) ui.pauseBanner.classList.add('show');
}

export function hideHandsPaused(): void {
  if (ui.pauseBanner) ui.pauseBanner.classList.remove('show');
  updateHandsResumeProgress(0);
}

export function updateHandsResumeProgress(progress: number): void {
  const normalized = Math.max(0, Math.min(1, progress));
  if (ui.handsResumeFill) ui.handsResumeFill.style.width = `${normalized * 100}%`;
  if (!ui.handsResumeStatus) return;
  ui.handsResumeStatus.textContent = normalized > 0
    ? `${t('hands.resumeIn')} ${(1 - normalized).toFixed(1)} s`
    : t('hands.waitingStable');
}

let lastHp: number | null = null;
let hpFxTimer: ReturnType<typeof setTimeout> | null = null;

export function updateHUD(state: GameState): void {
  if (ui.score) ui.score.textContent = String(state.score).padStart(6, '0');
  if (ui.combo) {
    const combo = Math.max(0, state.combo);
    ui.combo.textContent = combo > 1 ? `COMBO ×${combo}` : 'COMBO —';
    ui.combo.classList.toggle('combo-active', combo > 1);
  }

  const maxHp   = Math.max(1, state.maxLives);
  const hp      = Math.max(0, Math.min(maxHp, state.lives));
  const hpRatio = hp / maxHp;

  clearDangerPulse();
  if (state.appState === 'playing' && (hp === 1 || hp === 2)) {
    document.body.classList.add('danger-pulse', hp === 1 ? 'danger-crit' : 'danger-low');
  }

  if (ui.lives) ui.lives.textContent = `${hp} / ${maxHp}`;
  if (ui.hpLeftFill) ui.hpLeftFill.style.transform = `scaleX(${hpRatio})`;
  if (ui.hpRightFill) ui.hpRightFill.style.transform = `scaleX(${hpRatio})`;
  if (ui.hpMeter) {
    ui.hpMeter.setAttribute('aria-valuemax', String(maxHp));
    ui.hpMeter.setAttribute('aria-valuenow', String(hp));
  }

  let hpStateClass = 'hp-stable';
  if (hp <= 0) hpStateClass = 'hp-empty';
  else if (hp === 1) hpStateClass = 'hp-one';
  else if (hp === 2) hpStateClass = 'hp-two';
  else if (hp === 3) hpStateClass = 'hp-three';
  else if (hpRatio <= 0.5) hpStateClass = 'hp-warning';

  if (ui.hpHud) {
    const changed = lastHp !== null && hp !== lastHp;
    ui.hpHud.className = hpStateClass;
    if (changed) {
      const effect = hp > lastHp! ? 'hp-recover' : 'hp-hit';
      ui.hpHud.classList.add(effect);
      if (hpFxTimer) clearTimeout(hpFxTimer);
      hpFxTimer = setTimeout(() => {
        ui.hpHud?.classList.remove('hp-hit', 'hp-recover');
        hpFxTimer = null;
      }, 360);
    }
  }

  lastHp = hp;
}

export function updateMapProgress(currentSec: number, totalSec: number): void {
  if (!ui.mapProgress || !ui.mapProgressFill) return;
  const ratio = totalSec > 0 ? Math.min(1, currentSec / totalSec) : 0;
  const percent = Math.round(ratio * 100);
  ui.mapProgressFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  if (ui.mapProgressMeter) ui.mapProgressMeter.setAttribute('aria-valuenow', String(percent));
  if (ui.mapProgressPercent) ui.mapProgressPercent.textContent = `${percent}%`;
  const rem = Math.max(0, totalSec - currentSec);
  const mm  = Math.floor(rem / 60);
  const ss  = Math.floor(rem % 60);
  const el  = document.getElementById('mapTimeLeft');
  if (el) el.textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
}

export function showMapTitle(title: string): void {
  if (!ui.mapTitle) return;
  ui.mapTitle.textContent = title;
  ui.mapTitle.style.opacity = '1';
  setTimeout(() => { if (ui.mapTitle) ui.mapTitle.style.opacity = '0'; }, 3500);
}

export function setLoadingProgress(title: string, detail: string, ratio: number | null = null): void {
  if (!ui.ovProgress || !ui.ovBar) return;
  if (ui.ovRetryCamera) ui.ovRetryCamera.hidden = true;
  if (ui.spinner) ui.spinner.style.display = 'none';
  ui.ovProgress.style.display = 'block';
  ui.ovProgress.classList.toggle('indeterminate', ratio === null);
  const pct = ratio === null ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  ui.ovBar.style.width = ratio === null ? '0%' : `${pct}%`;
  if (ui.ovProgressPct) ui.ovProgressPct.textContent = ratio === null ? '' : `${pct}%`;
  if (ui.ovInstr) ui.ovInstr.textContent = title;
  if (ui.ovLoadDetail) ui.ovLoadDetail.textContent = detail;
}

export type RoundPreparationStage = 'map' | 'audio' | 'tracking' | 'scene';
export type RoundPreparationStageState = 'waiting' | 'active' | 'done';

const roundStageIds: Record<RoundPreparationStage, string> = {
  map: 'ovRoundStageMap',
  audio: 'ovRoundStageAudio',
  tracking: 'ovRoundStageTracking',
  scene: 'ovRoundStageScene',
};

export function showRoundPreparation(mapTitle: string): void {
  document.body.classList.add('round-prep-open');
  ui.overlay?.classList.remove('is-gameover', 'is-victory', 'is-defeat');
  ui.overlay?.classList.add('is-round-prep');
  if (ui.ovRoundPrep) ui.ovRoundPrep.hidden = false;
  if (ui.ovRoundMapTitle) ui.ovRoundMapTitle.textContent = mapTitle;
  if (ui.spinner) ui.spinner.style.display = '';
  if (ui.ovProgress) ui.ovProgress.style.display = 'block';
  if (ui.ovInstr) ui.ovInstr.textContent = t('overlay.preparingRound');
  for (const stage of Object.keys(roundStageIds) as RoundPreparationStage[]) {
    setRoundPreparationStage(stage, 'waiting');
  }
  setRoundPreparationProgress(0);
}

export function setRoundPreparationStage(
  stage: RoundPreparationStage,
  stageState: RoundPreparationStageState,
): void {
  document.getElementById(roundStageIds[stage])?.setAttribute('data-state', stageState);
}

export function setRoundPreparationProgress(ratio: number): void {
  const normalized = Math.max(0, Math.min(1, ratio));
  const pct = Math.round(normalized * 100);
  ui.ovProgress?.classList.remove('indeterminate');
  if (ui.ovBar) ui.ovBar.style.width = `${pct}%`;
  if (ui.ovProgressPct) ui.ovProgressPct.textContent = `${pct}%`;
}

export function setRoundPreparationAudioDetail(detail: string): void {
  if (ui.ovRoundAudioDetail) ui.ovRoundAudioDetail.textContent = detail;
}

let roundPreparationAudioProgressInitialized = false;

export function initRoundPreparationAudioProgress(): void {
  if (roundPreparationAudioProgressInitialized) return;
  roundPreparationAudioProgressInitialized = true;
  window.addEventListener('hand-sabers:phone-audio-bank-progress', event => {
    if (!document.body.classList.contains('round-prep-open')) return;
    const detail = (event as CustomEvent<AudioBankProgressEvent>).detail;
    const useBytes = detail.totalBytes > 0;
    const ratio = useBytes
      ? detail.loadedBytes / detail.totalBytes
      : detail.loadedAssets / Math.max(1, detail.totalAssets);
    setRoundPreparationProgress(0.25 + Math.max(0, Math.min(1, ratio)) * 0.25);
    setRoundPreparationAudioDetail(t('remoteTracking.audioProgress', {
      loaded: detail.loadedAssets,
      total: detail.totalAssets,
      loadedMb: (detail.loadedBytes / 1024 / 1024).toFixed(1),
      totalMb: (detail.totalBytes / 1024 / 1024).toFixed(1),
    }));
  });
  window.addEventListener('hand-sabers:phone-audio-bank-ready', event => {
    if (!document.body.classList.contains('round-prep-open')) return;
    const detail = (event as CustomEvent<AudioBankReadyEvent>).detail;
    setRoundPreparationProgress(0.5);
    setRoundPreparationAudioDetail(t('remoteTracking.audioBankReady', {
      total: detail.totalAssets,
      cached: detail.cachedAssets,
    }));
  });
  window.addEventListener('hand-sabers:phone-audio-bank-error', event => {
    if (!document.body.classList.contains('round-prep-open')) return;
    const detail = (event as CustomEvent<AudioBankErrorEvent>).detail;
    setRoundPreparationAudioDetail(t('remoteTracking.audioBankFallback', { code: detail.code }));
  });
}

export function hideRoundPreparation(): void {
  document.body.classList.remove('round-prep-open');
  ui.overlay?.classList.remove('is-round-prep');
  if (ui.ovRoundPrep) ui.ovRoundPrep.hidden = true;
  setRoundPreparationAudioDetail('');
}

export function showCameraError(err: unknown): void {
  const asError = err instanceof Error ? err : null;
  const message = asError?.message ?? String(err);
  const name    = asError?.name ?? '';
  const cameraErrors = new Set(['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'SecurityError']);
  const isCameraError = cameraErrors.has(name);
  const isBusyCamera  = name === 'NotReadableError' || /allocate videosource|start video source|camera is already in use/i.test(message);
  const isTrackingRuntimeError = name === 'RuntimeError' && /abort|wasm|webassembly|memory access/i.test(message);
  let hint = t('errors.loadFailed');
  if (isBusyCamera)       hint = t('errors.cameraBusy');
  else if (isCameraError) hint = t('errors.cameraPermission');
  else if (isTrackingRuntimeError) hint = t('errors.trackingRuntime');

  if (ui.spinner) ui.spinner.style.display = 'none';
  if (ui.ovRetryCamera) {
    ui.ovRetryCamera.hidden = !isCameraError && !isTrackingRuntimeError;
    const label = ui.ovRetryCamera.querySelector<HTMLElement>('[data-i18n]');
    if (label) {
      const key = isTrackingRuntimeError ? 'overlay.reloadPage' : 'overlay.retryCamera';
      label.dataset['i18n'] = key;
      label.textContent = t(key);
    }
  }
  if (ui.ovInstr) {
    ui.ovInstr.textContent = isCameraError
      ? t('errors.cameraError')
      : isTrackingRuntimeError ? t('errors.trackingError') : t('errors.startError');
  }
  if (ui.ovLoadDetail) {
    const lines = [message, ...hint.split(/<br\s*\/?>/i)];
    const content: Array<Text | HTMLBRElement> = [];
    lines.forEach((line, index) => {
      if (index > 0) content.push(document.createElement('br'));
      content.push(document.createTextNode(line));
    });
    ui.ovLoadDetail.replaceChildren(...content);
  }
  refreshIcons();
  if (ui.dStatus) ui.dStatus.textContent = t('errors.error');
}

export function showGameOver(state: GameState, victory = false): void {
  clearDangerPulse();
  if (ui.overlay) {
    ui.overlay.classList.add('is-gameover');
    ui.overlay.classList.toggle('is-victory', victory);
    ui.overlay.classList.toggle('is-defeat', !victory);
  }
  showModalElement(ui.overlay);
  if (ui.hud)         ui.hud.style.display          = 'none';
  if (ui.mapProgress) ui.mapProgress.style.display = 'none';
  if (ui.goTitle) ui.goTitle.textContent = t(victory ? 'gameover.victoryTitle' : 'gameover.defeatTitle');
  if (ui.goBody) renderSingleplayerResults(ui.goBody, state, victory);

  setIconButton(ui.ovBtn,      t('gameover.playAgain'), 'rotate-ccw');
  setIconButton(ui.ovBtnMaps,  t('gameover.chooseMap'), 'library_music');
  setIconButton(ui.ovBtnCalib, t('gameover.calibration'), 'settings');
  setIconButton(ui.ovBtnMenu,  t('gameover.mainMenu'), 'house');
  if (ui.ovBtn)      ui.ovBtn.style.display      = 'inline-flex';
  if (ui.ovBtnMaps)  ui.ovBtnMaps.style.display  = 'inline-flex';
  if (ui.ovBtnCalib) ui.ovBtnCalib.style.display = 'inline-flex';
  if (ui.ovBtnMenu)  ui.ovBtnMenu.style.display  = 'inline-flex';
  if (ui.dStatus)    ui.dStatus.textContent = t(victory ? 'gameover.victoryTitle' : 'gameover.defeatTitle');
}

export function showMultiplayerResults(snapshot: RoomSnapshot, localPlayerId: string): void {
  clearDangerPulse();
  const victory = snapshot.mode === 'coop'
    ? snapshot.players.filter(p => p.playing).every(p => p.finished)
    : snapshot.players.some(p => p.id === localPlayerId && p.playing && p.finished);
  if (ui.overlay) {
    ui.overlay.classList.add('is-gameover');
    ui.overlay.classList.toggle('is-victory', victory);
    ui.overlay.classList.toggle('is-defeat', !victory);
  }
  showModalElement(ui.overlay);
  if (ui.hud)         ui.hud.style.display          = 'none';
  if (ui.mapProgress) ui.mapProgress.style.display = 'none';
  if (ui.goTitle) ui.goTitle.textContent = t('multiplayer.resultsTitle');
  if (ui.goBody) renderMultiplayerResults(ui.goBody, snapshot, localPlayerId);

  setIconButton(ui.ovBtn,      t('gameover.playAgain'), 'rotate-ccw');
  setIconButton(ui.ovBtnMaps,  t('gameover.chooseMap'), 'library_music');
  setIconButton(ui.ovBtnCalib, t('gameover.calibration'), 'settings');
  setIconButton(ui.ovBtnMenu,  t('gameover.mainMenu'), 'house');
  if (ui.ovBtn)      ui.ovBtn.style.display      = 'inline-flex';
  if (ui.ovBtnMaps)  ui.ovBtnMaps.style.display  = 'inline-flex';
  if (ui.ovBtnCalib) ui.ovBtnCalib.style.display = 'none';
  if (ui.ovBtnMenu)  ui.ovBtnMenu.style.display  = 'inline-flex';
  if (ui.dStatus)    ui.dStatus.textContent = t('multiplayer.resultsTitle');
}

export function showPauseMenu(): void {
  showModalElement(document.getElementById('pauseMenu'));
}

export function hidePauseMenu(): void {
  hideModalElement(document.getElementById('pauseMenu'));
}

let comboMilestoneTimer: ReturnType<typeof setTimeout> | null = null;

export function showComboMilestone(combo: number): void {
  // Milestones belong to the existing combo readout. A second, detached ×100/×200
  // in the corner made the player's eyes leave the note highway and competed
  // with Lyra's gameplay status. Keep one visual source of truth instead.
  document.getElementById('comboFlash')?.remove();

  const el = ui.combo;
  if (!el) return;

  el.dataset.milestone = String(combo);
  el.classList.remove('combo-milestone');
  // Restart the short pulse even when milestones arrive close together.
  void el.offsetWidth;
  el.classList.add('combo-milestone');

  if (comboMilestoneTimer) clearTimeout(comboMilestoneTimer);
  comboMilestoneTimer = setTimeout(() => {
    el.classList.remove('combo-milestone');
    delete el.dataset.milestone;
    comboMilestoneTimer = null;
  }, 720);
}

const _screenFade = document.getElementById('screenFade');

export function fadeTransition(callback: () => void, durationMs = 220): void {
  if (!_screenFade) { callback(); return; }
  _screenFade.classList.add('fade-out');
  setTimeout(() => {
    callback();
    _screenFade.classList.remove('fade-out');
  }, durationMs);
}

export function setCalibFeedback(ok: boolean, hint: string): void {
  if (ui.calibVerdict) {
    ui.calibVerdict.innerHTML = `${iconMarkup(ok ? 'check' : 'x', 'verdict-icon')}<span>${ok ? t('calib.ok') : t('calib.notOk')}</span>`;
    ui.calibVerdict.className = 'calib-verdict ' + (ok ? 'ok' : 'bad');
  }
  if (ui.calibHint) ui.calibHint.textContent = hint;
  refreshIcons();
}
