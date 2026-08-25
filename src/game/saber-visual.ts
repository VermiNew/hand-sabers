import { THEME } from '../core/theme.ts';
import * as THREE from 'three';

export interface SaberUserData {
  bladeGlow:   THREE.MeshBasicMaterial;
  outerGlow:   THREE.MeshBasicMaterial;
  bladeCoreMesh:  THREE.Mesh;
  bladeGlowMesh:  THREE.Mesh;
  outerGlowMesh:  THREE.Mesh;
  shineMat:    THREE.MeshBasicMaterial;
  shineMesh:   THREE.Mesh;
  shine2Mat:   THREE.MeshBasicMaterial;
  shine2Mesh:  THREE.Mesh;
  color:       number;
  wireMat:     THREE.MeshBasicMaterial;
  wireMesh:    THREE.Mesh;
  bladeLength: number;
}

export function createSaber(hex: number): THREE.Group {
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

  const bgMat2 = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const bladeGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.1, 6), bgMat2);
  bladeGlow.position.y = 0.57;
  g.add(bladeGlow);

  const ogMat = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
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
    bladeCoreMesh: bladeCore, bladeGlowMesh: bladeGlow, outerGlowMesh: outerGlow,
    shineMat: shMat,   shineMesh: shMesh,
    shine2Mat: sh2Mat, shine2Mesh: sh2Mesh,
    color: hex, wireMat, wireMesh, bladeLength: 1.1,
  } satisfies SaberUserData;
  return g;
}

export type SaberModel = 'classic' | 'wide' | 'thin' | 'prism' | 'edge' | 'pulse';

interface SaberModelSpec {
  coreR: number;
  glowR: number;
  outerR: number;
  length: number;
  segments: number;
  depth: number;
}

const SABER_MODELS: Record<SaberModel, SaberModelSpec> = {
  classic: { coreR: 0.007, glowR: 0.022, outerR: 0.038, length: 1.10, segments: 6,  depth: 1.00 },
  wide:    { coreR: 0.013, glowR: 0.038, outerR: 0.060, length: 1.00, segments: 8,  depth: 1.00 },
  thin:    { coreR: 0.004, glowR: 0.013, outerR: 0.024, length: 1.20, segments: 6,  depth: 1.00 },
  prism:   { coreR: 0.008, glowR: 0.025, outerR: 0.042, length: 1.14, segments: 4,  depth: 1.00 },
  edge:    { coreR: 0.010, glowR: 0.026, outerR: 0.043, length: 1.08, segments: 4,  depth: 0.42 },
  pulse:   { coreR: 0.009, glowR: 0.032, outerR: 0.054, length: 1.04, segments: 12, depth: 1.00 },
};

export function applySaberModel(saber: THREE.Group, model: SaberModel): void {
  const spec  = SABER_MODELS[model] ?? SABER_MODELS.classic;
  const ud = saber.userData as SaberUserData;
  const bladeCenter = spec.length / 2 + 0.02;

  const replaceBladeGeometry = (mesh: THREE.Mesh, topRadius: number, bottomRadius: number): void => {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, spec.length, spec.segments);
    mesh.position.y = bladeCenter;
    mesh.scale.set(1, 1, spec.depth);
  };

  replaceBladeGeometry(ud.bladeCoreMesh, spec.coreR, spec.coreR * 1.35);
  replaceBladeGeometry(ud.bladeGlowMesh, spec.glowR, spec.glowR * 1.18);
  replaceBladeGeometry(ud.outerGlowMesh, spec.outerR, spec.outerR * 1.1);
  ud.bladeLength = spec.length;
}
