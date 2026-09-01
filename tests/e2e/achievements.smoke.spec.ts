import { expect, test } from '@playwright/test';

test('achievement settings show categories, tiers and accessible progress on desktop and mobile', async ({ page }) => {
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
    localStorage.setItem('hs_achievements', JSON.stringify(['first_game']));
    localStorage.setItem('hs_stats', JSON.stringify({ totalGames: 5 }));
  });

  await page.goto('/beat-sabers-3d.html');
  await page.locator('#mainSettings').click();
  await page.locator('.sp-nav-item[data-tab="achievements"]').click();

  const grid = page.locator('#achCompactGrid');
  await expect(grid).toBeVisible();
  await expect(page.locator('#camPanel')).toBeHidden();
  await expect(grid.locator('.ach-category-header')).toHaveCount(4);
  await expect(grid.locator('.ach-compact-card')).toHaveCount(33);
  await expect(grid.locator('.ach-compact-description')).toHaveCount(33);
  await expect(grid.locator('[role="progressbar"]')).toHaveCount(33);
  await expect(grid.locator('.ach-compact-card').first()).toHaveClass(/is-unlocked/);
  await expect(grid.locator('[role="progressbar"]').first()).toHaveAttribute('aria-valuenow', '100');
  await expect(grid.locator('[role="progressbar"]').nth(1)).toHaveAttribute('aria-valuenow', '50');
  await expect(grid.locator('.ach-compact-tier').first()).toHaveText('Brąz');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hand-sabers:achievement', { detail: { id: 'ten_games' } }));
    window.dispatchEvent(new CustomEvent('hand-sabers:achievement', { detail: { id: 'fifty_games' } }));
  });
  await expect(page.locator('#achToastTitle')).toHaveText('Rozkręcam Się');
  await expect(page.locator('#achToastTitle')).toHaveText('Oddany Gracz', { timeout: 6_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  expect(await grid.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(criticalErrors, criticalErrors.join('\n')).toEqual([]);
});
