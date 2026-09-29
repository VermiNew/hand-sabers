import { t } from '../i18n/index.ts';

const TOKEN_STORAGE_KEY = 'hs_admin_token';

function readToken(): string {
  try { return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? ''; } catch { return ''; }
}

function writeToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch { /* storage unavailable: the token is simply asked for again */ }
}

async function isTokenRequired(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  const body = await response.clone().json().catch(() => null) as { code?: unknown } | null;
  return body?.code === 'ADMIN_TOKEN_REQUIRED';
}

/**
 * fetch() for routes protected by the server's admin token. Sends the remembered
 * token, and on ADMIN_TOKEN_REQUIRED asks for one once and retries. The
 * token lives in sessionStorage only. Returns the last response, so callers
 * handle a declined or wrong token like any other failed request.
 */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const send = (token: string): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  let response = await send(readToken());
  if (!await isTokenRequired(response)) return response;

  const entered = window.prompt(t('admin.tokenPrompt'))?.trim();
  if (!entered) return response;
  response = await send(entered);
  writeToken(await isTokenRequired(response) ? '' : entered);
  return response;
}
