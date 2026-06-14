interface CalibStep {
  id: string;
  title: string;
  instr: string;
  autoMs: number;
}

export const CALIB_STEPS: readonly CalibStep[];

export function setCalibAutoAdvanceHandler(fn: () => void): void;
export function setAutoFlipSuggestionHandler(fn: (() => void) | null): void;
export function setSaberTargetSetter(fn: (side: 'left' | 'right', pos: { x: number; y: number; z: number }) => void): void;
export function applyTrackingSettings(settings: Record<string, unknown>): void;
export function resetCalibration(): void;
export function finishCalibStep(idx: number): void;
export function renderCalibStep(): void;
export function stopTracking(): void;
export function initMP(onReady: () => void): Promise<void>;
