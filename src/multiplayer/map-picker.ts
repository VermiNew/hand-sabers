import { t } from '../i18n/index.ts';

interface MapSummary {
  id: string;
  title: string;
  artist: string;
  difficulty: string;
  bpm: number | null;
  duration: number | null;
  beats: number;
}

interface MapPayload {
  id?: unknown;
  meta?: Record<string, unknown>;
  beats?: unknown;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing multiplayer map picker element: ${id}`);
  return found as T;
}

function cleanText(value: unknown, fallback = ''): string {
  const cleaned = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  return cleaned || fallback;
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—:—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function parseMap(payload: MapPayload, fallbackId: string): MapSummary {
  const id = cleanText(payload.id, fallbackId);
  const meta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
    ? payload.meta
    : {};
  return {
    id,
    title: cleanText(meta['title'], id),
    artist: cleanText(meta['artist'], cleanText(meta['mapper'])),
    difficulty: cleanText(meta['difficulty']),
    bpm: finitePositive(meta['bpm']),
    duration: finitePositive(meta['duration']),
    beats: Array.isArray(payload.beats) ? payload.beats.length : 0,
  };
}

function appendWave(card: HTMLElement, seed: string): void {
  const wave = document.createElement('span');
  wave.className = 'mp-map-card-wave';
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  for (let index = 0; index < 18; index++) {
    const bar = document.createElement('i');
    bar.style.setProperty('--h', `${18 + ((hash >> (index % 12)) + index * 17) % 46}%`);
    wave.append(bar);
  }
  card.append(wave);
}

export function initMultiplayerMapPicker(onSelect: (mapId: string) => void): {
  load(): Promise<void>;
  setEnabled(enabled: boolean): void;
  setSelected(mapId: string | null): void;
} {
  const overlay = element<HTMLElement>('multiplayerMapPicker');
  const openButton = element<HTMLButtonElement>('multiplayerMapPickerOpen');
  const closeButton = element<HTMLButtonElement>('multiplayerMapPickerClose');
  const searchInput = element<HTMLInputElement>('multiplayerMapSearch');
  const list = element<HTMLElement>('multiplayerMapList');
  const selectedValue = element<HTMLElement>('multiplayerMapValue');
  searchInput.placeholder = t('multiplayer.searchMaps');
  let maps: MapSummary[] = [];
  let selectedId: string | null = null;
  let loading = false;

  const close = () => {
    overlay.hidden = true;
    openButton.focus({ preventScroll: true });
  };

  const render = () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const filtered = maps.filter(map => !query
      || `${map.title} ${map.artist} ${map.difficulty} ${map.id}`.toLocaleLowerCase().includes(query));
    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'mp-map-picker-empty';
      empty.textContent = t(loading ? 'multiplayer.loadingMaps' : 'multiplayer.noMapsFound');
      list.append(empty);
      return;
    }

    for (const map of filtered) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `mp-map-card${map.id === selectedId ? ' is-selected' : ''}`;
      card.dataset['mapId'] = map.id;
      card.setAttribute('aria-pressed', String(map.id === selectedId));

      const icon = document.createElement('span');
      icon.className = 'material-symbols-rounded mp-map-card-icon';
      icon.textContent = 'music_note';
      const content = document.createElement('span');
      content.className = 'mp-map-card-content';
      const title = document.createElement('strong');
      title.textContent = map.title;
      const subtitle = document.createElement('span');
      subtitle.textContent = [map.artist, map.difficulty].filter(Boolean).join(' · ') || map.id;
      const stats = document.createElement('span');
      stats.className = 'mp-map-card-stats';
      stats.textContent = `${map.bpm ? `${Math.round(map.bpm)} BPM` : '— BPM'} · ${formatDuration(map.duration)} · ${map.beats} ${t('multiplayer.beats')}`;
      content.append(title, subtitle, stats);
      const check = document.createElement('span');
      check.className = 'material-symbols-rounded mp-map-card-check';
      check.textContent = map.id === selectedId ? 'check_circle' : 'chevron_right';
      card.append(icon, content, check);
      appendWave(card, map.id);
      card.addEventListener('click', () => {
        selectedId = map.id;
        selectedValue.textContent = map.title;
        onSelect(map.id);
        close();
        render();
      });
      list.append(card);
    }
  };

  openButton.addEventListener('click', () => {
    overlay.hidden = false;
    searchInput.value = '';
    render();
    searchInput.focus();
  });
  closeButton.addEventListener('click', close);
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) close();
  });
  searchInput.addEventListener('input', render);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) close();
  });

  return {
    async load() {
      if (loading) return;
      loading = true;
      render();
      try {
        const response = await fetch('/api/maps');
        const payload = await response.json() as unknown;
        if (!response.ok || !Array.isArray(payload)) throw new Error(t('multiplayer.mapsError'));
        const ids = payload
          .map(value => cleanText((value as { id?: unknown } | null)?.id))
          .filter(id => /^[a-z0-9][a-z0-9_-]{0,119}$/i.test(id));
        maps = await Promise.all(ids.map(async id => {
          try {
            const mapResponse = await fetch(`/api/maps/${encodeURIComponent(id)}`);
            if (!mapResponse.ok) throw new Error();
            return parseMap(await mapResponse.json() as MapPayload, id);
          } catch {
            return parseMap({ id }, id);
          }
        }));
        maps.sort((left, right) => left.title.localeCompare(right.title));
      } finally {
        loading = false;
        const selected = maps.find(map => map.id === selectedId);
        selectedValue.textContent = selected?.title ?? selectedId ?? t('multiplayer.selectMap');
        render();
      }
    },
    setEnabled(enabled) {
      openButton.disabled = !enabled;
    },
    setSelected(mapId) {
      selectedId = mapId;
      const selected = maps.find(map => map.id === mapId);
      selectedValue.textContent = selected?.title ?? mapId ?? t('multiplayer.selectMap');
      render();
    },
  };
}
