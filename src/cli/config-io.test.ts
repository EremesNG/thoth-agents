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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ModelProfileStore } from '../opencode/profiles';
import {
  addPluginToOpenCodeConfig,
  detectCurrentConfig,
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
    expect(saved.plugins).toContain('thoth-agents@0.4.8');
    expect(saved.plugin).toEqual(['other']);
    expect(saved.plugins).not.toContain('thoth-agents@1.0.0');
    expect(saved.plugins).not.toContain('thoth-agents@latest');
    expect(saved.plugins.length).toBe(1);
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
    ]);
  });

  test.each([
    ['oracle', 'openai/gpt-6-astra', 'medium', 'openai/gpt-6.1-sol', 'xhigh'],
    ['orchestrator', 'openai/gpt-6-sol', 'xhigh', 'openai/gpt-6.1-sol', 'high'],
    ['worker', 'custom/model', 'low', 'custom/model', 'low'],
    ['oracle', 'openai/gpt-6-astra', 'high', 'openai/gpt-6-astra', 'high'],
  ] as const)('sync advances only previous shipped pairs in openai: %s', (role, model, variant, expectedModel, expectedVariant) => {
    paths.ensureConfigDir();
    const store = new ModelProfileStore({ cwd: tmpDir });
    store.save('global', 'openai', { agents: { [role]: { model, variant } } });
    store.save('global', 'personal', {
      agents: { worker: { model: 'custom/worker' } },
    });
    store.setGlobalActive('personal');
    const litePath = paths.getLiteConfig();
    writeFileSync(
      litePath,
      JSON.stringify({
        preset: 'ignored',
        presets: { ignored: {} },
        customSetting: true,
        agents: { oracle: { temperature: 0.7 } },
      }),
    );
    expect(writeLiteConfig({ reset: false }).success).toBe(true);
    expect(store.read('global').profiles.openai.agents[role]).toEqual({
      model: expectedModel,
      variant: expectedVariant,
    });
    expect(store.read('global').active).toBe('personal');
    expect(store.read('global').profiles.personal.agents.worker).toEqual({
      model: 'custom/worker',
    });
    const saved = JSON.parse(readFileSync(litePath, 'utf8'));
    expect(saved).not.toHaveProperty('preset');
    expect(saved).not.toHaveProperty('presets');
    expect(saved.customSetting).toBe(true);
    expect(saved.agents.oracle.temperature).toBe(0.7);
  });

  test.each([
    'missing',
    undefined,
    'default',
  ] as const)('sync activates openai only when global pointer %s is invalid', (active) => {
    const store = new ModelProfileStore({ cwd: tmpDir });
    // Write a dangling pointer directly: the public store rightly refuses to create one.
    const directory = join(paths.getConfigDir(), 'thoth');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      store.paths.global,
      JSON.stringify({ version: 1, active, profiles: {} }),
    );
    expect(writeLiteConfig({ reset: false }).success).toBe(true);
    expect(store.read('global').active).toBe(
      active === 'default' ? 'default' : 'openai',
    );
  });

  test('sync completes partial built-in roles without changing customized variants', () => {
    const store = new ModelProfileStore({ cwd: tmpDir });
    store.save('global', 'openai', { agents: { worker: { variant: 'low' } } });
    expect(writeLiteConfig({ reset: false }).success).toBe(true);
    expect(store.read('global').profiles.openai.agents.worker).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'low',
    });
  });

  test('sync refuses malformed profiles without replacing either managed file', () => {
    paths.ensureConfigDir();
    const store = new ModelProfileStore({ cwd: tmpDir });
    mkdirSync(join(paths.getConfigDir(), 'thoth'), { recursive: true });
    writeFileSync(store.paths.global, '{ broken');
    writeFileSync(paths.getLiteConfig(), JSON.stringify({ keep: true }));
    expect(writeLiteConfig({ reset: false }).success).toBe(false);
    expect(readFileSync(store.paths.global, 'utf8')).toBe('{ broken');
    expect(JSON.parse(readFileSync(paths.getLiteConfig(), 'utf8'))).toEqual({
      keep: true,
    });
  });

  test('lite sync rejects malformed existing JSON without writing or backing up', () => {
    paths.ensureConfigDir();
    const litePath = paths.getLiteConfig();
    writeFileSync(litePath, '{ broken');
    expect(writeLiteConfig({ reset: false }, litePath).success).toBe(false);
    expect(readFileSync(litePath, 'utf8')).toBe('{ broken');
    expect(existsSync(`${litePath}.bak`)).toBe(false);
  });

  test('writeLiteConfig writes lite config and the OpenAI profile', () => {
    const litePath = join(tmpDir, 'opencode', 'thoth-agents.json');
    paths.ensureConfigDir();

    const result = writeLiteConfig({
      reset: false,
    });
    expect(result.success).toBe(true);

    const saved = JSON.parse(readFileSync(litePath, 'utf-8'));
    expect(saved.$schema).toBe(
      'https://unpkg.com/thoth-agents@latest/thoth-agents.schema.json',
    );
    expect(saved).not.toHaveProperty('preset');
    expect(saved).not.toHaveProperty('presets');
    const profiles = new ModelProfileStore({ cwd: tmpDir }).read('global');
    expect(profiles.active).toBe('openai');
    expect(profiles.profiles.openai.agents.worker).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'max',
    });
    expect(saved).not.toHaveProperty('tmux');
  });

  test('plugin install does not write agent disables', () => {
    const configPath = join(tmpDir, 'opencode', 'opencode.json');
    paths.ensureConfigDir();
    writeFileSync(configPath, JSON.stringify({}));

    const result = updateOpenCodeMainConfig({
      ensurePlugin: true,
      pluginVersion: '0.4.8',
    });
    expect(result.success).toBe(true);

    const saved = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved).not.toHaveProperty('agent');
  });

  test('updateOpenCodeMainConfig pins the plugin while preserving user agent settings in one backup-preserving write', () => {
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
    });

    expect(result.success).toBe(true);
    expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe(original);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      plugin: ['user-plugin'],
      plugins: ['thoth-agents@0.4.8'],
      theme: 'user-owned',
      agent: {
        explore: {
          model: 'user/explorer',
          temperature: 0.2,
        },
        general: {
          model: 'user/general',
          prompt: 'keep me',
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
      }),
    );

    expect(writeLiteConfig({ reset: false }).success).toBe(true);
    const detected = detectCurrentConfig();
    expect(detected.isInstalled).toBe(true);
    expect(detected.hasOpenAI).toBe(true);
    expect(Object.keys(detected).sort()).toEqual(['hasOpenAI', 'isInstalled']);
  });
});
