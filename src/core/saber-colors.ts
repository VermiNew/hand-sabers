export interface SaberColor {
  id: string;
  hex: string;
  label: string;
}

// Kolory mieczy — 12 predefiniowanych opcji
export const SABER_COLORS: readonly SaberColor[] = [
  { id: 'green',   hex: '#36f2a1', label: 'Zielony'      },
  { id: 'blue',    hex: '#2f7cff', label: 'Niebieski'    },
  { id: 'red',     hex: '#ff2233', label: 'Czerwony'     },
  { id: 'purple',  hex: '#a855f7', label: 'Fioletowy'    },
  { id: 'yellow',  hex: '#ffe033', label: 'Żółty'        },
  { id: 'orange',  hex: '#ff6a00', label: 'Pomarańczowy' },
  { id: 'pink',    hex: '#ff3399', label: 'Różowy'       },
  { id: 'cyan',    hex: '#00d4ff', label: 'Cyjan'        },
  { id: 'white',   hex: '#e8f0ff', label: 'Biały'        },
  { id: 'gold',    hex: '#ffb700', label: 'Złoty'        },
  { id: 'lime',    hex: '#7dff2e', label: 'Limonkowy'    },
  { id: 'indigo',  hex: '#6d3bff', label: 'Indygo'       },
];

export function findClosestSaberColor(hex: unknown): SaberColor {
  return SABER_COLORS.find(c => c.hex.toLowerCase() === String(hex).toLowerCase())
    || SABER_COLORS[0]!;
}
