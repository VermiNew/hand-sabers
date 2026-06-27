import type { Beat, BeatSide, BeatType, CutDirection, GameMap, MapMeta } from '../types/index.js';

export const MAP_FORMAT_VERSION = 1;
export const MAX_BEATS_DEFAULT = 10_000;
export const MAX_BEATS_EXTENDED = 100_000;
export const MAX_MAP_DURATION_SEC = 24 * 60 * 60;
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024; // 200 MB
export const AUDIO_EXT_RE = /\.(mp3|ogg|wav|flac)$/i;
export const JSON_EXT_RE = /\.json$/i;

const CUT_DIRECTION_SET = new Set<string>([
  'any',
  'down',
  'up',
  'left',
  'right',
  'down-left',
  'down-right',
  'up-left',
  'up-right',
]);
const META_TEXT_LIMIT = 120;

interface NormalizeMapOptions {
  fallbackId?: string;
  requireBeats?: boolean;
  maxBeats?: number;
  throwOnLimit?: boolean;
}

interface FileLike {
  size?: number;
  buffer?: { length?: number };
}

interface ZipEntryLike {
  name?: string;
}

type UnknownRecord = Record<string, unknown>;
type NormalizedBeat = Beat & UnknownRecord;

function asRecord(value: unknown): UnknownRecord {
  return isPlainObject(value) ? value : {};
}

function normalizeCut(cut: unknown): CutDirection {
  const value = String(cut ?? 'any').trim().toLowerCase().replace(/_/g, '-');
  if (value === '' || value === 'none' || value === 'dot' || value === 'free') return 'any';
  if (value === 'dl') return 'down-left';
  if (value === 'dr') return 'down-right';
  if (value === 'ul') return 'up-left';
  if (value === 'ur') return 'up-right';
  return CUT_DIRECTION_SET.has(value) ? value as CutDirection : 'any';
}

function normalizeMetaText(value: unknown, fallback = ''): string {
  return String(value ?? fallback).trim().slice(0, META_TEXT_LIMIT);
}

function normalizeNonNegativeNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizePositiveNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function sanitizeMapId(id: unknown, fallback = 'custom-map'): string {
  const cleaned = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || fallback;
}

export function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isSafeZipPath(name: unknown): boolean {
  const zipPath = String(name || '').replace(/\\/g, '/');
  if (!zipPath || zipPath.startsWith('/') || zipPath.startsWith('~')) return false;
  const parts = zipPath.endsWith('/') ? zipPath.slice(0, -1).split('/') : zipPath.split('/');
  return parts.length > 0 && !parts.some(part => part === '..' || part === '');
}

export function findPreferredAudioEntry<T extends { dir?: boolean; name?: string }>(
  entries: readonly T[],
  preferredName: unknown,
): T | null {
  const audioEntries = entries.filter(entry => !entry.dir && AUDIO_EXT_RE.test(String(entry.name || '')));
  if (!audioEntries.length) return null;

  const preferredPath = String(preferredName || '').replace(/\\/g, '/').toLowerCase();
  const preferredBase = preferredPath.split('/').pop() || '';
  if (!preferredBase) return audioEntries[0]!;

  return audioEntries.find(entry => {
    const entryPath = String(entry.name || '').replace(/\\/g, '/').toLowerCase();
    return entryPath === preferredPath || entryPath.split('/').pop() === preferredBase;
  }) || audioEntries[0]!;
}

export function assertFileSize(fileLike: FileLike, limitBytes = MAX_IMPORT_BYTES): void {
  const size = Number(fileLike?.size ?? fileLike?.buffer?.length ?? 0);
  if (Number.isFinite(size) && size > limitBytes) {
    throw new Error(`Plik jest za duży (${Math.round(size / 1024 / 1024)} MB). Limit: ${Math.round(limitBytes / 1024 / 1024)} MB.`);
  }
}

export function validateZipEntryNames(entries: Array<string | ZipEntryLike>): void {
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (!isSafeZipPath(name)) throw new Error(`Niebezpieczna ścieżka w ZIP: ${name}`);
  }
}

function normalizeBeat(rawBeat: unknown, index = 0): NormalizedBeat {
  const beat = asRecord(rawBeat);
  const t = Number(beat.t ?? beat.time ?? beat.timeSec ?? 0);
  const side: BeatSide = beat.side === 'right' || beat.side === 'left' || beat.side === 'random'
    ? beat.side
    : index % 2 ? 'right' : 'left';
  const type: BeatType = beat.type === 'bomb' ? 'bomb' : beat.type === 'held' ? 'held' : 'block';
  const out: NormalizedBeat = {
    ...beat,
    t: Number.isFinite(t) ? Math.max(0, t) : 0,
    side,
    type,
    cut: normalizeCut(beat.cut ?? beat.direction ?? beat.cutDirection),
  };
  delete out._overlap;
  if (Number.isFinite(Number(beat.x))) out.x = Number(beat.x);
  if (Number.isFinite(Number(beat.y))) out.y = Number(beat.y);
  if (type === 'held' && Number.isFinite(Number(beat.duration))) out.duration = Math.max(0.05, Number(beat.duration));
  return out;
}

export function upgradeMapFormat(rawMap: unknown, options: NormalizeMapOptions = {}): GameMap & UnknownRecord {
  if (!isPlainObject(rawMap)) throw new Error('Mapa musi być obiektem JSON.');
  const metaSource = asRecord(rawMap.meta);
  const declaredDuration = Number(metaSource.duration ?? rawMap.duration ?? 0);
  if (declaredDuration > MAX_MAP_DURATION_SEC) {
    throw new Error('Mapa jest dłuższa niż dozwolone 24 godziny.');
  }

  const rawBeats = Array.isArray(rawMap.beats) ? rawMap.beats : [];
  const maxBeats = options.maxBeats ?? MAX_BEATS_DEFAULT;
  if (rawBeats.length > maxBeats) {
    if (options.throwOnLimit) {
      throw new Error(`Mapa zawiera zbyt wiele beatów (${rawBeats.length}). Limit: ${maxBeats}.`);
    }
  }
  const beats = rawBeats
    .slice(0, maxBeats)
    .map((rawBeat, index) => {
      const beat = normalizeBeat(rawBeat, index);
      if (beat.t > MAX_MAP_DURATION_SEC) {
        throw new Error(`Beat ${index + 1} przekracza dozwoloną długość mapy wynoszącą 24 godziny.`);
      }
      return beat;
    })
    .sort((a, b) => a.t - b.t);
  if (!beats.length && options.requireBeats !== false) throw new Error('Mapa musi zawierać tablicę beats.');

  const meta: MapMeta = { ...metaSource };
  const id = sanitizeMapId(rawMap.id || meta.title || rawMap.title || options.fallbackId || 'custom-map');
  const audioOffsetMs = Number(meta.audioOffsetMs ?? rawMap.audioOffsetMs ?? 0);
  meta.audioOffsetMs = Number.isFinite(audioOffsetMs) ? Math.max(-1000, Math.min(1000, audioOffsetMs)) : 0;
  meta.title = normalizeMetaText(meta.title ?? rawMap.title, id) || id;
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

export function normalizeMap(rawMap: unknown, options: NormalizeMapOptions = {}): GameMap & UnknownRecord {
  return upgradeMapFormat(rawMap, options);
}

export function validateMap(map: unknown, options: NormalizeMapOptions = {}): boolean {
  try {
    upgradeMapFormat(map, options);
    return true;
  } catch {
    return false;
  }
}
