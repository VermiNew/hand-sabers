interface CreatorBeat {
  t?: unknown;
  _overlap?: boolean;
}

export function sortBeatsByTime<T extends CreatorBeat>(beats: T[] | null | undefined): T[] {
  if (!Array.isArray(beats)) return [];
  beats.sort((a, b) => Number(a?.t ?? 0) - Number(b?.t ?? 0));
  return beats;
}

export function markOverlaps<T extends CreatorBeat>(beats: T[] | null | undefined, minGap = 0.08): boolean {
  if (!Array.isArray(beats)) return false;
  for (const beat of beats) {
    if (beat && typeof beat === 'object') beat._overlap = false;
  }
  const sorted = [...beats]
    .filter(beat => beat && typeof beat === 'object')
    .sort((a, b) => Number(a?.t ?? 0) - Number(b?.t ?? 0));

  let hasOverlap = false;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const delta = Number(curr?.t ?? 0) - Number(prev?.t ?? 0);
    if (Number.isFinite(delta) && delta < minGap) {
      prev._overlap = true;
      curr._overlap = true;
      hasOverlap = true;
    }
  }
  return hasOverlap;
}

export function removeBeatByReference<T extends CreatorBeat>(
  beats: T[] | null | undefined,
  beat: T,
): T[] {
  if (!Array.isArray(beats)) return [];
  const idx = beats.indexOf(beat);
  if (idx < 0) return beats;
  beats.splice(idx, 1);
  return beats;
}

export function removeBeatsByReference<T extends CreatorBeat>(
  beats: T[] | null | undefined,
  selected: Iterable<T> | null | undefined,
): T[] {
  if (!Array.isArray(beats)) return [];
  const selectedSet = selected instanceof Set ? selected : new Set(selected || []);
  if (!selectedSet.size) return beats;
  return beats.filter(beat => !selectedSet.has(beat));
}
