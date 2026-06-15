import * as THREE from 'three';
import { THEME } from '../core/theme.ts';
import { loadSettings } from '../core/settings.ts';
import { SABER_COLORS } from '../core/saber-colors.ts';
import { clampDpr, getAdjacentGraphicsTier, getPerformanceProfile } from '../core/performance.ts';
import type { Settings, PerformanceProfile } from '../types/index.js';

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

const canvas3d = document.getElementById('gameCanvas') as HTMLCanvasElement;
const initialSettings    = loadSettings();
const initialPerfProfile = getPerformanceProfile(initialSettings);
let perfProfile          = initialPerfProfile;

export const renderer = new THREE.WebGLRenderer({
  canvas:          canvas3d,
  antialias:       initialPerfProfile.antialias,
  alpha:           false,
  powerPreference: 'high-performance',
  stencil:         false,
  depth:           true,
});
renderer.setPixelRatio(clampDpr(window.devicePixelRatio || 1, initialPerfProfile));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled   = false;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = ['lowest', 'very-low', 'low'].includes(initialPerfProfile.qualityMode) ? 1.0 : 1.2;
(renderer as unknown as { outputEncoding: number }).outputEncoding = (THREE as unknown as { sRGBEncoding: number }).sRGBEncoding;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(THEME.dark);
scene.fog        = new THREE.FogExp2(THEME.dark, 0.035);

export const cam3d = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 100);
cam3d.position.set(0, 1.55, 3.2);
cam3d.lookAt(0, 1.1, -5);

scene.add(new THREE.AmbientLight(THEME.darkAlt, 2));

const dirL = new THREE.DirectionalLight(THEME.main, 0.6);
dirL.position.set(0, 8, 4);
scene.add(dirL);

const specTopL = new THREE.DirectionalLight(0xdce7f5, 0.55);
specTopL.position.set(1.5, 6, 3);
scene.add(specTopL);

const rimL = new THREE.DirectionalLight(THEME.gray, 0.22);
rimL.position.set(-1, -2, 2);
scene.add(rimL);

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

const floorReflectMat = new THREE.MeshBasicMaterial({
  map:         reflectTarget.texture,
  transparent: true,
  opacity:     0.18,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
});
const floorReflect = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), floorReflectMat);
floorReflect.rotation.x = -Math.PI / 2;
floorReflect.position.y = 0.005;
floorReflect.renderOrder = 1;
scene.add(floorReflect);

function rail(x: number, color: number): void {
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
}
rail(-2.2, THEME.left);
rail(2.2,  THEME.right);

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
  (tex as unknown as { encoding: number }).encoding = (THREE as unknown as { sRGBEncoding: number }).sRGBEncoding;
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

