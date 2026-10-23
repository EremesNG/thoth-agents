import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { doctorCodex, uninstallCodex } from './codex-lifecycle';

const roots: string[] = [];
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'codex-lifecycle-'));
  roots.push(home);
  const codexHome = join(home, '.codex');
  const agents = join(codexHome, 'agents');
  mkdirSync(agents, { recursive: true });
  const role = join(agents, 'thoth-agents-worker.toml');
  const text = 'name = "worker"\nmodel = "gpt-5"\n';
  writeFileSync(role, text);
  const state = join(agents, '.thoth-agents-managed-models.json');
  writeFileSync(
    state,
    JSON.stringify({
      version: 1,
      models: {},
      roleDigests: {
        'thoth-agents-worker.toml': createHash('sha256')
          .update(text)
          .digest('hex'),
      },
      priorThreadsValue: '3',
    }),
  );
  const config = join(codexHome, 'config.toml');
  writeFileSync(
    config,
    '# operator\n[agents]\nmax_concurrent_threads_per_session = 6\n',
  );
  const calls: string[] = [];
  const context = {
    cwd: home,
    homeDir: home,
    codexHome,
    installLedgerOptions: { homeDir: home, env: {} },
    codexPluginCommandExecutor: (_cmd: string, args: readonly string[]) => {
      calls.push(args.join(' '));
      return { exitCode: 0, stdout: '{}', stderr: '' };
    },
    nodeAvailable: () => true,
  };
  return { home, role, state, config, calls, context };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
