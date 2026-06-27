import Fuse from 'fuse.js';
import { readLocalMaps, deleteLocalMap, deleteLocalMapAudio, readLocalScores, saveLocalMap, saveLocalMapAudio, loadLocalMapAudio } from '../core/localstore.ts';
import { getJSZip } from '../jszip-loader.ts';
import { assertFileSize, findPreferredAudioEntry, normalizeMap, validateZipEntryNames } from '../core/map-format.ts';
import { showAlert, showConfirm, showToast } from '../creator/dialogs.ts';
import { t } from '../i18n/index.ts';
import { initKeyboardNav } from '../ui/keyboard-nav.ts';
import { loadSettings } from '../core/settings.ts';

// ── i18n ─────────────────────────────────────────────────────────────────────

export function applyTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset['i18n'];
    if (key) el.textContent = t(key);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function attr(str: unknown): string {
  return escHtml(str).replace(/'/g, '&#39;');
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function withDevQuery(url: string): string {
  const current = new URLSearchParams(location.search);
  const target  = new URL(url, location.href);
  for (const key of ['dev', 'testing']) {
    if (current.has(key)) target.searchParams.set(key, current.get(key) ?? '');
  }
  return `${target.pathname.split('/').pop()}${target.search}${target.hash}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapEntry {
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

interface ScoreEntry {
  mapId: string;
  player: string;
  score: number;
  combo: number;
  date?: string;
  progress?: number;
  localOnly?: boolean;
}

interface MapScoreData {
  tries: number;
  best: ScoreEntry | null;
  progress: number | null;
}

// ── Score data ─────────────────────────────────────────────────────────────────

let allScores: ScoreEntry[] = readLocalScores({ limit: 1000 }) as ScoreEntry[];

function getMapScoreData(mapId: string): MapScoreData {
  const scores = allScores.filter(s => s.mapId === mapId);
  if (!scores.length) return { tries: 0, best: null, progress: null };
  const best        = scores.reduce((a, b) => (b.score > a.score ? b : a), scores[0]!);
  const maxProgress = scores.reduce((a, b) => Math.max(a, b.progress ?? 0), 0);
  return { tries: scores.length, best, progress: maxProgress };
}

// ── Server fetch ──────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function loadServerMaps(): Promise<MapEntry[]> {
  const list = await fetchJson<{ id: string }[]>('/api/maps');
  return Promise.all(list.map(async m => {
    try { return { ...(await fetchJson<MapEntry>(`/api/maps/${encodeURIComponent(m.id)}`)), source: 'server' as const }; }
    catch { return { id: m.id, meta: { title: m.id }, beats: [], source: 'server' as const }; }
  }));
}

function getAutosaveMap(): MapEntry | null {
  try {
    const parsed = JSON.parse(localStorage.getItem('hs_autosave') ?? 'null') as MapEntry | null;
    if (parsed?.id && Array.isArray(parsed.beats)) return { ...parsed, source: 'autosave', localOnly: true };
  } catch {}
  return null;
}

function mergeMaps(serverMaps: MapEntry[], localMaps: MapEntry[]): MapEntry[] {
  const byId = new Map<string, MapEntry>();
  for (const m of serverMaps) byId.set(m.id, { ...m, source: 'server' });
  for (const m of localMaps)  byId.set(m.id, { ...m, source: byId.has(m.id) ? 'server+local' : 'local' });
  return [...byId.values()].sort((a, b) => {
    const at = a.updatedAt ?? a.meta?.title ?? a.id;
    const bt = b.updatedAt ?? b.meta?.title ?? b.id;
    return String(bt).localeCompare(String(at));
  });
}

// ── Import ────────────────────────────────────────────────────────────────────

async function importToServer(file: File): Promise<{ id: string; audio?: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res     = await fetch('/api/maps/import', { method: 'POST', body: fd });
  const payload = await res.json().catch(async () => ({ error: await res.text() })) as { id: string; audio?: string; error?: string };
  if (!res.ok) throw new Error(payload?.error ?? `${res.status} ${res.statusText}`);
  return payload;
}

async function importLocally(file: File): Promise<{ id: string; beats: number; audio: string | null }> {
  assertFileSize(file);
  const name = file.name.toLowerCase();
  let map: MapEntry;
  let audioName: string | null = null;

  if (name.endsWith('.json')) {
    map = normalizeMap(JSON.parse(await file.text()), { fallbackId: file.name.replace(/\.[^.]+$/, '') }) as unknown as MapEntry;
  } else if (name.endsWith('.zip')) {
    const JSZip   = await getJSZip();
    const zip     = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files);
    validateZipEntryNames(entries);
    const jsonFile = zip.file('map.json');
    if (!jsonFile) throw new Error('Brak map.json w ZIP.');
    map = normalizeMap(JSON.parse(await jsonFile.async('string')), { fallbackId: file.name.replace(/\.[^.]+$/, '') }) as unknown as MapEntry;
    const audioFile = findPreferredAudioEntry(entries, map.meta?.audioFile);
    if (audioFile) {
      audioName  = audioFile.name.split('/').pop() ?? null;
      if (map.meta) (map.meta as Record<string, unknown>)['audioFile'] = audioName;
      await saveLocalMapAudio(map.id, await audioFile.async('arraybuffer'), { fileName: audioName ?? '', mimeType: 'application/octet-stream' });
    }
  } else {
    throw new Error('Import obsługuje tylko .zip albo .json.');
  }

  saveLocalMap(map as unknown as Parameters<typeof saveLocalMap>[0]);
  return { id: map.id, beats: map.beats?.length ?? 0, audio: audioName };
}

async function importMapFile(file: File): Promise<void> {
  showToast(`Importuję ${file.name}…`, { type: 'info' });
  try {
    const imported = await importToServer(file);
    showToast(`Zaimportowano: ${imported.id}${imported.audio ? ` + audio` : ''}`, { type: 'success' });
    await loadMaps();
  } catch (serverErr) {
    try {
      const imported = await importLocally(file);
      showToast(`Zaimportowano lokalnie: ${imported.id}${imported.audio ? ` + audio` : ''}`, { type: 'success' });
      await loadMaps();
    } catch (localErr) {
      const msg = localErr instanceof Error ? localErr.message : String(localErr);
      showToast(`Błąd importu: ${msg}`, { type: 'error' });
      void showAlert(`Błąd importu: ${msg}`, { title: 'Import nie powiódł się' });
      console.error('Server import failed:', serverErr);
    }
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

let allMaps: MapEntry[]     = [];
let selectedId: string | null = null;
let activeDiff: string      = '';
let activeSort: string      = 'newest';
let searchQuery: string     = '';

const PREVIEW_DELAY_MS = 850;
const PREVIEW_MAX_MS = 30_000;
const PREVIEW_BASE_VOLUME = 0.34;
const previewAudio = new Audio();
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let previewStopTimer: ReturnType<typeof setTimeout> | null = null;
let previewObjectUrl: string | null = null;
let previewToken = 0;
let previewRemainingMs = PREVIEW_MAX_MS;
let previewStartedAtMs = 0;
let previewPaused = false;

let fuse: Fuse<MapEntry> | null = null;

function rebuildFuse(): void {
  fuse = new Fuse(allMaps, {
    keys: ['meta.title', 'meta.artist', 'meta.mapper', 'id'],
    threshold: 0.35,
    includeScore: false,
  });
}

function getFilteredMaps(): MapEntry[] {
  let maps = searchQuery && fuse
    ? fuse.search(searchQuery).map(r => r.item)
    : [...allMaps];

  if (activeDiff) {
    maps = maps.filter(m => (m.meta?.difficulty ?? '').toLowerCase() === activeDiff.toLowerCase());
  }

  if (activeSort === 'alpha') {
    maps.sort((a, b) => (a.meta?.title ?? a.id).localeCompare(b.meta?.title ?? b.id));
  } else if (activeSort === 'newest') {
    maps.sort((a, b) => String(b.updatedAt ?? b.id).localeCompare(String(a.updatedAt ?? a.id)));
  } else if (activeSort === 'beats') {
    maps.sort((a, b) => (b.beats?.length ?? 0) - (a.beats?.length ?? 0));
  } else if (activeSort === 'score') {
    maps.sort((a, b) => {
      const sa = getMapScoreData(a.id).best?.score ?? 0;
      const sb = getMapScoreData(b.id).best?.score ?? 0;
      return sb - sa;
    });
  }

  return maps;
}

// ── Render: list ──────────────────────────────────────────────────────────────

function renderSkeleton(): string {
  return Array.from({ length: 5 }, () => `
    <div class="skeleton-row">
      <div class="skeleton skeleton-icon"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton skeleton-text" style="width:60%"></div>
        <div class="skeleton skeleton-text" style="width:38%"></div>
      </div>
      <div class="skeleton skeleton-badge" style="width:44px"></div>
    </div>`).join('');
}

function renderMapList(maps: MapEntry[]): void {
  const container = document.getElementById('mapList')!;

  if (!maps.length) {
    const isFiltered = searchQuery || activeDiff;
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">search_off</span>
        <div class="empty-title">${isFiltered ? 'BRAK WYNIKÓW' : 'BRAK MAP'}</div>
        <div class="empty-sub">${isFiltered ? 'Zmień filtry lub wyszukiwaną frazę.' : 'Nie masz jeszcze żadnych map.'}</div>
        ${!isFiltered ? `<a class="empty-cta" href="${withDevQuery('./map-creator.html')}">
          <span class="material-symbols-rounded">add</span>Stwórz pierwszą mapę</a>` : ''}
      </div>`;
    return;
  }

  if (!selectedId || !maps.some(m => m.id === selectedId)) {
    selectedId = maps[0]!.id;
    renderDetail(maps[0]!);
  }

  const activeIndex = Math.max(0, maps.findIndex(m => m.id === selectedId));

  container.innerHTML = `
    <div class="map-picker-stage" aria-label="Wybór map 2.5D">
      ${maps.map((m, i) => renderMapCard(m, i, activeIndex)).join('')}
    </div>`;

  container.querySelectorAll<HTMLElement>('.map-card').forEach(row => {
    row.addEventListener('click', () => selectMap(row.dataset['id'] ?? ''));
    row.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMap(row.dataset['id'] ?? ''); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); selectAdjacentMap(1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); selectAdjacentMap(-1); }
    });
  });
}

