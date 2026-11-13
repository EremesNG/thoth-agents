import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { AcpConnection } from '../src/acp/connection.js';

const fixture = fileURLToPath(
  new URL('./fixtures/fake-junie.cjs', import.meta.url),
);
const options = (env: NodeJS.ProcessEnv = {}) => ({
  command: { file: process.execPath, args: [fixture] },
  env,
  startupTimeoutMs: 5000,
});

test('initialization authentication errors give actionable login guidance', async () => {
  await expect(
    AcpConnection.connect(options({ FAKE_INIT_AUTH: '1' })),
  ).rejects.toThrow('run `junie` and log in with your JetBrains Account');
});

test('startup is bounded when the agent never responds', async () => {
  await expect(
    AcpConnection.connect({
      ...options({ FAKE_HANG: '1' }),
      startupTimeoutMs: 100,
    }),
  ).rejects.toThrow(/startup timed out/);
});

test('ACP v1 sessions support new, resume, fork, load, config updates and deny permissions by default', async () => {
  const updates: unknown[] = [],
    notifications: unknown[] = [];
  const client = await AcpConnection.connect({
    ...options({ FAKE_PERMISSION: '1' }),
    onUpdate: (value) => updates.push(value),
    onNotification: (method, params) => {
      if (method === 'fixture/permission_result') notifications.push(params);
    },
  });
  try {
    expect(client.initialization).toMatchObject({
      protocolVersion: 1,
      authMethods: [{ id: 'jetbrains-account' }],
    });
    const session = await client.newSession(process.cwd());
    expect(session.sessionId).toBe('fake-session');
    await client.resumeSession(session.sessionId, process.cwd());
    await client.forkSession(session.sessionId, process.cwd());
    await client.loadSession(session.sessionId, process.cwd());
    await client.setConfigOption(session.sessionId, 'effort', 'high');
    await expect
      .poll(() => notifications)
      .toEqual([{ outcome: { outcome: 'cancelled' } }]);
    expect(updates).toEqual([
      expect.objectContaining({
        sessionId: 'fake-session',
        update: expect.objectContaining({
          sessionUpdate: 'config_option_update',
        }),
      }),
    ]);
    client.cancelSession(session.sessionId);
    await client.closeSession(session.sessionId);
    expect(client.stderrTail).toContain('fake Junie diagnostic');
  } finally {
    await client.close();
  }
});
