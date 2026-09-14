import { t } from '../i18n/index.ts';
import { reportProductTelemetry } from '../core/product-telemetry.ts';

const MAX_TECHNICAL_DETAILS_LENGTH = 8_000;
const DUPLICATE_WINDOW_MS = 5_000;

let initialized = false;
let lastSignature = '';
let lastShownAt = 0;

function describeError(value: unknown): { message: string; technical: string } {
  if (value instanceof Error) {
    return {
      message: value.message || value.name,
      technical: value.stack || `${value.name}: ${value.message}`,
    };
  }
  const message = typeof value === 'string' ? value : String(value ?? t('errors.unknownError'));
  return { message, technical: message };
}

function recoveryHint(message: string): string {
  if (/fetch|network|load failed|connection|server/i.test(message)) return t('errors.networkRecovery');
  if (/camera|video source|notallowederror|notreadableerror/i.test(message)) return t('errors.cameraRecovery');
  return t('errors.unexpectedRecovery');
}

function ensureNotice(): HTMLElement {
  const existing = document.getElementById('frontendErrorNotice');
  if (existing) return existing;
  const notice = document.createElement('aside');
  notice.id = 'frontendErrorNotice';
  notice.className = 'frontend-error-notice';
  notice.setAttribute('role', 'alert');
  notice.setAttribute('aria-live', 'assertive');
  notice.innerHTML = `
    <button class="frontend-error-close" type="button" aria-label=""></button>
    <strong class="frontend-error-title"></strong>
    <p class="frontend-error-message"></p>
    <p class="frontend-error-recovery"></p>
    <details>
      <summary></summary>
      <pre></pre>
    </details>`;
  notice.querySelector<HTMLButtonElement>('.frontend-error-close')?.addEventListener('click', () => {
    notice.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!notice.classList.contains('is-visible')) notice.hidden = true;
    }, 180);
  });
  notice.hidden = true;
  document.body.append(notice);
  return notice;
}

export function reportUnhandledFrontendError(context: string, value: unknown): void {
  const { message, technical } = describeError(value);
  const signature = `${context}:${message}`;
  const now = Date.now();
  if (signature === lastSignature && now - lastShownAt < DUPLICATE_WINDOW_MS) return;
  lastSignature = signature;
  lastShownAt = now;

  console.error(`[frontend:${context}]`, value);
  reportProductTelemetry('error', 'frontend.unhandled', {
    context: context.slice(0, 40),
    type: value instanceof Error ? value.name.slice(0, 80) : typeof value,
  });
  const notice = ensureNotice();
  const close = notice.querySelector<HTMLButtonElement>('.frontend-error-close');
  if (close) {
    close.textContent = '×';
    close.setAttribute('aria-label', t('errors.dismiss'));
  }
  const title = notice.querySelector<HTMLElement>('.frontend-error-title');
  const messageElement = notice.querySelector<HTMLElement>('.frontend-error-message');
  const recovery = notice.querySelector<HTMLElement>('.frontend-error-recovery');
  const summary = notice.querySelector<HTMLElement>('summary');
  const pre = notice.querySelector<HTMLElement>('pre');
  if (title) title.textContent = t('errors.unexpectedTitle');
  if (messageElement) messageElement.textContent = message;
  if (recovery) recovery.textContent = recoveryHint(message);
  if (summary) summary.textContent = t('errors.technicalDetails');
  if (pre) pre.textContent = `[${context}]\n${technical}`.slice(0, MAX_TECHNICAL_DETAILS_LENGTH);
  notice.hidden = false;
  notice.classList.remove('is-visible');
  void notice.offsetWidth;
  notice.classList.add('is-visible');
}

export function initFrontendErrorBoundary(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener('error', event => {
    if (event.error !== undefined && event.error !== null) {
      reportUnhandledFrontendError('window', event.error);
      return;
    }
    const target = event.target;
    if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement || target instanceof HTMLImageElement) {
      const source = target instanceof HTMLLinkElement ? target.href : target.src;
      reportUnhandledFrontendError('resource', new Error(`${t('errors.resourceFailed')}: ${source}`));
    }
  }, true);
  window.addEventListener('unhandledrejection', event => {
    reportUnhandledFrontendError('promise', event.reason);
  });
}
