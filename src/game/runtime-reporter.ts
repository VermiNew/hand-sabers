import { S, state } from '../core/state.ts';
import { t } from '../i18n/index.ts';
import { ui, showCameraError } from '../ui/ui.ts';

export interface RuntimeReporter {
  reportRuntimeError(context: string, error: unknown): void;
  runAsyncTask(context: string, task: () => Promise<unknown>, onError?: () => void): void;
}

export function createRuntimeReporter({ showOverlay }: { showOverlay(): void }): RuntimeReporter {
  let lastError = '';
  let lastErrorAt = 0;

  function reportRuntimeError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const signature = `${context}:${message}`;
    const now = Date.now();
    if (signature !== lastError || now - lastErrorAt > 5_000) {
      console.error(`[${context}]`, error);
      lastError = signature;
      lastErrorAt = now;
    }
    if (ui.dStatus) ui.dStatus.textContent = `${t('errors.error')}: ${message}`;
    if (state.appState === S.LOADING || state.appState === S.CALIB) {
      showCameraError(error);
      showOverlay();
    }
  }

  function runAsyncTask(context: string, task: () => Promise<unknown>, onError?: () => void): void {
    void Promise.resolve()
      .then(task)
      .catch(error => {
        reportRuntimeError(context, error);
        try {
          onError?.();
        } catch (recoveryError) {
          reportRuntimeError(`${context}:recovery`, recoveryError);
        }
      });
  }

  return { reportRuntimeError, runAsyncTask };
}
