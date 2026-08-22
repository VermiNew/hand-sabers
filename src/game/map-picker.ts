import { t, translateDom } from '../i18n/index.ts';
import { readLocalMaps, readLocalScores } from '../core/localstore.ts';
import { normalizeMap } from '../core/map-format.ts';
import { importMapLocally, importMapToServer } from '../core/map-import.ts';

interface MapMeta {
  title?: string;
  artist?: string;
  mapper?: string;
  difficulty?: string;
  duration?: number;
  bpm?: number;
  audioFile?: string;
  audioUrl?: string;
  previewStartSec?: number;
}

interface MapEntry {
  id: string;
  meta?: MapMeta;
  beats?: unknown[];
  updatedAt?: string;
  _serverAudioPending?: boolean;
  _localAudioPending?: boolean;
  _audioReady?: boolean;
  localOnly?: boolean;
}

interface ScoreEntry {
  mapId: string;
  player: string;
  score: number;
  combo: number;
  date?: string;
  progress?: number;
  localOnly?: boolean;
}

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function cleanText(value: unknown, fallback = ''): string {
  const cleaned = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  return cleaned || fallback;
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '\u2014:\u2014';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function getMapScoreData(mapId: string): { tries: number; best: ScoreEntry | null; progress: number | null } {
  const scores = readLocalScores({ limit: 1000 }) as ScoreEntry[];
  const mapScores = scores.filter(s => s.mapId === mapId);
  if (!mapScores.length) return { tries: 0, best: null, progress: null };
  const best = mapScores.reduce((a, b) => (b.score > a.score ? b : a), mapScores[0]!);
  const maxProgress = mapScores.reduce((a, b) => Math.max(a, b.progress ?? 0), 0);
  return { tries: mapScores.length, best, progress: maxProgress };
}

// -- State --

let allMaps: MapEntry[] = [];
let selectedId: string | null = null;
let activeDiff = 'all';
let activeSort = 'newest';
let searchQuery = '';
let loading = false;
let initialized = false;
let importing = false;

function showImportStatus(message: string, type: 'info' | 'success' | 'error'): void {
  const status = element<HTMLElement>('mpImportStatus');
  if (!status) return;
  status.textContent = message;
  status.className = `mp-import-status is-${type}`;
  status.hidden = false;
}

function clearImportStatus(): void {
  const status = element<HTMLElement>('mpImportStatus');
  if (status) status.hidden = true;
}

// -- Server fetch --

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function mergeMaps(server: MapEntry[], local: MapEntry[]): MapEntry[] {
  const byId = new Map<string, MapEntry>();
  for (const map of server) byId.set(map.id, map);
  for (const map of local) {
    const existing = byId.get(map.id);
    if (existing) {
      byId.set(map.id, { ...existing, ...map });
    } else {
      byId.set(map.id, map);
    }
  }
  return [...byId.values()];
}

// -- Rendering --

function getFilteredMaps(): MapEntry[] {
  let maps = [...allMaps];
  const query = searchQuery.trim().toLocaleLowerCase();
  if (query) {
    maps = maps.filter(m => {
      const title = cleanText(m.meta?.title).toLocaleLowerCase();
      const artist = cleanText(m.meta?.artist).toLocaleLowerCase();
      const mapper = cleanText(m.meta?.mapper).toLocaleLowerCase();
      const id = m.id.toLocaleLowerCase();
      return title.includes(query) || artist.includes(query) || mapper.includes(query) || id.includes(query);
    });
  }
  if (activeDiff !== 'all') {
    maps = maps.filter(m => (m.meta?.difficulty ?? '').toLowerCase() === activeDiff);
  }
  if (activeSort === 'alpha') {
    maps.sort((a, b) => (a.meta?.title ?? a.id).localeCompare(b.meta?.title ?? b.id));
  } else if (activeSort === 'beats') {
    maps.sort((a, b) => (b.beats?.length ?? 0) - (a.beats?.length ?? 0));
  } else if (activeSort === 'score') {
    maps.sort((a, b) => (getMapScoreData(b.id).best?.score ?? 0) - (getMapScoreData(a.id).best?.score ?? 0));
  } else {
    maps.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }
  return maps;
}

function renderMapList(list: HTMLElement): void {
  const maps = getFilteredMaps();
  list.replaceChildren();
  if (!maps.length) {
    const empty = document.createElement('p');
    empty.className = 'mp-map-empty';
    empty.textContent = loading ? t('mapPicker.loading') : t('mapPicker.noMaps');
    list.append(empty);
    return;
  }
  for (const map of maps) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `mp-map-card${map.id === selectedId ? ' is-selected' : ''}`;
    card.dataset['mapId'] = map.id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(map.id === selectedId));
    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded mp-map-card-icon';
    icon.textContent = 'music_note';
    const content = document.createElement('span');
    content.className = 'mp-map-card-content';
    const title = document.createElement('strong');
    title.textContent = cleanText(map.meta?.title, map.id);
    const subtitle = document.createElement('span');
    subtitle.textContent = [cleanText(map.meta?.artist), cleanText(map.meta?.difficulty)].filter(Boolean).join(' \u00b7 ') || map.id;
    const stats = document.createElement('span');
    stats.className = 'mp-map-card-stats';
    const bpm = finitePositive(map.meta?.bpm);
    const duration = finitePositive(map.meta?.duration);
    stats.textContent = `${bpm ? `${Math.round(bpm)} BPM` : '\u2014 BPM'} \u00b7 ${formatDuration(duration)} \u00b7 ${map.beats?.length ?? 0} ${t('mapPicker.beats')}`;
    content.append(title, subtitle, stats);
    const check = document.createElement('span');
    check.className = 'material-symbols-rounded mp-map-card-check';
    check.textContent = map.id === selectedId ? 'check_circle' : 'chevron_right';
    card.append(icon, content, check);
    card.addEventListener('click', () => selectMap(map.id));
    list.append(card);
  }
}

