import { defineConfig } from '@playwright/test';
const channels = (process.env.AUDIO_TEST_CHANNELS ?? '').split(',').filter(Boolean);
export default defineConfig({
  testDir: './test/browser', timeout: 25_000, fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['json', { outputFile: 'output/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4280', headless: true, trace: 'retain-on-failure' },
  projects: [
    ...['chromium','firefox','webkit'].map(browserName=>({name:browserName,use:{browserName,
      ...(browserName==='firefox' && process.env.AUDIO_TEST_FIREFOX_EXECUTABLE ? {launchOptions:{executablePath:process.env.AUDIO_TEST_FIREFOX_EXECUTABLE}} : {})}})),
    ...channels.map(channel=>({name:channel,use:{browserName:'chromium',channel}})),
    ...(process.env.AUDIO_TEST_EDGE_EXECUTABLE ? [{name:'edge',use:{browserName:'chromium',channel:'msedge',launchOptions:{executablePath:process.env.AUDIO_TEST_EDGE_EXECUTABLE}}}] : []),
  ],
  webServer: {command:'node scripts/test-server.mjs',url:'http://127.0.0.1:4280',reuseExistingServer:!process.env.CI},
});
