// tracking.worker.js — analiza wyników MediaPipe (bez detekcji)
// Otrzymuje surowe landmarks, zwraca przetworzone dane mieczy

const S_PLAYING = 'playing';

let calibration = null;
let appState    = 'loading';
let sensitivity = 1.0;
let flipCamera  = false;
let oneHandMode = null; // null | 'left' | 'right' — w tym trybie dowolna wykryta ręka steruje wybranym mieczem

// Smoothing buffers
const SMOOTH_MIN = 2; // przy szybkim ruchu
const SMOOTH_MAX = 8; // przy spokojnym ruchu
const lBuf = [], rBuf = [];

function clearBuf(buf) {
  buf.length = 0;
  delete buf._idx;
}

function computeSmoothSize(buf, newPos) {
  if (!buf.length) return SMOOTH_MAX;
  const prev = buf[buf._idx > 0 ? (buf._idx - 1) : (buf.length - 1)];
  if (!prev) return SMOOTH_MAX;
  const dx = newPos.x - prev.x, dy = newPos.y - prev.y;
  const speed = Math.sqrt(dx*dx + dy*dy);
  if (speed > 0.08) return SMOOTH_MIN;
  if (speed > 0.04) return 4;
  return SMOOTH_MAX;
}

function avg(buf) {
  if (!buf.length) return null;
  const r = { x: 0, y: 0, z: 0 };
  for (const p of buf) { r.x += p.x; r.y += p.y; r.z += p.z; }
  r.x /= buf.length; r.y /= buf.length; r.z /= buf.length;
  return r;
}

function push(buf, val, size) {
  if (buf.length < size) {
    buf.push(val);
    return;
  }
  const idx = buf._idx || 0;
  buf[idx] = val;
  buf._idx = (idx + 1) % size;
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z||0) - (b.z||0);
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

function landmarkBounds(lms) {
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
    area:    (maxX - minX) * (maxY - minY)
  };
}

function isFaceCandidateWithBounds(candidate, bounds, currentAppState) {
  const lms = candidate.landmarks;
  const wrist     = lms[0];
  const thumbTip  = lms[4];
  const middleTip = lms[12];
  const pinkyTip  = lms[20];

  const spread = dist(thumbTip, pinkyTip);
  const length = dist(wrist, middleTip);
  const ratio  = length > 0.001 ? spread / length : 999;

  // Dziwny kształt — twarz ma inny stosunek niż dłoń
  if (ratio > 1.8 || bounds.area > 0.28 || bounds.height > 0.72) return true;

  // Centralnie u góry + tryb gry = prawie na pewno twarz
  const inFaceBand =
    bounds.centerX > 0.28 && bounds.centerX < 0.72 &&
    bounds.centerY < 0.50;

  if (currentAppState === S_PLAYING && wrist.y < 0.22 && inFaceBand) return true;

  return false;
}

function computeQuaternion(lms) {
  // Kierunek ostrza: nadgarstek → środek MCP
  const wrist     = lms[0];
  const middleMCP = lms[9];
  const indexMCP  = lms[5];
  const pinkyMCP  = lms[17];

  const bx = middleMCP.x - wrist.x;
  const by = -(middleMCP.y - wrist.y);
  const bz = (middleMCP.z - wrist.z) * 2;
  const bLen = Math.sqrt(bx*bx + by*by + bz*bz) || 1;

  const rx = pinkyMCP.x - indexMCP.x;
  const ry = -(pinkyMCP.y - indexMCP.y);
  const rz = 0;
  const rLen = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;

  // Zwróć jako prosta reprezentacja osi — main.js zrobi z tego quaternion
  return {
    bladeDir: { x: bx/bLen, y: by/bLen, z: bz/bLen },
    rollDir:  { x: rx/rLen, y: ry/rLen, z: rz/rLen }
  };
}

function mapToWorld(lm, calib) {
  const rawX = flipCamera ? (1 - lm.x) : lm.x;

  if (!calib) {
    return {
      x: (0.5 - rawX) * 3.2 * sensitivity,
      y: (0.65 - lm.y) * 3.0 * sensitivity + 1.1,
      z: 1.5
    };
  }
  const nx = (rawX - calib.minX) / (calib.maxX - calib.minX || 1);
  const ny = (lm.y  - calib.minY) / (calib.maxY - calib.minY || 1);
  return {
    x: (0.5 - nx) * calib.rangeX * sensitivity,
    y: (0.65 - ny) * calib.rangeY * sensitivity + 1.1,
    z: 1.5
  };
}

