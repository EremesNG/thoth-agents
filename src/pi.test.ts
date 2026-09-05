import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { PI_ROOT_END, PI_ROOT_START } from './harness/writers/pi-agent';
import piExtension from './pi';

describe('native Pi extension', () => {
  test('registers one bounded adaptive-root block per turn without import side effects', async () => {
    const handlers = new Map<string, (event: unknown) => unknown>();
    const api = {
      on: vi.fn((name: string, handler: (event: unknown) => unknown) =>
        handlers.set(name, handler),
      ),
    };
    piExtension(api);
    expect([...handlers.keys()]).toEqual([
      'before_agent_start',
      'session_start',
    ]);
    const injectRoot = handlers.get('before_agent_start');
    const first = (await injectRoot?.({ systemPrompt: 'host prompt' })) as {
      systemPrompt: string;
    };
    const second = (await injectRoot?.({
      systemPrompt: first.systemPrompt,
    })) as {
      systemPrompt: string;
    };
    expect(
      second.systemPrompt.match(new RegExp(PI_ROOT_START, 'g')),
    ).toHaveLength(1);
    expect(
      second.systemPrompt.match(new RegExp(PI_ROOT_END, 'g')),
    ).toHaveLength(1);
    expect(second.systemPrompt).toContain('host prompt');
  });
  test('session start converges package specialists without rejecting the session', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-extension-'));
    try {
      const packageRoot = join(root, 'package');
      mkdirSync(join(packageRoot, 'pi', 'agents'), { recursive: true });
      for (const role of [
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'quick',
        'deep',
      ])
        writeFileSync(
          join(packageRoot, 'pi', 'agents', `${role}.md`),
          `---\nname: ${role}\nmanaged-by: thoth-agents\n---\n`,
        );
      const handlers = new Map<string, (event: unknown) => unknown>();
      piExtension(
        { on: (name, handler) => handlers.set(name, handler) },
        { packageRoot, piRoot: join(root, 'home') },
      );
      await expect(
        Promise.resolve(handlers.get('session_start')?.({})),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
