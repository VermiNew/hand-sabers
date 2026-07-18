import { state } from '../core/state.ts';
import { setSetting, getSettings } from '../core/settings.ts';
import { applyTrackingSettings } from '../tracking/tracking.ts';
import { setVolume, setMusicVolume, setSfxVolume, setSoundVolume } from '../game/audio.ts';
import { getPerformanceMode, getPerformanceModes } from '../core/performance.ts';
import { getScenePerformanceProfile, setScenePerformanceProfile, setWireframeVisible } from '../game/scene.ts';
import * as THREE from 'three';
import type { PerformanceMode, Settings } from '../types/index.js';
import { sampleGpuMemory } from './render-memory.ts';

const THREE_RT = THREE;

// ── Typy ──────────────────────────────────────────────────────────────────────
interface GameStats {
  drawCalls:     number;
  triangles:     number;
  activeBlocks:  number;
  activeSparks:  number;
  conf:          number;
  filteredHands: number;
  rawHands:      number;
}

export interface FrameProfile {
  gameMs: number;
  effectsMs: number;
  reflectionMs: number;
  cpuMs: number;
}

interface DevData {
  fps: number; frameMs: number; deltaMs: number; deltaScale: number; renderMs: number; detectMs: number; latMs: number; conf: number;
  gameMs: number; effectsMs: number; reflectionMs: number; cpuMs: number; bottleneck: string;
  drawCalls: number; triangles: number; geoMem: number; texMem: number; vramMem: number;
  graphicsMode: string; graphicsProfile: string; renderScale: number; canvasSize: string; drawingBuffer: string; gpuRenderer: string; toneMapping: string; antialias: string; shadows: boolean; reflections: boolean;
  activeBlocks: number; activeSparks: number; pooledBlocks: number; pooledBombs: number; pooledShards: number; combo: number; score: number; lives: number;
  songTime: number; nearestBeatDeltaMs: number; audioOffsetMs: number;
  nearestBeat1: string; nearestBeat2: string; nearestBeat3: string;
  leftActive: boolean; rightActive: boolean; filteredHands: number; rawHands: number;
  wireframe: boolean; noFail: boolean; developerMode: boolean;
  sensitivity: number; flipCamera: boolean;
  volume: number; musicVolume: number; sfxVolume: number;
  hitSoundVolume: number; comboSoundVolume: number; missSoundVolume: number; bombSoundVolume: number; beatSoundVolume: number; milestoneSoundVolume: number;
  oneHandMode: string; performanceMode: string;
  mapTitle: string; mapArtist: string; mapDifficulty: string; mapBpm: string; mapDuration: string; mapBeats: number;
  appState: string;
}

declare global {
  interface Window {
    __graphicsQualityMode?: string;
    __graphicsProfile?: string;
    __graphicsDpr?: number;
    __songTimeSec?: number;
    __audioOffsetMs?: number;
    __nearestBeatDeltaMs?: number | null;
    __nearestBeats?: Array<{ deltaMs: number; side: string; cut: string }> | null;
    __prewarmedBlockPool?: number;
    __prewarmedBombPool?: number;
    __prewarmedShardPool?: number;
    __lastDetectMs?: number;
    Tweakpane?: { Pane: new (opts: { title: string; expanded: boolean }) => TweakpaneInstance };
    Stats?: new () => StatsInstance;
  }
}

interface TweakpaneInstance {
  element: HTMLElement;
  addTab(opts: { pages: Array<{ title: string }> }): { pages: TweakpaneFolder[] };
  refresh(): void;
  dispose(): void;
}

interface TweakpaneFolder {
  addMonitor(obj: DevData, key: string, opts?: Record<string, unknown>): void;
  addInput(obj: DevData, key: string, opts?: Record<string, unknown>): { on(event: string, cb: (ev: { value: unknown }) => void): void };
  addFolder?(opts: { title: string }): TweakpaneFolder;
  addSeparator?(): void;
  addBlade?(opts: Record<string, unknown>): void;
}

