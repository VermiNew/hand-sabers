import Fuse from 'fuse.js';
import { getSetting, setSetting } from '../core/settings.ts';
import type { MapEntry } from './library-api.ts';

interface LibraryFilterOptions {
  query: string;
  difficulty: string;
  sort: string;
  favoritesOnly: boolean;
  getBestScore(mapId: string): number;
}

export interface LibraryFilterController {
  filter(options: LibraryFilterOptions): MapEntry[];
  isFavorite(mapId: string): boolean;
  setMaps(maps: MapEntry[]): void;
  toggleFavorite(mapId: string): void;
}

export function createLibraryFilter(): LibraryFilterController {
  const favoriteMapIds = new Set(getSetting('favoriteMapIds'));
  let allMaps: MapEntry[] = [];
  let fuse: Fuse<MapEntry> | null = null;

  function isFavorite(mapId: string): boolean {
    return favoriteMapIds.has(mapId);
  }

  return {
    filter({ query, difficulty, sort, favoritesOnly, getBestScore }): MapEntry[] {
      let maps = query && fuse
        ? fuse.search(query).map(result => result.item)
        : [...allMaps];

      if (difficulty) {
        maps = maps.filter(map => (map.meta?.difficulty ?? '').toLowerCase() === difficulty.toLowerCase());
      }
      if (favoritesOnly) maps = maps.filter(map => isFavorite(map.id));

      maps.sort((a, b) => {
        const favoriteOrder = Number(isFavorite(b.id)) - Number(isFavorite(a.id));
        if (favoriteOrder !== 0) return favoriteOrder;
        if (sort === 'alpha') return (a.meta?.title ?? a.id).localeCompare(b.meta?.title ?? b.id);
        if (sort === 'newest') return String(b.updatedAt ?? b.id).localeCompare(String(a.updatedAt ?? a.id));
        if (sort === 'beats') return (b.beats?.length ?? 0) - (a.beats?.length ?? 0);
        if (sort === 'score') return getBestScore(b.id) - getBestScore(a.id);
        return 0;
      });

      return maps;
    },
    isFavorite,
    setMaps(maps): void {
      allMaps = maps;
      fuse = new Fuse(allMaps, {
        keys: ['meta.title', 'meta.artist', 'meta.mapper', 'id'],
        threshold: 0.35,
        includeScore: false,
      });
    },
    toggleFavorite(mapId): void {
      if (favoriteMapIds.has(mapId)) favoriteMapIds.delete(mapId);
      else favoriteMapIds.add(mapId);
      setSetting('favoriteMapIds', [...favoriteMapIds]);
    },
  };
}
