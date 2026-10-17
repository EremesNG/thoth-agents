import { createInterface } from 'node:readline/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CODEX_HOOK_CONSENT_PROMPT,
  requestCodexHookConsent,
} from './codex-hook-consent';

vi.mock('node:readline/promises', () => ({ createInterface: vi.fn() }));

describe('Codex hook consent', () => {
  const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  afterEach(() => {
    for (const [stream, descriptor] of [
      [process.stdin, stdinTTY],
      [process.stdout, stdoutTTY],
    ] as const) {
      if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
      else Reflect.deleteProperty(stream, 'isTTY');
    }
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it('does not ask or grant consent in noninteractive mode or dry-run', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: false,
    });
    expect(await requestCodexHookConsent({})).toBe(false);
    expect(await requestCodexHookConsent({ dryRun: true })).toBe(false);
    expect(
      await requestCodexHookConsent({ trustHooks: true, dryRun: true }),
    ).toBe(true);
    expect(createInterface).not.toHaveBeenCalled();
  });
  it.each([
    ['', false],
    ['no', false],
    ['yes', true],
    ['y', true],
  ])('requires explicit yes with outside-sandbox disclosure (%s)', async (answer, consent) => {
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });
    for (const key of [
      'CI',
      'CONTINUOUS_INTEGRATION',
      'BUILD_NUMBER',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
      'TF_BUILD',
      'TEAMCITY_VERSION',
    ])
      vi.stubEnv(key, 'false');
    vi.stubEnv('TERM', 'xterm');
    const question = vi.fn().mockResolvedValue(answer);
    const close = vi.fn();
    vi.mocked(createInterface).mockReturnValue({
      question,
      close,
    } as unknown as ReturnType<typeof createInterface>);
    expect(await requestCodexHookConsent({})).toBe(consent);
    expect(question).toHaveBeenCalledWith(CODEX_HOOK_CONSENT_PROMPT);
    expect(CODEX_HOOK_CONSENT_PROMPT).toContain('outside the sandbox');
    expect(close).toHaveBeenCalled();
  });
});
