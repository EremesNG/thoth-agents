import { describe, expect, test } from 'vitest';
import { getNpxCommand } from './npx-command';

describe('npx command invocation', () => {
  test('passes the complete npx command string to cmd.exe on Windows', () => {
    const commandShell = 'C:\\Windows\\System32\\cmd.exe';

    expect(
      getNpxCommand(['-y', 'thoth-mem@latest', 'setup', 'codex', '--json'], {
        platform: 'win32',
        commandShell,
      }),
    ).toEqual({
      command: commandShell,
      args: ['/d', '/s', '/c', 'npx -y thoth-mem@latest setup codex --json'],
    });
  });
});
