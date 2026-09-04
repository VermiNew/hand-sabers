import { t } from '../i18n/index.ts';
import { loadMapById } from './map-session.ts';
import { narratorQuick } from './narrator.ts';

export function initMapSelectionEvents(): void {
  window.addEventListener('hand-sabers:map-selected', event => {
    const detail = (event as CustomEvent).detail as { mapId: string } | undefined;
    if (!detail?.mapId) return;
    void loadMapById(detail.mapId).then(success => {
      if (success) {
        void narratorQuick(t('narrator.mapLoaded'), 'happy');
      } else {
        void narratorQuick(t('narrator.mapLoadFailed'), 'encourage');
      }
    });
  });
}
