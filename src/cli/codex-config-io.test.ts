/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mergeCodexManagedConfig,
  parseCodexToml,
  writeCodexConfigMerge,
} from './codex-config-io';

describe('Codex config IO', () => {
  test('merges managed feature gates idempotently while preserving tables', () => {
    const source =
      'model = "gpt-5"\n\n[profiles.work]\napproval_policy = "on-request"\n\n[mcp_servers.thoth_mem]\ncommand = "bun"\n';
    const merged = mergeCodexManagedConfig(parseCodexToml(source), {});
    const mergedAgain = mergeCodexManagedConfig(
      parseCodexToml(merged.content),
      {},
    );

    expect(merged.content).toContain(
      '[features]\ndefault_mode_request_user_input = true\nhooks = true\nplugin_hooks = true',
    );
    expect(merged.content).toContain(
      '[profiles.work]\napproval_policy = "on-request"',
    );
    expect(merged.content).toContain(
      '[mcp_servers.thoth_mem]\ncommand = "bun"',
    );
    expect(mergedAgain.content).toBe(merged.content);
    expect(merged.warnings).toContain(
      'Codex TOML comments and formatting may be rewritten; a backup is created before apply.',
    );
  });

  test('gates plugin enablement on an explicit safe identifier', () => {
    const withoutPlugin = mergeCodexManagedConfig(parseCodexToml(''), {});
    const withPlugin = mergeCodexManagedConfig(parseCodexToml(''), {
      pluginId: 'thoth-agents',
    });

    expect(withoutPlugin.content).not.toContain('[plugins.');
    expect(withPlugin.content).toContain(
      '[plugins."thoth-agents"]\nenabled = true',
    );
  });

  test('preserves existing Codex MCP arrays, numbers, booleans, and Windows literal strings when merging', () => {
    const nodeReplCommand =
      'C:\\Users\\EremesNG\\AppData\\Local\\OpenAI\\Codex\\bin\\3c238e29bbc930ff\\node_repl.exe';
    const codexCliPath =
      'C:\\Users\\EremesNG\\AppData\\Local\\OpenAI\\Codex\\bin\\3b5d676fd5f36bba\\codex.exe';
    const codexHome = 'C:\\Users\\EremesNG\\.codex';
    const source = `
[mcp_servers.node_repl]
args = []
command = '${nodeReplCommand}'
enabled = true
startup_timeout_sec = 120

[mcp_servers.node_repl.env]
CODEX_CLI_PATH = '${codexCliPath}'
CODEX_HOME = '${codexHome}'
`;

    const merged = mergeCodexManagedConfig(parseCodexToml(source), {});
    const parsedAgain = parseCodexToml(merged.content);

    expect(merged.content).toContain('args = []');
    expect(merged.content).toContain('startup_timeout_sec = 120');
    expect(merged.content).toContain('enabled = true');
    expect(merged.content).toContain(`command = '${nodeReplCommand}'`);
    expect(merged.content).toContain(`CODEX_CLI_PATH = '${codexCliPath}'`);
    expect(merged.content).toContain(`CODEX_HOME = '${codexHome}'`);
    expect(merged.content).not.toContain('args = "[]"');
    expect(merged.content).not.toContain('"\'C:');
    expect(merged.content).not.toContain('C:\\\\Users');
    expect(parsedAgain).toMatchObject({
      mcp_servers: {
        node_repl: {
          args: [],
          command: nodeReplCommand,
          enabled: true,
          startup_timeout_sec: 120,
          env: {
            CODEX_CLI_PATH: codexCliPath,
            CODEX_HOME: codexHome,
          },
        },
      },
    });
  });

  test('round-trips literal quoted project table paths without adding extra quotes', () => {
    const projectPath = 'c:\\dev\\proyectos\\webstorm\\ragasagpt-ppt';
    const source = String.raw`
[projects.'c:\dev\proyectos\webstorm\ragasagpt-ppt']
trust_level = "trusted"
`;

    const merged = mergeCodexManagedConfig(parseCodexToml(source), {});
    const mergedAgain = mergeCodexManagedConfig(
      parseCodexToml(merged.content),
      {},
    );

    expect(merged.content).toContain(
      String.raw`[projects.'c:\dev\proyectos\webstorm\ragasagpt-ppt']`,
    );
    expect(merged.content).not.toContain(
      String.raw`[projects."'c:\dev\proyectos\webstorm\ragasagpt-ppt'"]`,
    );
    expect(merged.content).toContain('trust_level = "trusted"');
    expect(mergedAgain.content).toBe(merged.content);
    expect(parseCodexToml(merged.content)).toMatchObject({
      projects: {
        [projectPath]: {
          trust_level: 'trusted',
        },
      },
    });
  });

  test('parses dots inside quoted table path segments as part of the key', () => {
    const source = String.raw`
[projects.'c:\dev\project.with.dots']
trust_level = "trusted"
`;

    expect(parseCodexToml(source)).toMatchObject({
      projects: {
        'c:\\dev\\project.with.dots': {
          trust_level: 'trusted',
        },
      },
    });
  });

  test('dry-run writes no files and apply creates backup plus atomic result', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      writeFileSync(configPath, 'model = "gpt-5"\n');

      const dryRun = writeCodexConfigMerge({ configPath, dryRun: true });
      expect(dryRun.changed).toBe(true);
      expect(existsSync(`${configPath}.bak`)).toBe(false);

      const applied = writeCodexConfigMerge({ configPath, dryRun: false });
      expect(applied.success).toBe(true);
      expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe(
        'model = "gpt-5"\n',
      );
      expect(readFileSync(configPath, 'utf8')).toContain('plugin_hooks = true');
      expect(readFileSync(configPath, 'utf8')).toContain(
        'default_mode_request_user_input = true',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