it('dry-run plans native removal and all owned actions without mutation; apply restores prior capacity', () => {
  const f = fixture();
  const preview = uninstallCodex(f.context, true);
  expect(preview.success).toBe(true);
  expect(preview.messages.join('\n')).toContain(
    'codex plugin remove thoth-agents@thoth-plugins',
  );
  expect(existsSync(f.role)).toBe(true);
  expect(f.calls).toEqual([]);
  expect(uninstallCodex(f.context, false).success).toBe(true);
  expect(existsSync(f.role)).toBe(false);
  expect(existsSync(f.state)).toBe(false);
  expect(readFileSync(f.config, 'utf8')).toContain(
    'max_concurrent_threads_per_session = 3',
  );
  expect(f.calls).toContain('plugin remove thoth-agents@thoth-plugins --json');
});
it('preserves edited roles, operator capacity and unrelated hook trust; deletes absent-prior capacity', () => {
  const f = fixture();
  writeFileSync(f.role, '# operator edits\n');
  const text =
    '# unrelated\n[agents]\nmax_concurrent_threads_per_session = 9\n[hooks.state."other:hook"]\ntrusted_hash = "keep"\n';
  writeFileSync(f.config, text);
  const result = uninstallCodex(f.context, false);
  expect(result.success).toBe(true);
  expect(readFileSync(f.role, 'utf8')).toContain('operator');
  expect(readFileSync(f.config, 'utf8')).toBe(text);
  expect(result.messages.join('\n')).toContain('operator-changed');
  const g = fixture();
  const state = JSON.parse(readFileSync(g.state, 'utf8'));
  state.priorThreadsValue = null;
  writeFileSync(g.state, JSON.stringify(state));
  expect(uninstallCodex(g.context, false).success).toBe(true);
  expect(readFileSync(g.config, 'utf8')).not.toContain('max_concurrent');
});
it('fails closed before native mutation on corrupt ownership state', () => {
  const f = fixture();
  writeFileSync(f.state, '{broken');
  expect(uninstallCodex(f.context, false).success).toBe(false);
  expect(f.calls).toEqual([]);
  expect(existsSync(f.role)).toBe(true);
});
it('routes Codex-only lifecycle commands from CLI', async () => {
  const { parseCliArgs } = await import('./parser');
  const { runCliCommand } = await import('./commands');
  expect(parseCliArgs(['doctor', '--agent=codex'])).toEqual({
    command: 'doctor',
    operationArgs: { harness: 'codex', roles: [] },
  });
  expect(await runCliCommand(parseCliArgs(['doctor', '--agent=pi']))).toBe(1);
});
function hookFixture(pluginId = 'thoth-agents@thoth-plugins') {
  const base = fixture();
  const f = { ...base, context: { ...base.context, pluginId } };
  const bundle = join(
    f.context.codexHome,
    'plugins',
    'cache',
    pluginId.split('@')[1],
    'thoth-agents',
    '1.0.0',
    'codex-hooks',
  );
  mkdirSync(join(bundle, 'payloads'), { recursive: true });
  for (const role of [
    'root',
    'worker',
    'oracle',
    'designer',
    'explorer',
    'librarian',
  ])
    writeFileSync(join(bundle, 'payloads', `${role}.md`), 'context');
  writeFileSync(join(bundle, 'context.cjs'), '');
  const declarations = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node test' }] }],
      SubagentStart: [{ hooks: [{ type: 'command', command: 'node role' }] }],
      PostToolUse: [
        {
          matcher: '^(multi_agent_v1)?wait_agent$',
          hooks: [
            {
              type: 'command',
              command: 'node verdict.mjs',
              additionalContextLimit: 0,
            },
          ],
        },
      ],
    },
  };
  writeFileSync(join(bundle, 'hooks.json'), JSON.stringify(declarations));
  f.context.codexPluginCommandExecutor = (_cmd, args) => {
    f.calls.push(args.join(' '));
    return {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        args.includes('marketplace')
          ? {
              marketplaces: [
                {
                  name: 'thoth-plugins',
                  marketplaceSource: {
                    sourceType: 'git',
                    source: 'https://github.com/EremesNG/thoth-plugins.git',
                  },
                },
              ],
            }
          : {
              installed: [
                {
                  pluginId,
                  installed: true,
                  enabled: true,
                  version: '1.0.0',
                },
              ],
            },
      ),
    };
  };
  return { ...f, declarations };
}
it('doctor diagnoses untrusted, modified, trusted hooks and missing Node without writes', async () => {
  const f = hookFixture();
  const { codexHookTrustEntries } = await import('./codex-hook-trust');
  const entries = codexHookTrustEntries(
    f.declarations,
    'thoth-agents@thoth-plugins:codex-hooks/hooks.json',
    process.platform,
  );
  const before = readFileSync(f.config, 'utf8');
  let result = doctorCodex({ ...f.context, nodeAvailable: () => false });
  expect(result.success).toBe(false);
  expect(result.messages.join('\n')).toContain('untrusted');
  expect(result.messages.join('\n')).toContain('Node on PATH: missing');
  expect(readFileSync(f.config, 'utf8')).toBe(before);
  const [first, second] = Object.entries(entries);
  writeFileSync(
    f.config,
    before +
      `[hooks.state.${JSON.stringify(first[0])}]\ntrusted_hash = "changed"\n[hooks.state.${JSON.stringify(second[0])}]\ntrusted_hash = ${JSON.stringify(second[1])}\n[shell_environment_policy.set]\nEXAMPLE = "retained"\n`,
  );
  result = doctorCodex(f.context);
  expect(result.messages.join('\n')).toContain(': modified');
  expect(result.messages.join('\n')).toContain(': trusted');
  expect(result.messages.join('\n')).toContain('post_tool_use:0:0: untrusted');
  expect(result.messages.join('\n')).toContain('Agent worker: owned');
  expect(result.messages.join('\n')).toContain('Threads: managed');
});
it.each([
  'thoth-agents@thoth-plugins',
  'thoth-agents@personal',
])('removes only consent-owned matching hashes for %s, leaving changed and unrelated trust', async (pluginId) => {
  const f = hookFixture(pluginId);
  const { codexHookTrustEntries } = await import('./codex-hook-trust');
  const entries = codexHookTrustEntries(
    f.declarations,
    `${pluginId}:codex-hooks/hooks.json`,
    process.platform,
  );
  const [first, second] = Object.entries(entries);
  const state = JSON.parse(readFileSync(f.state, 'utf8'));
  state.ownedHookTrustKeys = Object.keys(entries);
  writeFileSync(f.state, JSON.stringify(state));
  writeFileSync(
    f.config,
    readFileSync(f.config, 'utf8') +
      `[hooks.state.${JSON.stringify(first[0])}]\ntrusted_hash = ${JSON.stringify(first[1])}\n[hooks.state.${JSON.stringify(second[0])}]\ntrusted_hash = "operator"\n[hooks.state.other]\ntrusted_hash = "unrelated"\n`,
  );
  const result = uninstallCodex(f.context, false);
  expect(result.success).toBe(true);
  const config = readFileSync(f.config, 'utf8');
  expect(config).not.toContain(first[1]);
  expect(config).toContain('"operator"');
  expect(config).toContain('"unrelated"');
  expect(result.messages.join('\n')).toContain('Preserve hook trust');
});
it('classifies model-only edits separately, reports legacy block with backup removal, and retains state on native failure', async () => {
  const f = fixture();
  const { roleStructureFingerprint } = await import('./codex-install');
  const state = JSON.parse(readFileSync(f.state, 'utf8'));
  state.roleStructureDigests = {
    'thoth-agents-worker.toml': roleStructureFingerprint(
      readFileSync(f.role, 'utf8'),
    ),
  };
  writeFileSync(f.state, JSON.stringify(state));
  writeFileSync(f.role, 'name = "worker"\nmodel = "operator-model"\n');
  const root = join(f.context.codexHome, 'AGENTS.md');
  const original =
    'before\r\n<!-- thoth-agents:codex-root:start -->old<!-- thoth-agents:codex-root:end -->\r\nafter';
  writeFileSync(root, original);
  expect(uninstallCodex(f.context, true).messages.join('\n')).toContain(
    '(model-edited)',
  );
  const result = uninstallCodex(
    {
      ...f.context,
      codexPluginCommandExecutor: () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'blocked',
      }),
    },
    false,
  );
  expect(result.success).toBe(false);
  expect(existsSync(f.state)).toBe(true);
  expect(readFileSync(root, 'utf8')).toBe(original);
  expect(uninstallCodex(f.context, false).success).toBe(true);
  expect(readFileSync(root, 'utf8')).toBe('before\r\n\r\nafter');
  expect(readFileSync(`${root}.bak`, 'utf8')).toBe(original);
});
it('doctor succeeds only when plugin, trust, Node, all roles, capacity and root migration are healthy', async () => {
  const f = hookFixture();
  const { codexHookTrustEntries } = await import('./codex-hook-trust');
  const { roleStructureFingerprint } = await import('./codex-install');
  const state = JSON.parse(readFileSync(f.state, 'utf8'));
  state.roleStructureDigests = {};
  for (const role of [
    'worker',
    'designer',
    'oracle',
    'explorer',
    'librarian',
  ]) {
    const name = `thoth-agents-${role}.toml`;
    const content = `name = "${role}"\nmodel = "gpt-5"\n`;
    writeFileSync(join(f.context.codexHome, 'agents', name), content);
    state.roleDigests[name] = createHash('sha256')
      .update(content)
      .digest('hex');
    state.roleStructureDigests[name] = roleStructureFingerprint(content);
  }
  writeFileSync(f.state, JSON.stringify(state));
  const entries = codexHookTrustEntries(
    f.declarations,
    'thoth-agents@thoth-plugins:codex-hooks/hooks.json',
    process.platform,
  );
  writeFileSync(
    f.config,
    readFileSync(f.config, 'utf8') +
      Object.entries(entries)
        .map(
          ([key, hash]) =>
            `[hooks.state.${JSON.stringify(key)}]\ntrusted_hash = '${hash}'\n`,
        )
        .join(''),
  );
  const healthy = doctorCodex(f.context);
  expect(healthy.success).toBe(true);
  expect(healthy.messages.join('\n')).not.toContain('Fix:');
  writeFileSync(f.role, 'name = "worker"\nmodel = "custom"\n');
  expect(doctorCodex(f.context).success).toBe(true);
  expect(doctorCodex(f.context).messages.join('\n')).toContain(
    'Agent worker: model-edited',
  );
  writeFileSync(f.role, 'name = "modified-role"\n');
  expect(doctorCodex(f.context).success).toBe(false);
  expect(doctorCodex(f.context).messages.join('\n')).toContain(
    'Agent worker: drifted',
  );
});
it.each([
  [
    'thoth-agents@thoth-plugins',
    false,
    'thoth-agents update --agent=codex --apply',
  ],
  ['thoth-agents@personal', false, 'pnpm run setup:codex:local'],
  ['thoth-agents@custom', true, 'pnpm run setup:codex:local'],
] as const)('doctor repairs %s using its install identity (local=%s)', (pluginId, local, command) => {
  const f = hookFixture(pluginId);
  const executor = f.context.codexPluginCommandExecutor;
  f.context.codexPluginCommandExecutor = (cmd, args) => {
    const result = executor(cmd, args);
    if (local && args[0] === 'plugin' && args[1] === 'list') {
      const data = JSON.parse(result.stdout);
      data.installed[0].source = { source: 'local', path: f.home };
      return { ...result, stdout: JSON.stringify(data) };
    }
    return result;
  };
  writeFileSync(f.role, '# operator drift\n');
  const result = doctorCodex(f.context);
  const fixes = result.messages.filter((message) => message.includes('Fix:'));
  expect(fixes.length).toBeGreaterThan(0);
  for (const finding of fixes) expect(finding).toContain(command);
  if (local || pluginId.endsWith('@personal'))
    expect(fixes.join('\n')).not.toContain('thoth-agents update');
});

