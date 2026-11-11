import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  convertToolsDefinition,
  prepareToolsConversion,
  readToolsConfig,
  saveToolsConfig,
} from '../../src/tools-panel/config.js';
import { createToolsPanel } from '../../src/tools-panel/panel.js';
import { retireDefinitionText } from '../../src/tools-panel/write.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture(globalTools = '*', copyTools = 'read, bash') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-tools-'));
  roots.push(root);
  vi.stubEnv('PI_CODING_AGENT_DIR', path.join(root, 'global'));
  const global = path.join(root, 'global', 'agents', 'worker.md');
  const copy = path.join(root, '.pi', 'agents', 'worker.md');
  for (const file of [global, copy])
    fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    global,
    `---\nname: worker\ndescription: global\ntools: "${globalTools}"\n---\nGlobal body\n`,
  );
  fs.writeFileSync(
    copy,
    `---\nname: worker\ndescription: copy\ntools: "${copyTools}"\n---\nCopy body\n`,
  );
  return { root, global, copy, snapshot: () => readToolsConfig(root) };
}
const inventory = ['read', 'bash', 'write'];

test('converts global * versus read,bash copy with exact removals and recoverable backup', () => {
  const f = fixture();
  const snapshot = f.snapshot();
  const plan = prepareToolsConversion(snapshot, 'worker', inventory);
  expect(plan).toMatchObject({
    eligible: true,
    overlay: { add: ['read', 'bash'], remove: ['write'] },
  });
  const result = convertToolsDefinition(snapshot, 'worker', inventory);
  expect(result.success).toBe(true);
  expect(fs.existsSync(f.copy)).toBe(false);
  expect(
    fs
      .readdirSync(path.dirname(f.copy))
      .some((name) => /^worker\.md\.bak-\d+-/.test(name)),
  ).toBe(true);
  expect(result.snapshot.roles[0]?.scope).toBe('global');
  expect(
    JSON.parse(
      fs.readFileSync(path.join(f.root, '.pi', 'subagents.json'), 'utf8'),
    ).agents.worker.tools,
  ).toEqual({ add: ['read', 'bash'], remove: ['write'] });
});

test('refuses conversion when another same-name project definition remains', () => {
  const f = fixture();
  const other = path.join(f.root, '.pi', 'subagents', 'worker.md');
  fs.mkdirSync(path.dirname(other), { recursive: true });
  fs.copyFileSync(f.copy, other);
  expect(
    prepareToolsConversion(f.snapshot(), 'worker', inventory),
  ).toMatchObject({
    eligible: false,
    error: expect.stringContaining('another same-name'),
  });
});

test.each([
  'final',
  'intermediate',
])('refuses %s non-equivalence, including disallowed_tools and existing overlays', (state) => {
  const f = fixture(
    state === 'final' ? '*' : 'read',
    state === 'final' ? 'read' : 'read, bash',
  );
  const text = fs.readFileSync(f.global, 'utf8');
  if (state === 'final')
    fs.writeFileSync(
      f.global,
      text.replace(
        '---\nGlobal body',
        'disallowed_tools: read\n---\nGlobal body',
      ),
    );
  else {
    fs.writeFileSync(
      f.global,
      text.replace(
        '---\nGlobal body',
        'disallowed_tools: bash\n---\nGlobal body',
      ),
    );
    fs.writeFileSync(
      path.join(f.root, '.pi', 'subagents.json'),
      JSON.stringify({
        agents: { worker: { tools: { add: [], remove: ['bash'] } } },
      }),
    );
  }
  expect(
    prepareToolsConversion(f.snapshot(), 'worker', inventory),
  ).toMatchObject({
    eligible: false,
    error: expect.stringContaining(
      state === 'final'
        ? 'global plus candidate'
        : 'intermediate copy plus candidate',
    ),
  });
});

test('confirmation enumerates description, body, unknown frontmatter and disallowed_tools differences', () => {
  const f = fixture();
  fs.writeFileSync(
    f.copy,
    fs
      .readFileSync(f.copy, 'utf8')
      .replace(
        '---\nCopy body',
        'custom: { nested: true }\ndisallowed_tools: absent\n---\nCopy body',
      ),
  );
  const plan = prepareToolsConversion(f.snapshot(), 'worker', inventory);
  expect(plan).toMatchObject({
    eligible: true,
    differences: [
      'description differs',
      'frontmatter: custom, disallowed_tools',
      'instructions (body) differ',
    ],
  });
});

