import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  readToolsConfig,
  saveToolsConfig,
} from '../../src/tools-panel/config.js';
import { createToolsPanel } from '../../src/tools-panel/panel.js';
import {
  getToolsPanelAdapter,
  publishToolsPanelCapability,
  type ToolsPanelAdapter,
  toolsPanelRegistryKey,
} from '../../src/tools-panel/registry.js';

// Host fixtures use a different TS module resolution mode. Exercise their
// runtime structural protocol without adding the root to this package's build.
const adapterModule = new URL(
  '../../../../src/cli/pi-tool-config.ts',
  import.meta.url,
).href;
const extensionModule = new URL('../../../../src/pi.ts', import.meta.url).href;
const { createPiToolsPanelAdapter } = (await import(adapterModule)) as {
  createPiToolsPanelAdapter(piRoot: string): ToolsPanelAdapter;
};
const { default: thothExtension } = (await import(extensionModule)) as {
  default(
    pi: { on: (...args: any[]) => void },
    options: { piRoot: string },
  ): void;
};

const roots: string[] = [];
const shared = globalThis as any;
afterEach(() => {
  delete shared[toolsPanelRegistryKey];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-adapter-'));
  roots.push(root);
  const global = path.join(root, 'global');
  vi.stubEnv('PI_CODING_AGENT_DIR', global);
  fs.mkdirSync(path.join(global, 'agents'), { recursive: true });
  for (const role of ['explorer', 'librarian', 'oracle', 'designer', 'worker'])
    fs.writeFileSync(
      path.join(global, 'agents', `thoth-${role}.md`),
      `---\nname: thoth-${role}\nmanaged-by: thoth-agents\ntools: "*, read, agent_browser_*, mystery_tool"\n---\nBody.\n`,
    );
  return { root, global };
}

test.each([
  'root-first',
  'subagents-first',
])('root adapter and capability interoperate without build-time imports (%s)', (order) => {
  const { root, global } = fixture();
  if (order === 'subagents-first') publishToolsPanelCapability();
  thothExtension({ on: vi.fn() }, { piRoot: global });
  if (order === 'root-first') publishToolsPanelCapability();
  expect(getToolsPanelAdapter()?.version).toBe(1);
  expect(shared[toolsPanelRegistryKey]?.capability?.version).toBe(1);
  expect(
    readToolsConfig(root).roles.every((role) =>
      role.defaultTools?.includes('bash'),
    ),
  ).toBe(true);
});

test.each([
  'overview',
  'tools',
])('reset and save materializes only adapter defaults for all five roles from %s', (screen) => {
  const { root, global } = fixture();
  shared[toolsPanelRegistryKey] = {
    version: 1,
    adapter: createPiToolsPanelAdapter(global),
  };
  const snapshot = readToolsConfig(root);
  const done = vi.fn();
  const panel = createToolsPanel({
    snapshot,
    discoveredTools: [{ name: 'read', active: true }],
    save: saveToolsConfig,
    onDone: done,
  });
  for (const role of snapshot.roles) {
    if (screen === 'tools') panel.handleInput('\r');
    panel.handleInput('r');
    if (screen === 'tools') panel.handleInput('q');
    panel.handleInput('j');
    expect(role.defaultTools).toBeDefined();
  }
  panel.handleInput('s');
  expect(done).toHaveBeenCalledWith({
    kind: 'saved',
    changedRoles: snapshot.roles.map(({ role }) => role),
  });
  expect(readToolsConfig(root).roles.map(({ tools }) => tools)).toEqual(
    snapshot.roles.map(({ defaultTools }) => defaultTools),
  );
  for (const role of snapshot.roles)
    expect(fs.readFileSync(role.filePath, 'utf8')).toBe(
      snapshot.contents[role.role]?.replace(
        'tools: "*, read, agent_browser_*, mystery_tool"',
        `tools: ${JSON.stringify(role.defaultTools?.join(', '))}`,
      ),
    );
});

test('generic project/unmanaged definitions bypass Thoth validation and get no reset defaults', () => {
  const { root, global } = fixture();
  const project = path.join(root, '.pi', 'agents', 'thoth-worker.md');
  fs.mkdirSync(path.dirname(project), { recursive: true });
  fs.writeFileSync(
    project,
    '---\nname: thoth-worker\ntools: read\n---\nProject.\n',
  );
  const unmanaged = path.join(global, 'agents', 'thoth-oracle.md');
  fs.writeFileSync(
    unmanaged,
    '---\nname: thoth-oracle\ntools: read\n---\nUnmanaged.\n',
  );
  shared[toolsPanelRegistryKey] = {
    version: 1,
    adapter: createPiToolsPanelAdapter(global),
  };
  const snapshot = readToolsConfig(root);
  const projectRole = snapshot.roles.find(
    ({ role }) => role === 'thoth-worker',
  );
  if (!projectRole) throw new Error('Missing project fixture');
  expect(projectRole).toMatchObject({ scope: 'project', tools: ['read'] });
  expect(projectRole.defaultTools).toBeUndefined();
  expect(
    snapshot.roles.find(({ role }) => role === 'thoth-oracle')?.defaultTools,
  ).toBeUndefined();
  expect(
    saveToolsConfig(snapshot, [
      { role: 'thoth-worker', tools: ['bash'] },
      { role: 'thoth-oracle', tools: ['bash'] },
    ]).success,
  ).toBe(true);
});

test('managed definitions never bypass validation after provenance removal or adapter withdrawal', () => {
  const { root, global } = fixture();
  shared[toolsPanelRegistryKey] = {
    version: 1,
    adapter: createPiToolsPanelAdapter(global),
  };
  const snapshot = readToolsConfig(root);
  const worker = snapshot.roles.find(({ role }) => role === 'thoth-worker');
  if (!worker) throw new Error('Missing managed fixture');
  const content = snapshot.contents[worker.role];
  if (!content) throw new Error('Missing managed contents');
  fs.writeFileSync(
    worker.filePath,
    content.replace('managed-by: thoth-agents', 'managed-by: operator'),
  );
  delete shared[toolsPanelRegistryKey];
  const result = saveToolsConfig(snapshot, [
    { role: worker.role, tools: ['bash'] },
  ]);
  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringMatching(/owned/i),
  });
  expect(fs.readFileSync(worker.filePath, 'utf8')).toContain(
    'managed-by: operator',
  );
});

test('without a compatible adapter reset is unavailable in both screens and cannot alter tools', () => {
  const { root } = fixture();
  shared[toolsPanelRegistryKey] = { version: 2, adapter: { version: 2 } };
  expect(getToolsPanelAdapter()).toBeUndefined();
  const snapshot = readToolsConfig(root);
  const panel = createToolsPanel({
    snapshot,
    discoveredTools: [{ name: 'read', active: true }],
    save: saveToolsConfig,
    onDone: vi.fn(),
  });
  expect(panel.render(180).join('\n')).not.toContain('r defaults');
  panel.handleInput('r');
  panel.handleInput('\r');
  panel.handleInput('r');
  expect(panel.render(180).join('\n')).not.toContain('r defaults');
  expect(panel.getState().draft).toEqual(snapshot.roles);
});

test('version tolerance ignores malformed v1 adapter callbacks while retaining capability', () => {
  shared[toolsPanelRegistryKey] = {
    version: 1,
    adapter: { version: 1, appliesTo: 'bad' },
    capability: { version: 1, command: 'subagents-tools' },
  };
  expect(getToolsPanelAdapter()).toBeUndefined();
  publishToolsPanelCapability();
  expect(shared[toolsPanelRegistryKey].capability.version).toBe(1);
});
