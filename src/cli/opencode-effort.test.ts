import { describe, expect, test } from 'vitest';
import { resolveOpenCodeEffort } from './opencode-effort';

describe('OpenCode writable effort resolution', () => {
  const base = {
    model: 'openai/gpt-5.6-sol',
    catalogId: 'openai/gpt-5.6-sol',
    availableEfforts: ['none', 'high', 'xhigh', 'max'],
  };

  test('requires both catalog publication and a runtime-writable variant', () => {
    expect(
      resolveOpenCodeEffort({
        ...base,
        effort: { kind: 'effort', value: 'high' },
      }),
    ).toEqual({ ok: true, variant: 'high' });
    expect(
      resolveOpenCodeEffort({
        ...base,
        effort: { kind: 'effort', value: 'max' },
      }),
    ).toMatchObject({ ok: false, code: 'opencode-effort-runtime-unconfirmed' });
    expect(
      resolveOpenCodeEffort({
        ...base,
        availableEfforts: ['none'],
        effort: { kind: 'effort', value: 'high' },
      }),
    ).toMatchObject({ ok: false, code: 'opencode-effort-catalog-unsupported' });
    expect(
      resolveOpenCodeEffort({ ...base, effort: { kind: 'inherit' } }),
    ).toEqual({ ok: true, variant: undefined });
  });
});