test.each([
  'copy',
  'global',
  'overlay',
])('stale %s input refuses before any write or retirement', (file) => {
  const f = fixture();
  const snapshot = f.snapshot();
  const target =
    file === 'copy'
      ? f.copy
      : file === 'global'
        ? f.global
        : path.join(f.root, '.pi', 'subagents.json');
  fs.appendFileSync(target, file === 'overlay' ? '{}' : 'Changed\n');
  const before = fs.readFileSync(f.copy, 'utf8');
  const result = convertToolsDefinition(snapshot, 'worker', inventory);
  expect(result.success).toBe(false);
  expect(result.error).toContain('changed');
  expect(fs.readFileSync(f.copy, 'utf8')).toBe(before);
  expect(result.changedRoles).toEqual([]);
});

test('overlay-write failure leaves the copy untouched and does not retire it', () => {
  const f = fixture();
  const retire = vi.fn();
  const before = fs.readFileSync(f.copy, 'utf8');
  const result = convertToolsDefinition(f.snapshot(), 'worker', inventory, {
    writeOverlay: () => {
      throw new Error('overlay denied');
    },
    retire,
  });
  expect(result).toMatchObject({
    success: false,
    changedRoles: [],
    error: 'overlay denied',
  });
  expect(retire).not.toHaveBeenCalled();
  expect(fs.readFileSync(f.copy, 'utf8')).toBe(before);
  expect(fs.existsSync(path.join(f.root, '.pi', 'subagents.json'))).toBe(false);
});

test('retirement failure reports written overlay truthfully, refreshes snapshot and preserves existing-overlay selection', () => {
  const f = fixture();
  const json = path.join(f.root, '.pi', 'subagents.json');
  fs.writeFileSync(
    json,
    JSON.stringify({
      keep: true,
      agents: { worker: { tools: { add: ['read'], remove: ['write'] } } },
    }),
  );
  const before = fs.readFileSync(f.copy, 'utf8');
  const result = convertToolsDefinition(f.snapshot(), 'worker', inventory, {
    retire: (file, expected) =>
      retireDefinitionText(file, expected, {
        renameSync: () => {
          expect(
            JSON.parse(fs.readFileSync(json, 'utf8')).agents.worker.tools,
          ).toEqual({ add: ['read', 'bash'], remove: ['write'] });
          throw new Error('retirement denied');
        },
      }),
  });
  expect(result).toMatchObject({
    success: false,
    changedRoles: ['worker'],
    error: expect.stringContaining(
      'Partial state: project overlay was written; project copy was not retired.',
    ),
  });
  expect(result.snapshot.roles[0]).toMatchObject({
    scope: 'project',
    overlay: { add: ['read', 'bash'], remove: ['write'] },
  });
  expect(fs.readFileSync(f.copy, 'utf8')).toBe(before);
  expect(fs.readdirSync(path.dirname(f.copy))).toEqual(['worker.md']);
  expect(JSON.parse(fs.readFileSync(json, 'utf8')).keep).toBe(true);
});

test('no global counterpart is ineligible', () => {
  const f = fixture();
  fs.rmSync(f.global);
  expect(
    prepareToolsConversion(f.snapshot(), 'worker', inventory),
  ).toMatchObject({ eligible: false });
});

test('Project c conversion confirms lost differences and future globs; cancel is a no-op, d converts and refreshes', () => {
  const f = fixture();
  const panel = createToolsPanel({
    snapshot: f.snapshot(),
    discoveredTools: inventory.map((name) => ({ name, active: true })),
    save: saveToolsConfig,
    onDone: vi.fn(),
  });
  expect(panel.render(160).join('\n')).toContain('c convert');
  panel.handleInput('c');
  const confirmation = panel.render(180).join('\n');
  const lines = confirmation.split(String.fromCharCode(10));
  const row = (needle: string) => lines.filter((l) => l.includes(needle));
  expect(confirmation).toContain('Will add to overlay');
  expect(row('+ read')).toHaveLength(1);
  expect(row('+ bash')).toHaveLength(1);
  expect(confirmation).toContain('Will remove from tools');
  expect(row('− write')).toHaveLength(1);
  expect(confirmation).toContain('Lost from project copy (kept in .bak)');
  expect(row('! description differs')).toHaveLength(1);
  expect(row('! instructions (body) differ')).toHaveLength(1);
  expect(lines.findIndex((l) => l.includes('Will add'))).toBeLessThan(
    lines.findIndex((l) => l.includes('Will remove')),
  );
  expect(confirmation).toContain('d convert (discards project copy)');
  expect(confirmation).toContain('k/esc cancel · ↑/↓ scroll');
  expect(lines.at(-2)).toContain('d convert');
  expect(confirmation).not.toContain('Copy body');
  expect(confirmation).not.toContain('Global body');
  expect(confirmation).toContain('Future tools matched by global globs');
  panel.handleInput('\x1b');
  expect(fs.existsSync(f.copy)).toBe(true);
  expect(fs.existsSync(path.join(f.root, '.pi', 'subagents.json'))).toBe(false);
  panel.handleInput('c');
  panel.handleInput('d');
  expect(fs.existsSync(f.copy)).toBe(false);
  expect(panel.getState().draft[0]?.scope).toBe('global');
});

