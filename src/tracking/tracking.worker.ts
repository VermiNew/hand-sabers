const S_PLAYING = 'playing';

interface Pos3 { x: number; y: number; z: number }
interface Landmark { x: number; y: number; z?: number }
interface Candidate {
  landmarks: Landmark[];
  handedness?: string;
  score?: number;
  bounds?: Bounds;
}
interface Bounds {
  minX: number; maxX: number; minY: number; maxY: number;
  centerX: number; centerY: number; width: number; height: number; area: number;
}
interface Calib {
  minX: number; maxX: number; minY: number; maxY: number;
  rangeX: number; rangeY: number;
}
interface SlotResult { pos: Pos3 | null; quat: QuatRepr | null; conf: number }
interface QuatRepr { bladeDir: Pos3; rollDir: Pos3 }
interface SmoothBuf extends Array<Pos3> { _idx?: number }

let calibration: Calib | null = null;
let appState    = 'loading';
let sensitivity = 1.0;
let flipCamera  = false;
let oneHandMode: string | null = null;

const SMOOTH_MIN = 2;
const SMOOTH_MAX = 8;
const lBuf: SmoothBuf = [];
const rBuf: SmoothBuf = [];

function clearBuf(buf: SmoothBuf): void {
  buf.length = 0;
  delete buf._idx;
}

function computeSmoothSize(buf: SmoothBuf, newPos: Pos3): number {
  if (!buf.length) return SMOOTH_MAX;
  const prev = buf[buf._idx !== undefined && buf._idx > 0 ? buf._idx - 1 : buf.length - 1];
  if (!prev) return SMOOTH_MAX;
  const dx = newPos.x - prev.x, dy = newPos.y - prev.y;
  const speed = Math.sqrt(dx * dx + dy * dy);
  if (speed > 0.08) return SMOOTH_MIN;
  if (speed > 0.04) return 4;
  return SMOOTH_MAX;
}

function avg(buf: SmoothBuf): Pos3 | null {
  if (!buf.length) return null;
  const r = { x: 0, y: 0, z: 0 };
  for (const p of buf) { r.x += p.x; r.y += p.y; r.z += p.z; }
  r.x /= buf.length; r.y /= buf.length; r.z /= buf.length;
  return r;
}

function push(buf: SmoothBuf, val: Pos3, size: number): void {
  if (buf.length < size) {
    buf.push(val);
    return;
  }
  const idx = buf._idx ?? 0;
  buf[idx] = val;
  buf._idx = (idx + 1) % size;
}

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function landmarkBounds(lms: Landmark[]): Bounds {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of lms) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX, maxX, minY, maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width:   maxX - minX,
    height:  maxY - minY,
    area:    (maxX - minX) * (maxY - minY),
  };
}

function isFaceCandidateWithBounds(candidate: Candidate, bounds: Bounds, currentAppState: string): boolean {
  const lms = candidate.landmarks;
  const wrist     = lms[0]!;
  const thumbTip  = lms[4]!;
  const middleTip = lms[12]!;
  const pinkyTip  = lms[20]!;

  const spread = dist(thumbTip, pinkyTip);
  const length = dist(wrist, middleTip);
  const ratio  = length > 0.001 ? spread / length : 999;

  if (ratio > 1.8 || bounds.area > 0.28 || bounds.height > 0.72) return true;

  const inFaceBand =
    bounds.centerX > 0.28 && bounds.centerX < 0.72 &&
    bounds.centerY < 0.50;

  if (currentAppState === S_PLAYING && wrist.y < 0.22 && inFaceBand) return true;

  return false;
}

function computeQuaternion(lms: Landmark[]): QuatRepr {
  const wrist     = lms[0]!;
  const middleMCP = lms[9]!;
  const indexMCP  = lms[5]!;
  const pinkyMCP  = lms[17]!;

  const bx = middleMCP.x - wrist.x;
  const by = -(middleMCP.y - wrist.y);
  const bz = (middleMCP.z ?? 0 - (wrist.z ?? 0)) * 2;
  const bLen = Math.sqrt(bx * bx + by * by + bz * bz) || 1;

  const rx = pinkyMCP.x - indexMCP.x;
  const ry = -(pinkyMCP.y - indexMCP.y);
  const rz = 0;
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;

  return {
    bladeDir: { x: bx / bLen, y: by / bLen, z: bz / bLen },
    rollDir:  { x: rx / rLen, y: ry / rLen, z: rz / rLen },
  };
}

function mapToWorld(lm: Landmark, calib: Calib | null): Pos3 {
  const rawX = flipCamera ? (1 - lm.x) : lm.x;

  if (!calib) {
    return {
      x: (0.5 - rawX) * 3.2 * sensitivity,
      y: (0.65 - lm.y) * 3.0 * sensitivity + 1.1,
      z: 1.5,
    };
  }
  const nx = (rawX - calib.minX) / (calib.maxX - calib.minX || 1);
  const ny = (lm.y  - calib.minY) / (calib.maxY - calib.minY || 1);
  return {
    x: (0.5 - nx) * calib.rangeX * sensitivity,
    y: (0.65 - ny) * calib.rangeY * sensitivity + 1.1,
    z: 1.5,
  };
}

function dedupeHands(candidates: Candidate[], currentAppState: string): Candidate[] {
  const withBounds = candidates.map(c => ({ c, bounds: landmarkBounds(c.landmarks) }));

  const real = withBounds.filter(({ c, bounds }) => !isFaceCandidateWithBounds(c, bounds, currentAppState));

  const unique: typeof withBounds = [];
  for (const item of real) {
    const { bounds } = item;
    const dup = unique.find(u => {
      const ub = u.bounds;
      return Math.abs(ub.centerX - bounds.centerX) < 0.12 &&
             Math.abs(ub.centerY - bounds.centerY) < 0.12;
    });
    if (!dup) unique.push(item);
  }

  unique.sort((a, b) => b.bounds.centerX - a.bounds.centerX);

  return unique.map(({ c, bounds }) => {
    c.bounds = bounds;
    return c;
  });
}

