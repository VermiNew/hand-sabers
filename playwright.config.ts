import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://127.0.0.1:3000/api/maps',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: 'npm run dev:client -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173/beat-sabers-3d.html',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
