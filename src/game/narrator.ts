// Narrator — Lyra dialog system
// narratorShow() returns a Promise resolving to the index of the button clicked.

const CHAR_MS_BASE = 28;

export const NARRATOR_SPEEDS: Record<string, number> = {
  reallyslow: 90,
  slow:       55,
  default:    28,
  fast:       14,
  ultrafast:   5,
};

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
  buttons?: string[];   // 1–3 labels; defaults to ['OK']
  charMs?: number;      // ms per character; use NARRATOR_SPEEDS for presets
}

let activeResolve: ((index: number) => void) | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let focusedBtn = 0;

function getEls() {
  return {
    box:     document.getElementById('narratorBox'),
    speech:  document.getElementById('narratorText'),
    cursor:  document.getElementById('narratorCursor'),
    btnsRow: document.getElementById('narratorButtons'),
    hint:    document.getElementById('narratorHint'),
  };
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

export function narratorHide(): void {
  clearTyping();
  clearKeyHandler();
  const { box } = getEls();
  if (activeResolve) { activeResolve(-1); activeResolve = null; }
  if (!box || !box.classList.contains('is-visible')) return;
  box.classList.add('is-hiding');
  box.addEventListener('animationend', () => {
    box.classList.remove('is-visible', 'is-hiding');
  }, { once: true });
}

export function narratorShow(opts: NarratorOptions): Promise<number> {
  narratorHide();

  return new Promise<number>(resolve => {
    activeResolve = resolve;

    const els = getEls();
    if (!els.box || !els.speech || !els.cursor || !els.hint) { resolve(0); return; }
    const box    = els.box;
    const speech = els.speech;
    const cursor = els.cursor;
    const hint   = els.hint;

    const labels = opts.buttons && opts.buttons.length ? opts.buttons.slice(0, 3) : ['OK'];
    const btns = buildButtons(labels);

    // Buttons start hidden via CSS (opacity:0), fade in after typing

    // Wire button clicks
    btns.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        btn.classList.add('is-pressed');
        clearKeyHandler();
        setTimeout(() => {
          narratorHide();
          activeResolve = null;
          resolve(i);
        }, 90);
      });
    });

    // Keyboard navigation (arrow keys + enter)
    keyHandler = (e: KeyboardEvent) => {
      if (!btns.length) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault(); setFocus(btns, focusedBtn + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); setFocus(btns, focusedBtn - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); btns[focusedBtn]?.click();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Reset and show
    speech.textContent = '';
    cursor.className = '';
    hint.classList.remove('is-visible');
    box.classList.add('is-visible');

    // Type out text
    const text = opts.text;
    const charMs = opts.charMs ?? CHAR_MS_BASE;
    let i = 0;

    function typeNext(): void {
      if (i >= text.length) {
        cursor.className = 'is-done';
        btns.forEach((b, idx) => {
          setTimeout(() => b.classList.add('is-visible'), idx * 60);
        });
        setTimeout(() => hint.classList.add('is-visible'), btns.length * 60 + 40);
        setFocus(btns, 0);
        return;
      }
      const ch = text[i]!;
      speech.textContent = text.slice(0, i + 1);
      i++;
      typingTimer = setTimeout(typeNext, charDelay(ch, text[i], charMs));
    }

    typeNext();
  });
}
