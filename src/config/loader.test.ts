import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { loadAgentPrompt, loadPluginConfig } from './loader';

// Test deepMerge indirectly through loadPluginConfig behavior
// since deepMerge is not exported

describe('loadPluginConfig', () => {
  let tempDir: string;
  let userConfigDir: string;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-test-'));
    userConfigDir = path.join(tempDir, 'user-config');
    originalEnv = { ...process.env };
    // Isolate from real user config
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = userConfigDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  test('returns empty config when no config files exist', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const config = loadPluginConfig(projectDir);
    expect(config).toEqual({});
  });

  test('loads project config from .opencode directory', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          oracle: { model: 'test/model' },
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('test/model');
  });

  test('loads per-agent steps from project config', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          explorer: { model: 'openai/gpt-5.4-mini', steps: 75 },
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.explorer?.steps).toBe(75);
  });

  test('loads scoringEngineVersion flag when configured', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        scoringEngineVersion: 'v2-shadow',
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.scoringEngineVersion).toBe('v2-shadow');
  });

  test('loads balanceProviderUsage flag when configured', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        balanceProviderUsage: true,
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.balanceProviderUsage).toBe(true);
  });

  test('loads explicit opt-in Codex generation config without changing defaults', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        codex: {
          enabled: true,
          outputRoot: '.codex-generated',
          dryRun: true,
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.codex).toEqual({
      enabled: true,
      outputRoot: '.codex-generated',
      dryRun: true,
    });
  });

  test('drops consumer-owned provider and persistence config while preserving unrelated config', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        artifactStore: {
          mode: 'hybrid',
        },
        agents: {
          oracle: { model: 'test/provider-neutral' },
        },
        thoth: {
          command: ['bun', 'x', 'thoth-mem'],
          data_dir: '/tmp/thoth-data',
          environment: {
            THOTH_PROFILE: 'test',
          },
          timeout: 25000,
          http_port: 7439,
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config).not.toHaveProperty('thoth');
    expect(config).not.toHaveProperty('artifactStore');
    expect(config.agents?.oracle?.model).toBe('test/provider-neutral');
  });

  test('loads manual plan structure when configured', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        manualPlan: {
          orchestrator: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          oracle: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8-TEE',
            fallback3: 'opencode/gpt-5-nano',
          },
          designer: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          explorer: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          librarian: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          worker: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.manualPlan?.oracle?.fallback2).toBe(
      'chutes/Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8-TEE',
    );
    expect(config.manualPlan?.worker?.fallback1).toBe(
      'anthropic/claude-opus-4-6',
    );
  });

  test('rejects legacy fixer manual plan entries', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        manualPlan: {
          orchestrator: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          oracle: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          designer: {
            primary: 'openai/gpt-5.4',
            fallback1: 'anthropic/claude-opus-4-6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          explorer: {
            primary: 'openai/gpt-5.4-mini',
            fallback1: 'anthropic/claude-sonnet-4.6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          librarian: {
            primary: 'openai/gpt-5.4-mini',
            fallback1: 'anthropic/claude-sonnet-4.6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
          fixer: {
            primary: 'openai/gpt-5.4-mini',
            fallback1: 'anthropic/claude-sonnet-4.6',
            fallback2: 'chutes/kimi-k2.5',
            fallback3: 'opencode/gpt-5-nano',
          },
        },
      }),
    );

    expect(loadPluginConfig(projectDir)).toEqual({});
  });

  test('ignores invalid config (schema violation or malformed JSON)', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });

    // Test 1: Invalid temperature (out of range)
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({ agents: { oracle: { temperature: 5 } } }),
    );
    expect(loadPluginConfig(projectDir)).toEqual({});

    // Test 2: Malformed JSON
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      '{ invalid json }',
    );
    expect(loadPluginConfig(projectDir)).toEqual({});
  });

  test('respects OPENCODE_CONFIG_DIR for user config location', () => {
    const customDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'omc-opencode-config-'),
    );
    process.env.OPENCODE_CONFIG_DIR = customDir;

    // Write plugin config in the custom directory
    fs.writeFileSync(
      path.join(customDir, 'thoth-agents.json'),
      JSON.stringify({
        agents: { oracle: { model: 'custom/model-from-opencode-config-dir' } },
      }),
    );

    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe(
      'custom/model-from-opencode-config-dir',
    );

    fs.rmSync(customDir, { recursive: true, force: true });
  });
});

