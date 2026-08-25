export interface MapEntry {
  id: string;
  source: 'server' | 'local' | 'autosave' | 'server+local';
  localOnly?: boolean;
  meta?: {
    title?: string;
    artist?: string;
    mapper?: string;
    difficulty?: string;
    duration?: number;
    bpm?: number;
    audioFile?: string;
    audioUrl?: string;
    previewStartSec?: number;
  };
  beats?: unknown[];
  updatedAt?: string;
  _serverAudioPending?: boolean;
  _localAudioPending?: boolean;
  _audioReady?: boolean;
}

export interface ScoreEntry {
  mapId: string;
  player: string;
  score: number;
  combo: number;
  date?: string;
  progress?: number;
  localOnly?: boolean;
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export async function checkServerHealth(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      const response = await fetch('/api/health', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (response.ok) return true;
    } catch {
      // The server may still be starting. Retry once before showing offline UI.
    }
    if (attempt === 0) await new Promise(resolve => window.setTimeout(resolve, 700));
  }
  return false;
}

export async function loadServerMaps(): Promise<MapEntry[]> {
  const list = await fetchJson<{ id: string }[]>('/api/maps');
  return Promise.all(list.map(async map => {
    try {
      return {
        ...(await fetchJson<MapEntry>(`/api/maps/${encodeURIComponent(map.id)}`)),
        source: 'server' as const,
      };
    } catch {
      return { id: map.id, meta: { title: map.id }, beats: [], source: 'server' as const };
    }
  }));
}