interface StatsInstance {
  showPanel(panel: number): void;
  update(): void;
  dom: HTMLElement & { dataset: DOMStringMap };
}

// ── Stan modułu ───────────────────────────────────────────────────────────────
let pane:         TweakpaneInstance | null = null;
let statsJS:      StatsInstance | null = null;
let isDev         = false;
let initStarted   = false;
let lastRenderer: THREE.WebGLRenderer | null = null;

const devData: DevData = {
  fps: 0, frameMs: 0, deltaMs: 0, deltaScale: 1, renderMs: 0, detectMs: 0, latMs: 0, conf: 0,
  gameMs: 0, effectsMs: 0, reflectionMs: 0, cpuMs: 0, bottleneck: '—',
  drawCalls: 0, triangles: 0, geoMem: 0, texMem: 0, vramMem: 0,
  graphicsMode: '—', graphicsProfile: '—', renderScale: 1, canvasSize: '—', drawingBuffer: '—', gpuRenderer: '—', toneMapping: '—', antialias: '—', shadows: false, reflections: false,
  activeBlocks: 0, activeSparks: 0, pooledBlocks: 0, pooledBombs: 0, pooledShards: 0, combo: 0, score: 0, lives: 0,
  songTime: 0, nearestBeatDeltaMs: 0, audioOffsetMs: 0,
  nearestBeat1: '—', nearestBeat2: '—', nearestBeat3: '—',
  leftActive: false, rightActive: false, filteredHands: 0, rawHands: 0,
  wireframe: false, noFail: false, developerMode: false,
  sensitivity: 1.0, flipCamera: false,
  volume: 0.8, musicVolume: 1.0, sfxVolume: 1.0,
  hitSoundVolume: 0.85, comboSoundVolume: 0.55, missSoundVolume: 0.75, bombSoundVolume: 0.8, beatSoundVolume: 0.65, milestoneSoundVolume: 0.7,
  oneHandMode: 'both', performanceMode: 'auto',
  mapTitle: '—', mapArtist: '—', mapDifficulty: '—', mapBpm: '—', mapDuration: '—', mapBeats: 0,
  appState: '—',
};

const DEV_ACCENTS: Record<string, string> = {
  green:  '54, 242, 161',
  blue:   '96, 185, 255',
  purple: '196, 132, 255',
  pink:   '255, 112, 200',
  orange: '255, 165, 80',
  yellow: '255, 220, 50',
};

export function applyDevAccent(name: string): void {
  const rgb = DEV_ACCENTS[name] ?? DEV_ACCENTS['green']!;
  document.documentElement.style.setProperty('--dev-accent-rgb', rgb);
  setSetting('devAccent', name);
}

function isDevModeRequested(): boolean {
  const params = new URLSearchParams(location.search);
  return params.has('dev') || params.has('testing') || Boolean(getSettings().developerMode);
}

function setCameraPanelInlineVisibility(enabled: boolean): void {
  const camPanel = document.getElementById('camPanel');
  if (camPanel) camPanel.style.display = enabled ? '' : 'none';
}

export function isDeveloperPanelEnabled(): boolean {
  return isDev;
}

export function setDeveloperPanelEnabled(renderer: THREE.WebGLRenderer | null = lastRenderer, enabled = true): void {
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

function notifyTrackingSettings(patch: Record<string, unknown>): void {
  try {
    applyTrackingSettings(patch);
  } catch (e) {
    console.warn('Tracking settings update failed:', e);
  }
}

function addSeparator(folder: TweakpaneFolder): void {
  if (typeof folder.addSeparator === 'function') folder.addSeparator();
  else folder.addBlade?.({ view: 'separator' });
}

const drawingBufferSize = new THREE_RT.Vector2();
let lastMemorySampleMs = 0;

function getGpuRendererLabel(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext() as WebGLRenderingContext | null;
    if (!gl) return 'WebGL —';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor       = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR);
    const rendererName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return [vendor, rendererName].filter(Boolean).join(' / ') || 'WebGL —';
  } catch {
    return 'WebGL —';
  }
}