describe('deepMerge behavior', () => {
  let tempDir: string;
  let userConfigDir: string;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-test-'));
    userConfigDir = path.join(tempDir, 'user-config');
    originalEnv = { ...process.env };

    // Set XDG_CONFIG_HOME to control user config location
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = userConfigDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  test('merges nested agent configs from user and project', () => {
    // Create user config
    const userOpencodeDir = path.join(userConfigDir, 'opencode');
    fs.mkdirSync(userOpencodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(userOpencodeDir, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          oracle: { model: 'user/oracle-model', temperature: 0.5 },
          explorer: { model: 'user/explorer-model' },
        },
      }),
    );

    // Create project config (should override/merge with user)
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          oracle: { temperature: 0.8 }, // Override temperature only
          designer: { model: 'project/designer-model' }, // Add new agent
        },
      }),
    );

    const config = loadPluginConfig(projectDir);

    // oracle: model from user, temperature from project
    expect(config.agents?.oracle?.model).toBe('user/oracle-model');
    expect(config.agents?.oracle?.temperature).toBe(0.8);

    // explorer: from user only
    expect(config.agents?.explorer?.model).toBe('user/explorer-model');

    // designer: from project only
    expect(config.agents?.designer?.model).toBe('project/designer-model');
  });

  test('ignores removed feature settings in user and project configs', () => {
    const userOpencodeDir = path.join(userConfigDir, 'opencode');
    fs.mkdirSync(userOpencodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(userOpencodeDir, 'thoth-agents.json'),
      JSON.stringify({
        tmux: { enabled: true, layout: 'main-vertical' },
        auto_update: true,
        agents: { oracle: { model: 'user/oracle' } },
      }),
    );

    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        tmux: 'obsolete settings are ignored even if malformed',
        auto_update: false,
        agents: { oracle: { temperature: 0.8 } },
      }),
    );

    const config = loadPluginConfig(projectDir);

    expect(config).not.toHaveProperty('tmux');
    expect(config).not.toHaveProperty('auto_update');
    expect(config.agents?.oracle).toEqual({
      model: 'user/oracle',
      temperature: 0.8,
    });
  });

  test('project config overrides top-level arrays', () => {
    const userOpencodeDir = path.join(userConfigDir, 'opencode');
    fs.mkdirSync(userOpencodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(userOpencodeDir, 'thoth-agents.json'),
      JSON.stringify({
        disabled_mcps: ['exa'],
      }),
    );

    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        disabled_mcps: ['context7'],
      }),
    );

    const config = loadPluginConfig(projectDir);

    // disabled_mcps should be from project (overwrites, not merges)
    expect(config.disabled_mcps).toEqual(['context7']);
  });

  test('handles missing user config gracefully', () => {
    // Don't create user config, only project
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          oracle: { model: 'project/model' },
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('project/model');
  });

  test('handles missing project config gracefully', () => {
    const userOpencodeDir = path.join(userConfigDir, 'opencode');
    fs.mkdirSync(userOpencodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(userOpencodeDir, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          oracle: { model: 'user/model' },
        },
      }),
    );

    // No project config
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('user/model');
  });

  test('merges fallback timeout and chains from user and project', () => {
    const userOpencodeDir = path.join(userConfigDir, 'opencode');
    fs.mkdirSync(userOpencodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(userOpencodeDir, 'thoth-agents.json'),
      JSON.stringify({
        fallback: {
          timeoutMs: 15000,
          chains: {
            oracle: ['openai/gpt-5.4', 'opencode/glm-4.7-free'],
          },
        },
      }),
    );

    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        fallback: {
          chains: {
            explorer: ['google/antigravity-gemini-3-flash'],
          },
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.fallback?.timeoutMs).toBe(15000);
    expect(config.fallback?.chains.oracle).toEqual([
      'openai/gpt-5.4',
      'opencode/glm-4.7-free',
    ]);
    expect(config.fallback?.chains.explorer).toEqual([
      'google/antigravity-gemini-3-flash',
    ]);
  });

  test('preserves fallback chains with additional agent keys', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({
        fallback: {
          chains: {
            writing: ['openai/gpt-5.4'],
          },
        },
      }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.fallback?.chains.writing).toEqual(['openai/gpt-5.4']);
  });
});

