export interface DeveloperAccessResult {
  ok: boolean;
  message: string;
  code: string;
}

let accessGranted = false;

function responseError(body: unknown, fallback: string): DeveloperAccessResult {
  if (!body || typeof body !== 'object') return { ok: false, message: fallback, code: 'DEVELOPER_ACCESS_ERROR' };
  const value = body as Record<string, unknown>;
  return {
    ok: false,
    message: typeof value['error'] === 'string' ? value['error'] : fallback,
    code: typeof value['code'] === 'string' ? value['code'] : 'DEVELOPER_ACCESS_ERROR',
  };
}

export function isDeveloperAccessGranted(): boolean {
  return accessGranted;
}

export async function getDeveloperAccessConfiguration(): Promise<boolean> {
  try {
    const response = await fetch('/api/developer/access', { cache: 'no-store' });
    if (!response.ok) return false;
    const body = await response.json() as { configured?: unknown };
    return body.configured === true;
  } catch {
    return false;
  }
}

export async function unlockDeveloperAccess(token: string): Promise<DeveloperAccessResult> {
  try {
    const response = await fetch('/api/developer/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok || !body || typeof body !== 'object' || (body as Record<string, unknown>)['ok'] !== true) {
      return responseError(body, 'Nie udało się odblokować trybu developerskiego.');
    }
    accessGranted = true;
    window.dispatchEvent(new CustomEvent('hand-sabers:developer-access-granted'));
    return { ok: true, message: '', code: 'DEVELOPER_ACCESS_GRANTED' };
  } catch {
    return {
      ok: false,
      message: 'Serwer jest niedostępny. Sprawdź połączenie i spróbuj ponownie.',
      code: 'DEVELOPER_ACCESS_UNAVAILABLE',
    };
  }
}
