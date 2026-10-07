import { setSetting } from '../core/settings.ts';
import { state } from '../core/state.ts';
import { PRACTICE_MIN_LENGTH_SEC } from '../core/practice.ts';
import { applyTrackingSettings } from '../tracking/tracking.ts';
import type { OneHandMode, Settings } from '../types/index.js';
import { setOneHandModeVisuals } from './scene.ts';

interface MultiplayerRules {
  trainingMode: boolean;
  noFail: boolean;
}

export interface GameplaySettingsController {
  hasMultiplayerRules(): boolean;
  sync(): void;
}

function parseMultiplayerRules(value: unknown): MultiplayerRules | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rules = value as Record<string, unknown>;
  if (typeof rules['trainingMode'] !== 'boolean' || typeof rules['noFail'] !== 'boolean') return null;
  return {
    trainingMode: rules['trainingMode'],
    noFail: rules['noFail'],
  };
}

const MODIFIER_TOGGLES = [
  { id: 'menuModMirror', key: 'modMirror' },
  { id: 'menuModNoBombs', key: 'modNoBombs' },
  { id: 'menuModDoubleLives', key: 'modDoubleLives' },
] as const;

const PRACTICE_MAX_SECONDS = 7200;

function readSeconds(input: HTMLInputElement, fallback: number): number {
  const value = Math.round(Number(input.value));
  return Number.isFinite(value) ? Math.max(0, Math.min(PRACTICE_MAX_SECONDS, value)) : fallback;
}