describe('unsupported legacy config keys', () => {
  let tempDir: string;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-config-test-'));
    originalEnv = { ...process.env };
    process.env.OPENCODE_CONFIG_DIR = path.join(tempDir, 'global');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  test.each([
    { preset: 'old' },
    { presets: { old: { oracle: { model: 'ignored' } } } },
    { preset: 42, presets: false },
  ])('ignores unsupported keys without rejecting root agents: %#', (legacy) => {
    const configDir = path.join(tempDir, '.opencode');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'thoth-agents.json'),
      JSON.stringify({
        ...legacy,
        agents: { oracle: { model: 'root/model' } },
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadPluginConfig(tempDir)).toEqual({
      agents: { oracle: { model: 'root/model' } },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(
      'preset/presets are unsupported and ignored',
    );
  });

  test('warns once across both source files and preserves field-level merging', () => {
    const globalDir = path.join(tempDir, 'global');
    const projectDir = path.join(tempDir, '.opencode');
    for (const dir of [globalDir, projectDir])
      fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'thoth-agents.jsonc'),
      `{
      // Unsupported keys do not prevent JSONC loading
      "preset": "old", "agents": { "oracle": { "model": "root/model" } },
    }`,
    );
    fs.writeFileSync(
      path.join(projectDir, 'thoth-agents.json'),
      JSON.stringify({
        presets: null,
        agents: { oracle: { temperature: 0.7 } },
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadPluginConfig(tempDir).agents).toEqual({
      oracle: { model: 'root/model', temperature: 0.7 },
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('does not read the removed environment selection', () => {
    process.env.THOTH_AGENTS_PRESET = 'old';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadPluginConfig(tempDir)).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('JSONC config support', () => {
  let tempDir: string;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonc-test-'));
    originalEnv = { ...process.env };
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = path.join(tempDir, 'user-config');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  test('loads .jsonc file with single-line comments', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.jsonc'),
      `{
        // This is a comment
        "agents": {
          "oracle": { "model": "test/model" } // inline comment
        }
      }`,
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('test/model');
  });

  test('loads .jsonc file with multi-line comments', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.jsonc'),
      `{
        /* Multi-line
           comment block */
        "agents": {
          "explorer": { "model": "explorer-model" }
        }
      }`,
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.explorer?.model).toBe('explorer-model');
  });

  test('loads .jsonc file with trailing commas', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.jsonc'),
      `{
        "agents": {
          "oracle": { "model": "test-model", },
        },
      }`,
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('test-model');
  });

  test('prefers .jsonc over .json when both exist', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });

    // Create both files
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({ agents: { oracle: { model: 'json-model' } } }),
    );
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.jsonc'),
      `{
        // JSONC version
        "agents": { "oracle": { "model": "jsonc-model" } }
      }`,
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('jsonc-model');
  });

  test('falls back to .json when .jsonc does not exist', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });

    // Only create .json file
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.json'),
      JSON.stringify({ agents: { oracle: { model: 'json-model' } } }),
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('json-model');
  });

  test('loads user config from .jsonc', () => {
    const userOpencodeDir = path.join(tempDir, 'user-config', 'opencode');
    fs.mkdirSync(userOpencodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(userOpencodeDir, 'thoth-agents.jsonc'),
      `{
        // User config with comments
        "agents": { "librarian": { "model": "user-librarian" } }
      }`,
    );

    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.librarian?.model).toBe('user-librarian');
  });

  test('merges user .jsonc with project .jsonc', () => {
    const userOpencodeDir = path.join(tempDir, 'user-config', 'opencode');
    fs.mkdirSync(userOpencodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(userOpencodeDir, 'thoth-agents.jsonc'),
      `{
        // User config
        "agents": {
          "oracle": { "model": "user-oracle", "temperature": 0.5 }
        }
      }`,
    );

    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.jsonc'),
      `{
        // Project config
        "agents": { "oracle": { "temperature": 0.8 } }
      }`,
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('user-oracle');
    expect(config.agents?.oracle?.temperature).toBe(0.8);
  });

  test('handles complex JSONC with mixed comments and trailing commas', () => {
    const projectDir = path.join(tempDir, 'project');
    const projectConfigDir = path.join(projectDir, '.opencode');
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, 'thoth-agents.jsonc'),
      `{
        // Main configuration
        /* Agent definitions */
        "agents": {
          "oracle": { "model": "dev-oracle", },
          "explorer": { "model": "dev-explorer", },
        },
        "tmux": {
          "enabled": true, // Removed setting is ignored
          "layout": "main-vertical",
        },
      }`,
    );

    const config = loadPluginConfig(projectDir);
    expect(config.agents?.oracle?.model).toBe('dev-oracle');
    expect(config.agents?.explorer?.model).toBe('dev-explorer');
    expect(config).not.toHaveProperty('tmux');
  });
});