it('preserves native-manager config changes made during plugin removal', () => {
  const f = fixture();
  const result = uninstallCodex(
    {
      ...f.context,
      codexPluginCommandExecutor: () => {
        writeFileSync(
          f.config,
          readFileSync(f.config, 'utf8') +
            '\n# native removal\n[plugins.other]\nenabled = true\n',
        );
        return { exitCode: 0, stdout: '{}', stderr: '' };
      },
    },
    false,
  );
  expect(result.success).toBe(true);
  expect(readFileSync(f.config, 'utf8')).toContain('# native removal');
  expect(readFileSync(f.config, 'utf8')).toContain(
    'max_concurrent_threads_per_session = 3',
  );
});

it('uses the selected plugin identity for doctor and native uninstall', () => {
  const f = fixture();
  const context = {
    ...f.context,
    pluginId: 'thoth-agents@personal',
    codexPluginCommandExecutor: (_cmd: string, args: readonly string[]) => {
      f.calls.push(args.join(' '));
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          installed: [
            {
              pluginId: 'thoth-agents@personal',
              enabled: true,
              version: '1.0.0',
            },
          ],
          marketplaces: [],
        }),
      };
    },
  };
  expect(doctorCodex(context).messages.join()).toContain(
    'Plugin: installed (thoth-agents@personal), enabled=true',
  );
  expect(uninstallCodex(context).success).toBe(true);
  expect(f.calls).toContain('plugin remove thoth-agents@personal --json');
  expect(f.calls).not.toContain(
    'plugin remove thoth-agents@thoth-plugins --json',
  );
});

