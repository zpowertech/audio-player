import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function cargo(args) {
  const result = spawnSync('cargo', args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CARGO_HOME: process.env.CARGO_HOME ?? resolve(root, '.cargo-home') },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`cargo exited with status ${result.status}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cargo(process.argv.slice(2));
}
