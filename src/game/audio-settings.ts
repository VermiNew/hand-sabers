import { setSetting } from '../core/settings.ts';
import { t } from '../i18n/index.ts';
import type { Settings } from '../types/index.js';
import {
  isMetronomeActive,
  playTestSound,
  startMetronomeCalibration,
  stopMetronome,
} from './audio-calibration.ts';
import {
  getMasterMeterLevels,
  playAudioTestRecipe,
  setMusicVolume,
  setSfxVolume,
  setSoundVolume,
  setVolume,
} from './audio.ts';
import type { ProceduralAudioRecipe } from '../remote/audio-bank-manifest.ts';
import { narratorQuick } from './narrator.ts';
import {
  isPhoneAudioActive,
  preparePhoneAudio,
  setPhoneAudioOutputEnabled,
  stopPhoneAudio,
  syncPhoneAudioVolume,
} from '../remote/host-audio.ts';
import { state } from '../core/state.ts';

type RangeBinder = (input: HTMLInputElement | null) => void;
type MeterRenderer = (normalizedLevel: number) => void;

const AUDIO_METER_SEGMENTS = 24;

function createMeterRenderer(meter: HTMLElement | null): MeterRenderer {
  const fill = meter?.querySelector<HTMLElement>('.audio-meter-fill');
  if (!fill) return () => {};
  const segments = Array.from({ length: AUDIO_METER_SEGMENTS }, (_, index) => {
    const segment = document.createElement('span');
    segment.className = 'audio-meter-segment';
    segment.style.setProperty('--segment-index', String(index));
    return segment;
  });
  fill.replaceChildren(...segments);
  fill.setAttribute('aria-hidden', 'true');

  return normalizedLevel => {
    const activeSegments = Math.round(Math.max(0, Math.min(1, normalizedLevel)) * AUDIO_METER_SEGMENTS);
    segments.forEach((segment, index) => segment.classList.toggle('is-lit', index < activeSegments));
  };
}

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
  const chatSoundsToggle = document.getElementById('menuChatSoundsEnabled') as HTMLInputElement | null;
  const masterMeter = document.getElementById('menuMasterAudioMeter');
  const masterMeterValue = document.getElementById('menuMasterAudioMeterValue');
  const phoneMeter = document.getElementById('menuPhoneAudioMeter');
  const phoneMeterValue = document.getElementById('menuPhoneAudioMeterValue');
  const recipeTestButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-audio-test]')];
  const renderMasterMeter = createMeterRenderer(masterMeter);
  const renderPhoneMeter = createMeterRenderer(phoneMeter);

  for (const button of recipeTestButtons) {
    button.addEventListener('click', () => {
      const recipe = button.dataset['audioTest'] as ProceduralAudioRecipe | undefined;
      if (recipe) playAudioTestRecipe(recipe);
    });
  }

  if (masterMeter) {
    masterMeter.setAttribute('aria-label', t('settings.audio.masterMeter'));
    const settingsBackdrop = document.getElementById('mainSettingsBackdrop');
    const audioTab = masterMeter.closest<HTMLElement>('.sp-tab');
    let meterFrame = 0;

    const isMeterVisible = (): boolean => {
      const settingsOpen = settingsBackdrop ? !settingsBackdrop.hidden : true;
      const audioTabOpen = audioTab ? audioTab.classList.contains('is-active') : true;
      return settingsOpen && audioTabOpen;
    };
    const updateMeter = (): void => {
      meterFrame = 0;
      if (!isMeterVisible()) return;
      const levels = getMasterMeterLevels();
      const normalized = Math.max(0, Math.min(1, (levels.db + 60) / 60));
      renderMasterMeter(normalized);
      masterMeter.classList.toggle('is-clipping', levels.clipping);
      masterMeter.setAttribute('aria-valuenow', levels.db.toFixed(1));
      if (masterMeterValue) masterMeterValue.textContent = `${levels.db.toFixed(1)} dB`;
      meterFrame = requestAnimationFrame(updateMeter);
    };

    const syncMeterLoop = (): void => {
      if (isMeterVisible()) {
        if (!meterFrame) meterFrame = requestAnimationFrame(updateMeter);
      } else if (meterFrame) {
        cancelAnimationFrame(meterFrame);
        meterFrame = 0;
      }
    };
    const meterVisibilityObserver = new MutationObserver(syncMeterLoop);
    if (settingsBackdrop) {
      meterVisibilityObserver.observe(settingsBackdrop, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (audioTab) {
      meterVisibilityObserver.observe(audioTab, { attributes: true, attributeFilter: ['class'] });
    }
    syncMeterLoop();
  }

  if (phoneMeter) {
    phoneMeter.setAttribute('aria-label', t('settings.audio.phoneMeter'));
    window.addEventListener('hand-sabers:phone-audio-meter', event => {
      const detail = (event as CustomEvent<{ db: number; clipping: boolean }>).detail;
      if (!detail || !Number.isFinite(detail.db)) return;
      const db = Math.max(-60, Math.min(0, detail.db));
      renderPhoneMeter((db + 60) / 60);
      phoneMeter.classList.toggle('is-clipping', detail.clipping);
      phoneMeter.classList.add('has-signal');
      phoneMeter.setAttribute('aria-valuenow', db.toFixed(1));
      if (phoneMeterValue) phoneMeterValue.textContent = `${db.toFixed(1)} dB`;
    });
  }

  if (volumeInput) {
    volumeInput.value = String(settings.volume ?? 0.8);
    bindStyledRange(volumeInput);
    volumeInput.addEventListener('input', () => {
      const value = Number(volumeInput.value);
      settings.volume = value;
      setSetting('volume', value);
      setVolume(value);
      if (isPhoneAudioActive()) syncPhoneAudioVolume();
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
      if (key === 'musicVolume' && isPhoneAudioActive()) {
        setMusicVolume(0);
        syncPhoneAudioVolume();
      } else if (audioSetters[key]) audioSetters[key](value);
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
        void narratorQuick(t('narrator.metronomeDone').replace('{{ms}}', String(offsetMs)), 'happy');
      },
      (active) => {
        metronomeButton.textContent = t(active ? 'settings.audio.metronomeStop' : 'settings.audio.metronomeCalibration');
      },
    );
    if (started) {
      void narratorQuick(t('narrator.metronomeStart'), 'encourage');
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

  if (chatSoundsToggle) {
    chatSoundsToggle.checked = settings.chatSoundsEnabled;
    chatSoundsToggle.addEventListener('change', () => {
      settings.chatSoundsEnabled = chatSoundsToggle.checked;
      setSetting('chatSoundsEnabled', chatSoundsToggle.checked);
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
      if (chatSoundsToggle) {
        chatSoundsToggle.checked = settings.chatSoundsEnabled;
        emit(chatSoundsToggle, 'change');
      }
    },
  };
}
