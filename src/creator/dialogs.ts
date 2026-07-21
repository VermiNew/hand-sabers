import { t } from '../i18n/index.ts';

type ToastType = 'info' | 'error' | 'success';

interface ToastOptions {
  type?: ToastType;
  timeout?: number;
}

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface AlertOptions {
  title?: string;
  type?: ToastType;
}

let toastRoot: HTMLDivElement | null = null;
let modalRoot: HTMLDivElement | null = null;

function ensureToastRoot(): HTMLDivElement {
  if (toastRoot) return toastRoot;
  toastRoot = document.createElement('div');
  toastRoot.className = 'toast-root';
  document.body.appendChild(toastRoot);
  return toastRoot;
}

function ensureModalRoot(): HTMLDivElement {
  if (modalRoot) return modalRoot;
  modalRoot = document.createElement('div');
  modalRoot.className = 'modal-root';
  modalRoot.hidden = true;
  document.body.appendChild(modalRoot);
  return modalRoot;
}

export function showToast(message: string, { type = 'info', timeout = 2800 }: ToastOptions = {}): void {
  const root = ensureToastRoot();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 180);
  }, timeout);
}

export function showConfirm(
  message: string,
  { title = t('creator.dialogConfirm'), confirmText = 'OK', cancelText = t('creator.dialogCancel'), danger = false }: ConfirmOptions = {},
): Promise<boolean> {
  const root = ensureModalRoot();
  root.hidden = false;
  root.innerHTML = `
    <div class="modal-backdrop"></div>
    <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h2 id="modalTitle">${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        ${cancelText ? `<button class="modal-btn ghost" data-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
        <button class="modal-btn ${danger ? 'danger' : 'primary'}" data-action="confirm">${escapeHtml(confirmText)}</button>
      </div>
    </section>
  `;
  return new Promise(resolve => {
    const cleanup = (value: boolean): void => {
      root.hidden = true;
      root.innerHTML = '';
      resolve(value);
    };
    root.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener('click', () => cleanup(false));
    root.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.addEventListener('click', () => cleanup(true));
    root.querySelector<HTMLElement>('.modal-backdrop')?.addEventListener('click', () => cleanup(false));
    root.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.focus();
  });
}

export function showAlert(
  message: string,
  { title = t('errors.error'), type = 'error' }: AlertOptions = {},
): Promise<boolean> {
  showToast(message, { type });
  return showConfirm(message, { title, confirmText: 'OK', cancelText: '', danger: type === 'error' });
}

function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' };
  return String(value ?? '').replace(/[&<>"]/g, ch => entities[ch]!);
}
