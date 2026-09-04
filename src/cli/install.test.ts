import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from '../harness/core/owned-skills';
import { applyClaudeCodeSetup } from './claude-code-install';
import { buildCodexSetupPlan } from './codex-install';
import {
  applyCodexPluginSetup,
  buildCodexPluginSetupPlan,
} from './codex-plugin-install';
import { createInstallConfig, install } from './install';
import {
  getInstallLedgerPath,
  readInstallLedger,
  recordCompletedInstall,
} from './install-ledger';
import type { ThothMemSetupResult } from './thoth-mem-install';

const installRequiredSkillMock = vi.hoisted(() =>
  vi.fn(() => ({ status: 'installed' as const })),
);

vi.mock('./skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./skills')>();
  return {
    ...actual,
    installRequiredSkill: installRequiredSkillMock,
  };
});

vi.mock('./codex-plugin-install', () => ({
  buildCodexPluginSetupPlan: vi.fn(() => ({ dryRun: true })),
  formatCodexPluginSetupPlan: vi.fn(() => 'Codex plugin setup plan'),
  applyCodexPluginSetup: vi.fn(() => ({
    success: true,
    changed: [],
    diagnostics: [],
  })),
}));

vi.mock('./codex-install', () => ({
  buildCodexSetupPlan: vi.fn(() => ({ dryRun: true })),
  formatCodexSetupPlan: vi.fn(() => 'Codex setup plan'),
  applyCodexSetup: vi.fn(() => ({
    success: true,
    changed: false,
    diagnostics: [],
  })),
}));

vi.mock('./claude-code-install', () => ({
  buildClaudeCodeSetupPlan: vi.fn(() => ({ dryRun: true })),
  formatClaudeCodeSetupPlan: vi.fn(() => 'Claude setup plan'),
  applyClaudeCodeSetup: vi.fn(() => ({
    success: true,
    changed: false,
    diagnostics: [],
  })),
}));

vi.mock('./config-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config-manager')>();
  return {
    ...actual,
    isOpenCodeInstalled: vi.fn(async () => true),
    getOpenCodeVersion: vi.fn(async () => '1.0.0'),
    getOpenCodePath: vi.fn(() => 'C:/opencode/bin/opencode'),
  };
});

function providerExitCode(
  status: ThothMemSetupResult['status'],
): number | null {
  switch (status) {
    case 'complete':
      return 0;
    case 'failed':
      return 1;
    case 'partial':
      return 2;
    case 'requires_user_action':
      return 3;
    case 'invalid':
      return null;
  }
}

function providerResult(
  harness: 'opencode' | 'codex' | 'claude' | 'pi',
  status: ThothMemSetupResult['status'] = 'complete',
): ThothMemSetupResult {
  return {
    success: status === 'complete',
    evidenceValid: status !== 'invalid',
    status,
    changed: false,
    harness,
    target: `C:/provider/${harness}`,
    steps: [{ name: 'Plan provider setup', outcome: 'planned' }],
    diagnostics: [`provider ${status}`],
    manualActions:
      status === 'complete' ? [] : ['Review provider-owned setup state.'],
    receipt: status === 'partial' ? 'C:/receipts/provider-partial.json' : null,
    command: 'npx',
    args: [
      '-y',
      'thoth-mem@latest',
      'setup',
      harness,
      '--scope',
      'global',
      '--plan',
      '--json',
    ],
    exitCode: providerExitCode(status),
    ...(status === 'invalid' ? { error: 'invalid provider evidence' } : {}),
  };
}