function renderMapCard(m: MapEntry, i: number, activeIndex: number): string {
    const title  = m.meta?.title   ?? m.id;
    const artist = m.meta?.artist  ?? m.meta?.mapper ?? '';
    const diff   = m.meta?.difficulty ?? '';
    const beats  = m.beats?.length ?? 0;
    const dur    = m.meta?.duration ? formatTime(m.meta.duration) : null;
    const isLocal = m.source === 'local' || m.source === 'autosave';
    const subParts = [artist, dur ? dur : null, beats ? `${beats} beatów` : null].filter(Boolean);
    const score = getMapScoreData(m.id).best?.score ?? 0;
    const offset = Math.max(-3, Math.min(3, i - activeIndex));
    const absOffset = Math.abs(offset);
    const depth = 1 - Math.min(absOffset, 3) * 0.09;
    const translateX = offset * 22;
    const rotateY = offset * -8;
    const translateZ = (3 - absOffset) * 8;

    return `
      <div class="map-card map-item${selectedId === m.id ? ' is-selected' : ''}"
           data-id="${attr(m.id)}"
           tabindex="0" role="button" aria-label="${attr(title)}"
           style="--card-offset:${offset};--card-depth:${depth.toFixed(2)};--card-x:${translateX}px;--card-ry:${rotateY}deg;--card-z:${translateZ}px;animation-delay:${i * 0.025}s">
        <div class="map-card-glow"></div>
        <div class="map-row-icon">
          <span class="material-symbols-rounded">music_note</span>
        </div>
        <div class="map-row-info map-card-info">
          <div class="map-row-title">${escHtml(title)}</div>
          ${subParts.length ? `<div class="map-row-sub">${subParts.map(escHtml).join(' · ')}</div>` : ''}
          <div class="map-card-wave" aria-hidden="true">${renderWaveBars(m.id)}</div>
        </div>
        <div class="map-row-badges">
          ${diff ? `<span class="diff-badge diff-${escHtml(diff.toLowerCase())}">${escHtml(diff)}</span>` : ''}
          ${isLocal ? `<span class="local-badge">LOCAL</span>` : ''}
          ${score ? `<span class="score-badge">${String(score).padStart(6, '0')}</span>` : ''}
        </div>
      </div>`;
}

