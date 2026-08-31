import { t, translateDom } from '../i18n/index.ts';
import { loadLocalMapAudio, readLocalMaps, readLocalScores } from '../core/localstore.ts';
import { getCanonicalMapAudioUrl, normalizeMap } from '../core/map-format.ts';
import { importMapLocally, importMapToServer } from '../core/map-import.ts';
import { getSettings, setSetting } from '../core/settings.ts';
import {
  recommendLearningCurveMap,
  type LearningCurveRecommendation,
} from '../core/learning-curve.ts';
import type { DifficultyBeat } from '../core/map-difficulty.ts';
import { popFocusTrap, pushFocusTrap } from '../ui/keyboard-nav.ts';

interface MapMeta {
  title?: string;
  artist?: string;
  mapper?: string;
  difficulty?: string;
  duration?: number;
  bpm?: number;
  audioFile?: string;
  previewStartSec?: number;
}

interface MapEntry {
  id: string;
  meta?: MapMeta;
  beats?: DifficultyBeat[];
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
let favoritesOnly = false;
let searchQuery = '';
let loading = false;
let initialized = false;
let importing = false;
let returnFocus: HTMLElement | null = null;
let closeTimer: number | null = null;
let learningRecommendation: LearningCurveRecommendation | null = null;
const PREVIEW_MAX_SECONDS = 30;
let previewAudio: HTMLAudioElement | null = null;
let previewObjectUrl: string | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let previewProgressTimer: ReturnType<typeof setInterval> | null = null;
let previewToken = 0;
let previewRemainingSeconds = PREVIEW_MAX_SECONDS;
let previewStartedAt = 0;
let previewPaused = false;
let previewMapId: string | null = null;

interface PreviewUi {
  button: HTMLButtonElement;
  icon: HTMLElement;
  label: HTMLElement;
  status: HTMLElement;
  progress: HTMLElement;
  time: HTMLElement;
}

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

function getPreviewAudio(): HTMLAudioElement {
  previewAudio ??= new Audio();
  return previewAudio;
}

function clearPreviewTimers(): void {
  if (previewTimer) clearTimeout(previewTimer);
  if (previewProgressTimer) clearInterval(previewProgressTimer);
  previewTimer = null;
  previewProgressTimer = null;
}

function stopPreview(): void {
  previewToken++;
  clearPreviewTimers();
  const audio = previewAudio;
  if (audio) {
    audio.pause();
    audio.onended = null;
    audio.removeAttribute('src');
    audio.load();
  }
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
  previewRemainingSeconds = PREVIEW_MAX_SECONDS;
  previewStartedAt = 0;
  previewPaused = false;
  previewMapId = null;
}

function setPreviewUi(ui: PreviewUi, state: 'idle' | 'loading' | 'playing' | 'paused' | 'error', message: string): void {
  ui.status.textContent = message;
  ui.status.dataset['state'] = state;
  ui.button.disabled = state === 'loading';
  ui.icon.textContent = state === 'playing' ? 'pause' : 'play_arrow';
  ui.label.textContent = state === 'paused' ? t('mapPicker.previewResume') : t('mapPicker.preview');
}

function updatePreviewProgress(ui: PreviewUi): void {
  const elapsed = previewPaused ? 0 : Math.max(0, (performance.now() - previewStartedAt) / 1000);
  const remaining = Math.max(0, previewPaused ? previewRemainingSeconds : previewRemainingSeconds - elapsed);
  const progress = 1 - remaining / PREVIEW_MAX_SECONDS;
  ui.progress.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  ui.time.textContent = `${Math.ceil(remaining)}s`;
}

function startPreviewTimers(ui: PreviewUi, token: number): void {
  clearPreviewTimers();
  previewStartedAt = performance.now();
  previewTimer = setTimeout(() => {
    if (token !== previewToken) return;
    stopPreview();
    ui.progress.style.width = '100%';
    ui.time.textContent = '0s';
    setPreviewUi(ui, 'idle', t('mapPicker.previewFinished'));
  }, Math.max(0, previewRemainingSeconds * 1000));
  previewProgressTimer = setInterval(() => {
    if (token !== previewToken) return;
    updatePreviewProgress(ui);
  }, 200);
  updatePreviewProgress(ui);
}

async function loadPreviewSource(map: MapEntry): Promise<string | null> {
  if (!map.localOnly) {
    const audioUrl = getCanonicalMapAudioUrl(map.id);
    if (audioUrl) {
      try {
        const response = await fetch(audioUrl, { credentials: 'same-origin' });
        if (response.ok) return URL.createObjectURL(await response.blob());
      } catch { /* local audio is a valid fallback */ }
    }
  }
  const local = await loadLocalMapAudio(map.id).catch(() => null);
  if (!local?.arrayBuffer) return null;
  return URL.createObjectURL(new Blob([local.arrayBuffer], { type: local.mimeType || 'application/octet-stream' }));
}

async function startPreview(map: MapEntry, ui: PreviewUi): Promise<void> {
  stopPreview();
  const token = previewToken;
  previewMapId = map.id;
  setPreviewUi(ui, 'loading', t('mapPicker.previewLoading'));
  try {
    const source = await loadPreviewSource(map);
    if (token !== previewToken) {
      if (source) URL.revokeObjectURL(source);
      return;
    }
    if (!source) {
      setPreviewUi(ui, 'error', t('mapPicker.previewNoAudio'));
      return;
    }
    const settings = getSettings();
    const masterVolume = Number.isFinite(settings.volume) ? settings.volume : 0;
    const musicVolume = Number.isFinite(settings.musicVolume) ? settings.musicVolume : 0;
    const volume = Math.max(0, Math.min(1, masterVolume * musicVolume * 0.34));
    if (volume <= 0) {
      URL.revokeObjectURL(source);
      setPreviewUi(ui, 'error', t('mapPicker.previewMuted'));
      return;
    }
    const audio = getPreviewAudio();
    previewObjectUrl = source;
    audio.src = source;
    audio.volume = volume;
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          audio.removeEventListener('loadedmetadata', onReady);
          audio.removeEventListener('error', onError);
        };
        const onReady = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Preview audio failed to load')); };
        audio.addEventListener('loadedmetadata', onReady, { once: true });
        audio.addEventListener('error', onError, { once: true });
      });
    }
    if (token !== previewToken) return;
    const requestedStart = Number(map.meta?.previewStartSec ?? 0);
    const maxStart = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 1) : 0;
    audio.currentTime = Math.max(0, Math.min(Number.isFinite(requestedStart) ? requestedStart : 0, maxStart));
    await audio.play();
    if (token !== previewToken) return;
    previewPaused = false;
    previewRemainingSeconds = PREVIEW_MAX_SECONDS;
    audio.onended = () => {
      if (token !== previewToken) return;
      stopPreview();
      ui.progress.style.width = '100%';
      ui.time.textContent = '0s';
      setPreviewUi(ui, 'idle', t('mapPicker.previewFinished'));
    };
    startPreviewTimers(ui, token);
    setPreviewUi(ui, 'playing', t('mapPicker.previewPlaying'));
  } catch {
    if (token !== previewToken) return;
    stopPreview();
    setPreviewUi(ui, 'error', t('mapPicker.previewFailed'));
  }
}

