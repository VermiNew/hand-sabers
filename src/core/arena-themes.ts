export interface ArenaTheme {
  id: string;
  labelKey: string;
  sceneBg: string;
  fog: string;
  ambient: string;
  floor: string;
  // Shader palette (used by background shader for music-reactive layers)
  shader: {
    /** Deep base colour (bottom of sky) */
    base: string;
    /** Upper tint of the sky */
    top: string;
    /** Nebula / aurora primary */
    nebulaA: string;
    /** Nebula / aurora secondary */
    nebulaB: string;
    /** Cloud / dust mid-band */
    cloud: string;
    /** Horizon glow */
    horizon: string;
    /** Star / sparkle tint */
    star: string;
    /** Lane darkening (kept dark to preserve block readability) */
    lane: string;
    /** Particle / accent tint (sabers hint) */
    accent: string;
  };
}

export const ARENA_THEMES: ArenaTheme[] = [
  {
    id: 'cosmic',
    labelKey: 'arena.cosmic',
    sceneBg: '#050510',
    fog: '#050510',
    ambient: '#080818',
    floor: '#0a0a20',
    shader: {
      base:    '#01010a',
      top:     '#07041c',
      nebulaA: '#0e3aa6',
      nebulaB: '#6b1ab0',
      cloud:   '#1a1660',
      horizon: '#1ad0c0',
      star:    '#a8c8ff',
      lane:    '#020208',
      accent:  '#7fb8ff',
    },
  },
  {
    id: 'sunset',
    labelKey: 'arena.sunset',
    sceneBg: '#150808',
    fog: '#0d0505',
    ambient: '#1a0808',
    floor: '#200a0a',
    shader: {
      base:    '#0c0303',
      top:     '#1a0612',
      nebulaA: '#c63a1f',
      nebulaB: '#a01446',
      cloud:   '#5b1620',
      horizon: '#ffb060',
      star:    '#ffd4a8',
      lane:    '#080202',
      accent:  '#ff9050',
    },
  },
  {
    id: 'neon',
    labelKey: 'arena.neon',
    sceneBg: '#080018',
    fog: '#050010',
    ambient: '#080018',
    floor: '#0a0020',
    shader: {
      base:    '#06001a',
      top:     '#12022c',
      nebulaA: '#9c1ce0',
      nebulaB: '#1ad8ff',
      cloud:   '#3a0a78',
      horizon: '#ff1ce0',
      star:    '#d4b0ff',
      lane:    '#04000c',
      accent:  '#ff48e6',
    },
  },
  {
    id: 'forest',
    labelKey: 'arena.forest',
    sceneBg: '#081008',
    fog: '#050d05',
    ambient: '#081808',
    floor: '#0a200a',
    shader: {
      base:    '#03100a',
      top:     '#061a18',
      nebulaA: '#1e7a3a',
      nebulaB: '#3cb878',
      cloud:   '#0e4a26',
      horizon: '#9af04e',
      star:    '#d8f0c0',
      lane:    '#020806',
      accent:  '#88e070',
    },
  },
  {
    id: 'arctic',
    labelKey: 'arena.arctic',
    sceneBg: '#0a1018',
    fog: '#050a10',
    ambient: '#101828',
    floor: '#0a1418',
    shader: {
      base:    '#04080f',
      top:     '#0a1428',
      nebulaA: '#3a90d6',
      nebulaB: '#a0d8ff',
      cloud:   '#163a5a',
      horizon: '#7ad8ff',
      star:    '#e0f0ff',
      lane:    '#020608',
      accent:  '#5ac0ff',
    },
  },
];

export function getArenaTheme(id: string): ArenaTheme {
  return ARENA_THEMES.find(t => t.id === id) || ARENA_THEMES[0]!;
}
