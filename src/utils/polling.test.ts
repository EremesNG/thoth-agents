import { describe, expect, test } from 'bun:test';
import { delay, pollUntilStable } from './polling';

describe('pollUntilStable', () => {
  test('returns success when condition becomes stable', async () => {
    let callCount = 0;
    const fetchFn = async () => {
      callCount++;
      return callCount >= 3 ? 'stable' : 'changing';
    };

    const isStable = (current: string, previous: string | null) => {
      return current === 'stable' && previous === 'stable';
    };

    const result = await pollUntilStable(fetchFn, isStable, {
      pollInterval: 10,
      maxPollTime: 1000,
      stableThreshold: 2,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('stable');
    expect(result.timedOut).toBeUndefined();
    expect(result.aborted).toBeUndefined();
  });

  test('returns timeout when max poll time exceeded', async () => {
    const fetchFn = async () => 'always-changing';
    const isStable = () => false; // Never stable

    const result = await pollUntilStable(fetchFn, isStable, {
      pollInterval: 10,
      maxPollTime: 50, // Very short timeout
      stableThreshold: 2,
    });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.data).toBe('always-changing');
  });

  test('returns aborted when signal is aborted', async () => {
    const controller = new AbortController();
    const fetchFn = async () => {
      // Abort after first call
      controller.abort();
      return 'data';
    };

    const isStable = () => false;

    const result = await pollUntilStable(fetchFn, isStable, {
      pollInterval: 10,
      maxPollTime: 1000,
      signal: controller.signal,
    });

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
  });

  test('respects custom stability threshold', async () => {
    let callCount = 0;
    const fetchFn = async () => {
      callCount++;
      return callCount >= 2 ? 'stable' : 'changing';
    };

    const isStable = (
      current: string,
      previous: string | null,
      _stableCount: number,
    ) => {
      return current === 'stable' && previous === 'stable';
    };

    const result = await pollUntilStable(fetchFn, isStable, {
      pollInterval: 10,
      maxPollTime: 1000,
      stableThreshold: 3, // Require 3 stable polls
    });

    expect(result.success).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(5); // At least 2 changing + 3 stable
  });

  test('resets stable count when condition becomes unstable', async () => {
    let callCount = 0;
    const values = ['a', 'a', 'b', 'b', 'b', 'b']; // Unstable, then stable
    const fetchFn = async () => values[callCount++] || 'b';

    const isStable = (current: string, previous: string | null) => {
      return current === previous && current === 'b';
    };

    const result = await pollUntilStable(fetchFn, isStable, {
      pollInterval: 10,
      maxPollTime: 1000,
      stableThreshold: 3,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('b');
  });

  test('uses default options when not provided', async () => {
    let callCount = 0;
    const fetchFn = async () => {
      callCount++;
      return callCount >= 2 ? 'stable' : 'changing';
    };

    const isStable = (current: string, previous: string | null) => {
      return current === 'stable' && previous === 'stable';
    };

    const result = await pollUntilStable(fetchFn, isStable);

    expect(result.success).toBe(true);
    expect(result.data).toBe('stable');
  });

  test('handles fetchFn that throws errors', async () => {
    const fetchFn = async () => {
      throw new Error('Fetch failed');
    };

    const isStable = () => false;

    await expect(
      pollUntilStable(fetchFn, isStable, {
        pollInterval: 10,
        maxPollTime: 100,
      }),
    ).rejects.toThrow('Fetch failed');
  });

  test('passes stable count to isStable function', async () => {
    let _callCount = 0;
    const fetchFn = async () => {
      _callCount++;
      return 'data';
    };

    let maxStableCount = 0;
    const isStable = (
      current: string,
      previous: string | null,
      stableCount: number,
    ) => {
      maxStableCount = Math.max(maxStableCount, stableCount);
      // Check if data is actually stable (same as previous)
      return current === previous && current === 'data';
    };

    const result = await pollUntilStable(fetchFn, isStable, {
      pollInterval: 10,
      maxPollTime: 1000,
      stableThreshold: 3,
    });

    expect(result.success).toBe(true);
    expect(maxStableCount).toBeGreaterThanOrEqual(2);
  });
});

describe('delay', () => {
  test('delays for specified milliseconds', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;

    // Allow some tolerance for timing
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(100);
  });

  test('resolves without value', async () => {
    const result = await delay(10);
    expect(result).toBeUndefined();
  });

  test('can be used in promise chains', async () => {
    const result = await Promise.resolve('test')
      .then((val) => delay(10).then(() => val))
      .then((val) => val.toUpperCase());

    expect(result).toBe('TEST');
  });
});
