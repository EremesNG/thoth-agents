import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSubagents, subagentSourceWarnings } from '../src/config.js';

let cwd: string;
let previousAgentDir: string | undefined;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-denials-'));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = path.join(cwd, 'global-agent');
  fs.mkdirSync(path.join(cwd, '.pi', 'subagents'), { recursive: true });
  fs.mkdirSync(path.join(cwd, 'global-agent', 'subagents'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(cwd, 'global-agent', 'subagents', 'worker.md'),
    '---\nname: worker\ntools: read\n---\nGlobal fallback',
  );
});

afterEach(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('runtime filename identity', () => {
  it('rejects a valid name mismatch and blocks only the filename identity', () => {
    fs.writeFileSync(
      path.join(cwd, 'global-agent', 'subagents', 'custom.md'),
      '---\nname: custom\ntools: read\n---\nGlobal custom fallback',
    );
    const file = path.join(cwd, '.pi', 'subagents', 'custom.md');
    fs.writeFileSync(
      file,
      '---\nname: worker\ntools: read\ndisallowed_tools: ask_orchestrator\n---\nProject custom',
    );

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        name: 'worker',
        scope: 'global',
        instructions: 'Global fallback',
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('rename the file to worker.md or change name'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain('Subagent "custom"');
  });

  it.each([
    ['custom', '---custom: value', ['worker']],
    ['custom', 'tools: *', ['worker']],
    ['worker', '---custom: value', ['custom']],
    ['worker', 'tools: *', ['custom']],
  ])('blocks only %s for invalid YAML containing a worker name: %s', (filename, invalid, expectedNames) => {
    fs.writeFileSync(
      path.join(cwd, 'global-agent', 'subagents', 'custom.md'),
      '---\nname: custom\ntools: read\n---\nGlobal custom fallback',
    );
    const file = path.join(cwd, '.pi', 'subagents', `${filename}.md`);
    fs.writeFileSync(
      file,
      `---\nname: worker\n${invalid}\ndisallowed_tools: ask_orchestrator\n---\nProject override`,
    );

    const definitions = loadSubagents(cwd);
    expect(definitions.map((definition) => definition.name)).toEqual(
      expectedNames,
    );
    expect(
      definitions.every((definition) => definition.scope === 'global'),
    ).toBe(true);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('YAML frontmatter must parse'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain(`Subagent "${filename}"`);
  });

  it.each([
    'WoRkEr',
    '  WORKER  ',
  ])('accepts a matching name case-insensitively: %s', (name) => {
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'Worker.md'),
      `---\nname: ${JSON.stringify(name)}\ntools: read\ndisallowed_tools: ask_orchestrator\n---\nProject worker`,
    );

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        name: 'worker',
        scope: 'project',
        disallowed_tools: ['ask_orchestrator'],
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });

  it.each([
    '---\ntools: read\n---\nProject worker',
    'Project worker',
  ])('uses the filename when name is absent: %s', (content) => {
    fs.writeFileSync(path.join(cwd, '.pi', 'subagents', 'Worker.md'), content);

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        name: 'worker',
        scope: 'project',
        instructions: 'Project worker',
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });

  it.each([
    'custom',
    '',
    '   ',
  ])('blocks worker fallback for a present mismatching name: %s', (name) => {
    const file = path.join(cwd, '.pi', 'subagents', 'Worker.md');
    fs.writeFileSync(
      file,
      `---\nname: ${JSON.stringify(name)}\ntools: read\ndisallowed_tools: ask_orchestrator\n---\nProject worker`,
    );

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('name must match the filename identity "worker"'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it('blocks fallback by filename when the definition cannot be read', () => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.mkdirSync(file);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('could not read definition'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain('Subagent "worker"');
  });
});

describe('runtime frontmatter delimiters', () => {
  it.each([
    ['trailing space', '--- ', '\n'],
    ['trailing tab', '---\t', '\n'],
    ['trailing comment', '--- # comment', '\n'],
    ['BOM and trailing space', '\uFEFF--- ', '\n'],
    ['CRLF trailing space', '--- ', '\r\n'],
    ['CRLF trailing tab', '---\t', '\r\n'],
    ['CRLF trailing comment', '--- # comment', '\r\n'],
    ['BOM and CRLF trailing space', '\uFEFF--- ', '\r\n'],
    ['CR trailing comment', '--- # comment', '\r'],
    [
      'SDK-visible denial in an adjacent opening comment',
      '---#disallowed_tools: ask_orchestrator',
      '\n',
    ],
  ])('honors denials with %s', (_label, opening, newline) => {
    const fields = ['name: worker', 'tools: read'];
    if (!opening.includes('disallowed_tools'))
      fields.push('disallowed_tools: ask_orchestrator');
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'worker.md'),
      [opening, ...fields, '---', 'Project worker'].join(newline),
    );

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        name: 'worker',
        scope: 'project',
        tools: ['read'],
        disallowed_tools: ['ask_orchestrator'],
        instructions: 'Project worker',
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });

  it.each([
    ['trailing space', '--- ', '\n'],
    ['trailing tab', '---\t', '\n'],
    ['trailing comment', '--- # closing comment', '\n'],
    ['adjacent comment', '---# closing comment', '\n'],
    ['CRLF trailing comment', '--- \t# closing comment', '\r\n'],
  ])('accepts a closing delimiter with %s', (_label, closing, newline) => {
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'worker.md'),
      [
        '--- # opening comment',
        'name: worker',
        'tools: read',
        'disallowed_tools: ask_orchestrator',
        closing,
        'Project worker',
      ].join(newline),
    );

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        scope: 'project',
        tools: ['read'],
        disallowed_tools: ['ask_orchestrator'],
        instructions: 'Project worker',
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });

  it('accepts a commented closing delimiter at EOF', () => {
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'worker.md'),
      '--- \nname: worker\ndisallowed_tools: ask_orchestrator\n--- # closing comment',
    );

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        scope: 'project',
        disallowed_tools: ['ask_orchestrator'],
        instructions: '',
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });

  it.each([
    '---x',
    '---custom',
    '--- name: worker',
    '--- \tcustom',
    '\uFEFF---x\r',
  ])('diagnoses an invalid opening and blocks its filename fallback: %s', (opening) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(
      file,
      `${opening}\nname: worker\ndisallowed_tools: ask_orchestrator\n---\nProject worker`,
    );

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('invalid YAML frontmatter opening'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain('Subagent "worker"');
  });

  it.each([
    [
      'SDK-visible filename identity in an opening comment',
      '---#name: custom\ntools: read\ndisallowed_tools: ask_orchestrator\n---',
      'name must match the filename identity "worker"',
    ],
    [
      'SDK-visible merge in an opening comment',
      '---#<<: {disallowed_tools: ask_orchestrator}\nname: worker\n---',
      'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
    ],
    [
      'SDK-visible alias-key duplicate in an opening comment',
      '---#&key disallowed_tools: ask_orchestrator\n*key : []\nname: worker\n---',
      'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
    ],
    [
      'duplicate denials after a commented opening',
      '--- # comment\nname: worker\ndisallowed_tools: ask_orchestrator\ndisallowed_tools: []\n---',
      'YAML frontmatter must parse',
    ],
    [
      'SDK-invalid adjacent opening comment',
      '---# comment\nname: worker\ndisallowed_tools: ask_orchestrator\n---',
      'YAML frontmatter must parse',
    ],
    [
      'SDK-truncated interior delimiter prefix',
      '--- # comment\nname: worker\n---custom: value\ndisallowed_tools: ask_orchestrator\n---',
      'YAML frontmatter must parse',
    ],
  ])('preserves strict YAML and filename validation for %s', (_label, content, diagnostic) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `${content}\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining(diagnostic),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain('Subagent "worker"');
  });

  it.each([
    '---',
    '--- ',
    '---\t',
    '--- # comment',
    '\uFEFF--- ',
    '--- \r\nname: worker\r\ndisallowed_tools: ask_orchestrator',
    '--- # comment\nname: worker\ndisallowed_tools: ask_orchestrator',
    '--- \nname: worker\ndisallowed_tools: ask_orchestrator\n---x',
  ])('diagnoses an unterminated opening and blocks its filename fallback: %s', (content) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, content);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('unterminated YAML frontmatter'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it.each([
    'Project worker',
    '# Project worker\n---\ndisallowed_tools: ask_orchestrator',
    ' ---\nProject worker',
  ])('keeps the no-frontmatter behavior when the first line does not start with ---: %s', (content) => {
    fs.writeFileSync(path.join(cwd, '.pi', 'subagents', 'worker.md'), content);

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        name: 'worker',
        scope: 'project',
        disallowed_tools: [],
        instructions: content.trim(),
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });
});

describe('runtime restricted YAML frontmatter', () => {
  it.each([
    ['inline merge (B4)', '<<: {disallowed_tools: ask_orchestrator}'],
    [
      'alias merge (B4)',
      'permissions: &permissions {disallowed_tools: ask_orchestrator}\n<<: *permissions',
    ],
    [
      'sequence merge (B4)',
      '<<: [{disallowed_tools: ask_orchestrator}, {description: worker}]',
    ],
    [
      'sequence alias merge (B4)',
      'first: &first {disallowed_tools: ask_orchestrator}\nsecond: &second {description: worker}\n<<: [*first, *second]',
    ],
    [
      'block alias-key duplicate clearing denial (B5)',
      '&key disallowed_tools: ask_orchestrator\n*key : []',
    ],
    [
      'block alias-key duplicate adding denial (B5)',
      '&key disallowed_tools: []\n*key : ask_orchestrator',
    ],
    [
      'flow alias-key duplicate clearing denial (B5)',
      '{ name: worker, tools: read, &key disallowed_tools: ask_orchestrator, *key : [] }',
    ],
    [
      'flow alias-key duplicate adding denial (B5)',
      '{ name: worker, tools: read, &key disallowed_tools: [], *key : ask_orchestrator }',
    ],
    ['anchor on key', '&key disallowed_tools: ask_orchestrator'],
    ['anchor on value', 'disallowed_tools: &deny ask_orchestrator'],
    ['anchor on empty value', '"disallowed_tools" : &empty # no names'],
    ['anchor on sequence', 'options: &options [read]'],
    ['anchor on mapping', 'options: &options {safe: true}'],
    ['alias as value', 'deny: &deny ask_orchestrator\ndisallowed_tools: *deny'],
    ['unresolved alias as value', 'options: *missing'],
    ['custom scalar tag', 'disallowed_tools: !foo ask_orchestrator'],
    ['custom collection tag', 'options: !foo {safe: true}'],
    ['custom tag inside sequence', 'options: [!foo safe]'],
    ['custom tag on key', '!foo disallowed_tools: ask_orchestrator'],
    ['explicit string tag', 'description: !!str 2026-10-04'],
    ['explicit sequence tag', 'options: !!seq [read]'],
    ['explicit mapping tag', 'options: !!map {safe: true}'],
    ['explicit tag on key', '!!str disallowed_tools: ask_orchestrator'],
    ['non-specific tag', 'description: ! worker'],
    ['verbatim custom tag', 'options: !<tag:example.com,2026:foo> safe'],
    ['nested merge key', 'options: {safe: [{<<: {deny: ask_orchestrator}}]}'],
    ['escaped merge key', 'options: {"\\x3c\\x3c": {deny: ask_orchestrator}}'],
  ])('rejects %s and blocks the filename fallback', (_label, fields) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    const raw = fields.startsWith('{')
      ? fields
      : `name: worker\ntools: read\n${fields}`;
    fs.writeFileSync(file, `---\n${raw}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining(
        'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
      ),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain('Subagent "worker"');
  });

  it.each([
    '&document {name: worker, disallowed_tools: ask_orchestrator}',
    '!!map { name: worker, disallowed_tools: ask_orchestrator }',
    '!foo {name: worker, disallowed_tools: ask_orchestrator}',
  ])('rejects unsupported syntax on the document root: %s', (raw) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\n${raw}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining(
        'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
      ),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it.each([
    '&anchor *alias << !foo !!str',
    'worker: & * << !',
  ])('loads quoted YAML-like text without treating it as syntax: %s', (text) => {
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'worker.md'),
      `---\nname: worker\ndescription: ${JSON.stringify(text)}\ntools: ["*"]\nnotes: {'&': '*', '<< text': '!foo'}\n# &anchor *alias << !foo\ndisallowed_tools: [ask_orchestrator, bash]\nmodel: {provider: openai, id: fixture}\neffort: max\nsubagent_mode: task\n---\nProject worker`,
    );

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        name: 'worker',
        scope: 'project',
        description: text,
        tools: ['*'],
        disallowed_tools: ['ask_orchestrator', 'bash'],
        model: { provider: 'openai', id: 'fixture' },
        effort: 'max',
        subagent_mode: 'task',
        instructions: 'Project worker',
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });
});