const bgGeo = new THREE.PlaneGeometry(60, 12);
export const bgMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime;
    void main(){
      vec3 c1=vec3(0.05,0.54,0.32);
      vec3 c2=vec3(0.08,0.22,0.78);
      vec3 c=mix(c1,c2,vUv.x+sin(uTime*0.3)*0.1);
      gl_FragColor=vec4(c,vUv.y*0.18);
    }
  `,
});
const bgMesh = new THREE.Mesh(bgGeo, bgMat);
bgMesh.position.set(0, 1, -18);
bgMesh.rotation.x = -0.1;
scene.add(bgMesh);

interface SaberUserData {
  bladeGlow:   THREE.MeshBasicMaterial;
  outerGlow:   THREE.MeshBasicMaterial;
  shineMat:    THREE.MeshBasicMaterial;
  shineMesh:   THREE.Mesh;
  shine2Mat:   THREE.MeshBasicMaterial;
  shine2Mesh:  THREE.Mesh;
  color:       number;
  wireMat:     THREE.MeshBasicMaterial;
  wireMesh:    THREE.Mesh;
}

function makeSaber(hex: number): THREE.Group {
  const g         = new THREE.Group();
  const specColor = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.55);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.038, 0.28, 10),
    new THREE.MeshPhongMaterial({ color: 0x263241, specular: specColor, shininess: 90, reflectivity: 0.4 })
  );
  handle.position.y = -0.14;
  g.add(handle);

  for (let i = -2; i <= 2; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.005, 6, 14),
      new THREE.MeshPhongMaterial({ color: THEME.gray, specular: 0xffffff, shininess: 220 })
    );
    ring.position.y = -0.14 + i * 0.055;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.022, 0.05),
    new THREE.MeshPhongMaterial({
      color:    0x334152,
      specular: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.3),
      shininess: 160,
    })
  );
  g.add(guard);

  const emitter = new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.007, 8, 16),
    new THREE.MeshPhongMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.2, specular: 0xffffff, shininess: 180 })
  );
  emitter.position.y = 0.02;
  emitter.rotation.x = Math.PI / 2;
  g.add(emitter);

  const bladeCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.01, 1.1, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  bladeCore.position.y = 0.57;
  g.add(bladeCore);

  const bgMat2 = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const bladeGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.1, 6), bgMat2);
  bladeGlow.position.y = 0.57;
  g.add(bladeGlow);

  const ogMat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const outerGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 1.1, 6), ogMat);
  outerGlow.position.y = 0.57;
  g.add(outerGlow);

  const shMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const shMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.28), shMat);
  shMesh.position.set(0.013, 0.55, 0.012);
  g.add(shMesh);

  const sh2Mat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const sh2Mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.003, 0.12), sh2Mat);
  sh2Mesh.position.set(0.013, 0.8, 0.012);
  g.add(sh2Mesh);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.013, 0.07, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  tip.position.y = 1.155;
  g.add(tip);

  const wireGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.18, 8);
  const wireMat = new THREE.MeshBasicMaterial({
    color:       0xffffff,
    wireframe:   true,
    transparent: true,
    opacity:     0.42,
    depthWrite:  false,
    depthTest:   false,
  });
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  wireMesh.position.y = 0.59;
  wireMesh.renderOrder = 999;
  wireMesh.visible = false;
  wireMesh.scale.setScalar(0.0001);
  wireMat.visible = false;
  g.add(wireMesh);

  g.frustumCulled = false;
  g.userData = {
    bladeGlow: bgMat2, outerGlow: ogMat,
    shineMat: shMat,   shineMesh: shMesh,
    shine2Mat: sh2Mat, shine2Mesh: sh2Mesh,
    color: hex, wireMat, wireMesh,
  } satisfies SaberUserData;
  return g;
}

export const lSaber = makeSaber(THEME.left);
export const rSaber = makeSaber(THEME.right);
lSaber.position.set(-0.45, 1.1, 1.5);
rSaber.position.set( 0.45, 1.1, 1.5);
scene.add(lSaber, rSaber);

export const lTarget = new THREE.Vector3(-0.45, 1.1, 1.5);
export const rTarget = new THREE.Vector3( 0.45, 1.1, 1.5);
export const lVel    = new THREE.Vector3();
export const rVel    = new THREE.Vector3();

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

  ud.color = new THREE.Color(colorHex).getHex();
}

export function animateIdleSabers(t: number): void {
  lSaber.position.set(-0.45 + Math.sin(t * 0.7) * 0.08, 1.1 + Math.sin(t * 0.5) * 0.1, 1.5);
  rSaber.position.set( 0.45 + Math.sin(t * 0.7 + 1.2) * 0.08, 1.1 + Math.sin(t * 0.5 + 1.0) * 0.1, 1.5);
  lSaber.rotation.z = -0.18 + Math.sin(t * 0.4) * 0.06;
  rSaber.rotation.z =  0.18 + Math.sin(t * 0.4 + 1.0) * 0.06;
}

let reflectFrame = 0;
export function updateReflection(): void {
  if (!perfProfile.reflections) return;
  reflectFrame++;
  if (reflectFrame % 4 !== 0) return;
  reflectCam.position.set(cam3d.position.x, -cam3d.position.y + 0.01, cam3d.position.z);
  reflectCam.lookAt(0, -1.1, -5);
  reflectCam.fov    = cam3d.fov;
  reflectCam.aspect = 1;
  reflectCam.updateProjectionMatrix();
  const previousTarget  = renderer.getRenderTarget();
  const reflectVisible  = floorReflect.visible;
  floorReflect.visible  = false;
  renderer.setRenderTarget(reflectTarget);
  renderer.render(scene, reflectCam);
  renderer.setRenderTarget(previousTarget);
  floorReflect.visible  = reflectVisible;
}

export function updateLightReflections(t: number): void {
  if (!perfProfile.floorGlows && !perfProfile.saberGlints) return;
  const pulse = 0.85 + Math.sin(t * 6) * 0.15;
  if (perfProfile.floorGlows) {
    lReflection.position.set(lSaber.position.x, 0.012, lSaber.position.z - 0.12);
    rReflection.position.set(rSaber.position.x, 0.012, rSaber.position.z - 0.12);
    lReflection.scale.set(0.85 + Math.abs(lVel.x) * 1.8, 1.0 + Math.abs(lVel.y) * 0.7, 1);
    rReflection.scale.set(0.85 + Math.abs(rVel.x) * 1.8, 1.0 + Math.abs(rVel.y) * 0.7, 1);
    lReflection.material.opacity = 0.20 * pulse;
    rReflection.material.opacity = 0.20 * (1.7 - pulse);
  }

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

let shakeIntensity  = 0;
const shakeDecay    = 0.88;

export function triggerShake(intensity = 0.06): void {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

export function applyShake(deltaScale = 1): void {
  if (shakeIntensity < 0.001) { shakeIntensity = 0; return; }
  const scale = Math.max(0, Math.min(deltaScale, 3));
  if (scale <= 0) return;
  const impulseScale  = Math.sqrt(scale);
  cam3d.position.x   += (Math.random() - 0.5) * shakeIntensity * impulseScale;
  cam3d.position.y   += (Math.random() - 0.5) * shakeIntensity * 0.5 * impulseScale;
  shakeIntensity     *= Math.pow(shakeDecay, scale);
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
  const floorGlowOn  = Boolean(perfProfile.floorGlows);
  floorReflect.visible  = reflectionOn;
  lReflection.visible   = floorGlowOn;
  rReflection.visible   = floorGlowOn;
  bgMesh.visible        = Boolean(perfProfile.backgroundShader);
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

export function setScenePerformanceProfile(settingsOrProfile: Settings | PerformanceProfile = {} as Settings): void {
  perfProfile      = (settingsOrProfile as PerformanceProfile).camera
    ? { ...(settingsOrProfile as PerformanceProfile) }
    : getPerformanceProfile(settingsOrProfile as Settings);
  autoSlowChecks       = 0;
  autoFastChecks       = 0;
  lastAutoTierChangeAt = performance.now();
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
