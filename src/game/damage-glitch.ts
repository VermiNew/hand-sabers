import * as THREE from 'three';

const OVERLAY_LAYER = 31;
const OVERLAY_DISTANCE = 0.11;

interface DamageGlitchOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  timeSec: number;
  deltaSec: number;
  hp: number;
  active: boolean;
  enabled: boolean;
}

interface DamageGlitchUniforms {
  [name: string]: THREE.IUniform<number>;
  uTime: { value: number };
  uIntensity: { value: number };
  uBurst: { value: number };
  uAspect: { value: number };
}

let overlay: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
let uniforms: DamageGlitchUniforms | null = null;
let currentIntensity = 0;
let burstIntensity = 0;
let lastHp: number | null = null;

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uBurst;
  uniform float uAspect;
  varying vec2 vUv;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 centred = vUv - 0.5;
    centred.x *= uAspect;
    float edge = smoothstep(0.34, 0.72, length(centred));

    float timeCell = floor(uTime * mix(5.0, 13.0, uIntensity));
    float row = floor(vUv.y * 92.0);
    float rowNoise = hash(vec2(row, timeCell));
    float activeRow = step(0.965 - uIntensity * 0.075 - uBurst * 0.08, rowNoise);
    float thinBand = 1.0 - smoothstep(0.0, 0.055, abs(fract(vUv.y * 46.0 + rowNoise) - 0.5));
    float block = activeRow * thinBand;

    float scan = 0.5 + 0.5 * sin(vUv.y * 920.0 + uTime * 23.0);
    scan = smoothstep(0.91, 1.0, scan) * edge;

    float sideNoise = hash(vec2(floor(vUv.y * 18.0), timeCell + 19.0));
    float sideBand = step(0.88 - uIntensity * 0.08, sideNoise)
      * smoothstep(0.28, 0.48, abs(vUv.x - 0.5));

    vec3 redSignal = vec3(1.0, 0.055, 0.12);
    vec3 cyanSignal = vec3(0.0, 0.72, 1.0);
    vec3 color = mix(redSignal, cyanSignal, step(0.5, rowNoise));
    color += redSignal * edge * (0.35 + uBurst * 0.45);
    color += cyanSignal * sideBand * 0.36;

    float alpha = edge * (0.028 + uIntensity * 0.09)
      + scan * uIntensity * 0.035
      + block * (0.04 + uIntensity * 0.11 + uBurst * 0.12)
      + sideBand * uIntensity * 0.055;
    alpha *= uIntensity;

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.32));
  }
`;

function ensureOverlay(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
  if (overlay) return;

  uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uBurst: { value: 0 },
    uAspect: { value: camera.aspect },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  overlay.position.z = -OVERLAY_DISTANCE;
  overlay.frustumCulled = false;
  overlay.renderOrder = 10_000;
  overlay.layers.set(OVERLAY_LAYER);
  overlay.visible = false;

  camera.layers.enable(OVERLAY_LAYER);
  camera.add(overlay);
  if (!camera.parent) scene.add(camera);
}

function targetIntensityForHp(hp: number): number {
  if (hp === 1) return 1;
  if (hp === 2) return 0.58;
  if (hp === 3) return 0.24;
  return 0;
}

function fitOverlayToCamera(camera: THREE.PerspectiveCamera): void {
  if (!overlay || !uniforms) return;
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * OVERLAY_DISTANCE;
  overlay.scale.set(height * camera.aspect * 0.5, height * 0.5, 1);
  uniforms.uAspect.value = camera.aspect;
}

export function updateDamageGlitch({
  scene,
  camera,
  timeSec,
  deltaSec,
  hp,
  active,
  enabled,
}: DamageGlitchOptions): void {
  ensureOverlay(scene, camera);
  if (!overlay || !uniforms) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = active && enabled && !reducedMotion ? targetIntensityForHp(hp) : 0;
  const smoothing = 1 - Math.exp(-Math.max(0, deltaSec) * (target > currentIntensity ? 7 : 4));
  currentIntensity = THREE.MathUtils.lerp(currentIntensity, target, smoothing);

  if (lastHp !== null && hp < lastHp && hp <= 3 && active && enabled && !reducedMotion) {
    burstIntensity = 1;
  }
  lastHp = hp;
  burstIntensity *= Math.exp(-Math.max(0, deltaSec) * 5.5);

  uniforms.uTime.value = timeSec;
  uniforms.uIntensity.value = currentIntensity;
  uniforms.uBurst.value = burstIntensity;
  overlay.visible = currentIntensity > 0.003 || burstIntensity > 0.01;
  if (overlay.visible) fitOverlayToCamera(camera);
}
