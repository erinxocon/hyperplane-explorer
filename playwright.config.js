import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1400, height: 860 },
    // Software GL so the suite also runs on headless CI boxes without a GPU.
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 860 } } }],
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
});
