import { describe, expect, it } from 'vitest';
import { createPriorityGuard } from './payload.ts';

describe('createPriorityGuard', () => {
  it('returns undefined when nothing is armed', () => {
    const guard = createPriorityGuard();
    expect(guard.apply({ model: 'gpt-5' })).toBeUndefined();
  });

  it('applies priority on a shallow copy for the armed base model and clears the token', () => {
    const guard = createPriorityGuard();
    guard.arm({ provider: 'openai', baseId: 'gpt-5' });
    const payload = { model: 'gpt-5', input: [1] };
    const patched = guard.apply(payload);
    expect(patched).toEqual({
      model: 'gpt-5',
      input: [1],
      service_tier: 'priority',
    });
    expect(patched).not.toBe(payload);
    expect(payload).not.toHaveProperty('service_tier');
    expect(guard.apply({ model: 'gpt-5' })).toBeUndefined();
  });

  it('leaves a mismatched payload unchanged and drops the stale token', () => {
    const guard = createPriorityGuard();
    guard.arm({ provider: 'openai', baseId: 'gpt-5' });
    expect(guard.apply({ model: 'other' })).toBeUndefined();
    expect(guard.apply({ model: 'gpt-5' })).toBeUndefined();
  });

  it('ignores non-object payloads', () => {
    const guard = createPriorityGuard();
    guard.arm({ provider: 'openai', baseId: 'gpt-5' });
    expect(guard.apply('text')).toBeUndefined();
    expect(guard.apply(null)).toBeUndefined();
  });

  it('replaces a previous token on re-arm and can be disarmed', () => {
    const guard = createPriorityGuard();
    guard.arm({ provider: 'openai', baseId: 'a' });
    guard.arm({ provider: 'openai', baseId: 'b' });
    expect(guard.apply({ model: 'a' })).toBeUndefined();
    guard.arm({ provider: 'openai', baseId: 'b' });
    guard.disarm();
    expect(guard.apply({ model: 'b' })).toBeUndefined();
  });
});
