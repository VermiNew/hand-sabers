import * as THREE from 'three';
import { THEME } from '../core/theme.ts';
import { loadSettings } from '../core/settings.ts';
import { SABER_COLORS } from '../core/saber-colors.ts';
import { clampDpr, getAdjacentGraphicsTier, getPerformanceProfile } from '../core/performance.ts';
import type { OneHandMode, Settings, PerformanceProfile } from '../types/index.js';
import { applyCameraShake, triggerCameraShake } from './camera-shake.ts';
import {
  applyArenaBackgroundTheme,
  createArenaBackground,
  type ArenaBackgroundPalette,
} from './arena-background.ts';
import {
  applySaberModel,
  createSaber,
  type SaberModel,
  type SaberUserData,
} from './saber-visual.ts';

export { THREE };

declare global {
  interface Window {
    THREE: typeof THREE;
    __graphicsProfile?:     string;
    __graphicsMode?:        string;
    __graphicsQualityMode?: string;
    __graphicsDpr?:         number;
  }
}

let canvas3d = document.getElementById('gameCanvas') as HTMLCanvasElement;
const initialSettings    = loadSettings();
const initialPerfProfile = getPerformanceProfile(initialSettings);
let perfProfile          = initialPerfProfile;
let activeOneHandMode: OneHandMode = initialSettings.oneHandMode ?? null;

function createRenderer(canvas: HTMLCanvasElement, profile: PerformanceProfile): THREE.WebGLRenderer {
  const nextRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: profile.antialias,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  nextRenderer.setPixelRatio(clampDpr(window.devicePixelRatio || 1, profile));
  nextRenderer.setSize(window.innerWidth, window.innerHeight);
  nextRenderer.shadowMap.enabled = false;
  nextRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  nextRenderer.toneMappingExposure = ['lowest', 'very-low', 'low'].includes(profile.qualityMode) ? 1.0 : 1.2;
  nextRenderer.outputColorSpace = THREE.SRGBColorSpace;
  return nextRenderer;
}

export let renderer = createRenderer(canvas3d, initialPerfProfile);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(THEME.dark);
const sceneFog = new THREE.FogExp2(THEME.dark, 0.028);
scene.fog = sceneFog;

export const cam3d = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 100);
cam3d.position.set(0, 1.55, 3.2);
cam3d.lookAt(0, 1.1, -5);

export const ambientLight = new THREE.AmbientLight(THEME.darkAlt, 2);
scene.add(ambientLight);

const dirL = new THREE.DirectionalLight(THEME.main, 0.6);
dirL.position.set(0, 8, 4);
scene.add(dirL);

const specTopL = new THREE.DirectionalLight(0xdce7f5, 0.55);
specTopL.position.set(1.5, 6, 3);
scene.add(specTopL);

const rimL = new THREE.DirectionalLight(THEME.gray, 0.22);
rimL.position.set(-1, -2, 2);
scene.add(rimL);

const backL = new THREE.DirectionalLight(0x0a1628, 0.35);
backL.position.set(0, 2, -8);
scene.add(backL);

export const lLight = new THREE.PointLight(THEME.left,  4, 5);
export const rLight = new THREE.PointLight(THEME.right, 4, 5);
scene.add(lLight, rLight);

const gridH = new THREE.GridHelper(40, 40, THEME.gridMajor, THEME.gridMinor);
gridH.position.y = 0;
scene.add(gridH);

const floorMat = new THREE.MeshPhongMaterial({
  color:       THEME.darkPanel,
  specular:    THEME.floorSpecular,
  shininess:   90,
  transparent: true,
  opacity:     0.34,
  depthWrite:  false,
});
const floorSheen = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), floorMat);
floorSheen.rotation.x = -Math.PI / 2;
floorSheen.position.y = -0.004;
scene.add(floorSheen);

export const REFLECT_SIZE  = 256;
export const reflectTarget = new THREE.WebGLRenderTarget(REFLECT_SIZE, REFLECT_SIZE, {
  minFilter:  THREE.LinearFilter,
  magFilter:  THREE.LinearFilter,
  format:     THREE.RGBFormat,
  depthBuffer: true,
});
export const reflectCam = new THREE.PerspectiveCamera(68, 1, 0.1, 30);
const reflectionTextureMatrix = new THREE.Matrix4();

