import { describe, expect, it } from 'vitest';
import { createThroughputTracker } from './throughput.ts';

function start(id: string) {
  return { type: 'message_start' as const, message: { role: 'assistant', id } };
}
function end(id: string, output: number) {
  return {
    type: 'message_end' as const,
    message: { role: 'assistant', id, usage: { output } },
  };
}

describe('createThroughputTracker', () => {
  it('starts unknown and averages measured output over total generation time, not per-message speeds', () => {
    const tracker = createThroughputTracker();
    expect(tracker.tokensPerSecond).toBeNull();
    tracker.observe(start('first'), 0);
    tracker.observe(end('first', 100), 1000);
    expect(tracker.tokensPerSecond).toBe(100);
    tracker.observe(start('second'), 2000);
    tracker.observe(end('second', 100), 6000);
    expect(tracker.tokensPerSecond).toBe(40);
  });

  it('ignores unmatched assistant ends without discarding the active matching start', () => {
    const tracker = createThroughputTracker();
    tracker.observe(end('orphan', 100), 1000);
    expect(tracker.tokensPerSecond).toBeNull();
    tracker.observe(start('active'), 2000);
    tracker.observe(end('other', 999), 2500);
    expect(tracker.tokensPerSecond).toBeNull();
    tracker.observe(end('active', 20), 3000);
    expect(tracker.tokensPerSecond).toBe(20);
  });

  it('ignores duplicate starts, ends and replayed message IDs', () => {
    const tracker = createThroughputTracker();
    const began = start('first');
    const ended = end('first', 20);
    tracker.observe(began, 0);
    tracker.observe(began, 250);
    tracker.observe(start('first'), 500);
    tracker.observe(ended, 1000);
    expect(tracker.tokensPerSecond).toBe(20);
    tracker.observe(ended, 1500);
    tracker.observe(start('first'), 2000);
    tracker.observe(end('first', 999), 3000);
    expect(tracker.tokensPerSecond).toBe(20);

    tracker.observe(start('second'), 4000);
    tracker.observe(end('first', 999), 4500);
    tracker.observe(end('second', 60), 7000);
    expect(tracker.tokensPerSecond).toBe(20);
  });

  it('supports native messages without IDs and ignores repeated event/message objects', () => {
    const tracker = createThroughputTracker();
    const began = {
      type: 'message_start' as const,
      message: { role: 'assistant' },
    };
    const ended = {
      type: 'message_end' as const,
      message: { role: 'assistant', usage: { output: 20 } },
    };
    tracker.observe(began, 0);
    tracker.observe(began, 500);
    tracker.observe({ ...began }, 750);
    tracker.observe(ended, 1000);
    expect(tracker.tokensPerSecond).toBe(20);
    tracker.observe({ ...began }, 2000);
    tracker.observe({ ...ended }, 3000);
    expect(tracker.tokensPerSecond).toBe(20);
    tracker.observe(
      { type: 'message_start', message: { role: 'assistant' } },
      4000,
    );
    tracker.observe(ended, 4500);
    tracker.observe(
      {
        type: 'message_end',
        message: { role: 'assistant', usage: { output: 20 } },
      },
      5000,
    );
    expect(tracker.tokensPerSecond).toBe(20);
  });

  it('ignores user, tool-result and custom messages without changing assistant timing', () => {
    const tracker = createThroughputTracker();
    tracker.observe(start('active'), 0);
    for (const role of ['user', 'toolResult', 'custom']) {
      tracker.observe({ type: 'message_start', message: { role } }, 200);
      tracker.observe(
        { type: 'message_end', message: { role, usage: { output: 999 } } },
        500,
      );
    }
    tracker.observe(end('active', 20), 1000);
    expect(tracker.tokensPerSecond).toBe(20);
  });

  it('resets measurements, in-flight timing and deduplication for a reset or switched session', () => {
    const tracker = createThroughputTracker();
    const began = start('reused');
    const ended = end('reused', 20);
    tracker.observe(began, 0);
    tracker.observe(ended, 1000);
    tracker.observe(start('in-flight'), 2000);
    tracker.reset();
    expect(tracker.tokensPerSecond).toBeNull();
    tracker.observe(end('in-flight', 999), 3000);
    expect(tracker.tokensPerSecond).toBeNull();
    tracker.observe(began, 4000);
    tracker.observe(ended, 6000);
    expect(tracker.tokensPerSecond).toBe(10);
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    '10',
  ])('ignores invalid output %s without adding its duration', (output) => {
    const tracker = createThroughputTracker();
    tracker.observe(start('bad'), 0);
    tracker.observe(end('bad', output as number), 1000);
    expect(tracker.tokensPerSecond).toBeNull();
    tracker.observe(start('good'), 2000);
    tracker.observe(end('good', 0), 3000);
    expect(tracker.tokensPerSecond).toBe(0);
  });

  it('returns unknown rather than a nonfinite speed when arithmetic overflows', () => {
    const tracker = createThroughputTracker();
    tracker.observe(start('large'), 0);
    tracker.observe(end('large', Number.MAX_VALUE), 1);
    expect(tracker.tokensPerSecond).toBeNull();
  });

  it.each([
    [10, 10],
    [20, 10],
    [0, Number.POSITIVE_INFINITY],
    [Number.NaN, 10],
    [Number.NEGATIVE_INFINITY, 10],
  ])('ignores nonpositive or nonfinite duration from %s to %s', (began, ended) => {
    const tracker = createThroughputTracker();
    tracker.observe(start('bad'), began);
    tracker.observe(end('bad', 999), ended);
    expect(tracker.tokensPerSecond).toBeNull();
    tracker.observe(start('good'), 1000);
    tracker.observe(end('good', 20), 2000);
    expect(tracker.tokensPerSecond).toBe(20);
  });
});
