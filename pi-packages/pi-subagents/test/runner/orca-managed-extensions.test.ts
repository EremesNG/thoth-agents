import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DefaultPackageManager,
  ProjectTrustStore,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { leanResources } from '../../src/runner/lean-resources.js';
import { excludeOrcaManagedExtensions } from '../../src/runner/orca-managed-extensions.js';

const sdk = { DefaultPackageManager, ProjectTrustStore, SettingsManager };
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-orca-extensions-'));
  roots.push(root);
  const cwd = path.join(root, 'project');
  const agentDir = path.join(root, 'agent');
  fs.mkdirSync(cwd);
  fs.mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
  const write = (name: string, content: string) => {
    const file = path.join(agentDir, 'extensions', name);
    fs.writeFileSync(file, content);
    return file;
  };
  const discover = () =>
    leanResources(
      sdk,
      cwd,
      agentDir,
      { cwd, isProjectTrusted: () => false },
      true,
      undefined,
      () => {},
    );
  return { cwd, agentDir, write, discover };
}

it('lean resolution excludes marked entry files, not Orca-like filenames', async () => {
  const f = fixture();
  const managed = f.write(
    'renamed-status.ts',
    '// @orca-managed-pi-extension\nexport default () => {};',
  );
  const normal = f.write('orca-agent-status.ts', 'export default () => {};');
  const result = await f.discover();
  expect(result.additionalExtensionPaths).toEqual([normal]);
  expect(result.additionalExtensionPaths).not.toContain(managed);
});

it('keeps directory extensions without opening them or logging read errors across cached calls', () => {
  const f = fixture();
  const directory = path.join(f.agentDir, 'extensions', 'package');
  fs.mkdirSync(directory);
  fs.writeFileSync(
    path.join(directory, 'index.ts'),
    'export default () => {};',
  );
  fs.mkdirSync(path.join(f.cwd, '.pi'));
  fs.writeFileSync(
    path.join(f.cwd, '.pi', 'subagents.json'),
    JSON.stringify({ debug: true }),
  );
  const managed = f.write('marked.ts', '// @orca-managed-pi-extension');
  const paths = [directory, managed];
  const open = vi.spyOn(fs, 'openSync');
  const read = vi.spyOn(fs, 'readSync');
  expect(excludeOrcaManagedExtensions(paths, f.cwd)).toEqual([directory]);
  expect(open.mock.calls.some(([file]) => file === directory)).toBe(false);
  const reads = read.mock.calls.length;
  open.mockClear();
  expect(excludeOrcaManagedExtensions(paths, f.cwd)).toEqual([directory]);
  expect(open.mock.calls.some(([file]) => file === directory)).toBe(false);
  expect(read.mock.calls).toHaveLength(reads);
  const log = fs.readFileSync(
    path.join(f.cwd, '.pi', 'subagents-debug.log'),
    'utf8',
  );
  expect(log).not.toContain('orca_extension_read_error');
});

it('read failures fail open and are retried rather than cached', async () => {
  const f = fixture();
  const managed = f.write('unreadable.ts', '// @orca-managed-pi-extension');
  const open = fs.openSync;
  const readFailure = vi
    .spyOn(fs, 'openSync')
    .mockImplementation((file, ...args) => {
      if (file === managed) throw new Error('fixture read denied');
      return open(file, ...args);
    });
  expect((await f.discover()).additionalExtensionPaths).toContain(managed);
  readFailure.mockRestore();
  expect((await f.discover()).additionalExtensionPaths).not.toContain(managed);
});

it('unchanged entry files are read only once across child resolutions', async () => {
  const f = fixture();
  f.write('cached.ts', '// @orca-managed-pi-extension');
  f.write('normal.ts', 'export default () => {};');
  const read = vi.spyOn(fs, 'readSync');
  await f.discover();
  const reads = read.mock.calls.length;
  expect(reads).toBeGreaterThanOrEqual(2);
  await f.discover();
  expect(read.mock.calls).toHaveLength(reads);
});

it.each([
  'mtime',
  'size',
] as const)('entry %s changes invalidate detection', (change) => {
  const f = fixture();
  const managedContent = '// @orca-managed-pi-extension';
  const file = f.write('changed.ts', 'x'.repeat(managedContent.length));
  const before = fs.statSync(file);
  expect(excludeOrcaManagedExtensions([file], f.cwd)).toEqual([file]);
  fs.writeFileSync(file, managedContent + (change === 'size' ? '\n' : ''));
  fs.utimesSync(
    file,
    before.atime,
    change === 'mtime' ? new Date(before.mtimeMs + 2000) : before.mtime,
  );
  expect(excludeOrcaManagedExtensions([file], f.cwd)).toEqual([]);
});

it('reads at most the first 4 KiB, regardless of extension size', () => {
  const f = fixture();
  const file = f.write(
    'large.ts',
    `${' '.repeat(4096)}// @orca-managed-pi-extension`,
  );
  const read = vi.spyOn(fs, 'readSync');
  expect(excludeOrcaManagedExtensions([file], f.cwd)).toEqual([file]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][1].byteLength).toBe(4096);
});

it('logs excluded paths only once per process and read failures only to debug', () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.cwd, '.pi'));
  fs.writeFileSync(
    path.join(f.cwd, '.pi', 'subagents.json'),
    JSON.stringify({ debug: true }),
  );
  const managed = f.write('logged.ts', '// @orca-managed-pi-extension');
  const missing = path.join(f.agentDir, 'missing.ts');
  expect(excludeOrcaManagedExtensions([managed, missing], f.cwd)).toEqual([
    missing,
  ]);
  expect(excludeOrcaManagedExtensions([managed], f.cwd)).toEqual([]);
  const log = fs.readFileSync(
    path.join(f.cwd, '.pi', 'subagents-debug.log'),
    'utf8',
  );
  expect(log.match(/orca_extensions_excluded/g)).toHaveLength(1);
  expect(log).toContain(JSON.stringify(managed));
  expect(log).toContain('orca_extension_read_error');
});
