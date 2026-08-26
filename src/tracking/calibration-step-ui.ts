import { t } from '../i18n/index.ts';
import { ui } from '../ui/ui.ts';
import type { OneHandMode } from '../types/index.js';

export interface CalibStep {
  id: 'arms' | 'zone' | 'sides' | 'confirm';
  autoMs: number;
}

export const CALIB_STEPS: readonly CalibStep[] = [
  { id: 'arms', autoMs: 2000 },
  { id: 'zone', autoMs: 3000 },
  { id: 'sides', autoMs: 1600 },
  { id: 'confirm', autoMs: 1500 },
];

export function renderCalibrationStep(
  index: number,
  oneHandMode: OneHandMode,
  scheduleAutoAdvance: () => void,
): void {
  const step = CALIB_STEPS[index];
  if (!step) return;
  const total = CALIB_STEPS.length;
  const percent = ((index + 1) / total) * 100;
  const instructionKey = oneHandMode ? 'oneHand' : 'instruction';

  if (ui.calibStep) ui.calibStep.textContent = t(`calib.steps.${step.id}.title`);
  if (ui.calibInstr) ui.calibInstr.textContent = t(`calib.steps.${step.id}.${instructionKey}`);
  if (ui.calibBar) ui.calibBar.style.width = `${percent}%`;
  if (ui.calibStepBadge) {
    ui.calibStepBadge.textContent = t('calib.stepBadge', { current: index + 1, total });
  }
  if (ui.calibProgressLabel) {
    ui.calibProgressLabel.textContent = `${Math.round(percent)}%`;
  }
  if (ui.calibStepsTrack) {
    ui.calibStepsTrack.innerHTML = CALIB_STEPS.map((candidate, stepIndex) => {
      const className = stepIndex < index ? 'is-done' : stepIndex === index ? 'is-active' : '';
      const connector = stepIndex < total - 1
        ? `<div class="calib-step-connector${stepIndex < index ? ' is-done' : ''}"></div>`
        : '';
      return `<div class="calib-step-dot ${className}">
        <div class="calib-step-num">${stepIndex < index ? '<span class="material-symbols-rounded" style="font-size:13px">check</span>' : stepIndex + 1}</div>
        <span class="calib-step-label">${t(`calib.labels.${candidate.id}`)}</span>
      </div>${connector}`;
    }).join('');
  }

  scheduleAutoAdvance();
}
