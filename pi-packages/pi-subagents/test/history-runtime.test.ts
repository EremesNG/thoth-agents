import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
// This cross-runtime test has taken 12.6s under Windows suite contention.
// Bound the child below the integration budget so a stalled Bun is killed
// before the test deadline and temporary database cleanup.
const BUN_PROCESS_TIMEOUT_MS = 20_000;
const BUN_TEST_TIMEOUT_MS = 30_000;

describe('history runtime compatibility', () => {
  it(
    'opens the history store under Bun using the runtime-supported sqlite module',
    async ({ skip }) => {
      const tmp = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pi-subagents-bun-history-'),
      );
      const dbPath = path.join(tmp, 'subagents-history.sqlite');
      const script = [
        `import { SubagentHistoryStore } from ${JSON.stringify(fileURLToPath(new URL('../src/history.ts', import.meta.url)))};`,
        'const store = new SubagentHistoryStore();',
        `store.listTasks(${JSON.stringify(tmp)});`,
        'store.close();',
        "console.log('ok');",
      ].join('\n');

      try {
        const { stdout } = await execFileAsync('bun', ['-e', script], {
          windowsHide: true,
          cwd: process.cwd(),
          env: { ...process.env, PI_SUBAGENTS_HISTORY_DB_PATH: dbPath },
          encoding: 'utf8',
          timeout: BUN_PROCESS_TIMEOUT_MS,
        });
        expect(stdout).toContain('ok');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          if (process.env.CI)
            throw new Error(
              'Bun is required in CI to run the history runtime compatibility test.',
              { cause: error },
            );
          skip('Bun is not installed.');
        }
        throw error;
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
    BUN_TEST_TIMEOUT_MS,
  );
});
