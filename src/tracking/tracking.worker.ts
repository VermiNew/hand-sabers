import { Vec3OneEuroFilter } from './one-euro-filter.ts';

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

let calibration: Calib | null = null;
let appState    = 'loading';
let sensitivity = 1.0;
let flipCamera  = false;
let oneHandMode: string | null = null;

// --- Smoothing / continuity tuning -----------------------------------------
// Position: lower minCutoff = smoother hold, higher beta = less lag on fast swings.
const POS_MIN_CUTOFF = 1.2;
const POS_BETA       = 0.6;
// Orientation (blade/roll direction vectors, filtered per-component then re-normalized).
const DIR_MIN_CUTOFF = 1.5;
const DIR_BETA       = 0.5;
// How long to keep reporting the last known pose after detection drops out for
// a frame or two (occlusion, a bad ML frame) before actually going "inactive".
const HAND_LOSS_GRACE_MS = 130;
// How close (world units) a new candidate must be to a slot's last known
// position to be treated as "the same hand" instead of re-shuffling L/R.
const SLOT_STICKY_RADIUS = 0.6;
// -----------------------------------------------------------------------------

interface HandSlotState {
  posFilter:   Vec3OneEuroFilter;
  bladeFilter: Vec3OneEuroFilter;
  rollFilter:  Vec3OneEuroFilter;
  lastPos:     Pos3 | null;
  lastQuat:    QuatRepr | null;
  lastSeenMs:  number;
  hasData:     boolean;
}

function createSlotState(): HandSlotState {
  return {
    posFilter:   new Vec3OneEuroFilter(POS_MIN_CUTOFF, POS_BETA),
    bladeFilter: new Vec3OneEuroFilter(DIR_MIN_CUTOFF, DIR_BETA),
    rollFilter:  new Vec3OneEuroFilter(DIR_MIN_CUTOFF, DIR_BETA),
    lastPos:     null,
    lastQuat:    null,
    lastSeenMs:  -Infinity,
    hasData:     false,
  };
}

const lSlot: HandSlotState = createSlotState();
const rSlot: HandSlotState = createSlotState();

function resetSlot(slot: HandSlotState): void {
  slot.posFilter.reset();
  slot.bladeFilter.reset();
  slot.rollFilter.reset();
  slot.lastPos    = null;
  slot.lastQuat   = null;
  slot.lastSeenMs = -Infinity;
  slot.hasData    = false;
}

function normalize3(v: Pos3): Pos3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// Re-orthogonalize rollDir against bladeDir (Gram-Schmidt) after each has been
// filtered independently, so the pair stays a valid perpendicular basis
// instead of just "approximately" perpendicular.
function orthonormalize(roll: Pos3, blade: Pos3): Pos3 {
  const d = roll.x * blade.x + roll.y * blade.y + roll.z * blade.z;
  const proj = { x: roll.x - d * blade.x, y: roll.y - d * blade.y, z: roll.z - d * blade.z };
  return normalize3(proj);
}