const floorReflectMat = new THREE.ShaderMaterial({
  uniforms: {
    uReflection: { value: reflectTarget.texture },
    uTextureMatrix: { value: reflectionTextureMatrix },
    uOpacity: { value: 0.18 },
  },
  vertexShader: `
    uniform mat4 uTextureMatrix;
    varying vec4 vReflectionUv;
    void main() {
      vReflectionUv = uTextureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uReflection;
    uniform float uOpacity;
    varying vec4 vReflectionUv;
    void main() {
      vec3 reflection = texture2DProj(uReflection, vReflectionUv).rgb;
      gl_FragColor = vec4(reflection, uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
});
const floorReflect = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), floorReflectMat);
floorReflect.rotation.x = -Math.PI / 2;
floorReflect.position.y = 0.005;
floorReflect.renderOrder = 1;
scene.add(floorReflect);

function rail(x: number, color: number): THREE.MeshBasicMaterial[] {
  const g  = new THREE.BoxGeometry(0.04, 0.04, 30);
  const m  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
  const r  = new THREE.Mesh(g, m);
  r.position.set(x, 0.02, -12);
  scene.add(r);
  const gg = new THREE.BoxGeometry(0.12, 0.02, 30);
  const gm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 });
  const gr = new THREE.Mesh(gg, gm);
  gr.position.set(x, 0.01, -12);
  scene.add(gr);
  return [m, gm];
}
const leftRailMats  = rail(-2.2, THEME.left);
const rightRailMats = rail(2.2,  THEME.right);

const ARENA_RIB_COUNT = 6;
const arenaRibGeometry = new THREE.BoxGeometry(0.045, 4.4, 0.045);
const arenaRibGlowGeometry = new THREE.BoxGeometry(0.16, 4.4, 0.12);
const leftRibMaterial = new THREE.MeshBasicMaterial({
  color: THEME.left,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const rightRibMaterial = leftRibMaterial.clone();
rightRibMaterial.color.setHex(THEME.right);
const leftRibGlowMaterial = leftRibMaterial.clone();
leftRibGlowMaterial.opacity = 0.09;
const rightRibGlowMaterial = rightRibMaterial.clone();
rightRibGlowMaterial.opacity = 0.09;
const arenaRibs = new THREE.Group();
const leftRibs = new THREE.InstancedMesh(arenaRibGeometry, leftRibMaterial, ARENA_RIB_COUNT);
const rightRibs = new THREE.InstancedMesh(arenaRibGeometry, rightRibMaterial, ARENA_RIB_COUNT);
const leftRibGlows = new THREE.InstancedMesh(arenaRibGlowGeometry, leftRibGlowMaterial, ARENA_RIB_COUNT);
const rightRibGlows = new THREE.InstancedMesh(arenaRibGlowGeometry, rightRibGlowMaterial, ARENA_RIB_COUNT);
const arenaRibTransform = new THREE.Object3D();

for (let index = 0; index < ARENA_RIB_COUNT; index++) {
  const depth = -4.8 - index * 3.15;
  const spread = 2.95 + index * 0.035;
  for (const [side, core, glow] of [
    [-1, leftRibs, leftRibGlows],
    [1, rightRibs, rightRibGlows],
  ] as const) {
    arenaRibTransform.position.set(side * spread, 2.0, depth);
    arenaRibTransform.rotation.set(0, 0, side * -0.16);
    arenaRibTransform.updateMatrix();
    core.setMatrixAt(index, arenaRibTransform.matrix);
    glow.setMatrixAt(index, arenaRibTransform.matrix);
  }
}
for (const mesh of [leftRibs, rightRibs, leftRibGlows, rightRibGlows]) {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  arenaRibs.add(mesh);
}
scene.add(arenaRibs);

function makeBlobShadow(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0,   'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.18)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.renderOrder = 3;
  scene.add(mesh);
  return mesh;
}
const lBlobShadow = makeBlobShadow();
const rBlobShadow = makeBlobShadow();

const HIT_Z = 1.5;
const hitPlaneMat = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  transparent: true,
  opacity: 0.08,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const hitPlane = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), hitPlaneMat);
hitPlane.position.set(0, 1.5, HIT_Z);
hitPlane.visible = false;
scene.add(hitPlane);

export function setHitPlaneVisible(visible: boolean): void {
  hitPlane.visible = Boolean(visible);
}

function makeGlowTexture(hex: number): THREE.CanvasTexture {
  const c   = document.createElement('canvas');
  c.width   = 96; c.height = 96;
  const ctx = c.getContext('2d')!;
  const col = new THREE.Color(hex);
  const r   = Math.round(col.r * 255);
  const g   = Math.round(col.g * 255);
  const b   = Math.round(col.b * 255);
  const grad = ctx.createRadialGradient(48, 48, 4, 48, 48, 48);
  grad.addColorStop(0,    `rgba(${r},${g},${b},0.62)`);
  grad.addColorStop(0.42, `rgba(${r},${g},${b},0.22)`);
  grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 96, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorReflectionSprite(hex: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const mat = new THREE.MeshBasicMaterial({
    map:         makeGlowTexture(hex),
    transparent: true,
    opacity:     0.34,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.72), mat);
  m.rotation.x  = -Math.PI / 2;
  m.position.y  = 0.012;
  m.renderOrder = 2;
  scene.add(m);
  return m;
}

const lReflection = makeFloorReflectionSprite(THEME.left);
const rReflection = makeFloorReflectionSprite(THEME.right);

const arenaBackground = createArenaBackground(scene, initialPerfProfile.arenaDetail);
export const bgMat = arenaBackground.material;
const bgMesh = arenaBackground.mesh;


export const lSaber = createSaber(THEME.left);
export const rSaber = createSaber(THEME.right);
lSaber.position.set(-0.45, 1.1, 1.5);
rSaber.position.set( 0.45, 1.1, 1.5);
scene.add(lSaber, rSaber);

export const lTarget = new THREE.Vector3(-0.45, 1.1, 1.5);
export const rTarget = new THREE.Vector3( 0.45, 1.1, 1.5);
export const lVel    = new THREE.Vector3();
export const rVel    = new THREE.Vector3();

function applySaberVisibility(): void {
  const leftActive = activeOneHandMode !== 'right';
  const rightActive = activeOneHandMode !== 'left';
  lSaber.visible = leftActive;
  rSaber.visible = rightActive;
  lLight.visible = leftActive;
  rLight.visible = rightActive;
  lReflection.visible = leftActive && Boolean(perfProfile.floorGlows);
  rReflection.visible = rightActive && Boolean(perfProfile.floorGlows);
  lBlobShadow.visible = leftActive;
  rBlobShadow.visible = rightActive;
}

export function setOneHandModeVisuals(mode: OneHandMode): void {
  activeOneHandMode = mode;
  applySaberVisibility();
}

function publishSaberColorCss(side: 'left' | 'right', color: THREE.Color): void {
  const hex = color.getHexString();
  const rgb = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]
    .map(channel => parseInt(channel, 16))
    .join(',');
  document.documentElement.style.setProperty(`--${side}`, `#${hex}`);
  document.documentElement.style.setProperty(`--${side}-rgb`, rgb);
}

publishSaberColorCss('left', new THREE.Color(THEME.left));
publishSaberColorCss('right', new THREE.Color(THEME.right));

export function getSaberColor(side: 'left' | 'right'): number {
  const saber = side === 'left' ? lSaber : rSaber;
  return (saber.userData as SaberUserData).color;
}

export function setSaberColor(side: 'left' | 'right', hex: string): void {
  const saber      = side === 'left' ? lSaber : rSaber;
  const light      = side === 'left' ? lLight : rLight;
  const reflection = side === 'left' ? lReflection : rReflection;
  const colorDef   = SABER_COLORS.find(c => c.hex.toLowerCase() === String(hex).toLowerCase());
  const colorHex   = colorDef?.hex ?? hex;
  const color      = new THREE.Color(colorHex);
  const ud         = saber.userData as SaberUserData;

  if (ud.bladeGlow) ud.bladeGlow.color.set(color);
  if (ud.outerGlow) ud.outerGlow.color.set(color);

  light.color.set(color);

  if (reflection?.material) {
    reflection.material.map?.dispose();
    reflection.material.map = makeGlowTexture(new THREE.Color(colorHex).getHex());
    reflection.material.map.needsUpdate  = true;
    reflection.material.needsUpdate      = true;
  }

  saber.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = child.material as THREE.MeshStandardMaterial;
    if (mat?.emissive !== undefined && mat.emissiveIntensity > 0) {
      mat.color.set(color);
      mat.emissive.set(color);
      mat.needsUpdate = true;
    }
  });

  const railMats = side === 'left' ? leftRailMats : rightRailMats;
  for (const railMat of railMats) {
    railMat.color.set(color);
    railMat.needsUpdate = true;
  }
  const ribMats = side === 'left'
    ? [leftRibMaterial, leftRibGlowMaterial]
    : [rightRibMaterial, rightRibGlowMaterial];
  for (const ribMat of ribMats) {
    ribMat.color.set(color);
    ribMat.needsUpdate = true;
  }

  ud.color = new THREE.Color(colorHex).getHex();
  publishSaberColorCss(side, color);
}