function renderWaveBars(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: 18 }, (_, i) => {
    const value = 18 + ((hash >> (i % 12)) + i * 17) % 46;
    return `<span style="--h:${value}%"></span>`;
  }).join('');
}

// ── Render: detail pane ───────────────────────────────────────────────────────

function renderDetail(map: MapEntry | null): void {
  const pane = document.getElementById('detailPane')!;

  if (!map) {
    pane.innerHTML = `
      <div class="detail-empty">
        <span class="material-symbols-rounded">arrow_back</span>
        <div class="detail-empty-hint">WYBIERZ MAPĘ<br>Z LISTY</div>
      </div>`;
    return;
  }

  const title   = map.meta?.title   ?? map.id;
  const artist  = [map.meta?.artist, map.meta?.mapper].filter(Boolean).join(' · ');
  const diff    = map.meta?.difficulty ?? '';
  const beats   = map.beats?.length ?? 0;
  const dur     = map.meta?.duration ? formatTime(map.meta.duration) : '—';
  const bpm     = map.meta?.bpm ? `${map.meta.bpm} BPM` : '—';
  const isLocal = map.source === 'local' || map.source === 'autosave';
  const canDeleteServer = map.source === 'server' || map.source === 'server+local';
  const sd = getMapScoreData(map.id);

  const scoreSection = sd.best ? `
    <div class="detail-score-section">
      <div class="detail-score-label">NAJLEPSZY WYNIK</div>
      <div class="detail-best-score">${String(sd.best.score).padStart(6, '0')}</div>
      <div class="detail-score-meta">
        <span><span class="material-symbols-rounded">cycle</span>${sd.tries} prób</span>
        <span><span class="material-symbols-rounded">local_fire_department</span>×${sd.best.combo} combo</span>
        ${sd.best.player ? `<span><span class="material-symbols-rounded">person</span>${escHtml(sd.best.player)}</span>` : ''}
      </div>
      ${sd.progress !== null ? `
        <div class="detail-progress-wrap">
          <div class="detail-progress-fill" style="width:${Math.round(sd.progress * 100)}%"></div>
        </div>` : ''}
    </div>` : `<div class="detail-no-score">Brak wyników — zagraj jako pierwszy!</div>`;

  pane.innerHTML = `
    <div class="detail-scroll">
      <div id="detailTiltCard" class="detail-hero-card">
        <div class="detail-card-glare" aria-hidden="true"></div>
        <div class="detail-card-depth" aria-hidden="true"></div>
        <div class="detail-card-content">
          <div class="detail-title">${escHtml(title)}</div>
          ${artist ? `<div class="detail-artist">${escHtml(artist)}</div>` : ''}
          ${diff ? `<span class="diff-badge diff-${escHtml(diff.toLowerCase())}" style="margin-bottom:16px;display:inline-block">${escHtml(diff)}</span>` : ''}
          <button id="previewStatus" class="preview-status" type="button">
            <span class="material-symbols-rounded">graphic_eq</span>
            <span>Wybierz mapę, aby usłyszeć preview</span>
          </button>

          <div class="detail-stats">
            <div class="detail-stat">
              <div class="detail-stat-label">CZAS</div>
              <div class="detail-stat-value">${escHtml(dur)}</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-label">BEATY</div>
              <div class="detail-stat-value">${beats}</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-label">BPM</div>
              <div class="detail-stat-value">${escHtml(bpm)}</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-label">ŹRÓDŁO</div>
              <div class="detail-stat-value" style="font-size:12px">${isLocal ? 'LOCAL' : 'SERVER'}</div>
            </div>
          </div>

          <div class="detail-divider"></div>
          ${scoreSection}
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <a class="btn-play" href="${withDevQuery(`./beat-sabers-3d.html?map=${encodeURIComponent(map.id)}`)}">
        <span class="material-symbols-rounded">play_arrow</span>ZAGRAJ
      </a>
      <div class="detail-secondary-actions">
        <a class="btn-secondary" href="${withDevQuery(`./map-creator.html?id=${encodeURIComponent(map.id)}`)}">
          <span class="material-symbols-rounded">edit</span>EDYTUJ
        </a>
        <button class="btn-secondary" id="btnExport" data-id="${attr(map.id)}">
          <span class="material-symbols-rounded">download</span>EKSPORT
        </button>
        <button class="btn-secondary danger" id="btnDelete"
                data-id="${attr(map.id)}" data-server="${canDeleteServer ? '1' : '0'}">
          <span class="material-symbols-rounded">delete</span>USUŃ
        </button>
      </div>
    </div>`;

  document.getElementById('btnDelete')?.addEventListener('click', async btn => {
    const el = btn.currentTarget as HTMLButtonElement;
    stopMapPreview();
    await deleteMap(el.dataset['id']!, el.dataset['server'] === '1');
  });

  document.getElementById('btnExport')?.addEventListener('click', async btn => {
    const el = btn.currentTarget as HTMLButtonElement;
    await exportMap(el.dataset['id']!);
  });

  document.querySelector<HTMLAnchorElement>('.btn-play')?.addEventListener('click', () => stopMapPreview());
  document.querySelector<HTMLAnchorElement>('.detail-secondary-actions a')?.addEventListener('click', () => stopMapPreview());
  document.getElementById('previewStatus')?.addEventListener('click', toggleMapPreview);
  bindDetailTilt();
}