describe('loadAgentPrompt', () => {
  let tempDir: string;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-test-'));
    originalEnv = { ...process.env };
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  test('returns empty object when no prompt files exist', () => {
    const result = loadAgentPrompt('oracle');
    expect(result).toEqual({});
  });

  test('loads replacement prompt from {agent}.md', () => {
    const promptsDir = path.join(tempDir, 'opencode', 'thoth-agents');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, 'oracle.md'), 'replacement prompt');

    const result = loadAgentPrompt('oracle');
    expect(result.prompt).toBe('replacement prompt');
    expect(result.appendPrompt).toBeUndefined();
  });

  test('loads append prompt from {agent}_append.md', () => {
    const promptsDir = path.join(tempDir, 'opencode', 'thoth-agents');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptsDir, 'oracle_append.md'),
      'append prompt',
    );

    const result = loadAgentPrompt('oracle');
    expect(result.prompt).toBeUndefined();
    expect(result.appendPrompt).toBe('append prompt');
  });

  test('loads both replacement and append prompts', () => {
    const promptsDir = path.join(tempDir, 'opencode', 'thoth-agents');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, 'oracle.md'), 'replacement prompt');
    fs.writeFileSync(
      path.join(promptsDir, 'oracle_append.md'),
      'append prompt',
    );

    const result = loadAgentPrompt('oracle');
    expect(result.prompt).toBe('replacement prompt');
    expect(result.appendPrompt).toBe('append prompt');
  });

  test('preserves replacement and append prompt templates separately for composition ordering', () => {
    const promptsDir = path.join(tempDir, 'opencode', 'thoth-agents');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptsDir, 'worker.md'),
      'replacement {{role}} {{model}}',
    );
    fs.writeFileSync(
      path.join(promptsDir, 'worker_append.md'),
      'append {{role}} {{model}}',
    );

    const result = loadAgentPrompt('worker');

    expect(result).toEqual({
      prompt: 'replacement {{role}} {{model}}',
      appendPrompt: 'append {{role}} {{model}}',
    });
  });

  test('handles file read errors gracefully', () => {
    const promptsDir = path.join(tempDir, 'opencode', 'thoth-agents');
    fs.mkdirSync(promptsDir, { recursive: true });
    const promptPath = path.join(promptsDir, 'error-agent.md');
    fs.mkdirSync(promptPath);

    const consoleWarnSpy = vi.spyOn(console, 'warn');

    try {
      const result = loadAgentPrompt('error-agent');
      expect(result.prompt).toBeUndefined();

      const warningFound = consoleWarnSpy.mock.calls.some((call) =>
        (call[0] as string).includes('Error reading prompt file'),
      );
      expect(warningFound).toBe(true);
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  test('reads only root prompt files, not named subdirectories', () => {
    const promptsDir = path.join(tempDir, 'opencode', 'thoth-agents');
    const namedDir = path.join(promptsDir, 'test');
    fs.mkdirSync(namedDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, 'oracle.md'), 'root replacement');
    fs.writeFileSync(path.join(namedDir, 'oracle.md'), 'ignored replacement');
    fs.writeFileSync(path.join(namedDir, 'oracle_append.md'), 'ignored append');

    expect(loadAgentPrompt('oracle')).toEqual({
      prompt: 'root replacement',
      appendPrompt: undefined,
    });
  });

  test('works with XDG_CONFIG_HOME environment variable', () => {
    const customConfigHome = path.join(tempDir, 'custom-xdg');
    process.env.XDG_CONFIG_HOME = customConfigHome;

    const promptsDir = path.join(customConfigHome, 'opencode', 'thoth-agents');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, 'xdg-agent.md'), 'xdg prompt');

    const result = loadAgentPrompt('xdg-agent');
    expect(result.prompt).toBe('xdg prompt');
  });

  test('respects OPENCODE_CONFIG_DIR for prompt location', () => {
    const customDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'omc-prompt-config-'),
    );
    process.env.OPENCODE_CONFIG_DIR = customDir;

    const promptsDir = path.join(customDir, 'thoth-agents');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptsDir, 'oracle.md'),
      'prompt from OPENCODE_CONFIG_DIR dir',
    );

    const result = loadAgentPrompt('oracle');
    expect(result.prompt).toBe('prompt from OPENCODE_CONFIG_DIR dir');

    fs.rmSync(customDir, { recursive: true, force: true });
  });
});
