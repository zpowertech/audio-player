import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'test/examples-browser',workers:3,timeout:15000,use:{baseURL:'http://127.0.0.1:4290',trace:'retain-on-failure'},
 projects:[{name:'chrome',use:{browserName:'chromium',channel:'chrome'}}],
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4290 --strictPort',url:'http://127.0.0.1:4290/examples/',reuseExistingServer:!process.env.CI},
});
