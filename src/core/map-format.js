export const MAP_FORMAT_VERSION = 1;
export const MAX_BEATS_DEFAULT = 10000; // twardy limit serwera
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024; // 100 MB
export const AUDIO_EXT_RE = /\.(mp3|ogg|wav|flac)$/i;
export const JSON_EXT_RE = /\.json$/i;

const CUT_DIRECTIONS = new Set(['any','down','up','left','right','down-left','down-right','up-left','up-right']);
const META_TEXT_LIMIT = 120;

function normalizeCut(cut) {
  const value = String(cut ?? 'any').trim().toLowerCase().replace(/_/g, '-');
  if (value === '' || value === 'none' || value === 'dot' || value === 'free') return 'any';
  if (value === 'dl') return 'down-left';
  if (value === 'dr') return 'down-right';
  if (value === 'ul') return 'up-left';
  if (value === 'ur') return 'up-right';
  return CUT_DIRECTIONS.has(value) ? value : 'any';
}

function normalizeMetaText(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, META_TEXT_LIMIT);
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizePositiveNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function sanitizeMapId(id, fallback = 'custom-map') {
  const cleaned = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || fallback;
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isSafeZipPath(name) {
  const path = String(name || '').replace(/\\/g, '/');
  if (!path || path.startsWith('/') || path.startsWith('~')) return false;
  return !path.split('/').some(part => part === '..' || part === '');
}

export function assertFileSize(fileLike, limitBytes = MAX_IMPORT_BYTES) {
  const size = Number(fileLike?.size ?? fileLike?.buffer?.length ?? 0);
  if (Number.isFinite(size) && size > limitBytes) {
    throw new Error(`Plik jest za duży (${Math.round(size / 1024 / 1024)} MB). Limit: ${Math.round(limitBytes / 1024 / 1024)} MB.`);
  }
}

export function validateZipEntryNames(entries) {
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (!isSafeZipPath(name)) throw new Error(`Niebezpieczna ścieżka w ZIP: ${name}`);
  }
}

function normalizeBeat(rawBeat, index = 0) {
  const beat = isPlainObject(rawBeat) ? rawBeat : {};
  const t = Number(beat.t ?? beat.time ?? beat.timeSec ?? 0);
  const side = beat.side === 'right' || beat.side === 'left' || beat.side === 'random' ? beat.side : (index % 2 ? 'right' : 'left');
  const type = beat.type === 'bomb' ? 'bomb' : 'block';
  const out = {
    ...beat,
    t: Number.isFinite(t) ? Math.max(0, t) : 0,
    side,
    type,
    cut: normalizeCut(beat.cut ?? beat.direction ?? beat.cutDirection),
  };
  if (Number.isFinite(Number(beat.x))) out.x = Number(beat.x);
  if (Number.isFinite(Number(beat.y))) out.y = Number(beat.y);
  return out;
}

export function normalizeMap(rawMap, options = {}) {
  if (!isPlainObject(rawMap)) throw new Error('Mapa musi być obiektem JSON.');
  const beats = Array.isArray(rawMap.beats) ? rawMap.beats.map(normalizeBeat).sort((a, b) => a.t - b.t) : [];
  const maxBeats = options.maxBeats ?? MAX_BEATS_DEFAULT;
  if (beats.length > maxBeats) {
    if (options.throwOnLimit) {
      throw new Error(`Mapa zawiera zbyt wiele beatów (${beats.length}). Limit: ${maxBeats}.`);
    }
    beats.length = maxBeats;
  }
  if (!beats.length && options.requireBeats !== false) throw new Error('Mapa musi zawierać tablicę beats.');
  const meta = isPlainObject(rawMap.meta) ? { ...rawMap.meta } : {};
  const id = sanitizeMapId(rawMap.id || meta.title || options.fallbackId || 'custom-map');
  const audioOffsetMs = Number(meta.audioOffsetMs ?? rawMap.audioOffsetMs ?? 0);
  meta.audioOffsetMs = Number.isFinite(audioOffsetMs) ? Math.max(-1000, Math.min(1000, audioOffsetMs)) : 0;
  meta.title = normalizeMetaText(meta.title, id) || id;
  meta.artist = normalizeMetaText(meta.artist ?? rawMap.artist);
  meta.mapper = normalizeMetaText(meta.mapper ?? rawMap.mapper);
  meta.difficulty = normalizeMetaText(meta.difficulty ?? rawMap.difficulty);
  meta.bpm = normalizePositiveNumber(meta.bpm ?? rawMap.bpm);
  meta.duration = normalizeNonNegativeNumber(meta.duration ?? rawMap.duration);
  meta.previewStartSec = normalizeNonNegativeNumber(meta.previewStartSec ?? rawMap.previewStartSec);
  if (meta.duration > 0) meta.previewStartSec = Math.min(meta.previewStartSec, meta.duration);

  return {
    ...rawMap,
    id,
    formatVersion: Number(rawMap.formatVersion || MAP_FORMAT_VERSION),
    meta,
    beats,
  };
}

export function validateMap(map, options = {}) {
  try {
    normalizeMap(map, options);
    return true;
  } catch {
    return false;
  }
}
