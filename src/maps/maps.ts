import { readLocalMaps, deleteLocalMap, deleteLocalMapAudio, readLocalScores } from '../core/localstore.ts';
import { showConfirm, showToast } from '../creator/dialogs.ts';
import { t, translateDom } from '../i18n/index.ts';
import { initRemoteTrackingHost } from '../remote/host-session.ts';
import { initKeyboardNav } from '../ui/keyboard-nav.ts';
import { initPageInterfaceSounds } from '../ui/interface-sounds.ts';
import { createMapPreviewController } from './preview.ts';
import { loadSettings } from '../core/settings.ts';
import { checkServerHealth, fetchJson, loadServerMaps, type MapEntry, type ScoreEntry } from './library-api.ts';
import { getAutosaveMap, mergeMaps } from './library-sources.ts';
import { createLibraryFilter } from './library-filter.ts';
import { exportLibraryMap, importLibraryMap } from './library-transfer.ts';
import { renderLibrarySkeleton, renderMapCard } from './library-list-view.ts';
import { renderLibraryDetail } from './library-detail-view.ts';
import {
  escapeHtml as escHtml,
  withDevQuery,
} from './library-format.ts';

// ── i18n ─────────────────────────────────────────────────────────────────────

initPageInterfaceSounds();
initRemoteTrackingHost();
loadSettings();

export function applyTranslations(): void {
  translateDom();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let lastMapsError = '';
let lastMapsErrorAt = 0;

function reportMapsError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const signature = `${context}:${message}`;
  const now = Date.now();
  if (signature === lastMapsError && now - lastMapsErrorAt < 5_000) return;
  lastMapsError = signature;
  lastMapsErrorAt = now;
  console.error(`[maps:${context}]`, error);
  showToast(`${t('errors.error')}: ${message}`, { type: 'error' });
}

function runMapsTask(context: string, task: () => Promise<unknown>, onError?: () => void): void {
  void Promise.resolve().then(task).catch(error => {
    reportMapsError(context, error);
    try {
      onError?.();
    } catch (recoveryError) {
      reportMapsError(`${context}:recovery`, recoveryError);
    }
  });
}

const mapPreview = createMapPreviewController({ reportError: reportMapsError });

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Import ────────────────────────────────────────────────────────────────────

async function importMapFile(file: File): Promise<void> {
  await importLibraryMap(file, {
    reload: loadMaps,
    reportError: reportMapsError,
    stopPreview: () => mapPreview.stop(true),
  });
}

// ── State ─────────────────────────────────────────────────────────────────────

let allMaps: MapEntry[]     = [];
let selectedId: string | null = null;
let activeDiff: string      = '';
let activeSort: string      = 'newest';
let searchQuery: string     = '';
let favoritesOnly           = false;
const libraryFilter = createLibraryFilter();

function isFavoriteMap(id: string): boolean {
  return libraryFilter.isFavorite(id);
}

function getFilteredMaps(): MapEntry[] {
  return libraryFilter.filter({
    query: searchQuery,
    difficulty: activeDiff,
    sort: activeSort,
    favoritesOnly,
    getBestScore: mapId => getMapScoreData(mapId).best?.score ?? 0,
  });
}

// ── Render: list ──────────────────────────────────────────────────────────────

