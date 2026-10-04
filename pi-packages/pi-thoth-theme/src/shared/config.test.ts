import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'thoth-input-box-config-'));
  path = join(directory, 'pi-thoth-theme.json');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

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