export type { SaberModel } from './saber-visual.ts';

export function setSaberModel(side: 'left' | 'right', model: SaberModel): void {
  applySaberModel(side === 'left' ? lSaber : rSaber, model);
}

export function animateIdleSabers(t: number): void {
  lSaber.position.set(-0.45 + Math.sin(t * 0.7) * 0.08, 1.1 + Math.sin(t * 0.5) * 0.1, 1.5);
  rSaber.position.set( 0.45 + Math.sin(t * 0.7 + 1.2) * 0.08, 1.1 + Math.sin(t * 0.5 + 1.0) * 0.1, 1.5);
  lSaber.rotation.z = -0.18 + Math.sin(t * 0.4) * 0.06;
  rSaber.rotation.z =  0.18 + Math.sin(t * 0.4 + 1.0) * 0.06;
}

let reflectFrame = 0;
const reflectedLookTarget = new THREE.Vector3();
export function updateReflection(): void {
  if (!perfProfile.reflections) return;
  reflectFrame++;
  if (reflectFrame % 4 !== 0) return;
  cam3d.getWorldDirection(reflectedLookTarget);
  reflectedLookTarget.add(cam3d.position);
  reflectedLookTarget.y *= -1;
  reflectCam.position.copy(cam3d.position);
  reflectCam.position.y *= -1;
  reflectCam.up.copy(cam3d.up);
  reflectCam.up.y *= -1;
  reflectCam.lookAt(reflectedLookTarget);
  reflectCam.fov = cam3d.fov;
  reflectCam.aspect = cam3d.aspect;
  reflectCam.near = cam3d.near;
  reflectCam.far = cam3d.far;
  reflectCam.updateProjectionMatrix();
  reflectCam.updateMatrixWorld();
  floorReflect.updateMatrixWorld();
  reflectionTextureMatrix.set(
    0.5, 0,   0, 0.5,
    0,   0.5, 0, 0.5,
    0,   0,   0.5, 0.5,
    0,   0,   0, 1,
  );
  reflectionTextureMatrix.multiply(reflectCam.projectionMatrix);
  reflectionTextureMatrix.multiply(reflectCam.matrixWorldInverse);
  reflectionTextureMatrix.multiply(floorReflect.matrixWorld);
  const previousTarget = renderer.getRenderTarget();
  const floorLayers = [floorReflect, floorSheen, gridH, lReflection, rReflection, lBlobShadow, rBlobShadow];
  const floorLayerVisibility = floorLayers.map(layer => layer.visible);
  for (const layer of floorLayers) layer.visible = false;
  try {
    renderer.setRenderTarget(reflectTarget);
    renderer.render(scene, reflectCam);
  } finally {
    renderer.setRenderTarget(previousTarget);
    floorLayers.forEach((layer, index) => { layer.visible = floorLayerVisibility[index] ?? false; });
  }
}