function togglePreview(map: MapEntry, ui: PreviewUi): void {
  const audio = previewAudio;
  if (!audio || previewMapId !== map.id || !audio.src) {
    void startPreview(map, ui);
    return;
  }
  if (!previewPaused) {
    previewRemainingSeconds = Math.max(0, previewRemainingSeconds - (performance.now() - previewStartedAt) / 1000);
    previewPaused = true;
    clearPreviewTimers();
    audio.pause();
    updatePreviewProgress(ui);
    setPreviewUi(ui, 'paused', t('mapPicker.previewPaused'));
    return;
  }
  void audio.play().then(() => {
    if (previewMapId !== map.id) return;
    previewPaused = false;
    startPreviewTimers(ui, previewToken);
    setPreviewUi(ui, 'playing', t('mapPicker.previewPlaying'));
  }).catch(() => setPreviewUi(ui, 'error', t('mapPicker.previewFailed')));
}

function renderAudioPreview(map: MapEntry): HTMLElement {
  const section = document.createElement('div');
  section.className = 'mp-detail-preview';
  const button = document.createElement('button');
  button.className = 'mp-detail-preview-toggle';
  button.type = 'button';
  const icon = document.createElement('span');
  icon.className = 'material-symbols-rounded';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'play_arrow';
  const label = document.createElement('span');
  label.textContent = t('mapPicker.preview');
  button.append(icon, label);
  const status = document.createElement('p');
  status.className = 'mp-detail-preview-status';
  const progressTrack = document.createElement('div');
  progressTrack.className = 'mp-detail-preview-progress';
  const progress = document.createElement('span');
  progressTrack.append(progress);
  const time = document.createElement('time');
  time.textContent = `${PREVIEW_MAX_SECONDS}s`;
  const ui = { button, icon, label, status, progress, time } satisfies PreviewUi;
  setPreviewUi(ui, 'idle', t('mapPicker.previewHint'));
  button.addEventListener('click', () => togglePreview(map, ui));
  section.append(button, status, progressTrack, time);
  return section;
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
  const favoriteIds = new Set(getSettings().favoriteMapIds);
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
  if (favoritesOnly) maps = maps.filter(map => favoriteIds.has(map.id));
  maps.sort((a, b) => {
    const favoriteOrder = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
    if (favoriteOrder !== 0) return favoriteOrder;
    if (activeSort === 'alpha') return (a.meta?.title ?? a.id).localeCompare(b.meta?.title ?? b.id);
    if (activeSort === 'beats') return (b.beats?.length ?? 0) - (a.beats?.length ?? 0);
    if (activeSort === 'score') return (getMapScoreData(b.id).best?.score ?? 0) - (getMapScoreData(a.id).best?.score ?? 0);
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
  });
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
    const isRecommended = learningRecommendation?.mapId === map.id;
    const isFavorite = getSettings().favoriteMapIds.includes(map.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `mp-map-card${map.id === selectedId ? ' is-selected' : ''}${isRecommended ? ' is-recommended' : ''}`;
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
    const recommendationBadge = document.createElement('span');
    recommendationBadge.className = 'mp-map-recommended';
    recommendationBadge.textContent = t('mapPicker.learningRecommended');
    const subtitle = document.createElement('span');
    subtitle.textContent = [cleanText(map.meta?.artist), cleanText(map.meta?.difficulty)].filter(Boolean).join(' \u00b7 ') || map.id;
    const stats = document.createElement('span');
    stats.className = 'mp-map-card-stats';
    const bpm = finitePositive(map.meta?.bpm);
    const duration = finitePositive(map.meta?.duration);
    stats.textContent = `${bpm ? `${Math.round(bpm)} BPM` : '\u2014 BPM'} \u00b7 ${formatDuration(duration)} \u00b7 ${map.beats?.length ?? 0} ${t('mapPicker.beats')}`;
    content.append(title);
    if (isRecommended) content.append(recommendationBadge);
    content.append(subtitle, stats);
    const check = document.createElement('span');
    check.className = 'material-symbols-rounded mp-map-card-check';
    check.textContent = map.id === selectedId ? 'check_circle' : 'chevron_right';
    card.append(icon, content);
    if (isFavorite) {
      const favorite = document.createElement('span');
      favorite.className = 'material-symbols-rounded mp-map-card-favorite';
      favorite.setAttribute('aria-label', t('maps.favorite'));
      favorite.textContent = 'star';
      card.append(favorite);
    }
    card.append(check);
    card.addEventListener('click', () => selectMap(map.id, { openDetail: true }));
    list.append(card);
  }
}