function renderMapList(maps: MapEntry[]): void {
  const container = document.getElementById('mapList')!;

  if (!maps.length) {
    const isFiltered = searchQuery || activeDiff || favoritesOnly;
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">search_off</span>
        <div class="empty-title">${isFiltered ? t('maps.noResultsTitle') : t('maps.noMapsTitle')}</div>
        <div class="empty-sub">${isFiltered ? t('maps.noResultsSub') : t('maps.noMapsSub')}</div>
        ${!isFiltered ? `<a class="empty-cta" href="${withDevQuery('./map-creator.html')}">
          <span class="material-symbols-rounded">add</span>${t('maps.createFirst')}</a>` : ''}
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
      ${maps.map((map, index) => renderMapCard(map, index, activeIndex, {
        favorite: isFavoriteMap(map.id),
        score: getMapScoreData(map.id).best?.score ?? 0,
        selected: selectedId === map.id,
      })).join('')}
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

// ── Render: detail pane ───────────────────────────────────────────────────────

function renderDetail(map: MapEntry | null): void {
  const pane = document.getElementById('detailPane')!;
  pane.innerHTML = renderLibraryDetail(
    map,
    map ? getMapScoreData(map.id) : null,
    map ? isFavoriteMap(map.id) : false,
    mapPreview.getMusicPercent(),
  );
  if (!map) return;

  document.getElementById('btnDelete')?.addEventListener('click', async btn => {
    const el = btn.currentTarget as HTMLButtonElement;
    mapPreview.stop();
    await deleteMap(el.dataset['id']!, el.dataset['server'] === '1');
  });

  document.getElementById('btnExport')?.addEventListener('click', async btn => {
    const el = btn.currentTarget as HTMLButtonElement;
    await exportMap(el.dataset['id']!);
  });

  document.getElementById('btnFavoriteMap')?.addEventListener('click', btn => {
    const el = btn.currentTarget as HTMLButtonElement;
    libraryFilter.toggleFavorite(el.dataset['id'] ?? '');
    renderMapList(getFilteredMaps());
    renderDetail(map);
  });

  document.querySelector<HTMLAnchorElement>('.btn-play')?.addEventListener('click', () => mapPreview.stop());
  document.querySelector<HTMLAnchorElement>('.detail-secondary-actions a')?.addEventListener('click', () => mapPreview.stop());
  document.getElementById('previewToggle')?.addEventListener('click', () => mapPreview.toggle());
  mapPreview.bindControls();
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
  if (map) mapPreview.schedule(map);
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
    t('maps.deleteConfirmText', { id }),
    { title: t('maps.deleteConfirmTitle'), confirmText: t('maps.deleteBtn'), cancelText: t('calib.abort'), danger: true }
  );
  if (!confirmed) return;

  mapPreview.stop();

  let serverDeleted = false;
  if (tryServer) {
    try { await fetchJson(`/api/maps/${encodeURIComponent(id)}`, { method: 'DELETE' }); serverDeleted = true; }
    catch {}
  }
  deleteLocalMap(id);
  await deleteLocalMapAudio(id);
  allMaps = allMaps.filter(m => m.id !== id);
  libraryFilter.setMaps(allMaps);
  if (selectedId === id) { selectedId = null; renderDetail(null); }
  renderMapList(getFilteredMaps());
  if (!serverDeleted && tryServer) showToast(t('maps.deleteServerFail'), { type: 'error' });
  else showToast(t('maps.deleteSuccess'), { type: 'success' });
}

async function exportMap(id: string): Promise<void> {
  await exportLibraryMap(id, allMaps.find(map => map.id === id) ?? null);
}

// ── Load maps ─────────────────────────────────────────────────────────────────

let loadMapsInProgress = false;
let serverMapsWarningShown = false;

async function loadMaps(): Promise<void> {
  if (loadMapsInProgress) return;
  loadMapsInProgress = true;
  try {
    document.getElementById('mapList')!.innerHTML = renderLibrarySkeleton();
    renderDetail(null);

    const localMaps  = (readLocalMaps() as unknown) as MapEntry[];
    const autosave   = getAutosaveMap();
    if (autosave && !localMaps.some(m => m.id === autosave.id)) localMaps.unshift(autosave);

    let serverMaps: MapEntry[] = [];
    let serverError: Error | null = null;
    const healthPromise = checkServerHealth();
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
    libraryFilter.setMaps(allMaps);

    const serverOnline = await healthPromise;
    const offlineEl = document.getElementById('offlineNotice');
    const definitelyOffline = Boolean(serverError && !serverOnline && serverMaps.length === 0);
    if (offlineEl) offlineEl.hidden = !definitelyOffline;
    if (serverError && serverOnline && !serverMapsWarningShown) {
      serverMapsWarningShown = true;
      showToast(t('maps.serverMapsUnavailable'), { type: 'info' });
    }

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
  scoreList.innerHTML = renderLibrarySkeleton();

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
        <div class="empty-title">${t('maps.noScoresTitle')}</div>
        <div class="empty-sub">${t('maps.noScoresSub')}</div>
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
  if (name === 'scores') {
    mapPreview.stop(true);
    runMapsTask('scores-load', loadScores, () => {
      const scoreList = document.getElementById('scoreList');
      if (scoreList) scoreList.textContent = t('maps.noScores');
    });
  }
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

  document.getElementById('favoritesFilter')?.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    const button = document.getElementById('favoritesFilter');
    button?.classList.toggle('is-active', favoritesOnly);
    button?.setAttribute('aria-pressed', String(favoritesOnly));
    renderMapList(getFilteredMaps());
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
  window.addEventListener('pagehide', () => mapPreview.stop());
  window.addEventListener('beforeunload', () => mapPreview.stop());
  runMapsTask('maps-load', loadMaps, () => {
    const mapList = document.getElementById('mapList');
    if (mapList) mapList.textContent = t('maps.noMaps');
  });
  initKeyboardNav({ isMapsPage: true });
}
