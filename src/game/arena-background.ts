import * as THREE from 'three';

export interface ArenaBackground {
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
}

export interface ArenaBackgroundPalette {
  base: string;
  top: string;
  nebulaA: string;
  nebulaB: string;
  cloud: string;
  horizon: string;
  star: string;
  lane: string;
  accent: string;
}

export function createArenaBackground(scene: THREE.Scene, arenaDetail: number): ArenaBackground {
  const bgGeo = new THREE.PlaneGeometry(60, 12);
  const bgMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime:         { value: 0 },
      uMusic:        { value: 0 },
      uBeat:         { value: 0 },
      uDetail:       { value: arenaDetail },
      uPressure:     { value: 0 },
      // Music bands (0..~1)
      uBass:         { value: 0 },
      uMid:          { value: 0 },
      uHigh:         { value: 0 },
      // Beat flash — sharp decay after a beat hit (0..1)
      uBeatFlash:    { value: 0 },
      // Camera parallax (-0.5..0.5 in x/y) — subtle head bob
      uCamOffset:    { value: new THREE.Vector2(0, 0) },
      // Theme palette as decoded colours
      uBase:    { value: new THREE.Color('#01010a') },
      uTop:     { value: new THREE.Color('#07041c') },
      uNebulaA: { value: new THREE.Color('#0e3aa6') },
      uNebulaB: { value: new THREE.Color('#6b1ab0') },
      uCloud:   { value: new THREE.Color('#1a1660') },
      uHorizon: { value: new THREE.Color('#1ad0c0') },
      uStar:    { value: new THREE.Color('#a8c8ff') },
      uLane:    { value: new THREE.Color('#020208') },
      uAccent:  { value: new THREE.Color('#7fb8ff') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uMusic;
      uniform float uBeat;
      uniform float uDetail;
      uniform float uPressure;
      uniform float uBass;
      uniform float uMid;
      uniform float uHigh;
      uniform float uBeatFlash;
      uniform vec2  uCamOffset;
      uniform vec3  uBase;
      uniform vec3  uTop;
      uniform vec3  uNebulaA;
      uniform vec3  uNebulaB;
      uniform vec3  uCloud;
      uniform vec3  uHorizon;
      uniform vec3  uStar;
      uniform vec3  uLane;
      uniform vec3  uAccent;

      float hash21(vec2 p){
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      float starLayer(vec2 uv, vec2 density, float threshold, float radius){
        vec2 grid = uv * density;
        vec2 cell = floor(grid);
        vec2 local = fract(grid) - 0.5;
        float seed = hash21(cell);
        float point = 1.0 - smoothstep(0.0, radius, length(local));
        float twinkle = 0.62 + 0.38 * sin(uTime * (0.7 + seed * 2.4) + seed * 31.0);
        return point * step(threshold, seed) * twinkle;
      }

      // Simple 2D value noise for soft layered nebula/dust drift.
      float vnoise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      void main(){
        vec2 uv = vUv;
        vec2 p = uv * 2.0 - 1.0;
        float motion = uTime * 0.025;
        float music  = clamp(uMusic, 0.0, 1.5);
        float beat   = clamp(uBeat, 0.0, 1.5);
        float detail = clamp(uDetail, 0.0, 1.25);
        float pressure = clamp(uPressure, 0.0, 1.0);
        float bass  = clamp(uBass, 0.0, 1.0);
        float mid   = clamp(uMid, 0.0, 1.0);
        float high  = clamp(uHigh, 0.0, 1.0);
        float flash = clamp(uBeatFlash, 0.0, 1.0);
        vec2 par = uCamOffset;
        float detailStep = clamp(detail, 0.0, 1.0);

        // ── Layer 1: deep base gradient (theme base/top) ───────────────────────
        vec3 color = mix(uBase, uTop, smoothstep(0.02, 1.0, uv.y));

        // ── Layer 2: layered nebula (two depth bands, parallax + bass) ────────
        float sideMask = smoothstep(0.08, 0.92, abs(p.x));
        vec2 nebUV1 = vec2(uv.x + par.x * 0.18, uv.y + par.y * 0.10) + motion * 0.04;
        float neb1Wave = sin(nebUV1.x * 5.2 + nebUV1.y * 2.1 + motion * 8.0)
          + 0.55 * sin(nebUV1.x * 9.1 - nebUV1.y * 3.4 - motion * 5.0);
        float neb1 = smoothstep(0.42, 1.15, neb1Wave)
          * smoothstep(0.12, 0.82, uv.y)
          * (0.22 + sideMask * 0.78);
        vec3 neb1Color = mix(uNebulaA, uNebulaB, uv.x);
        color += neb1Color * neb1 * detailStep * (0.10 + music * 0.055 + beat * 0.018 + bass * 0.04);

        vec2 nebUV2 = vec2(uv.x - par.x * 0.10, uv.y - par.y * 0.05) - motion * 0.07;
        float neb2N = vnoise(nebUV2 * vec2(2.2, 1.1) + motion * 0.3);
        float neb2 = smoothstep(0.42, 0.85, neb2N)
          * smoothstep(0.18, 0.90, uv.y)
          * smoothstep(0.10, 0.78, abs(p.x));
        color += uAccent * neb2 * detailStep * (0.035 + mid * 0.03);

        // ── Layer 3: cloud/dust band (faster parallax, mid band) ───────────────
        vec2 cloudUV = vec2(uv.x + par.x * 0.30, uv.y) - motion * 0.12;
        float cloudBand = sin(cloudUV.x * 3.1 - cloudUV.y * 5.7 - motion * 3.0)
          * sin(cloudUV.x * 7.3 + cloudUV.y * 2.2 + motion * 4.0);
        float cloud = smoothstep(0.38, 0.92, cloudBand)
          * smoothstep(0.18, 0.88, uv.y)
          * smoothstep(0.12, 0.72, abs(p.x));
        color += uCloud * cloud * max(0.0, detail - 0.48) * (0.055 + music * 0.025 + mid * 0.02);

        // ── Layer 4: horizon glow (beat-reactive) ──────────────────────────────
        float horizon = exp(-pow((uv.y - 0.16) * 12.0, 2.0));
        color += uHorizon * horizon * detailStep * (0.065 + music * 0.045 + beat * 0.11 + flash * 0.10);

        // ── Layer 5: star field (parallax + high-band twinkle) ────────────────
        vec2 starUV = uv + par * 0.55;
        float stars = starLayer(starUV + vec2(motion * 0.08, 0.0), vec2(42.0, 17.0), 0.945, 0.090);
        stars += starLayer(starUV - vec2(motion * 0.035, 0.0), vec2(71.0, 29.0), 0.978, 0.070) * 0.72;
        stars += starLayer(starUV + vec2(0.0, motion * 0.025), vec2(96.0, 38.0), 0.988, 0.055)
          * max(0.0, detail - 0.72) * 0.62;
        float starTwk = (0.48 + music * 0.16 + beat * 0.08 + high * 0.22);
        color += uStar * stars * detailStep * starTwk;

        // ── Layer 6: lane darkening for block readability ──────────────────────
        float gameplayLane = exp(-pow(p.x * 1.72, 2.0)) * smoothstep(0.02, 0.66, uv.y);
        vec3 laneMask = mix(color, uLane, 1.0);
        color = mix(color, laneMask, gameplayLane * (0.17 + pressure * 0.30));
        color *= 1.0 - pressure * smoothstep(0.12, 0.82, uv.y) * 0.12;

        // ── Layer 7: vignette + subtle beat flash ──────────────────────────────
        float vignette = smoothstep(1.28, 0.22, length(p * vec2(0.78, 1.0)));
        color *= 0.56 + vignette * 0.44;
        color += uHorizon * flash * 0.05 * detailStep;

        gl_FragColor = vec4(color, 0.92);
      }
    `,
  });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.position.set(0, 1, -18);
  bgMesh.rotation.x = -0.1;
  scene.add(bgMesh);
  return { material: bgMat, mesh: bgMesh };
}

export function applyArenaBackgroundTheme(
  material: THREE.ShaderMaterial,
  palette: ArenaBackgroundPalette,
): void {
  const setColor = (name: string, hex: string): void => {
    const uniform = material.uniforms[name];
    if (uniform?.value instanceof THREE.Color) uniform.value.set(hex);
  };
  setColor('uBase', palette.base);
  setColor('uTop', palette.top);
  setColor('uNebulaA', palette.nebulaA);
  setColor('uNebulaB', palette.nebulaB);
  setColor('uCloud', palette.cloud);
  setColor('uHorizon', palette.horizon);
  setColor('uStar', palette.star);
  setColor('uLane', palette.lane);
  setColor('uAccent', palette.accent);
  material.needsUpdate = true;
}
