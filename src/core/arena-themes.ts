export interface ArenaTheme {
  id: string;
  labelKey: string;
  sceneBg: string;
  fog: string;
  ambient: string;
  floor: string;
}

export const ARENA_THEMES: ArenaTheme[] = [
  {
    id: 'cosmic',
    labelKey: 'arena.cosmic',
    sceneBg: '#050510',
    fog: '#050510',
    ambient: '#080818',
    floor: '#0a0a20',
  },
  {
    id: 'sunset',
    labelKey: 'arena.sunset',
    sceneBg: '#150808',
    fog: '#0d0505',
    ambient: '#1a0808',
    floor: '#200a0a',
  },
  {
    id: 'neon',
    labelKey: 'arena.neon',
    sceneBg: '#080018',
    fog: '#050010',
    ambient: '#080018',
    floor: '#0a0020',
  },
  {
    id: 'forest',
    labelKey: 'arena.forest',
    sceneBg: '#081008',
    fog: '#050d05',
    ambient: '#081808',
    floor: '#0a200a',
  },
  {
    id: 'arctic',
    labelKey: 'arena.arctic',
    sceneBg: '#0a1018',
    fog: '#050a10',
    ambient: '#101828',
    floor: '#0a1418',
  },
];

export function getArenaTheme(id: string): ArenaTheme {
  return ARENA_THEMES.find(t => t.id === id) || ARENA_THEMES[0]!;
}
