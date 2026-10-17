import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('passes allowed app patterns through unchanged', () => {
    const allowedApps = ['*', ' msedge* ', '?otepad.exe', '', 'a+b.exe'];
    const warn = vi.fn();
    expect(
      loadConfig({
        env: {},
        fs: { readFileSync: () => JSON.stringify({ allowedApps }) },
        warn,
      }).allowedApps,
    ).toEqual(allowedApps);
    expect(warn).not.toHaveBeenCalled();
  });
  it('handles non-Error filesystem failures without throwing', () => {
    expect(
      loadConfig({
        env: {},
        fs: {
          readFileSync: () => {
            throw null;
          },
        },
        warn: () => {},
      }).enabled,
    ).toBe(true);
  });
  it.each([
    'false',
    '0',
    'no',
    'OFF',
  ])('recognizes the falsy environment value %s', (value) => {
    expect(
      loadConfig({
        env: { ASKCODEX_ENABLED: value },
        fs: { readFileSync: () => '{"enabled":true}' },
      }).enabled,
    ).toBe(false);
  });
  it.each([
    'true',
    '1',
    'yes',
    'ON',
  ])('recognizes the truthy environment value %s', (value) => {
    expect(
      loadConfig({
        env: { ASKCODEX_ENABLED: value },
        fs: { readFileSync: () => '{"enabled":false}' },
      }).enabled,
    ).toBe(true);
  });
  it.each([
    '{broken',
    'null',
    '[]',
    '42',
  ])('warns without throwing for invalid config %s', (raw) => {
    const warn = vi.fn();
    expect(
      loadConfig({ env: {}, fs: { readFileSync: () => raw }, warn }).enabled,
    ).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });
  it('validates wrong field types and preserves a valid file when the env boolean is unknown', () => {
    expect(
      loadConfig({
        env: { ASKCODEX_ENABLED: 'typo' },
        fs: {
          readFileSync: () =>
            JSON.stringify({
              enabled: false,
              bin: 42,
              defaultModel: [],
              defaultEffort: false,
              defaultMode: 'unsafe',
              defaultTimeoutMinutes: -1,
              allowedApps: ['ok', 5],
              extraArgs: 'unsafe',
              webSearch: true,
            }),
        },
      }),
    ).toEqual({
      enabled: false,
      defaultMode: 'accept-edits',
      defaultTimeoutMinutes: 15,
      allowedApps: [],
      webSearch: 'disabled',
    });
  });
  it('warns on read errors and returns fresh arrays per load', () => {
    const warn = vi.fn();
    const options = {
      env: {},
      fs: {
        readFileSync: () => {
          throw new Error('denied');
        },
      },
      warn,
    };
    const first = loadConfig(options);
    first.allowedApps.push('notepad.exe');
    expect(loadConfig(options).allowedApps).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('merges validated file values and gives environment precedence', () => {
    const file = {
      enabled: false,
      bin: '/file/codex',
      defaultModel: 'file-model',
      defaultEffort: 'low',
      defaultMode: 'plan',
      defaultTimeoutMinutes: 30,
      allowedApps: ['notepad.exe'],
      webSearch: 'cached',
      extraArgs: ['--verbose'],
    };
    expect(
      loadConfig({
        env: {
          ASKCODEX_ENABLED: ' YES ',
          ASKCODEX_BIN: '/env/codex',
          ASKCODEX_DEFAULT_MODEL: ' env-model ',
          ASKCODEX_DEFAULT_EFFORT: 'high',
        },
        fs: { readFileSync: () => JSON.stringify(file) },
      }),
    ).toEqual({
      ...file,
      enabled: true,
      bin: '/env/codex',
      defaultModel: 'env-model',
      defaultEffort: 'high',
    });
  });
  it('uses safe defaults and the user-scoped path when the file is missing', () => {
    const readFileSync = vi.fn(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });
    const warn = vi.fn();
    expect(
      loadConfig({
        homeDir: '/home/test',
        env: {},
        fs: { readFileSync },
        warn,
      }),
    ).toEqual({
      enabled: true,
      defaultMode: 'accept-edits',
      defaultTimeoutMinutes: 15,
      allowedApps: [],
      webSearch: 'disabled',
    });
    expect(readFileSync).toHaveBeenCalledWith(
      path.join('/home/test', '.pi', 'agent', 'askcodex', 'config.json'),
      'utf8',
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
