// Central keybind registry for the map creator.
// Each action has a default binding; users can override via the keybinds editor.
// Bindings are persisted to localStorage under KEY_STORE.

const KEY_STORE = 'hs-creator-keybinds';

export type ActionId =
  | 'play'
  | 'stop'
  | 'tapLeft'
  | 'tapRight'
  | 'tapRandom'
  | 'tapBomb'
  | 'heldLeft'       // held block left (keydown start / keyup end)
  | 'heldRight'
  | 'nextBeat'
  | 'prevBeat'
  | 'jumpStart'
  | 'jumpEnd'
  | 'loopStart'
  | 'loopEnd'
  | 'deleteSelected'
  | 'selectAll'
  | 'undo'
  | 'redo'
  | 'save'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'zoomIn'
  | 'zoomOut'
  | 'cycleSnap'
  | 'toggleLoop'
  | 'cutDir1'
  | 'cutDir2'
  | 'cutDir3'
  | 'cutDir4'
  | 'cutDir5'
  | 'cutDir6'
  | 'cutDir7'
  | 'cutDir8'
  | 'cutDir9'
  | 'shortcutsPanel';

export interface ActionMeta {
  label: string;
  group: string;
  hint?: string;
}

export const ACTION_META: Record<ActionId, ActionMeta> = {
  play:           { label: 'Play / Pause',          group: 'Transport' },
  stop:           { label: 'Stop (wróć do początku)', group: 'Transport' },
  tapLeft:        { label: 'Tap LEWO',              group: 'Tapping' },
  tapRight:       { label: 'Tap PRAWO',             group: 'Tapping' },
  tapRandom:      { label: 'Tap RANDOM',            group: 'Tapping' },
  tapBomb:        { label: 'Tap BOMBA',             group: 'Tapping' },
  heldLeft:       { label: 'Held block LEWO',       group: 'Tapping', hint: 'trzymaj podczas nagrywania' },
  heldRight:      { label: 'Held block PRAWO',      group: 'Tapping', hint: 'trzymaj podczas nagrywania' },
  nextBeat:       { label: 'Następny beat',         group: 'Nawigacja' },
  prevBeat:       { label: 'Poprzedni beat',        group: 'Nawigacja' },
  jumpStart:      { label: 'Skocz na początek',     group: 'Nawigacja' },
  jumpEnd:        { label: 'Skocz na koniec',       group: 'Nawigacja' },
  loopStart:      { label: 'Loop START tu',         group: 'Loop' },
  loopEnd:        { label: 'Loop END tu',           group: 'Loop' },
  deleteSelected: { label: 'Usuń zaznaczone / nearest', group: 'Edycja' },
  selectAll:      { label: 'Zaznacz wszystko',      group: 'Edycja' },
  undo:           { label: 'Undo',                  group: 'Edycja' },
  redo:           { label: 'Redo',                  group: 'Edycja' },
  save:           { label: 'Zapisz',                group: 'Edycja' },
  copy:           { label: 'Kopiuj zaznaczone',     group: 'Edycja' },
  paste:          { label: 'Wklej',                 group: 'Edycja' },
  duplicate:      { label: 'Duplikuj zaznaczone',   group: 'Edycja' },
  zoomIn:         { label: 'Zoom in',               group: 'Widok' },
  zoomOut:        { label: 'Zoom out',              group: 'Widok' },
  cycleSnap:      { label: 'Cycle snap',            group: 'Widok' },
  toggleLoop:     { label: 'Toggle loop',           group: 'Loop' },
  cutDir1:        { label: 'Cięcie 1: any',         group: 'Kierunki cięcia' },
  cutDir2:        { label: 'Cięcie 2: ↓ down',      group: 'Kierunki cięcia' },
  cutDir3:        { label: 'Cięcie 3: ↑ up',        group: 'Kierunki cięcia' },
  cutDir4:        { label: 'Cięcie 4: ← left',      group: 'Kierunki cięcia' },
  cutDir5:        { label: 'Cięcie 5: → right',     group: 'Kierunki cięcia' },
  cutDir6:        { label: 'Cięcie 6: ↙ down-left', group: 'Kierunki cięcia' },
  cutDir7:        { label: 'Cięcie 7: ↘ down-right',group: 'Kierunki cięcia' },
  cutDir8:        { label: 'Cięcie 8: ↖ up-left',   group: 'Kierunki cięcia' },
  cutDir9:        { label: 'Cięcie 9: ↗ up-right',  group: 'Kierunki cięcia' },
  shortcutsPanel: { label: 'Panel skrótów',         group: 'Widok' },
};

