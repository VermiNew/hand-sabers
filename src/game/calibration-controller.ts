import { setSetting } from '../core/settings.ts';
import { S, state } from '../core/state.ts';
import {
  CALIB_STEPS,
  finishCalibStep,
  getCalibrationData,
  renderCalibStep,
  resetCalibration,
  setManualCalibrationMode,
} from '../tracking/tracking.ts';
import type { Settings } from '../types/index.js';
import { ui } from '../ui/ui.ts';
import type { CalibrationUIController } from './calibration-ui.ts';

interface CalibrationControllerOptions {
  onComplete(): Promise<void> | void;
}

export interface CalibrationController {
  advance(): Promise<void>;
  beginSteps(mode: 'manual' | 'auto'): void;
  isReady(): boolean;
  setReady(ready: boolean): void;
  start(): void;
}

export function createCalibrationController(
  settings: Settings,
  calibrationUI: CalibrationUIController,
  { onComplete }: CalibrationControllerOptions,
): CalibrationController {
  let ready = false;
  let stepsStarted = false;
  let advancing = false;

  function start(): void {
    if (state.appState !== S.LOADING) return;
    ready = false;
    stepsStarted = false;
    calibrationUI.showPanel();
    resetCalibration();
    state.appState = S.CALIB;
    if (ui.dStatus) ui.dStatus.textContent = 'CALIB';
    calibrationUI.showModeSelector(settings.rememberCalibration);
  }

  function beginSteps(mode: 'manual' | 'auto'): void {
    if (state.appState !== S.CALIB || stepsStarted) return;
    stepsStarted = true;
    setSetting('calibrationMode', mode);
    const manualMode = mode === 'manual';
    setManualCalibrationMode(manualMode);
    setSetting('rememberCalibration', calibrationUI.getRememberCalibration());
    calibrationUI.showSteps(manualMode);
    state.calibIdx = 0;
    renderCalibStep();
  }

  async function advance(): Promise<void> {
    if (state.appState !== S.CALIB || !stepsStarted || advancing) return;
    advancing = true;
    try {
      finishCalibStep(state.calibIdx);
      if (state.calibIdx < CALIB_STEPS.length - 1) {
        state.calibIdx++;
        renderCalibStep();
        return;
      }

      stepsStarted = false;
      ready = true;
      if (settings.rememberCalibration) {
        const data = getCalibrationData();
        setSetting('savedCalibration', {
          minX: data.minX,
          maxX: data.maxX,
          minY: data.minY,
          maxY: data.maxY,
          rangeX: data.rangeX,
          rangeY: data.rangeY,
        });
      }
      await onComplete();
    } finally {
      advancing = false;
    }
  }

  return {
    advance,
    beginSteps,
    isReady: () => ready,
    setReady(value): void {
      ready = value;
    },
    start,
  };
}
