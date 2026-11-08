import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { detectCurrentConfig, updateOpenCodeMainConfig } from './config-io';
import { ensureConfigDir, getConfigJson, getLiteConfig } from './paths';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-v2-'));
  roots.push(root);
  vi.stubEnv('XDG_CONFIG_HOME', join(root, 'xdg'));
  vi.stubEnv('OPENCODE_CONFIG_DIR', join(root, 'custom'));
  ensureConfigDir();
  return root;
}
test('main and plugin config share the custom directory', () => {
  const root = setup();
  expect(getConfigJson()).toBe(join(root, 'custom', 'opencode.json'));
  expect(getLiteConfig()).toBe(join(root, 'custom', 'thoth-agents.json'));
});
test('migrates strings and package objects in both keys without disabling agents', () => {
  setup();
  writeFileSync(
    getConfigJson(),
    JSON.stringify({
      plugin: ['legacy', { package: 'thoth-agents@next' }],
      plugins: [
        'one',
        { package: 'thoth-agents' },
        'two',
        'thoth-agents@0.1.0',
      ],
      agent: { general: { model: 'user/model' } },
    }),
  );
  expect(
    updateOpenCodeMainConfig({ ensurePlugin: true, pluginVersion: '0.4.8' })
      .success,
  ).toBe(true);
  expect(JSON.parse(readFileSync(getConfigJson(), 'utf8'))).toEqual({
    plugin: ['legacy'],
    plugins: ['one', 'two', 'thoth-agents@0.4.8'],
    agent: { general: { model: 'user/model' } },
  });
  expect(detectCurrentConfig().isInstalled).toBe(true);
});
const managedForms = [
  'thoth-agents@next',
  { package: 'thoth-agents@next', options: {} },
  ['thoth-agents@next', {}],
];

for (const key of ['plugin', 'plugins'] as const) {
  test.each(
    managedForms.map((entry) => ({ entry })),
  )(`migrates $entry from ${key} while preserving unrelated order`, ({
    entry,
  }) => {
    setup();
    const unrelated = [
      'one',
      ['other@next', { enabled: true }],
      { package: 'two' },
    ];
    writeFileSync(
      getConfigJson(),
      JSON.stringify({ [key]: [unrelated[0], entry, ...unrelated.slice(1)] }),
    );
    expect(detectCurrentConfig().isInstalled).toBe(true);
    expect(
      updateOpenCodeMainConfig({ ensurePlugin: true, pluginVersion: '0.11.0' })
        .success,
    ).toBe(true);
    expect(JSON.parse(readFileSync(getConfigJson(), 'utf8'))).toEqual(
      key === 'plugin'
        ? { plugin: unrelated, plugins: ['thoth-agents@0.11.0'] }
        : { plugins: [...unrelated, 'thoth-agents@0.11.0'] },
    );
  });

  test.each([
    { entry: ['thoth-agents@next', { enabled: true }] },
    { entry: { package: 'thoth-agents', options: { enabled: true } } },
  ])(`reports non-empty options removed from ${key} and retains them in the backup`, ({
    entry,
  }) => {
    setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = JSON.stringify({ [key]: [entry] });
    writeFileSync(getConfigJson(), original);
    expect(
      updateOpenCodeMainConfig({ ensurePlugin: true, pluginVersion: '0.11.0' })
        .success,
    ).toBe(true);
    expect(JSON.parse(readFileSync(getConfigJson(), 'utf8'))).toEqual({
      plugins: ['thoth-agents@0.11.0'],
    });
    expect(readFileSync(`${getConfigJson()}.bak`, 'utf8')).toBe(original);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Removed non-empty thoth-agents plugin options'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`${getConfigJson()}.bak`),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('thoth-agents.json'),
    );
  });

  test.each(
    managedForms.map((entry) => ({ entry })),
  )(`dry-run recognizes $entry under ${key} without writes`, async ({
    entry,
  }) => {
    const root = setup();
    const { buildOpenCodeInstallPlan } = await import('./operations/opencode');
    const original = JSON.stringify({ [key]: [entry] });
    writeFileSync(getConfigJson(), original);
    const plan = buildOpenCodeInstallPlan({ cwd: root, env: { HOME: root } });
    expect(plan.dryRun).toBe(true);
    expect(plan.canApply).toBe(true);
    expect(
      plan.warnings.some(({ code }) => code === 'opencode-plugin-drift'),
    ).toBe(true);
    expect(readFileSync(getConfigJson(), 'utf8')).toBe(original);
    expect(existsSync(`${getConfigJson()}.bak`)).toBe(false);
    expect(existsSync(getLiteConfig())).toBe(false);
  });
}

test('deduplicates all managed forms across both keys and drops empty legacy plugin', () => {
  setup();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  writeFileSync(
    getConfigJson(),
    JSON.stringify({
      plugin: managedForms,
      plugins: ['other', ...managedForms],
    }),
  );
  expect(
    updateOpenCodeMainConfig({ ensurePlugin: true, pluginVersion: '0.11.0' })
      .success,
  ).toBe(true);
  expect(JSON.parse(readFileSync(getConfigJson(), 'utf8'))).toEqual({
    plugins: ['other', 'thoth-agents@0.11.0'],
  });
  expect(warn).not.toHaveBeenCalled();
});

test('drops an empty legacy key and rejects unresolved version without writes', () => {
  setup();
  const original = JSON.stringify({ plugin: ['thoth-agents'] });
  writeFileSync(getConfigJson(), original);
  expect(updateOpenCodeMainConfig({ ensurePlugin: true }).success).toBe(false);
  expect(readFileSync(getConfigJson(), 'utf8')).toBe(original);
  expect(existsSync(`${getConfigJson()}.bak`)).toBe(false);
  expect(
    updateOpenCodeMainConfig({ ensurePlugin: true, pluginVersion: '0.4.8' })
      .success,
  ).toBe(true);
  expect(JSON.parse(readFileSync(getConfigJson(), 'utf8'))).toEqual({
    plugins: ['thoth-agents@0.4.8'],
  });
});

test.each([
  '1.18.2',
  'opencode v2.2.4',
  'opencode v2.2.5',
  '2.2.5',
  'unknown',
  null,
  '2.2.6-beta.1',
  '2.2.6+_',
  '2.2.6+..',
  '2.2.6+build..1',
  '2.2.6+build.',
  '02.2.6',
])('rejects unsupported host output %s', async (output) => {
  const { isSupportedOpenCodeVersion } = await import('./system');
  expect(isSupportedOpenCodeVersion(output)).toBe(false);
});
test.each([
  'opencode v2.2.6',
  '2.2.6',
  '2.2.6+build.1',
  '2.2.6+build-1.0',
  'v2.2.6',
  ' OPENCODE V2.2.6+build.1\n',
  '2.3.0',
  '3.0.0',
])('accepts supported host output %s', async (output) => {
  const { isSupportedOpenCodeVersion } = await import('./system');
  expect(isSupportedOpenCodeVersion(output)).toBe(true);
});