it('doctor and uninstall accept native hook headers and preserve unrelated structural config bytes', async () => {
  const f = hookFixture();
  const source = readFileSync(
    new URL('./fixtures/codex-config-structural.toml', import.meta.url),
    'utf8',
  );
  const { codexHookTrustEntries } = await import('./codex-hook-trust');
  const { writeCodexConfigMerge } = await import('./codex-config-io');
  const entries = codexHookTrustEntries(
    f.declarations,
    'thoth-agents@thoth-plugins:codex-hooks/hooks.json',
    process.platform,
  );
  writeFileSync(f.config, source);
  expect(
    writeCodexConfigMerge({ configPath: f.config, trustedHooks: entries })
      .success,
  ).toBe(true);
  const before = readFileSync(f.config, 'utf8');
  const result = doctorCodex(f.context);
  expect(result.messages.join('\n')).not.toContain('Error:');
  expect(
    result.messages.filter((message) => message.includes(': trusted')),
  ).toHaveLength(3);
  expect(result.messages.join('\n')).toContain('post_tool_use:0:0: trusted');
  expect(readFileSync(f.config, 'utf8')).toBe(before);
  const state = JSON.parse(readFileSync(f.state, 'utf8'));
  state.ownedHookTrustKeys = Object.keys(entries);
  writeFileSync(f.state, JSON.stringify(state));
  expect(uninstallCodex(f.context, false).success).toBe(true);
  const after = readFileSync(f.config, 'utf8');
  expect(after).toBe(
    `${source
      .replace('= 6 # retained', '= 3 # retained')
      .replace(
        '[features] # retained\nother = true',
        '[features] # retained\nother = true\ndefault_mode_request_user_input = true',
      )}\n\n\n\n\n\n`,
  );
  expect(after).not.toContain('sha256:');
});

