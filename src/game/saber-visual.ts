import { THEME } from '../core/theme.ts';
import * as THREE from 'three';

export type SaberModel = 'classic' | 'wide' | 'thin' | 'prism' | 'edge' | 'pulse';

type SaberAccent = 'none' | 'bands' | 'gem' | 'fins' | 'rings' | 'pommel';

interface SaberModelSpec {
  length: number;
  segments: number;
  depth: number;
  coreTop: number;
  coreBase: number;
  glowTop: number;
  glowBase: number;
  outerTop: number;
  outerBase: number;
  auraTop: number;
  auraBase: number;
  glowOpacity: number;
  outerOpacity: number;
  auraOpacity: number;
  tip: 'dome' | 'cone';
  tipSize: number;
  guardScale: number;
  accent: SaberAccent;
}

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
  model: SaberModel;
  auraGlow: THREE.MeshBasicMaterial;
  auraGlowMesh: THREE.Mesh;
  guardMesh: THREE.Mesh;
  emitterMesh: THREE.Mesh;
  accessoryGroup: THREE.Group;
  outerGlowBaseOpacity: number;
}

const SABER_MODELS: Record<SaberModel, SaberModelSpec> = {
  classic: {
    length: 1.10, segments: 8, depth: 1,
    coreTop: 0.007, coreBase: 0.010, glowTop: 0.022, glowBase: 0.027,
    outerTop: 0.038, outerBase: 0.045, auraTop: 0.058, auraBase: 0.066,
    glowOpacity: 0.78, outerOpacity: 0.26, auraOpacity: 0.10,
    tip: 'dome', tipSize: 1, guardScale: 1, accent: 'none',
  },
  wide: {
    length: 1, segments: 10, depth: 1,
    coreTop: 0.014, coreBase: 0.017, glowTop: 0.040, glowBase: 0.046,
    outerTop: 0.062, outerBase: 0.070, auraTop: 0.086, auraBase: 0.096,
    glowOpacity: 0.85, outerOpacity: 0.32, auraOpacity: 0.13,
    tip: 'dome', tipSize: 1.3, guardScale: 1.35, accent: 'bands',
  },
  thin: {
    length: 1.28, segments: 8, depth: 1,
    coreTop: 0.003, coreBase: 0.008, glowTop: 0.010, glowBase: 0.019,
    outerTop: 0.018, outerBase: 0.031, auraTop: 0.028, auraBase: 0.045,
    glowOpacity: 0.72, outerOpacity: 0.20, auraOpacity: 0.08,
    tip: 'cone', tipSize: 1.6, guardScale: 0.72, accent: 'pommel',
  },
  prism: {
    length: 1.16, segments: 5, depth: 1,
    coreTop: 0.008, coreBase: 0.010, glowTop: 0.026, glowBase: 0.030,
    outerTop: 0.044, outerBase: 0.050, auraTop: 0.066, auraBase: 0.074,
    glowOpacity: 0.80, outerOpacity: 0.30, auraOpacity: 0.12,
    tip: 'dome', tipSize: 1.1, guardScale: 1.05, accent: 'gem',
  },
  edge: {
    length: 1.06, segments: 4, depth: 0.34,
    coreTop: 0.011, coreBase: 0.014, glowTop: 0.027, glowBase: 0.032,
    outerTop: 0.045, outerBase: 0.052, auraTop: 0.066, auraBase: 0.075,
    glowOpacity: 0.82, outerOpacity: 0.28, auraOpacity: 0.10,
    tip: 'cone', tipSize: 1.2, guardScale: 1.1, accent: 'fins',
  },
  pulse: {
    length: 1.05, segments: 16, depth: 1,
    coreTop: 0.010, coreBase: 0.011, glowTop: 0.034, glowBase: 0.037,
    outerTop: 0.058, outerBase: 0.064, auraTop: 0.086, auraBase: 0.094,
    glowOpacity: 0.78, outerOpacity: 0.30, auraOpacity: 0.13,
    tip: 'dome', tipSize: 1.15, guardScale: 1, accent: 'rings',
  },
};

function disposeObject(object: THREE.Object3D): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach(item => item.dispose());
    else material?.dispose();
  });
}

function clearTagged(parent: THREE.Object3D, tag: string, disposeMaterials = true): void {
  for (const child of parent.children.filter(item => Boolean(item.userData[tag]))) {
    parent.remove(child);
    if (disposeMaterials) disposeObject(child);
    else (child as THREE.Mesh).geometry?.dispose();
  }
}

