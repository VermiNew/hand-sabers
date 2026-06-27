import { allBindings, setBinding, resetKeybinds, bindingLabel, getBinding, type ActionId, type Binding } from './keybinds.ts';
import { t } from '../i18n/index.ts';

let recordingAction: ActionId | null = null;
let recordingBtn: HTMLButtonElement | null = null;

function stopRecording(): void {
  if (recordingBtn) {
    recordingBtn.classList.remove('is-recording');
    recordingBtn.textContent = bindingLabel(getBinding(recordingAction!));
  }
  recordingAction = null;
  recordingBtn    = null;
}

function startRecording(action: ActionId, btn: HTMLButtonElement): void {
  if (recordingAction) stopRecording();
  recordingAction = action;
  recordingBtn    = btn;
  btn.classList.add('is-recording');
  btn.textContent = t('creator.kbRecording');
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
  setBinding(recordingAction, binding);
  stopRecording();
  renderKbEditor();
}

export function initKeybindsUI(): void {
  window.addEventListener('keydown', onRecordKeydown, { capture: true });

  document.getElementById('kbResetAll')?.addEventListener('click', () => {
    if (confirm(t('creator.kbResetConfirm'))) {
      resetKeybinds();
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

export function renderKbEditor(): void {
  const container = document.getElementById('kbEditor');
  if (!container) return;

  container.innerHTML = '';

  // Group actions
  const groups = new Map<string, typeof bindings>();
  const bindings = allBindings();
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

    for (const { action, binding, meta } of items) {
      const row = document.createElement('div');
      row.className = 'kb-row';

      const labelCol = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'kb-label';
      name.textContent = meta.label;
      labelCol.appendChild(name);
      if (meta.hint) {
        const hint = document.createElement('div');
        hint.className = 'kb-hint';
        hint.textContent = meta.hint;
        labelCol.appendChild(hint);
      }

      const btn = document.createElement('button');
      btn.className = 'kb-bind-btn';
      btn.textContent = bindingLabel(binding);
      btn.dataset['action'] = action;
      btn.addEventListener('click', () => {
        if (recordingAction === action) { stopRecording(); return; }
        startRecording(action, btn);
      });

      row.appendChild(labelCol);
      row.appendChild(btn);
      container.appendChild(row);
    }
  }
}
