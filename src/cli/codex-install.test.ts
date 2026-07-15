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
import { describe, expect, test } from 'vitest';
import { DEFAULT_THOTH_COMMAND } from '../config';
import {
  applyCodexManagedModelOverrides,
  applyCodexSetup,
  buildCodexSetupPlan,
  CODEX_ROLE_NAMES,
  formatCodexSetupPlan,
  parseRoleTomlEffort,
  replaceRoleTomlEffort,
} from './codex-install';

const FORBIDDEN_CODEX_ADAPTATION_MARKERS = [
  '<codex-adaptation>',
  '</codex-adaptation>',
  '<codex-root-adaptation>',
  '</codex-root-adaptation>',
  'codex-adaptation',
  'codex-root-adaptation',
  'Codex prompt notes',
  'Codex root coordination notes',
  'opencode-role-contract',
  'OpenCode role contract',
  'adapted from OpenCode',
  'same behavior in Codex',
  'Codex adaptation',
  'OpenCode-equivalent',
] as const;

const PACKAGE_ROOT = process.cwd();

function expectNoLeakedCodexAdaptationMarkers(content: string): void {
  for (const marker of FORBIDDEN_CODEX_ADAPTATION_MARKERS) {
    expect(content).not.toContain(marker);
  }
}

function rolePath(home: string, role: string): string {
  return join(home, '.codex', 'agents', `thoth-agents-${role}.toml`);
}

function managedModelsPath(home: string): string {
  return join(home, '.codex', 'agents', '.thoth-agents-managed-models.json');
}

function roleModel(content: string): string | undefined {
  return /^model\s*=\s*"([^"]+)"\s*$/m.exec(content)?.[1];
}

function replaceRoleModel(content: string, model: string): string {
  return content.replace(/^model\s*=\s*"[^"]+"\s*$/m, `model = "${model}"`);
}

function readManagedModels(home: string): Record<string, string> {
  return readManagedModelState(home).models;
}

function readManagedModelState(home: string): {
  models: Record<string, string>;
  configuredModels?: Record<string, string>;
} {
  return JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
}

function applyFreshCodexSetup(dir: string, home: string, reset = false): void {
  const result = applyCodexSetup(
    buildCodexSetupPlan({
      dryRun: false,
      reset,
      scope: 'user',
      projectRoot: dir,
      homeDir: home,
      packageRoot: PACKAGE_ROOT,
    }),
  );

  expect(result.success).toBe(true);
}

