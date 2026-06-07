import { getJSZip } from '../jszip-loader.ts';
import { AUDIO_EXT_RE, assertFileSize, normalizeMap, validateZipEntryNames } from '../core/map-format.ts';
import { validateAudioFile, validateDecodedAudio } from '../core/audio-validation.ts';
import { markOverlaps, removeBeatByReference, removeBeatsByReference, sortBeatsByTime } from '../core/creator-rules.ts';
import { cutButtonText, CUT_SYMBOLS, normalizeCutDirection, nextCutDirection } from './cut-ui.ts';
import { showAlert, showConfirm, showToast } from './dialogs.ts';
import { saveLocalMap, getLocalMapById, saveLocalMapAudio, loadLocalMapAudio } from '../core/localstore.js';
// ══════════════════════════════════════════════════════════════════
//  MAP CREATOR — główna logika
// ══════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────
const MAP_ID = () => `map-${Date.now()}`;
let map = {
  formatVersion: 1,
  id:    MAP_ID(),
  meta:  { title: '', duration: 0 },
  beats: [],      // { t, side, type, cut }  type: 'block'|'bomb', cut: 'any'|'down'|'up'...
};
let activeCut = 'any';
let audioBuffer  = null;
let audioArrayBuffer = null;
let audioFileName = '';
let audioMimeType = '';
let audioCtx     = null;
let audioSource  = null;
let audioGain    = null;
const CREATOR_VOLUME_KEY = 'hs_creator_song_volume';
let songVolume = readCreatorSongVolume();
let isPlaying    = false;
let playStartAt  = 0;   // audioCtx.currentTime gdy startowało
let playOffset   = 0;   // sekunda w pliku od której startowało
let currentTime  = 0;   // aktualna pozycja w pliku (sekundy)

// Timeline
let pxPerSec     = 80;     // domyślnie ~10s na ekran 800px
let viewStart    = 0;      // lewa krawędź widoku (sekundy)
let selectedBeats= new Set();
let dragBeat     = null;
let dragOffsetT  = 0;
let isDragging   = false;

// Undo/Redo
const undoStack  = [];
const redoStack  = [];
const MAX_UNDO   = 60;

// Autosave
let autosaveTimer = null;
let lastSavedAt   = null;

// Tap flash timer
let tapFlashTimer = null;

// ── Snap ──────────────────────────────────────────────────────────
const SNAP_VALUES = [null, 0.25, 0.5, 1.0]; // null = wył
let snapIdx = 0;
function getSnap() { return SNAP_VALUES[snapIdx]; }
function snapTime(t) {
  const s = getSnap();
  return s ? Math.round(t / s) * s : t;
}
function cycleSnap() {
  snapIdx = (snapIdx + 1) % SNAP_VALUES.length;
  const s = getSnap();
  document.getElementById('btnSnap').textContent = s ? `SNAP: ${s}s` : 'SNAP: WYŁ';
  document.getElementById('btnSnap').classList.toggle('active', !!s);
  document.getElementById('stSnap').textContent  = s ? `${s}s` : 'wył';
}

// ── Loop region ───────────────────────────────────────────────────
let loopEnabled = false;
let loopStart   = null;  // sekundy
let loopEnd     = null;
let loopDragging = null; // 'start' | 'end' | null

function toggleLoop() {
  loopEnabled = !loopEnabled;
  const btn = document.getElementById('btnLoop');
  btn.textContent = loopEnabled ? 'LOOP: WŁ' : 'LOOP: WYŁ';
  btn.classList.toggle('active', loopEnabled);
  if (loopEnabled && loopStart === null) {
    // Domyślnie zaznacz 2 sekundy od bieżącej pozycji
    loopStart = currentTime;
    loopEnd   = Math.min(currentTime + 4, map.meta.duration);
  }
}

// ── Copy / paste ──────────────────────────────────────────────────
let clipboard = [];  // kopia beatów (relatywne t od minimum)

// ── DOM refs ──────────────────────────────────────────────────────
const dropZone       = document.getElementById('dropZone');
const dropBox        = document.getElementById('dropBox');
const fileInput      = document.getElementById('fileInput');
const waveCanvas     = document.getElementById('waveCanvas');
const timelineCanvas = document.getElementById('timelineCanvas');
const rulerCanvas    = document.getElementById('rulerCanvas');
const playheadEl     = document.getElementById('playhead');
const precountEl     = document.getElementById('precount');
const precountNumEl  = document.getElementById('precountNum');
const timecodeEl     = document.getElementById('timecode');
const cutBtn         = document.getElementById('btnCutDirection');
const songVolumeEl   = document.getElementById('songVolume');
const songVolumeVal  = document.getElementById('songVolumeValue');
const songNameEl     = document.getElementById('songName');
const songDurEl      = document.getElementById('songDuration');
const autosaveLbl    = document.getElementById('autosaveLabel');
const warningMsg     = document.getElementById('warningMsg');
const stBeats        = document.getElementById('stBeats');
const stLeft         = document.getElementById('stLeft');
const stRight        = document.getElementById('stRight');
const stRand         = document.getElementById('stRand');
const stBombs        = document.getElementById('stBombs');
const stZoom         = document.getElementById('stZoom');

// ── Audio ─────────────────────────────────────────────────────────
function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}

