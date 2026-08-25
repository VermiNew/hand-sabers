import { t } from '../i18n/index.ts';

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing multiplayer element: ${id}`);
  return found as T;
}

export function translateServerError(code: string): string {
  const key = `multiplayer.errors.${code}`;
  const translated = t(key);
  return translated === key ? t('multiplayer.errors.REQUEST_FAILED') : translated;
}

export async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const serverCode = typeof payload['error'] === 'string' && /^[A-Z_]+$/.test(payload['error'])
      ? payload['error']
      : '';
    const code = serverCode
      || (response.status === 404
        ? 'ROOM_NOT_FOUND'
        : response.status === 429
          ? 'RATE_LIMITED'
          : response.status >= 500 ? 'SERVER_UNAVAILABLE' : 'REQUEST_FAILED');
    throw new Error(translateServerError(code));
  }
  return payload as T;
}

export function requestErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return translateServerError('SERVER_UNAVAILABLE');
  return error instanceof Error ? error.message : translateServerError('REQUEST_FAILED');
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('COPY_FAILED');
}

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 32) || t('player.defaultName');
}

export function websocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}
