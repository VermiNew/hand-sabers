import { sortBeatsByTime } from '../core/creator-rules.ts';
import { playAudio } from './audio.ts';
import { scheduleAutosave } from './storage.ts';
import { state } from './state.ts';
import { renderAll } from './timeline.ts';

interface TimelineContextMenuOptions {
  checkOverlaps(): boolean;
  pushUndo(): void;
  snapTime(time: number): number;
}

export class TimelineContextMenu {
  private menu: HTMLElement | null = null;
  private readonly options: TimelineContextMenuOptions;

  constructor(options: TimelineContextMenuOptions) {
    this.options = options;
  }

  show(clientX: number, clientY: number, clickTime: number, onPlayEnd: () => void): void {
    this.remove();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;

    const items: Array<{ label: string; action: () => void }> = [
      {
        label: '⏸ Seekuj tutaj',
        action: () => {
          const wasPlaying = state.isPlaying;
          state.currentTime = Math.max(0, Math.min(clickTime, state.map.meta.duration));
          if (wasPlaying) playAudio(state.currentTime, onPlayEnd);
          renderAll();
        },
      },
      {
        label: '[ Ustaw LOOP START',
        action: () => {
          state.loopStart = this.options.snapTime(clickTime);
          if (state.loopEnd !== null && state.loopStart > state.loopEnd) state.loopEnd = null;
          renderAll();
        },
      },
      {
        label: '] Ustaw LOOP END',
        action: () => {
          state.loopEnd = this.options.snapTime(clickTime);
          if (state.loopStart !== null && state.loopEnd < state.loopStart) state.loopStart = null;
          renderAll();
        },
      },
    ];

    if (state.clipboard.length) {
      items.push({
        label: '📋 Wklej tutaj',
        action: () => {
          this.options.pushUndo();
          const pasted = state.clipboard.map(beat => ({ ...beat, t: this.options.snapTime(clickTime + beat.t) }));
          state.map.beats.push(...pasted);
          sortBeatsByTime(state.map.beats);
          state.selectedBeats.clear();
          pasted.forEach(beat => state.selectedBeats.add(beat));
          this.options.checkOverlaps();
          scheduleAutosave();
          renderAll();
        },
      });
    }

    for (const item of items) {
      const button = document.createElement('button');
      button.textContent = item.label;
      button.addEventListener('click', () => {
        item.action();
        this.remove();
      });
      menu.appendChild(button);
    }

    document.body.appendChild(menu);
    this.menu = menu;
    setTimeout(() => window.addEventListener('mousedown', () => this.remove(), { once: true }), 0);
  }

  private remove(): void {
    this.menu?.remove();
    this.menu = null;
  }
}
