import { expect, test } from '@playwright/test';

test('Lyra keeps a stable, scrollable conversation layout for long text and reduced motion', async ({ page }) => {
  const criticalErrors: string[] = [];
  page.on('pageerror', error => criticalErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') criticalErrors.push(`console: ${message.text()}`);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
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
  const longText = 'To jest bardzo długi tekst Lyry, który ma się poprawnie zawijać i przewijać. '.repeat(5).trim();

  await page.goto('/beat-sabers-3d.html');
  await page.waitForTimeout(1_500);
  const immediateAriaLabel = await page.evaluate(async text => {
    const { narratorShow } = await import('/src/game/narrator.ts');
    void narratorShow({ text, charMs: 1 });
    return document.getElementById('narratorSpeech')?.getAttribute('aria-label');
  }, longText);
  expect(immediateAriaLabel).toBe(longText);
  const box = page.locator('#narratorBox');
  const speech = page.locator('#narratorSpeech');
  await expect(box).toBeVisible();
  await expect(speech).toHaveAttribute('aria-label', longText, { timeout: 15_000 });
  const initialHeight = await speech.evaluate(element => element.clientHeight);
  await expect(page.locator('.narrator-btn')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('#narratorText')).toHaveText(longText, { timeout: 15_000 });
  await expect(speech).toHaveAttribute('aria-label', longText);
  await expect(page.locator('body')).toHaveClass(/narrator-open/);
  await expect(page.locator('#camPanel')).toHaveCSS('visibility', 'hidden');
  expect(await speech.evaluate(element => element.clientHeight)).toBe(initialHeight);
  expect(await speech.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await speech.evaluate(element => element.scrollTop > 0)).toBe(true);
  expect(await box.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.locator('.narrator-btn').click();
  await expect(box).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/narrator-open/);
  expect(criticalErrors, criticalErrors.join('\n')).toEqual([]);
});
