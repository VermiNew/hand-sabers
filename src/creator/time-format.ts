export function formatCreatorTime(seconds: number, showCentiseconds = false): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const base = `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  if (!showCentiseconds) return base;
  const centiseconds = Math.floor((safeSeconds % 1) * 100);
  return `${base}.${String(centiseconds).padStart(2, '0')}`;
}
