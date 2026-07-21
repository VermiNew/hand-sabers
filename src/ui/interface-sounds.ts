let context: AudioContext | null = null;
let lastSoundAt = -Infinity;
let bound = false;

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

function tone(frequency: number, duration: number, volume: number, endFrequency: number): void {
  const audio = ensureContext();
  if (!audio) return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
  gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
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
    if (context) tone(430, 0.04, 0.009, 500);
  });
  root.addEventListener('pointerout', event => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target === hovered) hovered = null;
  });
  root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!target) return;
    lastSoundAt = performance.now();
    tone(520, 0.07, 0.018, 680);
  });
}
