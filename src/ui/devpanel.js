import { state } from '../core/state.ts';
import { setSetting, getSettings } from '../core/settings.ts';
import { applyTrackingSettings } from '../tracking/tracking.js';
import { setVolume, setMusicVolume, setSfxVolume, setSoundVolume } from '../game/audio.js';
import { getPerformanceMode, getPerformanceModes } from '../core/performance.ts';
import { THREE, scene, reflectTarget, getScenePerformanceProfile, setScenePerformanceProfile, setWireframeVisible } from '../game/scene.js';

let pane    = null;
let statsJS = null;
let isDev   = false;
let initStarted = false;
let lastRenderer = null;

let devData = {
  fps: 0, frameMs: 0, deltaMs: 0, deltaScale: 1, renderMs: 0, detectMs: 0, latMs: 0, conf: 0,
  drawCalls: 0, triangles: 0, geoMem: 0, texMem: 0, vramMem: 0,
  graphicsMode: '—', graphicsProfile: '—', renderScale: 1, canvasSize: '—', drawingBuffer: '—', gpuRenderer: '—', toneMapping: '—', antialias: '—', shadows: false, reflections: false,
  activeBlocks: 0, activeSparks: 0, pooledBlocks: 0, pooledBombs: 0, pooledShards: 0, combo: 0, score: 0, lives: 0,
  songTime: 0, nearestBeatDeltaMs: 0, audioOffsetMs: 0,
  leftActive: false, rightActive: false, filteredHands: 0, rawHands: 0,
  // config
  wireframe:   false,
  noFail:      false,
  developerMode: false,
  sensitivity: 1.0,
  flipCamera:  false,
  volume:      0.8,
  musicVolume: 1.0,
  sfxVolume:   1.0,
  hitSoundVolume: 0.85,
  comboSoundVolume: 0.55,
  missSoundVolume: 0.75,
  bombSoundVolume: 0.8,
  beatSoundVolume: 0.65,
  milestoneSoundVolume: 0.7,
  audioOffsetMs: 0,
  oneHandMode: 'both',
  performanceMode: 'auto',
};

function isDevModeRequested() {
  const params = new URLSearchParams(location.search);
  return params.has('dev') || params.has('testing') || Boolean(getSettings().developerMode);
}

function setCameraPanelInlineVisibility(enabled) {
  const camPanel = document.getElementById('camPanel');
  if (camPanel) camPanel.style.display = enabled ? '' : 'none';
}

export function isDeveloperPanelEnabled() {
  return isDev;
}

export function setDeveloperPanelEnabled(renderer = lastRenderer, enabled = true) {
  setSetting('developerMode', Boolean(enabled));
  devData.developerMode = Boolean(enabled);

  if (enabled) {
    if (renderer) initDevPanel(renderer, null, { force: true });
    return;
  }

  isDev = false;
  initStarted = false;
  document.body.classList.remove('dev-tools');
  setCameraPanelInlineVisibility(false);
  if (pane?.dispose) pane.dispose();
  pane = null;
  if (statsJS?.dom?.parentNode) statsJS.dom.parentNode.removeChild(statsJS.dom);
  statsJS = null;
}

function notifyTrackingSettings(patch) {
  try {
    applyTrackingSettings(patch);
  } catch (e) {
    console.warn('Tracking settings update failed:', e);
  }
}

function addSeparator(folder) {
  if (typeof folder.addSeparator === 'function') folder.addSeparator();
  else folder.addBlade?.({ view: 'separator' });
}

const BYTES_PER_MB = 1024 * 1024;
const drawingBufferSize = new THREE.Vector2();
let lastMemorySampleMs = 0;

function mb(bytes) {
  return +(Math.max(0, bytes) / BYTES_PER_MB).toFixed(2);
}

function attributeBytes(attr, seenArrays) {
  if (!attr) return 0;
  const array = attr.isInterleavedBufferAttribute ? attr.data?.array : attr.array;
  if (!array || seenArrays.has(array)) return 0;
  seenArrays.add(array);
  return array.byteLength || 0;
}

function geometryBytes(geometry) {
  if (!geometry) return 0;
  const seenArrays = new Set();
  let bytes = attributeBytes(geometry.index, seenArrays);
  for (const attr of Object.values(geometry.attributes || {})) {
    bytes += attributeBytes(attr, seenArrays);
  }
  for (const attrs of Object.values(geometry.morphAttributes || {})) {
    for (const attr of attrs || []) bytes += attributeBytes(attr, seenArrays);
  }
  return bytes;
}

