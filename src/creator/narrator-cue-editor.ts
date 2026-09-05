import { t } from '../i18n/index.ts';
import type { NarratorCue } from '../types/index.js';
import { getPlayPos, pauseAudio } from './audio.ts';
import { showConfirm } from './dialogs.ts';
import { scheduleAutosave } from './storage.ts';
import { state } from './state.ts';
import { formatCreatorTime } from './time-format.ts';
import { renderAll } from './timeline.ts';

type NarratorMood = NonNullable<NarratorCue['mood']>;

function narratorCues(): NarratorCue[] {
  return state.map.narratorCues ?? (state.map.narratorCues = []);
}

export function initNarratorCueEditor(): { refresh(): void } {
  const form = document.getElementById('narratorCueForm') as HTMLFormElement | null;
  const timeInput = document.getElementById('narratorCueTime') as HTMLInputElement | null;
  const textInput = document.getElementById('narratorCueText') as HTMLTextAreaElement | null;
  const moodInput = document.getElementById('narratorCueMood') as HTMLSelectElement | null;
  const durationInput = document.getElementById('narratorCueDuration') as HTMLInputElement | null;
  const usePlayhead = document.getElementById('narratorCueUsePlayhead');
  const cancelButton = document.getElementById('narratorCueCancel') as HTMLButtonElement | null;
  const saveButton = document.getElementById('narratorCueSave');
  const count = document.getElementById('narratorCueCount');
  const list = document.getElementById('narratorCueList');
  if (!form || !timeInput || !textInput || !moodInput || !durationInput || !usePlayhead ||
      !cancelButton || !saveButton || !count || !list) return { refresh() {} };

  let selectedIndex: number | null = null;

  const setEditorMode = (editing: boolean): void => {
    cancelButton.hidden = !editing;
    saveButton.textContent = t(editing ? 'creator.narrator.update' : 'creator.narrator.add');
  };

  const resetForm = (): void => {
    selectedIndex = null;
    textInput.value = '';
    moodInput.value = 'neutral';
    durationInput.value = '4';
    timeInput.value = getPlayPos().toFixed(2);
    setEditorMode(false);
  };

  const seekToCue = (cue: NarratorCue): void => {
    pauseAudio();
    state.currentTime = cue.t;
    const canvas = document.getElementById('timelineCanvas') as HTMLCanvasElement | null;
    const visibleSec = canvas ? Math.max(0, (canvas.width - 48) / state.pxPerSec) : 0;
    state.viewStart = Math.max(0, cue.t - visibleSec * 0.5);
    renderAll();
  };

  const renderList = (): void => {
    const cues = narratorCues();
    count.textContent = t('creator.narrator.count', { count: cues.length });
    list.replaceChildren();
    if (!cues.length) {
      const empty = document.createElement('p');
      empty.className = 'narrator-cue-empty';
      empty.textContent = t('creator.narrator.empty');
      list.append(empty);
      return;
    }
    cues.forEach((cue, index) => {
      const row = document.createElement('div');
      row.className = `narrator-cue-row${selectedIndex === index ? ' is-selected' : ''}`;
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'narrator-cue-select';
      const cueTime = document.createElement('span');
      cueTime.className = 'narrator-cue-row-time';
      cueTime.textContent = formatCreatorTime(cue.t, true);
      const cueText = document.createElement('span');
      cueText.className = 'narrator-cue-row-text';
      cueText.textContent = cue.text;
      select.append(cueTime, cueText);
      select.addEventListener('click', () => {
        selectedIndex = index;
        timeInput.value = cue.t.toFixed(2);
        textInput.value = cue.text;
        moodInput.value = cue.mood ?? 'neutral';
        durationInput.value = String((cue.durationMs ?? 4000) / 1000);
        setEditorMode(true);
        seekToCue(cue);
        renderList();
        textInput.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'narrator-cue-remove material-symbols-rounded';
      remove.textContent = 'delete';
      remove.setAttribute('aria-label', t('creator.narrator.removeAria', { time: cueTime.textContent }));
      remove.addEventListener('click', async () => {
        const confirmed = await showConfirm(t('creator.narrator.removeConfirm'), {
          title: t('creator.narrator.removeTitle'),
          confirmText: t('creator.narrator.remove'),
          cancelText: t('creator.narrator.cancel'),
          danger: true,
        });
        if (!confirmed) return;
        narratorCues().splice(index, 1);
        resetForm();
        scheduleAutosave();
        renderList();
        renderAll();
      });
      row.append(select, remove);
      list.append(row);
    });
  };

  usePlayhead.addEventListener('click', () => {
    timeInput.value = getPlayPos().toFixed(2);
  });
  cancelButton.addEventListener('click', () => {
    resetForm();
    renderList();
  });
  form.addEventListener('keydown', event => event.stopPropagation());
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = textInput.value.trim();
    const rawTime = Number(timeInput.value);
    if (!text || !Number.isFinite(rawTime) || rawTime < 0) return;
    const maxTime = state.map.meta.duration > 0 ? state.map.meta.duration : 86_400;
    const cue: NarratorCue = {
      t: Math.min(rawTime, maxTime),
      text: text.slice(0, 500),
      mood: moodInput.value as NarratorMood,
      durationMs: Math.round(Math.max(1, Math.min(30, Number(durationInput.value) || 4)) * 1000),
    };
    const cues = narratorCues();
    if (selectedIndex !== null && cues[selectedIndex]) cues[selectedIndex] = cue;
    else cues.push(cue);
    cues.sort((a, b) => a.t - b.t);
    resetForm();
    scheduleAutosave();
    renderList();
    renderAll();
  });

  resetForm();
  renderList();
  return {
    refresh(): void {
      resetForm();
      renderList();
    },
  };
}
