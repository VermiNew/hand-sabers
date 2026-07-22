import { t } from '../i18n/index.ts';
import type { PerformanceMode, PerformanceProfile } from '../types/index.js';

export const GRAPHICS_TIERS = ['lowest', 'very-low', 'low', 'medium', 'high', 'ultra', 'maximum'] as const;
export const DEFAULT_PERFORMANCE_MODE: PerformanceMode = 'auto';

type GraphicsTier = typeof GRAPHICS_TIERS[number];

interface PerformanceSettingsLike {
  performanceMode?: string | null;
  autoQualityMode?: string | null;
  customAntialias?: boolean;
  customReflections?: boolean;
  customFloorGlows?: boolean;
  customSaberGlints?: boolean;
  customSaberTrails?: boolean;
  customSaberTrailSamples?: number;
  customArenaDetail?: number;
  customBackgroundShader?: boolean;
  customFog?: boolean;
  customGrid?: boolean;
  customHitShards?: number;
  customRenderScale?: number;
}

interface PerformanceModeOption {
  value: PerformanceMode;
  label: string;
  description: string;
}

type PerformanceProfileBase = Omit<PerformanceProfile, 'auto'>;

const MODES: readonly PerformanceMode[] = [DEFAULT_PERFORMANCE_MODE, ...GRAPHICS_TIERS, 'custom'];
const LEGACY_MODE_MAP: Record<string, PerformanceMode> = {
  turbo: 'low',
  performance: 'medium',
  lowest: 'lowest',
  verylow: 'very-low',
  'very_low': 'very-low',
  'very-low': 'very-low',
  balanced: 'high',
  quality: 'ultra',
};

function getProfileDescription(tier: GraphicsTier): string {
  return t(`performance.desc.${tier}`);
}

const PROFILES = {
  lowest: {
    mode: 'lowest',
    qualityMode: 'lowest',
    label: 'Lowest',
    get description() { return getProfileDescription('lowest'); },
    targetFps: 60,
    minDpr: 0.32,
    maxDpr: 0.45,
    antialias: false,
    reflections: false,
    floorGlows: false,
    saberGlints: false,
    saberTrails: false,
    saberTrailSamples: 0,
    arenaDetail: 0,
    backgroundShader: false,
    fog: false,
    grid: false,
    musicReactive: false,
    menuDemo: false,
    hitShards: 0,
    camera: { width: 320, height: 180, frameRate: 20 },
    detectFps: 8,
    devRefreshMs: 1200,
  },
  'very-low': {
    mode: 'very-low',
    qualityMode: 'very-low',
    label: 'Very Low',
    get description() { return getProfileDescription('very-low'); },
    targetFps: 60,
    minDpr: 0.38,
    maxDpr: 0.56,
    antialias: false,
    reflections: false,
    floorGlows: false,
    saberGlints: false,
    saberTrails: false,
    saberTrailSamples: 0,
    arenaDetail: 0.08,
    backgroundShader: false,
    fog: false,
    grid: false,
    musicReactive: false,
    menuDemo: false,
    hitShards: 1,
    camera: { width: 424, height: 240, frameRate: 24 },
    detectFps: 10,
    devRefreshMs: 1100,
  },
  low: {
    mode: 'low',
    qualityMode: 'low',
    label: 'Low',
    get description() { return getProfileDescription('low'); },
    targetFps: 60,
    minDpr: 0.48,
    maxDpr: 0.68,
    antialias: false,
    reflections: false,
    floorGlows: false,
    saberGlints: false,
    saberTrails: false,
    saberTrailSamples: 0,
    arenaDetail: 0.22,
    backgroundShader: false,
    fog: false,
    grid: false,
    musicReactive: false,
    menuDemo: false,
    hitShards: 1,
    camera: { width: 424, height: 240, frameRate: 30 },
    detectFps: 18,
    devRefreshMs: 1000,
  },
  medium: {
    mode: 'medium',
    qualityMode: 'medium',
    label: 'Medium',
    get description() { return getProfileDescription('medium'); },
    targetFps: 60,
    minDpr: 0.62,
    maxDpr: 0.9,
    antialias: false,
    reflections: false,
    floorGlows: false,
    saberGlints: true,
    saberTrails: true,
    saberTrailSamples: 6,
    arenaDetail: 0.62,
    backgroundShader: true,
    fog: true,
    grid: true,
    musicReactive: true,
    menuDemo: true,
    hitShards: 2,
    camera: { width: 640, height: 360, frameRate: 30 },
    detectFps: 24,
    devRefreshMs: 750,
  },
  high: {
    mode: 'high',
    qualityMode: 'high',
    label: 'High',
    get description() { return getProfileDescription('high'); },
    targetFps: 60,
    minDpr: 0.75,
    maxDpr: 1.08,
    antialias: false,
    reflections: false,
    floorGlows: true,
    saberGlints: true,
    saberTrails: true,
    saberTrailSamples: 9,
    arenaDetail: 0.82,
    backgroundShader: true,
    fog: true,
    grid: true,
    musicReactive: true,
    menuDemo: true,
    hitShards: 3,
    camera: { width: 640, height: 480, frameRate: 30 },
    detectFps: 28,
    devRefreshMs: 650,
  },
  ultra: {
    mode: 'ultra',
    qualityMode: 'ultra',
    label: 'Ultra',
    get description() { return getProfileDescription('ultra'); },
    targetFps: 60,
    minDpr: 0.9,
    maxDpr: 1.3,
    antialias: true,
    reflections: true,
    floorGlows: true,
    saberGlints: true,
    saberTrails: true,
    saberTrailSamples: 12,
    arenaDetail: 1,
    backgroundShader: true,
    fog: true,
    grid: true,
    musicReactive: true,
    menuDemo: true,
    hitShards: 5,
    camera: { width: 960, height: 540, frameRate: 30 },
    detectFps: 30,
    devRefreshMs: 500,
  },
  maximum: {
    mode: 'maximum',
    qualityMode: 'maximum',
    label: 'Maximum',
    get description() { return getProfileDescription('maximum'); },
    targetFps: 60,
    minDpr: 1.0,
    maxDpr: 1.75,
    antialias: true,
    reflections: true,
    floorGlows: true,
    saberGlints: true,
    saberTrails: true,
    saberTrailSamples: 16,
    arenaDetail: 1.18,
    backgroundShader: true,
    fog: true,
    grid: true,
    musicReactive: true,
    menuDemo: true,
    hitShards: 7,
    camera: { width: 1280, height: 720, frameRate: 30 },
    detectFps: 30,
    devRefreshMs: 400,
  },
} satisfies Record<GraphicsTier, PerformanceProfileBase>;

