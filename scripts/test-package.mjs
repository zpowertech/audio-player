import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './rust.mjs';
function run(command,args,cwd=root,env=process.env,capture=false){
 const r=spawnSync(command,args,{cwd,env,encoding:'utf8',stdio:capture?'pipe':'inherit'});
 if(r.error)throw r.error;if(r.status!==0)throw Error(`${command} failed: ${r.stderr??r.status}`);return r.stdout;
}
const folder=resolve(root,'.test-package');
await rm(folder,{recursive:true,force:true});await mkdir(folder,{recursive:true});
run('npm',['pack','--pack-destination',folder,'--cache',resolve(folder,'npm-cache')]);
const files=(await readdir(folder)).filter(n=>n.endsWith('.tgz'));assert.equal(files.length,1);
const tarball=resolve(folder,files[0]);
const manifest=run('tar',['-tzf',tarball],root,process.env,true).trim().split('\n');
assert(manifest.every(p=>/^package\/(dist\/|package.json$|README.md$|LICENSE$)/.test(p)));
for(const p of ['dist/index.js','dist/index.d.ts','dist/silk/wasm-inline.js','LICENSE','README.md'])assert(manifest.includes('package/'+p));
for(const bundler of ['vite','webpack']){
 const app=resolve(folder,bundler);
 await cp(resolve(root,`test/package/${bundler}`),app,{recursive:true});
 for(const file of ['main.js','types.ts'])await cp(resolve(root,'test/package',file),resolve(app,file));
 await mkdir(resolve(app,'public'),{recursive:true});
 await cp(resolve(root,'test/fixtures'),resolve(app,'public/fixtures'),{recursive:true});
 await writeFile(resolve(app,'package.json'),JSON.stringify({name:`audio-${bundler}-consumer`,private:true,type:'module'}));
 const env={...process.env,RUSTUP_TOOLCHAIN:'must-not-build-on-install',npm_config_registry:'http://127.0.0.1:9',npm_config_audit:'false'};
 run('npm',['install',tarball,'--offline','--no-fund','--cache',resolve(folder,'npm-cache')],app,env);
 const pkg=JSON.parse(await readFile(resolve(app,'node_modules/@zpowertech/audio-player/package.json'),'utf8'));
 assert.deepEqual(Object.keys(pkg.exports),['.']);assert.equal(Object.keys(pkg.dependencies??{}).length,0);
 for(const hook of ['preinstall','install','postinstall','prepare'])assert.equal(pkg.scripts[hook],undefined);
 run(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'types.ts','--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2022,DOM','--types','node'],app);
 run(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  globalThis.fetch=()=>{throw Error('unexpected fetch');};
  globalThis.Audio=globalThis.AudioContext=class{constructor(){throw Error('unexpected audio');}};
  WebAssembly.compile=()=>{throw Error('unexpected WASM');};
  const sdk=await import('@zpowertech/audio-player');assert.deepEqual(Object.keys(sdk),['createAudioPlayer']);
  const p=sdk.createAudioPlayer();assert.equal(p.getSnapshot().status,'idle');await p.dispose();
  await assert.rejects(import('@zpowertech/audio-player/dist/silk/core.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
 `],app,env);
 if(bundler==='vite')run(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'build'],app);
 else{run(process.execPath,[resolve(root,'node_modules/webpack-cli/bin/cli.js'),'--mode','production'],app);await cp(resolve(app,'public'),resolve(app,'build'),{recursive:true});}
}
console.log('Installed tarball validated:',tarball);