export function updateArenaPulse(
  t: number,
  musicEnergy: number,
  beatPulse: number,
  visualPressure = 0,
): void {
  const energy = THREE.MathUtils.clamp(musicEnergy, 0, 1.5);
  const beat = THREE.MathUtils.clamp(beatPulse, 0, 1.5);
  const pressure = THREE.MathUtils.clamp(visualPressure, 0, 1);
  const readability = 1 - pressure * 0.48;
  const detail = THREE.MathUtils.clamp(perfProfile.arenaDetail, 0, 1.25);
  const idleWave = 0.5 + Math.sin(t * 2.2) * 0.5;
  const railPulse = (energy * 0.18 + beat * 0.34 + idleWave * 0.025) * detail * readability;

  for (const materials of [leftRailMats, rightRailMats]) {
    materials[0]!.opacity = THREE.MathUtils.clamp(0.64 + railPulse, 0.42, 1);
    materials[1]!.opacity = THREE.MathUtils.clamp(0.11 + railPulse * 0.72, 0.06, 0.42);
  }
  leftRibMaterial.opacity = rightRibMaterial.opacity = THREE.MathUtils.clamp(
    0.28 + railPulse * 0.72,
    0.22,
    0.62,
  );
  leftRibGlowMaterial.opacity = rightRibGlowMaterial.opacity = THREE.MathUtils.clamp(
    0.055 + railPulse * 0.32,
    0.04,
    0.18,
  );

  floorMat.opacity = THREE.MathUtils.clamp(0.28 + energy * 0.035 + beat * 0.025, 0.24, 0.42);
  if (perfProfile.reflections) {
    const reflectionQuality = THREE.MathUtils.clamp(detail, 0.45, 1);
    floorReflectMat.uniforms['uOpacity']!.value = THREE.MathUtils.clamp(
      (0.16 + energy * 0.055 + beat * 0.04) * reflectionQuality * readability,
      0.08,
      0.32,
    );
  }
}

