import { cutDirectionLabel } from '../core/gameplay-rules.ts';
import { t } from '../i18n/index.ts';
import type { CutDirection } from '../types/index.js';

interface ScreenPosition {
  x: number;
  y: number;
}

const container = document.createElement('div');
container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;overflow:hidden;';
document.body.appendChild(container);

export function showHitFeedback(
  position: ScreenPosition,
  label: string,
  perfect: boolean,
  reason = '',
  deltaMs = 0,
  requiredCut: CutDirection = 'any',
): void {
  const element = document.createElement('div');
  const isBad = label === 'BAD';
  const color = isBad ? '#ffaa44' : perfect ? '#36f2a1' : '#8ec8ff';
  const absoluteMs = Math.abs(Math.round(deltaMs));
  const msSign = deltaMs > 0 ? '+' : deltaMs < 0 ? '−' : '';
  const msColor = absoluteMs < 30 ? '#36f2a1' : absoluteMs < 80 ? '#8ec8ff' : '#ffaa44';
  const cutFeedback = reason === 'cut'
    ? `<span style="display:block;font-size:10px;letter-spacing:1.5px;color:#ffb45c;margin-top:3px">${t('hit.wrongDirection')} ${cutDirectionLabel(requiredCut)}</span>`
    : '';
  element.innerHTML = `
    <span style="display:block">${label}</span>
    <span style="display:block;font-size:11px;letter-spacing:2px;color:${msColor};opacity:0.85;margin-top:2px">${msSign}${absoluteMs} ms</span>
    ${cutFeedback}
  `;
  element.style.cssText = `
    position:absolute;
    font-family:'Oxanium',sans-serif;
    font-size:${perfect ? 22 : isBad ? 18 : 16}px;
    font-weight:900;
    letter-spacing:4px;
    color:${color};
    text-shadow:0 0 20px ${color};
    text-align:center;
    opacity:1;
    transition:opacity 0.35s, transform 0.35s;
    pointer-events:none;
    white-space:nowrap;
  `;
  const screenX = window.innerWidth * (0.5 - position.x * 0.08);
  const screenY = window.innerHeight * (0.42 - position.y * 0.06);
  element.style.left = `${screenX}px`;
  element.style.top = `${screenY}px`;
  element.style.transform = 'translate(-50%, -50%)';
  container.appendChild(element);
  requestAnimationFrame(() => {
    element.style.opacity = '0';
    element.style.transform = 'translate(-50%, -120%)';
  });
  setTimeout(() => element.remove(), 380);
}
