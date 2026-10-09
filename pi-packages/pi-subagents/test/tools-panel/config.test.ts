import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  readToolsConfig,
  saveToolsConfig,
} from '../../src/tools-panel/config.js';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture(content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'generic-tools-'));
  roots.push(root);
  vi.stubEnv('PI_CODING_AGENT_DIR', path.join(root, 'global'));
  fs.mkdirSync(path.join(root, '.pi', 'agents'), { recursive: true });
  const target = path.join(root, '.pi', 'agents', 'worker.md');
  fs.writeFileSync(target, content);
  return { root, target };
}

test('generic save edits only tools and preserves manual globs, unknown names, CRLF and body bytes', () => {
  const original =
    '---\r\nname: worker\r\nmodel: provider/custom\r\n"\\u0074ools":\r\n  - "*"\r\n  - agent_browser_*\r\n  - retired_tool\r\n  - read\r\n# keep\r\ndisallowed_tools: [ask_orchestrator] # keep\r\nother: untouched\r\n---\r\nExact body.\r\n';
  const { root, target } = fixture(original);
  const snapshot = readToolsConfig(root);
  expect(snapshot.roles[0]?.defaultTools).toBeUndefined();
  const result = saveToolsConfig(snapshot, [
    { role: 'worker', tools: ['*', 'agent_browser_*', 'retired_tool', 'bash'] },
  ]);
  expect(result).toMatchObject({ success: true, changedRoles: ['worker'] });
  expect(fs.readFileSync(target, 'utf8')).toBe(
    original.replace(
      '"\\u0074ools":\r\n  - "*"\r\n  - agent_browser_*\r\n  - retired_tool\r\n  - read',
      '"\\u0074ools": "*, agent_browser_*, retired_tool, bash"',
    ),
  );
});

test('empty definition selections use configured defaults without materializing them on clean save', () => {
  const original = '---\nname: worker\ntools: []\n---\nBody.\n';
  const { root, target } = fixture(original);
  fs.writeFileSync(
    path.join(root, '.pi', 'subagents.json'),
    JSON.stringify({ default_tools: ['read', 'bash'] }),
  );
  const snapshot = readToolsConfig(root);
  expect(snapshot.roles[0]?.tools).toEqual(['read', 'bash']);
  expect(saveToolsConfig(snapshot, snapshot.roles).success).toBe(true);
  expect(fs.readFileSync(target, 'utf8')).toBe(original);
});

test('preflights all selected definitions and refuses stale content before any writes', () => {
  const { root, target } = fixture(
    '---\nname: worker\ntools: read\n---\nBody.\n',
  );
  const second = path.join(root, '.pi', 'agents', 'oracle.md');
  fs.writeFileSync(second, '---\nname: oracle\ntools: read\n---\nBody.\n');
  const snapshot = readToolsConfig(root);
  fs.appendFileSync(target, 'Operator change.\n');
  const result = saveToolsConfig(
    snapshot,
    snapshot.roles.map(({ role }) => ({ role, tools: ['bash'] })),
  );
  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringMatching(/changed since opening/),
  });
  expect(fs.readFileSync(second, 'utf8')).toContain('tools: read');
  expect(fs.readFileSync(target, 'utf8')).toContain('Operator change.');
});

test('detects a pre-replacement race, preserves the concurrent edit and removes the temporary file', () => {
  const { root, target } = fixture(
    '---\nname: worker\ntools: read\n---\nBody.\n',
  );
  const snapshot = readToolsConfig(root);
  const write = fs.writeFileSync;
  const operator = `${snapshot.contents.worker}Concurrent edit.\n`;
  vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
    write(file, data, options);
    if (String(file).includes('.tmp-')) write(target, operator);
  });
  const result = saveToolsConfig(snapshot, [
    { role: 'worker', tools: ['bash'] },
  ]);
  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringMatching(/changed before replacement/),
  });
  expect(fs.readFileSync(target, 'utf8')).toBe(operator);
  expect(
    fs.readdirSync(path.dirname(target)).some((file) => file.includes('.tmp-')),
  ).toBe(false);
});

