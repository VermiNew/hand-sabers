import { t, translateDom } from '../i18n/index.ts';
import { getSettings, setSetting } from '../core/settings.ts';
import type { Settings } from '../types/index.js';

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

let initialized = false;

export function initProfileOnboarding(): void {
  if (initialized) return;
  initialized = true;

  const overlay = element<HTMLElement>('profileOnboarding');
  const nameInput = element<HTMLInputElement>('profileNameInput');
  const confirmBtn = element<HTMLButtonElement>('profileConfirm');
  const avatarGrid = element<HTMLElement>('profileAvatarGrid');
  if (!overlay || !nameInput || !confirmBtn) return;

  const settings = getSettings();
  let selectedAvatar = settings.avatar || 'default';

  // Initialize name input with current player name
  nameInput.value = settings.playerName !== 'Gracz' ? settings.playerName : '';

  // Avatar selection
  if (avatarGrid) {
    avatarGrid.querySelectorAll<HTMLElement>('.profile-avatar-option').forEach(btn => {
      btn.addEventListener('click', () => {
        avatarGrid.querySelectorAll('.profile-avatar-option').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        selectedAvatar = btn.dataset['avatar'] ?? 'default';
      });
    });
  }

  const close = () => {
    overlay.hidden = true;
  };

  confirmBtn.addEventListener('click', () => {
    const name = nameInput.value.trim().slice(0, 32) || t('player.defaultName');
    setSetting('playerName', name);
    setSetting('avatar', selectedAvatar);
    setSetting('profileCompleted', true);
    close();
  });

  // Allow Enter to confirm
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmBtn.click();
  });
}

export function showProfileOnboardingIfNeeded(): void {
  const overlay = element<HTMLElement>('profileOnboarding');
  if (!overlay) return;
  const settings = getSettings();
  if (!settings.profileCompleted) {
    translateDom(overlay);
    overlay.hidden = false;
    element<HTMLInputElement>('profileNameInput')?.focus({ preventScroll: true });
  }
}

export function initProfileSettings(settings: Settings): void {
  const nameInput = element<HTMLInputElement>('menuProfileName');
  const avatarGrid = element<HTMLElement>('menuProfileAvatarGrid');
  const saveButton = element<HTMLButtonElement>('menuProfileSave');
  const savedLabel = element<HTMLElement>('menuProfileSaved');
  const avatarPreview = document.querySelector<HTMLElement>('#menuProfileAvatarPreview .material-symbols-rounded');
  const namePreview = element<HTMLElement>('menuProfileNamePreview');
  const nameCount = element<HTMLElement>('menuProfileNameCount');

  let pendingAvatar = settings.avatar ?? 'default';

  function updatePreview(): void {
    const name = (nameInput?.value ?? '').trim() || t('player.defaultName');
    if (namePreview) namePreview.textContent = name;
    if (nameCount) nameCount.textContent = `${nameInput?.value.length ?? 0} / 32`;
    const selectedAvatar = avatarGrid?.querySelector<HTMLElement>(`[data-avatar="${pendingAvatar}"] .material-symbols-rounded`);
    if (avatarPreview) avatarPreview.textContent = selectedAvatar?.textContent ?? 'person';
  }

  if (nameInput) {
    nameInput.value = settings.playerName ?? '';
    nameInput.addEventListener('input', updatePreview);
  }

  avatarGrid?.querySelectorAll<HTMLElement>('.profile-avatar-option').forEach(button => {
    button.classList.toggle('is-selected', button.dataset['avatar'] === settings.avatar);
    button.addEventListener('click', () => {
      avatarGrid.querySelectorAll('.profile-avatar-option').forEach(option => option.classList.remove('is-selected'));
      button.classList.add('is-selected');
      pendingAvatar = button.dataset['avatar'] ?? 'default';
      updatePreview();
    });
  });
  updatePreview();

  saveButton?.addEventListener('click', () => {
    const name = (nameInput?.value ?? '').trim().slice(0, 32) || t('player.defaultName');
    settings.playerName = name;
    settings.avatar = pendingAvatar;
    settings.profileCompleted = true;
    setSetting('playerName', name);
    setSetting('avatar', pendingAvatar);
    setSetting('profileCompleted', true);
    if (nameInput) nameInput.value = name;
    window.dispatchEvent(new CustomEvent('hand-sabers:profile-updated', {
      detail: { playerName: name, avatar: pendingAvatar },
    }));
    if (savedLabel) {
      savedLabel.classList.add('is-visible');
      setTimeout(() => { savedLabel.classList.remove('is-visible'); }, 2000);
    }
  });
}
