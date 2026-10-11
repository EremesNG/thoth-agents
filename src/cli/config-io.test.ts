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
import { getAgentConfigs } from '../agents';
import { loadPluginConfig } from '../config/loader';
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

  test.each([
    ['openai/gpt-6-astra', 'medium', 'openai/gpt-6.1-sol', 'xhigh'],
    ['custom/model', 'medium', 'custom/model', 'medium'],
    ['openai/gpt-6-astra', 'high', 'openai/gpt-6-astra', 'high'],
    ['openai/gpt-6-astra', undefined, 'openai/gpt-6-astra', undefined],
  ])('lite sync preserves the active complete pair %s / %s and unrelated keys', (model, variant, expectedModel, expectedVariant) => {
    paths.ensureConfigDir();
    delete process.env.THOTH_AGENTS_PRESET;
    const litePath = paths.getLiteConfig();
    const original = JSON.stringify({
      preset: 'personal',
      presets: {
        personal: {
          oracle: { model, variant, temperature: 0.2 },
          orchestrator: { model: 'openai/gpt-6-sol', variant: 'xhigh' },
          custom: { model: 'other/custom' },
        },
        spare: { worker: { model: 'other/worker' } },
      },
      customSetting: { keep: true },
      tmux: { enabled: false },
    });
    writeFileSync(litePath, original);
    expect(
      writeLiteConfig({ hasTmux: false, reset: false }, litePath).success,
    ).toBe(true);
    const saved = JSON.parse(readFileSync(litePath, 'utf8'));
    expect(saved.preset).toBe('personal');
    expect(saved.presets.personal.oracle).toEqual({
      model: expectedModel,
      ...(expectedVariant ? { variant: expectedVariant } : {}),
      temperature: 0.2,
    });
    expect(saved.presets.personal.orchestrator).toEqual({
      model: 'openai/gpt-6.1-sol',
      variant: 'high',
    });
    expect(saved.presets.personal.worker).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'max',
    });
    expect(saved.presets.personal.custom).toEqual({ model: 'other/custom' });
    expect(saved.presets.spare).toEqual({ worker: { model: 'other/worker' } });
    expect(saved.customSetting).toEqual({ keep: true });
    expect(saved.tmux).toEqual({ enabled: false });
    expect(readFileSync(`${litePath}.bak`, 'utf8')).toBe(original);
    const active = loadPluginConfig(join(tmpDir, 'no-project'));
    expect(active.agents?.oracle?.model).toBe(expectedModel);
    expect(active.agents?.oracle?.variant).toBe(expectedVariant);
    const rendered = getAgentConfigs(active);
    expect(rendered.oracle.model).toBe(expectedModel);
    expect(rendered.oracle.variant).toBe(expectedVariant);
    expect(rendered.orchestrator.variant).toBe('high');
    expect(rendered.worker.variant).toBe('max');
    expect(
      writeLiteConfig({ hasTmux: false, reset: true }, litePath).success,
    ).toBe(true);
    const reset = loadPluginConfig(join(tmpDir, 'no-project'));
    expect(reset.preset).toBe('openai');
    expect(reset.agents?.oracle).toEqual({
      model: 'openai/gpt-6.1-sol',
      variant: 'xhigh',
    });
    expect(getAgentConfigs(reset)).toMatchObject({
      oracle: { model: 'openai/gpt-6.1-sol', variant: 'xhigh' },
      orchestrator: { model: 'openai/gpt-6.1-sol', variant: 'high' },
    });
  });

  test.each([
    ['openai/gpt-6-sol', undefined, undefined],
    ['custom/root', 'low', 'low'],
    ['openai/gpt-6.1-sol', 'high', 'high'],
  ] as const)('lite sync renders orchestrator effort for %s / %s', (model, variant, expectedVariant) => {
    paths.ensureConfigDir();
    delete process.env.THOTH_AGENTS_PRESET;
    const litePath = paths.getLiteConfig();
    writeFileSync(
      litePath,
      JSON.stringify({
        preset: 'personal',
        presets: { personal: { orchestrator: { model, variant } } },
      }),
    );

    expect(
      writeLiteConfig({ hasTmux: false, reset: false }, litePath).success,
    ).toBe(true);
    const rendered = getAgentConfigs(
      loadPluginConfig(join(tmpDir, 'no-project')),
    );
    expect(rendered.orchestrator.model).toBe(model);
    expect(rendered.orchestrator.variant).toBe(expectedVariant);
    if (expectedVariant === undefined) {
      expect(rendered.orchestrator).not.toHaveProperty('variant');
    }
  });

  test.each([
    ['orchestrator', 'gpt-6-sol', 'xhigh', 'gpt-6.1-sol', 'high'],
    ['explorer', 'gpt-6-luna', 'low', 'gpt-6-luna', 'max'],
    ['librarian', 'gpt-6-luna', 'high', 'gpt-6-luna', 'max'],
    ['oracle', 'gpt-6-astra', 'medium', 'gpt-6.1-sol', 'xhigh'],
    ['designer', 'gpt-6-sol', 'medium', 'gpt-6-luna', 'max'],
    ['worker', 'gpt-6-luna', 'max', 'gpt-6-luna', 'max'],
  ] as const)('lite sync advances the active OpenCode %s legacy pair', (role, model, variant, expectedModel, expectedVariant) => {
    paths.ensureConfigDir();
    delete process.env.THOTH_AGENTS_PRESET;
    const litePath = paths.getLiteConfig();
    writeFileSync(
      litePath,
      JSON.stringify({
        preset: 'openai',
        presets: {
          openai: {
            [role]: { model: `openai/${model}`, variant, temperature: 0.3 },
          },
        },
      }),
    );
    for (let sync = 0; sync < 2; sync++) {
      expect(
        writeLiteConfig({ hasTmux: false, reset: false }, litePath).success,
      ).toBe(true);
      expect(
        loadPluginConfig(join(tmpDir, 'no-project')).agents?.[role],
      ).toEqual({
        model: `openai/${expectedModel}`,
        variant: expectedVariant,
        temperature: 0.3,
      });
    }
  });

  test.each([
    'medium',
    'high',
  ])('lite sync compares root overrides in the active pair with %s effort', (variant) => {
    paths.ensureConfigDir();
    delete process.env.THOTH_AGENTS_PRESET;
    const litePath = paths.getLiteConfig();
    writeFileSync(
      litePath,
      JSON.stringify({
        preset: 'openai',
        presets: {
          openai: {
            oracle: { model: 'openai/gpt-6-astra', variant: 'medium' },
          },
        },
        agents: { oracle: { variant, temperature: 0.7 } },
      }),
    );
    expect(
      writeLiteConfig({ hasTmux: false, reset: false }, litePath).success,
    ).toBe(true);
    const active = loadPluginConfig(join(tmpDir, 'no-project'));
    expect(active.agents?.oracle).toEqual({
      model: variant === 'medium' ? 'openai/gpt-6.1-sol' : 'openai/gpt-6-astra',
      variant: variant === 'medium' ? 'xhigh' : 'high',
      temperature: 0.7,
    });
  });

  test('lite sync rejects malformed existing JSON without writing or backing up', () => {
    paths.ensureConfigDir();
    const litePath = paths.getLiteConfig();
    writeFileSync(litePath, '{ broken');
    expect(
      writeLiteConfig({ hasTmux: false, reset: false }, litePath).success,
    ).toBe(false);
    expect(readFileSync(litePath, 'utf8')).toBe('{ broken');
    expect(existsSync(`${litePath}.bak`)).toBe(false);
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
