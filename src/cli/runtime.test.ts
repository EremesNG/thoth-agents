import { describe, expect, test } from 'vitest';
import {
  detectRuntimeContext,
  isInteractiveRuntime,
  type RuntimeContext,
} from './runtime';

const interactive: RuntimeContext = {
  stdinIsTTY: true,
  stdoutIsTTY: true,
  env: {},
};

describe('runtime TTY detection', () => {
  test('treats TTY stdin and stdout as interactive', () => {
    expect(isInteractiveRuntime(interactive)).toBe(true);
  });

  test.each([
    ['non-TTY stdin', { ...interactive, stdinIsTTY: false }],
    ['non-TTY stdout', { ...interactive, stdoutIsTTY: false }],
    ['CI', { ...interactive, env: { CI: 'true' } }],
    [
      'redirected automation',
      { ...interactive, env: { GITHUB_ACTIONS: 'true' } },
    ],
    ['dumb terminal', { ...interactive, env: { TERM: 'dumb' } }],
  ])('treats %s as non-interactive', (_name, context) => {
    expect(isInteractiveRuntime(context)).toBe(false);
  });

  test('detects runtime context without mutating process streams', () => {
    const processLike = {
      stdin: { isTTY: true },
      stdout: { isTTY: false },
      stderr: { isTTY: true },
      env: { TERM: 'xterm-256color' },
    };

    expect(detectRuntimeContext(processLike)).toEqual({
      stdinIsTTY: true,
      stdoutIsTTY: false,
      stderrIsTTY: true,
      env: { TERM: 'xterm-256color' },
    });
  });
});
