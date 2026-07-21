import * as THREE from 'three';
import { getPlayPos } from './audio.ts';
import { state } from './state.ts';
import { showToast } from './dialogs.ts';
import type { CreatorBeat } from './state.ts';
import { t } from '../i18n/index.ts';

const LOOK_AHEAD_SECONDS = 4;
const APPROACH_SPEED = 5.5;

interface PreviewObject extends THREE.Object3D {
  userData: { kind?: string };
}

function beatKind(beat: CreatorBeat): string {
  if (beat.type === 'bomb') return 'bomb';
  if (beat.type === 'held') return 'held';
  return 'block';
}

function beatX(beat: CreatorBeat): number {
  if (Number.isFinite(beat.x)) return beat.x!;
  if (beat.side === 'left') return -0.82;
  if (beat.side === 'right') return 0.82;
  return Math.sin(beat.t * 12.9898) * 0.9;
}

function cutRotation(cut: string): number {
  const rotations: Record<string, number> = {
    up: 0,
    'up-right': -Math.PI / 4,
    right: -Math.PI / 2,
    'down-right': -Math.PI * 0.75,
    down: Math.PI,
    'down-left': Math.PI * 0.75,
    left: Math.PI / 2,
    'up-left': Math.PI / 4,
  };
  return rotations[cut] ?? 0;
}

export function initCreatorPreview3d(): void {
  const foundCanvas = document.getElementById('creatorPreviewCanvas') as HTMLCanvasElement | null;
  if (!foundCanvas) return;
  const canvas: HTMLCanvasElement = foundCanvas;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030711);
  scene.fog = new THREE.Fog(0x030711, 9, 24);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 40);
  camera.position.set(0, 2.5, -4.5);
  camera.lookAt(0, 1.05, 5.5);

  scene.add(new THREE.HemisphereLight(0x9bc7ff, 0x08101c, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-2, 5, -3);
  scene.add(keyLight);

  const floor = new THREE.GridHelper(12, 24, 0x23558e, 0x10243c);
  floor.position.set(0, 0, 7);
  scene.add(floor);

  const hitLine = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.025, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xff315f }),
  );
  hitLine.position.set(0, 0.03, 0);
  scene.add(hitLine);

  const blockGeometry = new THREE.BoxGeometry(0.56, 0.56, 0.56);
  const bombGeometry = new THREE.IcosahedronGeometry(0.32, 1);
  const cutGeometry = new THREE.BoxGeometry(0.08, 0.36, 0.025);
  const materials = {
    left: new THREE.MeshStandardMaterial({ color: 0x36f2a1, emissive: 0x0b4d35, roughness: 0.4 }),
    right: new THREE.MeshStandardMaterial({ color: 0x2f7cff, emissive: 0x0d2d67, roughness: 0.4 }),
    random: new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0x382260, roughness: 0.4 }),
    bomb: new THREE.MeshStandardMaterial({ color: 0xff4455, emissive: 0x5a1018, roughness: 0.65 }),
    cut: new THREE.MeshBasicMaterial({ color: 0xf7fbff }),
  };
  const activeObjects = new Map<CreatorBeat, PreviewObject>();

  function createPreviewObject(beat: CreatorBeat): PreviewObject {
    const kind = beatKind(beat);
    if (kind === 'bomb') {
      const bomb = new THREE.Mesh(bombGeometry, materials.bomb) as PreviewObject;
      bomb.userData.kind = kind;
      return bomb;
    }
    const group = new THREE.Group() as PreviewObject;
    const sideMaterial = beat.side === 'left' ? materials.left : beat.side === 'right' ? materials.right : materials.random;
    const block = new THREE.Mesh(blockGeometry, sideMaterial);
    const cut = new THREE.Mesh(cutGeometry, materials.cut);
    cut.position.z = -0.295;
    cut.rotation.z = cutRotation(beat.cut);
    group.add(block, cut);
    group.userData.kind = kind;
    return group;
  }

  function syncObjects(now: number): void {
    const visible = new Set<CreatorBeat>();
    for (const beat of state.map.beats) {
      const delta = beat.t - now;
      if (delta < -0.18 || delta > LOOK_AHEAD_SECONDS) continue;
      visible.add(beat);
      const kind = beatKind(beat);
      let object = activeObjects.get(beat);
      if (object?.userData.kind !== kind) {
        if (object) scene.remove(object);
        object = createPreviewObject(beat);
        activeObjects.set(beat, object);
        scene.add(object);
      }
      object.position.set(beatX(beat), Number.isFinite(beat.y) ? beat.y! : 1.1, Math.max(0, delta * APPROACH_SPEED));
      object.rotation.y = kind === 'bomb' ? now * 1.8 : 0;
      if (kind !== 'bomb') {
        const block = object.children[0] as THREE.Mesh;
        const cut = object.children[1] as THREE.Mesh;
        block.material = beat.side === 'left' ? materials.left : beat.side === 'right' ? materials.right : materials.random;
        cut.rotation.z = cutRotation(beat.cut);
      }
      const selectedScale = state.selectedBeats.has(beat) ? 1.18 : 1;
      object.scale.set(selectedScale, selectedScale, selectedScale);
      if (kind === 'held') {
        const length = Math.max(0.7, (beat.duration ?? 0) * APPROACH_SPEED);
        object.scale.z = length;
        object.position.z += (length - 1) * 0.28;
      }
    }
    for (const [beat, object] of activeObjects) {
      if (visible.has(beat) && state.map.beats.includes(beat)) continue;
      scene.remove(object);
      activeObjects.delete(beat);
    }
  }

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    if (canvas.width === Math.round(width * renderer.getPixelRatio())
      && canvas.height === Math.round(height * renderer.getPixelRatio())) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  let frameId = 0;
  let lastRenderErrorAt = 0;
  const render = (): void => {
    try {
      resize();
      syncObjects(getPlayPos());
      renderer.render(scene, camera);
    } catch (error) {
      console.error('[creator:3d-preview]', error);
      const now = Date.now();
      if (now - lastRenderErrorAt > 5_000) {
        lastRenderErrorAt = now;
        showToast(t('creator.previewError'), { type: 'error' });
      }
    } finally {
      frameId = requestAnimationFrame(render);
    }
  };
  frameId = requestAnimationFrame(render);

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frameId);
    renderer.dispose();
    blockGeometry.dispose();
    bombGeometry.dispose();
    cutGeometry.dispose();
    Object.values(materials).forEach(material => material.dispose());
  }, { once: true });
}
