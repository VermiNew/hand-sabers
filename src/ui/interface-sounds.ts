let context: AudioContext | null = null;
let lastSoundAt = -Infinity;
let bound = false;
const INTERFACE_VOLUME_BOOST = 2;

function getInterfaceVolume(): number {
  try {
    const raw = localStorage.getItem('hs_settings');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return typeof parsed['interfaceSoundVolume'] === 'number' ? parsed['interfaceSoundVolume'] : 0.8;
    }
  } catch { /* ignore */ }
  return 0.8;
}

function ensureContext(): AudioContext | null {
  if (context) {
    if (context.state === 'suspended') void context.resume();
    return context;
  }
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  context = new AudioContextCtor();
  return context;
}

function tone(
  frequency: number,
  duration: number,
  volume: number,
  endFrequency: number,
  delay = 0,
): void {
  const audio = ensureContext();
  if (!audio) return;
  const vol = getInterfaceVolume() * volume * INTERFACE_VOLUME_BOOST;
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, vol), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export function initPageInterfaceSounds(root: ParentNode = document): void {
  if (bound) return;
  bound = true;
  let hovered: Element | null = null;
  const selector = 'button, a, [role="button"], input, select';

  root.addEventListener('pointerover', event => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!target || target === hovered || performance.now() - lastSoundAt < 70) return;
    hovered = target;
    lastSoundAt = performance.now();
    if (context) tone(360, 0.055, 0.022, 420);
  });
  root.addEventListener('pointerout', event => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target === hovered) hovered = null;
  });
  root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!target) return;
    lastSoundAt = performance.now();
    if (target.matches('[data-sound="back"]')) {
      tone(340, 0.1, 0.05, 240);
      return;
    }
    tone(440, 0.11, 0.055, 520);
    tone(660, 0.1, 0.025, 780, 0.025);
  });
}