function collectSceneTextures(root) {
  const textures = new Set();
  const addTexture = value => {
    if (value?.isTexture) textures.add(value);
  };
  addTexture(root.background);
  addTexture(root.environment);
  root.traverse?.(obj => {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const value of Object.values(mat)) addTexture(value);
    }
  });
  return textures;
}

function textureChannelCount(format) {
  if (format === THREE.RGBAFormat) return 4;
  if (format === THREE.RGBFormat) return 3;
  if (format === THREE.LuminanceAlphaFormat || format === THREE.RGFormat) return 2;
  return 1;
}

function textureBytesPerChannel(type) {
  if (type === THREE.FloatType || type === THREE.UnsignedIntType || type === THREE.IntType) return 4;
  if (type === THREE.HalfFloatType || type === THREE.ShortType || type === THREE.UnsignedShortType) return 2;
  return 1;
}

function texturePixelBytes(texture) {
  const packed16Bit =
    texture.type === THREE.UnsignedShort4444Type ||
    texture.type === THREE.UnsignedShort5551Type ||
    texture.type === THREE.UnsignedShort565Type;
  if (packed16Bit) return 2;
  return textureChannelCount(texture.format) * textureBytesPerChannel(texture.type);
}

function textureDimensions(texture) {
  const image = texture.image;
  if (Array.isArray(image) && image.length) {
    const first = image[0] || {};
    const width = first.width || first.videoWidth || first.naturalWidth || 0;
    const height = first.height || first.videoHeight || first.naturalHeight || 0;
    return { width, height, faces: image.length };
  }
  return {
    width: image?.width || image?.videoWidth || image?.naturalWidth || 0,
    height: image?.height || image?.videoHeight || image?.naturalHeight || 0,
    faces: 1,
  };
}

function usesMipmaps(texture) {
  return texture.generateMipmaps !== false && [
    THREE.NearestMipmapNearestFilter,
    THREE.NearestMipmapLinearFilter,
    THREE.LinearMipmapNearestFilter,
    THREE.LinearMipmapLinearFilter,
  ].includes(texture.minFilter);
}

function textureBytes(texture) {
  const { width, height, faces } = textureDimensions(texture);
  if (!width || !height) return 0;
  const baseBytes = width * height * faces * texturePixelBytes(texture);
  return usesMipmaps(texture) ? baseBytes * 1.333 : baseBytes;
}

function estimateRenderBufferBytes(renderer) {
  renderer.getDrawingBufferSize(drawingBufferSize);
  const defaultFramebufferBytes = drawingBufferSize.x * drawingBufferSize.y * 8; // RGBA8 + depth/stencil estimate.
  const reflectDepthBytes = reflectTarget.depthBuffer ? reflectTarget.width * reflectTarget.height * 4 : 0;
  return defaultFramebufferBytes + reflectDepthBytes;
}

function sampleGpuMemory(renderer) {
  const geometries = new Set();
  scene.traverse?.(obj => {
    if (obj.geometry) geometries.add(obj.geometry);
  });

  let geoBytes = 0;
  for (const geometry of geometries) geoBytes += geometryBytes(geometry);

  const textures = collectSceneTextures(scene);
  textures.add(reflectTarget.texture);
  let texBytes = 0;
  for (const texture of textures) texBytes += textureBytes(texture);

  const bufferBytes = estimateRenderBufferBytes(renderer);
  return {
    geoMem: mb(geoBytes),
    texMem: mb(texBytes),
    vramMem: mb(geoBytes + texBytes + bufferBytes),
  };
}

function getGpuRendererLabel(renderer) {
  try {
    const gl = renderer.getContext?.();
    if (!gl) return 'WebGL —';
    const ext = gl.getExtension?.('WEBGL_debug_renderer_info');
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const rendererName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return [vendor, rendererName].filter(Boolean).join(' / ') || 'WebGL —';
  } catch {
    return 'WebGL —';
  }
}

function updateRenderingDiagnostics(renderer) {
  const profile = getScenePerformanceProfile();
  const canvas = renderer.domElement;
  const gl = renderer.getContext?.();
  renderer.getDrawingBufferSize(drawingBufferSize);
  devData.graphicsMode = window.__graphicsQualityMode || profile.qualityMode || profile.mode || '—';
  devData.graphicsProfile = window.__graphicsProfile || profile.label || '—';
  devData.renderScale = +(window.__graphicsDpr || renderer.getPixelRatio?.() || 1).toFixed(2);
  devData.canvasSize = `${canvas.clientWidth || canvas.width}×${canvas.clientHeight || canvas.height}`;
  devData.drawingBuffer = `${drawingBufferSize.x}×${drawingBufferSize.y}`;
  devData.toneMapping = String(renderer.toneMappingExposure ?? '—');
  devData.antialias = gl?.getContextAttributes?.().antialias ? 'on' : 'off';
  devData.shadows = Boolean(renderer.shadowMap?.enabled);
  devData.reflections = Boolean(profile.reflections);
  if (devData.gpuRenderer === '—') devData.gpuRenderer = getGpuRendererLabel(renderer);
}

