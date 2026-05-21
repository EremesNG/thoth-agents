/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
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
import {
  applyCodexSetup,
  buildCodexSetupPlan,
  CODEX_ROLE_NAMES,
  formatCodexSetupPlan,
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

function expectNoLeakedCodexAdaptationMarkers(content: string): void {
  for (const marker of FORBIDDEN_CODEX_ADAPTATION_MARKERS) {
    expect(content).not.toContain(marker);
  }
}

describe('Codex install setup plan', () => {
  test('dry-run reports complete managed plan and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: join(dir, '.codex-plugin'),
      });

      const itemKinds = plan.items.map((item) => item.kind);

      expect(itemKinds).toEqual(
        expect.arrayContaining([
          'root-instructions',
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
        packageRoot: join(dir, '.codex-plugin'),
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
        packageRoot: join(dir, '.codex-plugin'),
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
        packageRoot: join(dir, '.codex-plugin'),
      });
      const result = applyCodexSetup(plan);

      expect(result.success).toBe(true);
      const root = readFileSync(agentsFile, 'utf8');
      expect(root).toContain('User guidance');
      expect(root).toContain('thoth-agents:codex-root:start');
      expect(root).toContain('thoth-agents:codex-root:start -->\n<role>');
      expect(root).toContain('delegate-first root coordinator');
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
      expect(root).not.toContain('Use `question` only');
      expect(root).not.toContain('@designer');
      expectNoLeakedCodexAdaptationMarkers(root);
      expect(readFileSync(`${agentsFile}.bak`, 'utf8')).toBe('User guidance\n');
      for (const role of CODEX_ROLE_NAMES) {
        const rolePath = join(
          home,
          '.codex',
          'agents',
          `thoth-agents-${role}.toml`,
        );
        expect(existsSync(rolePath)).toBe(true);
        const roleToml = readFileSync(rolePath, 'utf8');
        expectNoLeakedCodexAdaptationMarkers(roleToml);
        expect(roleToml).toContain('developer_instructions = """\n<role>');
        expect(roleToml).not.toContain('mcp_servers');
        expect(roleToml).not.toContain('skills.config');
        expect(roleToml).not.toContain('[skills');
        expect(roleToml).not.toContain('hooks =');
        expect(roleToml).not.toContain('[hooks');
      }
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
            command: 'npx',
            args: ['-y', 'thoth-mem@latest'],
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
      ).toContain('plugin_hooks = true');
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
          packageRoot: join(dir, '.codex-plugin'),
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
      expect(existsSync(join(personalPluginRoot, '.mcp.json'))).toBe(true);
      expect(existsSync(join(personalPluginRoot, 'hooks', 'hooks.json'))).toBe(
        false,
      );
      expect(existsSync(join(personalPluginRoot, 'plugin.json'))).toBe(false);
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
          packageRoot: join(dir, '.codex-plugin'),
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
});
