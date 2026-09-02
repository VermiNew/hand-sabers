import {
  isPhoneAudioActive,
  pausePhoneAudio,
  playPhoneAudio,
  preparePhoneAudio,
  stopPhoneAudio,
} from '../remote/host-audio.ts';
import { state } from '../core/state.ts';
import type { Settings } from '../types/index.js';
import { setMusicVolume } from './audio.ts';

export function initPhoneAudioEvents(settings: Settings): void {
  window.addEventListener('hand-sabers:phone-audio-connected', () => {
    if (settings.phoneAudioOutput && state.map?.id && !state.map.localOnly) {
      preparePhoneAudio(state.map.id);
    }
  });
  window.addEventListener('hand-sabers:map-audio-start', event => {
    if (!isPhoneAudioActive()) return;
    const detail = (event as CustomEvent<{ offsetSec: number; playbackRate: number }>).detail;
    if (!detail) return;
    playPhoneAudio(detail.offsetSec, Date.now(), detail.playbackRate);
  });
  window.addEventListener('hand-sabers:map-audio-pause', () => {
    if (isPhoneAudioActive()) pausePhoneAudio();
  });
  window.addEventListener('hand-sabers:map-audio-stop', () => {
    if (isPhoneAudioActive()) stopPhoneAudio();
  });
  window.addEventListener('hand-sabers:phone-audio-mute', () => {
    setMusicVolume(0);
  });
  window.addEventListener('hand-sabers:phone-audio-restore', event => {
    const detail = (event as CustomEvent<{ volume: number }>).detail;
    setMusicVolume(detail?.volume ?? settings.musicVolume);
  });
}
