import { describe, expect, test } from 'vitest';
import { getNpxCommand } from './npx-command';

describe('npx command invocation', () => {
  test('passes the complete npx command string to cmd.exe on Windows', () => {
    const commandShell = 'C:\\Windows\\System32\\cmd.exe';

    expect(
      getNpxCommand(['skills', 'add', 'example/skills', '--yes'], {
        platform: 'win32',
        commandShell,
      }),
    ).toEqual({
      command: commandShell,
      args: ['/d', '/s', '/c', 'npx skills add example/skills --yes'],
    });
  });
});
