import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cargo, root } from './rust.mjs';

const debug = process.argv.includes('--debug');
cargo(['build', '-p', 'silk-core-wasm', '--target', 'wasm32-unknown-unknown', '--locked', ...(debug ? [] : ['--release'])]);
const target = resolve(root, process.env.CARGO_TARGET_DIR ?? 'target');
const wasm = await readFile(resolve(target, `wasm32-unknown-unknown/${debug ? 'debug' : 'release'}/silk_core_wasm.wasm`));
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`TypeScript exited with status ${result.status}`);
await writeFile(resolve(dist, 'silk_core.wasm'), wasm);
await writeFile(resolve(dist, 'silk/wasm-inline.js'), `// Generated from the same build as silk_core.wasm.\nexport default ${JSON.stringify(wasm.toString('base64'))};\n`);
console.log(`Built dist with ${wasm.length} bytes of WASM (${debug ? 'debug' : 'release'}).`);
