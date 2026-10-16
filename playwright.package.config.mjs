import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'test/package-browser',timeout:20000,workers:3,use:{headless:true,trace:'retain-on-failure'},
 projects:['chromium','firefox','webkit'].map(browserName=>({name:browserName,use:{browserName,...(browserName==='firefox'&&process.env.AUDIO_TEST_FIREFOX_EXECUTABLE?{launchOptions:{executablePath:process.env.AUDIO_TEST_FIREFOX_EXECUTABLE}}:{})}})),
 webServer:[
  {command:'node ../../node_modules/vite/bin/vite.js',cwd:'.test-package/vite',url:'http://127.0.0.1:4281/nested/'},
  {command:'node ../../node_modules/vite/bin/vite.js preview',cwd:'.test-package/vite',url:'http://127.0.0.1:4282/nested/'},
  {command:'node ../../node_modules/webpack-cli/bin/cli.js serve --mode development',cwd:'.test-package/webpack',url:'http://127.0.0.1:4283/nested/'},
  {command:'node scripts/serve-package.mjs',url:'http://127.0.0.1:4284/nested/'}
 ]});