function attachTipCap(
  mesh: THREE.Mesh,
  radius: number,
  halfLength: number,
  style: 'dome' | 'cone',
  sizeMultiplier: number,
): void {
  clearTagged(mesh, 'isTipCap', false);
  const height = radius * 3.2 * sizeMultiplier;
  const geometry = style === 'cone'
    ? new THREE.ConeGeometry(radius, height, 10)
    : new THREE.SphereGeometry(radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const cap = new THREE.Mesh(geometry, mesh.material);
  cap.userData['isTipCap'] = true;
  cap.position.y = style === 'cone' ? halfLength + height / 2 : halfLength;
  mesh.add(cap);
}

function markAccent(mesh: THREE.Mesh): THREE.Mesh {
  mesh.userData['isSaberAccent'] = true;
  return mesh;
}

function attachPrismShard(coreMesh: THREE.Mesh, hex: number, halfLength: number, radius: number): void {
  clearTagged(coreMesh, 'isPrismShard');
  const geometry = new THREE.OctahedronGeometry(radius * 2.6, 0);
  geometry.scale(1, 1.8, 1);
  const shard = markAccent(new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      color: hex, emissive: hex, emissiveIntensity: 0.35, roughness: 0.08,
      transmission: 0.72, thickness: 0.05, transparent: true,
    }),
  ));
  shard.userData['isPrismShard'] = true;
  shard.position.y = halfLength * 0.55;
  coreMesh.add(shard);
}

function buildAccessories(target: THREE.Group, hex: number, accent: SaberAccent): void {
  const glowMaterial = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: 0.82,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  if (accent === 'bands') {
    for (const y of [-0.05, -0.23]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.044, 0.02, 10),
        new THREE.MeshPhongMaterial({ color: 0x2b3542, specular: 0xffffff, shininess: 120 }),
      );
      band.position.y = y;
      target.add(band);
    }
  } else if (accent === 'gem') {
    const gem = markAccent(new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.028, 0),
      new THREE.MeshPhysicalMaterial({
        color: hex, emissive: hex, emissiveIntensity: 0.4,
        roughness: 0.05, transmission: 0.65, transparent: true,
      }),
    ));
    gem.position.y = -0.285;
    target.add(gem);
  } else if (accent === 'fins') {
    for (const side of [-1, 1]) {
      const fin = markAccent(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.014, 0.006), glowMaterial()));
      fin.position.set(side * 0.075, 0.02, 0);
      fin.rotation.z = side * 0.5;
      target.add(fin);
    }
  } else if (accent === 'rings') {
    for (const y of [0.005, -0.03]) {
      const ring = markAccent(new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.004, 8, 20), glowMaterial()));
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      target.add(ring);
    }
  } else if (accent === 'pommel') {
    const pommel = markAccent(new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 12, 10),
      new THREE.MeshPhongMaterial({
        color: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.2),
        emissive: hex, emissiveIntensity: 0.12, specular: 0xffffff, shininess: 180,
      }),
    ));
    pommel.position.y = -0.29;
    target.add(pommel);
  }
}

export function createSaber(hex: number, model: SaberModel = 'classic'): THREE.Group {
  const g         = new THREE.Group();
  const specColor = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.55);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.038, 0.28, 16),
    new THREE.MeshPhongMaterial({ color: 0x263241, specular: specColor, shininess: 90, reflectivity: 0.4 })
  );
  handle.position.y = -0.14;
  g.add(handle);

  for (let i = -2; i <= 2; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.005, 8, 20),
      new THREE.MeshPhongMaterial({ color: THEME.gray, specular: 0xffffff, shininess: 220 })
    );
    ring.position.y = -0.14 + i * 0.055;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }

  const guardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.022, 0.05),
    new THREE.MeshPhongMaterial({
      color: 0x334152,
      specular: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.3),
      shininess: 160,
    })
  );
  g.add(guardMesh);

  const emitterMesh = markAccent(new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.007, 8, 16),
    new THREE.MeshPhongMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.3, specular: 0xffffff, shininess: 180 })
  ));
  emitterMesh.position.y = 0.02;
  emitterMesh.rotation.x = Math.PI / 2;
  g.add(emitterMesh);

  const bladeCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.01, 1.1, 6),
    new THREE.MeshBasicMaterial({ color: specColor, toneMapped: false })
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
    toneMapped: false,
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
    toneMapped: false,
  });
  const outerGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 1.1, 6), ogMat);
  outerGlow.position.y = 0.57;
  g.add(outerGlow);

  const auraMat = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const auraGlowMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), auraMat);
  g.add(auraGlowMesh);

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

  const accessoryGroup = new THREE.Group();
  g.add(accessoryGroup);

  g.frustumCulled = false;
  g.userData = {
    bladeGlow: bgMat2, outerGlow: ogMat,
    bladeCoreMesh: bladeCore, bladeGlowMesh: bladeGlow, outerGlowMesh: outerGlow,
    shineMat: shMat,   shineMesh: shMesh,
    shine2Mat: sh2Mat, shine2Mesh: sh2Mesh,
    color: hex, wireMat, wireMesh, bladeLength: 0,
    model, auraGlow: auraMat, auraGlowMesh,
    guardMesh, emitterMesh, accessoryGroup,
    outerGlowBaseOpacity: 0.22,
  } satisfies SaberUserData;
  applySaberModel(g, model);
  return g;
}