export function initDevPanel(renderer, _unused, options = {}) {
  lastRenderer = renderer || lastRenderer;
  isDev = options.force ? Boolean(getSettings().developerMode) || isDevModeRequested() : isDevModeRequested();
  document.body.classList.toggle('dev-tools', isDev);
  setCameraPanelInlineVisibility(isDev);
  if (!isDev) return;
  if (pane || initStarted) return;
  initStarted = true;

  const settings = getSettings();
  devData.sensitivity = settings.sensitivity;
  devData.flipCamera  = settings.flipCamera;
  devData.noFail      = settings.noFail;
  devData.volume      = settings.volume;
  for (const key of ['musicVolume','sfxVolume','hitSoundVolume','comboSoundVolume','missSoundVolume','bombSoundVolume','beatSoundVolume','milestoneSoundVolume']) {
    devData[key] = settings[key] ?? devData[key];
  }
  devData.audioOffsetMs = settings.audioOffsetMs ?? 0;
  devData.performanceMode = getPerformanceMode(settings);
  devData.developerMode = Boolean(settings.developerMode) || isDev;
  updateRenderingDiagnostics(lastRenderer);

  loadStatsJS().then(Stats => {
    if (!Stats || !isDev) return;
    statsJS = new Stats();
    statsJS.showPanel(0);
    statsJS.dom.classList.add('hs-stats-panel');
    statsJS.dom.title = 'Stats.js - kliknij, aby zmienić widok';
    statsJS.dom.style.cssText = 'position:fixed;top:16px;right:16px;cursor:pointer;z-index:9999;';
    document.body.appendChild(statsJS.dom);
    statsJS.dom.dataset.panel = '0';
    statsJS.dom.addEventListener('click', () => {
      const next = ((statsJS.dom.dataset.panel | 0) + 1) % 3;
      statsJS.showPanel(next);
      statsJS.dom.dataset.panel = next;
    });
  });

  loadTweakpane().then(Pane => {
    if (!Pane || !isDev) return;
    pane = new Pane({ title: 'HAND SABERS DEV', expanded: true });

    const tabs = pane.addTab({ pages: [
      { title: 'PERF'  },
      { title: 'GAME'  },
      { title: 'TRACK' },
      { title: 'CFG'   },
    ]});

    // ── PERF ──
    const perf = tabs.pages[0];
    perf.addMonitor(devData, 'fps',       { label: 'FPS',       view: 'graph', min: 0, max: 240, interval: 500 });
    perf.addMonitor(devData, 'frameMs',   { label: 'Frame ms',  view: 'graph', min: 0, max: 33,  interval: 500 });
    perf.addMonitor(devData, 'deltaMs',   { label: 'Delta ms',  view: 'graph', min: 0, max: 50,  interval: 200 });
    perf.addMonitor(devData, 'deltaScale',{ label: 'Delta x',   interval: 200 });
    perf.addMonitor(devData, 'renderMs',  { label: 'Render ms', interval: 500 });
    perf.addMonitor(devData, 'detectMs',  { label: 'Detect ms', interval: 500 });
    addSeparator(perf);
    perf.addMonitor(devData, 'graphicsMode',    { label: 'Graphics', interval: 500 });
    perf.addMonitor(devData, 'graphicsProfile', { label: 'Profile',  interval: 500 });
    perf.addMonitor(devData, 'renderScale',     { label: 'DPR',      interval: 500 });
    perf.addMonitor(devData, 'canvasSize',      { label: 'CSS px',   interval: 1000 });
    perf.addMonitor(devData, 'drawingBuffer',   { label: 'Render px', interval: 1000 });
    perf.addMonitor(devData, 'gpuRenderer',     { label: 'GPU',      interval: 2000 });
    perf.addMonitor(devData, 'antialias',       { label: 'AA',       interval: 1000 });
    perf.addMonitor(devData, 'reflections',     { label: 'Reflect',  interval: 1000 });
    perf.addMonitor(devData, 'shadows',         { label: 'Shadows',  interval: 1000 });
    addSeparator(perf);
    perf.addMonitor(devData, 'drawCalls', { label: 'Draw calls', interval: 500 });
    perf.addMonitor(devData, 'triangles', { label: 'Triangles',  interval: 500 });
    perf.addMonitor(devData, 'geoMem',    { label: 'Geo MB',     interval: 1000 });
    perf.addMonitor(devData, 'texMem',    { label: 'Texture MB', interval: 1000 });
    perf.addMonitor(devData, 'vramMem',   { label: 'VRAM MB',    interval: 1000 });
    perf.addMonitor(devData, 'vramMem',   { label: 'VRAM graph', view: 'graph', min: 0, max: 256, interval: 1000 });

    // ── GAME ──
    const game = tabs.pages[1];
    game.addMonitor(devData, 'score',        { label: 'Score',   interval: 200 });
    game.addMonitor(devData, 'combo',        { label: 'Combo',   interval: 200 });
    game.addMonitor(devData, 'lives',        { label: 'Lives',   interval: 200 });
    game.addMonitor(devData, 'activeBlocks', { label: 'Blocks',  view: 'graph', min: 0, max: 30, interval: 200 });
    game.addMonitor(devData, 'activeSparks', { label: 'Sparks',  interval: 200 });
    game.addMonitor(devData, 'pooledBlocks', { label: 'Pool blocks', interval: 1000 });
    game.addMonitor(devData, 'pooledBombs',  { label: 'Pool bombs',  interval: 1000 });
    game.addMonitor(devData, 'pooledShards', { label: 'Pool shards', interval: 1000 });
    game.addMonitor(devData, 'songTime', { label: 'Song time', interval: 100 });
    game.addMonitor(devData, 'nearestBeatDeltaMs', { label: 'Beat Δ ms', interval: 100 });

    // ── TRACK ──
    const track = tabs.pages[2];
    track.addMonitor(devData, 'leftActive',    { label: 'L hand' });
    track.addMonitor(devData, 'rightActive',   { label: 'R hand' });
    track.addMonitor(devData, 'conf',          { label: 'Conf',    view: 'graph', min: 0, max: 1, interval: 100 });
    track.addMonitor(devData, 'filteredHands', { label: 'Filtered' });
    track.addMonitor(devData, 'rawHands',      { label: 'Raw' });
    track.addMonitor(devData, 'latMs',         { label: 'Latency', view: 'graph', min: 0, max: 80, interval: 500 });

    // ── CFG ──
    const cfg = tabs.pages[3];
    cfg.addInput(devData, 'wireframe', { label: 'Hitbox wire' }).on('change', ev => {
      setWireframeVisible(ev.value);
    });
    cfg.addInput(devData, 'noFail', { label: 'No Fail' }).on('change', ev => {
      state.noFail = ev.value;
      setSetting('noFail', ev.value);
    });
    cfg.addInput(devData, 'oneHandMode', {
      label: 'One hand',
      options: { Obie: 'both', Lewa: 'left', Prawa: 'right' },
    }).on('change', ev => {
      const val = ev.value === 'both' ? null : ev.value;
      state.oneHandMode = val;
      window.__oneHandMode = val || 'both';
      setSetting('oneHandMode', val);
      notifyTrackingSettings({ oneHandMode: val });
    });
    addSeparator(cfg);
    cfg.addInput(devData, 'performanceMode', {
      label: 'Perf',
      options: Object.fromEntries(getPerformanceModes().map(mode => [mode.label, mode.value])),
    }).on('change', ev => {
      setSetting('performanceMode', ev.value);
      setScenePerformanceProfile({ ...getSettings(), performanceMode: ev.value });
      notifyTrackingSettings({ performanceMode: ev.value });
      devData.performanceMode = getPerformanceMode({ performanceMode: ev.value });
    });
    addSeparator(cfg);
    cfg.addInput(devData, 'sensitivity', { label: 'Sensitivity', min: 0.5, max: 2.0, step: 0.05 }).on('change', ev => {
      setSetting('sensitivity', ev.value);
      notifyTrackingSettings({ sensitivity: ev.value });
    });
    cfg.addInput(devData, 'flipCamera', { label: 'Flip kamera' }).on('change', ev => {
      setSetting('flipCamera', ev.value);
      notifyTrackingSettings({ flipCamera: ev.value });
    });
    cfg.addInput(devData, 'volume', { label: 'Master', min: 0, max: 1, step: 0.05 }).on('change', ev => {
      setSetting('volume', ev.value);
      setVolume(ev.value);
    });
    const audioControls = [
      ['musicVolume', 'Muzyka'],
      ['sfxVolume', 'Efekty'],
      ['hitSoundVolume', 'Trafienie'],
      ['comboSoundVolume', 'Combo'],
      ['missSoundVolume', 'Pudło'],
      ['bombSoundVolume', 'Bomba'],
      ['beatSoundVolume', 'Beat cue'],
      ['milestoneSoundVolume', 'Milestone'],
    ];
    for (const [key, label] of audioControls) {
      cfg.addInput(devData, key, { label, min: 0, max: 1, step: 0.05 }).on('change', ev => {
        setSetting(key, ev.value);
        if (key === 'musicVolume') setMusicVolume(ev.value);
        else if (key === 'sfxVolume') setSfxVolume(ev.value);
        else setSoundVolume(key, ev.value);
      });
    }
    cfg.addInput(devData, 'audioOffsetMs', { label: 'Audio offset ms', min: -500, max: 500, step: 10 }).on('change', ev => {
      setSetting('audioOffsetMs', ev.value);
    });

    const panelEl = pane.element;
    panelEl.classList.add('hs-dev-pane');
    panelEl.setAttribute('aria-label', 'Hand Sabers developer panel');
    panelEl.style.cssText = 'position:fixed;top:16px;left:16px;z-index:9000;width:min(320px,calc(100vw - 32px));';
    makeDraggable(panelEl);
  });
}