function updateRenderingDiagnostics(renderer: THREE.WebGLRenderer): void {
  const profile = getScenePerformanceProfile();
  const canvas  = renderer.domElement;
  const gl      = renderer.getContext() as WebGLRenderingContext;
  renderer.getDrawingBufferSize(drawingBufferSize);
  devData.graphicsMode    = window.__graphicsQualityMode || profile.qualityMode || profile.mode || '—';
  devData.graphicsProfile = window.__graphicsProfile || profile.label || '—';
  devData.renderScale     = +(window.__graphicsDpr ?? renderer.getPixelRatio()).toFixed(2);
  devData.canvasSize      = `${canvas.clientWidth || canvas.width}×${canvas.clientHeight || canvas.height}`;
  devData.drawingBuffer   = `${drawingBufferSize.x}×${drawingBufferSize.y}`;
  devData.toneMapping     = String(renderer.toneMappingExposure);
  devData.antialias       = gl.getContextAttributes?.()?.antialias ? 'on' : 'off';
  devData.shadows         = Boolean(renderer.shadowMap?.enabled);
  devData.reflections     = Boolean(profile.reflections);
  if (devData.gpuRenderer === '—') devData.gpuRenderer = getGpuRendererLabel(renderer);
}

export function initDevPanel(renderer: THREE.WebGLRenderer, _unused: null, options: { force?: boolean } = {}): void {
  lastRenderer = renderer ?? lastRenderer;
  isDev = options.force ? Boolean(getSettings().developerMode) || isDevModeRequested() : isDevModeRequested();
  document.body.classList.toggle('dev-tools', isDev);
  setCameraPanelInlineVisibility(isDev);
  if (!isDev) return;
  if (pane || initStarted) return;
  initStarted = true;

  const settings = getSettings();
  devData.sensitivity   = settings.sensitivity;
  devData.flipCamera    = settings.flipCamera;
  devData.noFail        = settings.noFail;
  devData.volume        = settings.volume;
  for (const key of ['musicVolume','sfxVolume','hitSoundVolume','comboSoundVolume','missSoundVolume','bombSoundVolume','beatSoundVolume','milestoneSoundVolume'] as const) {
    devData[key] = settings[key] ?? devData[key];
  }
  devData.audioOffsetMs   = settings.audioOffsetMs ?? 0;
  devData.performanceMode = getPerformanceMode(settings);
  devData.developerMode   = Boolean(settings.developerMode) || isDev;
  applyDevAccent(settings.devAccent || 'green');
  updateRenderingDiagnostics(lastRenderer!);

  void loadStatsJS().then(Stats => {
    if (!Stats || !isDev) return;
    statsJS = new Stats();
    statsJS.showPanel(0);
    statsJS.dom.classList.add('hs-stats-panel');
    statsJS.dom.title = 'Stats.js - kliknij, aby zmienić widok';
    statsJS.dom.style.cssText = 'position:fixed;top:16px;right:16px;cursor:pointer;z-index:9999;';
    document.body.appendChild(statsJS.dom);
    statsJS.dom.dataset['panel'] = '0';
    statsJS.dom.addEventListener('click', () => {
      const next = ((Number(statsJS!.dom.dataset['panel']) | 0) + 1) % 3;
      statsJS!.showPanel(next);
      statsJS!.dom.dataset['panel'] = String(next);
    });
  }).catch(error => console.warn('Stats.js initialization failed:', error));

  void loadTweakpane().then(Pane => {
    if (!Pane || !isDev) return;
    pane = new Pane({ title: 'HAND SABERS DEV', expanded: true });

    const tabs = pane.addTab({ pages: [
      { title: 'PERF'  },
      { title: 'GAME'  },
      { title: 'MAP'   },
      { title: 'TRACK' },
      { title: 'CFG'   },
    ]});

    // ── PERF ──
    const perf = tabs.pages[0]!;
    perf.addMonitor(devData, 'fps',        { label: 'FPS',       view: 'graph', min: 0, max: 240, interval: 500 });
    perf.addMonitor(devData, 'frameMs',    { label: 'Frame ms',  view: 'graph', min: 0, max: 33,  interval: 500 });
    perf.addMonitor(devData, 'deltaMs',    { label: 'Delta ms',  view: 'graph', min: 0, max: 50,  interval: 200 });
    perf.addMonitor(devData, 'deltaScale', { label: 'Delta x',   interval: 200 });
    perf.addMonitor(devData, 'renderMs',   { label: 'Render ms', interval: 500 });
    perf.addMonitor(devData, 'detectMs',   { label: 'Detect ms', interval: 500 });
    perf.addMonitor(devData, 'gameMs',     { label: 'Game logic ms', interval: 500 });
    perf.addMonitor(devData, 'effectsMs',  { label: 'Effects ms', interval: 500 });
    perf.addMonitor(devData, 'reflectionMs', { label: 'Reflection ms', interval: 500 });
    perf.addMonitor(devData, 'cpuMs',      { label: 'Profiled CPU ms', interval: 500 });
    perf.addMonitor(devData, 'bottleneck', { label: 'Bottleneck', interval: 500 });
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
    const game = tabs.pages[1]!;
    game.addMonitor(devData, 'appState',     { label: 'State',   interval: 200 });
    addSeparator(game);
    game.addMonitor(devData, 'score',        { label: 'Score',   interval: 200 });
    game.addMonitor(devData, 'combo',        { label: 'Combo',   interval: 200 });
    game.addMonitor(devData, 'lives',        { label: 'Lives',   interval: 200 });
    addSeparator(game);
    game.addMonitor(devData, 'songTime',           { label: 'Song time', interval: 100 });
    game.addMonitor(devData, 'nearestBeatDeltaMs', { label: 'Beat Δ ms', interval: 100 });
    const nearestFolder = game.addFolder?.({ title: 'Nearest beats' });
    if (nearestFolder) {
      nearestFolder.addMonitor(devData, 'nearestBeat1', { label: 'Beat 1', interval: 100 });
      nearestFolder.addMonitor(devData, 'nearestBeat2', { label: 'Beat 2', interval: 100 });
      nearestFolder.addMonitor(devData, 'nearestBeat3', { label: 'Beat 3', interval: 100 });
    }
    addSeparator(game);
    game.addMonitor(devData, 'activeBlocks', { label: 'Blocks',  view: 'graph', min: 0, max: 30, interval: 200 });
    game.addMonitor(devData, 'activeSparks', { label: 'Sparks',  interval: 200 });
    game.addMonitor(devData, 'pooledBlocks', { label: 'Pool blocks', interval: 1000 });
    game.addMonitor(devData, 'pooledBombs',  { label: 'Pool bombs',  interval: 1000 });
    game.addMonitor(devData, 'pooledShards', { label: 'Pool shards', interval: 1000 });

    // ── MAP ──
    const map = tabs.pages[2]!;
    map.addMonitor(devData, 'mapTitle',      { label: 'Title',      interval: 1000 });
    map.addMonitor(devData, 'mapArtist',     { label: 'Artist',     interval: 1000 });
    map.addMonitor(devData, 'mapDifficulty', { label: 'Difficulty', interval: 1000 });
    map.addMonitor(devData, 'mapBpm',        { label: 'BPM',        interval: 1000 });
    map.addMonitor(devData, 'mapDuration',   { label: 'Duration',   interval: 1000 });
    map.addMonitor(devData, 'mapBeats',      { label: 'Beats total', interval: 1000 });

    // ── TRACK ──
    const track = tabs.pages[3]!;
    track.addMonitor(devData, 'leftActive',    { label: 'L hand' });
    track.addMonitor(devData, 'rightActive',   { label: 'R hand' });
    track.addMonitor(devData, 'conf',          { label: 'Conf',    view: 'graph', min: 0, max: 1, interval: 100 });
    track.addMonitor(devData, 'filteredHands', { label: 'Filtered' });
    track.addMonitor(devData, 'rawHands',      { label: 'Raw' });
    track.addMonitor(devData, 'latMs',         { label: 'Latency', view: 'graph', min: 0, max: 80, interval: 500 });

    // ── CFG ──
    const cfg = tabs.pages[4]!;
    cfg.addInput(devData, 'wireframe', { label: 'Hitbox wire' }).on('change', ev => {
      setWireframeVisible(Boolean(ev.value));
    });
    cfg.addInput(devData, 'noFail', { label: 'No Fail' }).on('change', ev => {
      state.noFail = Boolean(ev.value);
      setSetting('noFail', Boolean(ev.value));
    });
    cfg.addInput(devData, 'oneHandMode', {
      label: 'One hand',
      options: { Obie: 'both', Lewa: 'left', Prawa: 'right' },
    }).on('change', ev => {
      const val = ev.value === 'both' ? null : ev.value as string;
      state.oneHandMode = val as ('left' | 'right' | null);
      (window as Window & { __oneHandMode?: string }).__oneHandMode = String(val ?? 'both');
      setSetting('oneHandMode', val as ('left' | 'right' | null));
      notifyTrackingSettings({ oneHandMode: val });
    });
    addSeparator(cfg);
    cfg.addInput(devData, 'performanceMode', {
      label: 'Perf',
      options: Object.fromEntries(getPerformanceModes().map(mode => [mode.label, mode.value])),
    }).on('change', ev => {
      const value = String(ev.value);
      setSetting('performanceMode', value as PerformanceMode);
      setScenePerformanceProfile({ ...getSettings(), performanceMode: value as PerformanceMode });
      notifyTrackingSettings({ performanceMode: value });
      devData.performanceMode = getPerformanceMode({ performanceMode: value });
    });
    addSeparator(cfg);
    cfg.addInput(devData, 'sensitivity', { label: 'Sensitivity', min: 0.5, max: 2.0, step: 0.05 }).on('change', ev => {
      setSetting('sensitivity', Number(ev.value));
      notifyTrackingSettings({ sensitivity: Number(ev.value) });
    });
    cfg.addInput(devData, 'flipCamera', { label: 'Flip kamera' }).on('change', ev => {
      setSetting('flipCamera', Boolean(ev.value));
      notifyTrackingSettings({ flipCamera: Boolean(ev.value) });
    });
    cfg.addInput(devData, 'volume', { label: 'Master', min: 0, max: 1, step: 0.05 }).on('change', ev => {
      setSetting('volume', Number(ev.value));
      setVolume(Number(ev.value));
    });
    const audioControls: Array<[keyof DevData, string]> = [
      ['musicVolume',       'Muzyka'],
      ['sfxVolume',         'Efekty'],
      ['hitSoundVolume',    'Trafienie'],
      ['comboSoundVolume',  'Combo'],
      ['missSoundVolume',   'Pudło'],
      ['bombSoundVolume',   'Bomba'],
      ['beatSoundVolume',   'Beat cue'],
      ['milestoneSoundVolume', 'Milestone'],
    ];
    for (const [key, label] of audioControls) {
      cfg.addInput(devData, key, { label, min: 0, max: 1, step: 0.05 }).on('change', ev => {
        setSetting(key as keyof Settings, Number(ev.value) as never); // 'as never' — Tweakpane zwraca unknown, setSetting wymaga konkretnych typów
        if (key === 'musicVolume')    setMusicVolume(Number(ev.value));
        else if (key === 'sfxVolume') setSfxVolume(Number(ev.value));
        else setSoundVolume(key, Number(ev.value));
      });
    }
    cfg.addInput(devData, 'audioOffsetMs', { label: 'Audio offset ms', min: -500, max: 500, step: 10 }).on('change', ev => {
      setSetting('audioOffsetMs', Number(ev.value));
    });

    const panelEl = pane.element;
    panelEl.classList.add('hs-dev-pane');
    panelEl.setAttribute('aria-label', 'Hand Sabers developer panel');
    panelEl.style.cssText = 'position:fixed;top:16px;left:16px;z-index:9000;width:min(360px,calc(100vw - 32px));';
    makeDraggable(panelEl);
    attachMarqueeScroll(panelEl);
  }).catch(error => console.warn('Tweakpane initialization failed:', error));
}