function renderDetail(detailPane: HTMLElement, map: MapEntry | undefined): void {
  detailPane.replaceChildren();
  if (!map) {
    const empty = document.createElement('div');
    empty.className = 'mp-detail-empty';
    empty.textContent = t('mapPicker.selectMap');
    detailPane.append(empty);
    return;
  }
  const title = document.createElement('div');
  title.className = 'mp-detail-title';
  title.textContent = cleanText(map.meta?.title, map.id);
  const subtitle = document.createElement('div');
  subtitle.className = 'mp-detail-subtitle';
  subtitle.textContent = [cleanText(map.meta?.artist), cleanText(map.meta?.mapper)].filter(Boolean).join(' \u00b7 ');
  const diffBadge = document.createElement('span');
  const diff = cleanText(map.meta?.difficulty).toLowerCase();
  diffBadge.className = `mp-detail-diff-badge ${diff || ''}`;
  diffBadge.textContent = diff || t('mapPicker.unknown');
  const stats = document.createElement('div');
  stats.className = 'mp-detail-stats';
  const bpm = finitePositive(map.meta?.bpm);
  const duration = finitePositive(map.meta?.duration);
  const beats = map.beats?.length ?? 0;
  const statItems = [
    { label: t('mapPicker.duration'), value: formatDuration(duration) },
    { label: t('mapPicker.beatsCount'), value: formatNumber(beats) },
    { label: 'BPM', value: bpm ? String(Math.round(bpm)) : '\u2014' },
    { label: t('mapPicker.source'), value: map.localOnly ? t('mapPicker.local') : t('mapPicker.server') },
  ];
  for (const item of statItems) {
    const stat = document.createElement('div');
    stat.className = 'mp-detail-stat';
    const label = document.createElement('div');
    label.className = 'mp-detail-stat-label';
    label.textContent = item.label;
    const value = document.createElement('div');
    value.className = 'mp-detail-stat-value';
    value.textContent = item.value;
    stat.append(label, value);
    stats.append(stat);
  }
  detailPane.append(title, subtitle, diffBadge, stats);
  // Score section
  const scoreData = getMapScoreData(map.id);
  if (scoreData.best) {
    const scoreBox = document.createElement('div');
    scoreBox.className = 'mp-detail-score';
    const scoreLabel = document.createElement('div');
    scoreLabel.className = 'mp-detail-score-label';
    scoreLabel.textContent = `${t('mapPicker.bestScore')} \u00b7 ${scoreData.tries} ${t('mapPicker.tries')}`;
    const scoreValue = document.createElement('div');
    scoreValue.className = 'mp-detail-score-value';
    scoreValue.textContent = formatNumber(scoreData.best.score);
    scoreBox.append(scoreLabel, scoreValue);
    detailPane.append(scoreBox);
  }
  // Play button
  const actions = document.createElement('div');
  actions.className = 'mp-detail-actions';
  const playBtn = document.createElement('button');
  playBtn.className = 'mp-detail-play';
  playBtn.type = 'button';
  playBtn.textContent = t('mapPicker.play');
  playBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('hand-sabers:map-selected', { detail: { mapId: map.id } }));
    closeOverlay();
  });
  actions.append(playBtn);
  detailPane.append(actions);
}

function selectMap(mapId: string): void {
  selectedId = mapId;
  const list = element<HTMLElement>('mpMapList');
  const detailPane = element<HTMLElement>('mpDetailPane');
  if (list) renderMapList(list);
  if (detailPane) {
    const map = allMaps.find(m => m.id === mapId);
    renderDetail(detailPane, map);
  }
}

// -- Load maps --

