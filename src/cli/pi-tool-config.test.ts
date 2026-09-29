import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { PI_SPECIALIST_ROLES } from '../harness/pi-specialists';
import * as managedWrite from './pi-managed-write';
import {
  readPiSpecialistToolOverrides,
  readPiToolConfig,
  savePiToolConfig,
  validatePiSpecialistTools,
} from './pi-tool-config';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-tools-'));
  roots.push(root);
  const agents = join(root, 'agents');
  mkdirSync(agents);
  for (const role of PI_SPECIALIST_ROLES) {
    writeFileSync(
      join(agents, `thoth-${role}.md`),
      `---\nname: thoth-${role}\nmanaged-by: thoth-agents\nmodel: provider/${role}\neffort: high\nsubagent_mode: task\n---\nInstructions for ${role}.\n`,
    );
  }
  return root;
}

test('reads explicit inline, multiline, and scalar lists and retains unavailable names', () => {
  const piRoot = fixture();
  const agents = join(piRoot, 'agents');
  writeFileSync(
    join(agents, 'thoth-explorer.md'),
    readFileSync(join(agents, 'thoth-explorer.md'), 'utf8').replace(
      '---\nInstructions',
      'tools: [read, bash]\n---\nInstructions',
    ),
  );
  writeFileSync(
    join(agents, 'thoth-librarian.md'),
    readFileSync(join(agents, 'thoth-librarian.md'), 'utf8').replace(
      '---\nInstructions',
      'tools:\n  - lookup_docs\n  - read\n---\nInstructions',
    ),
  );
  writeFileSync(
    join(agents, 'thoth-oracle.md'),
    readFileSync(join(agents, 'thoth-oracle.md'), 'utf8').replace(
      '---\nInstructions',
      'tools: retired_extension, read\n---\nInstructions',
    ),
  );

  const snapshot = readPiToolConfig(piRoot);
  expect(snapshot.roles).toHaveLength(5);
  expect(
    snapshot.roles.map(({ role, defaultTools }) => [role, defaultTools]),
  ).toEqual([
    ['explorer', ['read', 'bash']],
    [
      'librarian',
      [
        'read',
        'bash',
        'resolve-library-id',
        'query-docs',
        'mcp',
        'web_search',
        'fetch_content',
        'get_search_content',
        'source_check',
      ],
    ],
    ['oracle', ['read', 'bash']],
    ['designer', ['read', 'bash', 'edit', 'write']],
    ['worker', ['read', 'bash', 'edit', 'write']],
  ]);
  expect(snapshot.roles.find(({ role }) => role === 'explorer')).toMatchObject({
    tools: ['read', 'bash'],
  });
  expect(
    snapshot.roles.find(({ role }) => role === 'librarian')?.tools,
  ).toEqual(['lookup_docs', 'read']);
  expect(snapshot.roles.find(({ role }) => role === 'oracle')?.tools).toEqual([
    'retired_extension',
    'read',
  ]);
  expect(snapshot.roles.find(({ role }) => role === 'worker')?.tools).toEqual(
    snapshot.roles.find(({ role }) => role === 'worker')?.defaultTools,
  );
});

test('reads explicit YAML mapping keys and rejects semantic duplicates', () => {
  expect(
    readPiSpecialistToolOverrides(
      '---\n? tools\n: read\n? subagent_mode\n: task\n---\nInstructions.\n',
    ),
  ).toEqual({ tools: ['read'], subagentMode: 'task' });

  expect(() =>
    readPiSpecialistToolOverrides(
      '---\ntools: read\n? tools\n: [bash]\n---\nInstructions.\n',
    ),
  ).toThrow(/duplicate.*tools/i);
  expect(() =>
    readPiSpecialistToolOverrides(
      '---\nsubagent_mode: task\n? subagent_mode\n: background\n---\nInstructions.\n',
    ),
  ).toThrow(/duplicate.*subagent_mode/i);
});