let lastPaneRefreshMs = 0;

export function tickDevPanel(
  renderer: THREE.WebGLRenderer,
  now: number,
  renderMs: number,
  detectMs: number,
  gameStats: GameStats,
  frameProfile?: FrameProfile,
): void {
  if (!isDev) return;
  if (statsJS) statsJS.update();

  devData.fps        = state.fps;
  devData.frameMs    = state.frameMs;
  devData.deltaMs    = +state.deltaMs.toFixed(2);
  devData.deltaScale = +state.deltaScale.toFixed(2);
  devData.renderMs   = renderMs;
  devData.detectMs   = detectMs;
  devData.latMs      = detectMs;
  devData.conf       = gameStats.conf;
  if (frameProfile) {
    devData.gameMs = frameProfile.gameMs;
    devData.effectsMs = frameProfile.effectsMs;
    devData.reflectionMs = frameProfile.reflectionMs;
    devData.cpuMs = frameProfile.cpuMs;
    const phases = [
      ['ML detect', detectMs],
      ['render', renderMs],
      ['game logic', frameProfile.gameMs],
      ['effects', frameProfile.effectsMs],
      ['reflection', frameProfile.reflectionMs],
    ] as const;
    const slowest = phases.reduce((current, candidate) => candidate[1] > current[1] ? candidate : current);
    devData.bottleneck = `${slowest[0]} (${slowest[1].toFixed(1)} ms)`;
  }
  updateRenderingDiagnostics(renderer);
  devData.drawCalls  = renderer.info.render.calls;
  devData.triangles  = renderer.info.render.triangles;
  if (now - lastMemorySampleMs >= 1000) {
    lastMemorySampleMs = now;
    Object.assign(devData, sampleGpuMemory(renderer));
  }
  devData.score        = state.score;
  devData.combo        = state.combo;
  devData.lives        = state.lives;
  devData.activeBlocks = gameStats.activeBlocks;
  devData.activeSparks = gameStats.activeSparks;
  devData.pooledBlocks = window.__prewarmedBlockPool ?? 0;
  devData.pooledBombs  = window.__prewarmedBombPool  ?? 0;
  devData.pooledShards = window.__prewarmedShardPool ?? 0;
  devData.songTime     = +(window.__songTimeSec ?? 0).toFixed(3);
  devData.audioOffsetMs       = window.__audioOffsetMs ?? devData.audioOffsetMs;
  devData.nearestBeatDeltaMs  = window.__nearestBeatDeltaMs ?? 0;
  const nb = window.__nearestBeats ?? [];
  devData.nearestBeat1 = nb[0] ? `${nb[0].deltaMs}ms | ${nb[0].side} | ${nb[0].cut}` : '—';
  devData.nearestBeat2 = nb[1] ? `${nb[1].deltaMs}ms | ${nb[1].side} | ${nb[1].cut}` : '—';
  devData.nearestBeat3 = nb[2] ? `${nb[2].deltaMs}ms | ${nb[2].side} | ${nb[2].cut}` : '—';
  devData.leftActive   = state.handsLeftActive;
  devData.rightActive  = state.handsRightActive;
  devData.filteredHands = gameStats.filteredHands;
  devData.rawHands      = gameStats.rawHands;
  devData.appState      = state.appState;

  const meta = state.map?.meta;
  devData.mapTitle      = meta?.title      || '—';
  devData.mapArtist     = meta?.artist     || '—';
  devData.mapDifficulty = meta?.difficulty || '—';
  devData.mapBpm        = meta?.bpm        ? String(meta.bpm) : '—';
  devData.mapDuration   = meta?.duration   ? `${meta.duration.toFixed(1)}s` : '—';
  devData.mapBeats      = state.map?.beats?.length ?? 0;

  const refreshMs = Math.max(400, getScenePerformanceProfile().devRefreshMs || 750);
  if (pane && now - lastPaneRefreshMs >= refreshMs) {
    lastPaneRefreshMs = now;
    pane.refresh();
  }
}

