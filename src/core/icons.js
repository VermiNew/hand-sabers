const ICONS = {
  'circle-x': 'cancel',
  x:          'close',
  check:      'check',
  'rotate-ccw': 'restart_alt',
  settings:   'settings',
  house:      'home',
};

export function iconMarkup(name, className = 'icon-inline') {
  const symbol = ICONS[name] || name;
  return `<span class="material-symbols-rounded ${className}" aria-hidden="true">${symbol}</span>`;
}

// Material Symbols renderuje przeglądarka przez font, więc nie trzeba ręcznie odświeżać SVG.
export function refreshIcons() {}

export function setIconButton(button, label, iconName) {
  if (!button) return;
  button.innerHTML = `<span class="btn-label">${label}</span>${iconMarkup(iconName, 'btn-icon')}`;
}
