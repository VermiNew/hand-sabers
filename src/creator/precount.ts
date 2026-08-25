import { pauseAudio } from './audio.ts';
import { state } from './state.ts';

export function cancelPrecount(): void {
  if (state.precountTimer) {
    clearInterval(state.precountTimer);
    state.precountTimer = null;
  }
  const precount = document.getElementById('precount');
  if (precount) precount.classList.remove('show');
}

export function startPrecount(onPlay: () => void): void {
  if (state.precountTimer || state.isPlaying) return;
  const precount = document.getElementById('precount');
  const number = document.getElementById('precountNum');
  if (!precount || !number) return;
  precount.classList.add('show');
  let count = 4;
  number.textContent = String(count);
  state.precountTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      cancelPrecount();
      onPlay();
    } else {
      number.textContent = String(count);
      number.style.animation = 'none';
      void number.offsetHeight;
      number.style.animation = 'precountPulse 1s ease-out';
    }
  }, 1000);
}

export function handlePlay(onPlay: () => void): void {
  if (!state.audioBuffer) return;
  if (state.precountTimer) {
    cancelPrecount();
    return;
  }
  if (state.isPlaying) {
    pauseAudio();
    return;
  }
  startPrecount(onPlay);
}
