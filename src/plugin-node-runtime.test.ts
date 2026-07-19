import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { SUPPORTED_HARNESSES } from './harness/registry';

const pluginSourcePath = fileURLToPath(new URL('./index.ts', import.meta.url));

describe('plugin runtime compatibility', () => {
  test('does not compose a bundled provider lifecycle into the plugin runtime', () => {
    const source = readFileSync(pluginSourcePath, 'utf8');

    expect(source).not.toContain('createThothMemHook');
    expect(source).not.toContain('thothMemHook');
    expect(source).not.toContain('config.thoth');
    expect(source).not.toContain('including thoth_mem');
  });

  test('keeps the runtime lean and exactly three harness registrations', () => {
    const source = readFileSync(pluginSourcePath, 'utf8');

    expect(source).not.toContain('createPhaseReminderHook');
    expect(source).not.toContain('createPostReadNudgeHook');
    expect(source).toContain('createJsonErrorRecoveryHook');
    expect(source).toContain('createDelegateTaskRetryHook');
    expect([...SUPPORTED_HARNESSES].sort()).toEqual([
      'claude',
      'codex',
      'opencode',
    ]);
  });

  test.skipIf(!existsSync('dist/index.js'))(
    'built plugin does not require a host global Bun object',
    () => {
      const source = readFileSync('dist/index.js', 'utf8');

      expect(source).not.toContain('globalThis.Bun');
      expect(source).not.toMatch(/{[^}]*spawn[^}]*}\s*=\s*globalThis\.Bun/);
      expect(source).not.toContain('import.meta.require');
    },
  );
});
