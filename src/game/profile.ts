import { t, translateDom } from '../i18n/index.ts';
import { getSettings, setSetting } from '../core/settings.ts';
import { PROFILE_COLOR_PRESETS, sanitizeProfileColor } from '../core/profile-color.ts';
import type { Settings } from '../types/index.js';
import { createModalTransition, type ModalTransitionController } from '../ui/modal-transition.ts';

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

let initialized = false;
let onboardingModal: ModalTransitionController | null = null;

const MAX_PLAYER_NAME_LENGTH = 32;

const AVATAR_ICONS: Record<string, string> = {
  default: 'person',
  cat: 'pets',
  rocket: 'rocket_launch',
  star: 'star',
  music: 'music_note',
  bolt: 'bolt',
  diamond: 'diamond',
  forest: 'forest',
};

function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME_LENGTH);
}

function validatePlayerName(value: string): string | null {
  return normalizePlayerName(value) ? null : t('profile.nameRequired');
}

function setNameError(input: HTMLInputElement | null, error: HTMLElement | null, message: string | null): void {
  if (!input || !error) return;
  input.setAttribute('aria-invalid', String(Boolean(message)));
  error.textContent = message ?? '';
  error.hidden = !message;
}

function avatarLabel(avatar: string): string {
  return t(`profile.avatars.${avatar}`);
}

