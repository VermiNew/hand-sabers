import { allBindings, setBinding, resetBinding, resetKeybinds, bindingLabel, getBinding, getActionMeta, findBindingConflict, type ActionId, type Binding } from './keybinds.ts';
import { t } from '../i18n/index.ts';

let recordingAction: ActionId | null = null;
let recordingBtn: HTMLButtonElement | null = null;
let filterText = '';

function stopRecording(): void {
  if (recordingBtn) {
    recordingBtn.classList.remove('is-recording', 'has-conflict');
    recordingBtn.textContent = bindingLabel(getBinding(recordingAction!));
  }
  recordingAction = null;
  recordingBtn    = null;
}

function startRecording(action: ActionId, btn: HTMLButtonElement): void {
  if (recordingAction) stopRecording();
  recordingAction = action;
  recordingBtn    = btn;
  btn.classList.remove('has-conflict');
  btn.classList.add('is-recording');
  btn.textContent = t('creator.kbRecording');
}

function formatConflictMessage(key: string, actions: ActionId[]): string {
  const labels = actions.map(action => getActionMeta(action).label).join(', ');
  return t(key).replace('{{actions}}', labels).replace('{{action}}', labels);
}

function matchesFilter(item: ReturnType<typeof allBindings>[number], query: string): boolean {
  if (!query) return true;
  const haystack = [item.action, item.meta.label, item.meta.group, bindingLabel(item.binding), item.binding.code]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function onRecordKeydown(e: KeyboardEvent): void {
  if (!recordingAction || !recordingBtn) return;

  // Escape cancels recording
  if (e.code === 'Escape') {
    stopRecording();
    return;
  }
  // Ignore modifier-only presses
  if (['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(e.code)) return;

  e.preventDefault();
  e.stopPropagation();

  const binding: Binding = { code: e.code };
  if (e.shiftKey) binding.shift = true;
  if (e.ctrlKey)  binding.ctrl  = true;
  if (e.altKey)   binding.alt   = true;

  const conflict = findBindingConflict(recordingAction, binding);
  if (conflict) {
    recordingBtn.classList.add('has-conflict');
    recordingBtn.textContent = formatConflictMessage('creator.kbConflictShort', [conflict]);
    return;
  }

  setBinding(recordingAction, binding);
  stopRecording();
  renderKbEditor();
}

export function initKeybindsUI(): void {
  window.addEventListener('keydown', onRecordKeydown, { capture: true });

  document.getElementById('kbResetAll')?.addEventListener('click', () => {
    if (confirm(t('creator.kbResetConfirm'))) {
      resetKeybinds();
      filterText = '';
      stopRecording();
      renderKbEditor();
    }
  });

  // Tab switching
  const panel = document.getElementById('shortcutsPanel');
  panel?.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    if (!btn) return;
    const tabId = btn.dataset['tab'];
    panel.querySelectorAll('.shortcuts-tab-btn').forEach(b => b.classList.remove('is-active'));
    panel.querySelectorAll('.shortcuts-tab-pane').forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    const pane = panel.querySelector(`#spTab${tabId ? tabId.charAt(0).toUpperCase() + tabId.slice(1) : ''}`);
    if (pane) pane.classList.add('is-active');
    if (tabId === 'edit') renderKbEditor();
  });

  // Close button
  document.getElementById('btnShortcutsClose')?.addEventListener('click', () => {
    document.getElementById('shortcutsPanel')?.classList.add('hidden');
    document.getElementById('btnShortcuts')?.classList.remove('active');
    document.getElementById('btnShortcuts')?.setAttribute('aria-expanded', 'false');
    stopRecording();
  });
}

export function renderKbEditor(focusFilter = false): void {
  const container = document.getElementById('kbEditor');
  if (!container) return;

  container.innerHTML = '';

  const tools = document.createElement('div');
  tools.className = 'kb-editor-tools';
  const search = document.createElement('input');
  search.className = 'kb-search-input';
  search.type = 'search';
  search.placeholder = t('creator.kbSearchPlaceholder');
  search.value = filterText;
  search.addEventListener('input', () => {
    filterText = search.value;
    renderKbEditor(true);
  });
  tools.appendChild(search);
  container.appendChild(tools);

  const query = filterText.trim().toLowerCase();
  const bindings = allBindings().filter(item => matchesFilter(item, query));
  if (!bindings.length) {
    const empty = document.createElement('div');
    empty.className = 'kb-empty';
    empty.textContent = t('creator.kbNoMatches');
    container.appendChild(empty);
    if (focusFilter) search.focus();
    return;
  }

  const groups = new Map<string, typeof bindings>();
  for (const item of bindings) {
    const g = item.meta.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(item);
  }

  for (const [group, items] of groups) {
    const title = document.createElement('div');
    title.className = 'kb-group-title';
    title.textContent = group;
    container.appendChild(title);

    for (const { action, binding, meta, conflicts, isDefault } of items) {
      const row = document.createElement('div');
      row.className = 'kb-row';
      if (conflicts.length) row.classList.add('is-conflict');

      const labelCol = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'kb-label';
      name.textContent = meta.label;
      labelCol.appendChild(name);
      if (conflicts.length) {
        const conflict = document.createElement('div');
        conflict.className = 'kb-conflict';
        conflict.textContent = formatConflictMessage('creator.kbConflictHint', conflicts);
        labelCol.appendChild(conflict);
      }
      if (meta.hint) {
        const hint = document.createElement('div');
        hint.className = 'kb-hint';
        hint.textContent = meta.hint;
        labelCol.appendChild(hint);
      }

      const btn = document.createElement('button');
      btn.className = 'kb-bind-btn';
      if (conflicts.length) btn.classList.add('has-conflict');
      btn.textContent = bindingLabel(binding);
      btn.dataset['action'] = action;
      btn.addEventListener('click', () => {
        if (recordingAction === action) { stopRecording(); return; }
        startRecording(action, btn);
      });

      const resetBtn = document.createElement('button');
      resetBtn.className = 'kb-reset-one';
      resetBtn.type = 'button';
      resetBtn.textContent = t('creator.kbResetOne');
      resetBtn.disabled = isDefault;
      resetBtn.addEventListener('click', () => {
        stopRecording();
        resetBinding(action);
        renderKbEditor();
      });

      const actions = document.createElement('div');
      actions.className = 'kb-row-actions';
      actions.appendChild(btn);
      actions.appendChild(resetBtn);

      row.appendChild(labelCol);
      row.appendChild(actions);
      container.appendChild(row);
    }
  }

  if (focusFilter) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
}
