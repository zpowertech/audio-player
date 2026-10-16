import {test,expect} from '@playwright/test';
for(const [name,port] of [['Vite dev',4281],['Vite production',4282],['Webpack dev',4283],['Webpack production',4284]]) {
 test(`${name}: installed package at /nested/`,async({page})=>{
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/nested/`);await expect(page.locator('#ready')).toHaveText('ready');
  expect(await page.evaluate(()=>Object.keys(sdk))).toEqual(['createAudioPlayer']);
  await page.locator('#run').click();await expect.poll(()=>page.evaluate(()=>window.result)).toEqual({ok:true});
  await expect.poll(()=>page.evaluate(()=>player.getSnapshot().status),{timeout:10000}).toBe('ended');
  expect(await page.evaluate(()=>player.getSnapshot().duration)).toBeCloseTo(5,3);
  await page.evaluate(()=>player.dispose());expect(failures).toEqual([]);
 });
}
