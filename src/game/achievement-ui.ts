import {
  getAllAchievements,
  getDefinition,
  getStats,
  getTotalAchievements,
  getUnlockedCount,
  getUnlockedSet,
  resetAchievements,
} from '../core/achievements.ts';
import { t } from '../i18n/index.ts';

interface AchievementToastElement extends HTMLElement {
  _timer?: ReturnType<typeof setTimeout>;
}

export function initAchievementUI(): void {
  window.addEventListener('hand-sabers:achievement', event => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    showAchievementToast(id);
  });

  document.getElementById('achResetBtn')?.addEventListener('click', () => {
    if (!confirm(t('settings.resetConfirm'))) return;
    resetAchievements();
    renderAchievementCompactGrid();
  });
}

function showAchievementToast(id: string): void {
  const definition = getDefinition(id);
  if (!definition) return;
  const toast = document.getElementById('achievementToast') as AchievementToastElement | null;
  const icon = document.getElementById('achToastIcon');
  const title = document.getElementById('achToastTitle');
  if (!toast || !icon || !title) return;

  icon.textContent = definition.icon;
  icon.className = `material-symbols-rounded ach-toast-icon ach-tier-${definition.tier}`;
  title.textContent = t(`achievements.names.${id}`);

  let tier = document.getElementById('achToastTier');
  if (!tier) {
    tier = document.createElement('span');
    tier.id = 'achToastTier';
    tier.className = 'ach-toast-tier';
    title.insertAdjacentElement('afterend', tier);
  }
  tier.className = `ach-toast-tier ach-tier-${definition.tier}`;
  tier.textContent = t(`achievements.tiers.${definition.tier}`);

  toast.hidden = false;
  toast.classList.add('is-visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => { toast.hidden = true; }, 350);
  }, 4000);
}

export function renderStatsGrid(): void {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;
  const stats = getStats();
  const accuracy = stats.totalHits + stats.totalMisses > 0
    ? Math.round((stats.totalHits / (stats.totalHits + stats.totalMisses)) * 100)
    : 0;
  const hours = Math.floor(stats.totalPlayTimeMs / 3_600_000);
  const minutes = Math.floor((stats.totalPlayTimeMs % 3_600_000) / 60_000);
  const fullTotalScore = String(stats.totalScore);
  const totalScoreValue = new Intl.NumberFormat(document.documentElement.lang || 'pl', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(stats.totalScore);

  const items = [
    { key: 'totalGames', value: String(stats.totalGames) },
    { key: 'gamesWon', value: String(stats.gamesWon) },
    { key: 'gamesLost', value: String(stats.gamesLost) },
    { key: 'totalHits', value: String(stats.totalHits) },
    { key: 'totalMisses', value: String(stats.totalMisses) },
    { key: 'accuracy', value: `${accuracy}%` },
    { key: 'bestCombo', value: `×${stats.maxCombo}` },
    { key: 'totalScore', value: totalScoreValue, fullValue: fullTotalScore },
    { key: 'perfectHits', value: String(stats.perfectHits) },
    { key: 'mapsCompleted', value: String(stats.mapsCompleted) },
    { key: 'totalPlayTime', value: `${hours}h ${minutes}m` },
  ];

  grid.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('div');
    card.className = `stat-card${item.key === 'totalScore' ? ' stat-card-score' : ''}`;
    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = item.value;
    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = t(`stats.${item.key}`);
    card.append(value, label);
    if (item.fullValue) {
      card.title = item.fullValue;
      card.setAttribute('aria-label', `${t('stats.totalScore')}: ${item.fullValue}`);
    }
    grid.appendChild(card);
  }
}

export function renderAchievementCompactGrid(): void {
  const grid = document.getElementById('achCompactGrid');
  if (!grid) return;
  const unlocked = getUnlockedSet();
  grid.innerHTML = '';

  for (const achievement of getAllAchievements()) {
    const card = document.createElement('div');
    card.className = `ach-compact-card${unlocked.has(achievement.id) ? '' : ' is-locked'}`;
    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded';
    icon.textContent = achievement.icon;
    const name = document.createElement('span');
    name.className = 'ach-compact-name';
    name.textContent = t(`achievements.names.${achievement.id}`);
    card.append(icon, name);
    grid.appendChild(card);
  }

  const progressText = document.getElementById('achProgressText');
  const progressFill = document.getElementById('achProgressFill');
  const unlockedCount = getUnlockedCount();
  const total = getTotalAchievements();
  if (progressText) progressText.textContent = `${unlockedCount} / ${total}`;
  if (progressFill) progressFill.style.width = `${total > 0 ? (unlockedCount / total) * 100 : 0}%`;
}
