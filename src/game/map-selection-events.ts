import { t } from '../i18n/index.ts';
import { loadMapById } from './map-session.ts';
import { narratorQuick } from './narrator.ts';

interface MapSelectionEventsOptions {
  onAutoPlay(): void;
  onManualPlay(): void;
}

export function initMapSelectionEvents({ onAutoPlay, onManualPlay }: MapSelectionEventsOptions): void {
  window.addEventListener('hand-sabers:map-selected', event => {
    const detail = (event as CustomEvent).detail as { mapId: string; autoPlay?: boolean } | undefined;
    if (!detail?.mapId) return;
    if (!detail.autoPlay) onManualPlay();
    void loadMapById(detail.mapId).then(success => {
      if (success) {
        void narratorQuick(t('narrator.mapLoaded'), 'happy');
        if (detail.autoPlay) onAutoPlay();
      } else {
        void narratorQuick(t('narrator.mapLoadFailed'), 'encourage');
      }
    });
  });
}
