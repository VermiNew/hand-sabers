import type { MapEntry } from './library-api.ts';

export function getAutosaveMap(): MapEntry | null {
  try {
    const parsed = JSON.parse(localStorage.getItem('hs_autosave') ?? 'null') as MapEntry | null;
    if (parsed?.id && Array.isArray(parsed.beats)) {
      return { ...parsed, source: 'autosave', localOnly: true };
    }
  } catch {}
  return null;
}

export function mergeMaps(serverMaps: MapEntry[], localMaps: MapEntry[]): MapEntry[] {
  const byId = new Map<string, MapEntry>();
  for (const map of serverMaps) byId.set(map.id, { ...map, source: 'server' });
  for (const map of localMaps) {
    byId.set(map.id, { ...map, source: byId.has(map.id) ? 'server+local' : 'local' });
  }
  return [...byId.values()].sort((left, right) => {
    const leftOrder = left.updatedAt ?? left.meta?.title ?? left.id;
    const rightOrder = right.updatedAt ?? right.meta?.title ?? right.id;
    return String(rightOrder).localeCompare(String(leftOrder));
  });
}