test('confirmation omits lost aspects when only tools differ and labels empty lanes none', () => {
  const f = fixture('read', 'read');
  fs.writeFileSync(f.copy, fs.readFileSync(f.global, 'utf8'));
  const panel = createToolsPanel({
    snapshot: f.snapshot(),
    discoveredTools: inventory.map((name) => ({ name, active: true })),
    save: saveToolsConfig,
    onDone: vi.fn(),
  });
  panel.handleInput('c');
  const text = panel.render(180).join('\n');
  expect(text).toContain('No tool changes.');
  expect(text).not.toContain('Will add');
  expect(text).not.toContain('Will remove');
  expect(text).not.toContain('Lost from project copy');
  expect(text).not.toContain('Global body');
  expect(text).toContain('d convert');
  expect(text).toContain('k/esc cancel');
  expect(text).toContain('Future tools matched by global globs');
});

test('conversion key is not offered without global counterpart and guard refusal is explained', () => {
  const f = fixture();
  fs.rmSync(f.global);
  const panel = createToolsPanel({
    snapshot: f.snapshot(),
    discoveredTools: [],
    save: saveToolsConfig,
    onDone: vi.fn(),
  });
  expect(panel.render(160).join('\n')).not.toContain('c convert');
  panel.handleInput('c');
  expect(fs.existsSync(f.copy)).toBe(true);
  fs.writeFileSync(
    f.global,
    '---\nname: worker\ntools: read\ndisallowed_tools: read\n---\nBody',
  );
  const refused = createToolsPanel({
    snapshot: f.snapshot(),
    discoveredTools: inventory.map((name) => ({ name, active: true })),
    save: saveToolsConfig,
    onDone: vi.fn(),
  });
  refused.handleInput('c');
  expect(refused.render(180).join('\n')).toContain('effective selection');
});

test('confirmation stale input is checked again, and dirty drafts must be saved first', () => {
  const f = fixture();
  const makePanel = () =>
    createToolsPanel({
      snapshot: f.snapshot(),
      discoveredTools: inventory.map((name) => ({ name, active: true })),
      save: saveToolsConfig,
      onDone: vi.fn(),
    });
  const dirty = makePanel();
  dirty.handleInput('\r');
  dirty.handleInput(' ');
  dirty.handleInput('q');
  dirty.handleInput('c');
  expect(dirty.render(180).join('\n')).toContain('Save or discard unsaved');
  expect(fs.existsSync(f.copy)).toBe(true);
  const panel = makePanel();
  panel.handleInput('c');
  fs.appendFileSync(f.global, 'changed');
  panel.handleInput('d');
  expect(panel.render(180).join('\n')).toContain('changed since preflight');
  expect(fs.existsSync(f.copy)).toBe(true);
  expect(fs.existsSync(path.join(f.root, '.pi', 'subagents.json'))).toBe(false);
});

test('confirmation differences remain scrollable in a small viewport', () => {
  const f = fixture();
  fs.writeFileSync(
    f.copy,
    fs
      .readFileSync(f.copy, 'utf8')
      .replace(
        '---\nCopy body',
        'custom: changed\nmodel: provider/custom\neffort: high\n---\nCopy body',
      ),
  );
  const panel = createToolsPanel({
    snapshot: f.snapshot(),
    discoveredTools: inventory.map((name) => ({ name, active: true })),
    save: saveToolsConfig,
    onDone: vi.fn(),
    maxHeight: () => 7,
  });
  panel.handleInput('c');
  let text = panel.render(120).join('\n');
  for (let i = 0; i < 10; i++) {
    panel.handleInput('\x1b[B');
    text += panel.render(120).join('\n');
  }
  for (const aspect of [
    '+ read',
    '+ bash',
    '− write',
    '! description differs',
    '! frontmatter: custom, model, effort',
    '! instructions (body) differ',
  ])
    expect(text).toContain(aspect);
  expect(text).not.toContain('provider/custom');
  expect(text).not.toContain('Copy body');
  expect(panel.render(120).join(' ')).toContain('d convert');
  panel.handleInput('k');
  expect(fs.existsSync(f.copy)).toBe(true);
});

