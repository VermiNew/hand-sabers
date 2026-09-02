import { playInterfaceSound, playTypingTick } from './audio.ts';
import neutralImg from '../assets/lora/01_neutral.png';
import smirkImg from '../assets/lora/03_smirk.png';
import smileImg from '../assets/lora/04_smile.png';
import laughImg from '../assets/lora/05_laugh.png';
import sadImg from '../assets/lora/06_sad.png';

const CHAR_MS_BASE = 28;

export const NARRATOR_SPEEDS: Record<string, number> = {
  reallyslow: 90,
  slow:       55,
  default:    28,
  fast:       14,
  ultrafast:   5,
};

export type NarratorMood = 'neutral' | 'happy' | 'excited' | 'sad' | 'surprised' | 'celebrate' | 'encourage';


const PAUSE_MAP: Record<string, number> = {
  ',': 150,
  ';': 150,
  ':': 120,
  '.': 320,
  '!': 280,
  '?': 280,
};

function charDelay(ch: string, next: string | undefined, charMs: number): number {
  const scale = charMs / CHAR_MS_BASE;
  if (ch === '.' && next === '.') return Math.round(80 * scale);
  const pause = PAUSE_MAP[ch];
  if (pause !== undefined) return Math.round(pause * scale);
  if (ch === ' ') return Math.round((CHAR_MS_BASE + 18) * scale);
  const jitter = (Math.random() - 0.5) * 14 * scale;
  return Math.max(4, Math.round(charMs + jitter));
}

interface NarratorOptions {
  text: string;
  buttons?: string[];
  charMs?: number;
  mood?: NarratorMood;
  autoAdvanceMs?: number;
}

let activeResolve: ((index: number) => void) | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let focusedBtn = 0;
let hideToken = 0;

function getEls() {
  return {
    box:     document.getElementById('narratorBox'),
    speech:  document.getElementById('narratorText'),
    viewport: document.getElementById('narratorSpeech'),
    cursor:  document.getElementById('narratorCursor'),
    btnsRow: document.getElementById('narratorButtons'),
    hint:    document.getElementById('narratorHint'),
    avatar:  document.getElementById('narratorAvatar'),
  };
}

const MOOD_IMAGES: Record<NarratorMood, string> = {
  neutral: neutralImg,
  happy: smileImg,
  excited: smirkImg,
  sad: sadImg,
  surprised: laughImg,
  celebrate: laughImg,
  encourage: smileImg,
};

function setMood(mood: NarratorMood): void {
  const { avatar } = getEls();
  if (!avatar) return;
  avatar.dataset['mood'] = mood;
  const img = MOOD_IMAGES[mood] || MOOD_IMAGES.neutral;
  avatar.innerHTML = `<img class="narrator-avatar-img" src="${img}" alt="Lyra" />`;
}

function clearTyping(): void {
  if (typingTimer !== null) { clearTimeout(typingTimer); typingTimer = null; }
}

function clearKeyHandler(): void {
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
}

function buildButtons(labels: string[]): HTMLButtonElement[] {
  const { btnsRow } = getEls();
  if (!btnsRow) return [];

  btnsRow.querySelectorAll('.narrator-btn').forEach(b => b.remove());

  return labels.map((label, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'narrator-btn';
    btn.textContent = label;
    btn.dataset['index'] = String(i);
    btnsRow.appendChild(btn);
    return btn;
  });
}

function setFocus(btns: HTMLButtonElement[], index: number): void {
  focusedBtn = Math.max(0, Math.min(btns.length - 1, index));
  btns.forEach((b, i) => b.classList.toggle('is-focused', i === focusedBtn));
}

function hideBox(box: HTMLElement): void {
  const token = ++hideToken;
  const finish = () => {
    if (token !== hideToken) return;
    box.classList.remove('is-visible', 'is-hiding');
    document.body.classList.remove('narrator-open');
  };
  box.classList.add('is-hiding');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  box.addEventListener('animationend', finish, { once: true });
  window.setTimeout(finish, 400);
}

export function narratorHide(): void {
  clearTyping();
  clearKeyHandler();
  const { box } = getEls();
  if (activeResolve) { activeResolve(-1); activeResolve = null; }
  if (!box || !box.classList.contains('is-visible')) return;
  hideBox(box);
}

