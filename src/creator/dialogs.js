let toastRoot = null;
let modalRoot = null;

function ensureToastRoot() {
  if (toastRoot) return toastRoot;
  toastRoot = document.createElement('div');
  toastRoot.className = 'toast-root';
  document.body.appendChild(toastRoot);
  return toastRoot;
}

function ensureModalRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = document.createElement('div');
  modalRoot.className = 'modal-root';
  modalRoot.hidden = true;
  document.body.appendChild(modalRoot);
  return modalRoot;
}

export function showToast(message, { type = 'info', timeout = 2800 } = {}) {
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

export function showConfirm(message, { title = 'Potwierdź', confirmText = 'OK', cancelText = 'Anuluj', danger = false } = {}) {
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
    const cleanup = (value) => {
      root.hidden = true;
      root.innerHTML = '';
      resolve(value);
    };
    root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => cleanup(false));
    root.querySelector('[data-action="confirm"]')?.addEventListener('click', () => cleanup(true));
    root.querySelector('.modal-backdrop')?.addEventListener('click', () => cleanup(false));
    root.querySelector('[data-action="confirm"]')?.focus?.();
  });
}

export function showAlert(message, { title = 'Komunikat', type = 'error' } = {}) {
  showToast(message, { type });
  return showConfirm(message, { title, confirmText: 'OK', cancelText: '', danger: type === 'error' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));
}
