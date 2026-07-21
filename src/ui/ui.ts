import { iconMarkup, refreshIcons, setIconButton } from '../core/icons.ts';
import type { GameState } from '../core/state.ts';
import { t } from '../i18n/index.ts';

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
  goTitle:         HTMLElement | null;
  goBody:          HTMLElement | null;
  ovBtn:           HTMLElement | null;
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
  hpFill:          HTMLElement | null;
  hpTicks:         HTMLElement | null;
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
  goTitle:         document.getElementById('goTitle'),
  goBody:          document.getElementById('goBody'),
  ovBtn:           document.getElementById('ovBtn'),
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
  hpFill:          document.getElementById('hpFill'),
  hpTicks:         document.getElementById('hpTicks'),
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

function clearDangerPulse(): void {
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
  if (hpRatio <= 0.3 && state.appState === 'playing') {
    document.body.classList.add('danger-pulse', hpRatio <= 0.15 ? 'danger-crit' : 'danger-low');
  }
  if (ui.lives)  ui.lives.textContent  = `${hp} / ${maxHp}`;
  if (ui.hpFill) ui.hpFill.style.transform = `scaleX(${hpRatio})`;

  const hpClass = 'hp-fill' + (hpRatio <= 0.25 ? ' low' : hpRatio <= 0.5 ? ' mid' : '');

  if (lastHp !== null && hp !== lastHp && ui.hpFill) {
    const animClass = hp > lastHp ? 'anim-gain' : 'anim-loss';
    ui.hpFill.className = `${hpClass} ${animClass}`;
    setTimeout(() => { if (ui.hpFill) ui.hpFill.className = hpClass; }, 500);
  } else if (ui.hpFill) {
    ui.hpFill.className = hpClass;
  }

  lastHp = hp;
  let hpHudClass = '';
  if      (hp <= 0)           hpHudClass = 'hp-empty';
  else if (hpRatio <= 0.25)   hpHudClass = 'hp-low';
  else if (hpRatio <= 0.5)    hpHudClass = 'hp-mid';
  if (ui.hpHud)   ui.hpHud.className = hpHudClass;
  if (ui.hpTicks) ui.hpTicks.style.setProperty('--hp-max', String(maxHp));
}

export function updateMapProgress(currentSec: number, totalSec: number): void {
  if (!ui.mapProgress || !ui.mapProgressFill) return;
  const ratio = totalSec > 0 ? Math.min(1, currentSec / totalSec) : 0;
  ui.mapProgressFill.style.width = `${(ratio * 100).toFixed(1)}%`;
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
  if (ui.spinner) ui.spinner.style.display = 'none';
  ui.ovProgress.style.display = 'block';
  ui.ovProgress.classList.toggle('indeterminate', ratio === null);
  const pct = ratio === null ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  ui.ovBar.style.width = ratio === null ? '0%' : `${pct}%`;
  if (ui.ovProgressPct) ui.ovProgressPct.textContent = ratio === null ? '' : `${pct}%`;
  if (ui.ovInstr) ui.ovInstr.textContent = title;
  if (ui.ovLoadDetail) ui.ovLoadDetail.textContent = detail;
}

export function showCameraError(err: unknown): void {
  const asError = err instanceof Error ? err : null;
  const message = asError?.message ?? String(err);
  const name    = asError?.name ?? '';
  const cameraErrors = new Set(['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'SecurityError']);
  const isCameraError = cameraErrors.has(name);
  const isBusyCamera  = name === 'NotReadableError' || /allocate videosource|start video source|camera is already in use/i.test(message);
  let hint = t('errors.loadFailed');
  if (isBusyCamera)       hint = t('errors.cameraBusy');
  else if (isCameraError) hint = t('errors.cameraPermission');

  if (ui.spinner) ui.spinner.style.display = 'none';
  if (ui.ovInstr) ui.ovInstr.textContent = isCameraError ? t('errors.cameraError') : t('errors.startError');
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
  if (ui.overlay) ui.overlay.classList.add('is-gameover');
  showModalElement(ui.overlay);
  if (ui.hud)         ui.hud.style.display        = 'none';
  if (ui.mapProgress) ui.mapProgress.style.display = 'none';
  if (ui.goTitle) ui.goTitle.textContent = t(victory ? 'gameover.victoryTitle' : 'gameover.defeatTitle');
  const scoreStr = String(state.score).padStart(6, '0');
  const combo    = Math.max(0, state.maxCombo);
  if (ui.goBody) ui.goBody.innerHTML = `
    <div class="go-score-row">
      <span class="go-label">${t('gameover.score')}</span>
      <span class="go-value score-highlight">${scoreStr}</span>
    </div>
    <div class="go-combo-row">
      <span class="go-label">${t('gameover.bestCombo')}</span>
      <span class="go-value go-combo">×${combo}</span>
    </div>
    `;
  setIconButton(ui.ovBtn,      t('gameover.playAgain'), 'rotate-ccw');
  setIconButton(ui.ovBtnCalib, t('gameover.calibration'), 'settings');
  setIconButton(ui.ovBtnMenu,  t('gameover.mainMenu'), 'house');
  if (ui.ovBtnCalib) ui.ovBtnCalib.style.display = 'inline-flex';
  if (ui.ovBtnMenu)  ui.ovBtnMenu.style.display  = 'inline-flex';
  if (ui.dStatus)    ui.dStatus.textContent = t(victory ? 'gameover.victoryTitle' : 'gameover.defeatTitle');
}

export function showPauseMenu(): void {
  showModalElement(document.getElementById('pauseMenu'));
}

export function hidePauseMenu(): void {
  hideModalElement(document.getElementById('pauseMenu'));
}

export function showComboMilestone(combo: number): void {
  let el = document.getElementById('comboFlash') as (HTMLElement & { _timer?: ReturnType<typeof setTimeout> }) | null;
  if (!el) {
    el = document.createElement('div') as HTMLElement & { _timer?: ReturnType<typeof setTimeout> };
    el.id = 'comboFlash';
    el.style.cssText = `
      position:fixed; top:112px; right:32px; transform:translateY(-8px);
      z-index:600; pointer-events:none;
      font-family:'Oxanium',sans-serif; font-weight:900;
      font-size:clamp(30px,4vw,58px); letter-spacing:6px;
      color:#36f2a1; text-shadow:0 0 40px #36f2a1, 0 0 80px rgba(54,242,161,0.4);
      opacity:0; transition:opacity 0.1s;
    `;
    document.body.appendChild(el);
  }
  el.textContent = `×${combo}`;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    if (el) { el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; }
  }, 900);
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
