export interface SaberColor {
  id: string;
  hex: string;
  labelKey: string;
}

// Kolory mieczy — 12 predefiniowanych opcji
export const SABER_COLORS: readonly SaberColor[] = [
  { id: 'green',  hex: '#36f2a1', labelKey: 'settings.gameplay.colorNames.green' },
  { id: 'blue',   hex: '#2f7cff', labelKey: 'settings.gameplay.colorNames.blue' },
  { id: 'red',    hex: '#ff2233', labelKey: 'settings.gameplay.colorNames.red' },
  { id: 'purple', hex: '#a855f7', labelKey: 'settings.gameplay.colorNames.purple' },
  { id: 'yellow', hex: '#ffe033', labelKey: 'settings.gameplay.colorNames.yellow' },
  { id: 'orange', hex: '#ff6a00', labelKey: 'settings.gameplay.colorNames.orange' },
  { id: 'pink',   hex: '#ff3399', labelKey: 'settings.gameplay.colorNames.pink' },
  { id: 'cyan',   hex: '#00d4ff', labelKey: 'settings.gameplay.colorNames.cyan' },
  { id: 'white',  hex: '#e8f0ff', labelKey: 'settings.gameplay.colorNames.white' },
  { id: 'gold',   hex: '#ffb700', labelKey: 'settings.gameplay.colorNames.gold' },
  { id: 'lime',   hex: '#7dff2e', labelKey: 'settings.gameplay.colorNames.lime' },
  { id: 'indigo', hex: '#6d3bff', labelKey: 'settings.gameplay.colorNames.indigo' },
];

export function findClosestSaberColor(hex: unknown): SaberColor {
  return SABER_COLORS.find(c => c.hex.toLowerCase() === String(hex).toLowerCase())
    || SABER_COLORS[0]!;
}