it('doctor captures native failures and continues independent checks', () => {
  const f = fixture();
  const result = doctorCodex({
    ...f.context,
    codexPluginCommandExecutor: () => ({
      exitCode: 1,
      stdout: 'partial',
      stderr: 'spawnSync ENOBUFS',
    }),
  });
  expect(result.messages.join('\n')).toContain('ENOBUFS');
  expect(result.messages.join('\n')).toContain('Node on PATH: available');
  expect(result.messages.join('\n')).toContain('Threads: managed');
});
it('doctor auto-detects personal identity and reports ambiguous or absent installs', () => {
  const f = hookFixture('thoth-agents@personal');
  const { pluginId: _pluginId, ...context } = f.context;
  expect(doctorCodex(context).messages.join('\n')).toContain(
    'thoth-agents@personal',
  );
  for (const installed of [
    [],
    [
      { pluginId: 'thoth-agents@personal', enabled: true },
      { pluginId: 'thoth-agents@thoth-plugins', enabled: true },
    ],
  ]) {
    const result = doctorCodex({
      ...context,
      codexPluginCommandExecutor: () => ({
        exitCode: 0,
        stdout: JSON.stringify({ installed }),
        stderr: '',
      }),
    });
    expect(result.messages.join('\n')).toMatch(/Plugin: (missing|ambiguous)/);
    expect(result.messages.join('\n')).toContain('Node on PATH: available');
  }
});

it('preserves targets replaced during native removal, including ownership state and legacy root', () => {
  const f = fixture();
  const root = join(f.context.codexHome, 'AGENTS.md');
  const recovery = join(
    f.context.codexHome,
    'agents/.thoth-agents-install-recovery.json',
  );
  writeFileSync(
    root,
    '<!-- thoth-agents:codex-root:start -->old<!-- thoth-agents:codex-root:end -->',
  );
  writeFileSync(recovery, JSON.stringify({ version: 1, roles: {} }));
  const result = uninstallCodex({
    ...f.context,
    codexPluginCommandExecutor: () => {
      writeFileSync(f.role, '# operator replacement');
      writeFileSync(root, '# operator root');
      writeFileSync(
        f.state,
        JSON.stringify({ version: 1, models: {}, extension: true }),
      );
      writeFileSync(
        recovery,
        JSON.stringify({ version: 1, roles: {}, extension: true }),
      );
      writeFileSync(
        f.config,
        '[agents]\nmax_concurrent_threads_per_session = 9\n',
      );
      return { exitCode: 0, stdout: '{}', stderr: '' };
    },
  });
  expect(result.success).toBe(true);
  expect(readFileSync(f.role, 'utf8')).toBe('# operator replacement');
  expect(readFileSync(root, 'utf8')).toBe('# operator root');
  expect(JSON.parse(readFileSync(f.state, 'utf8')).extension).toBe(true);
  expect(JSON.parse(readFileSync(recovery, 'utf8')).extension).toBe(true);
  expect(readFileSync(f.config, 'utf8')).toContain('= 9');
  expect(result.messages.join('\n')).toContain('Preserve concurrently changed');
});