export function initGameplaySettings(settings: Settings): GameplaySettingsController {
  const noFailInput = document.getElementById('menuNoFail') as HTMLInputElement | null;
  const trainingModeInput = document.getElementById('menuTrainingMode') as HTMLInputElement | null;
  const beatLimitInput = document.getElementById('menuBeatLimit') as HTMLInputElement | null;
  const oneHandButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-one-hand]')];
  const noteSpeedButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-note-speed]')];
  const hitboxSensitivityButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-hitbox-sensitivity]')];
  const gameModeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-game-mode]')];
  const modifierInputs = MODIFIER_TOGGLES.map(({ id, key }) => ({ key, input: document.getElementById(id) as HTMLInputElement | null }));
  const practiceEnabledInput = document.getElementById('menuPracticeEnabled') as HTMLInputElement | null;
  const practiceAutoTempoInput = document.getElementById('menuPracticeAutoTempo') as HTMLInputElement | null;
  const practiceStartInput = document.getElementById('menuPracticeStart') as HTMLInputElement | null;
  const practiceEndInput = document.getElementById('menuPracticeEnd') as HTMLInputElement | null;
  const practiceHint = document.getElementById('menuPracticeHint');
  let multiplayerRules: MultiplayerRules | null = null;

  function syncOneHandButtons(): void {
    oneHandButtons.forEach(button => {
      const selected = (button.dataset['oneHand'] || null) === state.oneHandMode;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function syncNoteSpeedButtons(): void {
    const activeSpeed = Number(settings.noteSpeed) || 1;
    noteSpeedButtons.forEach(button => {
      const selected = Math.abs(Number(button.dataset['noteSpeed']) - activeSpeed) < 0.001;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function syncHitboxSensitivityButtons(): void {
    const activeSensitivity = Number(settings.hitboxSensitivity) || 1;
    hitboxSensitivityButtons.forEach(button => {
      const selected = Math.abs(Number(button.dataset['hitboxSensitivity']) - activeSensitivity) < 0.001;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function syncGameModeButtons(): void {
    const activeMode = settings.gameMode || 'normal';
    gameModeButtons.forEach(button => {
      const selected = (button.dataset['gameMode'] ?? 'normal') === activeMode;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function sync(): void {
    const effectiveNoFail = multiplayerRules?.noFail ?? settings.noFail;
    const effectiveTrainingMode = multiplayerRules?.trainingMode ?? settings.trainingMode;

    if (noFailInput) {
      noFailInput.disabled = multiplayerRules !== null;
      noFailInput.checked = effectiveNoFail;
    }
    state.noFail = effectiveNoFail;

    if (trainingModeInput) {
      trainingModeInput.disabled = multiplayerRules !== null;
      trainingModeInput.checked = effectiveTrainingMode;
    }
    document.body.classList.toggle('training-mode', effectiveTrainingMode);

    if (beatLimitInput) beatLimitInput.checked = settings.beatLimitEnabled !== false;

    // Practice, like modifiers, is ignored in multiplayer rounds, so its controls are locked there.
    const practiceControls = [practiceEnabledInput, practiceAutoTempoInput, practiceStartInput, practiceEndInput];
    for (const input of practiceControls) if (input) input.disabled = multiplayerRules !== null;
    if (practiceEnabledInput) practiceEnabledInput.checked = settings.practiceEnabled;
    if (practiceAutoTempoInput) practiceAutoTempoInput.checked = settings.practiceAutoTempo;
    if (practiceStartInput) practiceStartInput.value = String(settings.practiceStartSec);
    if (practiceEndInput) practiceEndInput.value = String(settings.practiceEndSec);
    if (practiceHint) {
      practiceHint.hidden = !settings.practiceEnabled
        || settings.practiceEndSec - settings.practiceStartSec >= PRACTICE_MIN_LENGTH_SEC;
    }

    // Modifiers are ignored in multiplayer rounds, so the toggles are locked there.
    for (const { key, input } of modifierInputs) {
      if (!input) continue;
      input.disabled = multiplayerRules !== null;
      input.checked = settings[key];
    }

    state.oneHandMode = settings.oneHandMode || null;
    window.__oneHandMode = state.oneHandMode ?? 'both';
    setOneHandModeVisuals(state.oneHandMode);
    syncOneHandButtons();
    syncNoteSpeedButtons();
    syncHitboxSensitivityButtons();

    document.body.dataset['gameMode'] = settings.gameMode || 'normal';
    syncGameModeButtons();
  }

  noFailInput?.addEventListener('change', () => {
    if (multiplayerRules) {
      noFailInput.checked = multiplayerRules.noFail;
      return;
    }
    settings.noFail = noFailInput.checked;
    state.noFail = noFailInput.checked;
    setSetting('noFail', noFailInput.checked);
  });

  trainingModeInput?.addEventListener('change', () => {
    if (multiplayerRules) {
      trainingModeInput.checked = multiplayerRules.trainingMode;
      return;
    }
    settings.trainingMode = trainingModeInput.checked;
    document.body.classList.toggle('training-mode', trainingModeInput.checked);
    setSetting('trainingMode', trainingModeInput.checked);
  });

  for (const { key, input } of modifierInputs) {
    input?.addEventListener('change', () => {
      settings[key] = input.checked;
      setSetting(key, input.checked);
    });
  }

  practiceEnabledInput?.addEventListener('change', () => {
    settings.practiceEnabled = practiceEnabledInput.checked;
    setSetting('practiceEnabled', practiceEnabledInput.checked);
    sync();
  });
  practiceAutoTempoInput?.addEventListener('change', () => {
    settings.practiceAutoTempo = practiceAutoTempoInput.checked;
    setSetting('practiceAutoTempo', practiceAutoTempoInput.checked);
  });
  practiceStartInput?.addEventListener('change', () => {
    settings.practiceStartSec = readSeconds(practiceStartInput, settings.practiceStartSec);
    setSetting('practiceStartSec', settings.practiceStartSec);
    sync();
  });
  practiceEndInput?.addEventListener('change', () => {
    settings.practiceEndSec = readSeconds(practiceEndInput, settings.practiceEndSec);
    setSetting('practiceEndSec', settings.practiceEndSec);
    sync();
  });

  beatLimitInput?.addEventListener('change', () => {
    settings.beatLimitEnabled = beatLimitInput.checked;
    setSetting('beatLimitEnabled', beatLimitInput.checked);
  });

  for (const button of oneHandButtons) {
    button.addEventListener('click', () => {
      const value = (button.dataset['oneHand'] || null) as OneHandMode;
      settings.oneHandMode = value;
      state.oneHandMode = value;
      window.__oneHandMode = value ?? 'both';
      setSetting('oneHandMode', value);
      setOneHandModeVisuals(value);
      applyTrackingSettings({ oneHandMode: value });
      syncOneHandButtons();
    });
  }

  for (const button of noteSpeedButtons) {
    button.addEventListener('click', () => {
      const speed = Number(button.dataset['noteSpeed']);
      if (!Number.isFinite(speed)) return;
      settings.noteSpeed = speed;
      setSetting('noteSpeed', speed);
      syncNoteSpeedButtons();
    });
  }

  for (const button of hitboxSensitivityButtons) {
    button.addEventListener('click', () => {
      const sensitivity = Number(button.dataset['hitboxSensitivity']);
      if (!Number.isFinite(sensitivity)) return;
      settings.hitboxSensitivity = sensitivity;
      setSetting('hitboxSensitivity', sensitivity);
      syncHitboxSensitivityButtons();
    });
  }

  for (const button of gameModeButtons) {
    button.addEventListener('click', () => {
      const mode = button.dataset['gameMode'] as typeof settings.gameMode | undefined;
      if (!mode) return;
      settings.gameMode = mode;
      setSetting('gameMode', mode);
      document.body.dataset['gameMode'] = mode;
      syncGameModeButtons();
    });
  }

  window.addEventListener('hand-sabers:room-state', event => {
    const detail = (event as CustomEvent<{ rules?: unknown } | null>).detail;
    multiplayerRules = parseMultiplayerRules(detail?.rules);
    sync();
  });

  sync();

  return {
    hasMultiplayerRules: () => multiplayerRules !== null,
    sync,
  };
}