test.each([
  false,
  true,
])('partial-save retry preserves manual entries and the unsaved draft (reset: %s)', (reset) => {
  const { root } = fixture(
    '---\nname: worker\ntools: "*, read, agent_browser_*, mystery_tool"\n---\nBody.\n',
  );
  fs.writeFileSync(
    path.join(root, '.pi', 'agents', 'oracle.md'),
    '---\nname: oracle\ntools: "*, read, agent_browser_*, mystery_tool"\n---\nBody.\n',
  );
  const snapshot = readToolsConfig(root);
  const drafts = snapshot.roles.map(({ role }) => ({
    role,
    tools: reset
      ? ['read', 'bash']
      : ['*', 'read', 'agent_browser_*', 'mystery_tool', 'bash'],
  }));
  const rename = fs.renameSync;
  const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (String(to).endsWith('worker.md')) throw new Error('File locked');
    rename(from, to);
  });
  const partial = saveToolsConfig(snapshot, drafts);
  expect(partial).toMatchObject({
    success: false,
    changedRoles: ['oracle'],
    error: 'File locked',
  });
  expect(partial.snapshot.roles.map(({ tools }) => tools)).toEqual([
    drafts[0]?.tools,
    ['*', 'read', 'agent_browser_*', 'mystery_tool'],
  ]);
  spy.mockRestore();
  const retry = saveToolsConfig(partial.snapshot, drafts);
  expect(retry).toMatchObject({ success: true, changedRoles: ['worker'] });
  expect(readToolsConfig(root).roles.map(({ tools }) => tools)).toEqual(
    drafts.map(({ tools }) => tools),
  );
});

test.each([
  '@active',
  'subagent_run',
  'SUBAGENT_KILL',
  '',
  'tool name',
])('rejects reserved/invalid selector %s before any write', (tool) => {
  const { root, target } = fixture(
    '---\nname: worker\ntools: read\n---\nBody.\n',
  );
  const snapshot = readToolsConfig(root);
  const result = saveToolsConfig(snapshot, [{ role: 'worker', tools: [tool] }]);
  expect(result).toMatchObject({ success: false, changedRoles: [] });
  expect(fs.readFileSync(target, 'utf8')).toBe(snapshot.contents.worker);
});

test('edits only the resolved project definition, not its shadowed global copy', () => {
  const { root, target } = fixture(
    '---\nname: worker\ntools: read\n---\nProject.\n',
  );
  const global = path.join(root, 'global', 'agents', 'worker.md');
  fs.mkdirSync(path.dirname(global), { recursive: true });
  fs.writeFileSync(global, '---\nname: worker\ntools: write\n---\nGlobal.\n');
  const snapshot = readToolsConfig(root);
  expect(snapshot.roles).toHaveLength(1);
  expect(snapshot.roles[0]).toMatchObject({
    scope: 'project',
    filePath: target,
  });
  expect(
    saveToolsConfig(snapshot, [{ role: 'worker', tools: ['bash'] }]).success,
  ).toBe(true);
  expect(fs.readFileSync(global, 'utf8')).toContain('tools: write');
});

test.each([
  ['"\u0074ools": [read, bash] # keep', '"\u0074ools": "read, write" # keep'],
  ['? tools\n: \n  - read\n  - bash', '? tools\n: \n  "read, write"'],
  [
    'tools:\n  - read\n# between list items\n  - bash\n# keep',
    'tools: "read, write"\n# keep',
  ],
])('replaces AST ranges without changing surrounding bytes: %s', (before, after) => {
  const original = `---\nname: worker\n${before}\nother: keep\n---\nExact body.\n`;
  const { root, target } = fixture(original);
  const result = saveToolsConfig(readToolsConfig(root), [
    { role: 'worker', tools: ['read', 'write'] },
  ]);
  expect(result.success).toBe(true);
  expect(fs.readFileSync(target, 'utf8')).toBe(original.replace(before, after));
});

test('adds tools to a definition without frontmatter and preserves the complete body', () => {
  const body = '# Worker\r\nExact body.\r\n';
  const { root, target } = fixture(body);
  const result = saveToolsConfig(readToolsConfig(root), [
    { role: 'worker', tools: ['bash'] },
  ]);
  expect(result.success).toBe(true);
  expect(fs.readFileSync(target, 'utf8')).toBe(
    `---\r\ntools: "bash"\r\n---\r\n${body}`,
  );
});

test('rejects a definition directory replaced with a junction instead of writing outside resolved scope', () => {
  const { root, target } = fixture(
    '---\nname: worker\ntools: read\n---\nBody.\n',
  );
  const snapshot = readToolsConfig(root);
  const external = path.join(root, 'operator');
  fs.mkdirSync(external);
  fs.writeFileSync(
    path.join(external, 'worker.md'),
    snapshot.contents.worker ?? '',
  );
  fs.rmSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(external, path.dirname(target), 'junction');
  const result = saveToolsConfig(snapshot, [
    { role: 'worker', tools: ['bash'] },
  ]);
  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringMatching(/symlinked parent/),
  });
  expect(fs.readFileSync(path.join(external, 'worker.md'), 'utf8')).toBe(
    snapshot.contents.worker,
  );
});