function readCreatorSongVolume() {
  const raw = Number(localStorage.getItem(CREATOR_VOLUME_KEY));
  return clamp01(Number.isFinite(raw) ? raw : 0.5);
}

function updateRangeProgress(input) {
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, pct))}%`);
}

function setCreatorSongVolume(nextVolume, { persist = true } = {}) {
  songVolume = clamp01(nextVolume);
  if (audioGain) audioGain.gain.value = songVolume;
  if (songVolumeEl) {
    songVolumeEl.value = String(Math.round(songVolume * 100));
    updateRangeProgress(songVolumeEl);
  }
  if (songVolumeVal) songVolumeVal.textContent = `${Math.round(songVolume * 100)}%`;
  if (persist) localStorage.setItem(CREATOR_VOLUME_KEY, String(songVolume));
}

function initAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (!audioGain) {
    audioGain = audioCtx.createGain();
    audioGain.gain.value = songVolume;
    audioGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

async function decodeAndAttachAudio(arrayBuffer, { fileName = 'audio', mimeType = 'application/octet-stream', updateTitle = true, keepMapId = false } = {}) {
  initAudioCtx();
  audioArrayBuffer = arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer;
  audioFileName = fileName;
  audioMimeType = mimeType;
  try {
    audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer.slice ? audioArrayBuffer.slice(0) : audioArrayBuffer);
    validateDecodedAudio(audioBuffer);
  } catch (err) {
    audioBuffer = null;
    audioArrayBuffer = null;
    throw new Error(`Nie udało się zdekodować audio: ${err.message}`);
  }

  if (!keepMapId) map.id = MAP_ID();
  map.formatVersion = map.formatVersion || 1;
  if (updateTitle && !map.meta?.title) map.meta.title = fileName.replace(/\.[^.]+$/, '');
  map.meta = { ...(map.meta || {}), duration: audioBuffer.duration, audioFile: audioFileName };

  songNameEl.textContent = map.meta.title || audioFileName;
  songDurEl.textContent  = formatTime(audioBuffer.duration);
  drawWaveform();
  dropZone.classList.add('hidden');
  await saveLocalMapAudio(map.id, audioArrayBuffer.slice ? audioArrayBuffer.slice(0) : audioArrayBuffer, { fileName: audioFileName, mimeType: audioMimeType });
  scheduleAutosave();
  renderAll();
}

async function loadAudioFile(file) {
  validateAudioFile(file);
  map.meta.title = file.name.replace(/\.[^.]+$/, '');
  await decodeAndAttachAudio(await file.arrayBuffer(), { fileName: file.name, mimeType: file.type || 'application/octet-stream' });
}

async function restoreAudioForCurrentMap() {
  if (!map?.id) return false;

  try {
    const rec = await loadLocalMapAudio(map.id);
    if (rec?.arrayBuffer) {
      await decodeAndAttachAudio(rec.arrayBuffer, {
        fileName: rec.fileName || map.meta?.audioFile || 'audio',
        mimeType: rec.mimeType || 'application/octet-stream',
        updateTitle: false,
        keepMapId: true,
      });
      autosaveLbl.textContent = `audio przywrócone lokalnie: ${new Date().toLocaleTimeString()}`;
      return true;
    }
  } catch (e) {
    console.warn('Local audio restore failed:', e);
  }

  try {
    const audioUrl = map.meta?.audioUrl || `/api/maps/${encodeURIComponent(map.id)}/audio`;
    const res = await fetch(audioUrl);
    if (!res.ok) return false;
    await decodeAndAttachAudio(await res.arrayBuffer(), {
      fileName: map.meta?.audioFile || 'audio',
      mimeType: res.headers.get('content-type') || 'application/octet-stream',
      updateTitle: false,
      keepMapId: true,
    });
    autosaveLbl.textContent = `audio pobrane z serwera: ${new Date().toLocaleTimeString()}`;
    return true;
  } catch (e) {
    console.warn('Server audio restore failed:', e);
    return false;
  }
}

function playAudio(fromSec) {
  if (!audioBuffer || !audioCtx) return;
  stopAudio();
  audioSource  = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioGain || audioCtx.destination);
  audioSource.onended = () => {
    if (!isPlaying) return;
    stopAudio(false);
    currentTime = map.meta.duration || audioBuffer.duration || currentTime;
    viewStart = Math.max(0, currentTime - timelineCanvas.width / pxPerSec * 0.78);
    requestTimelineRender();
  };
  playOffset  = fromSec;
  playStartAt = audioCtx.currentTime;
  audioSource.start(0, fromSec);
  isPlaying   = true;
  document.getElementById('btnPlay').innerHTML = '<span class="material-symbols-rounded inline-icon">pause</span>PAUSE';
}

function pauseAudio() {
  if (!isPlaying) return;
  currentTime = getPlayPos();
  stopAudio(false);
  document.getElementById('btnPlay').innerHTML = '<span class="material-symbols-rounded inline-icon">play_arrow</span>PLAY';
}

function stopAudio(reset = true) {
  if (audioSource) {
    try { audioSource.stop(); } catch {}
    audioSource = null;
  }
  isPlaying = false;
  if (reset) { currentTime = 0; viewStart = 0; }
  document.getElementById('btnPlay').innerHTML = '<span class="material-symbols-rounded inline-icon">play_arrow</span>PLAY';
}

function getPlayPos() {
  if (!isPlaying || !audioCtx) return currentTime;
  return playOffset + (audioCtx.currentTime - playStartAt);
}

function seekTo(sec) {
  const wasPlaying = isPlaying;
  currentTime = Math.max(0, Math.min(sec, map.meta.duration));
  if (wasPlaying) playAudio(currentTime);
  renderAll();
}

let timelineDirty = true;
function requestTimelineRender() { timelineDirty = true; }

// ── Waveform ──────────────────────────────────────────────────────
function drawWaveform() {
  if (!audioBuffer) return;
  const w = waveCanvas.width, h = waveCanvas.height;
  const ctx = waveCanvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#02050b';
  ctx.fillRect(0, 0, w, h);

  const data    = audioBuffer.getChannelData(0);
  const step    = Math.ceil(data.length / w);
  const mid     = h / 2;
  const dur     = audioBuffer.duration;

  ctx.strokeStyle = 'rgba(47,124,255,0.5)';
  ctx.lineWidth   = 1;
  ctx.beginPath();

  for (let x = 0; x < w; x++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const s = data[x * step + j] ?? 0;
      if (s < min) min = s;
      if (s > max) max = s;
    }
    ctx.moveTo(x, mid + min * mid * 0.9);
    ctx.lineTo(x, mid + max * mid * 0.9);
  }
  ctx.stroke();
}

// ── Timeline render ───────────────────────────────────────────────
function renderAll() {
  timelineDirty = false;
  renderRuler();
  renderTimeline();
  renderPlayhead();
  updateTimecode();
  updateStatus();
}

function renderRuler() {
  const canvas = rulerCanvas;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(5,7,13,0.95)';
  ctx.fillRect(0, 0, w, h);

  const secInView  = w / pxPerSec;
  const startSec   = viewStart;
  const endSec     = viewStart + secInView;

  // Siatka — dobierz interwał do zooma
  let interval = 1;
  if (pxPerSec < 20)  interval = 10;
  else if (pxPerSec < 40) interval = 5;
  else if (pxPerSec > 200) interval = 0.5;

  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.fillStyle   = 'rgba(148,163,184,0.55)';
  ctx.font        = '9px JetBrains Mono';
  ctx.textAlign   = 'center';
  ctx.lineWidth   = 1;

  let t = Math.floor(startSec / interval) * interval;
  while (t <= endSec + interval) {
    const x = Math.round((t - viewStart) * pxPerSec);
    if (x >= 0 && x <= w) {
      ctx.beginPath();
      ctx.moveTo(x, h - 6);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(formatTime(t), x, h - 8);
    }
    t += interval;
  }

  // Linia dolna
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.beginPath();
  ctx.moveTo(0, h - 1);
  ctx.lineTo(w, h - 1);
  ctx.stroke();
}

function renderTimeline() {
  const canvas = timelineCanvas;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#030610';
  ctx.fillRect(0, 0, w, h);

  const RULER_H = 24;
  const BEAT_H  = 20;
  const BEAT_Y  = RULER_H + (h - RULER_H) / 2 - BEAT_H / 2;
  const secInView = w / pxPerSec;

  // Linie BPM (tło)
  // (brak sztywnego BPM w mapie — linie co 0.5s jako orientacja)
  ctx.strokeStyle = 'rgba(47,124,255,0.07)';
  ctx.lineWidth   = 1;
  let t = Math.floor(viewStart / 0.5) * 0.5;
  while (t <= viewStart + secInView) {
    const x = (t - viewStart) * pxPerSec;
    ctx.beginPath();
    ctx.moveTo(x, RULER_H);
    ctx.lineTo(x, h);
    ctx.stroke();
    t += 0.5;
  }

  // Torki L / R
  const TRACK_H   = Math.floor((h - RULER_H - 8) / 3);
  const TRACK_L_Y = RULER_H + 4;
  const TRACK_R_Y = TRACK_L_Y + TRACK_H + 4;
  const TRACK_B_Y = TRACK_R_Y + TRACK_H + 4;

  drawTrackBg(ctx, w, TRACK_L_Y, TRACK_H, 'rgba(54,242,161,0.04)', 'LEWO');
  drawTrackBg(ctx, w, TRACK_R_Y, TRACK_H, 'rgba(47,124,255,0.04)', 'PRAWO');
  drawTrackBg(ctx, w, TRACK_B_Y, TRACK_H, 'rgba(255,58,58,0.04)',  'BOMBY');

  // Beaty
  for (const beat of map.beats) {
    const x = (beat.t - viewStart) * pxPerSec;
    if (x < -20 || x > w + 20) continue;

    const isBomb   = beat.type === 'bomb';
    const trackY   = isBomb ? TRACK_B_Y : beat.side === 'left' ? TRACK_L_Y : beat.side === 'right' ? TRACK_R_Y : TRACK_L_Y;
    const color    = isBomb ? '#ff3a3a' : beat.side === 'left' ? '#36f2a1' : beat.side === 'right' ? '#2f7cff' : '#94a3b8';
    const selected = selectedBeats.has(beat);

    ctx.fillStyle = selected ? '#ffffff' : color;
    ctx.strokeStyle= selected ? '#ffffff' : color;
    ctx.globalAlpha= selected ? 1 : 0.85;

    const bw = Math.max(8, Math.min(22, pxPerSec * 0.18));
    const bh = TRACK_H - 8;
    const bx = x - bw / 2;
    const by = trackY + 4;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 3);
    ctx.fill();

    if (!isBomb) {
      const cut = normalizeCutDirection(beat.cut);
      if (cut !== 'any') {
        ctx.fillStyle = '#02050b';
        ctx.font = `bold ${Math.max(10, Math.min(18, bh * 0.58))}px JetBrains Mono`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(CUT_SYMBOLS[cut] || '•', x, by + bh / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Ostrzeżenie o nakładaniu
    if (beat._overlap) {
      ctx.fillStyle   = '#ffaa44';
      ctx.font        = 'bold 10px JetBrains Mono';
      ctx.textAlign   = 'center';
      ctx.fillText('!', x, by - 2);
    }

    ctx.globalAlpha = 1;
  }

  // Linia odtwarzania (cień playheada w timeline)
  const pos = getPlayPos();
  const px  = (pos - viewStart) * pxPerSec;
  if (px >= 0 && px <= w) {
    ctx.strokeStyle = 'rgba(226,232,240,0.25)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px, RULER_H);
    ctx.lineTo(px, h);
    ctx.stroke();
  }

  // Loop region overlay
  if (loopEnabled && loopStart !== null && loopEnd !== null) {
    const lx1 = (loopStart - viewStart) * pxPerSec;
    const lx2 = (loopEnd   - viewStart) * pxPerSec;
    ctx.fillStyle   = 'rgba(54,242,161,0.07)';
    ctx.fillRect(Math.max(0, lx1), RULER_H, Math.min(w, lx2) - Math.max(0, lx1), h - RULER_H);
    ctx.strokeStyle = 'rgba(54,242,161,0.5)';
    ctx.lineWidth   = 1.5;
    if (lx1 >= 0 && lx1 <= w) {
      ctx.beginPath(); ctx.moveTo(lx1, RULER_H); ctx.lineTo(lx1, h); ctx.stroke();
      ctx.fillStyle = 'rgba(54,242,161,0.8)';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText('◀ LOOP', lx1 + 3, RULER_H + 14);
    }
    if (lx2 >= 0 && lx2 <= w) {
      ctx.beginPath(); ctx.moveTo(lx2, RULER_H); ctx.lineTo(lx2, h); ctx.stroke();
      ctx.fillStyle = 'rgba(54,242,161,0.8)';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.fillText('LOOP', lx2 - 3, RULER_H + 14);
    }
  }
}

function drawTrackBg(ctx, w, y, h, fill, label) {
  ctx.fillStyle   = fill;
  ctx.fillRect(0, y, w, h);
  ctx.strokeStyle = 'rgba(148,163,184,0.08)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(0, y, w, h);
  ctx.fillStyle   = 'rgba(148,163,184,0.2)';
  ctx.font        = '9px JetBrains Mono';
  ctx.textAlign   = 'left';
  ctx.fillText(label, 6, y + h / 2 + 3);
}

function renderPlayhead() {
  const pos = getPlayPos();
  const w   = timelineCanvas.width;
  const x   = (pos - viewStart) * pxPerSec;
  playheadEl.style.transform = `translateX(${x}px)`;
}

function updateTimecode() {
  const t = getPlayPos();
  timecodeEl.textContent = formatTime(t, true);
}

// ── Loop ──────────────────────────────────────────────────────────
let rafId = null;

function startLoop() {
  if (rafId) return;
  function tick() {
    if (isPlaying) {
      currentTime = getPlayPos();
      // Auto-scroll gdy playhead wychodzi poza widok
      const w  = timelineCanvas.width;
      const px = (currentTime - viewStart) * pxPerSec;
      if (px > w * 0.78) viewStart = currentTime - (w * 0.22) / pxPerSec;
      if (px < 0)        viewStart = currentTime;
      viewStart = Math.max(0, viewStart);

      // Koniec pliku
      if (currentTime >= map.meta.duration && map.meta.duration > 0) {
        stopAudio(false);
        currentTime = map.meta.duration;
      }

      // Loop region
      if (loopEnabled && loopEnd !== null && currentTime >= loopEnd) {
        playAudio(loopStart ?? 0);
      }
    }
    if (isPlaying || timelineDirty) renderAll();
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

startLoop();

// ── Resize canvas ─────────────────────────────────────────────────
function resizeCanvases() {
  const wrap = document.getElementById('timelineWrap');
  const ww   = wrap.clientWidth;
  const wh   = wrap.clientHeight;

  waveCanvas.width    = waveCanvas.clientWidth;
  waveCanvas.height   = waveCanvas.clientHeight;
  timelineCanvas.width= ww;
  timelineCanvas.height= wh;
  rulerCanvas.width   = ww;
  rulerCanvas.height  = 24;

  if (audioBuffer) drawWaveform();
  renderAll();
}

window.addEventListener('resize', resizeCanvases);
resizeCanvases();

// ── Tap ───────────────────────────────────────────────────────────
function syncCutButton() {
  if (!cutBtn) return;
  cutBtn.textContent = cutButtonText(activeCut);
  cutBtn.classList.toggle('active', activeCut !== 'any');
}

function setActiveCut(cut) {
  activeCut = normalizeCutDirection(cut);
  syncCutButton();
}

function cycleCutForSelectionOrTap() {
  pushUndo();
  if (selectedBeats.size) {
    for (const beat of selectedBeats) {
      if (beat.type !== 'bomb') beat.cut = nextCutDirection(beat.cut);
    }
    checkOverlaps();
    scheduleAutosave();
    renderAll();
    return;
  }
  setActiveCut(nextCutDirection(activeCut));
}

cutBtn?.addEventListener('click', cycleCutForSelectionOrTap);
syncCutButton();

function tapBeat(side) {
  if (!isPlaying) return;
  const t = snapTime(getPlayPos());
  pushUndo();
  map.beats.push({ t, side, type: 'block', cut: activeCut });
  sortBeatsByTime(map.beats);
  checkOverlaps();
  flashTap(side);
  scheduleAutosave();
}

function tapBomb() {
  if (!isPlaying) return;
  const t    = snapTime(getPlayPos());
  pushUndo();
  const side = Math.random() < 0.5 ? 'left' : 'right';
  map.beats.push({ t, side, type: 'bomb' });
  sortBeatsByTime(map.beats);
  flashTap('bomb');
  scheduleAutosave();
}

function flashTap(side) {
  const el = document.getElementById('tapFlash');
  el.className = side === 'left' ? 'flash-left' : side === 'right' ? 'flash-right' : 'flash-rand';
  if (tapFlashTimer) clearTimeout(tapFlashTimer);
  tapFlashTimer = setTimeout(() => { el.className = ''; }, 80);
}

function checkOverlaps() {
  const hasOverlap = markOverlaps(map.beats, 0.08);
  warningMsg.innerHTML = hasOverlap ? '<span class="material-symbols-rounded inline-icon">warning</span>Niektóre bloki są za blisko siebie' : '';
  return hasOverlap;
}

// ── Undo / Redo ───────────────────────────────────────────────────
function pushUndo() {
  undoStack.push(JSON.stringify(map.beats));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(map.beats));
  map.beats = sortBeatsByTime(JSON.parse(undoStack.pop()));
  selectedBeats.clear();
  checkOverlaps();
  renderAll();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(map.beats));
  map.beats = sortBeatsByTime(JSON.parse(redoStack.pop()));
  selectedBeats.clear();
  checkOverlaps();
  renderAll();
}

// ── Timeline mouse ────────────────────────────────────────────────
let selectBox = null;
let selectStart = null;

timelineCanvas.addEventListener('mousedown', e => {
  const x   = e.offsetX;
  const t   = viewStart + x / pxPerSec;
  const beat= hitTestBeat(x, e.offsetY);

  // Loop region: Shift+click ustawia punkty
  if (e.shiftKey && !beat && loopEnabled) {
    const mid = loopStart !== null && loopEnd !== null
      ? (loopStart + loopEnd) / 2 : currentTime;
    if (t < mid) loopStart = snapTime(t);
    else          loopEnd   = snapTime(t);
    if (loopStart > loopEnd) [loopStart, loopEnd] = [loopEnd, loopStart];
    renderAll();
    return;
  }

  if (e.button === 2 && beat) {
    // Prawy klik — usuń
    pushUndo();
    removeBeatByReference(map.beats, beat);
    selectedBeats.delete(beat);
    checkOverlaps();
    scheduleAutosave();
    renderAll();
    return;
  }

  if (beat) {
    if (!e.shiftKey) selectedBeats.clear();
    selectedBeats.add(beat);
    dragBeat    = beat;
    dragOffsetT = t - beat.t;
    isDragging  = false;
    requestTimelineRender();
  } else {
    selectedBeats.clear();
    dragBeat = null;
    // Seek
    seekTo(t);
  }
});

timelineCanvas.addEventListener('mousemove', e => {
  if (!dragBeat) return;
  isDragging = true;
  const raw = viewStart + e.offsetX / pxPerSec - dragOffsetT;
  dragBeat.t = snapTime(Math.max(0, Math.min(raw, map.meta.duration)));
  requestTimelineRender();
});

timelineCanvas.addEventListener('mouseup', e => {
  if (isDragging) {
    sortBeatsByTime(map.beats);
    checkOverlaps();
    scheduleAutosave();
    renderAll();
  }
  dragBeat   = null;
  isDragging = false;
});

timelineCanvas.addEventListener('contextmenu', e => e.preventDefault());

// Scroll — przewijanie osi czasu
timelineCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey) {
    // Ctrl+scroll = zoom
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    const mouseT = viewStart + e.offsetX / pxPerSec;
    pxPerSec = Math.max(8, Math.min(800, pxPerSec * factor));
    viewStart = mouseT - e.offsetX / pxPerSec;
    viewStart = Math.max(0, viewStart);
  } else {
    // Scroll normalny = przewijanie
    viewStart += (e.deltaY / 100) * (10 / pxPerSec * 20);
    viewStart  = Math.max(0, viewStart);
  }
  updateZoomLabel();
  renderAll();
}, { passive: false });

// Waveform seek
waveCanvas.addEventListener('click', e => {
  if (!audioBuffer) return;
  const ratio = e.offsetX / waveCanvas.width;
  seekTo(ratio * audioBuffer.duration);
});

function hitTestBeat(mx, my) {
  const w  = timelineCanvas.width;
  const h  = timelineCanvas.height;
  const RULER_H = 24;
  const TRACK_H = Math.floor((h - RULER_H - 8) / 3);
  const TRACK_L_Y = RULER_H + 4;
  const TRACK_R_Y = TRACK_L_Y + TRACK_H + 4;
  const TRACK_B_Y = TRACK_R_Y + TRACK_H + 4;

  const bw = Math.max(8, Math.min(22, pxPerSec * 0.18));

  for (const beat of map.beats) {
    const x = (beat.t - viewStart) * pxPerSec;
    if (Math.abs(mx - x) > bw) continue;

    const isBomb = beat.type === 'bomb';
    const ty = isBomb ? TRACK_B_Y : beat.side === 'left' ? TRACK_L_Y : TRACK_R_Y;
    if (my >= ty && my <= ty + TRACK_H) return beat;
  }
  return null;
}

// ── Keyboard ─────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  // Nie tapuj gdy focus w input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.code === 'KeyF') { e.preventDefault(); tapBeat('left');   return; }
  if (e.code === 'KeyJ') { e.preventDefault(); tapBeat('right');  return; }
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.shiftKey) { tapBomb(); return; }
    // Spacja bez shift = random beat LUB play/pause jeśli nie gra
    if (isPlaying) tapBeat(Math.random() < 0.5 ? 'left' : 'right');
    else handlePlay();
    return;
  }
  if (e.code === 'KeyR') { e.preventDefault(); cycleCutForSelectionOrTap(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!selectedBeats.size) return;
    pushUndo();
    map.beats = removeBeatsByReference(map.beats, selectedBeats);
    selectedBeats.clear();
    checkOverlaps();
    scheduleAutosave();
    renderAll();
    return;
  }
  if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); saveMap(); return; }

  // Copy
  if (e.ctrlKey && e.code === 'KeyC') {
    e.preventDefault();
    if (!selectedBeats.size) return;
    const sorted = [...selectedBeats].sort((a, b) => a.t - b.t);
    const minT   = sorted[0].t;
    clipboard    = sorted.map(b => ({ ...b, t: b.t - minT }));
    return;
  }

  // Paste
  if (e.ctrlKey && e.code === 'KeyV') {
    e.preventDefault();
    if (!clipboard.length) return;
    pushUndo();
    const pasteAt = currentTime;
    const pasted  = clipboard.map(b => ({ ...b, t: snapTime(pasteAt + b.t) }));
    map.beats.push(...pasted);
    sortBeatsByTime(map.beats);
    selectedBeats.clear();
    pasted.forEach(b => selectedBeats.add(b));
    checkOverlaps();
    scheduleAutosave();
    renderAll();
    return;
  }

  // Select all
  if (e.ctrlKey && e.code === 'KeyA') {
    e.preventDefault();
    map.beats.forEach(b => selectedBeats.add(b));
    renderAll();
    return;
  }
});

// ── Play / Stop / Pre-count ───────────────────────────────────────
let precountTimer = null;

function handlePlay() {
  if (!audioBuffer) return;
  if (precountTimer) { cancelPrecount(); return; }
  if (isPlaying) { pauseAudio(); return; }
  startPrecount();
}

function cancelPrecount() {
  if (precountTimer) {
    clearInterval(precountTimer);
    precountTimer = null;
  }
  precountEl.classList.remove('show');
}

function startPrecount() {
  if (precountTimer || isPlaying) return;
  precountEl.classList.add('show');
  let n = 4;
  precountNumEl.textContent = n;
  precountTimer = setInterval(() => {
    n--;
    if (n <= 0) {
      cancelPrecount();
      playAudio(currentTime);
    } else {
      precountNumEl.textContent = n;
      precountNumEl.style.animation = 'none';
      precountNumEl.offsetHeight;
      precountNumEl.style.animation = 'precountPulse 1s ease-out';
    }
  }, 1000);
}

songVolumeEl?.addEventListener('input', () => {
  setCreatorSongVolume(Number(songVolumeEl.value) / 100);
});
setCreatorSongVolume(songVolume, { persist: false });

document.getElementById('btnPlay').addEventListener('click', handlePlay);
document.getElementById('btnStop').addEventListener('click', () => {
  cancelPrecount();
  stopAudio(true);
  currentTime = 0;
  viewStart   = 0;
});

// ── Zoom buttons ──────────────────────────────────────────────────
document.getElementById('zoomIn').addEventListener('click',  () => { pxPerSec = Math.min(800, pxPerSec * 1.5); updateZoomLabel(); });
document.getElementById('zoomOut').addEventListener('click', () => { pxPerSec = Math.max(8,   pxPerSec / 1.5); updateZoomLabel(); });

function updateZoomLabel() {
  const secInView = timelineCanvas.width / pxPerSec;
  stZoom.textContent = `${secInView.toFixed(1)}s`;
}

// ── Undo/Redo buttons ─────────────────────────────────────────────
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnSnap').addEventListener('click', cycleSnap);
document.getElementById('btnLoop').addEventListener('click', toggleLoop);

// ── Save / Export / Test ──────────────────────────────────────────
async function saveMapToServer(mapToSave) {
  const fd = new FormData();
  fd.append('map', JSON.stringify(mapToSave));

  if (audioArrayBuffer) {
    const audioBytes = audioArrayBuffer.slice ? audioArrayBuffer.slice(0) : audioArrayBuffer;
    const audioBlob = new Blob([audioBytes], { type: audioMimeType || 'application/octet-stream' });
    fd.append('audio', audioBlob, audioFileName || mapToSave.meta?.audioFile || `${mapToSave.id}.ogg`);
  }

  const res = await fetch('/api/maps/save', { method: 'POST', body: fd });
  const payload = await res.json().catch(async () => ({ error: await res.text() }));
  if (!res.ok) throw new Error(payload?.error || `${res.status} ${res.statusText}`);
  return payload;
}

function downloadMapJsonFallback(mapToDownload) {
  const json = JSON.stringify(mapToDownload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${mapToDownload.meta?.title || 'map'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveMap() {
  map = normalizeMap(map, { fallbackId: map.id, requireBeats: false });
  saveLocalMap(map);
  if (audioArrayBuffer) {
    await saveLocalMapAudio(map.id, audioArrayBuffer.slice ? audioArrayBuffer.slice(0) : audioArrayBuffer, { fileName: audioFileName, mimeType: audioMimeType });
  }

  try {
    const saved = await saveMapToServer(map);
    if (saved?.map) {
      map = normalizeMap(saved.map, { fallbackId: map.id, requireBeats: false });
      saveLocalMap(map);
    }
    lastSavedAt = new Date();
    autosaveLbl.textContent = `zapisano na serwerze: ${lastSavedAt.toLocaleTimeString()} (${saved.id})`;
    showToast('Mapa zapisana na serwerze', { type:'success' });
  } catch (err) {
    downloadMapJsonFallback(map);
    lastSavedAt = new Date();
    autosaveLbl.textContent = `zapis lokalny/export JSON: ${lastSavedAt.toLocaleTimeString()} — ${err.message}`;
    showToast('Serwer niedostępny — pobrałem JSON jako kopię', { type:'error' });
  }
}

async function exportZip() {
  try {
    const JSZip = await getJSZip();
    map = normalizeMap(map, { fallbackId: map.id, requireBeats: false });
    const zip  = new JSZip();
    zip.file('map.json', JSON.stringify(map, null, 2));
    if (audioArrayBuffer) {
      zip.file(audioFileName || map.meta?.audioFile || 'audio.bin', audioArrayBuffer.slice ? audioArrayBuffer.slice(0) : audioArrayBuffer);
    } else {
      const restored = await restoreAudioForCurrentMap();
      if (restored && audioArrayBuffer) zip.file(audioFileName || map.meta?.audioFile || 'audio.bin', audioArrayBuffer.slice ? audioArrayBuffer.slice(0) : audioArrayBuffer);
      else if (!await showConfirm('Nie mam audio w pamięci. Wyeksportować ZIP tylko z map.json?', { title:'Eksport bez audio', confirmText:'EKSPORTUJ', cancelText:'ANULUJ' })) return;
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${map.meta.title || 'map'}-${map.id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showAlert('Błąd eksportu ZIP: ' + err.message, { title:'Błąd eksportu' });
  }
}

document.getElementById('btnSave').addEventListener('click', saveMap);
document.getElementById('btnExport').addEventListener('click', exportZip);
function buildGameTestUrl(mapId) {
  const params = new URLSearchParams();
  params.set('map', mapId);
  const current = new URLSearchParams(location.search);
  for (const key of ['dev', 'testing']) {
    if (current.has(key)) params.set(key, current.get(key) || '');
  }
  return `./beat-sabers-3d.html?${params.toString()}`;
}

document.getElementById('btnTest').addEventListener('click', () => {
  saveMap().then(() => {
    window.open(buildGameTestUrl(map.id), '_blank');
  });
});

// ── Autosave ──────────────────────────────────────────────────────
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autoSaveToLocalStorage();
  }, 5000);
}

function autoSaveToLocalStorage() {
  try {
    localStorage.setItem('hs_autosave', JSON.stringify(map));
    saveLocalMap(map);
    if (audioArrayBuffer) saveLocalMapAudio(map.id, audioArrayBuffer.slice ? audioArrayBuffer.slice(0) : audioArrayBuffer, { fileName: audioFileName, mimeType: audioMimeType });
    lastSavedAt = new Date();
    autosaveLbl.textContent = `autosave: ${lastSavedAt.toLocaleTimeString()}`;
  } catch {}
}

// ── File drop ─────────────────────────────────────────────────────
dropBox.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) handleFile(f);
});

document.addEventListener('dragover', e => { e.preventDefault(); dropBox.classList.add('drag-over'); });
document.addEventListener('dragleave', ()=> dropBox.classList.remove('drag-over'));
document.addEventListener('drop', e => {
  e.preventDefault();
  dropBox.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

async function handleFile(file) {
  try {
    assertFileSize(file);
    if (file.type.startsWith('audio/') || AUDIO_EXT_RE.test(file.name)) {
      await loadAudioFile(file);
      showToast('Audio wczytane', { type:'success' });
    } else if (file.name.endsWith('.json')) {
      const text = await file.text();
      const loaded = JSON.parse(text);
      map = normalizeMap({ id: loaded.id || MAP_ID(), ...loaded }, { fallbackId: MAP_ID(), requireBeats: false });
      sortBeatsByTime(map.beats);
      selectedBeats.clear();
      checkOverlaps();
      dropZone.classList.add('hidden');
      songNameEl.textContent = map.meta?.title ?? file.name;
      songDurEl.textContent  = formatTime(map.meta?.duration ?? 0);
      const restored = await restoreAudioForCurrentMap();
      if (!restored) warningMsg.textContent = 'Mapa wczytana bez audio — wrzuć audio lub ZIP.';
      saveLocalMap(map);
      renderAll();
      showToast('Mapa JSON wczytana', { type:'success' });
    } else if (file.name.endsWith('.zip')) {
      await loadZipFile(file);
      showToast('ZIP wczytany', { type:'success' });
    } else {
      throw new Error(`Nieznany format pliku: ${file.name}`);
    }
  } catch (err) {
    warningMsg.textContent = err.message;
    showAlert(err.message, { title:'Nie udało się wczytać pliku' });
  }
}

async function loadZipFile(file) {
  const JSZip = await getJSZip();
  assertFileSize(file);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  validateZipEntryNames(Object.values(zip.files));
  const jsonFile = zip.file('map.json');
  if (!jsonFile) throw new Error('Brak map.json w ZIP');
  const loadedMap = JSON.parse(await jsonFile.async('string'));
  map = normalizeMap({ id: loadedMap.id || MAP_ID(), ...loadedMap }, { fallbackId: MAP_ID(), requireBeats: false });
  sortBeatsByTime(map.beats);
  selectedBeats.clear();
  const audioFile = Object.values(zip.files).find(f => !f.dir && AUDIO_EXT_RE.test(f.name));
  if (audioFile) {
    await decodeAndAttachAudio(await audioFile.async('arraybuffer'), {
      fileName: audioFile.name.split('/').pop(),
      mimeType: 'application/octet-stream',
      updateTitle: false,
      keepMapId: true,
    });
  }
  checkOverlaps();
  dropZone.classList.add('hidden');
  songNameEl.textContent = map.meta?.title ?? file.name;
  songDurEl.textContent  = formatTime(map.meta?.duration ?? audioBuffer?.duration ?? 0);
  saveLocalMap(map);
  renderAll();
}

// ── Status bar ────────────────────────────────────────────────────
function updateStatus() {
  const left  = map.beats.filter(b => b.side === 'left'  && b.type !== 'bomb').length;
  const right = map.beats.filter(b => b.side === 'right' && b.type !== 'bomb').length;
  const rand  = map.beats.filter(b => b.side === 'random').length;
  const bombs = map.beats.filter(b => b.type === 'bomb').length;
  stBeats.textContent = map.beats.length;
  stLeft.textContent  = left;
  stRight.textContent = right;
  stRand.textContent  = rand;
  stBombs.textContent = bombs;
}

// ── Utils ─────────────────────────────────────────────────────────
function formatTime(sec, showMs = false) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms= Math.floor((sec % 1) * 10);
  const base = `${m}:${String(s).padStart(2,'0')}`;
  return showMs ? `${base}.${ms}` : base;
}

// Wczytaj mapę z ?id= lub autosave
async function loadInitialMap() {
  try {
    const urlParams = new URLSearchParams(location.search);
    const mapId     = urlParams.get('id');
    if (mapId) {
      let loaded = null;
      try {
        const r = await fetch(`/api/maps/${encodeURIComponent(mapId)}`);
        if (r.ok) loaded = await r.json();
      } catch {}
      loaded = loaded || getLocalMapById(mapId);
      if (loaded) {
        map = normalizeMap({ formatVersion: 1, id: loaded.id || mapId || MAP_ID(), ...loaded }, { fallbackId: mapId || MAP_ID(), requireBeats: false });
        sortBeatsByTime(map.beats);
        selectedBeats.clear();
        checkOverlaps();
        dropZone.classList.add('hidden');
        songNameEl.textContent = map.meta?.title ?? '—';
        songDurEl.textContent  = formatTime(map.meta?.duration ?? 0);
        await restoreAudioForCurrentMap();
        renderAll();
      }
      return;
    }

    const saved = localStorage.getItem('hs_autosave');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.beats && !audioBuffer) {
        if (await showConfirm(`Znaleziono autosave "${parsed.meta?.title}". Wczytać?`, { title:'Autosave', confirmText:'WCZYTAJ', cancelText:'POMIŃ' })) {
          map = normalizeMap({ formatVersion: 1, id: parsed.id || MAP_ID(), ...parsed }, { fallbackId: MAP_ID(), requireBeats: false });
          sortBeatsByTime(map.beats);
          selectedBeats.clear();
          checkOverlaps();
          dropZone.classList.add('hidden');
          songNameEl.textContent = map.meta?.title ?? '—';
          songDurEl.textContent  = formatTime(map.meta?.duration ?? 0);
          await restoreAudioForCurrentMap();
          renderAll();
        }
      }
    }
  } catch (e) {
    console.warn('Initial map load failed:', e);
  }
}
loadInitialMap();
