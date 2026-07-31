import { t, translateDom } from '../i18n/index.ts';
import { getSettings, setSetting } from '../core/settings.ts';

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