export function updateLightReflections(
  t: number,
  musicEnergy: number,
  beatPulse: number,
  visualPressure = 0,
): void {
  const lMotion = THREE.MathUtils.clamp(lVel.length() * 12, 0, 1);
  const rMotion = THREE.MathUtils.clamp(rVel.length() * 12, 0, 1);
  const trailIntensity = THREE.MathUtils.clamp(perfProfile.saberTrailIntensity || 0, 0, 1.25);
  const motionGlow = perfProfile.saberTrails ? 0.22 * trailIntensity : 0;
  (lSaber.userData as SaberUserData).outerGlow.opacity = 0.18 + lMotion * motionGlow;
  (rSaber.userData as SaberUserData).outerGlow.opacity = 0.18 + rMotion * motionGlow;
  if (!perfProfile.floorGlows && !perfProfile.saberGlints) return;
  const energy = THREE.MathUtils.clamp(musicEnergy, 0, 1.5);
  const beat = THREE.MathUtils.clamp(beatPulse, 0, 1.5);
  const pressure = THREE.MathUtils.clamp(visualPressure, 0, 1);
  const detail = THREE.MathUtils.clamp(perfProfile.arenaDetail, 0, 1.25);
  const idlePulse = 0.5 + Math.sin(t * 2.2) * 0.5;
  const sharedGlow = (0.12 + idlePulse * 0.012 + energy * 0.055 + beat * 0.075)
    * (0.72 + detail * 0.28)
    * (1 - pressure * 0.48);
  if (perfProfile.floorGlows) {
    lReflection.position.set(lSaber.position.x, 0.012, lSaber.position.z - 0.12);
    rReflection.position.set(rSaber.position.x, 0.012, rSaber.position.z - 0.12);
    lReflection.scale.set(0.85 + Math.abs(lVel.x) * 1.8, 1.0 + Math.abs(lVel.y) * 0.7, 1);
    rReflection.scale.set(0.85 + Math.abs(rVel.x) * 1.8, 1.0 + Math.abs(rVel.y) * 0.7, 1);
    lReflection.material.opacity = THREE.MathUtils.clamp(sharedGlow + lMotion * 0.035, 0.08, 0.32);
    rReflection.material.opacity = THREE.MathUtils.clamp(sharedGlow + rMotion * 0.035, 0.08, 0.32);
  }

  lBlobShadow.position.set(lSaber.position.x, 0.002, lSaber.position.z);
  rBlobShadow.position.set(rSaber.position.x, 0.002, rSaber.position.z);

  if (!perfProfile.saberGlints) return;
  for (const s of [lSaber, rSaber]) {
    const ud    = s.userData as SaberUserData;
    const phase = (t * 1.7 + (s === lSaber ? 0 : 1.4)) % 1;
    const glint = Math.max(0, Math.sin(phase * Math.PI));
    ud.shineMesh.position.y  = 0.25 + phase * 0.82;
    ud.shine2Mesh.position.y = 0.55 + ((phase + 0.36) % 1) * 0.48;
    ud.shineMat.opacity      = glint * 0.22;
    ud.shine2Mat.opacity     = glint * 0.14;
  }
}

