import { describe, expect, it } from 'vitest';
import type { CodexState } from '../rpc.js';
import { bar, formatDuration, statusView, windowLabel } from './status.js';

const now = Date.parse('2026-11-09T00:06:00.000Z');
const state = (): CodexState => ({
  accounts: [
    {
      number: 1,
      providerID: 'openai',
      label: 'OAuth (openai default)',
      credentialState: 'ok',
      blockedUntil: null,
      quota: {
        state: 'fresh',
        fetchedAt: now - 60_000,
        primary: {
          remainingPercent: 71,
          resetAt: Date.parse('2026-11-13T23:06:58.000Z'),
          windowSeconds: 604800,
        },
      },
    },
    {
      number: 2,
      providerID: 'openai-codex-2',
      label: 'OpenAI',
      credentialState: 'ok',
      blockedUntil: null,
      quota: {
        state: 'fresh',
        fetchedAt: now - 120_000,
        primary: {
          remainingPercent: 96,
          resetAt: Date.parse('2026-11-09T02:47:44.000Z'),
          windowSeconds: 18000,
        },
        secondary: {
          remainingPercent: 68,
          resetAt: Date.parse('2026-11-11T16:47:44.000Z'),
          windowSeconds: 604800,
        },
      },
    },
  ],
  unmappedCredentials: [],
  sessionOverride: null,
  notices: [],
});

describe('status view', () => {
  it('renders both accounts compactly with real window labels', () => {
    const text = statusView(state(), now);
    console.log(text);
    expect(text).toContain('This session: pinned account');
    expect(text).toContain('weekly [#######---]  71% left · resets in 4d 23h');
    expect(text).toContain('5h     [##########]  96% left · resets in 2h 42m');
    expect(text).toContain('weekly [#######---]  68% left · resets in 2d 16h');
    expect(text).toContain('quota updated 2m ago');
    expect(text).not.toMatch(/unknown|T\d\d:|\d{4}-\d\d-\d\d|\|/);
    for (const line of text.split('\n'))
      expect(line.length).toBeLessThanOrEqual(56);
  });
  it('shows override marker, blocked, missing, stale and unavailable states', () => {
    const s = state();
    s.sessionOverride = 2;
    s.accounts[1].blockedUntil = now + 3 * 3_600_000;
    s.accounts[0].quota = { state: 'stale', primary: { remainingPercent: 10 } };
    s.accounts.push({
      number: 3,
      providerID: 'openai-codex-3',
      label: 'Third',
      credentialState: 'missing',
      blockedUntil: null,
      quota: { state: 'unavailable', error: 'HTTP 401' },
    });
    s.accounts.push({
      number: 4,
      providerID: 'openai-codex-4',
      label: 'Fourth',
      credentialState: 'ok',
      blockedUntil: null,
      quota: { state: 'unavailable', error: 'HTTP 500' },
    });
    const text = statusView(s, now);
    expect(text).toContain('forced to #2');
    expect(text).toMatch(/#2 .*→ ok/);
    expect(text).toMatch(/blocked until \d\d:\d\d \(in 3h 0m\)/);
    expect(text).toContain('quota stale');
    expect(text).toContain('credential missing');
    expect(text).toContain('quota unavailable: HTTP 500');
  });
  it('formats helpers', () => {
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(5 * 60_000)).toBe('5m');
    expect(windowLabel(18000)).toBe('5h');
    expect(windowLabel(604800)).toBe('weekly');
    expect(windowLabel(259200)).toBe('3d');
    expect(windowLabel(undefined)).toBe('window');
    expect(bar(0)).toBe('[----------]');
    expect(bar(150)).toBe('[##########]');
  });
});