/** Hide narrator without resolving the active promise (used by click/keyboard handlers that resolve manually). */
function hideWithoutResolve(): void {
  clearTyping();
  clearKeyHandler();
  const { box } = getEls();
  if (!box || !box.classList.contains('is-visible')) return;
  hideBox(box);
}

export function isNarratorVisible(): boolean {
  const { box } = getEls();
  return box?.classList.contains('is-visible') ?? false;
}

export function narratorShow(opts: NarratorOptions): Promise<number> {
  narratorHide();

  return new Promise<number>(resolve => {
    activeResolve = resolve;

    const els = getEls();
    if (!els.box || !els.speech || !els.viewport || !els.cursor || !els.hint) { resolve(0); return; }
    const box    = els.box;
    const speech = els.speech;
    const viewport = els.viewport;
    const cursor = els.cursor;
    const hint   = els.hint;
    hideToken++;
    box.classList.remove('is-visible', 'is-hiding');
    document.body.classList.add('narrator-open');

    setMood(opts.mood || 'neutral');

    const hasButtons = opts.buttons && opts.buttons.length > 0;
    const isAutoAdvance = !hasButtons && opts.autoAdvanceMs && opts.autoAdvanceMs > 0;
    const labels = hasButtons ? opts.buttons!.slice(0, 3) : (isAutoAdvance ? [] : ['OK']);
    const btns = buildButtons(labels);

    btns.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        playInterfaceSound('activate');
        btn.classList.add('is-pressed');
        clearKeyHandler();
        const resolveClick = activeResolve;
        activeResolve = null;
        if (hasButtons) window.dispatchEvent(new CustomEvent('hand-sabers:narrator-resume'));
        setTimeout(() => {
          hideWithoutResolve();
          if (resolveClick) resolveClick(i);
        }, 90);
      });
    });

    // Only register keyboard navigation when there are actual buttons
    if (btns.length > 0) {
      keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault(); setFocus(btns, focusedBtn + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault(); setFocus(btns, focusedBtn - 1);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); btns[focusedBtn]?.click();
        }
      };
      document.addEventListener('keydown', keyHandler);
    }

    speech.textContent = '';
    viewport.scrollTop = 0;
    viewport.setAttribute('aria-label', opts.text);

    cursor.className = '';
    hint.classList.remove('is-visible');
    box.classList.add('is-visible');

    const text = opts.text;
    const charMs = opts.charMs ?? CHAR_MS_BASE;
    let i = 0;

    function typeNext(): void {
      if (i >= text.length) {
        cursor.className = 'is-done';
        if (hasButtons) {
          // Pause game while buttons are visible
          window.dispatchEvent(new CustomEvent('hand-sabers:narrator-pause'));
          btns.forEach((b, idx) => {
            setTimeout(() => b.classList.add('is-visible'), idx * 60);
          });
          setTimeout(() => hint.classList.add('is-visible'), btns.length * 60 + 40);
          setFocus(btns, 0);
        } else if (opts.autoAdvanceMs && opts.autoAdvanceMs > 0) {
          // Auto-advance mode — no buttons, auto-hide after delay
          const resolveAuto = activeResolve;
          activeResolve = null;
          setTimeout(() => {
            hideWithoutResolve();
            if (resolveAuto) resolveAuto(0);
          }, opts.autoAdvanceMs);
        } else {
          // Default: show OK button
          btns.forEach((b, idx) => {
            setTimeout(() => b.classList.add('is-visible'), idx * 60);
          });
          setTimeout(() => hint.classList.add('is-visible'), btns.length * 60 + 40);
          setFocus(btns, 0);
        }
        return;
      }
      const ch = text[i]!;
      // Per-character fade-in: append each char as a span with animation
      const span = document.createElement('span');
      span.className = 'narrator-char';
      span.textContent = ch;
      speech.appendChild(span);
      viewport.scrollTop = viewport.scrollHeight;
      playTypingTick(ch);
      i++;
      typingTimer = setTimeout(typeNext, charDelay(ch, text[i], charMs));
    }

    typeNext();
  });
}

export function narratorQuick(text: string, mood: NarratorMood = 'neutral', durationMs = 3000): void {
  void narratorShow({ text, buttons: [], mood, autoAdvanceMs: durationMs });
}