function renderLearningCurveHint(recommendation: LearningCurveRecommendation): HTMLElement {
  const hint = document.createElement('section');
  hint.className = 'mp-learning-hint';
  const icon = document.createElement('span');
  icon.className = 'material-symbols-rounded';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'route';
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = t('mapPicker.learningTitle');
  const reason = document.createElement('p');
  reason.textContent = t(`mapPicker.learningReason${recommendation.reason[0]!.toUpperCase()}${recommendation.reason.slice(1)}`);
  const analysis = document.createElement('small');
  analysis.textContent = t('mapPicker.learningScore', {
    difficulty: t(`difficulty.${recommendation.difficulty}`),
    score: recommendation.difficultyScore,
  });
  content.append(title, reason, analysis);
  hint.append(icon, content);
  return hint;
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
  const backButton = document.createElement('button');
  backButton.className = 'mp-detail-back';
  backButton.type = 'button';
  backButton.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>';
  const backLabel = document.createElement('span');
  backLabel.textContent = t('mapPicker.backToList');
  backButton.append(backLabel);
  backButton.addEventListener('click', () => {
    element<HTMLElement>('mapPickerOverlay')?.querySelector('.mp-overlay-body')?.classList.remove('is-detail-open');
    const selectedCard = Array.from(document.querySelectorAll<HTMLButtonElement>('#mpMapList .mp-map-card'))
      .find(card => card.dataset['mapId'] === map.id);
    selectedCard?.focus({ preventScroll: true });
  });
  detailPane.append(backButton);
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
  const recommendation = learningRecommendation?.mapId === map.id
    ? learningRecommendation
    : null;
  const learningHint = recommendation ? renderLearningCurveHint(recommendation) : null;
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
  detailPane.append(title, subtitle, diffBadge);
  if (learningHint) detailPane.append(learningHint);
  detailPane.append(stats);
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
  detailPane.append(renderAudioPreview(map));
  // Play button
  const actions = document.createElement('div');
  actions.className = 'mp-detail-actions';
  const favoriteBtn = document.createElement('button');
  favoriteBtn.className = 'mp-detail-favorite';
  favoriteBtn.type = 'button';
  const syncFavoriteButton = (): void => {
    const favorite = getSettings().favoriteMapIds.includes(map.id);
    favoriteBtn.classList.toggle('is-favorite', favorite);
    favoriteBtn.setAttribute('aria-pressed', String(favorite));
    favoriteBtn.setAttribute('aria-label', t(favorite ? 'maps.favoriteRemove' : 'maps.favoriteAdd'));
    favoriteBtn.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">star</span>';
  };
  syncFavoriteButton();
  favoriteBtn.addEventListener('click', () => {
    const favoriteIds = new Set(getSettings().favoriteMapIds);
    if (favoriteIds.has(map.id)) favoriteIds.delete(map.id);
    else favoriteIds.add(map.id);
    setSetting('favoriteMapIds', [...favoriteIds]);
    syncFavoriteButton();
    const list = element<HTMLElement>('mpMapList');
    if (list) renderMapList(list);
  });
  const playBtn = document.createElement('button');
  playBtn.className = 'mp-detail-play';
  playBtn.type = 'button';
  playBtn.textContent = t('mapPicker.play');
  playBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('hand-sabers:map-selected', { detail: { mapId: map.id } }));
    closeOverlay();
  });
  actions.append(favoriteBtn, playBtn);
  detailPane.append(actions);
}

