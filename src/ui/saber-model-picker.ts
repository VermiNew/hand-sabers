import * as THREE from 'three';
import { applySaberModel, createSaber, disposeSaber, type SaberModel } from '../game/saber-visual.ts';
import { t } from '../i18n/index.ts';
import { createModalTransition } from './modal-transition.ts';

type SaberSide = 'left' | 'right';

interface SaberModelPickerOptions {
  getColor(side: SaberSide): string;
  getModel(side: SaberSide): SaberModel;
  onApply(left: SaberModel, right: SaberModel): void;
}

interface PreviewScene {
  dispose(): void;
  setModel(model: SaberModel, color: string): void;
}

function createPreviewScene(mount: HTMLElement, model: SaberModel, color: string): PreviewScene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070d, 0.12);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 20);
  camera.position.set(0, 0.48, 2.75);
  camera.lookAt(0, 0.42, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  mount.replaceChildren(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0x8fb3ff, 0x08040a, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.2, 3.2, 2.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5578ff, 1.1);
  rim.position.set(-2.4, 1.1, -2);
  scene.add(rim);

  const rig = new THREE.Group();
  rig.rotation.set(-0.08, 0.35, -0.16);
  scene.add(rig);
  let saber = createSaber(new THREE.Color(color).getHex(), model);
  rig.add(saber);

  let frameId = 0;
  let lastTime = performance.now();
  const resize = (): void => {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();

  const render = (now: number): void => {
    rig.rotation.y += Math.min(32, now - lastTime) * 0.00028;
    lastTime = now;
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  };
  frameId = requestAnimationFrame(render);

  return {
    setModel(nextModel, nextColor): void {
      const nextHex = new THREE.Color(nextColor).getHex();
      if ((saber.userData['color'] as number) !== nextHex) {
        rig.remove(saber);
        disposeSaber(saber);
        saber = createSaber(nextHex, nextModel);
        rig.add(saber);
      } else {
        applySaberModel(saber, nextModel);
      }
      const length = Number(saber.userData['bladeLength']) || 1.1;
      camera.position.z = 1.75 + length * 0.95;
    },
    dispose(): void {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      rig.remove(saber);
      disposeSaber(saber);
      renderer.dispose();
      renderer.forceContextLoss();
      mount.replaceChildren();
    },
  };
}

export function initSaberModelPicker({ getColor, getModel, onApply }: SaberModelPickerOptions): void {
  const modal = document.getElementById('saberModelModal');
  const panel = modal?.querySelector<HTMLElement>('.smp-panel');
  const mount = document.getElementById('saberModelPreview');
  const openButton = document.getElementById('saberModelPickerOpen');
  const closeButton = document.getElementById('saberModelPickerClose');
  const cancelButton = document.getElementById('saberModelPickerCancel');
  const applyButton = document.getElementById('saberModelPickerApply');
  const backdrop = modal?.querySelector<HTMLElement>('.smp-backdrop');
  const sideLabel = document.getElementById('saberModelPreviewSide');
  if (!modal || !panel || !mount || !openButton) return;

  let activeSide: SaberSide = 'left';
  let draftLeft: SaberModel = 'classic';
  let draftRight: SaberModel = 'classic';
  let preview: PreviewScene | null = null;

  const transition = createModalTransition({
    overlay: modal,
    panel,
    visibleClass: 'is-open',
    onBeforeClose: () => {
      preview?.dispose();
      preview = null;
      document.body.classList.remove('saber-model-modal-open');
    },
  });

  const currentDraft = (): SaberModel => activeSide === 'left' ? draftLeft : draftRight;

  function sync(): void {
    modal!.querySelectorAll<HTMLElement>('[data-saber-side]').forEach(button => {
      const selected = button.dataset['saberSide'] === activeSide;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    modal!.querySelectorAll<HTMLElement>('[data-picker-saber-model]').forEach(button => {
      const selected = button.dataset['pickerSaberModel'] === currentDraft();
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (sideLabel) {
      sideLabel.textContent = activeSide === 'left'
        ? t('settings.gameplay.leftHand')
        : t('settings.gameplay.rightHand');
    }
    preview?.setModel(currentDraft(), getColor(activeSide));
  }

  function close(): void {
    transition.close();
  }

  openButton.addEventListener('click', () => {
    draftLeft = getModel('left');
    draftRight = getModel('right');
    activeSide = 'left';
    document.body.classList.add('saber-model-modal-open');
    transition.open({ initialFocus: closeButton, returnFocusTo: openButton });
    preview = createPreviewScene(mount, draftLeft, getColor('left'));
    sync();
  });

  modal.querySelectorAll<HTMLButtonElement>('[data-saber-side]').forEach(button => {
    button.addEventListener('click', () => {
      activeSide = button.dataset['saberSide'] === 'right' ? 'right' : 'left';
      sync();
    });
  });
  modal.querySelectorAll<HTMLButtonElement>('[data-picker-saber-model]').forEach(button => {
    button.addEventListener('click', () => {
      const model = button.dataset['pickerSaberModel'] as SaberModel | undefined;
      if (!model) return;
      if (activeSide === 'left') draftLeft = model;
      else draftRight = model;
      sync();
    });
  });
  closeButton?.addEventListener('click', close);
  cancelButton?.addEventListener('click', close);
  backdrop?.addEventListener('pointerdown', close);
  applyButton?.addEventListener('click', () => {
    onApply(draftLeft, draftRight);
    close();
  });
}
