import { replaceSettings } from '../core/settings.ts';
import {
  MAX_SETTINGS_IMPORT_BYTES,
  createSettingsExport,
  getSettingsChanges,
  parseSettingsImport,
  serializeSettingsExport,
} from '../core/settings-transfer.ts';
import type { SettingsTransferDocument } from '../core/settings-transfer.ts';
import { setLang, t } from '../i18n/index.ts';
import type { Settings } from '../types/index.js';
import { isDeveloperPanelEnabled } from './devpanel.ts';

export function initSettingsTransfer(settings: Settings): void {
  const exportButton = document.getElementById('settingsExport') as HTMLButtonElement | null;
  const importButton = document.getElementById('settingsImport') as HTMLButtonElement | null;
  const importFile = document.getElementById('settingsImportFile') as HTMLInputElement | null;
  const applyButton = document.getElementById('settingsImportApply') as HTMLButtonElement | null;
  const preview = document.getElementById('settingsTransferPreview');
  const summary = document.getElementById('settingsTransferSummary');
  const changesList = document.getElementById('settingsTransferList');
  const status = document.getElementById('settingsTransferStatus');

  let pendingImport: SettingsTransferDocument | null = null;

  function setStatus(message: string, error = false): void {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function formatValue(value: unknown): string {
    if (Array.isArray(value)) return `[${value.length}]`;
    if (value && typeof value === 'object') return t('settings.transfer.calibrationData');
    return String(value ?? '—');
  }

  function errorMessage(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    let message = t('settings.transfer.invalid');
    if (code === 'SETTINGS_FILE_TOO_LARGE') message = t('settings.transfer.tooLarge');
    else if (code === 'SETTINGS_WRONG_PRODUCT') message = t('settings.transfer.wrongProduct');
    else if (code === 'SETTINGS_UNSUPPORTED_VERSION') message = t('settings.transfer.unsupportedVersion');
    else if (code === 'SETTINGS_UNKNOWN_FIELD') message = t('settings.transfer.unknownField');

    const developerMode = Boolean(settings.developerMode) || isDeveloperPanelEnabled();
    return developerMode && code ? `${message} [${code}]` : message;
  }

  exportButton?.addEventListener('click', () => {
    const blob = new Blob([serializeSettingsExport(settings)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hand-sabers-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(t('settings.transfer.exported'));
  });

  importButton?.addEventListener('click', () => importFile?.click());
  importFile?.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    pendingImport = null;
    if (preview) preview.hidden = true;
    try {
      if (file.size > MAX_SETTINGS_IMPORT_BYTES) throw new Error('SETTINGS_FILE_TOO_LARGE');
      const imported = parseSettingsImport(await file.text());
      const changes = getSettingsChanges(settings, imported.settings);
      pendingImport = imported;
      if (summary) {
        summary.textContent = changes.length
          ? t('settings.transfer.changes', { count: changes.length })
          : t('settings.transfer.noChanges');
      }
      if (changesList) {
        changesList.replaceChildren();
        for (const change of changes) {
          const row = document.createElement('div');
          row.className = 'settings-transfer-change';
          const key = document.createElement('strong');
          key.textContent = change.key;
          const values = document.createElement('span');
          values.textContent = `${formatValue(change.before)} → ${formatValue(change.after)}`;
          row.append(key, values);
          changesList.append(row);
        }
      }
      if (applyButton) {
        const applyLabelKey = changes.length
          ? 'settings.transfer.applyButton'
          : 'settings.transfer.nothingToApplyButton';
        applyButton.disabled = changes.length === 0;
        applyButton.dataset['i18n'] = applyLabelKey;
        applyButton.textContent = t(applyLabelKey);
      }
      if (preview) preview.hidden = false;
      setStatus('');
    } catch (error) {
      setStatus(errorMessage(error), true);
    }
  });

  applyButton?.addEventListener('click', () => {
    if (!pendingImport) return;
    const changes = getSettingsChanges(settings, pendingImport.settings);
    if (!changes.length) return;
    if (!window.confirm(t('settings.transfer.confirm', { count: changes.length }))) return;
    const previous = createSettingsExport(settings).settings;
    try {
      replaceSettings(pendingImport.settings);
      setLang(pendingImport.settings.language);
      try { sessionStorage.setItem('hs_settings_imported', '1'); } catch {}
      location.reload();
    } catch {
      try { replaceSettings(previous); } catch {}
      setStatus(t('settings.transfer.saveFailed'), true);
    }
  });

  try {
    if (sessionStorage.getItem('hs_settings_imported') === '1') {
      sessionStorage.removeItem('hs_settings_imported');
      setStatus(t('settings.transfer.applied'));
    }
  } catch {}
}
