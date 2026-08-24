export interface CalibrationUIController {
  getRememberCalibration(): boolean;
  hidePanel(): void;
  showModeSelector(rememberCalibration: boolean): void;
  showPanel(): void;
  showSteps(manualMode: boolean): void;
}

export function createCalibrationUI(): CalibrationUIController {
  const panel = document.getElementById('calibPanel');
  const modeSelector = document.getElementById('calibModeSelector');
  const stepBadge = document.getElementById('calibStepBadge');
  const stepTitle = document.getElementById('calibStep');
  const stepDescription = document.getElementById('calibInstr');
  const progress = document.querySelector<HTMLElement>('.calib-progress-wrap');
  const progressLabel = document.getElementById('calibProgressLabel');
  const actions = document.querySelector<HTMLElement>('.calib-actions');
  const rememberInput = document.getElementById('calibRememberCheckbox') as HTMLInputElement | null;
  const nextButton = document.getElementById('calibBtnNext');
  const stepElements = [stepBadge, stepTitle, stepDescription, progress, progressLabel, actions];

  function setStepContentVisible(visible: boolean): void {
    for (const element of stepElements) {
      if (element) element.hidden = !visible;
    }
  }

  return {
    getRememberCalibration: () => rememberInput?.checked ?? false,
    hidePanel(): void {
      panel?.classList.remove('show');
    },
    showModeSelector(rememberCalibration): void {
      if (modeSelector) modeSelector.hidden = false;
      setStepContentVisible(false);
      if (rememberInput) rememberInput.checked = rememberCalibration;
    },
    showPanel(): void {
      panel?.classList.add('show');
    },
    showSteps(manualMode): void {
      if (modeSelector) modeSelector.hidden = true;
      setStepContentVisible(true);
      if (nextButton) nextButton.style.display = manualMode ? '' : 'none';
    },
  };
}
