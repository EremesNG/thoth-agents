import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const result = spawnSync(
  process.execPath,
  [
    join(root, 'dist/cli/index.js'),
    'install',
    ...process.argv.slice(2),
    '--agent=pi',
    `--local-package-root=${root}`,
  ],
  { cwd: root, stdio: 'inherit' },
);

if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
