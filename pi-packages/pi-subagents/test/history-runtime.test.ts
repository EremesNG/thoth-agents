import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('history runtime compatibility', () => {
  it('opens the history store under Bun using the runtime-supported sqlite module', () => {
    const bunCheck = spawnSync('bun', ['--version'], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (bunCheck.status !== 0) return;

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
      const output = execFileSync('bun', ['-e', script], {
        windowsHide: true,
        cwd: process.cwd(),
        env: { ...process.env, PI_SUBAGENTS_HISTORY_DB_PATH: dbPath },
        encoding: 'utf8',
      });
      expect(output).toContain('ok');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
