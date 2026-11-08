import { expect, test, vi } from 'vitest';

vi.mock('../../utils/subprocess', () => ({ spawn: vi.fn() }));

import { spawn } from '../../utils/subprocess';
import { runSg } from './cli';

test('cancellation kills an active AST process and rejects without returning output', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let finish: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => {
    finish = resolve;
  });
  const kill = vi.fn(() => {
    finish(1);
  });
  vi.mocked(spawn).mockReturnValue({
    stdout: new ReadableStream({
      start(stream) {
        controller.signal.addEventListener('abort', () => stream.close(), {
          once: true,
        });
      },
    }),
    stderr: new ReadableStream({
      start(stream) {
        stream.close();
      },
    }),
    exited,
    kill,
  } as unknown as ReturnType<typeof spawn>);
  const result = runSg({
    pattern: 'foo',
    lang: 'typescript',
    signal: controller.signal,
  });
  controller.abort();
  try {
    await vi.waitFor(() => expect(kill).toHaveBeenCalledOnce(), {
      timeout: 50,
    });
    await expect(result).rejects.toThrow();
  } finally {
    finish(1);
    vi.clearAllTimers();
    vi.useRealTimers();
    await result.catch(() => {});
  }
});