describe('install', () => {
  test('routes Pi through package-declared skills, external skills, provider, and ledger last', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-top-install-'));
    const events: string[] = [];
    let firstPartyInstalled = false;
    const result = await install(
      { tui: false, agent: 'pi' },
      {
        homeDir,
        resolveExecutingPackageVersion: () => ({
          ok: true,
          version: '0.6.0',
          packageRoot: process.cwd(),
        }),
        verifyPiFirstParty: ({ source, version }) => ({
          success: true,
          receipt: {
            schemaVersion: 1,
            owner: 'thoth-agents',
            scope: 'user',
            packageName: 'thoth-agents',
            source,
            installSource: source,
            version,
            manifestSha256: 'a'.repeat(64),
            extensionSha256: 'b'.repeat(64),
          },
        }),
        piCommandExecutor: (command, args) => {
          if (command === 'node')
            return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
          if (args[0] === '--version')
            return { exitCode: 0, stdout: '0.84.4', stderr: '' };
          if (args[0] === 'list')
            return {
              exitCode: 0,
              stdout: `${firstPartyInstalled ? `npm:thoth-agents@0.6.0\n    ${process.cwd()}\n` : ''}npm:pi-subagents-j0k3r@1.5.9\nnpm:@upstash/context7-pi@0.1.2\nnpm:@feniix/pi-exa@5.1.1\nnpm:pi-mcp-adapter@2.32.1`,
              stderr: '',
            };
          events.push(`package:${args[1]}`);
          if (args[1] === 'npm:thoth-agents@0.6.0') firstPartyInstalled = true;
          return { exitCode: 0, stdout: 'installed', stderr: '' };
        },
        installRequiredSkill: (skill, harness) => {
          events.push(`external:${skill.name}`);
          return {
            skill,
            harness,
            status: 'installed',
            skillPath: join(
              homeDir,
              '.pi',
              'agent',
              'skills',
              skill.name,
              'SKILL.md',
            ),
          };
        },
        runThothMemSetup: ({ harness }) => {
          events.push('provider');
          return providerResult(harness);
        },
        installLedgerOptions: { configRoot: join(homeDir, '.config') },
      },
    );

    expect(result).toBe(0);
    expect(events).toEqual([
      'package:npm:thoth-agents@0.6.0',
      'package:npm:pi-subagents-j0k3r@1.5.9',
      'package:npm:@upstash/context7-pi@0.1.2',
      'package:npm:@feniix/pi-exa@5.1.1',
      'package:npm:pi-mcp-adapter@2.32.1',
      'external:simplify',
      'external:tdd',
      'external:progressive-context-router',
      'external:architectural-grilling',
      'provider',
    ]);
    expect(
      readInstallLedger({ configRoot: join(homeDir, '.config') }),
    ).toMatchObject({
      status: 'valid',
      ledger: { harnesses: { pi: { version: '0.6.0' } } },
    });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test('Pi install inspects package-declared skills from the verified configured root instead of the executing root', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-install-roots-'));
    const executingRoot = process.cwd();
    const configuredRoot = join(homeDir, 'pi-installed', 'thoth-agents');
    let inspectedRoot = '';
    try {
      const result = await install(
        { tui: false, agent: 'pi' },
        {
          homeDir,
          resolveExecutingPackageVersion: () => ({
            ok: true,
            version: '0.6.0',
            packageRoot: executingRoot,
          }),
          applyPiSetup: () => ({
            success: true,
            changed: [],
            diagnostics: [],
            installedPackages: ['npm:thoth-agents@0.6.0'],
            receiptCommitted: true,
            configuredPackageRoot: configuredRoot,
          }),
          inspectPiPackageSkills: ({ packageRoot }) => {
            inspectedRoot = packageRoot;
            return {
              success: true,
              state: 'available',
              issues: [],
              skills: THOTH_OWNED_SKILL_NAMES.map((name) => ({
                name,
                sourcePath: join(packageRoot, 'skills', name),
                destinationPath: join(packageRoot, 'skills', name),
              })),
            };
          },
          installRequiredSkill: (skill, harness) => ({
            skill,
            harness,
            status: 'installed',
            skillPath: join(homeDir, '.pi', 'agent', 'skills', skill.name),
          }),
          runThothMemSetup: ({ harness }) => providerResult(harness),
          installLedgerOptions: { configRoot: join(homeDir, '.config') },
        },
      );

      expect(result).toBe(0);
      expect(inspectedRoot).toBe(configuredRoot);
      expect(inspectedRoot).not.toBe(executingRoot);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Pi dry-run previews the full pipeline with no command, file, provider, or ledger mutation', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-top-dry-'));
    let piCommands = 0;
    const result = await install(
      { tui: false, agent: 'pi', dryRun: true },
      {
        homeDir,
        resolveExecutingPackageVersion: () => ({ ok: true, version: '0.6.0' }),
        piCommandExecutor: () => {
          piCommands += 1;
          return { exitCode: 0, stdout: '', stderr: '' };
        },
        runThothMemSetup: ({ harness }) => providerResult(harness),
        installLedgerOptions: { configRoot: join(homeDir, '.config') },
      },
    );
    expect(result).toBe(0);
    expect(piCommands).toBe(0);
    expect(
      readInstallLedger({ configRoot: join(homeDir, '.config') }).status,
    ).toBe('missing');
    expect(existsSync(join(homeDir, '.pi'))).toBe(false);
    rmSync(homeDir, { recursive: true, force: true });
  });
  test('createInstallConfig has no optional skill switch', () => {
    const config = createInstallConfig({
      tui: false,
      tmux: 'no',
      reset: false,
    });

    expect(config).not.toHaveProperty('installSkills');
    expect(config).not.toHaveProperty('installCustomSkills');
  });

  test('createInstallConfig keeps only harness install settings', () => {
    const config = createInstallConfig({
      tui: false,
      tmux: 'yes',
      dryRun: true,
      reset: true,
    });

    expect(config).not.toHaveProperty('installSkills');
    expect(config).not.toHaveProperty('installCustomSkills');
    expect(config.hasTmux).toBe(true);
    expect(config.dryRun).toBe(true);
    expect(config.reset).toBe(true);
  });

  test('createInstallConfig keeps OpenCode installer behavior when Codex is configured elsewhere', () => {
    const config = createInstallConfig({
      tui: false,
      dryRun: true,
      reset: false,
    });

    expect(config).not.toHaveProperty('harness');
    expect(config).not.toHaveProperty('installCustomSkills');
  });

  test('Codex installation applies the native plugin-manager plan', async () => {
    vi.clearAllMocks();
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'codex',
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        { runThothMemSetup: () => providerResult('codex') },
      );

      expect(code).toBe(0);
      expect(buildCodexPluginSetupPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
          projectRoot: process.cwd(),
        }),
      );
      expect(applyCodexPluginSetup).toHaveBeenCalledOnce();
      expect(lines.join('\n')).toContain('Codex plugin setup plan');
    } finally {
      console.log = originalLog;
    }
  });

  test('Codex installation stops before managed files when the native manager fails', async () => {
    vi.clearAllMocks();
    vi.mocked(applyCodexPluginSetup).mockReturnValueOnce({
      success: false,
      changed: [],
      diagnostics: ['manager unavailable'],
      error: 'Codex native plugin manager state is not safe to mutate.',
    });
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'codex',
          tui: false,
          tmux: 'no',
          dryRun: false,
          reset: false,
        },
        { runThothMemSetup: () => providerResult('codex') },
      );

      expect(code).toBe(1);
      expect(buildCodexSetupPlan).not.toHaveBeenCalled();
      expect(lines.join('\n')).toContain(
        'Codex plugin install failed: Codex native plugin manager state is not safe to mutate.',
      );
    } finally {
      console.log = originalLog;
    }
  });

  test.each([
    'opencode',
    'codex',
    'claude',
  ] as const)('%s dry-run completes only after shared thoth-mem setup planning', async (agent) => {
    const lines: string[] = [];
    const originalLog = console.log;
    const runThothMemSetup = vi.fn(() => providerResult(agent));
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent,
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        { runThothMemSetup },
      );
      const output = lines.join('\n');

      expect(code).toBe(0);
      expect(runThothMemSetup).toHaveBeenCalledOnce();
      expect(runThothMemSetup).toHaveBeenCalledWith(
        expect.objectContaining({ harness: agent, dryRun: true }),
      );
      expect(output).toContain('thoth-mem setup plan confirmed');
      expect(output).toContain('provider complete');
      expect(output).toContain('Required external skills');
    } finally {
      console.log = originalLog;
    }
  });

  test('OpenCode dry-run reports the complete combined installation contract', async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'opencode',
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        { runThothMemSetup: () => providerResult('opencode') },
      );
      const output = lines.join('\n');

      expect(code).toBe(0);
      expect(output).toMatch(/thoth-agents (?:installation complete|updated)!/);
      expect(output).not.toContain('Delegation results persisted to disk');
      expect(output).not.toContain('thoth-mem memory defaults');
      expect(output).toContain('thoth-mem setup plan confirmed');
      expect(output).toContain(
        'thoth-mem remains the owner of hooks, MCP, skill, lifecycle, persistence, receipts, and recovery.',
      );
      expect(output).toContain('simplify');
      expect(output).toContain('tdd');
      expect(output).toContain('progressive-context-router');
      expect(output).toContain('architectural-grilling');
      expect(output).toContain('thoth-init');
      expect(output).toContain('thoth-sdd');
      expect(output).toContain('thoth-constitution');
      expect(output).toContain('thoth-archive');
      expect(output).toContain('plan-reviewer');
      expect(output).not.toContain('playwright-cli');
      expect(output).toContain('opencode');
    } finally {
      console.log = originalLog;
    }
  });

  test('OpenCode installation rejects unresolved package identity before config mutation', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'thoth-install-identity-'));
    const configDir = join(configRoot, 'opencode');
    const configPath = join(configDir, 'opencode.json');
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, '{"plugin":["user-plugin"]}');
    process.env.XDG_CONFIG_HOME = configRoot;
    const resolvePackageVersion = vi.fn(() => ({
      ok: false as const,
      error: {
        code: 'package-version-invalid' as const,
        message: 'Executing package metadata has no valid semantic version.',
      },
    }));
    const updateMainConfig = vi.fn(() => ({
      success: true,
      configPath,
    }));
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const code = await install(
        {
          agent: 'opencode',
          tui: false,
          tmux: 'no',
          dryRun: false,
          reset: false,
        },
        {
          resolveExecutingPackageVersion: resolvePackageVersion,
          updateOpenCodeMainConfig: updateMainConfig,
        },
      );

      expect(code).toBe(1);
      expect(resolvePackageVersion).toHaveBeenCalledOnce();
      expect(updateMainConfig).not.toHaveBeenCalled();
      expect(readFileSync(configPath, 'utf8')).toBe(
        '{"plugin":["user-plugin"]}',
      );
      expect(existsSync(`${configPath}.bak`)).toBe(false);
    } finally {
      console.log = originalLog;
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
      rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('OpenCode installation passes the approved exact version to config mutation', async () => {
    const effects: string[] = [];
    const updateMainConfig = vi.fn(() => {
      effects.push('config');
      return {
        success: false,
        configPath: 'C:/opencode/opencode.json',
        error: 'stop after observing config request',
      };
    });
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const code = await install(
        {
          agent: 'opencode',
          tui: false,
          tmux: 'no',
          dryRun: false,
          reset: false,
        },
        {
          resolveExecutingPackageVersion: () => {
            effects.push('identity');
            return {
              ok: true,
              version: '0.4.8-beta.1',
              packageRoot: 'C:/thoth-agents',
            };
          },
          updateOpenCodeMainConfig: updateMainConfig,
        },
      );

      expect(code).toBe(1);
      expect(effects).toEqual(['identity', 'config']);
      expect(updateMainConfig).toHaveBeenCalledWith({
        ensurePlugin: true,
        pluginVersion: '0.4.8-beta.1',
        disableDefaults: true,
      });
    } finally {
      console.log = originalLog;
    }
  });

  test.each([
    'codex',
    'claude',
  ] as const)('%s installation rejects unresolved package identity before native mutation', async (agent) => {
    vi.clearAllMocks();
    const resolvePackageVersion = vi.fn(() => ({
      ok: false as const,
      error: {
        code: 'package-version-invalid' as const,
        message: 'Executing package metadata has no valid semantic version.',
      },
    }));
    const runProvider = vi.fn(() => providerResult(agent));
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const code = await install(
        {
          agent,
          tui: false,
          tmux: 'no',
          dryRun: false,
          reset: false,
        },
        {
          resolveExecutingPackageVersion: resolvePackageVersion,
          runThothMemSetup: runProvider,
        },
      );

      expect(code).toBe(1);
      expect(resolvePackageVersion).toHaveBeenCalledOnce();
      expect(runProvider).not.toHaveBeenCalled();
      if (agent === 'codex') {
        expect(applyCodexPluginSetup).not.toHaveBeenCalled();
      } else {
        expect(applyClaudeCodeSetup).not.toHaveBeenCalled();
      }
    } finally {
      console.log = originalLog;
    }
  });

  test('records independent versions after every explicit harness install succeeds', async () => {
    vi.clearAllMocks();
    installRequiredSkillMock.mockReturnValue({ status: 'installed' });
    const configRoot = mkdtempSync(join(tmpdir(), 'thoth-explicit-ledger-'));
    const homeDir = join(configRoot, 'home');
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const originalOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = configRoot;
    process.env.OPENCODE_CONFIG_DIR = join(configRoot, 'opencode');
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      for (const agent of ['opencode', 'codex', 'claude'] as const) {
        const code = await install(
          {
            agent,
            tui: false,
            tmux: 'no',
            dryRun: false,
            reset: false,
          },
          {
            homeDir,
            resolveExecutingPackageVersion: () => ({
              ok: true,
              version: '0.4.8',
              packageRoot: process.cwd(),
            }),
            runThothMemSetup: () => providerResult(agent),
            installLedgerOptions: { configRoot },
          },
        );
        expect(code).toBe(0);
      }

      expect(readInstallLedger({ configRoot })).toEqual({
        status: 'valid',
        path: getInstallLedgerPath({ configRoot }),
        ledger: {
          schemaVersion: 1,
          harnesses: {
            opencode: { version: '0.4.8' },
            codex: { version: '0.4.8' },
            claude: { version: '0.4.8' },
          },
        },
      });
    } finally {
      console.log = originalLog;
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
      if (originalOpenCodeConfigDir === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR;
      } else {
        process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfigDir;
      }
      rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('provider failure does not advance an explicit install record', async () => {
    vi.clearAllMocks();
    const configRoot = mkdtempSync(join(tmpdir(), 'thoth-provider-ledger-'));
    expect(
      recordCompletedInstall({
        harness: 'codex',
        version: '0.4.7',
        configRoot,
      }).success,
    ).toBe(true);
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const code = await install(
        {
          agent: 'codex',
          tui: false,
          tmux: 'no',
          dryRun: false,
          reset: false,
        },
        {
          resolveExecutingPackageVersion: () => ({
            ok: true,
            version: '0.4.8',
            packageRoot: process.cwd(),
          }),
          runThothMemSetup: () => providerResult('codex', 'partial'),
          installLedgerOptions: { configRoot },
        },
      );

      expect(code).toBe(1);
      expect(readInstallLedger({ configRoot })).toMatchObject({
        status: 'valid',
        ledger: { harnesses: { codex: { version: '0.4.7' } } },
      });
    } finally {
      console.log = originalLog;
      rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('ledger failure makes explicit installation fail without advancing the record', async () => {
    vi.clearAllMocks();
    const configRoot = mkdtempSync(join(tmpdir(), 'thoth-ledger-failure-'));
    expect(
      recordCompletedInstall({
        harness: 'claude',
        version: '0.4.7',
        configRoot,
      }).success,
    ).toBe(true);
    const ledgerPath = getInstallLedgerPath({ configRoot });
    mkdirSync(`${ledgerPath}.tmp`);
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const code = await install(
        {
          agent: 'claude',
          tui: false,
          tmux: 'no',
          dryRun: false,
          reset: false,
        },
        {
          resolveExecutingPackageVersion: () => ({
            ok: true,
            version: '0.4.8',
            packageRoot: process.cwd(),
          }),
          runThothMemSetup: () => providerResult('claude'),
          installLedgerOptions: { configRoot },
        },
      );

      expect(code).toBe(1);
      expect(readInstallLedger({ configRoot })).toMatchObject({
        status: 'valid',
        ledger: { harnesses: { claude: { version: '0.4.7' } } },
      });
    } finally {
      console.log = originalLog;
      rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('OpenCode stops before provider setup when the owned bundle is incomplete', async () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-owned-missing-'));
    const lines: string[] = [];
    const originalLog = console.log;
    const runThothMemSetup = vi.fn(() => providerResult('opencode'));
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'opencode',
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        { runThothMemSetup, opencodeOwnedSkillPackageRoot: packageRoot },
      );

      expect(code).toBe(1);
      expect(runThothMemSetup).not.toHaveBeenCalled();
      expect(lines.join('\n')).not.toContain('thoth-mem setup plan confirmed');
    } finally {
      console.log = originalLog;
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('does not claim combined installation success for partial provider setup', async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'opencode',
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        {
          runThothMemSetup: () => providerResult('opencode', 'partial'),
        },
      );
      const output = lines.join('\n');

      expect(code).toBe(1);
      expect(output).toContain('thoth-mem setup is incomplete: partial');
      expect(output).toContain('Review provider-owned setup state.');
      expect(output).toContain('C:/receipts/provider-partial.json');
      expect(output).not.toMatch(/installation complete!/);
    } finally {
      console.log = originalLog;
    }
  });
});
