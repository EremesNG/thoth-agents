import type { SessionRetry } from '@opencode/plugin/promise/session';
import { describe, expect, it, vi } from 'vitest';
import { ForegroundFallbackManager } from './index';

function retry(model = 'p/a', agent = 'worker', sessionID = 's'): SessionRetry {
  const [providerID, id] = model.split('/');
  return {
    sessionID,
    agent,
    model: { providerID, id },
    error: { type: 'provider.rate-limit', message: 'limited' },
    attempt: 1,
    decision: { retry: false },
  } as SessionRetry;
}

describe('v2 retry fallback', () => {
  it('never repeats models, stops at exhaustion, and isolates sessions and agents', async () => {
    const switchModel = vi.fn(async () => {});
    const manager = new ForegroundFallbackManager(
      { switchModel },
      { worker: ['p/a', 'p/b', 'p/b', 'p/c'], explorer: ['p/a', 'p/b'] },
    );
    for (const model of ['p/a', 'p/b', 'p/c', 'p/a'])
      await manager.retry(retry(model));
    expect(switchModel.mock.calls.map(([call]) => call.model.id)).toEqual([
      'b',
      'c',
    ]);
    const exhausted = retry('p/c');
    exhausted.decision = { retry: true, delay: 123 };
    await manager.retry(exhausted);
    expect(exhausted.decision).toEqual({ retry: true, delay: 123 });
    await manager.retry(retry('p/a', 'explorer'));
    await manager.retry(retry('p/a', 'worker', 'other'));
    expect(switchModel).toHaveBeenCalledTimes(4);
  });

  it.each([
    'provider.auth',
    'provider.content-filter',
    'provider.invalid-request',
    'permission.rejected',
    'tool.execution',
    'unknown',
  ])('does not change decisions for %s', async (type) => {
    const switchModel = vi.fn();
    const manager = new ForegroundFallbackManager(
      { switchModel },
      { worker: ['p/a', 'p/b'] },
    );
    const input = retry();
    input.error = { type, message: 'rate limit 429' };
    await manager.retry(input);
    expect(switchModel).not.toHaveBeenCalled();
    expect(input.decision).toEqual({ retry: false });
  });

  it('preserves operator-selected models and unknown agents', async () => {
    const switchModel = vi.fn();
    const manager = new ForegroundFallbackManager(
      { switchModel },
      { worker: ['p/a', 'p/b'] },
    );
    await manager.retry(retry('operator/custom'));
    await manager.retry(retry('p/a', 'external'));
    await manager.retry(retry('p/a', 'constructor'));
    expect(switchModel).not.toHaveBeenCalled();
  });

  it.each([
    'provider.quota',
    'provider.transport',
    'provider.timeout',
    'provider.internal',
    'provider.chatgpt-limit',
    'provider.model-budget-limit',
  ])('advances on %s', async (type) => {
    const switchModel = vi.fn(async () => {});
    const manager = new ForegroundFallbackManager(
      { switchModel },
      { worker: ['p/a', 'p/b'] },
    );
    const input = retry();
    input.error = { type, message: 'provider failure' };
    await manager.retry(input);
    expect(switchModel).toHaveBeenCalledOnce();
  });

  it('leaves the host decision unchanged if switching fails, without attempting that model again', async () => {
    const switchModel = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(undefined);
    const manager = new ForegroundFallbackManager(
      { switchModel },
      { worker: ['p/a', 'p/b', 'p/c'] },
    );
    const input = retry();
    await expect(manager.retry(input)).resolves.toBeUndefined();
    expect(input.decision).toEqual({ retry: false });
    await manager.retry(retry());
    expect(switchModel.mock.calls.map(([call]) => call.model.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('awaits model switching before changing the decision and prevents overlapping switches', async () => {
    let finish!: () => void;
    const switchModel = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const manager = new ForegroundFallbackManager(
      { switchModel },
      { worker: ['p/a', 'p/b', 'p/c'] },
    );
    const input = retry();
    const pending = manager.retry(input);
    await manager.retry(retry());
    expect(input.decision).toEqual({ retry: false });
    expect(switchModel).toHaveBeenCalledOnce();
    finish();
    await pending;
    expect(input.decision).toEqual({ retry: true, delay: 0 });
  });

  it('switches once to the next untried chain entry and requests immediate retry', async () => {
    const switchModel = vi.fn(async () => {});
    const manager = new ForegroundFallbackManager(
      { switchModel },
      { worker: ['p/a', 'p/b'] },
    );
    const input = retry();
    await manager.retry(input);
    expect(switchModel).toHaveBeenCalledExactlyOnceWith({
      sessionID: 's',
      model: { providerID: 'p', id: 'b' },
    });
    expect(input.decision).toEqual({ retry: true, delay: 0 });
  });
});
