import { describe, expect, it, vi } from 'vitest';
import type { CodexRpcPort, CodexState } from '../rpc.js';
import { runCodexFlow, type Ui } from './flow.js';

function fixture() {
  const state: CodexState = {
    accounts: [
      {
        number: 1,
        providerID: 'openai',
        label: 'First (openai default)',
        credentialState: 'ok',
        blockedUntil: null,
        quota: {
          state: 'stale',
          primary: { remainingPercent: 75, resetAt: 123456 },
        },
      },
      {
        number: 2,
        providerID: 'openai-codex-2',
        label: 'Second',
        credentialState: 'ok',
        blockedUntil: null,
        quota: { state: 'unavailable' },
      },
    ],
    unmappedCredentials: [
      { id: 'three', label: 'Third' },
      { id: 'four', label: 'Fourth' },
    ],
    sessionOverride: null,
    notices: [],
  };
  const reply = async () => ({ ok: true as const, value: state });
  const rpc = {
    state: vi.fn(reply),
    add: vi.fn(reply),
    remove: vi.fn(reply),
    switch: vi.fn(reply),
    refreshQuota: vi.fn(reply),
  } satisfies CodexRpcPort;
  const ui = {
    select: vi.fn(),
    confirm: vi.fn(),
    alert: vi.fn(),
    toast: { show: vi.fn() },
  } as unknown as Ui;
  return { state, rpc, ui };
}
describe('Codex native dialog flows', () => {
  it('refreshes stale status and displays account, quota windows, freshness and session selection', async () => {
    const f = fixture();
    await runCodexFlow('status', { ...f, sessionID: () => 'parent' });
    expect(f.rpc.refreshQuota).toHaveBeenCalledWith({ sessionID: 'parent' });
    expect(f.ui.alert).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('75%') }),
    );
    expect(f.ui.alert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('openai-codex-2'),
      }),
    );
    f.state.accounts.forEach((account) => {
      account.quota.state = 'fresh';
    });
    await runCodexFlow('status', { ...f, sessionID: () => 'parent' });
    expect(f.rpc.refreshQuota).toHaveBeenCalledOnce();
  });
  it('clears only the route session override with pinned/default and rejects home-route switching', async () => {
    const f = fixture();
    vi.mocked(f.ui.select).mockResolvedValue('default');
    await runCodexFlow('switch', { ...f, sessionID: () => 'child' });
    expect(f.rpc.switch).toHaveBeenCalledWith({
      sessionID: 'child',
      number: null,
    });
    await runCodexFlow('switch', { ...f, sessionID: () => undefined });
    expect(f.rpc.switch).toHaveBeenCalledOnce();
    expect(f.ui.toast.show).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: 'Open a session to switch Codex accounts.',
      }),
    );
  });
  it('requires confirmation to unmap an extra account, not delete its credential', async () => {
    const f = fixture();
    vi.mocked(f.ui.select).mockResolvedValue(2);
    vi.mocked(f.ui.confirm)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await runCodexFlow('remove', { ...f, sessionID: () => undefined });
    expect(f.rpc.remove).not.toHaveBeenCalled();
    await runCodexFlow('remove', { ...f, sessionID: () => undefined });
    expect(f.rpc.remove).toHaveBeenCalledWith({ number: 2 });
    expect(f.ui.select).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options: [expect.objectContaining({ value: 2 })],
      }),
    );
  });
  it('selects among unmapped credentials and never maps a cancelled selection', async () => {
    const f = fixture();
    vi.mocked(f.ui.select).mockResolvedValueOnce('four');
    await runCodexFlow('add', { ...f, sessionID: () => undefined });
    expect(f.rpc.add).toHaveBeenCalledWith({ credentialID: 'four' });
    await runCodexFlow('add', { ...f, sessionID: () => undefined });
    expect(f.rpc.add).toHaveBeenCalledOnce();
  });
});