export interface Binding {
  code: string;       // KeyboardEvent.code, e.g. 'Space', 'KeyF'
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

function key(b: Binding): string {
  return [b.ctrl && 'Ctrl', b.shift && 'Shift', b.alt && 'Alt', b.code]
    .filter(Boolean).join('+');
}

export function bindingLabel(b: Binding): string {
  const parts: string[] = [];
  if (b.ctrl)  parts.push('Ctrl');
  if (b.shift) parts.push('Shift');
  if (b.alt)   parts.push('Alt');
  parts.push(codeFriendly(b.code));
  return parts.join('+');
}

function codeFriendly(code: string): string {
  if (code.startsWith('Key'))    return code.slice(3);
  if (code.startsWith('Digit'))  return code.slice(5);
  if (code === 'BracketLeft')    return '[';
  if (code === 'BracketRight')   return ']';
  if (code === 'Equal')          return '=';
  if (code === 'Minus')          return '-';
  if (code === 'Backquote')      return '`';
  if (code === 'Slash')          return '/';
  if (code === 'Backslash')      return '\\';
  if (code === 'Semicolon')      return ';';
  if (code === 'Quote')          return '\'';
  if (code === 'Comma')          return ',';
  if (code === 'Period')         return '.';
  return code;
}

// Default bindings ──────────────────────────────────────────────────
const DEFAULTS: Record<ActionId, Binding> = {
  play:           { code: 'Space' },
  stop:           { code: 'KeyR', shift: true },
  tapLeft:        { code: 'KeyF' },
  tapRight:       { code: 'KeyJ' },
  tapRandom:      { code: 'KeyR' },
  tapBomb:        { code: 'KeyB' },
  heldLeft:       { code: 'KeyF', shift: true },
  heldRight:      { code: 'KeyJ', shift: true },
  nextBeat:       { code: 'Tab' },
  prevBeat:       { code: 'Tab', shift: true },
  jumpStart:      { code: 'Home' },
  jumpEnd:        { code: 'End' },
  loopStart:      { code: 'BracketLeft' },
  loopEnd:        { code: 'BracketRight' },
  deleteSelected: { code: 'Delete' },
  selectAll:      { code: 'KeyA', ctrl: true },
  undo:           { code: 'KeyZ', ctrl: true },
  redo:           { code: 'KeyY', ctrl: true },
  save:           { code: 'KeyS', ctrl: true },
  copy:           { code: 'KeyC', ctrl: true },
  paste:          { code: 'KeyV', ctrl: true },
  duplicate:      { code: 'KeyD', ctrl: true },
  zoomIn:         { code: 'Equal' },
  zoomOut:        { code: 'Minus' },
  cycleSnap:      { code: 'KeyQ' },
  toggleLoop:     { code: 'KeyL' },
  cutDir1:        { code: 'Digit1' },
  cutDir2:        { code: 'Digit2' },
  cutDir3:        { code: 'Digit3' },
  cutDir4:        { code: 'Digit4' },
  cutDir5:        { code: 'Digit5' },
  cutDir6:        { code: 'Digit6' },
  cutDir7:        { code: 'Digit7' },
  cutDir8:        { code: 'Digit8' },
  cutDir9:        { code: 'Digit9' },
  shortcutsPanel: { code: 'Slash', shift: true },
};

// Runtime map ──────────────────────────────────────────────────────
let bindings: Record<ActionId, Binding> = { ...DEFAULTS };

// Map from serialised key string → actionId for fast lookup
let keyMap: Map<string, ActionId> = new Map();

function rebuildKeyMap(): void {
  keyMap.clear();
  for (const [action, binding] of Object.entries(bindings) as [ActionId, Binding][]) {
    keyMap.set(key(binding), action);
  }
}

export function loadKeybinds(): void {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<ActionId, Binding>>;
      for (const [action, binding] of Object.entries(saved) as [ActionId, Binding][]) {
        if (action in DEFAULTS && binding?.code) {
          bindings[action] = binding;
        }
      }
    }
  } catch { /* ignore parse errors */ }
  rebuildKeyMap();
}

export function saveKeybinds(): void {
  localStorage.setItem(KEY_STORE, JSON.stringify(bindings));
}

export function resetKeybinds(): void {
  bindings = { ...DEFAULTS };
  rebuildKeyMap();
  saveKeybinds();
}

export function getBinding(action: ActionId): Binding {
  return bindings[action];
}

export function setBinding(action: ActionId, binding: Binding): void {
  bindings[action] = binding;
  rebuildKeyMap();
  saveKeybinds();
}

/** Returns the ActionId if the keyboard event matches a binding, otherwise null. */
export function matchAction(e: KeyboardEvent): ActionId | null {
  const k = [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.code]
    .filter(Boolean).join('+');
  return keyMap.get(k) ?? null;
}

/** Returns all bindings for display / editor UI. */
export function allBindings(): Array<{ action: ActionId; binding: Binding; meta: ActionMeta }> {
  return (Object.keys(bindings) as ActionId[]).map(action => ({
    action,
    binding: bindings[action],
    meta:    ACTION_META[action],
  }));
}