export function setSaberVisualColor(saber: THREE.Group, hex: number): void {
  const userData = saber.userData as SaberUserData;
  const color = new THREE.Color(hex);
  userData.color = hex;
  userData.bladeGlow.color.copy(color);
  userData.outerGlow.color.copy(color);
  userData.auraGlow.color.copy(color);
  (userData.bladeCoreMesh.material as THREE.MeshBasicMaterial).color.copy(
    color.clone().lerp(new THREE.Color(0xffffff), 0.82),
  );

  saber.traverse(child => {
    if (!child.userData['isSaberAccent']) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const colored = material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
      colored.color?.copy(color);
      colored.emissive?.copy(color);
      colored.needsUpdate = true;
    }
  });
}

export function disposeSaber(saber: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  saber.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach(material => { if (material) materials.add(material); });
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function applySaberModel(saber: THREE.Group, model: SaberModel): void {
  const spec = SABER_MODELS[model] ?? SABER_MODELS.classic;
  const userData = saber.userData as SaberUserData;
  const halfLength = spec.length / 2;
  const bladeCenter = halfLength + 0.02;

  const rebuild = (mesh: THREE.Mesh, topRadius: number, bottomRadius: number): void => {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, spec.length, spec.segments);
    mesh.position.y = bladeCenter;
    mesh.scale.set(1, 1, spec.depth);
  };

  rebuild(userData.bladeCoreMesh, spec.coreTop, spec.coreBase);
  rebuild(userData.bladeGlowMesh, spec.glowTop, spec.glowBase);
  rebuild(userData.outerGlowMesh, spec.outerTop, spec.outerBase);
  rebuild(userData.auraGlowMesh, spec.auraTop, spec.auraBase);

  userData.bladeGlow.opacity = spec.glowOpacity;
  userData.outerGlow.opacity = spec.outerOpacity;
  userData.auraGlow.opacity = spec.auraOpacity;
  userData.outerGlowBaseOpacity = spec.outerOpacity;

  attachTipCap(userData.bladeCoreMesh, spec.coreTop, halfLength, spec.tip, spec.tipSize);
  attachTipCap(userData.bladeGlowMesh, spec.glowTop, halfLength, spec.tip, spec.tipSize);
  attachTipCap(userData.outerGlowMesh, spec.outerTop, halfLength, spec.tip, spec.tipSize);
  if (model === 'prism') attachPrismShard(userData.bladeCoreMesh, userData.color, halfLength, spec.coreTop);
  else clearTagged(userData.bladeCoreMesh, 'isPrismShard');

  userData.guardMesh.scale.setScalar(spec.guardScale);
  while (userData.accessoryGroup.children.length) {
    const child = userData.accessoryGroup.children[0]!;
    userData.accessoryGroup.remove(child);
    disposeObject(child);
  }
  buildAccessories(userData.accessoryGroup, userData.color, spec.accent);

  userData.shineMesh.position.set(spec.outerTop * 1.4, bladeCenter, spec.outerTop * 1.1);
  userData.shineMesh.scale.set(1, spec.length / 1.1, 1);
  userData.shine2Mesh.position.set(spec.outerTop * 1.4, bladeCenter + halfLength * 0.4, spec.outerTop * 1.1);
  userData.shine2Mesh.scale.set(1, spec.length / 1.1, 1);

  userData.wireMesh.geometry.dispose();
  userData.wireMesh.geometry = new THREE.CylinderGeometry(0.5, 0.5, spec.length + 0.08, 8);
  userData.wireMesh.position.y = bladeCenter;
  userData.bladeLength = spec.length;
  userData.model = model;
  setSaberVisualColor(saber, userData.color);
}