function normalizeMode(mode: string | null | undefined): PerformanceMode {
  const mapped = typeof mode === 'string' ? LEGACY_MODE_MAP[mode] || mode : mode;
  return MODES.includes(mapped as PerformanceMode) ? mapped as PerformanceMode : DEFAULT_PERFORMANCE_MODE;
}

function detectGpuBias(): number {
  if (typeof document === 'undefined') return 0;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return -2;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '').toLowerCase();
    if (renderer.includes('swiftshader') || renderer.includes('llvmpipe') || renderer.includes('software')) return -3;
    if (renderer.includes('intel') || renderer.includes('uhd') || renderer.includes('iris')) return -1;
    if (renderer.includes('rtx') || renderer.includes('radeon rx') || renderer.includes('arc') || renderer.includes('apple m')) return 2;
    if (renderer.includes('gtx') || renderer.includes('geforce') || renderer.includes('radeon')) return 1;
  } catch {}
  return 0;
}

export function detectAutoGraphicsTier(): GraphicsTier {
  const nav = typeof navigator !== 'undefined'
    ? navigator as Navigator & { deviceMemory?: number }
    : {} as Navigator & { deviceMemory?: number };
  const win = typeof window !== 'undefined'
    ? window
    : {} as Window;
  let score = detectGpuBias();

  const cores = Number(nav.hardwareConcurrency) || 4;
  if (cores >= 12) score += 2;
  else if (cores >= 8) score += 1;
  else if (cores <= 4) score -= 1;

  const memory = Number(nav.deviceMemory) || 4;
  if (memory >= 16) score += 3;
  else if (memory >= 8) score += 2;
  else if (memory >= 4) score += 1;
  else if (memory <= 2) score -= 1;

  const dpr = Math.min(Number(win.devicePixelRatio) || 1, 2);
  const pixels = (Number(win.innerWidth) || 1280) * (Number(win.innerHeight) || 720) * dpr * dpr;
  if (pixels >= 5_000_000) score -= 1;
  else if (pixels <= 1_400_000) score += 1;

  if (score <= -3) return 'lowest';
  if (score <= -1) return 'very-low';
  if (score <= 1) return 'low';
  if (score <= 3) return 'medium';
  if (score <= 5) return 'high';
  if (score <= 7) return 'ultra';
  return 'maximum';
}

