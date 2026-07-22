import { getSaberColor, getScenePerformanceProfile, lSaber, rSaber, scene, THREE } from './scene.ts';

const MAX_TRAIL_SAMPLES = 16;
const VERTICES_PER_SEGMENT = 6;
const POSITION_COMPONENTS = 3;
const MAX_VERTEX_COUNT = (MAX_TRAIL_SAMPLES - 1) * VERTICES_PER_SEGMENT;
const LOCAL_BASE = new THREE.Vector3(0, 0.025, 0);
const localTip = new THREE.Vector3();
const currentBase = new THREE.Vector3();
const currentTip = new THREE.Vector3();

interface TrailUniforms {
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
  uIntensity: { value: number };
}

interface SaberTrail {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial & { uniforms: TrailUniforms };
  mesh: THREE.Mesh;
  positions: Float32Array;
  alphas: Float32Array;
  baseHistory: THREE.Vector3[];
  tipHistory: THREE.Vector3[];
  initialized: boolean;
  lastColor: number;
  lastSampleCount: number;
}

function createTrail(hex: number): SaberTrail {
  const positions = new Float32Array(MAX_VERTEX_COUNT * POSITION_COMPONENTS);
  const alphas = new Float32Array(MAX_VERTEX_COUNT);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, POSITION_COMPONENTS);
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aAlpha', alphaAttribute);
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hex) },
      uOpacity: { value: 0 },
      uIntensity: { value: 1 },
    },
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uIntensity;
      varying float vAlpha;
      void main() {
        float strength = clamp(uIntensity, 0.0, 1.25);
        float alpha = clamp(vAlpha * uOpacity, 0.0, 0.78);
        if (alpha < 0.004) discard;
        float headHeat = pow(vAlpha, 2.2);
        vec3 hotCore = mix(uColor, vec3(1.0), (0.14 + strength * 0.16) * headHeat);
        gl_FragColor = vec4(hotCore, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
  }) as THREE.ShaderMaterial & { uniforms: TrailUniforms };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  scene.add(mesh);

  return {
    geometry,
    material,
    mesh,
    positions,
    alphas,
    baseHistory: Array.from({ length: MAX_TRAIL_SAMPLES }, () => new THREE.Vector3()),
    tipHistory: Array.from({ length: MAX_TRAIL_SAMPLES }, () => new THREE.Vector3()),
    initialized: false,
    lastColor: hex,
    lastSampleCount: 0,
  };
}

const leftTrail = createTrail(getSaberColor('left'));
const rightTrail = createTrail(getSaberColor('right'));

function resetTrail(trail: SaberTrail): void {
  trail.initialized = false;
  trail.lastSampleCount = 0;
  trail.mesh.visible = false;
  trail.material.uniforms.uOpacity.value = 0;
  trail.geometry.setDrawRange(0, 0);
}

function writeVertex(
  trail: SaberTrail,
  vertexIndex: number,
  point: THREE.Vector3,
  alpha: number,
): void {
  const offset = vertexIndex * POSITION_COMPONENTS;
  trail.positions[offset] = point.x;
  trail.positions[offset + 1] = point.y;
  trail.positions[offset + 2] = point.z;
  trail.alphas[vertexIndex] = alpha;
}

function updateTrail(
  trail: SaberTrail,
  saber: THREE.Group,
  colorHex: number,
  sampleCount: number,
  intensity: number,
  deltaSec: number,
): void {
  if (trail.lastSampleCount !== sampleCount) {
    resetTrail(trail);
    trail.lastSampleCount = sampleCount;
  }

  const bladeLength = Math.max(0.8, Math.min(1.35, Number(saber.userData['bladeLength']) || 1.1));
  localTip.set(0, bladeLength + 0.02, 0);
  saber.updateMatrixWorld(true);
  currentBase.copy(LOCAL_BASE).applyMatrix4(saber.matrixWorld);
  currentTip.copy(localTip).applyMatrix4(saber.matrixWorld);

  trail.material.uniforms.uIntensity.value = intensity;

  if (trail.lastColor !== colorHex) {
    trail.lastColor = colorHex;
    trail.material.uniforms.uColor.value.setHex(colorHex);
  }

  if (!trail.initialized) {
    for (let index = 0; index < MAX_TRAIL_SAMPLES; index++) {
      trail.baseHistory[index]!.copy(currentBase);
      trail.tipHistory[index]!.copy(currentTip);
    }
    trail.initialized = true;
    trail.mesh.visible = false;
    return;
  }

  const baseDistance = trail.baseHistory[0]!.distanceTo(currentBase);
  const tipDistance = trail.tipHistory[0]!.distanceTo(currentTip);
  const travel = Math.max(baseDistance, tipDistance);
  if (travel > 1.8) {
    resetTrail(trail);
    return;
  }

  for (let index = sampleCount - 1; index > 0; index--) {
    trail.baseHistory[index]!.copy(trail.baseHistory[index - 1]!);
    trail.tipHistory[index]!.copy(trail.tipHistory[index - 1]!);
  }
  trail.baseHistory[0]!.copy(currentBase);
  trail.tipHistory[0]!.copy(currentTip);

  const speed = travel / Math.max(deltaSec, 1 / 240);
  const movement = THREE.MathUtils.smoothstep(speed, 0.18, 4.8);
  const visible = sampleCount >= 3 && movement > 0.015;
  trail.mesh.visible = visible;
  if (!visible) {
    trail.material.uniforms.uOpacity.value *= 0.72;
    trail.geometry.setDrawRange(0, 0);
    return;
  }

  let vertex = 0;
  for (let segment = 0; segment < sampleCount - 1; segment++) {
    const next = segment + 1;
    const headFade = 1 - segment / Math.max(1, sampleCount - 1);
    const tailFade = 1 - next / Math.max(1, sampleCount - 1);
    const alphaHead = headFade * headFade;
    const alphaTail = tailFade * tailFade;
    const baseHead = trail.baseHistory[segment]!;
    const tipHead = trail.tipHistory[segment]!;
    const baseTail = trail.baseHistory[next]!;
    const tipTail = trail.tipHistory[next]!;

    writeVertex(trail, vertex++, baseHead, alphaHead * 0.58);
    writeVertex(trail, vertex++, tipHead, alphaHead);
    writeVertex(trail, vertex++, baseTail, alphaTail * 0.58);
    writeVertex(trail, vertex++, tipHead, alphaHead);
    writeVertex(trail, vertex++, tipTail, alphaTail);
    writeVertex(trail, vertex++, baseTail, alphaTail * 0.58);
  }

  trail.geometry.setDrawRange(0, vertex);
  (trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (trail.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  trail.material.uniforms.uOpacity.value = (0.10 + movement * 0.43) * intensity;
}

export function updateSaberTrails(active: boolean, deltaSec: number): void {
  const profile = getScenePerformanceProfile();
  const sampleCount = Math.max(0, Math.min(MAX_TRAIL_SAMPLES, Math.round(profile.saberTrailSamples || 0)));
  const intensity = THREE.MathUtils.clamp(profile.saberTrailIntensity || 0, 0, 1.25);
  if (!active || !profile.saberTrails || sampleCount < 3) {
    resetTrail(leftTrail);
    resetTrail(rightTrail);
    return;
  }

  updateTrail(leftTrail, lSaber, getSaberColor('left'), sampleCount, intensity, deltaSec);
  updateTrail(rightTrail, rSaber, getSaberColor('right'), sampleCount, intensity, deltaSec);
}

export function resetSaberTrails(): void {
  resetTrail(leftTrail);
  resetTrail(rightTrail);
}
