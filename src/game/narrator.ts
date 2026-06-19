// Narrator — Lyra dialog system
// narratorShow() returns a Promise resolving to the index of the button clicked.

const CHAR_MS_BASE = 28;

const PAUSE_MAP: Record<string, number> = {
  ',': 150,
  ';': 150,
  ':': 120,
  '.': 320,
  '!': 280,
  '?': 280,
};

function charDelay(ch: string, next: string | undefined): number {
  if (ch === '.' && next === '.' ) return 80;   // ellipsis — each dot shorter, gap comes after last
  const pause = PAUSE_MAP[ch];
  if (pause !== undefined) return pause;
  if (ch === ' ') return CHAR_MS_BASE + 18;     // breath between words
  const jitter = (Math.random() - 0.5) * 14;
  return Math.max(12, CHAR_MS_BASE + jitter);
}

interface NarratorOptions {
  text: string;
  buttons?: string[];   // 1–3 labels; defaults to ['OK']
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
  const { btnsRow, hint } = getEls();
  if (!btnsRow || !hint) return [];

  // Remove old buttons (keep hint element)
  btnsRow.querySelectorAll('.narrator-btn').forEach(b => b.remove());

  return labels.map((label, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'narrator-btn';
    btn.textContent = label;
    btn.dataset['index'] = String(i);
    btnsRow.insertBefore(btn, hint);
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
  if (box) box.classList.remove('is-visible');
  if (activeResolve) { activeResolve(-1); activeResolve = null; }
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

    // Hide buttons until typing finishes
    btns.forEach(b => { b.style.display = 'none'; });
    hint.style.display = 'none';

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
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault(); setFocus(btns, focusedBtn + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); setFocus(btns, focusedBtn - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); btns[focusedBtn]?.click();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Reset and show
    speech.textContent = '';
    cursor.className = '';
    box.classList.add('is-visible');

    // Type out text
    const text = opts.text;
    let i = 0;

    function typeNext(): void {
      if (i >= text.length) {
        cursor.className = 'is-done';
        btns.forEach(b => { b.style.display = ''; });
        hint.style.display = '';
        setFocus(btns, 0);
        return;
      }
      const ch = text[i]!;
      speech.textContent = text.slice(0, i + 1);
      i++;
      typingTimer = setTimeout(typeNext, charDelay(ch, text[i]));
    }

    typeNext();
  });
}
