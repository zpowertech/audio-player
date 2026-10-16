import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', timeout: 25_000, fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['json', { outputFile: 'output/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4280', headless: true, trace: 'retain-on-failure' },
  projects: [{name:'chrome',use:{browserName:'chromium',channel:'chrome'}}],
  webServer: {command:'node scripts/test-server.mjs',url:'http://127.0.0.1:4280',reuseExistingServer:!process.env.CI},
});
