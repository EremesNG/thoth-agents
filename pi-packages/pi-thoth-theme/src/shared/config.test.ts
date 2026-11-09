import * as fs from 'node:fs';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, saveAnimationLevel, saveThemeConfig } from './config.ts';

vi.mock('node:crypto', () => ({ randomUUID: () => 'config-test-temp' }));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof fs>()),
}));

let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'thoth-input-box-config-'));
  path = join(directory, 'pi-thoth-theme.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('collapsed tool density configuration', () => {
  it.each(['frame', 'compact', 'line'] as const)('loads %s', (collapsed) => {
    writeFileSync(path, JSON.stringify({ tools: { collapsed } }));
    expect(loadConfig(path).tools.collapsed).toBe(collapsed);
  });

  it.each(
    [undefined, null, false, 42, '', 'LINE', 'line ', [], {}].map(
      (collapsed) => ({ collapsed }),
    ),
  )('defaults malformed or missing density $collapsed to frame', ({
    collapsed,
  }) => {
    writeFileSync(path, JSON.stringify({ tools: { collapsed } }));
    expect(loadConfig(path).tools.collapsed).toBe('frame');
  });
});

describe('general settings persistence', () => {
  it('never overwrites or cleans up a temporary file owned by another writer', () => {
    writeFileSync(path, '{"unknown":true}');
    const temporary = `${path}.config-test-temp.tmp`;
    writeFileSync(temporary, 'another writer');
    expect(() => saveThemeConfig({ icons: 'ascii' }, path)).toThrow();
    expect(readFileSync(path, 'utf8')).toBe('{"unknown":true}');
    expect(readFileSync(temporary, 'utf8')).toBe('another writer');
  });

  it('cleans its temporary file after a failed write without replacing disk settings', () => {
    writeFileSync(path, '{"unknown":true}');
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('write denied');
    });
    expect(() => saveThemeConfig({ icons: 'ascii' }, path)).toThrow(
      'write denied',
    );
    expect(readFileSync(path, 'utf8')).toBe('{"unknown":true}');
    expect(readdirSync(directory)).toEqual(['pi-thoth-theme.json']);
  });
  it('merges patches into the latest disk settings, including nested unknown fields', () => {
    writeFileSync(
      path,
      JSON.stringify({
        icons: 'nerd',
        animation: 'full',
        unknown: 42,
        tools: { enabled: true, respectPackages: ['custom'], custom: true },
        statusLine: { enabled: true, subscriptionProviders: ['custom'] },
      }),
    );
    saveThemeConfig(
      {
        icons: 'ascii',
        tools: { collapsed: 'line' },
        statusLine: { enabled: false },
      },
      path,
    );
    saveThemeConfig(
      {
        animation: 'off',
        inputBox: { enabled: false },
        welcome: { enabled: false },
        tools: { enabled: false },
      },
      path,
    );
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      icons: 'ascii',
      animation: 'off',
      unknown: 42,
      tools: {
        enabled: false,
        collapsed: 'line',
        respectPackages: ['custom'],
        custom: true,
      },
      statusLine: { enabled: false, subscriptionProviders: ['custom'] },
      inputBox: { enabled: false },
      welcome: { enabled: false },
    });
    expect(readdirSync(directory)).toEqual(['pi-thoth-theme.json']);
  });
});

describe('animation configuration', () => {
  it.each([
    'full',
    'reduced',
    'minimal',
    'off',
  ] as const)('loads %s', (animation) => {
    writeFileSync(path, JSON.stringify({ animation }));
    expect(loadConfig(path).animation).toBe(animation);
  });

  it.each([
    undefined,
    null,
    false,
    42,
    'slow',
    'FULL',
    [],
    {},
  ])('defaults malformed or missing animation %j to full', (animation) => {
    writeFileSync(path, JSON.stringify({ animation }));
    expect(loadConfig(path).animation).toBe('full');
  });

  it('atomically replaces only animation through a same-directory temporary file', () => {
    const original = {
      icons: 'ascii',
      tools: { enabled: false, custom: 1 },
      unknown: { keep: true },
    };
    writeFileSync(path, JSON.stringify(original));
    const renameFile = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      expect(String(source)).toMatch(/pi-thoth-theme\.json\..+\.tmp$/);
      expect(target).toBe(path);
      expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(original));
      expect(JSON.parse(readFileSync(source, 'utf8'))).toEqual({
        ...original,
        animation: 'minimal',
      });
      renameFile(source, target);
    });
    saveAnimationLevel('minimal', path);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      ...original,
      animation: 'minimal',
    });
    expect(readdirSync(directory)).toEqual(['pi-thoth-theme.json']);
  });

  it.each([
    '{ "icons": "ascii",\n',
    '["hand-written", "settings"]\n',
    '"hand-written settings"\n',
    'null\n',
    '42\n',
    'false\n',
  ])('refuses to overwrite malformed or non-object config %j', (contents) => {
    writeFileSync(path, contents);
    const before = readFileSync(path);
    const rename = vi.spyOn(fs, 'renameSync');
    expect(() => saveAnimationLevel('off', path)).toThrow(
      `Cannot save theme settings to ${path}: fix the file first; expected valid JSON containing an object.`,
    );
    expect(readFileSync(path)).toEqual(before);
    expect(rename).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual(['pi-thoth-theme.json']);
  });

  it('creates the configured agent directory when no config exists yet', () => {
    const nested = join(directory, 'new-agent', 'pi-thoth-theme.json');
    saveAnimationLevel('off', nested);
    expect(JSON.parse(readFileSync(nested, 'utf8'))).toEqual({
      animation: 'off',
    });
  });

  it('leaves the original file intact and removes the temporary file if rename fails', () => {
    writeFileSync(path, '{"animation":"full","unknown":true}');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename denied');
    });
    expect(() => saveAnimationLevel('off', path)).toThrow('rename denied');
    expect(readFileSync(path, 'utf8')).toBe(
      '{"animation":"full","unknown":true}',
    );
    expect(readdirSync(directory)).toEqual(['pi-thoth-theme.json']);
  });
});

describe('input-box configuration', () => {
  it.each([
    { config: {}, enabled: true },
    { config: { inputBox: { enabled: true } }, enabled: true },
    { config: { inputBox: { enabled: false } }, enabled: false },
    { config: { inputBox: false }, enabled: true },
    { config: { inputBox: null }, enabled: true },
    { config: { inputBox: { enabled: 'false' } }, enabled: true },
  ])('uses the default-enabled module flag for $config', ({
    config,
    enabled,
  }) => {
    writeFileSync(path, JSON.stringify(config));
    expect(loadConfig(path).inputBox?.enabled ?? true).toBe(enabled);
    expect(loadConfig(path).statusLine.enabled).toBe(true);
  });
});