it.each([
  'role',
  'root',
  'recovery',
  'state',
])('independently preserves a %s replacement during native removal', (target) => {
  const f = fixture();
  const root = join(f.context.codexHome, 'AGENTS.md');
  const recovery = join(
    f.context.codexHome,
    'agents/.thoth-agents-install-recovery.json',
  );
  writeFileSync(
    root,
    '<!-- thoth-agents:codex-root:start -->old<!-- thoth-agents:codex-root:end -->',
  );
  writeFileSync(recovery, JSON.stringify({ version: 1, roles: {} }));
  const path = { role: f.role, root, recovery, state: f.state }[target];
  const result = uninstallCodex({
    ...f.context,
    codexPluginCommandExecutor: () => {
      writeFileSync(path, '# operator replacement');
      return { exitCode: 0, stdout: '{}', stderr: '' };
    },
  });
  expect(result.success).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe('# operator replacement');
  expect(result.messages.join('\n')).toContain(
    `Preserve concurrently changed ${path}`,
  );
});
it.each([
  'AGENTS.md',
  'config.toml',
])('refuses an unsafe uninstall %s backup before native removal', (relative) => {
  const f = fixture();
  writeFileSync(
    join(f.context.codexHome, 'AGENTS.md'),
    '<!-- thoth-agents:codex-root:start -->old<!-- thoth-agents:codex-root:end -->',
  );
  const unrelated = join(f.home, 'operator.txt');
  writeFileSync(unrelated, 'keep');
  symlinkSync(unrelated, join(f.context.codexHome, `${relative}.bak`));
  const result = uninstallCodex(f.context);
  expect(result.success).toBe(false);
  expect(f.calls).toEqual([]);
  expect(readFileSync(unrelated, 'utf8')).toBe('keep');
  expect(existsSync(f.role)).toBe(true);
});
it('preserves a hook hash changed during native removal while rebasing other owned config edits', async () => {
  const f = hookFixture();
  const { codexHookTrustEntries } = await import('./codex-hook-trust');
  const entries = codexHookTrustEntries(
    f.declarations,
    'thoth-agents@thoth-plugins:codex-hooks/hooks.json',
    process.platform,
  );
  const state = JSON.parse(readFileSync(f.state, 'utf8'));
  state.ownedHookTrustKeys = Object.keys(entries);
  writeFileSync(f.state, JSON.stringify(state));
  const [key, hash] = Object.entries(entries)[0];
  writeFileSync(
    f.config,
    readFileSync(f.config, 'utf8') +
      `[hooks.state.${JSON.stringify(key)}]\ntrusted_hash = ${JSON.stringify(hash)}\n`,
  );
  const executor = f.context.codexPluginCommandExecutor;
  const result = uninstallCodex({
    ...f.context,
    codexPluginCommandExecutor: (cmd, args) => {
      if (args.includes('remove'))
        writeFileSync(
          f.config,
          readFileSync(f.config, 'utf8').replace(hash, 'operator'),
        );
      return executor(cmd, args);
    },
  });
  expect(result.success).toBe(true);
  expect(readFileSync(f.config, 'utf8')).toContain('trusted_hash = "operator"');
  expect(readFileSync(f.config, 'utf8')).toContain(
    'max_concurrent_threads_per_session = 3',
  );
  expect(result.messages.join('\n')).toContain('Preserve concurrently changed');
});

it.each([
  'root',
  'hooks',
  'state',
])('removes owned dotted hook trust from %s scope without removing ancestor tables', async (scope) => {
  const f = hookFixture();
  const { codexHookTrustEntries } = await import('./codex-hook-trust');
  const [key, hash] = Object.entries(
    codexHookTrustEntries(
      f.declarations,
      'thoth-agents@thoth-plugins:codex-hooks/hooks.json',
      process.platform,
    ),
  )[0];
  const state = JSON.parse(readFileSync(f.state, 'utf8'));
  state.ownedHookTrustKeys = [key];
  writeFileSync(f.state, JSON.stringify(state));
  const header =
    scope === 'root' ? '' : scope === 'hooks' ? '[hooks]\n' : '[hooks.state]\n';
  const prefix =
    scope === 'root' ? 'hooks.state.' : scope === 'hooks' ? 'state.' : '';
  const before = `${header}${prefix}${JSON.stringify(key)}.trusted_hash = ${JSON.stringify(hash)}\n${prefix}other.trusted_hash = "keep"\n`;
  writeFileSync(f.config, before);
  expect(uninstallCodex(f.context).success).toBe(true);
  expect(readFileSync(f.config, 'utf8')).toBe(
    `${header}${prefix}other.trusted_hash = "keep"\n`,
  );
});