test('surgically updates escaped and explicit keys while preserving CRLF and unrelated bytes', () => {
  const piRoot = fixture();
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  const original =
    '---\r\nname: thoth-worker\r\nmanaged-by: thoth-agents\r\nmodel: provider/custom\r\neffort: max\r\n"\\u0074ools":\r\n  - read\r\n# keep this comment\r\n? subagent_mode\r\n: background\r\nother-setting: untouched\r\n---\r\nExact body.\r\n';
  writeFileSync(target, original);
  const snapshot = readPiToolConfig(piRoot, ['worker']);

  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: ['lookup_docs'] },
  ]);

  expect(result.success).toBe(true);
  expect(readFileSync(target, 'utf8')).toBe(
    original.replace(
      '"\\u0074ools":\r\n  - read\r\n',
      '"\\u0074ools": "lookup_docs"\r\n',
    ),
  );
  expect(readPiToolConfig(piRoot, ['worker']).roles[0]?.tools).toEqual([
    'lookup_docs',
  ]);
});

test('saves explicit mapping keys using their AST value ranges', () => {
  const piRoot = fixture();
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  const original =
    '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: provider/custom\n? tools\n: \n  - read\n  - bash\nother-setting: keep\n---\nBody.\n';
  writeFileSync(target, original);
  const snapshot = readPiToolConfig(piRoot, ['worker']);

  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: ['lookup_docs'] },
  ]);

  expect(result.success).toBe(true);
  expect(readFileSync(target, 'utf8')).toBe(
    original.replace(': \n  - read\n  - bash\n', ': \n  "lookup_docs"\n'),
  );
  expect(readPiToolConfig(piRoot, ['worker']).roles[0]?.tools).toEqual([
    'lookup_docs',
  ]);
});

test('reads multiline tool items separated by column-zero comments', () => {
  const content =
    '---\ntools:\n  - read\n# comment between items\n  - bash\n---\nInstructions.\n';

  expect(readPiSpecialistToolOverrides(content)).toEqual({
    tools: ['read', 'bash'],
  });
});

test('saves explicit selections while preserving model, effort, mode, other frontmatter, and body', () => {
  const piRoot = fixture();
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  writeFileSync(
    target,
    '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: provider/custom\neffort: max\nsubagent_mode: background\nother-setting: keep\ntools: "old_extension, read"\n---\nExact instruction body.\n',
  );
  const snapshot = readPiToolConfig(piRoot);
  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: ['retired_extension', 'bash'] },
  ]);

  expect(result).toMatchObject({ success: true, changedRoles: ['worker'] });
  expect(readFileSync(target, 'utf8')).toBe(
    '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: provider/custom\neffort: max\nsubagent_mode: background\nother-setting: keep\ntools: "retired_extension, bash"\n---\nExact instruction body.\n',
  );
  expect(
    readPiToolConfig(piRoot).roles.find(({ role }) => role === 'worker'),
  ).toMatchObject({ tools: ['retired_extension', 'bash'] });
});

test('replaces the complete multiline tools list across column-zero comments', () => {
  const piRoot = fixture();
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  const original = readFileSync(target, 'utf8').replace(
    '---\nInstructions',
    'tools:\n  - read\n# comment between items\n  - bash\n---\nInstructions',
  );
  writeFileSync(target, original);
  const snapshot = readPiToolConfig(piRoot);

  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: ['lookup_docs'] },
  ]);

  expect(result.success).toBe(true);
  const updated = readFileSync(target, 'utf8');
  expect(updated).toContain('tools: "lookup_docs"');
  expect(updated).not.toMatch(/^\s+- (?:read|bash)$/m);
  expect(
    readPiToolConfig(piRoot).roles.find(({ role }) => role === 'worker'),
  ).toMatchObject({ tools: ['lookup_docs'] });
});

test('rejects empty, duplicate, mixed selector, unsupported pattern, delegation, and root-only names without writing', () => {
  const piRoot = fixture();
  const snapshot = readPiToolConfig(piRoot);
  for (const tools of [
    [],
    [''],
    ['   '],
    ['read', 'read'],
    ['read', '*'],
    ['read', '@active'],
    ['*', '@active'],
    ['@active', '@active'],
    ['read*'],
    ['@act*'],
    ['subagent_run'],
    ['ask_user_question'],
    ['todo'],
  ]) {
    expect(() => validatePiSpecialistTools(tools)).toThrow();
    const result = savePiToolConfig(snapshot, [{ role: 'worker', tools }]);
    expect(result.success).toBe(false);
    expect(result.changedRoles).toEqual([]);
  }
  expect(
    readFileSync(join(piRoot, 'agents', 'thoth-worker.md'), 'utf8'),
  ).not.toContain('tools:');
});

