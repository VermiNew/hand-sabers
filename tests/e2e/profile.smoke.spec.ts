import { expect, test } from '@playwright/test';

test('profile onboarding validates the name and keeps editing consistent in settings', async ({ page }) => {
  const criticalErrors: string[] = [];
  page.on('pageerror', error => criticalErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') criticalErrors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'pl');
    localStorage.setItem('hs_settings', JSON.stringify({
      language: 'pl',
      playerName: '',
      avatar: 'rocket',
      profileCompleted: false,
    }));
    localStorage.setItem('hs_welcome_seen', '1');
    localStorage.setItem('hs_settings_recommendation_seen', '1');
    localStorage.setItem('hs_tutorial_seen', '1');
  });

  await page.goto('/beat-sabers-3d.html');

  const onboarding = page.locator('#profileOnboarding');
  const nameInput = page.locator('#profileNameInput');
  const avatarGrid = page.locator('#profileAvatarGrid');
  await expect(onboarding).toBeVisible();
  await expect(nameInput).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });

  await page.locator('#profileConfirm').click();
  await expect(page.locator('#profileNameError')).toHaveText('Wpisz nazwę gracza, aby kontynuować.');
  await expect(onboarding).toBeVisible();

  await nameInput.fill('  Ada   Player  ');
  await expect(page.locator('#profileOnboardingNamePreview')).toHaveText('Ada Player');
  await expect(avatarGrid.getByRole('radio', { name: 'Awatar: rakieta' })).toHaveAttribute('aria-checked', 'true');
  await avatarGrid.getByRole('radio', { name: 'Awatar: rakieta' }).press('ArrowRight');
  await expect(avatarGrid.getByRole('radio', { name: 'Awatar: gwiazda' })).toBeFocused();
  await expect(avatarGrid.getByRole('radio', { name: 'Awatar: gwiazda' })).toHaveAttribute('aria-checked', 'true');

  await page.locator('#profileConfirm').click();
  await expect(onboarding).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hs_settings') ?? '{}'))).toMatchObject({
    playerName: 'Ada Player',
    avatar: 'star',
    profileCompleted: true,
  });

  await page.locator('#mainSettings').click();
  await page.locator('.sp-nav-item[data-tab="profile"]').click();
  const settingsName = page.locator('#menuProfileName');
  await expect(settingsName).toHaveValue('Ada Player');
  await settingsName.fill('');
  await page.locator('#menuProfileSave').click();
  await expect(page.locator('#menuProfileNameError')).toHaveText('Wpisz nazwę gracza, aby kontynuować.');
  await settingsName.fill('Nova');
  await settingsName.press('Enter');
  await expect(page.locator('#menuProfileSaved')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hs_settings') ?? '{}').playerName)).toBe('Nova');
  await expect(criticalErrors, criticalErrors.join('\n')).toEqual([]);
});