function bindDetailTilt(): void {
  const card = document.getElementById('detailTiltCard');
  if (!card || window.matchMedia('(pointer: coarse)').matches) return;

  card.addEventListener('pointermove', event => {
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 10;
    const rotateX = (0.5 - py) * 8;
    card.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`);
    card.style.setProperty('--glare-x', `${Math.round(px * 100)}%`);
    card.style.setProperty('--glare-y', `${Math.round(py * 100)}%`);
  });

  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--glare-x', '50%');
    card.style.setProperty('--glare-y', '18%');
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────

function selectMap(id: string): void {
  selectedId = id;
  document.querySelectorAll<HTMLElement>('.map-card').forEach(r => {
    r.classList.toggle('is-selected', r.dataset['id'] === id);
  });
  const map = allMaps.find(m => m.id === id) ?? null;
  renderDetail(map);
  if (map) scheduleMapPreview(map);
}

function setPreviewStatus(message: string, state: 'idle' | 'loading' | 'playing' | 'paused' | 'warning' | 'error' = 'idle'): void {
  const el = document.getElementById('previewStatus');
  if (!el) return;
  el.className = `preview-status is-${state}`;
  const icon = el.querySelector<HTMLElement>('.material-symbols-rounded');
  if (icon) {
    icon.textContent = state === 'playing' ? 'pause'
      : state === 'paused' ? 'play_arrow'
      : state === 'warning' || state === 'error' ? 'warning'
      : 'graphic_eq';
  }
  const text = el.querySelector<HTMLElement>('span:last-child');
  if (text) text.textContent = message;
  el.setAttribute('aria-label', message);
}

function clearPreviewTimers(): void {
  if (previewTimer) clearTimeout(previewTimer);
  if (previewStopTimer) clearTimeout(previewStopTimer);
  previewTimer = null;
  previewStopTimer = null;
}

function stopMapPreview(clearStatus = false): void {
  clearPreviewTimers();
  previewToken++;
  previewAudio.pause();
  previewAudio.removeAttribute('src');
  previewAudio.load();
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
  previewRemainingMs = PREVIEW_MAX_MS;
  previewStartedAtMs = 0;
  previewPaused = false;
  if (clearStatus) setPreviewStatus('Preview zatrzymane');
}

function scheduleMapPreview(map: MapEntry): void {
  stopMapPreview();
  if (getPreviewVolume() <= 0) {
    setPreviewStatus('Preview wyciszone. Zmień głośność lub muzykę w ustawieniach.', 'warning');
    return;
  }
  const token = ++previewToken;
  setPreviewStatus('Preview wystartuje za chwilę...', 'loading');
  previewTimer = setTimeout(() => {
    void startMapPreview(map, token);
  }, PREVIEW_DELAY_MS);
}

async function startMapPreview(map: MapEntry, token: number): Promise<void> {
  try {
    const effectiveVolume = getPreviewVolume();
    if (effectiveVolume <= 0) {
      setPreviewStatus('Preview wyciszone. Zmień głośność lub muzykę w ustawieniach.', 'warning');
      return;
    }

    setPreviewStatus('Ładuję audio preview...', 'loading');
    const source = await loadPreviewSource(map);
    if (token !== previewToken) {
      if (source?.url) URL.revokeObjectURL(source.url);
      return;
    }
    if (!source) {
      setPreviewStatus('Ta mapa nie ma audio do preview', 'error');
      return;
    }

    previewObjectUrl = source.url;
    previewAudio.volume = effectiveVolume;
    previewAudio.src = source.url;
    await waitForPreviewMetadata();

    const requestedStart = Number(map.meta?.previewStartSec ?? 0);
    const maxStart = Number.isFinite(previewAudio.duration) ? Math.max(0, previewAudio.duration - 2) : 0;
    previewAudio.currentTime = Math.max(0, Math.min(Number.isFinite(requestedStart) ? requestedStart : 0, maxStart));
    await previewAudio.play();
    previewPaused = false;
    previewRemainingMs = PREVIEW_MAX_MS;
    armPreviewStopTimer(previewRemainingMs);
    setPreviewStatus('Odtwarzam preview', 'playing');
  } catch (error) {
    if (token !== previewToken) return;
    const message = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Kliknij mapę ponownie, aby uruchomić preview'
      : 'Nie udało się odtworzyć preview';
    setPreviewStatus(message, 'error');
  }
}

function getPreviewVolume(): number {
  const settings = loadSettings();
  const master = Math.max(0, Math.min(1, Number(settings.volume) || 0));
  const music = Math.max(0, Math.min(1, Number(settings.musicVolume) || 0));
  return Math.max(0, Math.min(1, master * music * PREVIEW_BASE_VOLUME));
}

function armPreviewStopTimer(ms: number): void {
  if (previewStopTimer) clearTimeout(previewStopTimer);
  previewStartedAtMs = performance.now();
  previewStopTimer = setTimeout(() => {
    previewAudio.pause();
    previewPaused = false;
    previewRemainingMs = PREVIEW_MAX_MS;
    setPreviewStatus('Preview zakończone');
  }, Math.max(0, ms));
}

function pausePreview(): void {
  if (previewAudio.paused) return;
  if (previewStopTimer) clearTimeout(previewStopTimer);
  previewRemainingMs = Math.max(0, previewRemainingMs - (performance.now() - previewStartedAtMs));
  previewAudio.pause();
  previewPaused = true;
  setPreviewStatus('Preview w pauzie. Kliknij, aby wznowić.', 'paused');
}

async function resumePreview(): Promise<void> {
  const effectiveVolume = getPreviewVolume();
  if (effectiveVolume <= 0) {
    setPreviewStatus('Preview wyciszone. Zmień głośność lub muzykę w ustawieniach.', 'warning');
    return;
  }
  previewAudio.volume = effectiveVolume;
  await previewAudio.play();
  previewPaused = false;
  armPreviewStopTimer(previewRemainingMs || PREVIEW_MAX_MS);
  setPreviewStatus('Odtwarzam preview', 'playing');
}

function toggleMapPreview(): void {
  if (!previewAudio.src) return;
  if (!previewAudio.paused) {
    pausePreview();
    return;
  }
  if (previewPaused) {
    void resumePreview().catch(() => setPreviewStatus('Nie udało się wznowić preview', 'error'));
  }
}

function waitForPreviewMetadata(): Promise<void> {
  if (previewAudio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      previewAudio.removeEventListener('loadedmetadata', onReady);
      previewAudio.removeEventListener('error', onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Preview audio load failed')); };
    previewAudio.addEventListener('loadedmetadata', onReady, { once: true });
    previewAudio.addEventListener('error', onError, { once: true });
  });
}

async function loadPreviewSource(map: MapEntry): Promise<{ url: string } | null> {
  const shouldTryServer = map.source === 'server' || map.source === 'server+local';
  if (shouldTryServer) {
    const audioUrl = map.meta?.audioUrl ?? `/api/maps/${encodeURIComponent(map.id)}/audio`;
    try {
      const res = await fetch(audioUrl);
      if (res.ok) return { url: URL.createObjectURL(await res.blob()) };
    } catch {}
  }

  const local = await loadLocalMapAudio(map.id).catch(() => null);
  if (!local?.arrayBuffer) return null;
  const blob = new Blob([local.arrayBuffer], { type: local.mimeType || 'application/octet-stream' });
  return { url: URL.createObjectURL(blob) };
}

function selectAdjacentMap(direction: -1 | 1): void {
  const maps = getFilteredMaps();
  if (!maps.length) return;
  const currentIndex = Math.max(0, maps.findIndex(m => m.id === selectedId));
  const next = maps[Math.max(0, Math.min(maps.length - 1, currentIndex + direction))];
  if (!next) return;
  selectMap(next.id);
  renderMapList(maps);
  const card = document.querySelector<HTMLElement>(`.map-card[data-id="${CSS.escape(next.id)}"]`);
  card?.focus({ preventScroll: true });
  card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function deleteMap(id: string, tryServer: boolean): Promise<void> {
  const confirmed = await showConfirm(
    `Usunąć mapę "${id}"?`,
    { title: 'Usuń mapę', confirmText: 'USUŃ', cancelText: 'ANULUJ', danger: true }
  );
  if (!confirmed) return;

  let serverDeleted = false;
  if (tryServer) {
    try { await fetchJson(`/api/maps/${encodeURIComponent(id)}`, { method: 'DELETE' }); serverDeleted = true; }
    catch {}
  }
  deleteLocalMap(id);
  await deleteLocalMapAudio(id);
  allMaps = allMaps.filter(m => m.id !== id);
  rebuildFuse();
  if (selectedId === id) { selectedId = null; renderDetail(null); }
  renderMapList(getFilteredMaps());
  if (!serverDeleted && tryServer) showToast('Usunięto lokalnie (serwer nie odpowiedział)', { type: 'error' });
  else showToast('Mapa usunięta', { type: 'success' });
}

async function exportMap(id: string): Promise<void> {
  const map = allMaps.find(m => m.id === id) ?? null;
  try {
    const res = await fetch(`/api/maps/${encodeURIComponent(id)}/export.zip`);
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    downloadBlob(blob, `${id}.zip`);
    showToast('Eksport gotowy', { type: 'success' });
  } catch {
    if (!map || (map.source !== 'local' && map.source !== 'autosave' && map.source !== 'server+local')) {
      showToast('Eksport nie powiódł się — brak serwera?', { type: 'error' });
      return;
    }

    try {
      const JSZip = await getJSZip();
      const zip = new JSZip();
      const mapJson: Record<string, unknown> = { ...map };
      for (const key of ['source', 'localOnly', 'updatedAt', '_serverAudioPending', '_localAudioPending', '_audioReady']) {
        delete mapJson[key];
      }

      const audio = await loadLocalMapAudio(id).catch(() => null);
      if (audio) {
        mapJson['meta'] = { ...(mapJson['meta'] as Record<string, unknown> | undefined), audioFile: audio.fileName };
        zip.file(audio.fileName || `${id}.ogg`, audio.arrayBuffer);
      }

      zip.file('map.json', JSON.stringify(mapJson, null, 2));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      downloadBlob(blob, `${id}.zip`);
      showToast('Eksport lokalny gotowy', { type: 'success' });
    } catch {
      showToast('Eksport lokalny nie powiódł się', { type: 'error' });
    }
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Load maps ─────────────────────────────────────────────────────────────────

let loadMapsInProgress = false;

async function loadMaps(): Promise<void> {
  if (loadMapsInProgress) return;
  loadMapsInProgress = true;
  try {
    document.getElementById('mapList')!.innerHTML = renderSkeleton();
    renderDetail(null);

    const localMaps  = (readLocalMaps() as unknown) as MapEntry[];
    const autosave   = getAutosaveMap();
    if (autosave && !localMaps.some(m => m.id === autosave.id)) localMaps.unshift(autosave);

    let serverMaps: MapEntry[] = [];
    let serverError: Error | null = null;
    try { serverMaps = await loadServerMaps(); }
    catch (e) {
      serverError = e instanceof Error ? e : new Error(String(e));
      // Network errors during startup (server still booting) — retry once after 2s
      if (serverError.message.includes('Failed to fetch') || serverError.message.includes('NetworkError') || serverError.message.startsWith('0 ')) {
        await new Promise(r => setTimeout(r, 2000));
        try { serverMaps = await loadServerMaps(); serverError = null; }
        catch { /* keep serverError set */ }
      }
    }

    allScores = readLocalScores({ limit: 1000 }) as ScoreEntry[];
    allMaps   = mergeMaps(serverMaps, localMaps);
    rebuildFuse();

    const offlineEl = document.getElementById('offlineNotice');
    if (offlineEl) offlineEl.hidden = !serverError;

    renderMapList(getFilteredMaps());

    if (selectedId) {
      const still = allMaps.find(m => m.id === selectedId);
      if (still) renderDetail(still); else { selectedId = null; renderDetail(null); }
    }
  } finally {
    loadMapsInProgress = false;
  }
}

// ── Load scores ───────────────────────────────────────────────────────────────

async function loadScores(): Promise<void> {
  const scoreList = document.getElementById('scoreList')!;
  scoreList.innerHTML = renderSkeleton();

  const localScores = readLocalScores({ limit: 30 }) as ScoreEntry[];
  let scores: ScoreEntry[] = [];
  let serverError: Error | null = null;
  try { scores = await fetchJson<ScoreEntry[]>('/api/scores?limit=30'); }
  catch (e) { serverError = e instanceof Error ? e : new Error(String(e)); void serverError; }

  scores = [...scores, ...localScores]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 30);

  if (!scores.length) {
    scoreList.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">leaderboard</span>
        <div class="empty-title">BRAK WYNIKÓW</div>
        <div class="empty-sub">Zagraj kilka map, aby zobaczyć wyniki.</div>
      </div>`;
    return;
  }

  const medals = ['gold', 'silver', 'bronze'];
  scoreList.innerHTML = scores.map((s, i) => `
    <div class="score-row">
      <div class="score-rank ${medals[i] ?? ''}">${i + 1}</div>
      <div class="score-info">
        <div class="score-player">${escHtml(s.player)}${s.localOnly ? ' · LOCAL' : ''}</div>
        <div class="score-map">${escHtml(s.mapId)}</div>
      </div>
      <div class="score-combo">×${s.combo}</div>
      <div class="score-val">${String(s.score).padStart(6, '0')}</div>
    </div>`).join('');
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function showTab(name: 'maps' | 'scores'): void {
  document.getElementById('tabMaps')!.classList.toggle('is-active', name === 'maps');
  document.getElementById('tabScores')!.classList.toggle('is-active', name === 'scores');
  document.querySelectorAll<HTMLElement>('.topbar-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset['tab'] === name);
  });
  if (name === 'scores') void loadScores();
}

// ── Drag & drop import ────────────────────────────────────────────────────────

function initDragDrop(): void {
  let dragDepth = 0;
  document.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; document.body.classList.add('drag-over'); });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drag-over'); } });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', async e => {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    dragDepth = 0;
    const file = e.dataTransfer?.files[0];
    if (file) await importMapFile(file);
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export function init(): void {
  applyTranslations();

  // preserve ?dev query on static links
  const current = new URLSearchParams(location.search);
  if (current.has('dev') || current.has('testing')) {
    document.querySelectorAll<HTMLAnchorElement>('a[href$=".html"]').forEach(a => {
      a.href = withDevQuery(a.getAttribute('href') ?? '');
    });
  }

  // tabs
  document.querySelectorAll<HTMLElement>('.topbar-tab').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset['tab'] as 'maps' | 'scores'));
  });

  // search
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderMapList(getFilteredMaps());
  });

  // diff filters
  document.querySelectorAll<HTMLElement>('.filter-chip[data-diff]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset['diff'] ?? '';
      activeDiff = activeDiff === val ? '' : val;
      document.querySelectorAll('.filter-chip[data-diff]').forEach(c => {
        c.classList.toggle('is-active', (c as HTMLElement).dataset['diff'] === activeDiff && activeDiff !== '');
      });
      renderMapList(getFilteredMaps());
    });
  });

  // sort
  const sortSelect = document.getElementById('sortSelect') as HTMLSelectElement | null;
  sortSelect?.addEventListener('change', () => {
    activeSort = sortSelect.value;
    renderMapList(getFilteredMaps());
  });

  // import
  const importInput = document.getElementById('importMapInput') as HTMLInputElement | null;
  document.getElementById('btnImportMap')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', async e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await importMapFile(file);
    importInput.value = '';
  });

  initDragDrop();
  void loadMaps();
  initKeyboardNav({ isMapsPage: true });
}
