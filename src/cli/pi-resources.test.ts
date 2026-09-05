import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    const target = join(options.piRoot, 'agents', 'thoth-deep.md');
    mkdirSync(join(options.piRoot, 'agents'), { recursive: true });
    writeFileSync(
      target,
      '---\nname: thoth-deep\nmanaged-by: thoth-agents\n---\nExample:\nmodel: example/model\neffort: high\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('model: "openai-codex/gpt-5.6-sol"');
    expect(content).toContain('effort: "medium"');
    expect(syncPiSpecialists(options).changed).toEqual([]);
  });

  test('materializes exactly six package-owned specialists idempotently', () => {
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
      join(options.packageRoot, 'pi', 'agents', 'thoth-deep.md'),
      '---\nname: thoth-deep\nmanaged-by: thoth-agents\nmodel: "openai-codex/gpt-5.6-sol"\neffort: "medium"\n---\nfresh\n',
    );
    const target = join(options.piRoot, 'agents', 'thoth-deep.md');
    mkdirSync(join(options.piRoot, 'agents'), { recursive: true });
    writeFileSync(
      target,
      '---\nname: thoth-deep\nmanaged-by: thoth-agents\nmodel: custom/model\neffort: high\n---\nstale\n',
    );
    expect(syncPiSpecialists(options).success).toBe(true);
    expect(readFileSync(target, 'utf8')).toContain('model: custom/model');
    expect(readFileSync(target, 'utf8')).toContain('effort: high');
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
