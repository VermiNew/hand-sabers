import JSZip from 'jszip';
import { importMapLocally, importMapToServer } from '../core/map-import.ts';
import { loadLocalMapAudio } from '../core/localstore.ts';
import { showAlert, showToast } from '../creator/dialogs.ts';
import { t } from '../i18n/index.ts';
import type { MapEntry } from './library-api.ts';

interface ImportLibraryMapOptions {
  reload(): Promise<void>;
  reportError(context: string, error: unknown): void;
  stopPreview(): void;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function importLibraryMap(
  file: File,
  { reload, reportError, stopPreview }: ImportLibraryMapOptions,
): Promise<void> {
  stopPreview();
  showToast(t('maps.importing', { name: file.name }), { type: 'info' });
  try {
    const imported = await importMapToServer(file);
    showToast(t('maps.importedServer', {
      id: imported.id,
      audio: imported.audio ? t('maps.withAudio') : '',
    }), { type: 'success' });
    await reload();
  } catch (serverError) {
    try {
      const imported = await importMapLocally(file);
      showToast(t('maps.importedLocal', {
        id: imported.id,
        audio: imported.audio ? t('maps.withAudio') : '',
      }), { type: 'success' });
      await reload();
    } catch (localError) {
      const message = localError instanceof Error ? localError.message : String(localError);
      showToast(t('maps.importFailed', { message }), { type: 'error' });
      void showAlert(t('maps.importFailed', { message }), { title: t('maps.importFailedTitle') })
        .catch(error => reportError('import-error-dialog', error));
      console.error('Server import failed:', serverError);
    }
  }
}

export async function exportLibraryMap(id: string, map: MapEntry | null): Promise<void> {
  try {
    const response = await fetch(`/api/maps/${encodeURIComponent(id)}/export.zip`);
    if (!response.ok) throw new Error(`${response.status}`);
    downloadBlob(await response.blob(), `${id}.zip`);
    showToast(t('maps.exportSuccess'), { type: 'success' });
  } catch {
    if (!map || (map.source !== 'local' && map.source !== 'autosave' && map.source !== 'server+local')) {
      showToast(t('maps.exportFail'), { type: 'error' });
      return;
    }

    try {
      const zip = new JSZip();
      const mapJson: Record<string, unknown> = { ...map };
      for (const key of ['source', 'localOnly', 'updatedAt', '_serverAudioPending', '_localAudioPending', '_audioReady']) {
        delete mapJson[key];
      }

      const audio = await loadLocalMapAudio(id).catch(() => null);
      if (audio) {
        mapJson['meta'] = {
          ...(mapJson['meta'] as Record<string, unknown> | undefined),
          audioFile: audio.fileName,
        };
        zip.file(audio.fileName || `${id}.ogg`, audio.arrayBuffer);
      }

      zip.file('map.json', JSON.stringify(mapJson, null, 2));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      downloadBlob(blob, `${id}.zip`);
      showToast(t('maps.exportLocalSuccess'), { type: 'success' });
    } catch {
      showToast(t('maps.exportLocalFail'), { type: 'error' });
    }
  }
}
