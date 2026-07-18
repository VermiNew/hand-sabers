import { t } from '../i18n/index.ts';

type SaberSide = 'left' | 'right';

interface SaberColorPickerOptions {
  getColor(side: SaberSide): string;
  onApply(side: SaberSide, hex: string): void;
}

function hexToHsl(hex: string): [number, number, number] {
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);
    if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
    else if (max === green) hue = ((blue - red) / delta + 2) / 6;
    else hue = ((red - green) / delta + 4) / 6;
  }
  return [Math.round(hue * 360), Math.round(saturation * 100), Math.round(lightness * 100)];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const intermediate = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = normalizedLightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) [red, green, blue] = [chroma, intermediate, 0];
  else if (hue < 120) [red, green, blue] = [intermediate, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, intermediate];
  else if (hue < 240) [red, green, blue] = [0, intermediate, chroma];
  else if (hue < 300) [red, green, blue] = [intermediate, 0, chroma];
  else [red, green, blue] = [chroma, 0, intermediate];

  const toHex = (value: number): string => Math.round((value + offset) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function initSaberColorPicker({ getColor, onApply }: SaberColorPickerOptions): void {
  const modal = document.getElementById('cpModal');
  const backdrop = modal?.querySelector<HTMLElement>('.cp-modal-backdrop');
  const sideBadge = document.getElementById('cpModalSideBadge');
  const swatch = document.getElementById('cpModalSwatch');
  const hexValue = document.getElementById('cpModalHexVal');
  const rgbValue = document.getElementById('cpModalRgbVal');
  const hueInput = document.getElementById('cpModalH') as HTMLInputElement | null;
  const saturationInput = document.getElementById('cpModalS') as HTMLInputElement | null;
  const lightnessInput = document.getElementById('cpModalL') as HTMLInputElement | null;
  const hueValue = document.getElementById('cpModalHVal');
  const saturationValue = document.getElementById('cpModalSVal');
  const lightnessValue = document.getElementById('cpModalLVal');
  const redValue = document.getElementById('cpModalR');
  const greenValue = document.getElementById('cpModalG');
  const blueValue = document.getElementById('cpModalB');
  const hexInput = document.getElementById('cpModalHexInput') as HTMLInputElement | null;
  const applyButton = document.getElementById('cpModalApply');
  const rejectButton = document.getElementById('cpModalReject');

  let side: SaberSide = 'left';
  let hue = 0;
  let saturation = 100;
  let lightness = 55;

  function sync(): void {
    if (hueInput) hueInput.value = String(hue);
    if (saturationInput) saturationInput.value = String(saturation);
    if (lightnessInput) lightnessInput.value = String(lightness);
    if (hueValue) hueValue.textContent = String(hue);
    if (saturationValue) saturationValue.textContent = String(saturation);
    if (lightnessValue) lightnessValue.textContent = String(lightness);
    modal?.style.setProperty('--cp-h', String(hue));
    const hex = hslToHex(hue, saturation, lightness);
    const [red, green, blue] = hexToRgb(hex);
    if (swatch) {
      swatch.style.background = hex;
      swatch.style.setProperty('--cp-glow', `${hex}88`);
    }
    if (hexValue) hexValue.textContent = hex.toUpperCase();
    if (rgbValue) rgbValue.textContent = `RGB(${red}, ${green}, ${blue})`;
    if (redValue) redValue.textContent = String(red);
    if (greenValue) greenValue.textContent = String(green);
    if (blueValue) blueValue.textContent = String(blue);
    if (hexInput) hexInput.value = hex;
  }

  function open(nextSide: SaberSide): void {
    side = nextSide;
    [hue, saturation, lightness] = hexToHsl(getColor(side));
    if (sideBadge) {
      sideBadge.textContent = side === 'left'
        ? t('settings.gameplay.leftHand')
        : t('settings.gameplay.rightHand');
    }
    sync();
    modal?.classList.add('is-open');
  }

  function close(): void {
    modal?.classList.remove('is-open');
  }

  hueInput?.addEventListener('input', () => { hue = Number(hueInput.value); sync(); });
  saturationInput?.addEventListener('input', () => { saturation = Number(saturationInput.value); sync(); });
  lightnessInput?.addEventListener('input', () => { lightness = Number(lightnessInput.value); sync(); });
  hexInput?.addEventListener('input', () => {
    const value = hexInput.value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
    [hue, saturation, lightness] = hexToHsl(value);
    sync();
  });
  applyButton?.addEventListener('click', () => {
    onApply(side, hslToHex(hue, saturation, lightness));
    close();
  });
  rejectButton?.addEventListener('click', close);
  backdrop?.addEventListener('pointerdown', close);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal?.classList.contains('is-open')) close();
  });
  document.querySelectorAll<HTMLButtonElement>('.cp-toggle').forEach(button => {
    button.addEventListener('click', () => open((button.dataset['side'] ?? 'left') as SaberSide));
  });
}
