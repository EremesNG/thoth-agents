import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
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
      '[features]\ndefault_mode_request_user_input = true',
    );
    expect(merged.content).not.toContain('hooks = true');
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

  test('preserves array-of-tables skills config headers during merge', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      writeFileSync(
        configPath,
        'approval_policy = "on-request"\n' +
          'sandbox_mode = "workspace-write"\n' +
          'agents = ["orchestrator", "explorer", "librarian", "oracle", "designer", "quick", "deep"]\n\n' +
          '[[skills.config]]\n' +
          'enabled = true\n' +
          'sources = ["repo"]\n',
      );

      const result = writeCodexConfigMerge({ configPath, dryRun: false });
      const updated = readFileSync(configPath, 'utf8');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.error).toBeUndefined();
      expect(updated).toContain('[[skills.config]]');
      expect(updated).not.toContain('[skills.config]\n');
      expect(result.diffSummary).toContain(
        'ensure features.default_mode_request_user_input = true',
      );
      expect(result.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('leaves existing enabled feature flag byte-for-byte unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const source =
        '# keep this comment\n' +
        'model = "gpt-5"\n\n' +
        '[features]\n' +
        'default_mode_request_user_input = true\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n';
      writeFileSync(configPath, source);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(readFileSync(configPath, 'utf8')).toBe(source);
      expect(existsSync(`${configPath}.bak`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('adds missing feature flag without rewriting unrelated TOML', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const before =
        'approval_policy = "on-request"\n' +
        'sandbox_mode = "workspace-write"\n\n' +
        '[features]\n' +
        'experimental_client = true\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n' +
        'sources = ["repo"]\n';
      const after =
        'approval_policy = "on-request"\n' +
        'sandbox_mode = "workspace-write"\n\n' +
        '[features]\n' +
        'experimental_client = true\n' +
        'default_mode_request_user_input = true\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n' +
        'sources = ["repo"]\n';
      writeFileSync(configPath, before);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toBe(after);
      expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('enables an existing false feature flag by changing only that line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const before =
        '[features]\n' +
        'default_mode_request_user_input = false # user disabled earlier\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n';
      const after =
        '[features]\n' +
        'default_mode_request_user_input = true # user disabled earlier\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n';
      writeFileSync(configPath, before);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toBe(after);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('appends a features section when it is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const before =
        'model = "gpt-5"\n\n' + '[[skills.config]]\n' + 'enabled = true\n';
      const after =
        'model = "gpt-5"\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n\n' +
        '[features]\n' +
        'default_mode_request_user_input = true\n';
      writeFileSync(configPath, before);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toBe(after);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
      expect(readFileSync(configPath, 'utf8')).toContain(
        'default_mode_request_user_input = true',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
