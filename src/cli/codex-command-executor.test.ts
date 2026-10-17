import { spawnSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { defaultCommandExecutor } from './codex-plugin-install';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

it('retains spawn errors with empty stderr and never treats null status as success', () => {
  vi.mocked(spawnSync).mockReturnValue({
    status: null,
    stdout: 'partial JSON',
    stderr: '',
    error: new Error('spawnSync codex ENOBUFS'),
  } as ReturnType<typeof spawnSync>);
  expect(
    defaultCommandExecutor('codex', ['plugin', 'list', '--json'], {
      cwd: process.cwd(),
    }),
  ).toEqual({
    exitCode: 1,
    stdout: 'partial JSON',
    stderr: 'spawnSync codex ENOBUFS',
  });
  expect(spawnSync).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Array),
    expect.objectContaining({ maxBuffer: 16 * 1024 * 1024 }),
  );
  vi.mocked(spawnSync).mockReturnValue({
    status: null,
    stdout: '',
    stderr: '',
  } as ReturnType<typeof spawnSync>);
  expect(
    defaultCommandExecutor('codex', [], { cwd: process.cwd() }).exitCode,
  ).toBe(1);
});
