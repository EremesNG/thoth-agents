import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { piAdapter } from '../harness/adapters/pi';
import { readPiModelConfig, savePiModelConfig } from './pi-model-config';
import { PI_SPECIALIST_NAMES, syncPiSpecialists } from './pi-resources';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-pi-resources-'));
  roots.push(root);
  const packageRoot = join(root, 'package');
  const piRoot = join(root, 'home');
  mkdirSync(join(packageRoot, 'pi', 'agents'), { recursive: true });
  for (const name of PI_SPECIALIST_NAMES)
    writeFileSync(
      join(packageRoot, 'pi', 'agents', `${name}.md`),
      `---\nname: ${name}\nmanaged-by: thoth-agents\n---\n${name}\n`,
    );
  return { packageRoot, piRoot };
}

describe('Pi specialist synchronization', () => {
  test('adds packaged defaults to old definitions without treating body examples as overrides', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    mkdirSync(join(options.piRoot, 'agents'), { recursive: true });
    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\n---\nExample:\nmodel: example/model\nthinking: high\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('model: "openai-codex/gpt-6-luna"');
    expect(content).toContain('effort: "max"');
    expect(syncPiSpecialists(options).changed).toEqual([]);
  });

  test('preserves explicit tools and mode while missing values acquire package defaults', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    const agents = join(options.piRoot, 'agents');
    mkdirSync(agents, { recursive: true });
    const worker = join(agents, 'thoth-worker.md');
    writeFileSync(
      worker,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: custom/model\neffort: max\nsubagent_mode: task\ntools: [retired_extension, read]\n---\nCustom instructions.\n',
    );
    const explorer = join(agents, 'thoth-explorer.md');
    writeFileSync(
      explorer,
      '---\nname: thoth-explorer\nmanaged-by: thoth-agents\n---\nOld instructions.\n',
    );

    const synchronized = syncPiSpecialists(options);
    expect(synchronized.error).toBeUndefined();
    expect(readFileSync(worker, 'utf8')).toContain(
      'tools: "retired_extension, read"',
    );
    expect(readFileSync(worker, 'utf8')).toContain('subagent_mode: "task"');
    expect(readFileSync(worker, 'utf8')).toContain('model: custom/model');
    expect(readFileSync(worker, 'utf8')).toContain('effort: max');
    expect(readFileSync(explorer, 'utf8')).toContain('tools: "read, bash"');
    expect(readFileSync(explorer, 'utf8')).toContain(
      'subagent_mode: "background"',
    );
    expect(syncPiSpecialists(options).changed).toEqual([]);
  });

  test('leaves malformed and wildcard tool overrides unchanged with diagnostics', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    const badMode = join(options.piRoot, 'agents', 'thoth-explorer.md');
    mkdirSync(dirname(target), { recursive: true });
    const legacy =
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: custom/model\ntools: "*"\nsubagent_mode: task\n---\nKeep this exact file.\n';
    const malformed =
      '---\nname: thoth-explorer\nmanaged-by: thoth-agents\nsubagent_mode: unsupported\n---\nKeep this file too.\n';
    writeFileSync(target, legacy);
    writeFileSync(badMode, malformed);

    const result = syncPiSpecialists(options);
    expect(result.error).toBeUndefined();
    expect(result.diagnostics.join(' ')).toMatch(
      /worker.*wildcard|wildcard.*worker/i,
    );
    expect(result.diagnostics.join(' ')).toMatch(
      /explorer.*subagent_mode|subagent_mode.*explorer/i,
    );
    expect(readFileSync(target, 'utf8')).toBe(legacy);
    expect(readFileSync(badMode, 'utf8')).toBe(malformed);
  });

  test('preserves malformed semantic tool and mode fields byte-for-byte with diagnostics', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    const cases = [
      {
        role: 'worker',
        fields: 'defaults: &defaults [read]\ntools: *defaults',
        diagnostic: /worker.*anchors|worker.*aliases/i,
      },
      {
        role: 'explorer',
        fields: 'tools: read\n"tools" : [bash]',
        diagnostic: /explorer.*duplicate.*tools/i,
      },
      {
        role: 'librarian',
        fields: 'tools: read\n  - bash',
        diagnostic: /librarian.*tools.*continuation/i,
      },
      {
        role: 'oracle',
        fields: 'subagent_mode: task\n"subagent_mode" : background',
        diagnostic: /oracle.*duplicate.*subagent_mode/i,
      },
      {
        role: 'designer',
        fields: 'tools:\n  - read\n    - bash',
        diagnostic: /designer.*tools.*continuation/i,
      },
    ] as const;
    const agents = join(options.piRoot, 'agents');
    mkdirSync(agents, { recursive: true });
    const originals = new Map<string, string>();
    for (const { role, fields } of cases) {
      const name = `thoth-${role}`;
      const target = join(agents, `${name}.md`);
      const content = `---\nname: ${name}\nmanaged-by: thoth-agents\n${fields}\n---\nKeep this exact file.\n`;
      originals.set(target, content);
      writeFileSync(target, content);
    }

    const result = syncPiSpecialists(options);

    expect(result.success).toBe(true);
    expect(result.changed).toEqual([]);
    for (const { diagnostic } of cases)
      expect(result.diagnostics.join('\n')).toMatch(diagnostic);
    for (const [target, content] of originals)
      expect(readFileSync(target, 'utf8')).toBe(content);
  });

  test('sync interprets escaped semantic keys and refuses ambiguous duplicates', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    const cases = [
      {
        role: 'worker',
        fields: '"\\u0074ools": [read]',
        accepted: 'tools: "read"',
      },
      {
        role: 'explorer',
        fields: 'tools: read\n"\\u0074ools" : [bash]',
        diagnostic: /explorer.*duplicate.*tools/i,
      },
      {
        role: 'librarian',
        fields: '"subagent_\\u006dode": background',
        accepted: 'subagent_mode: "background"',
      },
      {
        role: 'oracle',
        fields: 'subagent_mode: task\n? subagent_mode\n: background',
        diagnostic: /oracle.*duplicate.*subagent_mode/i,
      },
      {
        role: 'designer',
        fields: 'tools: read\n# comment\n  - bash',
        diagnostic: /designer.*Invalid Pi specialist YAML frontmatter/i,
      },
    ] as const;
    const agents = join(options.piRoot, 'agents');
    mkdirSync(agents, { recursive: true });
    const originals = new Map<string, string>();
    for (const { role, fields } of cases) {
      const target = join(agents, `thoth-${role}.md`);
      const content = `---\nname: thoth-${role}\nmanaged-by: thoth-agents\n${fields}\n---\nKeep this exact file.\n`;
      originals.set(target, content);
      writeFileSync(target, content);
    }

    const result = syncPiSpecialists(options);

    expect(result.success).toBe(true);
    expect(result.changed).toHaveLength(2);
    for (const item of cases)
      if ('diagnostic' in item)
        expect(result.diagnostics.join('\n')).toMatch(item.diagnostic);
    for (const [target, content] of originals) {
      const current = readFileSync(target, 'utf8');
      const role = target.match(/thoth-(\w+)\.md$/)?.[1];
      const accepted = cases.find(
        (item) => 'accepted' in item && item.role === role,
      );
      if (accepted && 'accepted' in accepted)
        expect(current).toContain(accepted.accepted);
      else expect(current).toBe(content);
    }
  });

  test('sync refuses unsupported YAML tags without rewriting the file', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    mkdirSync(dirname(target), { recursive: true });
    const original =
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\ntools: !!seq [read]\n---\nKeep this exact file.\n';
    writeFileSync(target, original);

    const result = syncPiSpecialists(options);

    expect(result.success).toBe(true);
    expect(result.diagnostics.join('\n')).toMatch(/worker.*YAML tags/i);
    expect(readFileSync(target, 'utf8')).toBe(original);
  });

  test('sync retains every multiline tool item across column-zero comments', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\ntools:\n  - read\n# comment between items\n  - bash\n---\nKeep this exact file.\n',
    );

    const result = syncPiSpecialists(options);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('tools: "read, bash"');
    expect(content).not.toContain('  - bash');
    expect(result.diagnostics).toEqual([]);
  });

  test('materializes exactly five package-owned specialists idempotently', () => {
    const options = fixture();
    expect(syncPiSpecialists(options)).toMatchObject({
      success: true,
      changed: expect.any(Array),
    });
    expect(syncPiSpecialists(options)).toMatchObject({
      success: true,
      changed: [],
    });
  });
  test('preserves supported model and effort state on attributable updates', () => {
    const options = fixture();
    writeFileSync(
      join(options.packageRoot, 'pi', 'agents', 'thoth-worker.md'),
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: "openai-codex/gpt-5.6-sol"\neffort: "medium"\n---\nfresh\n',
    );
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    mkdirSync(join(options.piRoot, 'agents'), { recursive: true });
    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: custom/model\neffort: high\n---\nstale\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    expect(readFileSync(target, 'utf8')).toContain('model: custom/model');
    expect(readFileSync(target, 'utf8')).toContain('effort: high');
  });

  test('preserves max and inheritance across edit, sync, and model reread', () => {
    const options = fixture();
    for (const artifact of piAdapter.render({ projectRoot: process.cwd() })
      .artifacts) {
      writeFileSync(
        join(options.packageRoot, 'pi', artifact.path),
        String(artifact.content),
      );
    }
    expect(syncPiSpecialists(options).success).toBe(true);

    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    const snapshot = readPiModelConfig(options.piRoot);
    const edited = savePiModelConfig(snapshot, [
      {
        role: 'worker',
        model: 'provider/chosen',
        availableEfforts: ['max'],
        effort: { kind: 'effort', value: 'max' },
      },
    ]);
    expect(edited.success).toBe(true);

    const editedContent = readFileSync(target, 'utf8');
    writeFileSync(
      target,
      editedContent.replace(
        'effort: "max"',
        'thinking: "max"\ndefaultContext: fresh',
      ),
    );
    const packageWorker = join(
      options.packageRoot,
      'pi',
      'agents',
      'thoth-worker.md',
    );
    writeFileSync(
      packageWorker,
      readFileSync(packageWorker, 'utf8')
        .replace('model: "openai-codex/gpt-6-luna"', 'model: "provider/next"')
        .replace('effort: "max"', 'effort: "medium"'),
    );

    expect(syncPiSpecialists(options).success).toBe(true);
    let migrated = readFileSync(target, 'utf8');
    expect(migrated).toContain('model: "provider/chosen"');
    expect(migrated).toContain('effort: "max"');
    expect(migrated).not.toMatch(/^(?:thinking|defaultContext):/m);
    expect(
      readPiModelConfig(options.piRoot).roles.find(
        ({ role }) => role === 'worker',
      ),
    ).toMatchObject({
      model: 'provider/chosen',
      effort: { kind: 'effort', value: 'max' },
    });
    expect(syncPiSpecialists(options).changed).toEqual([]);

    const inherited = savePiModelConfig(readPiModelConfig(options.piRoot), [
      { role: 'worker', model: 'inherit', effort: { kind: 'inherit' } },
    ]);
    expect(inherited.success).toBe(true);
    writeFileSync(
      packageWorker,
      readFileSync(packageWorker, 'utf8')
        .replace('model: "provider/next"', 'model: "provider/latest"')
        .replace('effort: "medium"', 'effort: "high"'),
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    migrated = readFileSync(target, 'utf8');
    expect(migrated).toContain('model: "inherit"');
    expect(migrated).not.toMatch(/^(?:thinking|effort):/m);
    expect(
      readPiModelConfig(options.piRoot).roles.find(
        ({ role }) => role === 'worker',
      ),
    ).toMatchObject({
      model: 'inherit',
      effort: { kind: 'inherit' },
    });
    expect(syncPiSpecialists(options).changed).toEqual([]);
  });

  test('transitions old managed defaults and effort without losing user intent', () => {
    const options = fixture();
    writeFileSync(
      join(options.packageRoot, 'pi', 'agents', 'thoth-worker.md'),
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: "new/default"\neffort: "medium"\nsubagent_mode: "task"\n---\nfresh\n',
    );
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    mkdirSync(dirname(target), { recursive: true });

    writeFileSync(
      target,
      "---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: 'default'\neffort: 'default'\n---\nold\n",
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    let content = readFileSync(target, 'utf8');
    expect(content).toContain('model: "inherit"');
    expect(content).not.toMatch(/^(?:thinking|effort):/m);

    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: custom/model\neffort: high\n---\nold\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    content = readFileSync(target, 'utf8');
    expect(content).toContain('model: custom/model');
    expect(content).toContain('effort: high');
    expect(content).not.toMatch(/^thinking:/m);
  });

  test('preserves model inheritance and independent effort omission', () => {
    const options = fixture();
    writeFileSync(
      join(options.packageRoot, 'pi', 'agents', 'thoth-worker.md'),
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: "new/default"\neffort: "medium"\nsubagent_mode: "task"\n---\nfresh\n',
    );
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: "inherit"\ndefaultContext: fresh\n---\ncurrent\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('model: "inherit"');
    expect(content).not.toMatch(/^(?:thinking|effort):/m);
    expect(content).not.toContain('thoth-model-inherit');

    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: custom/model\nthinking: high\nthoth-model-inherit: "true"\nthoth-thinking-inherit: "true"\ndefaultContext: fresh\n---\ntransitional\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    const transitioned = readFileSync(target, 'utf8');
    expect(transitioned).toContain('model: custom/model');
    expect(transitioned).toContain('effort: high');
    expect(transitioned).not.toContain('thinking:');
    expect(transitioned).not.toContain('thoth-model-inherit');
    expect(transitioned).not.toContain('thoth-thinking-inherit');
  });
  test('retires attributable obsolete roles and is idempotent', () => {
    const options = fixture();
    const agents = join(options.piRoot, 'agents');
    mkdirSync(agents, { recursive: true });
    const quick = join(agents, 'thoth-quick.md');
    const deep = join(agents, 'thoth-deep.md');
    writeFileSync(
      quick,
      '---\nname: thoth-quick\nmanaged-by: thoth-agents\n---\nold\n',
    );
    writeFileSync(
      deep,
      '---\nname: thoth-deep\nmanaged-by: thoth-agents\n---\nold\n',
    );

    expect(syncPiSpecialists(options)).toMatchObject({
      success: true,
      changed: expect.arrayContaining([quick, deep]),
    });
    expect(existsSync(quick)).toBe(false);
    expect(existsSync(deep)).toBe(false);
    expect(syncPiSpecialists(options)).toMatchObject({
      success: true,
      changed: [],
    });
  });

  test('preserves an obsolete role replaced after preflight and reports completed writes', () => {
    const options = fixture();
    const agents = join(options.piRoot, 'agents');
    mkdirSync(agents, { recursive: true });
    const obsolete = join(agents, 'thoth-deep.md');
    writeFileSync(
      obsolete,
      '---\nname: thoth-deep\nmanaged-by: thoth-agents\n---\nold\n',
    );

    const result = syncPiSpecialists({
      ...options,
      beforeRetireForTest: () =>
        writeFileSync(
          obsolete,
          '---\nname: thoth-deep\n---\nuser replacement\n',
        ),
    });

    expect(result).toMatchObject({
      success: false,
      changed: expect.arrayContaining([join(agents, 'thoth-worker.md')]),
      error: expect.stringContaining('changed before retirement'),
    });
    expect(readFileSync(obsolete, 'utf8')).toContain('user replacement');
  });

  test('rejects a symlinked Pi agents directory', () => {
    const options = fixture();
    const realAgents = join(options.piRoot, 'real-agents');
    mkdirSync(options.piRoot, { recursive: true });
    mkdirSync(realAgents, { recursive: true });
    symlinkSync(realAgents, join(options.piRoot, 'agents'), 'junction');

    expect(syncPiSpecialists(options)).toMatchObject({
      success: false,
      changed: [],
      error: expect.stringContaining('symlinked parent'),
    });
  });

  test('fails closed without deleting an unowned obsolete role', () => {
    const options = fixture();
    const target = join(options.piRoot, 'agents', 'thoth-deep.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '---\nname: thoth-deep\n---\nuser definition\n');

    expect(syncPiSpecialists(options)).toMatchObject({
      success: false,
      conflicts: [target],
      error: expect.stringContaining('remove or rename'),
    });
    expect(readFileSync(target, 'utf8')).toContain('user definition');
    expect(existsSync(join(options.piRoot, 'agents', 'thoth-worker.md'))).toBe(
      false,
    );
  });

  test('never overwrites an unowned canonical target', () => {
    const options = fixture();
    const target = join(options.piRoot, 'agents', 'thoth-oracle.md');
    mkdirSync(join(options.piRoot, 'agents'), { recursive: true });
    writeFileSync(target, 'user');
    expect(syncPiSpecialists(options)).toMatchObject({
      success: false,
      conflicts: [target],
    });
    expect(readFileSync(target, 'utf8')).toBe('user');
  });

  test('coexists with an unowned generic specialist definition', () => {
    const options = fixture();
    const generic = join(options.piRoot, 'agents', 'explorer.md');
    mkdirSync(join(options.piRoot, 'agents'), { recursive: true });
    writeFileSync(generic, '---\nname: explorer\n---\nuser definition\n');

    expect(syncPiSpecialists(options)).toMatchObject({
      success: true,
      conflicts: [],
    });
    expect(readFileSync(generic, 'utf8')).toContain('user definition');
    expect(
      readFileSync(join(options.piRoot, 'agents', 'thoth-explorer.md'), 'utf8'),
    ).toContain('name: thoth-explorer');
  });
});
