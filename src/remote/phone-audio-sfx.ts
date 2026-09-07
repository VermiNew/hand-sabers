import type { ProceduralAudioRecipe } from './audio-bank-manifest.ts';

type AudioContextConstructor = new () => AudioContext;

export interface ScheduledPhoneSound {
  recipe: ProceduralAudioRecipe;
  variant: number;
  volume: number;
  hostTime: number;
}

export interface PhoneSoundScheduleResult {
  status: 'scheduled' | 'late';
  scheduledFor: number;
  latenessMs: number;
}

export function createPhoneSoundEngine(): {
  enable(): Promise<boolean>;
  attachMediaElement(element: HTMLMediaElement): void;
  setHostClockOffset(offsetMs: number): void;
  schedule(sound: ScheduledPhoneSound): PhoneSoundScheduleResult | null;
  getMeterLevels(): { db: number; peak: number; clipping: boolean };
} {
  let context: AudioContext | null = null;
  let hostClockOffsetMs = 0;
  let output: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let meterData: Float32Array<ArrayBuffer> | null = null;
  let mediaSource: MediaElementAudioSourceNode | null = null;

  function ensureContext(): AudioContext | null {
    if (context && context.state !== 'closed') return context;
    const AudioContextCtor = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    context = new AudioContextCtor();
    output = context.createGain();
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    output.connect(analyser).connect(context.destination);
    meterData = new Float32Array(analyser.fftSize);
    return context;
  }

  function connectOutput(node: AudioNode): void {
    if (output) node.connect(output);
  }

  function tone(
    audio: AudioContext,
    start: number,
    frequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
  ): void {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), start + Math.min(0.008, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    connectOutput(gain);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function render(audio: AudioContext, start: number, sound: ScheduledPhoneSound): void {
    const volume = Math.max(0, Math.min(1, sound.volume));
    switch (sound.recipe) {
      case 'interface-hover': tone(audio, start, 360, 420, 0.055, 0.06 * volume); break;
      case 'interface-back': tone(audio, start, 340, 240, 0.1, 0.13 * volume); break;
      case 'interface-activate':
        tone(audio, start, 440, 520, 0.11, 0.14 * volume);
        tone(audio, start + 0.025, 660, 780, 0.1, 0.064 * volume);
        break;
      case 'typing-tick': {
        const variation = Math.max(0, Math.min(4, Math.round(sound.variant)));
        tone(audio, start, 520 + variation * 14, 470 + variation * 10, 0.035, 0.012 * volume);
        break;
      }
      case 'beat': tone(audio, start, 120, 40, 0.15, 0.05 * volume); break;
      case 'hit': tone(audio, start, 250, 50, 0.15, 0.33 * volume, 'sawtooth'); break;
      case 'combo': tone(audio, start, 400 + Math.min(sound.variant * 20, 800), 400 + Math.min(sound.variant * 20, 800), 0.3, 0.5 * volume); break;
      case 'miss': tone(audio, start, 180, 60, 0.22, 0.18 * volume, 'square'); break;
      case 'bomb': {
        const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.18), audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
        const source = audio.createBufferSource();
        const gain = audio.createGain();
        source.buffer = buffer;
        gain.gain.setValueAtTime(0.4 * volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        source.connect(gain);
        connectOutput(gain);
        source.start(start);
        break;
      }
      case 'milestone': {
        const frequency = sound.variant >= 50 ? 1200 : sound.variant >= 25 ? 900 : 660;
        for (let index = 0; index < 3; index++) {
          const note = frequency * (1 + index * 0.25);
          tone(audio, start + index * 0.07, note, note * 1.04, 0.22, 0.28 * volume);
        }
        break;
      }
    }
  }

  return {
    async enable(): Promise<boolean> {
      const audio = ensureContext();
      if (!audio) return false;
      if (audio.state === 'suspended') await audio.resume();
      return audio.state === 'running';
    },
    attachMediaElement(element): void {
      const audio = ensureContext();
      if (!audio || mediaSource) return;
      mediaSource = audio.createMediaElementSource(element);
      connectOutput(mediaSource);
    },
    setHostClockOffset(offsetMs): void {
      hostClockOffsetMs = offsetMs;
    },
    schedule(sound): PhoneSoundScheduleResult | null {
      const audio = context;
      if (!audio || audio.state !== 'running') return null;
      const phoneTargetTime = sound.hostTime + hostClockOffsetMs;
      const latenessMs = Math.max(0, Date.now() - phoneTargetTime);
      const delaySec = Math.max(0, phoneTargetTime - Date.now()) / 1000;
      const scheduledFor = audio.currentTime + delaySec;
      render(audio, scheduledFor, sound);
      return { status: latenessMs > 20 ? 'late' : 'scheduled', scheduledFor, latenessMs };
    },
    getMeterLevels(): { db: number; peak: number; clipping: boolean } {
      if (!analyser || !meterData) return { db: -60, peak: 0, clipping: false };
      analyser.getFloatTimeDomainData(meterData);
      let sumSquares = 0;
      let peak = 0;
      for (const sample of meterData) {
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rms = Math.sqrt(sumSquares / meterData.length);
      return {
        db: Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(rms, 0.001)))),
        peak,
        clipping: peak >= 0.98,
      };
    },
  };
}
