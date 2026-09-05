export function formatCreatorTime(seconds: number, showCentiseconds = false): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const base = `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  if (!showCentiseconds) return base;
  const centiseconds = Math.floor((safeSeconds % 1) * 100);
  return `${base}.${String(centiseconds).padStart(2, '0')}`;
}

export function parseCreatorTime(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  if (!trimmed.includes(':')) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const parts = trimmed.split(':');
  if (parts.length !== 2) return null;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (!Number.isInteger(minutes) || minutes < 0 || !Number.isFinite(seconds) || seconds < 0 || seconds >= 60) return null;
  return minutes * 60 + seconds;
}