it('preserves config bytes when native removal introduces invalid UTF-8 during scalar rebase', () => {
  const f = fixture();
  const changed = Buffer.concat([
    readFileSync(f.config),
    Buffer.from([35, 32, 0x80]),
  ]);
  const result = uninstallCodex({
    ...f.context,
    codexPluginCommandExecutor: () => {
      writeFileSync(f.config, changed);
      return { exitCode: 0, stdout: '{}', stderr: '' };
    },
  });
  expect(result.success).toBe(true);
  expect(readFileSync(f.config)).toEqual(changed);
  expect(result.messages.join('\n')).toContain(
    `Preserve concurrently changed ${f.config}`,
  );
});

it.each([
  '3',
  null,
])('restores dotted thread capacity to %s without redefining agents', (prior) => {
  const f = fixture();
  const state = JSON.parse(readFileSync(f.state, 'utf8'));
  state.priorThreadsValue = prior;
  writeFileSync(f.state, JSON.stringify(state));
  writeFileSync(
    f.config,
    'agents.max_threads = 4\nagents.max_concurrent_threads_per_session = 6 # owned\n[profiles.work]\nmodel = "gpt-5"\n',
  );
  expect(uninstallCodex(f.context).success).toBe(true);
  const after = readFileSync(f.config, 'utf8');
  expect(after).not.toContain('[agents]');
  expect(after).toContain('agents.max_threads = 4');
  if (prior === null)
    expect(after).not.toContain('max_concurrent_threads_per_session');
  else
    expect(after).toContain(
      'agents.max_concurrent_threads_per_session = 3 # owned',
    );
});

it.each([
  'root',
  'role',
  'state',
  'recovery',
])('preserves raw %s bytes changed during native removal despite identical UTF-8 decoding', (target) => {
  const f = fixture();
  const root = join(f.context.codexHome, 'AGENTS.md');
  const recovery = join(
    f.context.codexHome,
    'agents/.thoth-agents-install-recovery.json',
  );
  // Invalid UTF-8 outside managed root markers (or within a TOML comment / JSON string).
  const invalid = (text: string) =>
    Buffer.concat([
      Buffer.from(text),
      Buffer.from([0x80]),
      Buffer.from(
        target === 'root'
          ? '\n<!-- thoth-agents:codex-root:start -->old<!-- thoth-agents:codex-root:end -->\n'
          : target === 'role'
            ? '\n'
            : '"}',
      ),
    ]);
  const path = { root, role: f.role, state: f.state, recovery }[target];
  let original: Buffer;
  if (target === 'root') original = invalid('operator ');
  else if (target === 'role')
    original = invalid(`${readFileSync(f.role, 'utf8')}# operator `);
  else if (target === 'state')
    original = invalid('{"version":1,"models":{},"extension":"');
  else original = invalid('{"version":1,"roles":{},"extension":"');
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, original);
  if (target === 'role') {
    const state = JSON.parse(readFileSync(f.state, 'utf8'));
    state.roleDigests['thoth-agents-worker.toml'] = createHash('sha256')
      .update(original)
      .digest('hex');
    writeFileSync(f.state, JSON.stringify(state));
  }
  const changed = Buffer.from(original);
  changed[changed.indexOf(0x80)] = 0x81;
  expect(changed.toString('utf8')).toBe(original.toString('utf8'));
  const result = uninstallCodex({
    ...f.context,
    codexPluginCommandExecutor: () => {
      writeFileSync(path, changed);
      return { exitCode: 0, stdout: '{}', stderr: '' };
    },
  });
  expect(result.success).toBe(true);
  expect(readFileSync(path)).toEqual(changed);
  expect(result.messages.join('\n')).toContain(
    `Preserve concurrently changed ${path}`,
  );
});