export function setWireframeVisible(visible: boolean): void {
  const on = Boolean(visible);
  for (const saber of [lSaber, rSaber]) {
    const ud = saber.userData as SaberUserData;
    if (!ud.wireMesh || !ud.wireMat) continue;
    ud.wireMat.color.set(0xffffff);
    ud.wireMat.opacity          = on ? 0.42 : 0;
    ud.wireMat.visible          = on;
    ud.wireMesh.visible         = on;
    ud.wireMesh.scale.setScalar(on ? 1 : 0.0001);
    ud.wireMesh.frustumCulled   = !on;
    ud.wireMesh.matrixWorldNeedsUpdate = true;
  }
}

export function resizeRenderer(): void {
  cam3d.aspect = window.innerWidth / window.innerHeight;
  cam3d.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function triggerShake(intensity = 0.06): void {
  triggerCameraShake(intensity);
}

export function applyShake(deltaScale = 1): void {
  applyCameraShake(cam3d, deltaScale);
}

let currentDpr           = clampDpr(window.devicePixelRatio || 1, perfProfile);
let qualityLastCheckAt   = 0;
const QUALITY_CHECK_MS   = 1500;
let _lastResizeAt        = 0;
let autoSlowChecks       = 0;
let autoFastChecks       = 0;
let lastAutoTierChangeAt = 0;

function publishGraphicsStatus(): void {
  window.__graphicsProfile     = perfProfile.label;
  window.__graphicsMode        = perfProfile.mode;
  window.__graphicsQualityMode = perfProfile.qualityMode ?? perfProfile.mode;
  window.__graphicsDpr         = currentDpr;
}

function applyDecorVisibility(): void {
  const reflectionOn = Boolean(perfProfile.reflections);
  floorReflect.visible  = reflectionOn;
  specTopL.visible      = Boolean(perfProfile.decorativeLights);
  rimL.visible          = Boolean(perfProfile.decorativeLights);
  backL.visible         = Boolean(perfProfile.decorativeLights);
  arenaRibs.visible     = Boolean(perfProfile.decorativeLights) && perfProfile.arenaDetail >= 0.6;
  applySaberVisibility();
  bgMesh.visible        = Boolean(perfProfile.backgroundShader);
  if (bgMat.uniforms['uDetail']) bgMat.uniforms['uDetail'].value = perfProfile.arenaDetail;
  gridH.visible         = Boolean(perfProfile.grid);
  scene.fog             = perfProfile.fog ? sceneFog : null;
  for (const s of [lSaber, rSaber]) {
    const ud = s.userData as SaberUserData;
    if (!perfProfile.saberGlints) {
      ud.shineMat.opacity  = 0;
      ud.shine2Mat.opacity = 0;
    }
  }
}

function applyActiveProfileDpr(targetDpr: number | null = null): void {
  applyDecorVisibility();
  renderer.toneMappingExposure = ['lowest', 'very-low', 'low'].includes(perfProfile.qualityMode) ? 1.0 : 1.2;
  const deviceDpr = window.devicePixelRatio || 1;
  const nextDpr   = clampDpr(Number.isFinite(targetDpr ?? NaN) ? targetDpr! : Math.min(deviceDpr, perfProfile.maxDpr), perfProfile);
  if (Math.abs(nextDpr - currentDpr) > 0.01) {
    currentDpr    = nextDpr;
    _lastResizeAt = performance.now();
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  publishGraphicsStatus();
}

function applyRendererAntialias(): void {
  const currentAntialias = Boolean(renderer.getContext().getContextAttributes()?.antialias);
  if (currentAntialias === perfProfile.antialias) return;

  const previousRenderer = renderer;
  const nextCanvas = canvas3d.cloneNode(false) as HTMLCanvasElement;
  canvas3d.replaceWith(nextCanvas);
  canvas3d = nextCanvas;
  renderer = createRenderer(canvas3d, perfProfile);
  previousRenderer.dispose();
  window.dispatchEvent(new CustomEvent('hand-sabers:renderer-canvas-replaced', { detail: canvas3d }));
}

export function setScenePerformanceProfile(settingsOrProfile: Settings | PerformanceProfile = {} as Settings): void {
  perfProfile      = (settingsOrProfile as PerformanceProfile).camera
    ? { ...(settingsOrProfile as PerformanceProfile) }
    : getPerformanceProfile(settingsOrProfile as Settings);
  autoSlowChecks       = 0;
  autoFastChecks       = 0;
  lastAutoTierChangeAt = performance.now();
  applyRendererAntialias();
  applyActiveProfileDpr();
}

export function getScenePerformanceProfile(): PerformanceProfile {
  return perfProfile;
}

function setAutoGraphicsTier(qualityMode: string, now: number): void {
  const nextProfile = getPerformanceProfile({ performanceMode: 'auto', autoQualityMode: qualityMode } as unknown as Settings);
  const targetDpr   = clampDpr(Math.min(currentDpr, nextProfile.maxDpr), nextProfile);
  perfProfile           = nextProfile;
  autoSlowChecks        = 0;
  autoFastChecks        = 0;
  lastAutoTierChangeAt  = now;
  applyActiveProfileDpr(targetDpr);
}

export function adaptRenderQuality(frameMs: number, fps = 0): void {
  if (!perfProfile.auto) return;

  const now = performance.now();
  if (now - qualityLastCheckAt < QUALITY_CHECK_MS) return;
  qualityLastCheckAt = now;

  const targetFrameMs = 1000 / (perfProfile.targetFps || 60);
  const targetFps     = perfProfile.targetFps || 60;
  const slow  = frameMs > targetFrameMs * 1.22 || (fps > 0 && fps < targetFps * 0.82);
  const fast  = frameMs < targetFrameMs * 1.05 && (!fps || fps >= targetFps * 0.92);
  const targetDpr = Math.min(window.devicePixelRatio || 1, perfProfile.maxDpr);
  const next  = slow ? Math.max(perfProfile.minDpr, currentDpr - 0.12) : fast ? Math.min(targetDpr, currentDpr + 0.04) : currentDpr;
  if (Math.abs(next - currentDpr) >= 0.05 && now - _lastResizeAt >= 2000) {
    currentDpr    = next;
    _lastResizeAt = now;
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    publishGraphicsStatus();
  }

  const atMinDpr = currentDpr <= perfProfile.minDpr + 0.03;
  const atMaxDpr = currentDpr >= Math.min(window.devicePixelRatio || 1, perfProfile.maxDpr) - 0.03;
  if (slow && atMinDpr) {
    const emergency = fps > 0 && fps < 25;
    autoSlowChecks += emergency ? 2 : 1;
    autoFastChecks  = 0;
  } else if (fast && atMaxDpr) {
    autoFastChecks++;
    autoSlowChecks = 0;
  } else {
    autoSlowChecks = Math.max(0, autoSlowChecks - 1);
    autoFastChecks = Math.max(0, autoFastChecks - 1);
  }

  if (now - lastAutoTierChangeAt < 4000) return;

  if (autoSlowChecks >= 2) {
    const lower = getAdjacentGraphicsTier(perfProfile.qualityMode, -1);
    if (lower) setAutoGraphicsTier(lower, now);
  } else if (autoFastChecks >= 8) {
    const higher = getAdjacentGraphicsTier(perfProfile.qualityMode, 1);
    if (higher) setAutoGraphicsTier(higher, now);
  }
}

applyDecorVisibility();
publishGraphicsStatus();

export function setArenaTheme(
  bgColor: string,
  fogColor: string,
  ambientColor: string,
  floorColor: string,
): void {
  scene.background = new THREE.Color(bgColor);
  sceneFog.color.set(fogColor);
  ambientLight.color.set(ambientColor);
  floorMat.color.set(floorColor);
}

/** Push a theme's shader palette into the background shader uniforms. */
export function applyBackgroundTheme(palette: ArenaBackgroundPalette): void {
  applyArenaBackgroundTheme(bgMat, palette);
}

function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse(child => {
    (child as THREE.Mesh).geometry?.dispose();
    const mat = (child as THREE.Mesh).material;
    if (Array.isArray(mat)) for (const m of mat) m?.dispose();
    else (mat as THREE.Material | undefined)?.dispose();
  });
}

export function disposeSceneResources(): void {
  reflectTarget.dispose();
  for (const obj of [...scene.children]) disposeObject3D(obj);
  renderer.dispose();
}