async function loadMaps(): Promise<void> {
  loading = true;
  const list = element<HTMLElement>('mpMapList');
  if (list) renderMapList(list);
  try {
    // Load local maps. Maps without beats (e.g. saved by the creator before any beat was placed)
    // are silently skipped here instead of crashing the whole picker — see localstore save path
    // which allows empty beat arrays.
    const localMaps = readLocalMaps() as unknown as MapEntry[];
    const normalized = localMaps.flatMap(m => {
      try {
        return [normalizeMap(m, { requireBeats: false }) as unknown as MapEntry];
      } catch {
        return [];
      }
    });
    // Load server maps
    let serverMaps: MapEntry[] = [];
    try {
      const list = await fetchJson<{ id: string }[]>('/api/maps');
      if (Array.isArray(list)) {
        const entries = await Promise.all(list.map(async entry => {
          const id = entry?.id ?? '';
          if (!id) return null;
          try {
            return await fetchJson<MapEntry>(`/api/maps/${encodeURIComponent(id)}`);
          } catch {
            return { id, beats: [] } as MapEntry;
          }
        }));
        serverMaps = entries.filter((m): m is MapEntry => m !== null);
      }
    } catch { /* server unavailable */ }
    allMaps = mergeMaps(serverMaps, normalized);
  } finally {
    loading = false;
    if (list) renderMapList(list);
    // Auto-select first map if none selected
    if (!selectedId && allMaps.length > 0) {
      selectMap(allMaps[0]!.id);
    }
  }
}

async function importMapFile(file: File): Promise<void> {
  if (importing) return;
  importing = true;
  const importButton = element<HTMLButtonElement>('mpImport');
  const importLabel = element<HTMLElement>('mpImportLabel');
  if (importButton) importButton.disabled = true;
  if (importLabel) importLabel.textContent = t('mapPicker.importing');
  showImportStatus(t('mapPicker.importingFile', { name: file.name }), 'info');

  try {
    let importedId: string;
    let importedWithAudio = false;
    let importSource: 'server' | 'local';
    try {
      const imported = await importMapToServer(file);
      importedId = imported.id;
      importedWithAudio = Boolean(imported.audio);
      importSource = 'server';
    } catch (serverError) {
      try {
        const imported = await importMapLocally(file);
        importedId = imported.id;
        importedWithAudio = Boolean(imported.audio);
        importSource = 'local';
      } catch (localError) {
        console.error('Map import failed:', { serverError, localError });
        const message = localError instanceof Error ? localError.message : String(localError);
        showImportStatus(t('mapPicker.importFailed', { message }), 'error');
        return;
      }
    }
    await loadMaps();
    selectMap(importedId);
    const source = importSource === 'server' ? 'mapPicker.importedServer' : 'mapPicker.importedLocal';
    const message = t(source, { id: importedId });
    showImportStatus(importedWithAudio ? `${message} ${t('mapPicker.importedAudio')}` : message, 'success');
  } finally {
    importing = false;
    if (importButton) importButton.disabled = false;
    if (importLabel) importLabel.textContent = t('mapPicker.import');
  }
}

// -- Overlay control --

function openOverlay(): void {
  const overlay = element<HTMLElement>('mapPickerOverlay');
  if (!overlay) return;
  overlay.hidden = false;
  translateDom(overlay);
  clearImportStatus();
  if (allMaps.length === 0) void loadMaps();
  else {
    const list = element<HTMLElement>('mpMapList');
    if (list) renderMapList(list);
  }
  element<HTMLInputElement>('mpSearch')?.focus({ preventScroll: true });
}

function closeOverlay(): void {
  const overlay = element<HTMLElement>('mapPickerOverlay');
  if (!overlay) return;
  overlay.hidden = true;
}

// -- Init --

export function initMapPickerOverlay(): void {
  if (initialized) return;
  initialized = true;
  const overlay = element<HTMLElement>('mapPickerOverlay');
  const closeBtn = element<HTMLButtonElement>('mpClose');
  const searchInput = element<HTMLInputElement>('mpSearch');
  const sortSelect = element<HTMLSelectElement>('mpSort');
  const importButton = element<HTMLButtonElement>('mpImport');
  const importInput = element<HTMLInputElement>('mpImportInput');
  if (!overlay || !closeBtn || !searchInput || !sortSelect) return;
  // Close
  closeBtn.addEventListener('click', closeOverlay);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeOverlay(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeOverlay(); });
  // Search
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    const list = element<HTMLElement>('mpMapList');
    if (list) renderMapList(list);
  });
  // Sort
  sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    const list = element<HTMLElement>('mpMapList');
    if (list) renderMapList(list);
  });
  importButton?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (file) await importMapFile(file);
    importInput.value = '';
  });
  // Difficulty filters
  document.querySelectorAll<HTMLElement>('.mp-diff-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.mp-diff-chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      activeDiff = chip.dataset['diff'] ?? 'all';
      const list = element<HTMLElement>('mpMapList');
      if (list) renderMapList(list);
    });
  });
}

export function openMapPicker(): void {
  openOverlay();
}
