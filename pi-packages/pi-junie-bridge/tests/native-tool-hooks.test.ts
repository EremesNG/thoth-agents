import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  buildNativeToolHooks,
  writeNativeToolHooks,
} from '../src/native-tool-hooks.js';

test('hook blocks only native execution and mutation and prints valid block JSON', () => {
  for (const platform of ['win32', 'linux'] as const) {
    const entry = buildNativeToolHooks(platform).hooks.PreToolUse[0];
    const matcher = new RegExp(entry.matcher);
    for (const name of [
      'powershell',
      'Bash',
      'apply_patch',
      'Edit',
      'Write',
      'POWERSHELL',
      'bAsH',
    ])
      expect(matcher.test(name)).toBe(true);
    for (const name of [
      'open',
      'grep_search',
      'glob_search',
      'submit',
      'mcp_pi_bash',
      'BashExtra',
    ])
      expect(matcher.test(name)).toBe(false);
    expect(entry.hooks[0]).toMatchObject({
      type: 'command',
      blockOnError: true,
    });
    expect(entry.hooks[0]).not.toHaveProperty('async', true);
    if ((process.platform === 'win32') === (platform === 'win32')) {
      const shell =
        platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'sh';
      const output = spawnSync(
        shell,
        [platform === 'win32' ? '/c' : '-c', entry.hooks[0].command],
        { encoding: 'utf8', windowsVerbatimArguments: platform === 'win32' },
      );
      expect(output.status).toBe(0);
      const result = JSON.parse(output.stdout);
      expect(result).toEqual({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          permissionDecisionReason:
            'Use pi/bash for commands and pi/edit or pi/write for file changes.',
        },
      });
    }
    expect(entry.hooks[0]).not.toHaveProperty('strictJsonOutput');
  }
});

test('writer atomically reuses a static config in the agent directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-hooks-'));
  try {
    const path = writeNativeToolHooks(dir);
    expect(path).toBe(join(dir, 'junie-bridge', 'native-tool-hooks.json'));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(
      buildNativeToolHooks(process.platform),
    );
    expect(writeNativeToolHooks(dir)).toBe(path);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(
      buildNativeToolHooks(process.platform),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
