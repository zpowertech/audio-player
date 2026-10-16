import {test,expect} from '@playwright/test';
test('vanilla demo plays, pauses and resumes the built package',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/examples/');await page.getByRole('button',{name:'播放 / 续播',exact:true}).click();
 await expect(page.locator('#state')).toContainText('playing');
 await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.locator('#state')).toContainText('paused');
 await page.getByRole('button',{name:'播放 / 续播',exact:true}).click();
 await expect(page.locator('#state')).toContainText('playing');
 await expect(page.locator('#state')).toContainText('ended',{timeout:10000});
 await page.screenshot({path:'output/example-vanilla.png',fullPage:true});
 expect(errors).toEqual([]);
});
test('React chat example keeps one active message, including duplicate URLs',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/examples/react/');
 const a=page.getByRole('button',{name:/语音 A/});const b=page.getByRole('button',{name:/语音 B/});
 await a.click();await expect(a).toContainText('播放中');
 await a.click();await expect(a).toContainText('播放 / 续播');
 await a.click();await expect(a).toContainText('播放中');
 await expect.poll(()=>page.evaluate(async()=>{const {voicePlayer}=await import('/examples/react/usePlayVoice.ts');return voicePlayer.getSnapshot().currentTime;})).toBeGreaterThan(.5);
 await page.evaluate(async()=>{const {voicePlayer}=await import('/examples/react/usePlayVoice.ts');window.previousVoicePlayer=voicePlayer;});
 await b.click();await expect(b).toContainText('播放中');await expect(a).toContainText('播放 / 续播');
 expect(await page.evaluate(()=>previousVoicePlayer.getSnapshot().status)).toBe('disposed');
 expect(await page.evaluate(async()=>{const {voicePlayer}=await import('/examples/react/usePlayVoice.ts');return voicePlayer.getSnapshot().currentTime;})).toBeLessThan(.5);
 await page.screenshot({path:'output/example-react.png',fullPage:true});
 expect(errors).toEqual([]);
});