let lastPaneRefreshMs = 0;

export function tickDevPanel(renderer, now, renderMs, detectMs, gameStats) {
  if (!isDev) return;
  if (statsJS) statsJS.update();

  const conf = gameStats?.conf ?? 0;
  devData.fps          = state.fps;
  devData.frameMs      = state.frameMs;
  devData.deltaMs      = +state.deltaMs.toFixed(2);
  devData.deltaScale   = +state.deltaScale.toFixed(2);
  devData.renderMs     = renderMs;
  devData.detectMs     = detectMs;
  devData.latMs        = detectMs;
  devData.conf         = conf;
  updateRenderingDiagnostics(renderer);
  devData.drawCalls    = renderer.info.render.calls;
  devData.triangles    = renderer.info.render.triangles;
  if (now - lastMemorySampleMs >= 1000) {
    lastMemorySampleMs = now;
    Object.assign(devData, sampleGpuMemory(renderer));
  }
  devData.score        = state.score;
  devData.combo        = state.combo;
  devData.lives        = state.lives;
  devData.activeBlocks = gameStats?.activeBlocks ?? 0;
  devData.activeSparks = gameStats?.activeSparks ?? 0;
  devData.pooledBlocks = window.__prewarmedBlockPool ?? 0;
  devData.pooledBombs  = window.__prewarmedBombPool ?? 0;
  devData.pooledShards = window.__prewarmedShardPool ?? 0;
  devData.songTime     = +(window.__songTimeSec ?? 0).toFixed(3);
  devData.audioOffsetMs = window.__audioOffsetMs ?? devData.audioOffsetMs;
  devData.nearestBeatDeltaMs = window.__nearestBeatDeltaMs ?? 0;
  devData.leftActive   = state.handsLeftActive;
  devData.rightActive  = state.handsRightActive;
  devData.filteredHands= gameStats?.filteredHands ?? 0;
  devData.rawHands     = gameStats?.rawHands ?? 0;

  const refreshMs = Math.max(400, Number(getScenePerformanceProfile().devRefreshMs || 750));
  if (pane && now - lastPaneRefreshMs >= refreshMs) {
    lastPaneRefreshMs = now;
    pane.refresh();
  }
}