function oppositeSide(side: string | null): string | null {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return null;
}

function candidateHandSide(candidate: Candidate): string | null {
  const label = String(candidate?.handedness ?? '').toLowerCase();
  let side: string | null = null;
  if (label.includes('left')) side = 'left';
  else if (label.includes('right')) side = 'right';
  return flipCamera ? oppositeSide(side) : side;
}

function strongestCandidate(unique: Candidate[]): Candidate | null {
  if (!unique.length) return null;
  return [...unique].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? unique[0] ?? null;
}

function candidateWorldPos(candidate: Candidate, calib: Calib | null): Pos3 | null {
  if (!candidate?.landmarks?.length) return null;
  return mapToWorld(candidate.landmarks[0]!, calib);
}

function assignCandidatesToWorldSlots(unique: Candidate[], calib: Calib | null): { leftCand: Candidate | null; rightCand: Candidate | null } {
  if (!unique.length) return { leftCand: null, rightCand: null };

  const mapped = unique
    .map(candidate => ({ candidate, pos: candidateWorldPos(candidate, calib) }))
    .filter((item): item is { candidate: Candidate; pos: Pos3 } => item.pos !== null);

  if (!mapped.length) return { leftCand: null, rightCand: null };

  const labeled = mapped
    .map(item => ({ ...item, side: candidateHandSide(item.candidate) }))
    .filter((item): item is typeof item & { side: string } => item.side !== null);
  const labeledLeft  = labeled.find(item => item.side === 'left');
  const labeledRight = labeled.find(item => item.side === 'right');
  if (labeledLeft && labeledRight && labeledLeft.candidate !== labeledRight.candidate) {
    return {
      leftCand: labeledLeft.candidate,
      rightCand: labeledRight.candidate,
    };
  }

  mapped.sort((a, b) => a.pos.x - b.pos.x);

  if (mapped.length === 1) {
    const only = mapped[0]!;
    return only.pos.x <= 0
      ? { leftCand: only.candidate, rightCand: null }
      : { leftCand: null, rightCand: only.candidate };
  }

  return {
    leftCand:  mapped[0]!.candidate,
    rightCand: mapped[mapped.length - 1]!.candidate,
  };
}

function applyCandidateToSlot(candidate: Candidate | null, slot: 'left' | 'right', calib: Calib | null): SlotResult {
  const buf = slot === 'left' ? lBuf : rBuf;
  if (!candidate) {
    clearBuf(buf);
    return { pos: null, quat: null, conf: 0 };
  }

  const wrist     = candidate.landmarks[0]!;
  const worldPos  = mapToWorld(wrist, calib);
  const smoothSize = computeSmoothSize(buf, worldPos);
  if (buf.length > smoothSize) {
    buf.splice(0, buf.length - smoothSize);
    delete buf._idx;
  }
  push(buf, worldPos, smoothSize);
  return {
    pos:  avg(buf),
    quat: computeQuaternion(candidate.landmarks),
    conf: candidate.score ?? 0,
  };
}

function analyzeHands(candidates: Candidate[], currentAppState: string, calib: Calib | null): object {
  const unique = dedupeHands(candidates, currentAppState);

  let leftCand:  Candidate | null = null;
  let rightCand: Candidate | null = null;

  if (oneHandMode === 'left' || oneHandMode === 'right') {
    const selected = strongestCandidate(unique);
    if (oneHandMode === 'left') {
      leftCand = selected;
      clearBuf(rBuf);
    } else {
      rightCand = selected;
      clearBuf(lBuf);
    }
  } else {
    const slots = assignCandidatesToWorldSlots(unique, calib);
    leftCand  = slots.leftCand;
    rightCand = slots.rightCand;
  }

  const left  = applyCandidateToSlot(leftCand,  'left',  calib);
  const right = applyCandidateToSlot(rightCand, 'right', calib);

  return {
    leftPos:  left.pos,
    rightPos: right.pos,
    leftQuat: left.quat,
    rightQuat: right.quat,
    leftConf: left.conf,
    rightConf: right.conf,
    leftActive:  !!left.pos,
    rightActive: !!right.pos,
    rawCount: candidates.length,
    filteredCount: unique.length,
    oneHandMode,
  };
}

self.onmessage = (e: MessageEvent<{ type: string; payload: Record<string, unknown> }>) => {
  const { type, payload } = e.data;

  if (type === 'setState') {
    appState = String(payload['appState'] ?? appState);
    if (payload['oneHandMode'] !== undefined) oneHandMode = payload['oneHandMode'] === 'both' ? null : String(payload['oneHandMode']);
    return;
  }

  if (type === 'setCalibration') {
    calibration = payload as unknown as Calib | null;
    clearBuf(lBuf);
    clearBuf(rBuf);
    return;
  }

  if (type === 'setSettings') {
    if (payload['sensitivity'] !== undefined) sensitivity = Number(payload['sensitivity']);
    if (payload['flipCamera']  !== undefined) flipCamera  = Boolean(payload['flipCamera']);
    if (payload['oneHandMode'] !== undefined) oneHandMode = payload['oneHandMode'] === 'both' ? null : String(payload['oneHandMode']);
    return;
  }

  if (type === 'analyze') {
    const result = analyzeHands(
      (payload['candidates'] as Candidate[]),
      appState,
      calibration
    );
    (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({ type: 'result', payload: result });
    return;
  }
};
