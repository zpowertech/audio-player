import { test, expect } from '@playwright/test';
let sequence = 0;
async function play(page, url, wait = true) {
  const id = String(++sequence);
  await page.evaluate(({id, url}) => {
    window.run = () => {
      window.player.play(url).then(() => { window.lastStartedSnapshot = player.getSnapshot(); window.results[id] = {ok:true}; }, e => window.results[id] = {name:e.name,code:e.code,message:e.message});
    };
  }, {id, url});
  await page.locator('#run').click();
  if (!wait) return id;
  await expect.poll(() => page.evaluate(id=>window.results[id] ?? null,id)).not.toBeNull();
  return page.evaluate(id=>window.results[id],id);
}
const state = page => page.evaluate(() => { const s = window.player.getSnapshot(); return {...s, error:s.error ? {code:s.error.code,message:s.error.message}:null}; });
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    window.contexts=[]; window.compiles=0;
    const Base=window.AudioContext;
    window.AudioContext=class extends Base { constructor(...args){super(...args);window.contexts.push(this);} };
    const compile=WebAssembly.compile;
    WebAssembly.compile=(...args)=>{window.compiles++;return compile(...args);};
  });
  await page.goto('/'); await expect(page.locator('#ready')).toHaveText('ready');
});
test.afterEach(async({page})=>{
  await page.evaluate(()=>window.player?.dispose());
});
test('inert import and factory; native playback never loads WASM',async({page})=>{
  expect(await page.evaluate(()=>({exports:Object.keys(window.sdk),contexts:window.contexts.length,compiles:window.compiles,same:player.getSnapshot()===player.getSnapshot()}))).toEqual({exports:['createAudioPlayer'],contexts:0,compiles:0,same:true});
  expect(await play(page,'/test/fixtures/tone.wav')).toEqual({ok:true});
  await expect.poll(async()=>(await state(page)).status).toBe('ended');
  expect(await page.evaluate(()=>window.compiles)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>window.contexts.every(c=>c.state==='closed'))).toBe(true);
});
test('first play requires a URL and invalid calls leave the player idle',async({page})=>{
  expect(await play(page)).toMatchObject({code:'NO_SOURCE'});
  for(const input of [null,42,{}, {url:'/test/fixtures/tone.wav'},'', ' ', 'file:///voice.silk', 'http://[']) {
    expect(await play(page,input)).toMatchObject({code:'INVALID_ARGUMENT'});
    expect(await state(page)).toMatchObject({url:null,status:'idle',error:null});
  }
});
for(const [label, url] of [['native','/test/fixtures/voice.wav'],['silk','/test/fixtures/test.slk']]) {
  test(`${label}: pause, resume, ended and replay`,async({page})=>{
    expect(await play(page,url)).toEqual({ok:true});
    await expect.poll(async()=>(await state(page)).currentTime).toBeGreaterThan(.3);
    await page.evaluate(()=>player.pause());
    await page.waitForTimeout(80); const paused=await state(page);
    expect(paused.status).toBe('paused');
    await page.waitForTimeout(300); expect((await state(page)).currentTime).toBeCloseTo(paused.currentTime,1);
    expect(await play(page)).toEqual({ok:true});
    expect((await state(page)).currentTime).toBeGreaterThanOrEqual(paused.currentTime-.05);
    await expect.poll(async()=>(await state(page)).status,{timeout:10000}).toBe('ended');
    expect((await state(page)).duration).toBeCloseTo(5,2);
    expect(await play(page)).toEqual({ok:true});
    expect(await page.evaluate(()=>window.lastStartedSnapshot.currentTime)).toBeLessThan(.5);
  });
  test(`${label}: same URL keeps playback and resumes a paused source`,async({page})=>{
    expect(await play(page,url)).toEqual({ok:true});
    await expect.poll(async()=>(await state(page)).currentTime).toBeGreaterThan(.5);
    const before=await state(page);
    expect(await play(page,url)).toEqual({ok:true});
    expect((await state(page)).currentTime).toBeGreaterThanOrEqual(before.currentTime);
    await page.evaluate(()=>player.pause());
    await page.waitForTimeout(80);const paused=await state(page);
    const absoluteURL=new URL(url,page.url()).href;
    expect(await play(page,absoluteURL)).toEqual({ok:true});
    expect((await state(page)).currentTime).toBeGreaterThanOrEqual(paused.currentTime-.05);
  });
}
test('SILK starts before HTTP EOF, underflow freezes the media clock, then resumes',async({page})=>{
  const id='stream-'+Date.now();
  expect(await play(page,`/stream.silk?id=${id}&delay=20&batch=5&gap=1&marker=1`)).toEqual({ok:true});
  const network=await page.evaluate(id=>fetch('/stats?id='+id).then(r=>r.json()),id);
  expect(network.done).toBe(false);
  await expect.poll(async()=>(await state(page)).status).toBe('buffering');
  const time=(await state(page)).currentTime;
  expect(time).toBeCloseTo(.5, 3);
  await page.waitForTimeout(150); expect((await state(page)).currentTime-time).toBeLessThan(.05);
  await expect.poll(async()=>(await state(page)).status).toBe('playing');
  await expect.poll(async()=>(await state(page)).status,{timeout:10000}).toBe('ended');
  expect((await state(page)).duration).toBeCloseTo(5,3);
});
test('pause during loading prevents late playback and resume keeps current URL',async({page})=>{
  const id=await play(page,'/stream.silk?initial=600',false);
  await page.evaluate(()=>player.pause());
  await page.waitForTimeout(750);
  expect((await state(page)).status).toBe('paused');
  expect(await page.evaluate(id=>results[id],id)).toMatchObject({name:'AbortError'});
  expect(await play(page)).toEqual({ok:true});
});
test('latest operation wins; A to B to A starts from zero',async({page})=>{
  const first=await play(page,'/stream.silk?initial=800',false);
  expect(await play(page,'/test/fixtures/voice.wav')).toEqual({ok:true});
  expect(await page.evaluate(()=>window.lastStartedSnapshot.currentTime)).toBeLessThan(.5);
  await page.waitForTimeout(1000);
  expect((await state(page)).url).toContain('voice.wav'); expect((await state(page)).status).toBe('playing');
  expect(await page.evaluate(id=>results[id],first)).toMatchObject({name:'AbortError'});
  expect(await play(page,'/stream.silk?initial=800')).toEqual({ok:true});
  expect(await page.evaluate(()=>window.lastStartedSnapshot.currentTime)).toBeLessThan(.5);
});
test('opaque SILK URL falls back from native; replay reuses a complete compressed cache',async({page})=>{
  const id='opaque-'+Date.now();
  expect(await play(page,`/opaque?id=${id}&delay=0&batch=250`)).toEqual({ok:true});
  await expect.poll(async()=>(await state(page)).status,{timeout:10000}).toBe('ended');
  const before=await page.evaluate(id=>fetch('/stats?id='+id).then(r=>r.json()),id);
  expect(await play(page)).toEqual({ok:true});
  expect(await page.evaluate(()=>window.lastStartedSnapshot.currentTime)).toBeLessThan(.5);
  const after=await page.evaluate(id=>fetch('/stats?id='+id).then(r=>r.json()),id);
  expect(after.requests).toBe(before.requests);
});
test('invalid requests do not replace playing audio',async({page})=>{
  expect(await play(page,'/test/fixtures/voice.wav')).toEqual({ok:true});
  expect(await page.evaluate(()=>player.play({url:'/test/fixtures/test.slk'}).catch(e=>e.code))).toBe('INVALID_ARGUMENT');
  expect(await page.evaluate(()=>player.play('').catch(e=>e.code))).toBe('INVALID_ARGUMENT');
  expect((await state(page)).status).toBe('playing');
});
test('truncated stream errors; subsequent native audio recovers',async({page})=>{
  const result=await play(page,'/broken.silk');
  expect(result.ok || result.code==='DECODE').toBeTruthy();
  await expect.poll(async()=>(await state(page)).status).toBe('error');
  expect((await state(page)).error.code).toBe('DECODE');
  expect(await play(page,'/test/fixtures/tone.wav')).toEqual({ok:true});
});
test('HTTP failure has a stable code and retry succeeds',async({page})=>{
  expect(await play(page,'/missing.silk')).toMatchObject({code:'NETWORK'});
  expect(await play(page,'/test/fixtures/test.slk')).toEqual({ok:true});
});
test('native cross-origin URL works without fetch CORS; SILK reports CORS failure',async({page})=>{
  expect(await play(page,'http://localhost:4280/test/fixtures/tone.wav?cors=0')).toEqual({ok:true});
  expect(await play(page,'http://localhost:4280/stream.silk?cors=0')).toMatchObject({code:'NETWORK'});
});
test('dispose stops every owned context and cancels pending play',async({page})=>{
  const id=await play(page,'/stream.silk?initial=1000',false);
  await page.evaluate(async()=>{await player.dispose();await player.dispose();player.pause();});
  expect((await state(page)).status).toBe('disposed');
  expect(await page.evaluate(id=>results[id],id)).toMatchObject({name:'AbortError'});
  expect(await page.evaluate(()=>contexts.every(c=>c.state==='closed'))).toBe(true);
  expect(await page.evaluate(()=>player.play().catch(e=>e.code))).toBe('DISPOSED');
});
test('blob URLs and data URLs work without URL ownership transfer',async({page})=>{
  const url=await page.evaluate(async()=>URL.createObjectURL(await(await fetch('/test/fixtures/test.slk')).blob()));
  expect(await play(page,url)).toEqual({ok:true});
  await expect.poll(async()=>(await state(page)).status,{timeout:10000}).toBe('ended');
  await page.evaluate(()=>player.dispose());
  expect(await page.evaluate(async url=>(await fetch(url)).ok,url)).toBe(true);
  await page.evaluate(url=>URL.revokeObjectURL(url),url);
  const data=await page.evaluate(async()=>{window.player=sdk.createAudioPlayer();const bytes=new Uint8Array(await(await fetch('/test/fixtures/test.slk')).arrayBuffer());return 'data:application/octet-stream;base64,'+btoa(String.fromCharCode(...bytes));});
  expect(await play(page,data)).toEqual({ok:true});
});
for (const extension of ['mp3','m4a','aac','flac','ogg','opus','webm','alac.m4a']) {
  test(`codec fixture ${extension}: actual native decode or explicit unsupported`,async({page},testInfo)=>{
    const result=await play(page,`/test/fixtures/tone.${extension}`);
    await testInfo.attach('codec-result',{body:JSON.stringify({extension,result,userAgent:await page.evaluate(()=>navigator.userAgent)}),contentType:'application/json'});
    if (extension==='mp3') expect(result).toEqual({ok:true});
    else if(!result.ok) {expect(result.code).toBe('NOT_SUPPORTED');return;}
    await expect.poll(async()=>(await state(page)).status).toBe('ended');
    expect((await state(page)).duration).toBeGreaterThan(.9);
  });
}
test('invalid call while loading does not cancel the valid pending request',async({page})=>{
  const id=await play(page,'/stream.silk?initial=500',false);
  expect(await page.evaluate(()=>player.play('').catch(e=>e.code))).toBe('INVALID_ARGUMENT');
  await expect.poll(()=>page.evaluate(id=>results[id],id)).toEqual({ok:true});
});
test('repeated pending play shares promise; rapid pause and resume follows last intent',async({page})=>{
  await page.evaluate(()=>{window.run=()=>{
    const url='/stream.silk?initial=300';
    const a=player.play(url);const b=player.play();const c=player.play(url);window.shared=a===b&&b===c;
    a.catch(()=>{});player.pause();window.results.rapid={pending:true};
    player.play().then(()=>window.results.rapid={ok:true},e=>window.results.rapid={error:e.message});
  };});
  await page.locator('#run').click();
  expect(await page.evaluate(()=>window.shared)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>results.rapid)).toEqual({ok:true});
  expect((await state(page)).status).toBe('playing');
});
test('subscriber can pause synchronously on loading without late playback',async({page})=>{
  await page.evaluate(()=>{let once=false;player.subscribe(()=>{if(!once&&player.getSnapshot().status==='loading'){once=true;player.pause();}});});
  expect(await play(page,'/test/fixtures/test.slk')).toMatchObject({name:'AbortError'});
  await page.waitForTimeout(300);expect((await state(page)).status).toBe('paused');
  expect(await play(page)).toEqual({ok:true});
});
test('SILK outputs exact reference samples and WASM failure can retry',async({page})=>{
  await page.evaluate(()=>{
    window.savedCompile=WebAssembly.compile;WebAssembly.compile=async()=>{throw Error('injected initialization failure');};
  });
  expect(await play(page,'/test/fixtures/test.slk')).toMatchObject({code:'WASM_INIT'});
  await page.evaluate(()=>{
    WebAssembly.compile=window.savedCompile;window.outputChunks=[];
    const make=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){const node=make.call(this);const start=node.start;node.start=function(...args){window.outputChunks.push(Array.from(node.buffer.getChannelData(0)));return start.apply(node,args);};return node;};
  });
  expect(await play(page)).toEqual({ok:true});
  expect(await page.evaluate(async()=>{
    const bytes=await(await fetch('/test/fixtures/test_16000.pcm')).arrayBuffer();const reference=new Int16Array(bytes);
    return outputChunks[0].length>0 && outputChunks[0].every((value,i)=>value===reference[i]/32768);
  })).toBe(true);
});
test('native autoplay refusal retains cause and does not try a SILK fetch',async({page})=>{
  await page.evaluate(()=>{
    window.savedPlay=HTMLMediaElement.prototype.play;window.savedFetch=fetch;window.audioFetches=0;
    window.fetch=(...args)=>{audioFetches++;return savedFetch(...args);};
    HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Click required','NotAllowedError'));
  });
  expect(await play(page,'/test/fixtures/tone.wav')).toMatchObject({code:'AUTOPLAY_BLOCKED'});
  expect(await page.evaluate(()=>({calls:audioFetches,cause:player.getSnapshot().error.cause.name}))).toEqual({calls:0,cause:'NotAllowedError'});
  await page.evaluate(()=>{HTMLMediaElement.prototype.play=savedPlay;window.fetch=savedFetch;});
  expect(await play(page)).toEqual({ok:true});
});