test.each([
  '*',
  '@active',
] as const)('saves and reloads the standalone %s selector as a quoted YAML scalar', (selector) => {
  const piRoot = fixture();
  const snapshot = readPiToolConfig(piRoot, ['worker']);

  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: [selector] },
  ]);

  expect(result.success).toBe(true);
  expect(result.changedRoles).toEqual(['worker']);
  expect(
    readFileSync(join(piRoot, 'agents', 'thoth-worker.md'), 'utf8'),
  ).toContain(`tools: ${JSON.stringify(selector)}`);
  const reloaded = readPiToolConfig(piRoot);
  expect(reloaded.roles.find(({ role }) => role === 'worker')?.tools).toEqual([
    selector,
  ]);
  for (const role of reloaded.roles.filter(({ role }) => role !== 'worker'))
    expect(role.tools).toEqual(role.defaultTools);
});

test('rejects malformed and duplicate saved fields rather than guessing', () => {
  const piRoot = fixture();
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  const original = readFileSync(target, 'utf8');
  writeFileSync(
    target,
    `${original.replace('---\nInstructions', 'tools: "read*"\n---\nInstructions')}`,
  );
  expect(() => readPiToolConfig(piRoot)).toThrow(/wildcard/i);
  writeFileSync(
    target,
    original.replace(
      '---\nInstructions',
      'tools: read\ntools: bash\n---\nInstructions',
    ),
  );
  expect(() => readPiToolConfig(piRoot)).toThrow(/duplicate.*tools/i);
});

test('reads quoted and escaped YAML keys by their semantic values', () => {
  expect(
    readPiSpecialistToolOverrides(
      '---\n"tools": [read, bash]\n"subagent_mode": background\n---\nBody.\n',
    ),
  ).toEqual({ tools: ['read', 'bash'], subagentMode: 'background' });
  expect(
    readPiSpecialistToolOverrides(
      '---\n"\\u0074ools": [read]\n"subagent_\\u006dode": task\n---\nBody.\n',
    ),
  ).toEqual({ tools: ['read'], subagentMode: 'task' });
  expect(
    readPiSpecialistToolOverrides('---\n"\\x74ools": [bash]\n---\nBody.\n'),
  ).toEqual({ tools: ['bash'] });
});

test.each([
  {
    name: 'quoted duplicate tools semantic key',
    fields: 'tools: read\n"tools" : [bash]',
    error: /duplicate.*tools/i,
  },
  {
    name: 'whitespace-varied duplicate tools key',
    fields: 'tools: read\ntools \t: [bash]',
    error: /duplicate.*tools/i,
  },
  {
    name: 'escaped quoted duplicate tools semantic key',
    fields: 'tools: read\n"\\u0074ools" : [bash]',
    error: /duplicate.*tools/i,
  },
  {
    name: 'escaped tools alias before plain duplicate key',
    fields: '"\\u0074ools": [read]\ntools: bash',
    error: /duplicate.*tools/i,
  },
  {
    name: 'scalar tools continuation',
    fields: 'tools: read\n  - bash',
    error: /tools.*continuation/i,
  },
  {
    name: 'scalar tools continuation after column-zero comment',
    fields: 'tools: read\n# comment\n  - bash',
    error: /Invalid Pi specialist YAML frontmatter/i,
  },
  {
    name: 'inconsistent multiline tools indentation',
    fields: 'tools:\n  - read\n    - bash',
    error: /tools.*continuation/i,
  },
  {
    name: 'quoted duplicate subagent_mode semantic key',
    fields: 'subagent_mode: task\n"subagent_mode" : background',
    error: /duplicate.*subagent_mode/i,
  },
  {
    name: 'escaped quoted duplicate subagent_mode semantic key',
    fields: 'subagent_mode: task\n"subagent_\\u006dode" : background',
    error: /duplicate.*subagent_mode/i,
  },
  {
    name: 'escaped subagent_mode alias before plain duplicate key',
    fields: '"subagent_\\u006dode": background\nsubagent_mode: task',
    error: /duplicate.*subagent_mode/i,
  },
  {
    name: 'subagent_mode scalar continuation',
    fields: 'subagent_mode: task\n  - background',
    error: /subagent_mode.*continuation/i,
  },
  {
    name: 'subagent_mode scalar continuation after column-zero comment',
    fields: 'subagent_mode: task\n# comment\n  - background',
    error: /Invalid Pi specialist YAML frontmatter/i,
  },
])('rejects $name when reading specialist overrides', ({ fields, error }) => {
  const piRoot = fixture();
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  const original = readFileSync(target, 'utf8');
  const malformed = original
    .replace('subagent_mode: task\n', '')
    .replace('---\nInstructions', `${fields}\n---\nInstructions`);
  writeFileSync(target, malformed);

  expect(() => readPiSpecialistToolOverrides(malformed)).toThrow(error);
  expect(() => readPiToolConfig(piRoot, ['worker'])).toThrow(error);
});