function initAvatarPicker(
  grid: HTMLElement | null,
  initialAvatar: string,
  onSelect: (avatar: string) => void,
): (avatar: string, focus?: boolean) => void {
  if (!grid) return () => {};
  const buttons = [...grid.querySelectorAll<HTMLButtonElement>('.profile-avatar-option')];
  const selectAvatar = (avatar: string, focus = false) => {
    const selected = buttons.find(button => button.dataset['avatar'] === avatar) ?? buttons[0];
    if (!selected) return;
    buttons.forEach(button => {
      const active = button === selected;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    onSelect(selected.dataset['avatar'] ?? 'default');
    if (focus) selected.focus();
  };

  buttons.forEach(button => {
    const avatar = button.dataset['avatar'] ?? 'default';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', avatarLabel(avatar));
    button.addEventListener('click', () => selectAvatar(avatar));
  });
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', t('profile.chooseAvatar'));
  grid.addEventListener('keydown', event => {
    const currentIndex = Math.max(0, buttons.findIndex(button => button.classList.contains('is-selected')));
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = buttons.length - 1;
    else return;
    event.preventDefault();
    selectAvatar(buttons[nextIndex]?.dataset['avatar'] ?? 'default', true);
  });
  selectAvatar(initialAvatar);
  return selectAvatar;
}

export function initProfileOnboarding(): void {
  if (initialized) return;
  initialized = true;

  const overlay = element<HTMLElement>('profileOnboarding');
  const nameInput = element<HTMLInputElement>('profileNameInput');
  const confirmBtn = element<HTMLButtonElement>('profileConfirm');
  const avatarGrid = element<HTMLElement>('profileAvatarGrid');
  const nameError = element<HTMLElement>('profileNameError');
  const avatarPreview = element<HTMLElement>('profileOnboardingAvatarPreview');
  const namePreview = element<HTMLElement>('profileOnboardingNamePreview');
  if (!overlay || !nameInput || !confirmBtn) return;

  const settings = getSettings();
  let selectedAvatar = settings.avatar || 'default';

  // Initialize name input with current player name
  nameInput.value = settings.playerName !== 'Gracz' ? settings.playerName : '';

  const updatePreview = () => {
    if (avatarPreview) avatarPreview.textContent = AVATAR_ICONS[selectedAvatar] ?? AVATAR_ICONS.default ?? 'person';
    if (namePreview) namePreview.textContent = normalizePlayerName(nameInput.value) || t('player.defaultName');
  };
  initAvatarPicker(avatarGrid, selectedAvatar, avatar => {
    selectedAvatar = avatar;
    updatePreview();
  });
  nameInput.addEventListener('input', () => {
    updatePreview();
    if (!nameError?.hidden) setNameError(nameInput, nameError, validatePlayerName(nameInput.value));
  });

  onboardingModal = createModalTransition({
    overlay,
    panel: overlay.querySelector<HTMLElement>('.profile-onboarding-card'),
    closeOnEscape: false,
  });

  confirmBtn.addEventListener('click', () => {
    const error = validatePlayerName(nameInput.value);
    setNameError(nameInput, nameError, error);
    if (error) {
      nameInput.focus();
      return;
    }
    const name = normalizePlayerName(nameInput.value);
    setSetting('playerName', name);
    setSetting('avatar', selectedAvatar);
    setSetting('profileCompleted', true);
    window.dispatchEvent(new CustomEvent('hand-sabers:profile-updated', {
      detail: { playerName: name, avatar: selectedAvatar, playerColor: sanitizeProfileColor(settings.playerColor) },
    }));
    onboardingModal?.close();
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
    const nameInput = element<HTMLInputElement>('profileNameInput');
    setNameError(nameInput, element<HTMLElement>('profileNameError'), null);
    onboardingModal?.open({ initialFocus: nameInput, returnFocusTo: null });
  }
}

export function initProfileSettings(settings: Settings): void {
  const nameInput = element<HTMLInputElement>('menuProfileName');
  const avatarGrid = element<HTMLElement>('menuProfileAvatarGrid');
  const saveButton = element<HTMLButtonElement>('menuProfileSave');
  const savedLabel = element<HTMLElement>('menuProfileSaved');
  const avatarPreview = document.querySelector<HTMLElement>('#menuProfileAvatarPreview .material-symbols-rounded');
  const profilePreview = element<HTMLElement>('menuProfileAvatarPreview');
  const namePreview = element<HTMLElement>('menuProfileNamePreview');
  const nameCount = element<HTMLElement>('menuProfileNameCount');
  const nameError = element<HTMLElement>('menuProfileNameError');
  const colorInput = element<HTMLInputElement>('menuProfileColor');
  const colorPresets = element<HTMLElement>('menuProfileColorPresets');

  let pendingAvatar = settings.avatar ?? 'default';
  let pendingColor = sanitizeProfileColor(settings.playerColor);

  function setPendingColor(color: string): void {
    pendingColor = sanitizeProfileColor(color);
    if (colorInput) colorInput.value = pendingColor;
    colorPresets?.querySelectorAll<HTMLButtonElement>('[data-profile-color]').forEach(button => {
      const selected = button.dataset['profileColor'] === pendingColor;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    profilePreview?.style.setProperty('--profile-color', pendingColor);
  }

  function updatePreview(): void {
    const name = normalizePlayerName(nameInput?.value ?? '') || t('player.defaultName');
    if (namePreview) namePreview.textContent = name;
    if (nameCount) nameCount.textContent = `${nameInput?.value.length ?? 0} / 32`;
    const selectedAvatar = avatarGrid?.querySelector<HTMLElement>(`[data-avatar="${pendingAvatar}"] .material-symbols-rounded`);
    if (avatarPreview) avatarPreview.textContent = selectedAvatar?.textContent ?? 'person';
    setPendingColor(pendingColor);
  }

  if (nameInput) {
    nameInput.value = settings.playerName ?? '';
    nameInput.addEventListener('input', () => {
      updatePreview();
      if (!nameError?.hidden) setNameError(nameInput, nameError, validatePlayerName(nameInput.value));
    });
    nameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') saveButton?.click();
    });
  }

  const selectAvatar = initAvatarPicker(avatarGrid, pendingAvatar, avatar => {
    pendingAvatar = avatar;
    updatePreview();
  });
  colorPresets?.querySelectorAll<HTMLButtonElement>('[data-profile-color]').forEach(button => {
    const color = button.dataset['profileColor'];
    if (!color || !PROFILE_COLOR_PRESETS.includes(color as typeof PROFILE_COLOR_PRESETS[number])) return;
    button.setAttribute('aria-label', t('profile.colorPreset', { color }));
    button.addEventListener('click', () => setPendingColor(color));
  });
  colorInput?.addEventListener('input', () => setPendingColor(colorInput.value));
  updatePreview();

  window.addEventListener('hand-sabers:profile-updated', event => {
    const profile = (event as CustomEvent<{ playerName: string; avatar: string; playerColor: string }>).detail;
    if (!profile) return;
    if (nameInput) nameInput.value = profile.playerName;
    pendingAvatar = profile.avatar;
    pendingColor = sanitizeProfileColor(profile.playerColor);
    selectAvatar(pendingAvatar);
    updatePreview();
    setNameError(nameInput, nameError, null);
  });

  saveButton?.addEventListener('click', () => {
    const error = validatePlayerName(nameInput?.value ?? '');
    setNameError(nameInput, nameError, error);
    if (error) {
      nameInput?.focus();
      return;
    }
    const name = normalizePlayerName(nameInput?.value ?? '');
    settings.playerName = name;
    settings.avatar = pendingAvatar;
    settings.playerColor = pendingColor;
    settings.profileCompleted = true;
    setSetting('playerName', name);
    setSetting('avatar', pendingAvatar);
    setSetting('playerColor', pendingColor);
    setSetting('profileCompleted', true);
    if (nameInput) nameInput.value = name;
    window.dispatchEvent(new CustomEvent('hand-sabers:profile-updated', {
      detail: { playerName: name, avatar: pendingAvatar, playerColor: pendingColor },
    }));
    if (savedLabel) {
      savedLabel.classList.add('is-visible');
      setTimeout(() => { savedLabel.classList.remove('is-visible'); }, 2000);
    }
  });
}
