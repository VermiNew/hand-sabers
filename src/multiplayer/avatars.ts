/** Canonical list of allowed avatar IDs and their Material Symbols icon names. */
import { sanitizeProfileColor } from '../core/profile-color.ts';

export const AVATAR_IDS = ['default', 'cat', 'rocket', 'star', 'music', 'bolt', 'diamond', 'forest'] as const;
export type AvatarId = typeof AVATAR_IDS[number];

const AVATAR_ICONS: Record<AvatarId, string> = {
  default: 'person',
  cat: 'pets',
  rocket: 'rocket_launch',
  star: 'star',
  music: 'music_note',
  bolt: 'bolt',
  diamond: 'diamond',
  forest: 'forest',
};

/** Validate an avatar ID against the allowlist, returning 'default' for invalid values. */
export function sanitizeAvatar(value: unknown): AvatarId {
  if (typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value)) {
    return value as AvatarId;
  }
  return 'default';
}

/** Get the Material Symbols icon name for an avatar ID. */
export function avatarIcon(avatar: string): string {
  return AVATAR_ICONS[sanitizeAvatar(avatar)] ?? AVATAR_ICONS.default;
}

/** Create an inline avatar badge element using a Material Symbols icon. */
export function createAvatarBadge(avatar: string, size = 18, playerColor?: unknown): HTMLElement {
  const span = document.createElement('span');
  span.className = 'mp-avatar-badge';
  span.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:rgba(47,124,255,0.15);color:var(--main,#2f7cff);flex-shrink:0`;
  span.style.color = sanitizeProfileColor(playerColor);
  const icon = document.createElement('span');
  icon.className = 'material-symbols-rounded';
  icon.style.fontSize = `${Math.round(size * 0.7)}px`;
  icon.textContent = avatarIcon(avatar);
  span.append(icon);
  return span;
}