test.each([
  ['top-level scalar', 'not-a-map', /YAML mapping/i],
  ['top-level sequence', '- tools\n- read', /YAML mapping/i],
  [
    'anchor usage',
    'defaults: &defaults [read]\ntools: *defaults',
    /anchors|aliases/i,
  ],
  ['merge key', 'tools: [read]\n<<: {extra: value}', /merge keys/i],
  ['explicit tag', 'tools: !!seq [read]', /YAML tags/i],
  ['invalid YAML', 'tools: [read', /Invalid Pi specialist YAML frontmatter/i],
] as const)('refuses %s frontmatter safely', (_name, fields, error) => {
  expect(() =>
    readPiSpecialistToolOverrides(`---\n${fields}\n---\nBody.\n`),
  ).toThrow(error);
});

test.each([
  {
    name: 'quoted duplicate tools semantic key',
    fields: 'tools: read\n"tools" : [bash]',
    error: /duplicate.*tools/i,
  },
  {
    name: 'escaped quoted duplicate tools semantic key',
    fields: 'tools: read\n"\\u0074ools" : [bash]',
    error: /duplicate.*tools/i,
  },
  {
    name: 'explicit mapping duplicate tools semantic key',
    fields: 'tools: read\n? tools\n: [bash]',
    error: /duplicate.*tools/i,
  },
  {
    name: 'scalar tools continuation',
    fields: 'tools: read\n  - bash',
    error: /tools.*continuation/i,
  },
  {
    name: 'quoted duplicate subagent_mode semantic key',
    fields: 'subagent_mode: task\n"subagent_mode" : background',
    error: /duplicate.*subagent_mode/i,
  },
  {
    name: 'explicit mapping duplicate subagent_mode semantic key',
    fields: 'subagent_mode: task\n? subagent_mode\n: background',
    error: /duplicate.*subagent_mode/i,
  },
  {
    name: 'unsupported alias usage',
    fields: 'defaults: &defaults [read]\ntools: *defaults',
    error: /anchors|aliases/i,
  },
])('refuses to save $name from caller-supplied snapshot data', ({
  fields,
  error,
}) => {
  const piRoot = fixture();
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  const cleanSnapshot = readPiToolConfig(piRoot, ['worker']);
  const original = readFileSync(target, 'utf8');
  const malformed = original
    .replace('subagent_mode: task\n', '')
    .replace('---\nInstructions', `${fields}\n---\nInstructions`);
  writeFileSync(target, malformed);
  const snapshot = {
    ...cleanSnapshot,
    contents: { ...cleanSnapshot.contents, worker: malformed },
  };
  const write = vi.spyOn(managedWrite, 'writePiManagedText');

  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: ['new_tool'] },
  ]);

  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringMatching(error),
  });
  expect(readFileSync(target, 'utf8')).toBe(malformed);
  expect(write).not.toHaveBeenCalled();
});