describe('runtime strict YAML frontmatter validation', () => {
  it.each([
    [
      'block ordered map',
      '!!omap\n- name: worker\n- tools: read\n- disallowed_tools: ask_orchestrator',
    ],
    [
      'flow ordered map',
      '!!omap [{name: worker}, {tools: read}, {disallowed_tools: ask_orchestrator}]',
    ],
    ['set', '!!set {name, tools, disallowed_tools}'],
    ['timestamp', '!!timestamp 2026-10-04'],
  ])('rejects a tagged non-record document and blocks its filename fallback: %s', (_label, raw) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\n${raw}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining(
        'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
      ),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain('Subagent "worker"');
  });

  it.each([
    ['name', 'name: 42'],
    ['name', 'name: []'],
    ['name', 'name: !!timestamp 2026-10-04'],
    ['name', 'name: !!omap [{value: worker}]'],
    ['description', 'description: false'],
    ['description', 'description: null'],
    ['description', 'description: !!timestamp 2026-10-04T00:00:00Z'],
    ['description', 'description: !!set {worker}'],
    ['tools', 'tools: false'],
    ['tools', 'tools: null'],
    ['tools', 'tools: {}'],
    ['tools', 'tools: [read, 42]'],
    ['tools', 'tools: [read, [bash]]'],
    ['tools', 'tools: !!set {read, ask_orchestrator}'],
    ['tools', 'tools: !!omap [{read: read}]'],
    ['tools', 'tools: [!!timestamp 2026-10-04]'],
    ['disallowed_tools', 'disallowed_tools: !!set {a, b}'],
    ['disallowed_tools', 'disallowed_tools: !!omap [{deny: ask_orchestrator}]'],
    ['disallowed_tools', 'disallowed_tools: [!!timestamp 2026-10-04]'],
    ['model', 'model: 42'],
    ['model', 'model: []'],
    ['model', 'model: !!omap [{provider: openai}, {id: fixture}]'],
    ['model', 'model: !!set {provider, id}'],
    ['model', 'model: { provider: false, id: fixture }'],
    ['effort', 'effort: true'],
    ['thinking_level', 'thinking_level: []'],
    ['thinkingLevel', 'thinkingLevel: null'],
    ['subagent_mode', 'subagent_mode: {}'],
  ])('blocks fallback for invalid YAML types or explicit tags in %s: %s', (field, raw) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\n${raw}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining(
        raw.includes('!!')
          ? 'agent frontmatter does not support YAML anchors, aliases, merge keys or tags'
          : `${field} must be`,
      ),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it('blocks fallback for duplicate denial keys in a flow mapping', () => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(
      file,
      '---\n{ name: worker, disallowed_tools: ask_orchestrator, disallowed_tools: false }\n---\nProject worker',
    );

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('invalid frontmatter'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it.each([
    ['malformed flow mapping', '{ name: worker, tools: [read }'],
    ['unterminated flow sequence', '[worker'],
    ['explicit key', 'name: worker\n? tools\n: *'],
    ['escaped quoted key', 'name: worker\n"to\\u006fls": *'],
    ['single-quoted escaped key', "name: worker\n'custom\\key': *"],
    [
      'nested escaped quoted key',
      'name: worker\noptions: { "to\\u006fls": * }',
    ],
    ['tagged escaped quoted key', 'name: worker\n!!str "to\\u006fls": *'],
    [
      'escaped key after plain-scalar apostrophes',
      'name: worker\ndescription: don\'t bypass checks\n"\\u0064isallowed\\u005ftools": ask_orchestrator\nnotes: didn\'t parse\ntools: *',
    ],
  ])('blocks fallback for invalid YAML using %s without a literal denial hint', (_label, raw) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\n${raw}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('invalid frontmatter'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it('blocks fallback for a valid non-mapping YAML document without a denial hint', () => {
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'worker.md'),
      '---\n[worker]\n---\nProject worker',
    );

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('Expected a YAML mapping'),
    ]);
  });

  it.each([
    ['unquoted wildcard', 'tools: *', 'quote it: tools: "*"'],
    [
      'colon-containing description',
      'tools: read\ndescription: worker: x',
      'quote the value',
    ],
  ])('rejects YAML-invalid legacy %s with an actionable hint', (_label, fields, hint) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\nname: worker\n${fields}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining(hint),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it.each([
    ['quoted wildcard', 'tools: "*"', { tools: ['*'] }],
    ['quoted tools key', '"tools": "*"', { tools: ['*'] }],
    [
      'escaped tools key',
      '"to\\u006fls": read, bash',
      { tools: ['read', 'bash'] },
    ],
    ['flow tools list', "tools: ['*', read]", { tools: ['*', 'read'] }],
    [
      'quoted colon-containing description',
      'tools: read\ndescription: "worker: x"',
      { tools: ['read'], description: 'worker: x' },
    ],
    [
      'quoted date-like text',
      'tools: read\ndescription: "2026-10-04"',
      { tools: ['read'], description: '2026-10-04' },
    ],
    [
      'escaped quoted value',
      'tools: "*"\ndescription: "worker\\u003a x"',
      { tools: ['*'], description: 'worker: x' },
    ],
    [
      'key-like text inside a quoted value',
      'tools: "*"\ndescription: \'worker, "custom\\key": x\'',
      { tools: ['*'], description: 'worker, "custom\\key": x' },
    ],
    [
      'key-like text inside a comment',
      'tools: "*"\n# "custom\\key": x',
      { tools: ['*'] },
    ],
    [
      'denial after unmatched quote in a plain description (B1.4)',
      'description: hello, "intro\n"\\x64isallowed_tools": ask_orchestrator\ntools: "*"',
      {
        tools: ['*'],
        description: 'hello, "intro',
        disallowed_tools: ['ask_orchestrator'],
      },
    ],
    [
      'normalized model and effort values',
      '"tools": []\nmodel: { provider: " openai ", id: " fixture/path " }\neffort: " MAX "\nsubagent_mode: task',
      {
        tools: [],
        model: { provider: 'openai', id: 'fixture/path' },
        effort: 'max',
        subagent_mode: 'task',
      },
    ],
  ])('loads valid YAML values for %s', (_label, fields, expected) => {
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'worker.md'),
      `---\nname: WoRkEr\n${fields}\n---\nProject worker`,
    );

    expect(loadSubagents(cwd)).toEqual([
      expect.objectContaining({
        name: 'worker',
        scope: 'project',
        instructions: 'Project worker',
        disallowed_tools: [],
        ...expected,
      }),
    ]);
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });

  it.each([
    '---\n  name: worker\n  disallowed_tools : ask_orchestrator\n---\nProject worker',
    '---\n{ name: worker, disallowed_tools : ask_orchestrator }\n---\nProject worker',
    '\uFEFF---\nname: worker\ndisallowed_tools : ask_orchestrator\n---\nProject worker',
  ])('recognizes denials in whole YAML document forms: %s', (content) => {
    fs.writeFileSync(path.join(cwd, '.pi', 'subagents', 'worker.md'), content);

    expect(loadSubagents(cwd)[0]).toMatchObject({
      scope: 'project',
      disallowed_tools: ['ask_orchestrator'],
    });
    expect(subagentSourceWarnings(cwd)).toEqual([]);
  });

  it.each([
    ['empty mapping', '{} # disallowed', true],
    ['plain null scalar', 'null', false],
    ['empty document', '', false],
    ['null scalar', 'null # disallowed', false],
    ['tilde null scalar', '~ # disallowed', false],
    ['comment-only document', '# disallowed', false],
  ])('requires a YAML mapping for every definition: %s', (_label, raw, allowed) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\n${raw}\n---\nProject worker`);

    if (allowed) {
      expect(loadSubagents(cwd)).toEqual([
        expect.objectContaining({ scope: 'project', disallowed_tools: [] }),
      ]);
      expect(subagentSourceWarnings(cwd)).toEqual([]);
    } else {
      expect(loadSubagents(cwd)).toEqual([]);
      expect(subagentSourceWarnings(cwd)).toEqual([
        expect.stringContaining('invalid frontmatter'),
      ]);
      expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    }
  });

  it('blocks fallback for unterminated frontmatter without denials', () => {
    const content = '---\nname: worker\ntools: *';
    fs.writeFileSync(path.join(cwd, '.pi', 'subagents', 'worker.md'), content);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('unterminated YAML frontmatter'),
    ]);
  });

  it.each([
    '{ name: worker, tools: [read }',
    'name: worker\n? tools\n: *',
    'name: worker\n"to\\u006fls": *',
    'name: worker\n"\\u0064isallowed\\u005ftools": ask_orchestrator',
  ])('blocks fallback for unterminated frontmatter requiring strict validation: %s', (raw) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\n${raw}`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('unterminated YAML frontmatter'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it('blocks fallback for an unterminated frontmatter containing denials', () => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(
      file,
      '---\nname: worker\ndisallowed_tools : ask_orchestrator\n',
    );

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('invalid frontmatter'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it.each([
    'description: [unterminated\ndisallowed_tools: ask_orchestrator',
    'description: [unterminated\n"disallowed_tools" : false',
    'tools: *\ndisallowed_tools: ask_orchestrator',
    'tools: *\ndisallowed_tools: []',
    'tools: *\n\tdisallowed_tools\t:\task_orchestrator',
    '---ignored\ndisallowed_tools : false',
    'tools: read\ndescription: worker: x\ndisallowed_tools: ask_orchestrator',
    'tools: read\ndescription: worker: x\n"disallowed_tools"\t:\t[]',
  ])('blocks fallback when the whole YAML frontmatter is invalid: %s', (fields) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\nname: worker\n${fields}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('invalid frontmatter'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
  });

  it.each([
    [
      'unterminated flow mapping',
      '{ name: worker, disallowed_tools: ask_orchestrator',
    ],
    [
      'malformed flow mapping',
      '{ name: worker, disallowed_tools: [ask_orchestrator }',
    ],
    [
      'explicit denial key with YAML errors',
      'name: worker\ntools: *\n? disallowed_tools\n: ask_orchestrator',
    ],
    [
      'Unicode-escaped denial key with YAML errors',
      'name: worker\ntools: *\n"disallowed\\u005ftools": ask_orchestrator',
    ],
    [
      'hex-escaped denial key with YAML errors',
      'name: worker\ntools: *\n"disallowed\\x5ftools": ask_orchestrator',
    ],
    [
      'fully hidden denial key with YAML errors',
      'name: worker\ntools: *\n"\\u0064isallowed\\u005ftools": ask_orchestrator',
    ],
    [
      'duplicate block-style denial keys',
      'name: worker\ndisallowed_tools: ask_orchestrator\ndisallowed_tools: false',
    ],
    [
      'duplicate non-denial keys without a denial hint',
      'name: worker\ndescription: first\ndescription: second',
    ],
    [
      'duplicate quoted and bare tools keys',
      'name: worker\n"tools": read\ntools: bash',
    ],
    [
      'hex-escaped denial after unmatched quote in plain description (B1.4)',
      'name: worker\ndescription: hello, "intro\n"\\x64isallowed_tools": ask_orchestrator\ntools: *',
    ],
    [
      'ignored line inside a tools list',
      'name: worker\ntools:\n  - read\nlegacy ignored line\n  - bash',
    ],
    [
      'duplicate non-denial keys in strict mode',
      'name: worker\ndescription: disallowed\ndescription: worker',
    ],
    [
      'description merely mentioning disallowed with legacy-invalid YAML',
      'name: worker\ntools: *\ndescription: worker avoids DISALLOWED tools',
    ],
    [
      'comment merely mentioning disallowed with legacy-invalid YAML',
      'name: worker\ntools: *\n# "disallowed_tools" : false',
    ],
    ['non-mapping sequence', '[disallowed]'],
    ['non-mapping scalar', 'disallowed'],
  ])('blocks fallback and diagnoses strict frontmatter: %s', (_label, raw) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(file, `---\n${raw}\n---\nProject worker`);

    expect(loadSubagents(cwd)).toEqual([]);
    expect(subagentSourceWarnings(cwd)).toEqual([
      expect.stringContaining('invalid frontmatter'),
    ]);
    expect(subagentSourceWarnings(cwd)[0]).toContain(file);
    expect(subagentSourceWarnings(cwd)[0]).toContain('worker');
  });

  // Literal sync outcomes: keep this package test independent of root src imports.
  it.each<[string, string, string[] | undefined]>([
    [
      'spaced bare key',
      'disallowed_tools : ask_orchestrator',
      ['ask_orchestrator'],
    ],
    ['spaced boolean', 'disallowed_tools : false', undefined],
    ['spaced quoted boolean', '"disallowed_tools" : false', undefined],
    [
      'tab-separated key',
      'disallowed_tools\t:\task_orchestrator',
      ['ask_orchestrator'],
    ],
    ['mixed spaces and tabs', 'disallowed_tools \t : \tfalse', undefined],
    [
      'double-quoted spaced key',
      '"disallowed_tools"  : [ask_orchestrator, bash]',
      ['ask_orchestrator', 'bash'],
    ],
    [
      'single-quoted spaced key',
      "'disallowed_tools' \t: ask_orchestrator",
      ['ask_orchestrator'],
    ],
    [
      'escaped quoted key',
      '"disallowed\\u005ftools" : ask_orchestrator',
      ['ask_orchestrator'],
    ],
    [
      'explicit YAML key',
      '? disallowed_tools\n: ask_orchestrator',
      ['ask_orchestrator'],
    ],
    [
      'parsed denial key without a literal hint',
      '"\\u0064isallowed\\u005ftools": ask_orchestrator',
      ['ask_orchestrator'],
    ],
    [
      'description mentioning disallowed with valid YAML and no denial',
      'description: worker avoids DISALLOWED tools',
      [],
    ],
    ['spaced empty value', '"disallowed_tools" : # explicitly empty', []],
    ['spaced empty string', "'disallowed_tools' : ''", []],
    ['spaced empty list', 'disallowed_tools \t: []', []],
    ['spaced explicit null', '"disallowed_tools" : null', undefined],
    [
      'spaced flow mapping value',
      'disallowed_tools : { tool: ask_orchestrator }',
      undefined,
    ],
    [
      'quoted flow mapping value',
      '"disallowed_tools" : { tool: ask_orchestrator }',
      undefined,
    ],
    [
      'duplicate spellings',
      'disallowed_tools: read\n"disallowed_tools" : ask_orchestrator',
      undefined,
    ],
  ])('matches the sync outcome for %s', (_label, fields, expected) => {
    const file = path.join(cwd, '.pi', 'subagents', 'worker.md');
    fs.writeFileSync(
      file,
      `---\nname: worker\ntools: read\n${fields}\n---\nProject worker`,
    );

    const definitions = loadSubagents(cwd);
    const warnings = subagentSourceWarnings(cwd);
    if (expected === undefined) {
      expect(definitions).toEqual([]);
      expect(warnings).toEqual([
        expect.stringContaining('invalid frontmatter'),
      ]);
      expect(warnings[0]).toContain(file);
      expect(warnings[0]).toContain('worker');
    } else {
      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toMatchObject({
        scope: 'project',
        disallowed_tools: expected,
      });
      expect(warnings).toEqual([]);
    }
  });
});
