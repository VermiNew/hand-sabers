import { SABER_COLORS } from '../core/saber-colors.ts';
import { setSetting } from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import type { Settings } from '../types/index.js';
import { initSaberColorPicker } from '../ui/saber-color-picker.ts';
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
  if (settings.saberModel) {
    const model = settings.saberModel as SaberModel;
    setSaberModel('left', model);
    setSaberModel('right', model);
  }
}

export function initSaberSettings(settings: Settings): SaberSettingsController {
  const modelPicker = document.getElementById('saberModelPicker');

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
    const model = (settings.saberModel || 'classic') as SaberModel;
    setSaberModel('left', model);
    setSaberModel('right', model);
    modelPicker?.querySelectorAll<HTMLElement>('[data-saber-model]').forEach(button => {
      button.classList.toggle('is-active', button.dataset['saberModel'] === model);
    });
  }

  modelPicker?.querySelectorAll<HTMLButtonElement>('[data-saber-model]').forEach(button => {
    button.addEventListener('click', () => {
      const model = button.dataset['saberModel'] as SaberModel | undefined;
      if (!model) return;
      settings.saberModel = model;
      setSetting('saberModel', model);
      syncModelPicker();
    });
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
