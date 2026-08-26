import { t } from '../i18n/index.ts';
import type { MapEntry } from './library-api.ts';
import { escapeAttribute as attr, escapeHtml as escHtml, formatMapTime as formatTime } from './library-format.ts';

interface MapCardState {
  favorite: boolean;
  score: number;
  selected: boolean;
}

export function renderLibrarySkeleton(): string {
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

export function renderMapCard(
  map: MapEntry,
  index: number,
  activeIndex: number,
  state: MapCardState,
): string {
  const title = map.meta?.title ?? map.id;
  const artist = map.meta?.artist ?? map.meta?.mapper ?? '';
  const difficulty = map.meta?.difficulty ?? '';
  const beats = map.beats?.length ?? 0;
  const duration = map.meta?.duration ? formatTime(map.meta.duration) : null;
  const isLocal = map.source === 'local' || map.source === 'autosave';
  const subParts = [artist, duration, beats ? t('maps.beatsCount', { count: beats }) : null].filter(Boolean);
  const offset = Math.max(-3, Math.min(3, index - activeIndex));
  const absOffset = Math.abs(offset);
  const depth = 1 - Math.min(absOffset, 3) * 0.09;
  const translateX = offset * 22;
  const rotateY = offset * -8;
  const translateZ = (3 - absOffset) * 8;

  return `
      <div class="map-card map-item${state.selected ? ' is-selected' : ''}"
           data-id="${attr(map.id)}"
           tabindex="0" role="button" aria-label="${attr(title)}"
           style="--card-offset:${offset};--card-depth:${depth.toFixed(2)};--card-x:${translateX}px;--card-ry:${rotateY}deg;--card-z:${translateZ}px;animation-delay:${index * 0.025}s">
        <div class="map-card-glow"></div>
        <div class="map-row-icon">
          <span class="material-symbols-rounded">music_note</span>
        </div>
        <div class="map-row-info map-card-info">
          <div class="map-row-title">${escHtml(title)}</div>
          ${subParts.length ? `<div class="map-row-sub">${subParts.map(escHtml).join(' · ')}</div>` : ''}
          <div class="map-card-wave" aria-hidden="true">${renderWaveBars(map.id)}</div>
        </div>
        <div class="map-row-badges">
          ${state.favorite ? '<span class="map-favorite material-symbols-rounded" aria-hidden="true">star</span>' : ''}
          ${difficulty ? `<span class="diff-badge diff-${escHtml(difficulty.toLowerCase())}">${escHtml(difficulty)}</span>` : ''}
          ${isLocal ? '<span class="local-badge">LOCAL</span>' : ''}
          ${state.score ? `<span class="score-badge">${String(state.score).padStart(6, '0')}</span>` : ''}
        </div>
      </div>`;
}

function renderWaveBars(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: 18 }, (_, index) => {
    const value = 18 + ((hash >> (index % 12)) + index * 17) % 46;
    return `<span style="--h:${value}%"></span>`;
  }).join('');
}
