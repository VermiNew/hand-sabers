import { t } from '../i18n/index.ts';
import type { MapEntry, ScoreEntry } from './library-api.ts';
import { escapeAttribute as attr, escapeHtml as escHtml, formatMapTime as formatTime, withDevQuery } from './library-format.ts';

interface MapScoreData {
  tries: number;
  best: ScoreEntry | null;
  progress: number | null;
}

export function renderLibraryDetail(
  map: MapEntry | null,
  scoreData: MapScoreData | null,
  favorite: boolean,
  musicPercent: number,
): string {
  if (!map || !scoreData) {
    return `
      <div class="detail-empty">
        <span class="material-symbols-rounded">arrow_back</span>
        <div class="detail-empty-hint">${t('maps.selectFromList').replace(' ', '<br>')}</div>
      </div>`;
  }

  const title = map.meta?.title ?? map.id;
  const artist = [map.meta?.artist, map.meta?.mapper].filter(Boolean).join(' · ');
  const difficulty = map.meta?.difficulty ?? '';
  const beats = map.beats?.length ?? 0;
  const duration = map.meta?.duration ? formatTime(map.meta.duration) : '—';
  const bpm = map.meta?.bpm ? `${map.meta.bpm} BPM` : '—';
  const isLocal = map.source === 'local' || map.source === 'autosave';
  const canDeleteServer = map.source === 'server' || map.source === 'server+local';
  const scoreSection = scoreData.best ? `
    <div class="detail-score-section">
      <div class="detail-score-label">${t('maps.bestScore')}</div>
      <div class="detail-best-score">${String(scoreData.best.score).padStart(6, '0')}</div>
      <div class="detail-score-meta">
        <span><span class="material-symbols-rounded">cycle</span>${t('maps.triesCount', { count: scoreData.tries })}</span>
        <span><span class="material-symbols-rounded">local_fire_department</span>×${scoreData.best.combo} combo</span>
        ${scoreData.best.player ? `<span><span class="material-symbols-rounded">person</span>${escHtml(scoreData.best.player)}</span>` : ''}
      </div>
      ${scoreData.progress !== null ? `
        <div class="detail-progress-wrap">
          <div class="detail-progress-fill" style="width:${Math.round(scoreData.progress * 100)}%"></div>
        </div>` : ''}
    </div>` : `<div class="detail-no-score">${t('maps.noScoresFirst')}</div>`;

  return `
    <div class="detail-scroll">
      <div id="detailTiltCard" class="detail-hero-card">
        <div class="detail-card-glare" aria-hidden="true"></div>
        <div class="detail-card-depth" aria-hidden="true"></div>
        <div class="detail-card-content">
          <div class="detail-title">${escHtml(title)}</div>
          ${artist ? `<div class="detail-artist">${escHtml(artist)}</div>` : ''}
          ${difficulty ? `<span class="diff-badge diff-${escHtml(difficulty.toLowerCase())}" style="margin-bottom:16px;display:inline-block">${escHtml(difficulty)}</span>` : ''}
          <div class="preview-panel">
          <div id="previewStatus" class="preview-status" role="status" aria-live="polite">
            <span class="material-symbols-rounded">graphic_eq</span>
            <span>${t('maps.previewHint')}</span>
          </div>
          <button id="previewToggle" class="preview-toggle" type="button">
            <span class="material-symbols-rounded">play_arrow</span>
            <span>${t('maps.preview')}</span>
          </button>
          </div>
          <div class="preview-progress" aria-label="Postęp preview">
            <div class="preview-progress-track"><div id="previewProgressFill" class="preview-progress-fill"></div></div>
            <div class="preview-progress-meta"><span>${t('maps.previewDuration')}</span><span id="previewProgressTime">30s</span></div>
          </div>
          <div class="preview-volume-row">
            <label for="previewVolume">${t('maps.previewVolume')}</label>
            <input id="previewVolume" type="range" min="0" max="100" step="1" value="${musicPercent}">
            <span id="previewVolumeValue">${musicPercent}%</span>
          </div>
          <div class="detail-stats">
            <div class="detail-stat"><div class="detail-stat-label">${t('maps.statTime')}</div><div class="detail-stat-value">${escHtml(duration)}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">${t('maps.statBeats')}</div><div class="detail-stat-value">${beats}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">BPM</div><div class="detail-stat-value">${escHtml(bpm)}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">${t('maps.statSource')}</div><div class="detail-stat-value" style="font-size:12px">${isLocal ? t('maps.sourceLocal') : t('maps.sourceServer')}</div></div>
          </div>
          <div class="detail-divider"></div>
          ${scoreSection}
        </div>
      </div>
    </div>
    <div class="detail-actions">
      <a class="btn-play" href="${withDevQuery(`./beat-sabers-3d.html?map=${encodeURIComponent(map.id)}`)}"><span class="material-symbols-rounded">play_arrow</span>${t('maps.playBtn')}</a>
      <div class="detail-secondary-actions">
        <button class="btn-secondary favorite-toggle${favorite ? ' is-favorite' : ''}" id="btnFavoriteMap" data-id="${attr(map.id)}" type="button" aria-pressed="${favorite}" title="${attr(t(favorite ? 'maps.favoriteRemove' : 'maps.favoriteAdd'))}"><span class="material-symbols-rounded">star</span>${t(favorite ? 'maps.favoriteRemove' : 'maps.favoriteAdd')}</button>
        <a class="btn-secondary" href="${withDevQuery(`./map-creator.html?id=${encodeURIComponent(map.id)}`)}"><span class="material-symbols-rounded">edit</span>${t('maps.editBtn')}</a>
        <button class="btn-secondary" id="btnExport" data-id="${attr(map.id)}"><span class="material-symbols-rounded">download</span>${t('maps.exportBtn')}</button>
        <button class="btn-secondary danger" id="btnDelete" data-id="${attr(map.id)}" data-server="${canDeleteServer ? '1' : '0'}"><span class="material-symbols-rounded">delete</span>${t('maps.deleteBtn')}</button>
      </div>
    </div>`;
}
