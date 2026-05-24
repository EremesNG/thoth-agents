import { describe, expect, test } from 'vitest';
import { parseCliArgs } from './index';

describe('CLI harness surface', () => {
  const interactiveContext = {
    stdinIsTTY: true,
    stdoutIsTTY: true,
    env: {},
  };

  test('routes zero args to the TUI in an interactive TTY', () => {
    expect(parseCliArgs([], interactiveContext)).toEqual({
      command: 'tui',
    });
  });

  test.each([
    ['non-TTY stdin', { ...interactiveContext, stdinIsTTY: false }],
    ['non-TTY stdout', { ...interactiveContext, stdoutIsTTY: false }],
    ['CI', { ...interactiveContext, env: { CI: 'true' } }],
    [
      'redirected automation',
      { ...interactiveContext, env: { TF_BUILD: 'true' } },
    ],
    ['dumb terminal', { ...interactiveContext, env: { TERM: 'dumb' } }],
  ])('keeps zero-arg %s automation on legacy install', (_name, context) => {
    expect(parseCliArgs([], context)).toEqual({
      command: 'install',
      installArgs: { tui: false, agent: 'opencode' },
    });
  });

  test('parses explicit install agents and rejects unsupported values', () => {
    expect(parseCliArgs(['install', '--agent=opencode'])).toEqual({
      command: 'install',
      installArgs: { tui: true, agent: 'opencode' },
    });
    expect(parseCliArgs(['install', '--agent=codex', '--dry-run'])).toEqual({
      command: 'install',
      installArgs: { tui: true, agent: 'codex', dryRun: true },
    });
    expect(parseCliArgs(['install', '--agent=claude'])).toEqual({
      command: 'error',
      message:
        'Unsupported install agent: claude. Supported agents: opencode, codex.',
    });
  });

  test('keeps explicit install flags compatible', () => {
    expect(
      parseCliArgs([
        'install',
        '--agent=opencode',
        '--dry-run',
        '--no-tui',
        '--reset',
        '--tmux=yes',
        '--skills=no',
      ]),
    ).toEqual({
      command: 'install',
      installArgs: {
        tui: false,
        agent: 'opencode',
        dryRun: true,
        reset: true,
        tmux: 'yes',
        skills: 'no',
      },
    });
  });

  test('requires explicit Codex selection for generation', () => {
    expect(parseCliArgs(['generate', '--harness=codex', '--dry-run'])).toEqual({
      command: 'generate',
      generateArgs: {
        harness: 'codex',
        dryRun: true,
      },
    });
  });

  test('rejects implicit or unsupported generate harnesses', () => {
    expect(parseCliArgs(['generate'])).toEqual({
      command: 'error',
      message: 'Codex generation requires --harness=codex.',
    });
    expect(parseCliArgs(['generate', '--harness=claude'])).toEqual({
      command: 'error',
      message: 'Unsupported generate harness: claude.',
    });
  });

  test('recognizes explicit phase-one operation commands', () => {
    for (const command of [
      'status',
      'list',
      'update',
      'sync',
      'model',
    ] as const) {
      expect(parseCliArgs([command])).toEqual({
        command,
        operationArgs: { roles: [] },
      });
    }
  });

  test('preserves unknown command diagnostics', () => {
    expect(parseCliArgs(['bogus'])).toEqual({
      command: 'error',
      message: 'Unknown command: bogus',
    });
  });
});
