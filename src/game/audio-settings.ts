import { setSetting } from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import type { Settings } from '../types/index.js';
import {
  isMetronomeActive,
  playTestSound,
  startMetronomeCalibration,
  stopMetronome,
} from './audio-calibration.ts';
import { setMusicVolume, setSfxVolume, setSoundVolume, setVolume } from './audio.ts';
import { narratorQuick } from './narrator.ts';
import {
  preparePhoneAudio,
  setPhoneAudioOutputEnabled,
  stopPhoneAudio,
} from '../remote/host-audio.ts';
import { state } from '../core/state.ts';

type RangeBinder = (input: HTMLInputElement | null) => void;

export interface AudioSettingsController {
  sync(): void;
}

export function initAudioSettings(settings: Settings, bindStyledRange: RangeBinder): AudioSettingsController {
  const volumeInput = document.getElementById('menuVolume') as HTMLInputElement | null;
  const soundInputs = [...document.querySelectorAll<HTMLInputElement>('[data-audio-setting]')];
  const audioOffsetInput = document.getElementById('menuAudioOffset') as HTMLInputElement | null;
  const audioOffsetValue = document.getElementById('menuAudioOffsetValue');
  const testSoundButton = document.getElementById('menuAudioTestSound') as HTMLButtonElement | null;
  const metronomeButton = document.getElementById('menuAudioMetronome') as HTMLButtonElement | null;
  const phoneAudioToggle = document.getElementById('menuPhoneAudioOutput') as HTMLInputElement | null;
  const phoneLatencyInput = document.getElementById('menuPhoneAudioLatency') as HTMLInputElement | null;
  const phoneLatencyValue = document.getElementById('menuPhoneAudioLatencyValue');
  const interfaceSoundInput = document.getElementById('menuInterfaceSoundVolume') as HTMLInputElement | null;

  if (volumeInput) {
    volumeInput.value = String(settings.volume ?? 0.8);
    bindStyledRange(volumeInput);
    volumeInput.addEventListener('input', () => {
      const value = Number(volumeInput.value);
      settings.volume = value;
      setSetting('volume', value);
      setVolume(value);
    });
  }

  const audioSetters: Record<string, (value: number) => void> = {
    musicVolume: setMusicVolume,
    sfxVolume: setSfxVolume,
  };
  for (const input of soundInputs) {
    const key = input.dataset['audioSetting'] ?? '';
    input.value = String((settings as unknown as Record<string, unknown>)[key] ?? 1);
    bindStyledRange(input);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      (settings as unknown as Record<string, unknown>)[key] = value;
      setSetting(key as keyof Settings, value);
      if (audioSetters[key]) audioSetters[key](value);
      else setSoundVolume(key, value);
    });
  }

  if (audioOffsetInput) {
    audioOffsetInput.value = String(settings.audioOffsetMs ?? 0);
    bindStyledRange(audioOffsetInput);
    if (audioOffsetValue) audioOffsetValue.textContent = `${settings.audioOffsetMs ?? 0} ms`;
    audioOffsetInput.addEventListener('input', () => {
      const value = Number(audioOffsetInput.value);
      settings.audioOffsetMs = value;
      setSetting('audioOffsetMs', value);
      if (audioOffsetValue) audioOffsetValue.textContent = `${value} ms`;
    });
  }

  testSoundButton?.addEventListener('click', playTestSound);

  metronomeButton?.addEventListener('click', async () => {
    if (isMetronomeActive()) {
      stopMetronome();
      return;
    }
    const started = await startMetronomeCalibration(
      (result) => {
        const { offsetMs } = result;
        setSetting('audioOffsetMs', offsetMs);
        if (audioOffsetInput) {
          audioOffsetInput.value = String(offsetMs);
          settings.audioOffsetMs = offsetMs;
        }
        if (audioOffsetValue) audioOffsetValue.textContent = `${offsetMs} ms`;
        void narratorQuick(t('narrator.metronomeDone').replace('{{ms}}', String(offsetMs)));
      },
      (active) => {
        metronomeButton.textContent = t(active ? 'settings.audio.metronomeStop' : 'settings.audio.metronomeCalibration');
      },
    );
    if (started) {
      void narratorQuick(t('narrator.metronomeStart'));
    }
  });

  if (phoneAudioToggle) {
    phoneAudioToggle.checked = settings.phoneAudioOutput ?? false;
    phoneAudioToggle.addEventListener('change', () => {
      const enabled = phoneAudioToggle.checked;
      settings.phoneAudioOutput = enabled;
      setSetting('phoneAudioOutput', enabled);
      setPhoneAudioOutputEnabled(enabled);
      if (enabled && state.map?.id && !state.map.localOnly) {
        preparePhoneAudio(state.map.id);
      } else if (!enabled) {
        stopPhoneAudio();
      }
    });
  }

  if (phoneLatencyInput) {
    phoneLatencyInput.value = String(settings.phoneAudioLatencyMs ?? 0);
    bindStyledRange(phoneLatencyInput);
    if (phoneLatencyValue) phoneLatencyValue.textContent = `${settings.phoneAudioLatencyMs ?? 0} ms`;
    phoneLatencyInput.addEventListener('input', () => {
      const value = Number(phoneLatencyInput.value);
      settings.phoneAudioLatencyMs = value;
      setSetting('phoneAudioLatencyMs', value);
      if (phoneLatencyValue) phoneLatencyValue.textContent = `${value} ms`;
    });
  }

  if (interfaceSoundInput) {
    interfaceSoundInput.value = String(settings.interfaceSoundVolume ?? 0.8);
    bindStyledRange(interfaceSoundInput);
    interfaceSoundInput.addEventListener('input', () => {
      const value = Number(interfaceSoundInput.value);
      settings.interfaceSoundVolume = value;
      setSetting('interfaceSoundVolume', value);
    });
  }

  return {
    sync(): void {
      const emit = (element: HTMLElement | null, eventName: 'input' | 'change') => {
        element?.dispatchEvent(new Event(eventName));
      };
      if (volumeInput) {
        volumeInput.value = String(settings.volume);
        emit(volumeInput, 'input');
      }
      for (const input of soundInputs) {
        const key = input.dataset['audioSetting'] as keyof Settings | undefined;
        if (!key) continue;
        input.value = String(settings[key]);
        emit(input, 'input');
      }
      if (audioOffsetInput) {
        audioOffsetInput.value = String(settings.audioOffsetMs);
        emit(audioOffsetInput, 'input');
      }
      if (phoneAudioToggle) {
        phoneAudioToggle.checked = settings.phoneAudioOutput;
        emit(phoneAudioToggle, 'change');
      }
      if (phoneLatencyInput) {
        phoneLatencyInput.value = String(settings.phoneAudioLatencyMs);
        emit(phoneLatencyInput, 'input');
      }
      if (interfaceSoundInput) {
        interfaceSoundInput.value = String(settings.interfaceSoundVolume);
        emit(interfaceSoundInput, 'input');
      }
    },
  };
}
