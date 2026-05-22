import { describe, expect, test } from 'vitest';
import { parseCliArgs } from './index';

describe('CLI harness surface', () => {
  test('defaults to the existing OpenCode install command', () => {
    expect(parseCliArgs([])).toEqual({
      command: 'install',
      installArgs: { tui: true, agent: 'opencode' },
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
});