test('validates caller-supplied snapshot bytes even when the on-disk file is clean', () => {
  const piRoot = fixture();
  const cleanSnapshot = readPiToolConfig(piRoot, ['worker']);
  const original = cleanSnapshot.contents.worker;
  const malformed = original?.replace(
    'managed-by: thoth-agents',
    'managed-by: thoth-agents\ntools: read\n? tools\n: [bash]',
  );
  expect(malformed).toBeDefined();
  const snapshot = {
    ...cleanSnapshot,
    contents: { ...cleanSnapshot.contents, worker: malformed },
  };
  const write = vi.spyOn(managedWrite, 'writePiManagedText');

  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: ['new_tool'] },
  ]);

  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringMatching(/duplicate.*tools/i),
  });
  expect(readFileSync(join(piRoot, 'agents', 'thoth-worker.md'), 'utf8')).toBe(
    original,
  );
  expect(write).not.toHaveBeenCalled();
});

test('preflights all roles for stale content and rejects symlinked managed paths', () => {
  const piRoot = fixture();
  const snapshot = readPiToolConfig(piRoot);
  const worker = join(piRoot, 'agents', 'thoth-worker.md');
  writeFileSync(
    worker,
    readFileSync(worker, 'utf8').replace('Instructions', 'Changed'),
  );
  const result = savePiToolConfig(snapshot, [
    { role: 'explorer', tools: ['new_tool'] },
    { role: 'worker', tools: ['new_tool'] },
  ]);
  expect(result).toMatchObject({ success: false, changedRoles: [] });
  expect(
    readFileSync(join(piRoot, 'agents', 'thoth-explorer.md'), 'utf8'),
  ).toBe(snapshot.contents.explorer);

  const fresh = readPiToolConfig(piRoot);
  writeFileSync(
    worker,
    readFileSync(worker, 'utf8').replace(
      'managed-by: thoth-agents',
      'managed-by: operator',
    ),
  );
  const unowned = savePiToolConfig(fresh, [
    { role: 'worker', tools: ['another_tool'] },
  ]);
  expect(unowned).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringMatching(/owned|managed/i),
  });

  const linked = join(piRoot, 'linked');
  mkdirSync(linked);
  symlinkSync(join(piRoot, 'agents'), join(linked, 'agents'), 'junction');
  expect(() => readPiToolConfig(linked)).toThrow(/symlink/i);
});

test('reports partial writes with a refreshed retry snapshot', () => {
  const piRoot = fixture();
  const snapshot = readPiToolConfig(piRoot);
  const roles = [
    { role: 'explorer' as const, tools: ['first_tool'] },
    { role: 'librarian' as const, tools: ['second_tool'] },
    { role: 'oracle' as const, tools: ['third_tool'] },
  ];
  const originalWrite = managedWrite.writePiManagedText;
  let count = 0;
  const spy = vi
    .spyOn(managedWrite, 'writePiManagedText')
    .mockImplementation((path, content, expectedBefore) => {
      if (++count === 2) throw new Error('File locked');
      return originalWrite(path, content, expectedBefore);
    });
  const partial = savePiToolConfig(snapshot, roles);
  expect(partial).toMatchObject({
    success: false,
    changedRoles: ['explorer'],
    error: expect.stringContaining('File locked'),
  });
  spy.mockRestore();

  const retry = savePiToolConfig(partial.snapshot, roles);
  expect(retry).toMatchObject({
    success: true,
    changedRoles: ['librarian', 'oracle'],
  });
  expect(readPiToolConfig(piRoot).roles.map(({ tools }) => tools)).toEqual([
    ['first_tool'],
    ['second_tool'],
    ['third_tool'],
    readPiToolConfig(piRoot).roles[3]?.defaultTools,
    readPiToolConfig(piRoot).roles[4]?.defaultTools,
  ]);
});

test('refuses a managed-file race after the snapshot preflight', () => {
  const piRoot = fixture();
  const snapshot = readPiToolConfig(piRoot);
  const target = join(piRoot, 'agents', 'thoth-worker.md');
  const originalWrite = managedWrite.writePiManagedText;
  const spy = vi
    .spyOn(managedWrite, 'writePiManagedText')
    .mockImplementation((path, content, expectedBefore) => {
      writeFileSync(target, 'operator replacement');
      return originalWrite(path, content, expectedBefore);
    });

  const result = savePiToolConfig(snapshot, [
    { role: 'worker', tools: ['replacement_tool'] },
  ]);
  spy.mockRestore();

  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: expect.stringContaining('changed since preflight'),
  });
  expect(readFileSync(target, 'utf8')).toBe('operator replacement');
});
