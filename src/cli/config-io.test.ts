import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addPluginToOpenCodeConfig,
  detectCurrentConfig,
  disableDefaultAgents,
  parseConfig,
  parseConfigFile,
  stripJsonComments,
  updateOpenCodeMainConfig,
  writeConfig,
  writeLiteConfig,
} from './config-io';
import * as paths from './paths';

describe('config-io', () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opencode-io-test-'));
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = tmpDir;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  test('stripJsonComments strips comments and trailing commas', () => {
    const jsonc = `{
      // comment
      "a": 1, /* multi
      line */
      "b": [2,],
    }`;
    const stripped = stripJsonComments(jsonc);
    expect(JSON.parse(stripped)).toEqual({ a: 1, b: [2] });
  });

  test('parseConfigFile parses valid JSON', () => {
    const path = join(tmpDir, 'test.json');
    writeFileSync(path, '{"a": 1}');
    const result = parseConfigFile(path);
    expect(result.config).toEqual({ a: 1 } as any);
    expect(result.error).toBeUndefined();
  });

  test('parseConfigFile returns null for non-existent file', () => {
    const result = parseConfigFile(join(tmpDir, 'nonexistent.json'));
    expect(result.config).toBeNull();
  });

  test('parseConfigFile returns null for empty or whitespace-only file', () => {
    const emptyPath = join(tmpDir, 'empty.json');
    writeFileSync(emptyPath, '');
    expect(parseConfigFile(emptyPath).config).toBeNull();

    const whitespacePath = join(tmpDir, 'whitespace.json');
    writeFileSync(whitespacePath, '   \n  ');
    expect(parseConfigFile(whitespacePath).config).toBeNull();
  });

  test('parseConfigFile returns error for invalid JSON', () => {
    const path = join(tmpDir, 'invalid.json');
    writeFileSync(path, '{"a": 1');
    const result = parseConfigFile(path);
    expect(result.config).toBeNull();
    expect(result.error).toBeDefined();
  });

  test('parseConfig tries .jsonc if .json is missing', () => {
    const jsoncPath = join(tmpDir, 'test.jsonc');
    writeFileSync(jsoncPath, '{"a": 1}');

    // We pass .json path, it should try .jsonc
    const result = parseConfig(join(tmpDir, 'test.json'));
    expect(result.config).toEqual({ a: 1 } as any);
  });

  test('writeConfig writes JSON and creates backup', () => {
    const path = join(tmpDir, 'test.json');
    writeFileSync(path, '{"old": true}');

    writeConfig(path, { new: true } as any);

    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ new: true });
    expect(JSON.parse(readFileSync(`${path}.bak`, 'utf-8'))).toEqual({
      old: true,
    });
  });

  test('addPluginToOpenCodeConfig writes the approved exact version', async () => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    paths.ensureConfigDir();
    writeFileSync(
      configPath,
      JSON.stringify({ plugin: ['other', 'thoth-agents@1.0.0'] }),
    );

    const result = await addPluginToOpenCodeConfig('0.4.8');
    expect(result.success).toBe(true);

    const saved = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.plugin).toContain('thoth-agents@0.4.8');
    expect(saved.plugin).not.toContain('thoth-agents@1.0.0');
    expect(saved.plugin).not.toContain('thoth-agents@latest');
    expect(saved.plugin.length).toBe(2);
  });

  test('replaces every managed entry form while preserving unrelated plugin order', () => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    paths.ensureConfigDir();
    writeFileSync(
      configPath,
      JSON.stringify({
        plugin: [
          'first',
          'thoth-agents',
          'second',
          'thoth-agents@next',
          'third',
          'thoth-agents@0.3.8',
          'fourth',
        ],
      }),
    );

    const result = updateOpenCodeMainConfig({
      ensurePlugin: true,
      pluginVersion: '0.4.8-beta.1',
    });

    expect(result.success).toBe(true);
    expect(JSON.parse(readFileSync(configPath, 'utf8')).plugin).toEqual([
      'first',
      'second',
      'third',
      'fourth',
      'thoth-agents@0.4.8-beta.1',
    ]);
  });

  test.each([
    undefined,
    '',
    'latest',
  ])('rejects an unapproved plugin version without mutating config: %s', (pluginVersion) => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    paths.ensureConfigDir();
    const original = JSON.stringify({ plugin: ['user-plugin'] });
    writeFileSync(configPath, original);

    const result = updateOpenCodeMainConfig({
      ensurePlugin: true,
      pluginVersion,
    });

    expect(result.success).toBe(false);
    expect(readFileSync(configPath, 'utf8')).toBe(original);
    expect(existsSync(`${configPath}.bak`)).toBe(false);
    expect(existsSync(`${configPath}.tmp`)).toBe(false);
  });

  test('writeLiteConfig writes lite config with OpenAI preset', () => {
    const litePath = join(tmpDir, 'opencode', 'thoth-agents.json');
    paths.ensureConfigDir();

    const result = writeLiteConfig({
      hasTmux: true,
      reset: false,
    });
    expect(result.success).toBe(true);

    const saved = JSON.parse(readFileSync(litePath, 'utf-8'));
    expect(saved.$schema).toBe(
      'https://unpkg.com/thoth-agents@latest/thoth-agents.schema.json',
    );
    expect(saved.preset).toBe('openai');
    expect(saved.presets.openai).toBeDefined();
    expect(saved.tmux.enabled).toBe(true);
  });

  test('disableDefaultAgents disables explore and general agents', () => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    paths.ensureConfigDir();
    writeFileSync(configPath, JSON.stringify({}));

    const result = disableDefaultAgents();
    expect(result.success).toBe(true);

    const saved = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.agent.explore.disable).toBe(true);
    expect(saved.agent.general.disable).toBe(true);
  });

  test('updateOpenCodeMainConfig merges plugin and default-agent changes in one backup-preserving write', () => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    paths.ensureConfigDir();
    const original = `${JSON.stringify(
      {
        plugin: ['user-plugin', 'thoth-agents@0.1.0'],
        theme: 'user-owned',
        agent: {
          explore: { model: 'user/explorer', temperature: 0.2 },
          general: { model: 'user/general', prompt: 'keep me' },
          custom: { model: 'user/custom' },
        },
      },
      null,
      2,
    )}\n`;
    writeFileSync(configPath, original);

    const result = updateOpenCodeMainConfig({
      ensurePlugin: true,
      pluginVersion: '0.4.8',
      disableDefaults: true,
    });

    expect(result.success).toBe(true);
    expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe(original);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      plugin: ['user-plugin', 'thoth-agents@0.4.8'],
      theme: 'user-owned',
      agent: {
        explore: {
          model: 'user/explorer',
          temperature: 0.2,
          disable: true,
        },
        general: {
          model: 'user/general',
          prompt: 'keep me',
          disable: true,
        },
        custom: { model: 'user/custom' },
      },
    });
  });

  test('updateOpenCodeMainConfig makes no write or backup when parsing fails', () => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    paths.ensureConfigDir();
    writeFileSync(configPath, '{ malformed');

    const result = updateOpenCodeMainConfig({
      ensurePlugin: true,
      pluginVersion: '0.4.8',
      disableDefaults: true,
    });

    expect(result.success).toBe(false);
    expect(readFileSync(configPath, 'utf8')).toBe('{ malformed');
    expect(existsSync(`${configPath}.bak`)).toBe(false);
    expect(existsSync(`${configPath}.tmp`)).toBe(false);
  });

  test('detectCurrentConfig detects installed status', () => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    const litePath = join(tmpDir, 'opencode', 'thoth-agents.json');
    paths.ensureConfigDir();

    writeFileSync(configPath, JSON.stringify({ plugin: ['thoth-agents'] }));
    writeFileSync(
      litePath,
      JSON.stringify({
        preset: 'openai',
        presets: {
          openai: {
            orchestrator: { model: 'openai/gpt-4' },
          },
        },
        tmux: { enabled: true },
      }),
    );

    const detected = detectCurrentConfig();
    expect(detected.isInstalled).toBe(true);
    expect(detected.hasOpenAI).toBe(true);
    expect(detected.hasTmux).toBe(true);
    expect(Object.keys(detected).sort()).toEqual([
      'hasOpenAI',
      'hasTmux',
      'isInstalled',
    ]);
  });
});
