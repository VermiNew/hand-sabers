import { getCurrentLang, t } from '../i18n/index.ts';

interface PhoneCredential {
  id: string;
  phoneToken: string;
  expiresAt: number;
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

let credential: PhoneCredential | null = null;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing remote tracking element: ${id}`);
  return found as T;
}

const status = element<HTMLElement>('remoteStatus');
const statusText = element<HTMLElement>('remoteStatusText');
const codeForm = element<HTMLElement>('remoteCodeForm');
const codeInput = element<HTMLInputElement>('remotePairCode');
const claimButton = element<HTMLButtonElement>('remoteClaim');
const ready = element<HTMLElement>('remoteCredentialReady');
const errorMessage = element<HTMLElement>('remoteError');

function applyTranslations(): void {
  document.documentElement.lang = getCurrentLang();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => {
    const key = node.dataset['i18n'];
    if (key) node.textContent = t(key);
  });
}

function showError(message: string): void {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function acceptCredential(next: PhoneCredential): void {
  credential = next;
  codeForm.hidden = true;
  ready.hidden = false;
  status.dataset['state'] = 'ready';
  statusText.textContent = t('remoteTracking.credentialReady');
  showError('');
  window.dispatchEvent(new CustomEvent('hand-sabers:phone-credential', { detail: credential }));
}

function credentialFromHash(): PhoneCredential | null {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const id = fragment.get('session') ?? '';
  const phoneToken = fragment.get('token') ?? '';
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (!SESSION_ID_RE.test(id) || !TOKEN_RE.test(phoneToken)) return null;
  return { id, phoneToken, expiresAt: Date.now() + 5 * 60_000 };
}

async function claimHashCredential(candidate: PhoneCredential): Promise<void> {
  try {
    const response = await fetch(`/api/tracking-sessions/${encodeURIComponent(candidate.id)}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidate.phoneToken}` },
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (
      !response.ok
      || payload['id'] !== candidate.id
      || typeof payload['expiresAt'] !== 'number'
      || !Number.isFinite(payload['expiresAt'])
    ) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'NOT_FOUND');
    acceptCredential({ ...candidate, expiresAt: payload['expiresAt'] });
  } catch (error) {
    showError(t(error instanceof Error && error.message === 'RATE_LIMITED'
      ? 'remoteTracking.rateLimited'
      : 'remoteTracking.sessionNotFound'));
  }
}

async function claimCode(): Promise<void> {
  const code = codeInput.value.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    showError(t('remoteTracking.invalidCode'));
    return;
  }
  claimButton.disabled = true;
  showError('');
  try {
    const response = await fetch(`/api/tracking-sessions/code/${encodeURIComponent(code)}`, { method: 'POST' });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (
      !response.ok
      || typeof payload['id'] !== 'string'
      || !SESSION_ID_RE.test(payload['id'])
      || typeof payload['phoneToken'] !== 'string'
      || !TOKEN_RE.test(payload['phoneToken'])
      || typeof payload['expiresAt'] !== 'number'
      || !Number.isFinite(payload['expiresAt'])
    ) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'NOT_FOUND');
    acceptCredential({
      id: payload['id'],
      phoneToken: payload['phoneToken'],
      expiresAt: payload['expiresAt'],
    });
  } catch (error) {
    showError(t(error instanceof Error && error.message === 'RATE_LIMITED'
      ? 'remoteTracking.rateLimited'
      : 'remoteTracking.sessionNotFound'));
  } finally {
    claimButton.disabled = false;
  }
}

applyTranslations();
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '').slice(0, 6);
});
claimButton.addEventListener('click', () => void claimCode());
codeInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') void claimCode();
});

const hashCredential = credentialFromHash();
if (hashCredential) void claimHashCredential(hashCredential);
