import { t } from '../i18n/index.ts';
import { SNAP_DIVISIONS, state } from './state.ts';

function getSnapDivision(): number | null {
  return SNAP_DIVISIONS[state.snapIdx] ?? null;
}

function getSnapLabel(): string | null {
  const division = getSnapDivision();
  return division ? `1/${division * 4}` : null;
}

export function getSnap(): number | null {
  const division = getSnapDivision();
  if (!division) return null;
  const bpm = Math.max(20, Math.min(400, Number(state.map.meta.bpm) || 120));
  return (60 / bpm) / division;
}

export function snapTime(time: number): number {
  const snap = getSnap();
  return snap ? Math.round(time / snap) * snap : time;
}

export function cycleSnap(): void {
  state.snapIdx = (state.snapIdx + 1) % SNAP_DIVISIONS.length;
  const label = getSnapLabel();
  const button = document.getElementById('btnSnap');
  const status = document.getElementById('stSnap');
  if (button) {
    button.textContent = label ? t('creator.snapOn', { value: label }) : t('creator.snapOff');
    button.classList.toggle('active', Boolean(label));
  }
  if (status) status.textContent = label ?? t('creator.off');
}