function dedupeHands(candidates, currentAppState) {
  const withBounds = candidates.map(c => ({ c, bounds: landmarkBounds(c.landmarks) }));

  // Odfiltruj twarze
  const real = withBounds.filter(({ c, bounds }) => !isFaceCandidateWithBounds(c, bounds, currentAppState));

  // Odfiltruj nakładające się (ta sama pozycja = jeden obiekt)
  const unique = [];
  for (const item of real) {
    const { bounds } = item;
    const dup = unique.find(u => {
      const ub = u.bounds;
      return Math.abs(ub.centerX - bounds.centerX) < 0.12 &&
             Math.abs(ub.centerY - bounds.centerY) < 0.12;
    });
    if (!dup) unique.push(item);
  }

  // Stabilny porządek pomocniczy. Sloty lewy/prawy wyliczamy później z pozycji świata,
  // żeby flipCamera nie zamieniał kolorów ani torów.
  unique.sort((a, b) => {
    const ax = a.bounds.centerX;
    const bx = b.bounds.centerX;
    return bx - ax;
  });

  return unique.map(({ c, bounds }) => {
    c.bounds = bounds;
    return c;
  });
}


function oppositeSide(side) {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return null;
}

function candidateHandSide(candidate) {
  const label = String(candidate?.handedness || '').toLowerCase();
  let side = null;
  if (label.includes('left')) side = 'left';
  else if (label.includes('right')) side = 'right';
  // Ten sam przełącznik naprawia kamery, które oddają już lustrzany obraz.
  return flipCamera ? oppositeSide(side) : side;
}

function strongestCandidate(unique) {
  if (!unique.length) return null;
  // W trybie jednej ręki NIE zgadujemy lewa/prawa po kadrze, bo jedna fizyczna ręka
  // często trafiała do złego slotu. Bierzemy najpewniejszą widoczną dłoń i
  // mapujemy ją na wybrany miecz/lane.
  return [...unique].sort((a, b) => (b.score || 0) - (a.score || 0))[0] || unique[0];
}

function candidateWorldPos(candidate, calib) {
  if (!candidate?.landmarks?.length) return null;
  return mapToWorld(candidate.landmarks[0], calib);
}

function assignCandidatesToWorldSlots(unique, calib) {
  if (!unique.length) return { leftCand: null, rightCand: null };

  const mapped = unique
    .map(candidate => ({ candidate, pos: candidateWorldPos(candidate, calib) }))
    .filter(item => item.pos);

  if (!mapped.length) return { leftCand: null, rightCand: null };

  const labeled = mapped
    .map(item => ({ ...item, side: candidateHandSide(item.candidate) }))
    .filter(item => item.side);
  const labeledLeft  = labeled.find(item => item.side === 'left');
  const labeledRight = labeled.find(item => item.side === 'right');
  if (labeledLeft && labeledRight && labeledLeft.candidate !== labeledRight.candidate) {
    return {
      leftCand: labeledLeft.candidate,
      rightCand: labeledRight.candidate,
    };
  }

  // Fallback bez etykiet: slot miecza wynika z pozycji w świecie gry.
  // Przełącznik flipCamera odwraca tę oś, gdy kamera/browser zamienia strony.
  mapped.sort((a, b) => a.pos.x - b.pos.x);

  if (mapped.length === 1) {
    const only = mapped[0];
    return only.pos.x <= 0
      ? { leftCand: only.candidate, rightCand: null }
      : { leftCand: null, rightCand: only.candidate };
  }

  return {
    leftCand:  mapped[0].candidate,
    rightCand: mapped[mapped.length - 1].candidate,
  };
}

function applyCandidateToSlot(candidate, slot, calib) {
  const buf = slot === 'left' ? lBuf : rBuf;
  if (!candidate) {
    clearBuf(buf);
    return { pos: null, quat: null, conf: 0 };
  }

  const wrist = candidate.landmarks[0];
  const worldPos = mapToWorld(wrist, calib);
  const smoothSize = computeSmoothSize(buf, worldPos);
  if (buf.length > smoothSize) {
    buf.splice(0, buf.length - smoothSize);
    delete buf._idx;
  }
  push(buf, worldPos, smoothSize);
  return {
    pos: avg(buf),
    quat: computeQuaternion(candidate.landmarks),
    conf: candidate.score || 0,
  };
}

function analyzeHands(candidates, currentAppState, calib) {
  const unique = dedupeHands(candidates, currentAppState);

  let leftCand  = null;
  let rightCand = null;

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
    leftCand = slots.leftCand;
    rightCand = slots.rightCand;
  }

  const left  = applyCandidateToSlot(leftCand, 'left', calib);
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

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'setState') {
    appState = payload.appState;
    if (payload.oneHandMode !== undefined) oneHandMode = payload.oneHandMode === 'both' ? null : payload.oneHandMode;
    return;
  }

  if (type === 'setCalibration') {
    calibration = payload;
    clearBuf(lBuf);
    clearBuf(rBuf);
    return;
  }

  if (type === 'setSettings') {
    if (payload.sensitivity !== undefined) sensitivity = payload.sensitivity;
    // Source of truth dla flipCamera jest synchronizowany z tracking.js przez wiadomość workera.
    if (payload.flipCamera  !== undefined) flipCamera  = Boolean(payload.flipCamera);
    if (payload.oneHandMode !== undefined) oneHandMode = payload.oneHandMode === 'both' ? null : payload.oneHandMode;
    return;
  }

  if (type === 'analyze') {
    const result = analyzeHands(payload.candidates, appState, calibration);
    self.postMessage({ type: 'result', payload: result });
    return;
  }
};