function selectMap(mapId: string, { openDetail = false } = {}): void {
  stopPreview();
  selectedId = mapId;
  const list = element<HTMLElement>('mpMapList');
  const detailPane = element<HTMLElement>('mpDetailPane');
  if (list) renderMapList(list);
  if (detailPane) {
    const map = allMaps.find(m => m.id === mapId);
    renderDetail(detailPane, map);
  }
  const body = element<HTMLElement>('mapPickerOverlay')?.querySelector('.mp-overlay-body');
  const shouldOpenDetail = openDetail && window.matchMedia('(max-width: 700px)').matches;
  body?.classList.toggle('is-detail-open', shouldOpenDetail);
  if (shouldOpenDetail) {
    requestAnimationFrame(() => detailPane?.querySelector<HTMLButtonElement>('.mp-detail-back')?.focus({ preventScroll: true }));
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
    const currentPlayerName = cleanText(getSettings().playerName);
    const playerScores = (readLocalScores({ limit: 1000 }) as ScoreEntry[])
      .filter(score => !currentPlayerName || cleanText(score.player) === currentPlayerName);
    learningRecommendation = recommendLearningCurveMap(
      allMaps,
      playerScores,
    );
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
    selectMap(importedId, { openDetail: true });
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

function openOverlay(returnFocusTo?: HTMLElement | null): void {
  const overlay = element<HTMLElement>('mapPickerOverlay');
  if (!overlay || !overlay.hidden) return;
  if (closeTimer !== null) window.clearTimeout(closeTimer);
  closeTimer = null;
  overlay.classList.remove('is-closing');
  returnFocus = returnFocusTo
    ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  overlay.querySelector('.mp-overlay-body')?.classList.remove('is-detail-open');
  overlay.hidden = false;
  pushFocusTrap(overlay);
  translateDom(overlay);
  clearImportStatus();
  if (allMaps.length === 0) void loadMaps();
  else {
    const list = element<HTMLElement>('mpMapList');
    if (list) renderMapList(list);
  }
  element<HTMLInputElement>('mpSearch')?.focus({ preventScroll: true });
}

function finishClosingOverlay(overlay: HTMLElement): void {
  closeTimer = null;
  overlay.hidden = true;
  overlay.classList.remove('is-closing');
  popFocusTrap(overlay);
  const focusTarget = returnFocus;
  returnFocus = null;
  if (focusTarget?.isConnected && focusTarget.getClientRects().length > 0 && !focusTarget.matches('[hidden], :disabled')) {
    focusTarget.focus({ preventScroll: true });
  }
}

function closeOverlay(): void {
  const overlay = element<HTMLElement>('mapPickerOverlay');
  if (!overlay || overlay.hidden || overlay.classList.contains('is-closing')) return;
  stopPreview();
  overlay.querySelector('.mp-overlay-body')?.classList.remove('is-detail-open');
  overlay.classList.add('is-closing');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishClosingOverlay(overlay);
  } else {
    closeTimer = window.setTimeout(() => finishClosingOverlay(overlay), 180);
  }
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
  const favoritesButton = element<HTMLButtonElement>('mpFavorites');
  if (!overlay || !closeBtn || !searchInput || !sortSelect) return;
  // Close
  closeBtn.addEventListener('click', closeOverlay);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeOverlay(); });
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || overlay.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeOverlay();
  }, { capture: true });
  window.addEventListener('pagehide', stopPreview, { once: true });
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
  document.querySelectorAll<HTMLElement>('.mp-diff-chip[data-diff]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.mp-diff-chip[data-diff]').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      activeDiff = chip.dataset['diff'] ?? 'all';
      const list = element<HTMLElement>('mpMapList');
      if (list) renderMapList(list);
    });
  });
  favoritesButton?.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoritesButton.classList.toggle('is-active', favoritesOnly);
    favoritesButton.setAttribute('aria-pressed', String(favoritesOnly));
    const list = element<HTMLElement>('mpMapList');
    if (list) renderMapList(list);
  });
}

export function openMapPicker(returnFocusTo?: HTMLElement | null): void {
  openOverlay(returnFocusTo);
}