export function getPerformanceMode(settings: PerformanceSettingsLike = {}): PerformanceMode {
  return normalizeMode(settings.performanceMode || DEFAULT_PERFORMANCE_MODE);
}

export function getPerformanceProfile(settings: PerformanceSettingsLike = {}): PerformanceProfile {
  const mode = getPerformanceMode(settings);
  if (mode === 'auto') {
    const runtimeQualityMode = typeof window !== 'undefined'
      ? (window as Window & { __graphicsQualityMode?: string }).__graphicsQualityMode
      : null;
    const qualityMode = normalizeMode(settings.autoQualityMode || runtimeQualityMode || detectAutoGraphicsTier());
    const profile = qualityMode === 'auto' || qualityMode === 'custom' ? PROFILES.medium : PROFILES[qualityMode];
    return {
      ...profile,
      mode: 'auto',
      qualityMode: profile.qualityMode,
      label: t('performance.autoArrow', { label: profile.label }),
      description: t('performance.autoDesc'),
      auto: true,
    };
  }
  if (mode === 'custom') {
    return {
      mode: 'custom',
      qualityMode: 'custom',
      label: t('performance.customLabel'),
      description: t('performance.customDesc'),
      targetFps: 60,
      minDpr: 0.32,
      maxDpr: Math.max(0.32, Math.min(1.75, settings.customRenderScale ?? 1)),
      antialias: Boolean(settings.customAntialias),
      reflections: Boolean(settings.customReflections),
      floorGlows: Boolean(settings.customFloorGlows),
      saberGlints: Boolean(settings.customSaberGlints),
      saberTrails: Boolean(settings.customSaberTrails),
      saberTrailSamples: Math.max(0, Math.min(16, Math.round(settings.customSaberTrailSamples ?? 10))),
      arenaDetail: Math.max(0, Math.min(1.25, settings.customArenaDetail ?? 1)),
      backgroundShader: Boolean(settings.customBackgroundShader),
      fog: Boolean(settings.customFog),
      grid: Boolean(settings.customGrid),
      musicReactive: Boolean(settings.customFloorGlows),
      menuDemo: true,
      hitShards: Math.max(0, Math.min(7, Math.round(settings.customHitShards ?? 2))),
      camera: PROFILES.medium.camera,
      detectFps: PROFILES.medium.detectFps,
      devRefreshMs: PROFILES.medium.devRefreshMs,
      auto: false,
    };
  }
  return { ...PROFILES[mode] };
}

export function getPerformanceModes(): PerformanceModeOption[] {
  return [
    { value: 'auto', label: t('performance.autoLabel'), description: t('performance.autoDesc') },
    { value: 'lowest', label: 'Lowest', description: PROFILES.lowest.description },
    { value: 'very-low', label: 'Very Low', description: PROFILES['very-low'].description },
    { value: 'low', label: 'Low', description: PROFILES.low.description },
    { value: 'medium', label: 'Medium', description: PROFILES.medium.description },
    { value: 'high', label: 'High', description: PROFILES.high.description },
    { value: 'ultra', label: 'Ultra', description: PROFILES.ultra.description },
    { value: 'maximum', label: 'Maximum', description: PROFILES.maximum.description },
    { value: 'custom', label: t('performance.customLabel'), description: t('performance.customDesc') },
  ];
}

export function getPerformanceModeDescription(mode: string | null | undefined): string {
  const normalized = normalizeMode(mode);
  return getPerformanceModes().find(item => item.value === normalized)?.description || '';
}

export function getAdjacentGraphicsTier(mode: string | null | undefined, direction: number): GraphicsTier | null {
  const normalized = normalizeMode(mode);
  const index = GRAPHICS_TIERS.indexOf(normalized as GraphicsTier);
  if (index < 0) return null;
  const next = GRAPHICS_TIERS[index + Math.sign(direction)];
  return next || null;
}

export function clampDpr(value: number, profile: Pick<PerformanceProfile, 'minDpr' | 'maxDpr'>): number {
  const dpr = Number.isFinite(value) ? value : 1;
  return Math.max(profile.minDpr, Math.min(profile.maxDpr, dpr));
}

export function getDetectIntervalMs(profile: Pick<PerformanceProfile, 'detectFps'>): number {
  const fps = Math.max(8, Math.min(45, Number(profile.detectFps) || 24));
  return 1000 / fps;
}
