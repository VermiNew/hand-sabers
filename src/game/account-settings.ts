import { t } from '../i18n/index.ts';

interface Account {
  id: string;
  username: string;
  createdAt: string;
}

interface AccountResponse {
  account: Account;
}

interface SessionResponse {
  authenticated: boolean;
  account: Account | null;
}

type AccountMode = 'login' | 'register' | 'recover';
type MessageKind = 'error' | 'success' | 'neutral';

const TRANSLATED_ERROR_CODES = new Set([
  'ACCOUNT_EXISTS',
  'ACCOUNT_LOGIN_DENIED',
  'ACCOUNT_LOGIN_RATE_LIMITED',
  'ACCOUNT_REGISTER_RATE_LIMITED',
  'ACCOUNT_RECOVERY_DENIED',
  'ACCOUNT_RECOVERY_RATE_LIMITED',
  'ACCOUNT_DELETE_DENIED',
  'ACCOUNT_DELETE_RATE_LIMITED',
  'ACCOUNT_SESSION_REQUIRED',
  'INVALID_USERNAME',
  'INVALID_PASSWORD',
  'INVALID_RECOVERY_PIN',
  'INVALID_ACCOUNT_INPUT',
]);

class AccountApiError extends Error {
  readonly code: string;

  constructor(message: string, code = '') {
    super(message);
    this.name = 'AccountApiError';
    this.code = code;
  }
}

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

async function accountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const requestInit: RequestInit = {
      ...init,
      credentials: 'same-origin',
    };
    if (init?.body) {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      requestInit.headers = headers;
    }
    response = await fetch(path, requestInit);
  } catch {
    throw new AccountApiError(t('account.errors.network'));
  }
  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
  if (!response.ok) {
    const code = typeof payload?.code === 'string' ? payload.code : '';
    const fallback = typeof payload?.error === 'string' ? payload.error : t('account.errors.unknown');
    const message = TRANSLATED_ERROR_CODES.has(code) ? t(`account.errors.${code}`) : fallback;
    throw new AccountApiError(message, code);
  }
  return payload as T;
}

function formValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? '');
}

export function initAccountSettings(): void {
  const guestPanel = element<HTMLElement>('accountGuestPanel');
  const memberPanel = element<HTMLElement>('accountMemberPanel');
  const statusBadge = element<HTMLElement>('accountStatusBadge');
  const usernameLabel = element<HTMLElement>('accountUsername');
  const message = element<HTMLElement>('accountMessage');
  const loginForm = element<HTMLFormElement>('accountLoginForm');
  const registerForm = element<HTMLFormElement>('accountRegisterForm');
  const recoverForm = element<HTMLFormElement>('accountRecoverForm');
  const deleteForm = element<HTMLFormElement>('accountDeleteForm');
  const logoutButton = element<HTMLButtonElement>('accountLogout');
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-account-mode]')];
  if (!guestPanel || !memberPanel || !statusBadge || !loginForm || !registerForm || !recoverForm) return;

  const forms: Record<AccountMode, HTMLFormElement> = {
    login: loginForm,
    register: registerForm,
    recover: recoverForm,
  };
  let account: Account | null = null;
  let busy = true;

  const setMessage = (text: string, kind: MessageKind = 'neutral'): void => {
    if (!message) return;
    message.textContent = text;
    message.dataset['kind'] = kind;
  };

  const setBusy = (value: boolean): void => {
    busy = value;
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.account-settings button, .account-settings input')
      .forEach(control => { control.disabled = value; });
    document.querySelector<HTMLElement>('.account-settings')?.classList.toggle('is-busy', value);
  };

  const renderAccount = (): void => {
    guestPanel.hidden = account !== null;
    memberPanel.hidden = account === null;
    statusBadge.textContent = account ? t('account.connected') : t('account.guest');
    statusBadge.classList.toggle('is-connected', account !== null);
    if (usernameLabel) usernameLabel.textContent = account?.username ?? '';
    window.dispatchEvent(new CustomEvent('hand-sabers:account-state', { detail: { account } }));
  };

  const switchMode = (mode: AccountMode): void => {
    if (busy) return;
    for (const [name, form] of Object.entries(forms) as Array<[AccountMode, HTMLFormElement]>) {
      form.hidden = name !== mode;
    }
    modeButtons.forEach(button => {
      const selected = button.dataset['accountMode'] === mode;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    setMessage('');
    forms[mode].querySelector<HTMLInputElement>('input')?.focus();
  };

  modeButtons.forEach(button => {
    button.addEventListener('click', () => switchMode((button.dataset['accountMode'] ?? 'login') as AccountMode));
  });

  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const username = formValue(loginForm, 'username');
    const password = formValue(loginForm, 'password');
    setBusy(true);
    setMessage(t('account.working'));
    void accountRequest<AccountResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }).then(result => {
      account = result.account;
      loginForm.reset();
      renderAccount();
      setMessage(t('account.loginSuccess'), 'success');
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : t('account.errors.unknown'), 'error');
    }).finally(() => setBusy(false));
  });

  registerForm.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const username = formValue(registerForm, 'username');
    const password = formValue(registerForm, 'password');
    const recoveryPin = formValue(registerForm, 'recoveryPin');
    setBusy(true);
    setMessage(t('account.working'));
    void accountRequest<AccountResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, recoveryPin }),
    }).then(result => {
      account = result.account;
      registerForm.reset();
      renderAccount();
      setMessage(t('account.registerSuccess'), 'success');
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : t('account.errors.unknown'), 'error');
    }).finally(() => setBusy(false));
  });

  recoverForm.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const username = formValue(recoverForm, 'username');
    const recoveryPin = formValue(recoverForm, 'recoveryPin');
    const newPassword = formValue(recoverForm, 'newPassword');
    setBusy(true);
    setMessage(t('account.working'));
    void accountRequest<AccountResponse>('/api/auth/recover', {
      method: 'POST',
      body: JSON.stringify({ username, recoveryPin, newPassword }),
    }).then(result => {
      account = result.account;
      recoverForm.reset();
      renderAccount();
      setMessage(t('account.recoverSuccess'), 'success');
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : t('account.errors.unknown'), 'error');
    }).finally(() => setBusy(false));
  });

  logoutButton?.addEventListener('click', () => {
    if (busy) return;
    setBusy(true);
    void accountRequest<null>('/api/auth/logout', { method: 'POST' }).then(() => {
      account = null;
      renderAccount();
      setMessage(t('account.logoutSuccess'), 'success');
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : t('account.errors.unknown'), 'error');
    }).finally(() => setBusy(false));
  });

  deleteForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || !window.confirm(t('account.deleteConfirm'))) return;
    const password = formValue(deleteForm, 'password');
    setBusy(true);
    setMessage(t('account.working'));
    void accountRequest<null>('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }).then(() => {
      account = null;
      deleteForm.reset();
      renderAccount();
      setMessage(t('account.deleteSuccess'), 'success');
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : t('account.errors.unknown'), 'error');
    }).finally(() => setBusy(false));
  });

  void accountRequest<SessionResponse>('/api/auth/session').then(result => {
    account = result.authenticated ? result.account : null;
    renderAccount();
  }).catch((error: unknown) => {
    account = null;
    renderAccount();
    setMessage(error instanceof Error ? error.message : t('account.errors.unknown'), 'error');
  }).finally(() => setBusy(false));
}