function distSq(a: Pos3, b: Pos3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
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
  const bz = ((middleMCP.z ?? 0) - (wrist.z ?? 0)) * 2;
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

/**
 * CHANGED: step 1 (confident, distinct handedness labels) is untouched from
 * the original — it's the most reliable signal and should stay first. Only
 * step 3, the fallback used when labels are missing/ambiguous (typically
 * right when hands overlap or briefly occlude — exactly when the old
 * x-sort-only fallback was most likely to flicker), now prefers whichever
 * candidate is closest to each slot's last known position over blind x-sort.
 *
 * Caveat worth playtesting explicitly: this helps with brief label dropouts
 * while hands stay reasonably separated. It does NOT reliably resolve a true,
 * sustained hand-crossing, or the case where both hands sit very close
 * together under heavy noise — a stress-test showed position-only continuity
 * can actually compound errors there (it starts trusting its own possibly-
 * wrong last position). That's an inherent limit of position-only data
 * association, not something SLOT_STICKY_RADIUS alone fixes — tune/verify it
 * against your own cross-hand gameplay patterns.
 */
function assignCandidatesToWorldSlots(unique: Candidate[], calib: Calib | null): { leftCand: Candidate | null; rightCand: Candidate | null } {
  if (!unique.length) return { leftCand: null, rightCand: null };

  const mapped = unique
    .map(candidate => ({ candidate, pos: candidateWorldPos(candidate, calib) }))
    .filter((item): item is { candidate: Candidate; pos: Pos3 } => item.pos !== null);

  if (!mapped.length) return { leftCand: null, rightCand: null };

  // 1) Strongest signal (unchanged): trust distinct, confident handedness labels outright.
  const labeled = mapped
    .map(item => ({ ...item, side: candidateHandSide(item.candidate) }))
    .filter((item): item is typeof item & { side: string } => item.side !== null);
  const labeledLeft  = labeled.find(item => item.side === 'left');
  const labeledRight = labeled.find(item => item.side === 'right');
  if (labeledLeft && labeledRight && labeledLeft.candidate !== labeledRight.candidate) {
    return { leftCand: labeledLeft.candidate, rightCand: labeledRight.candidate };
  }

  // 2) Labels missing/ambiguous this frame: prefer continuity with last known
  // position over blind x-sort (see caveat above).
  let remaining = [...mapped];
  const tryStick = (slot: HandSlotState): Candidate | null => {
    if (!slot.hasData || !slot.lastPos || !remaining.length) return null;
    const lastPos = slot.lastPos;
    const sorted = [...remaining].sort((a, b) => distSq(a.pos, lastPos) - distSq(b.pos, lastPos));
    const closest = sorted[0]!;
    if (distSq(closest.pos, lastPos) >= SLOT_STICKY_RADIUS * SLOT_STICKY_RADIUS) return null;
    remaining = remaining.filter(item => item !== closest);
    return closest.candidate;
  };
  let leftCand  = tryStick(lSlot);
  let rightCand = tryStick(rSlot);

  // 3) Anything still unresolved (brand-new hand, nothing to stick to yet): x-sort.
  remaining.sort((a, b) => a.pos.x - b.pos.x);
  if (!leftCand && !rightCand && remaining.length === 1) {
    if (remaining[0]!.pos.x <= 0) leftCand = remaining[0]!.candidate;
    else rightCand = remaining[0]!.candidate;
  } else {
    if (!leftCand && remaining.length)  leftCand  = remaining[0]!.candidate;
    if (!rightCand && remaining.length) rightCand = remaining[remaining.length - 1]!.candidate;
  }

  return { leftCand, rightCand };
}

/**
 * CHANGED: replaced the fixed-size ring-buffer average (which, on every
 * resize, could keep stale slots and drop the newest samples — worst right
 * when the hand starts moving fast) with a One Euro Filter per axis. Also now
 * filters bladeDir/rollDir (previously unsmoothed) and holds the last known
 * pose for HAND_LOSS_GRACE_MS instead of nulling the saber the instant a
 * single frame fails to detect a hand.
 */
function applyCandidateToSlot(candidate: Candidate | null, slot: 'left' | 'right', calib: Calib | null, now: number): SlotResult {
  const slotState = slot === 'left' ? lSlot : rSlot;

  if (candidate) {
    const wrist    = candidate.landmarks[0]!;
    const worldPos = mapToWorld(wrist, calib);
    const rawQuat  = computeQuaternion(candidate.landmarks);

    const filteredPos   = slotState.posFilter.filter(worldPos, now);
    const filteredBlade = normalize3(slotState.bladeFilter.filter(rawQuat.bladeDir, now));
    const filteredRoll  = orthonormalize(slotState.rollFilter.filter(rawQuat.rollDir, now), filteredBlade);
    const filteredQuat: QuatRepr = { bladeDir: filteredBlade, rollDir: filteredRoll };

    slotState.lastPos    = filteredPos;
    slotState.lastQuat   = filteredQuat;
    slotState.lastSeenMs = now;
    slotState.hasData    = true;

    return { pos: filteredPos, quat: filteredQuat, conf: candidate.score ?? 0 };
  }

  if (slotState.hasData && now - slotState.lastSeenMs <= HAND_LOSS_GRACE_MS) {
    // Brief dropout: keep reporting the last known pose so the saber doesn't
    // flicker out for a single bad ML frame.
    return { pos: slotState.lastPos, quat: slotState.lastQuat, conf: 0 };
  }

  resetSlot(slotState);
  return { pos: null, quat: null, conf: 0 };
}

function analyzeHands(candidates: Candidate[], currentAppState: string, calib: Calib | null, now: number): object {
  const unique = dedupeHands(candidates, currentAppState);

  let leftCand:  Candidate | null = null;
  let rightCand: Candidate | null = null;

  if (oneHandMode === 'left' || oneHandMode === 'right') {
    const selected = strongestCandidate(unique);
    if (oneHandMode === 'left') {
      leftCand = selected;
      resetSlot(rSlot);
    } else {
      rightCand = selected;
      resetSlot(lSlot);
    }
  } else {
    const slots = assignCandidatesToWorldSlots(unique, calib);
    leftCand  = slots.leftCand;
    rightCand = slots.rightCand;
  }

  const left  = applyCandidateToSlot(leftCand,  'left',  calib, now);
  const right = applyCandidateToSlot(rightCand, 'right', calib, now);

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
    resetSlot(lSlot);
    resetSlot(rSlot);
    return;
  }

  if (type === 'setSettings') {
    if (payload['sensitivity'] !== undefined) sensitivity = Number(payload['sensitivity']);
    if (payload['flipCamera']  !== undefined) flipCamera  = Boolean(payload['flipCamera']);
    if (payload['oneHandMode'] !== undefined) oneHandMode = payload['oneHandMode'] === 'both' ? null : String(payload['oneHandMode']);
    return;
  }

  if (type === 'analyze') {
    // Prefer the timestamp the frame was captured at (passed from the main
    // thread) over performance.now() taken here, since postMessage queuing
    // can add a variable delay that would otherwise throw off the filters'
    // speed estimate.
    const now = typeof payload['now'] === 'number' ? (payload['now'] as number) : performance.now();
    const result = analyzeHands(
      (payload['candidates'] as Candidate[]),
      appState,
      calibration,
      now,
    );
    (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({ type: 'result', payload: result });
    return;
  }
};
