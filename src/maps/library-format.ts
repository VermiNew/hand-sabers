export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export function formatMapTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function withDevQuery(url: string): string {
  const current = new URLSearchParams(location.search);
  const target = new URL(url, location.href);
  for (const key of ['dev', 'testing']) {
    if (current.has(key)) target.searchParams.set(key, current.get(key) ?? '');
  }
  return `${target.pathname.split('/').pop()}${target.search}${target.hash}`;
}
