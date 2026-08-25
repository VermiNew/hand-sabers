import { expect, test } from '@playwright/test';

test('main menu opens and closes the map picker without critical browser errors', async ({ page }) => {
  const criticalErrors: string[] = [];
  page.on('pageerror', error => criticalErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') criticalErrors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'pl');
    localStorage.setItem('hs_settings', JSON.stringify({
      language: 'pl',
      playerName: 'Playwright',
      profileCompleted: true,
    }));
    localStorage.setItem('hs_welcome_seen', '1');
    localStorage.setItem('hs_settings_recommendation_seen', '1');
    localStorage.setItem('hs_tutorial_seen', '1');
  });

  await page.goto('/beat-sabers-3d.html');

  const mainMenu = page.locator('#mainMenu');
  const mapsButton = page.locator('#mainMaps');
  const mapPicker = page.locator('#mapPickerOverlay');
  const searchInput = page.locator('#mpSearch');

  await expect(mainMenu).toBeVisible();
  await expect(mapsButton).toBeVisible();
  await mapsButton.click();
  await expect(mapPicker).toBeVisible();
  await expect(searchInput).toBeFocused();

  await page.locator('#mpClose').click();
  await expect(mapPicker).toBeHidden();
  await expect(mapsButton).toBeFocused();
  await expect(criticalErrors, criticalErrors.join('\n')).toEqual([]);
});
