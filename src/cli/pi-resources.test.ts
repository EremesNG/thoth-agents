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
    expect(content).toContain('thinking: "max"');
    expect(syncPiSpecialists(options).changed).toEqual([]);
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
  test('preserves supported model and thinking state on attributable updates', () => {
    const options = fixture();
    writeFileSync(
      join(options.packageRoot, 'pi', 'agents', 'thoth-worker.md'),
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: "openai-codex/gpt-5.6-sol"\nthinking: "medium"\n---\nfresh\n',
    );
    const target = join(options.piRoot, 'agents', 'thoth-worker.md');
    mkdirSync(join(options.piRoot, 'agents'), { recursive: true });
    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: custom/model\nthinking: high\n---\nstale\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    expect(readFileSync(target, 'utf8')).toContain('model: custom/model');
    expect(readFileSync(target, 'utf8')).toContain('thinking: high');
  });

  test('transitions old managed defaults and effort without losing user intent', () => {
    const options = fixture();
    writeFileSync(
      join(options.packageRoot, 'pi', 'agents', 'thoth-worker.md'),
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: "new/default"\nthinking: "medium"\ndefaultContext: fresh\n---\nfresh\n',
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
    expect(content).toContain('thinking: high');
    expect(content).not.toMatch(/^effort:/m);
  });

  test('preserves native model inheritance and independent thinking omission', () => {
    const options = fixture();
    writeFileSync(
      join(options.packageRoot, 'pi', 'agents', 'thoth-worker.md'),
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: "new/default"\nthinking: "medium"\ndefaultContext: fresh\n---\nfresh\n',
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
    expect(content).not.toMatch(/^thinking:/m);
    expect(content).not.toContain('thoth-model-inherit');

    writeFileSync(
      target,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: custom/model\nthinking: high\nthoth-model-inherit: "true"\nthoth-thinking-inherit: "true"\ndefaultContext: fresh\n---\ntransitional\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    const transitioned = readFileSync(target, 'utf8');
    expect(transitioned).toContain('model: custom/model');
    expect(transitioned).toContain('thinking: high');
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