describe('Codex install setup plan', () => {
  test('effort TOML helpers add, replace, and remove only the owned field', () => {
    const content = 'model = "gpt-5.6-sol"\nsandbox_mode = "read-only"\n';
    const added = replaceRoleTomlEffort(content, 'max');
    expect(parseRoleTomlEffort(added)).toBe('max');
    expect(added).toContain('sandbox_mode = "read-only"');
    const replaced = replaceRoleTomlEffort(added, 'ultra');
    expect(parseRoleTomlEffort(replaced)).toBe('ultra');
    const removed = replaceRoleTomlEffort(replaced, undefined);
    expect(parseRoleTomlEffort(removed)).toBeUndefined();
    expect(removed).toBe(content);
  });
  test('fresh plan emits the confirmed model and effort defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-defaults-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });
      const expected = {
        oracle: { model: 'gpt-5.6-sol', effort: 'high' },
        librarian: { model: 'gpt-5.6-luna', effort: 'low' },
        explorer: { model: 'gpt-5.6-luna', effort: 'low' },
        designer: { model: 'gpt-5.6-terra', effort: 'high' },
        quick: { model: 'gpt-5.6-luna', effort: 'medium' },
        deep: { model: 'gpt-5.6-terra', effort: 'xhigh' },
      } as const;

      for (const [role, defaults] of Object.entries(expected)) {
        const item = plan.items.find(
          (candidate) =>
            candidate.action === 'write-role-toml' && candidate.role === role,
        );
        expect(roleModel(String(item?.content))).toBe(defaults.model);
        expect(parseRoleTomlEffort(String(item?.content))).toBe(
          defaults.effort,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('builds dry-run plan when caller cwd is outside the package repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-dlx-install-'));
    const callerProject = join(dir, 'caller-project');
    const home = join(dir, 'home');

    try {
      mkdirSync(callerProject, { recursive: true });
      const previousCwd = process.cwd();
      process.chdir(callerProject);
      try {
        const plan = buildCodexSetupPlan({
          dryRun: true,
          reset: false,
          scope: 'user',
          projectRoot: callerProject,
          homeDir: home,
        });

        expect(plan.dryRun).toBe(true);
        expect(
          plan.items.some((item) => item.kind === 'personal-plugin-source'),
        ).toBe(true);
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dry-run reports complete managed plan and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });

      const itemKinds = plan.items.map((item) => item.kind);

      expect(itemKinds).toEqual(
        expect.arrayContaining([
          'root-instructions',
          'managed-model-state',
          'personal-plugin-source',
          'personal-marketplace',
          'user-config',
        ]),
      );
      expect(itemKinds).not.toContain('plugin-package');
      expect(
        plan.items
          .filter((item) => item.kind === 'role-subagent-toml')
          .map((item) => item.role),
      ).toEqual(CODEX_ROLE_NAMES);
      expect(plan.items.some((item) => item.role === 'orchestrator')).toBe(
        false,
      );
      expect(
        plan.items.some(
          (item) =>
            item.kind === 'managed-model-state' &&
            item.targetPath === managedModelsPath(join(dir, 'home')),
        ),
      ).toBe(true);
      expect(plan.diagnostics.join('\n')).toContain('/plugins');
      expect(plan.diagnostics.join('\n')).toContain('/hooks');
      expect(plan.diagnostics.join('\n')).toContain(
        'features.default_mode_request_user_input',
      );
      expect(applyCodexSetup(plan).success).toBe(true);
      expect(existsSync(join(dir, '.codex-plugin'))).toBe(false);
      expect(
        existsSync(join(dir, 'home', '.codex', 'plugins', 'thoth-agents')),
      ).toBe(false);
      expect(
        existsSync(join(dir, 'home', '.agents', 'plugins', 'marketplace.json')),
      ).toBe(false);
      expect(existsSync(managedModelsPath(join(dir, 'home')))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('formats dry-run with only Personal plugin source package refresh', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });

      const formatted = formatCodexSetupPlan(plan);
      const refreshLines = formatted
        .split('\n')
        .filter((line) => line.startsWith('- refresh-package:'));

      expect(refreshLines).toHaveLength(1);
      expect(refreshLines[0]).toContain('Refresh Personal Codex plugin source');
      expect(refreshLines[0]).toContain(' files.');
      expect(refreshLines[0]).toContain(
        join(dir, 'home', '.codex', 'plugins', 'thoth-agents'),
      );
      expect(refreshLines[0]).not.toContain(join(dir, '.codex-plugin'));
      expect(formatted).not.toContain('.codex-plugin/skills/');
      expect(formatted).not.toContain('.codex-plugin/agents/');
      expect(formatted).not.toContain(
        'Refresh documented .codex-plugin package',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('keeps diagnostics out of formatted plan for single canonical printing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });

      const formatted = formatCodexSetupPlan(plan);
      const applyResult = applyCodexSetup(plan);
      const diagnostics = applyResult.diagnostics;

      expect(formatted).not.toContain(plan.diagnostics[0] ?? '');
      expect(formatted).not.toContain(plan.disclaimers[0] ?? '');
      expect(new Set(diagnostics).size).toBe(diagnostics.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('apply preserves root instructions, backs up existing files, writes six roles and generates Personal plugin source only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const agentsFile = join(home, '.codex', 'AGENTS.md');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(agentsFile, 'User guidance\n', { flush: true });
      const plan = buildCodexSetupPlan({
        dryRun: false,
        reset: true,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      const result = applyCodexSetup(plan);

      expect(result.success).toBe(true);
      const root = readFileSync(agentsFile, 'utf8');
      expect(root).toContain('User guidance');
      expect(root).toContain('thoth-agents:codex-root:start');
      expect(root).toContain('thoth-agents:codex-root:start -->\n<role>');
      expect(root).toContain('delegate-first root coordinator');
      expect(root).toContain(
        'small bounded local inspection when cheaper, faster, or clearer than delegation',
      );
      expect(root).toContain(
        'Delegate broad search, multi-file edits, risky verification, UI visual QA, independent review',
      );
      expect(root).toContain(
        'Verify material user/agent claims before relying on them',
      );
      expect(root).toContain(
        'correct it plainly, explain tradeoffs, and offer alternatives',
      );
      expect(root).toContain('net quality, speed, cost, and reliability');
      expect(root).toContain('Internal handoff fields');
      expect(root).toContain('Hard gates');
      expect(root).toContain('Plan gate: after tasks');
      expect(root).toContain('load `executing-plans`');
      expect(root).toContain(
        'Visual or UX work and screenshots always go to designer',
      );
      expect(root).toContain('Root-session memory is yours');
      expect(root).toContain('request_user_input');
      expect(root).toContain('Default mode');
      expect(root).toContain(
        'Whenever the root orchestrator calls `request_user_input`, it MUST NEVER set or pass `autoResolutionMs`; omit the field entirely.',
      );
      expect(root).not.toContain('Use `question` only');
      expect(root).not.toContain('@designer');
      expectNoLeakedCodexAdaptationMarkers(root);
      expect(readFileSync(`${agentsFile}.bak`, 'utf8')).toBe('User guidance\n');
      for (const role of CODEX_ROLE_NAMES) {
        const agentPath = rolePath(home, role);
        expect(existsSync(agentPath)).toBe(true);
        const roleToml = readFileSync(agentPath, 'utf8');
        expectNoLeakedCodexAdaptationMarkers(roleToml);
        expect(roleToml).toContain('developer_instructions = """\n<role>');
        expect(roleToml).not.toContain('mcp_servers');
        expect(roleToml).not.toContain('skills.config');
        expect(roleToml).not.toContain('[skills');
        expect(roleToml).not.toContain('hooks =');
        expect(roleToml).not.toContain('[hooks');
      }
      expect(readManagedModels(home)).toEqual(
        Object.fromEntries(
          CODEX_ROLE_NAMES.map((role) => [
            `thoth-agents-${role}.toml`,
            roleModel(readFileSync(rolePath(home, role), 'utf8')),
          ]),
        ),
      );
      expect(
        existsSync(
          join(home, '.codex', 'agents', 'thoth-agents-orchestrator.toml'),
        ),
      ).toBe(false);
      expect(existsSync(join(dir, '.codex-plugin'))).toBe(false);
      const personalPluginRoot = join(
        home,
        '.codex',
        'plugins',
        'thoth-agents',
      );
      expect(existsSync(join(personalPluginRoot, 'plugin.json'))).toBe(false);
      expect(existsSync(join(personalPluginRoot, 'skills'))).toBe(true);
      expect(
        existsSync(join(personalPluginRoot, 'skills', 'sdd-apply', 'SKILL.md')),
      ).toBe(true);
      const personalManifest = JSON.parse(
        readFileSync(
          join(personalPluginRoot, '.codex-plugin', 'plugin.json'),
          'utf8',
        ),
      );
      const marketplace = JSON.parse(
        readFileSync(
          join(home, '.agents', 'plugins', 'marketplace.json'),
          'utf8',
        ),
      );
      expect(personalManifest.name).toBe('thoth-agents');
      expect(personalManifest.mcpServers).toBe('./.mcp.json');
      expect(personalManifest.hooks).toBeUndefined();
      expect(personalManifest.customAgents).toBeUndefined();
      expect(personalManifest.orchestrator).toBeUndefined();
      expect(existsSync(join(personalPluginRoot, '.mcp.json'))).toBe(true);
      expect(existsSync(join(personalPluginRoot, 'hooks', 'hooks.json'))).toBe(
        false,
      );
      expect(
        JSON.parse(readFileSync(join(personalPluginRoot, '.mcp.json'), 'utf8')),
      ).toEqual({
        mcpServers: {
          thoth_mem: {
            command: DEFAULT_THOTH_COMMAND[0],
            args: DEFAULT_THOTH_COMMAND.slice(1),
          },
          exa: {
            command: 'npx',
            args: ['-y', 'exa-mcp-server'],
          },
          context7: { url: 'https://mcp.context7.com/mcp' },
          grep_app: { url: 'https://mcp.grep.app' },
        },
      });
      expect(marketplace.plugins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'thoth-agents',
            source: {
              source: 'local',
              path: './.codex/plugins/thoth-agents',
            },
            policy: {
              installation: 'AVAILABLE',
              authentication: 'ON_INSTALL',
            },
            category: 'Productivity',
          }),
        ]),
      );
      expect(
        readFileSync(join(home, '.codex', 'config.toml'), 'utf8'),
      ).toContain('default_mode_request_user_input = true');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('generates Personal plugin source when repo-local canonical package is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const personalPluginRoot = join(
        home,
        '.codex',
        'plugins',
        'thoth-agents',
      );
      mkdirSync(personalPluginRoot, { recursive: true });
      writeFileSync(
        join(personalPluginRoot, 'plugin.json'),
        '{"stale":true}\n',
      );
      const result = applyCodexSetup(
        buildCodexSetupPlan({
          dryRun: false,
          reset: true,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(existsSync(join(dir, '.codex-plugin'))).toBe(false);
      expect(existsSync(personalPluginRoot)).toBe(true);
      expect(
        existsSync(join(personalPluginRoot, '.codex-plugin', 'plugin.json')),
      ).toBe(true);
      expect(existsSync(join(personalPluginRoot, 'skills'))).toBe(true);
      expect(
        existsSync(join(personalPluginRoot, 'skills', 'sdd-apply', 'SKILL.md')),
      ).toBe(true);
      expect(existsSync(join(personalPluginRoot, '.mcp.json'))).toBe(true);
      expect(existsSync(join(personalPluginRoot, 'hooks', 'hooks.json'))).toBe(
        false,
      );
      expect(existsSync(join(personalPluginRoot, 'plugin.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('copies bundled skill files from package root when caller cwd is outside the package repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-dlx-install-'));
    const callerProject = join(dir, 'caller-project');
    const home = join(dir, 'home');
    const packageRoot = process.cwd();

    try {
      mkdirSync(callerProject, { recursive: true });
      const previousCwd = process.cwd();
      process.chdir(callerProject);
      try {
        const result = applyCodexSetup(
          buildCodexSetupPlan({
            dryRun: false,
            reset: true,
            scope: 'user',
            projectRoot: callerProject,
            homeDir: home,
            packageRoot,
          }),
        );

        const personalPluginRoot = join(
          home,
          '.codex',
          'plugins',
          'thoth-agents',
        );
        const skillPath = join(
          personalPluginRoot,
          'skills',
          'sdd-apply',
          'SKILL.md',
        );
        const skillManifest = JSON.parse(
          readFileSync(
            join(personalPluginRoot, 'skills', '.thoth-agents-manifest.json'),
            'utf8',
          ),
        ) as { skills?: Array<{ name?: string; outputPath?: string }> };

        expect(result.success).toBe(true);
        expect(result.diagnostics.join('\n')).not.toContain(
          'codex.skill.source_missing',
        );
        expect(existsSync(skillPath)).toBe(true);
        expect(readFileSync(skillPath, 'utf8')).toContain('sdd-apply');
        expect(skillManifest.skills).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'sdd-apply',
              outputPath: '.codex-plugin/skills/sdd-apply/SKILL.md',
            }),
          ]),
        );
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('marketplace merge preserves unrelated plugins and refreshes managed entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const marketplacePath = join(
        home,
        '.agents',
        'plugins',
        'marketplace.json',
      );
      mkdirSync(join(home, '.agents', 'plugins'), { recursive: true });
      writeFileSync(
        marketplacePath,
        JSON.stringify(
          {
            name: 'personal-marketplace',
            plugins: [
              { name: 'other-plugin', source: './plugins/other' },
              {
                name: 'thoth-agents',
                source: { source: 'local', path: './stale' },
                category: 'Stale',
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = applyCodexSetup(
        buildCodexSetupPlan({
          dryRun: false,
          reset: true,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      );

      expect(result.success).toBe(true);
      const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
      expect(marketplace.plugins).toHaveLength(2);
      expect(marketplace.plugins[0]).toEqual({
        name: 'other-plugin',
        source: './plugins/other',
      });
      expect(marketplace.plugins[1]).toEqual(
        expect.objectContaining({
          name: 'thoth-agents',
          category: 'Productivity',
          source: {
            source: 'local',
            path: './.codex/plugins/thoth-agents',
          },
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('setup preserves installed effort and treats an absent field as inherit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-effort-current-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const deep = rolePath(home, 'deep');
      const explorer = rolePath(home, 'explorer');
      writeFileSync(
        deep,
        replaceRoleTomlEffort(readFileSync(deep, 'utf8'), 'high'),
      );
      writeFileSync(
        explorer,
        replaceRoleTomlEffort(readFileSync(explorer, 'utf8'), undefined),
      );
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      state.configuredEfforts = {
        'thoth-agents-explorer.toml': 'high',
      };
      writeFileSync(managedModelsPath(home), JSON.stringify(state, null, 2));

      applyFreshCodexSetup(dir, home);

      expect(parseRoleTomlEffort(readFileSync(deep, 'utf8'))).toBe('high');
      expect(
        parseRoleTomlEffort(readFileSync(explorer, 'utf8')),
      ).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('model-only Codex override preserves installed effort until explicitly cleared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-effort-model-only-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const deep = rolePath(home, 'deep');
      writeFileSync(
        deep,
        replaceRoleTomlEffort(readFileSync(deep, 'utf8'), 'high'),
      );

      const installConfig = {
        dryRun: false,
        reset: false,
        scope: 'user' as const,
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      };
      expect(
        applyCodexManagedModelOverrides(installConfig, [
          { role: 'deep', model: 'openai/gpt-5.3-codex-spark' },
        ]).success,
      ).toBe(true);
      expect.soft(roleModel(readFileSync(deep, 'utf8'))).toBe(
        'gpt-5.3-codex-spark',
      );
      expect(parseRoleTomlEffort(readFileSync(deep, 'utf8'))).toBe('high');
      const state = readManagedModelState(home);
      expect(state.models['thoth-agents-deep.toml']).toBe('gpt-5.6-terra');
      expect.soft(state.configuredModels?.['thoth-agents-deep.toml']).toBe(
        'gpt-5.3-codex-spark',
      );
      expect(state.models['thoth-agents-deep.toml']).not.toBe(
        state.configuredModels?.['thoth-agents-deep.toml'],
      );
      expect(existsSync(`${deep}.bak`)).toBe(true);
      expect(existsSync(`${managedModelsPath(home)}.bak`)).toBe(true);

      expect(
        applyCodexManagedModelOverrides(installConfig, [
          {
            role: 'deep',
            model: 'openai/gpt-5.3-codex-spark',
            clearEffort: true,
          },
        ]).success,
      ).toBe(true);
      expect(parseRoleTomlEffort(readFileSync(deep, 'utf8'))).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('explicit Codex apply restores a providerless baseline after a prefixed user-owned model', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-user-owned-prefixed-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'deep');
      writeFileSync(
        target,
        replaceRoleModel(
          readFileSync(target, 'utf8'),
          'openai/user-custom-model',
        ),
      );

      const before = readManagedModelState(home);
      expect(before.models['thoth-agents-deep.toml']).toBe('gpt-5.6-terra');
      expect(
        applyCodexManagedModelOverrides(
          {
            dryRun: false,
            reset: false,
            scope: 'user',
            projectRoot: dir,
            homeDir: home,
            packageRoot: PACKAGE_ROOT,
          },
          [{ role: 'deep', model: 'gpt-5.3-codex-spark' }],
        ).success,
      ).toBe(true);

      const state = readManagedModelState(home);
      expect(roleModel(readFileSync(target, 'utf8'))).toBe(
        'gpt-5.3-codex-spark',
      );
      expect(state.models['thoth-agents-deep.toml']).toBe('gpt-5.6-terra');
      expect(state.configuredModels?.['thoth-agents-deep.toml']).toBe(
        'gpt-5.3-codex-spark',
      );
      expect(state.models['thoth-agents-deep.toml']).not.toContain('openai/');
      expect(
        state.configuredModels?.['thoth-agents-deep.toml'],
      ).not.toContain('openai/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('preserves user-customized Codex role model', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'deep');
      const installed = readFileSync(target, 'utf8');
      writeFileSync(
        target,
        replaceRoleModel(installed, 'user-custom-model').replace(
          'sandbox_mode = "workspace-write"',
          'sandbox_mode = "read-only"',
        ),
      );

      applyFreshCodexSetup(dir, home);

      const updated = readFileSync(target, 'utf8');
      expect(roleModel(updated)).toBe('user-custom-model');
      expect(parseRoleTomlEffort(updated)).toBe('xhigh');
      expect(updated).not.toContain('toggle');
      expect(updated).not.toContain('budget_tokens');
      expect(updated).toContain('sandbox_mode = "workspace-write"');
      expect(readManagedModels(home)['thoth-agents-deep.toml']).toBe(
        roleModel(installed),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('updates managed Codex role model', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const target = rolePath(home, 'quick');
      mkdirSync(join(home, '.codex', 'agents'), { recursive: true });
      writeFileSync(
        target,
        'name = "quick"\nmodel = "old-managed-model"\nsandbox_mode = "read-only"\n',
      );
      writeFileSync(
        managedModelsPath(home),
        JSON.stringify(
          {
            version: 1,
            models: { 'thoth-agents-quick.toml': 'old-managed-model' },
          },
          null,
          2,
        ),
      );

      applyFreshCodexSetup(dir, home);

      const updatedModel = roleModel(readFileSync(target, 'utf8'));
      expect(updatedModel).not.toBe('old-managed-model');
      expect(readManagedModels(home)['thoth-agents-quick.toml']).toBe(
        updatedModel,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('handles legacy Codex role model tracking', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const explorer = rolePath(home, 'explorer');
      const librarian = rolePath(home, 'librarian');
      const explorerDefault = roleModel(readFileSync(explorer, 'utf8'));
      writeFileSync(
        librarian,
        replaceRoleModel(readFileSync(librarian, 'utf8'), 'legacy-user-model'),
      );
      rmSync(managedModelsPath(home), { force: true });

      applyFreshCodexSetup(dir, home);

      expect(roleModel(readFileSync(explorer, 'utf8'))).toBe(explorerDefault);
      expect(roleModel(readFileSync(librarian, 'utf8'))).toBe(
        'legacy-user-model',
      );
      expect(readManagedModels(home)['thoth-agents-librarian.toml']).toBe(
        undefined,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('only preserves Codex role model', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'designer');
      const installed = readFileSync(target, 'utf8');
      writeFileSync(
        target,
        replaceRoleModel(installed, 'designer-user-model')
          .replace('name = "designer"', 'name = "renamed"')
          .replace(
            'description = "Own user-facing implementation choices and visual QA for UI work."',
            'description = "user edited"',
          )
          .replace(
            'model_reasoning_effort = "medium"',
            'model_reasoning_effort = "high"',
          )
          .replace(
            'developer_instructions = """',
            'developer_instructions = """\nUSER EDIT\n',
          ),
      );

      applyFreshCodexSetup(dir, home);

      const updated = readFileSync(target, 'utf8');
      expect(roleModel(updated)).toBe('designer-user-model');
      expect(updated).toContain('name = "designer"');
      expect(updated).toContain(
        'description = "Own user-facing implementation choices and visual QA for UI work."',
      );
      expect(parseRoleTomlEffort(updated)).toBe('high');
      expect(updated).not.toContain('USER EDIT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reset refreshes Codex managed model state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'oracle');
      writeFileSync(
        target,
        replaceRoleModel(readFileSync(target, 'utf8'), 'reset-user-model'),
      );

      applyFreshCodexSetup(dir, home, true);

      const resetModel = roleModel(readFileSync(target, 'utf8'));
      expect(resetModel).not.toBe('reset-user-model');
      expect(readManagedModels(home)['thoth-agents-oracle.toml']).toBe(
        resetModel,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
