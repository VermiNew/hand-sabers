import { SABER_COLORS } from '../core/saber-colors.ts';
import { setSetting } from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import type { Settings } from '../types/index.js';
import { initSaberColorPicker } from '../ui/saber-color-picker.ts';
import { initSaberModelPicker } from '../ui/saber-model-picker.ts';
import { setBlockColor } from './gameplay.ts';
import { setSaberColor, setSaberModel } from './scene.ts';

type SaberSide = 'left' | 'right';
type SaberModel = Parameters<typeof setSaberModel>[1];

export interface SaberSettingsController {
  sync(): void;
}

function applySaberColor(side: SaberSide, hex: string): void {
  setSaberColor(side, hex);
  setBlockColor(side, parseInt(hex.replace('#', ''), 16));
}

export function applySaberAppearance(settings: Settings): void {
  if (settings.saberColorLeft) applySaberColor('left', settings.saberColorLeft);
  if (settings.saberColorRight) applySaberColor('right', settings.saberColorRight);
  setSaberModel('left', (settings.saberModelLeft || settings.saberModel || 'classic') as SaberModel);
  setSaberModel('right', (settings.saberModelRight || settings.saberModel || 'classic') as SaberModel);
}

export function initSaberSettings(settings: Settings): SaberSettingsController {
  function updateColorPreview(
    previewBar: HTMLElement | null,
    previewName: HTMLElement | null,
    color: { hex: string; labelKey?: string; label?: string },
  ): void {
    if (previewBar) {
      previewBar.style.background = color.hex;
      previewBar.style.boxShadow = `0 0 8px 2px ${color.hex}88`;
    }
    if (previewName) previewName.textContent = color.labelKey ? t(color.labelKey) : (color.label ?? '');
  }

  function buildColorGrid(side: SaberSide, currentHex: string): void {
    const suffix = side === 'left' ? 'Left' : 'Right';
    const grid = document.getElementById(`saberColorGrid${suffix}`);
    const previewBar = document.getElementById(`saberColorPreview${suffix}`);
    const previewName = document.getElementById(`saberColorName${suffix}`);
    if (!grid) return;

    const selectedColor = SABER_COLORS.find(color => color.hex.toLowerCase() === currentHex.toLowerCase());
    grid.innerHTML = '';

    for (const color of SABER_COLORS) {
      const selected = color === selectedColor;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `saber-color-swatch${selected ? ' is-selected' : ''}`;
      button.title = t(color.labelKey);
      button.setAttribute('aria-label', t(color.labelKey));
      button.setAttribute('aria-checked', String(selected));
      button.setAttribute('role', 'radio');
      button.style.setProperty('background-color', color.hex);
      button.style.setProperty('--saber-glow', `${color.hex}66`);

      button.addEventListener('click', () => {
        grid.querySelectorAll('.saber-color-swatch').forEach(swatch => {
          swatch.classList.remove('is-selected');
          swatch.setAttribute('aria-checked', 'false');
        });
        button.classList.add('is-selected');
        button.setAttribute('aria-checked', 'true');

        applySaberColor(side, color.hex);
        const settingKey = side === 'left' ? 'saberColorLeft' : 'saberColorRight';
        settings[settingKey] = color.hex;
        setSetting(settingKey, color.hex);
        updateColorPreview(previewBar, previewName, color);
      });

      grid.appendChild(button);
    }

    updateColorPreview(
      previewBar,
      previewName,
      selectedColor ?? { hex: currentHex, label: t('settings.gameplay.custom') },
    );
  }

  function syncModelPicker(): void {
    const leftModel = (settings.saberModelLeft || settings.saberModel || 'classic') as SaberModel;
    const rightModel = (settings.saberModelRight || settings.saberModel || 'classic') as SaberModel;
    setSaberModel('left', leftModel);
    setSaberModel('right', rightModel);
    const labels: Record<SaberModel, string> = {
      classic: t('settings.gameplay.modelClassic'),
      wide: t('settings.gameplay.modelWide'),
      thin: t('settings.gameplay.modelThin'),
      prism: t('settings.gameplay.modelPrism'),
      edge: t('settings.gameplay.modelEdge'),
      pulse: t('settings.gameplay.modelPulse'),
    };
    const leftSummary = document.getElementById('saberModelSummaryLeft');
    const rightSummary = document.getElementById('saberModelSummaryRight');
    if (leftSummary) leftSummary.textContent = labels[leftModel];
    if (rightSummary) rightSummary.textContent = labels[rightModel];
  }

  initSaberModelPicker({
    getColor: side => side === 'left'
      ? settings.saberColorLeft || '#36f2a1'
      : settings.saberColorRight || '#2f7cff',
    getModel: side => (
      side === 'left'
        ? settings.saberModelLeft || settings.saberModel || 'classic'
        : settings.saberModelRight || settings.saberModel || 'classic'
    ) as SaberModel,
    onApply: (leftModel, rightModel) => {
      settings.saberModel = leftModel;
      settings.saberModelLeft = leftModel;
      settings.saberModelRight = rightModel;
      setSetting('saberModel', leftModel);
      setSetting('saberModelLeft', leftModel);
      setSetting('saberModelRight', rightModel);
      syncModelPicker();
    },
  });

  initSaberColorPicker({
    getColor: side => side === 'left'
      ? settings.saberColorLeft || '#36f2a1'
      : settings.saberColorRight || '#2f7cff',
    onApply: (side, hex) => {
      applySaberColor(side, hex);
      const key = side === 'left' ? 'saberColorLeft' : 'saberColorRight';
      settings[key] = hex;
      setSetting(key, hex);
      const suffix = side === 'left' ? 'Left' : 'Right';
      updateColorPreview(
        document.getElementById(`saberColorPreview${suffix}`),
        document.getElementById(`saberColorName${suffix}`),
        { hex, label: t('settings.gameplay.custom') },
      );
    },
  });

  function sync(): void {
    const leftColor = settings.saberColorLeft || '#36f2a1';
    const rightColor = settings.saberColorRight || '#2f7cff';
    applySaberColor('left', leftColor);
    applySaberColor('right', rightColor);
    buildColorGrid('left', leftColor);
    buildColorGrid('right', rightColor);
    syncModelPicker();
  }

  sync();
  return { sync };
}