test.each([
  'ask_orchestrator',
  'notify_orchestrator',
] as const)('conversion preserves injected %s availability and respects its enabled flag', (control) => {
  const f = fixture('read', 'read');
  const deny = (file: string) =>
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace('---\n', `---\ndisallowed_tools: ${control}\n`),
    );
  deny(f.copy);
  expect(
    prepareToolsConversion(f.snapshot(), 'worker', inventory),
  ).toMatchObject({
    eligible: false,
    error: expect.stringContaining('global plus candidate'),
  });
  fs.writeFileSync(
    path.join(f.root, '.pi', 'subagents.json'),
    JSON.stringify({ [`enable_${control}`]: false }),
  );
  expect(
    prepareToolsConversion(f.snapshot(), 'worker', inventory).eligible,
  ).toBe(true);
  fs.rmSync(path.join(f.root, '.pi', 'subagents.json'));
  deny(f.global);
  expect(
    prepareToolsConversion(f.snapshot(), 'worker', inventory).eligible,
  ).toBe(true);
});

test('conversion refuses a newly higher-priority global winner before any mutation', () => {
  const f = fixture();
  const snapshot = f.snapshot();
  expect(prepareToolsConversion(snapshot, 'worker', inventory).eligible).toBe(
    true,
  );
  const replacement = path.join(f.root, 'global', 'subagents', 'worker.md');
  fs.mkdirSync(path.dirname(replacement), { recursive: true });
  fs.writeFileSync(
    replacement,
    '---\nname: worker\ntools: read\n---\nNew winner\n',
  );
  const before = fs.readFileSync(f.copy, 'utf8');
  const result = convertToolsDefinition(snapshot, 'worker', inventory);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/changed|stale/i);
  expect(result.changedRoles).toEqual([]);
  expect(fs.readFileSync(f.copy, 'utf8')).toBe(before);
  expect(fs.existsSync(path.join(f.root, '.pi', 'subagents.json'))).toBe(false);
});

test('confirmation refuses a changed registered inventory even when equivalence still holds', () => {
  const f = fixture('read', 'read');
  let registered = [...inventory];
  const panel = createToolsPanel({
    snapshot: f.snapshot(),
    discoveredTools: inventory.map((name) => ({ name, active: true })),
    getRegisteredToolNames: () => registered,
    save: saveToolsConfig,
    onDone: vi.fn(),
  });
  panel.handleInput('c');
  registered = [...inventory, 'new_tool'];
  panel.handleInput('d');
  expect(panel.render(180).join('\n')).toContain('changed since preflight');
  expect(fs.existsSync(f.copy)).toBe(true);
  expect(fs.existsSync(path.join(f.root, '.pi', 'subagents.json'))).toBe(false);
});

test.each([
  'project-source',
  'ask',
  'notify',
  'defaults',
])('conversion refuses changed %s dependencies even with original files untouched', (change) => {
  const f = fixture('read', 'read');
  if (change === 'defaults')
    for (const file of [f.global, f.copy])
      fs.writeFileSync(
        file,
        fs.readFileSync(file, 'utf8').replace('tools: "read"\n', ''),
      );
  const snapshot = f.snapshot();
  const plan = prepareToolsConversion(snapshot, 'worker', inventory);
  expect(plan.eligible).toBe(true);
  if (!plan.eligible) return;
  if (change === 'project-source') {
    const other = path.join(f.root, '.pi', 'subagents', 'worker.md');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.copyFileSync(f.copy, other);
  } else {
    fs.writeFileSync(
      path.join(f.root, 'global', 'subagents.json'),
      JSON.stringify(
        change === 'defaults'
          ? { default_tools: ['read'] }
          : { [`enable_${change}_orchestrator`]: false },
      ),
    );
  }
  const before = fs.readFileSync(f.copy, 'utf8');
  const result = convertToolsDefinition(snapshot, 'worker', inventory, {
    plan,
  });
  expect(result).toMatchObject({ success: false, changedRoles: [] });
  expect(result.error).toMatch(/changed|same-name/i);
  expect(fs.readFileSync(f.copy, 'utf8')).toBe(before);
  expect(fs.existsSync(path.join(f.root, '.pi', 'subagents.json'))).toBe(false);
});

test('confirmation uses semantic theme tones and keeps markers readable without color', () => {
  const f = fixture();
  const tones: string[] = [];
  const theme = {
    fg: (tone: string, text: string) => {
      tones.push(`${tone}:${text}`);
      return text;
    },
  };
  const panel = createToolsPanel({
    snapshot: f.snapshot(),
    discoveredTools: inventory.map((name) => ({ name, active: true })),
    save: saveToolsConfig,
    onDone: vi.fn(),
    theme: theme as never,
  });
  panel.handleInput('c');
  panel.render(100);
  expect(tones).toContain('success:+');
  expect(tones).toContain('error:−');
  expect(tones).toContain('warning:!');
  expect(tones.some((t) => t.startsWith('dim:Future tools'))).toBe(true);
  expect(tones.some((t) => t.startsWith('warning:d convert'))).toBe(true);
});
