import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import thothTheme from '../src/index.ts';
import { loadConfig } from '../src/shared/config.ts';

const defaults = {
  icons: 'nerd',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  images: { enabled: true },
  welcome: { enabled: true },
};

let agentDir: string;
let configPath: string;

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-'));
  configPath = join(agentDir, 'pi-thoth-theme.json');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('uses Nerd Font icons and enables every module when the file is missing', () => {
    expect(loadConfig(configPath)).toEqual(defaults);
  });

  it.each([
    '{',
    'null',
    '[]',
    '42',
    '"ascii"',
    '{"icons":"emoji","statusLine":{"enabled":"false"},"tools":{"enabled":0},"images":{"enabled":null},"welcome":false}',
    '{"statusLine":[],"tools":"off","images":null,"welcome":{"enabled":[]}}',
  ])('uses defaults for malformed or invalid configuration: %s', (contents) => {
    writeFileSync(configPath, contents);
    expect(loadConfig(configPath)).toEqual(defaults);
  });

  it('resolves the package file under PI_CODING_AGENT_DIR at each load', () => {
    vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
    writeFileSync(configPath, '{"icons":"ascii","tools":{"enabled":false}}');
    expect(loadConfig()).toEqual({
      ...defaults,
      icons: 'ascii',
      tools: { enabled: false },
    });
    writeFileSync(configPath, '{}');
    expect(loadConfig()).toEqual(defaults);
  });

  it('keeps valid fields when neighboring fields are invalid or omitted', () => {
    writeFileSync(
      configPath,
      '{"icons":"nerd","tools":{"enabled":false},"images":{"enabled":"false"},"unknown":true}',
    );
    expect(loadConfig(configPath)).toEqual({
      ...defaults,
      tools: { enabled: false },
    });
  });

  it('returns independent defaults for each load', () => {
    const config = loadConfig(configPath);
    config.statusLine.enabled = false;
    expect(loadConfig(configPath)).toEqual(defaults);
  });

  it('reads icon mode and independent module toggles from the package file', () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        icons: 'ascii',
        statusLine: { enabled: false },
        tools: { enabled: false },
        images: { enabled: false },
        welcome: { enabled: false },
      }),
    );
    expect(loadConfig(configPath)).toEqual({
      icons: 'ascii',
      statusLine: { enabled: false, subscriptionProviders: ['claude-bridge'] },
      tools: { enabled: false },
      images: { enabled: false },
      welcome: { enabled: false },
    });
  });

  it('validates statusLine.subscriptionProviders correctly', () => {
    // Custom valid array
    writeFileSync(
      configPath,
      JSON.stringify({
        statusLine: { subscriptionProviders: ['anthropic', 'openai'] },
      }),
    );
    expect(loadConfig(configPath).statusLine.subscriptionProviders).toEqual([
      'anthropic',
      'openai',
    ]);

    // Empty array should be preserved
    writeFileSync(
      configPath,
      JSON.stringify({
        statusLine: { subscriptionProviders: [] },
      }),
    );
    expect(loadConfig(configPath).statusLine.subscriptionProviders).toEqual([]);

    // Filters non-string or empty items
    writeFileSync(
      configPath,
      JSON.stringify({
        statusLine: { subscriptionProviders: ['custom', 123, null, ''] },
      }),
    );
    expect(loadConfig(configPath).statusLine.subscriptionProviders).toEqual([
      'custom',
    ]);

    // Non-array falls back to default ['claude-bridge']
    writeFileSync(
      configPath,
      JSON.stringify({
        statusLine: { subscriptionProviders: 'invalid' },
      }),
    );
    expect(loadConfig(configPath).statusLine.subscriptionProviders).toEqual([
      'claude-bridge',
    ]);
  });
});

it('loads the extension without accessing Pi settings', () => {
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  const on = vi.fn();
  const settingsAccess = vi.fn(() => {
    throw new Error('Pi settings are unavailable during extension load');
  });
  const pi = {
    on,
    get getSettings() {
      return settingsAccess();
    },
  } as unknown as ExtensionAPI;

  expect(() => thothTheme(pi)).not.toThrow();
  expect(settingsAccess).not.toHaveBeenCalled();
  expect(on).toHaveBeenCalledWith('session_start', expect.any(Function));
});
