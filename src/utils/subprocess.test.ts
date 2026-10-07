import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

import * as childProcess from 'node:child_process';
import { spawn, spawnSync } from './subprocess';

beforeEach(() => {
  vi.mocked(childProcess.spawn).mockReturnValue(
    Object.assign(new EventEmitter(), {
      stdin: null,
      stdout: null,
      stderr: null,
      exitCode: null,
      kill: vi.fn(),
    }) as unknown as childProcess.ChildProcessWithoutNullStreams,
  );
  vi.mocked(childProcess.spawnSync).mockReturnValue({
    status: 0,
  } as childProcess.SpawnSyncReturns<Buffer>);
});

describe.each([
  { name: 'spawn', launch: spawn, native: childProcess.spawn },
  { name: 'spawnSync', launch: spawnSync, native: childProcess.spawnSync },
])('$name console visibility', ({ launch, native }) => {
  test('hides child consoles by default', () => {
    launch(['node', '--version']);

    expect(native).toHaveBeenLastCalledWith(
      'node',
      ['--version'],
      expect.objectContaining({ windowsHide: true }),
    );
  });

  test('lets callers opt into a visible child console', () => {
    launch(['node', '--version'], { windowsHide: false });

    expect(native).toHaveBeenLastCalledWith(
      'node',
      ['--version'],
      expect.objectContaining({ windowsHide: false }),
    );
  });
});