function makeDraggable(el) {
  let ox = 0, oy = 0, dragging = false;
  const header = el.querySelector('.tp-rotv_b') || el;
  header.style.cursor = 'grab';
  header.addEventListener('mousedown', e => {
    dragging = true;
    const rect = el.getBoundingClientRect();
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    header.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    el.style.left  = `${e.clientX - ox}px`;
    el.style.top   = `${e.clientY - oy}px`;
    el.style.right = 'auto';
  });
  window.addEventListener('mouseup', () => { dragging = false; header.style.cursor = 'grab'; });
}

async function loadTweakpane() {
  return new Promise(resolve => {
    if (window.Tweakpane?.Pane) { resolve(window.Tweakpane.Pane); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tweakpane@3.1.10/dist/tweakpane.min.js';
    s.onload = () => resolve(window.Tweakpane?.Pane || null);
    s.onerror = e => { console.warn('Tweakpane load failed:', e); resolve(null); };
    document.head.appendChild(s);
  });
}

async function loadStatsJS() {
  return new Promise(resolve => {
    if (window.Stats) { resolve(window.Stats); return; }
    const s    = document.createElement('script');
    s.src      = 'https://mrdoob.github.io/stats.js/build/stats.min.js';
    s.onload   = () => resolve(window.Stats);
    s.onerror  = () => resolve(null);
    document.head.appendChild(s);
  });
}