function attachMarqueeScroll(panelEl: HTMLElement): void {
  panelEl.addEventListener('mouseover', (e: MouseEvent) => {
    const input = (e.target as Element).closest('.tp-mllv_i, .tp-sglv_i') as HTMLInputElement | HTMLTextAreaElement | null;
    if (!input || input.dataset['marquee'] === '1') return;
    if (input.scrollWidth <= input.clientWidth) return;
    input.dataset['marquee'] = '1';
    input.classList.add('dev-scrolling');
    const distance = input.scrollWidth - input.clientWidth;
    const duration = Math.max(1500, distance * 12);
    const pauseMs  = 1000;
    // phase: 'scroll' | 'pause-end' | 'pause-start'
    let phase: 'scroll' | 'pause-end' | 'pause-start' = 'pause-start';
    let phaseStart = 0;
    let scrollStart = 0;
    let raf = 0;
    function step(ts: number): void {
      if (phaseStart === 0) phaseStart = ts;
      if (phase === 'pause-start' || phase === 'pause-end') {
        if (ts - phaseStart >= pauseMs) {
          phaseStart = ts;
          if (phase === 'pause-end') {
            input!.scrollLeft = 0;
            phase = 'pause-start';
          } else {
            phase = 'scroll';
            scrollStart = ts;
          }
        }
      } else {
        const progress = Math.min((ts - scrollStart) / duration, 1);
        input!.scrollLeft = progress * distance;
        if (progress >= 1) {
          phase = 'pause-end';
          phaseStart = ts;
        }
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    input.addEventListener('mouseleave', () => {
      cancelAnimationFrame(raf);
      input!.scrollLeft = 0;
      input!.classList.remove('dev-scrolling');
      delete input!.dataset['marquee'];
    }, { once: true });
  });
}

function makeDraggable(el: HTMLElement): void {
  let ox = 0, oy = 0, dragging = false;
  const header = (el.querySelector('.tp-rotv_b') ?? el) as HTMLElement;
  header.style.cursor = 'grab';
  header.addEventListener('mousedown', (e: MouseEvent) => {
    dragging = true;
    const rect = el.getBoundingClientRect();
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    header.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    el.style.left  = `${e.clientX - ox}px`;
    el.style.top   = `${e.clientY - oy}px`;
    el.style.right = 'auto';
  });
  window.addEventListener('mouseup', () => { dragging = false; header.style.cursor = 'grab'; });
}

async function loadTweakpane(): Promise<(new (opts: { title: string; expanded: boolean }) => TweakpaneInstance) | null> {
  return new Promise(resolve => {
    if (window.Tweakpane?.Pane) { resolve(window.Tweakpane.Pane); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tweakpane@3.1.10/dist/tweakpane.min.js';
    s.onload  = () => resolve(window.Tweakpane?.Pane ?? null);
    s.onerror = (e) => { console.warn('Tweakpane load failed:', e); resolve(null); };
    document.head.appendChild(s);
  });
}

async function loadStatsJS(): Promise<(new () => StatsInstance) | null> {
  return new Promise(resolve => {
    if (window.Stats) { resolve(window.Stats); return; }
    const s   = document.createElement('script');
    s.src     = 'https://mrdoob.github.io/stats.js/build/stats.min.js';
    s.onload  = () => resolve(window.Stats ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}
