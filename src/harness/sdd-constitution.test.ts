import { spawnSync } from 'node:child_process';
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
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const constitutionScript = join(
  process.cwd(),
  'skills/thoth-constitution/scripts/validate.mjs',
);
const initScript = join(process.cwd(), 'skills/thoth-init/scripts/init.mjs');
const template = join(
  process.cwd(),
  'skills/thoth-constitution/templates/constitution.md',
);
function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args, '--json'], {
    windowsHide: true,
    encoding: 'utf8',
  });
}
const valid = `<!--
Sync Impact Report
- Version change: 1.1.0 -> 2.0.0
- Modified principles: Traceable delivery
- Added sections: None
- Removed sections: None
- Templates: ✅ workflow template
- Follow-up TODOs: None
-->
# Example Constitution

**Version**: 2.0.0<br>
**Ratified**: 2026-06-20<br>
**Last amended**: 2026-09-26

## Principles

### I. Traceable delivery

Every durable change MUST remain traceable through verified closeout.

## Governance

- MAJOR versions redefine or remove governance compatibility.
- MINOR versions add principles or materially expand guidance.
- PATCH versions clarify wording without changing its meaning.
`;
const roots: string[] = [];
function project() {
  const root = mkdtempSync(join(tmpdir(), 'sdd-init-'));
  roots.push(root);
  return root;
}

describe('canonical .thoth governance lifecycle', () => {
  test('constitution template defines the shared proportional SDD and stable ID record contract', () => {
    const content = readFileSync(template, 'utf8');
    for (const value of [
      '.thoth/changes/<id>/<id>.md',
      '.thoth/specs/',
      'explore',
      'specify',
      'clarify',
      'substantial',
      'fresh independent Oracle',
      'one writer',
      'process tools',
    ])
      expect(content).toContain(value);
    expect(content).not.toMatch(/Direct|Accelerated|Full|openspec|change\.md/);
    expect(
      readFileSync(
        join(process.cwd(), 'skills/thoth-constitution/SKILL.md'),
        'utf8',
      ),
    ).toContain('.thoth/constitution.md');
    expect(
      readFileSync(join(process.cwd(), 'skills/thoth-init/SKILL.md'), 'utf8'),
    ).toContain('.thoth/constitution.md');
    expect(
      run(constitutionScript, ['--constitution', template]).status,
    ).not.toBe(2);
  });

  test('initialization creates canonical .thoth structure without creating OpenSpec', () => {
    const root = project();
    const first = run(initScript, ['--project', root]);
    expect(first.status, first.stderr).toBe(0);
    expect(existsSync(join(root, '.thoth/changes/archive'))).toBe(true);
    expect(existsSync(join(root, '.thoth/specs'))).toBe(true);
    const constitution = join(root, '.thoth/constitution.md');
    expect(existsSync(constitution)).toBe(true);
    expect(existsSync(join(root, 'openspec'))).toBe(false);
    expect(existsSync(join(root, '.thoth/.thoth-agents.json'))).toBe(false);
    expect(
      run(constitutionScript, ['--constitution', constitution]).status,
    ).toBe(0);
    const custom = '# Project-owned constitution\n';
    writeFileSync(constitution, custom);
    const again = run(initScript, ['--project', root]);
    expect(again.status).toBe(0);
    expect(readFileSync(constitution, 'utf8')).toBe(custom);
    expect(JSON.parse(again.stdout).preserved).toContain(constitution);
  });

  test('preserves historical changes and fails closed on unknown collisions', () => {
    const root = project();
    mkdirSync(join(root, '.thoth/changes/history'), { recursive: true });
    writeFileSync(join(root, '.thoth/changes/history/old.md'), 'historical');
    expect(run(initScript, ['--project', root]).status).toBe(0);
    expect(
      readFileSync(join(root, '.thoth/changes/history/old.md'), 'utf8'),
    ).toBe('historical');

    const collision = project();
    mkdirSync(join(collision, '.thoth'), { recursive: true });
    writeFileSync(join(collision, '.thoth/specs'), 'untracked collision');
    const result = run(initScript, ['--project', collision]);
    expect(result.status).not.toBe(0);
    expect(readFileSync(join(collision, '.thoth/specs'), 'utf8')).toBe(
      'untracked collision',
    );
    expect(existsSync(join(collision, '.thoth/constitution.md'))).toBe(false);
  });

  test('does not overwrite existing .thoth governance or history and rejects an active legacy duplicate', () => {
    const root = project();
    mkdirSync(join(root, '.thoth/changes/history'), { recursive: true });
    writeFileSync(join(root, '.thoth/changes/history/work.md'), 'history');
    writeFileSync(join(root, '.thoth/constitution.md'), 'project custom');
    expect(run(initScript, ['--project', root]).status).toBe(0);
    expect(readFileSync(join(root, '.thoth/constitution.md'), 'utf8')).toBe(
      'project custom',
    );
    expect(
      readFileSync(join(root, '.thoth/changes/history/work.md'), 'utf8'),
    ).toBe('history');

    const legacy = project();
    mkdirSync(join(legacy, 'openspec/changes'), { recursive: true });
    writeFileSync(join(legacy, 'openspec/changes/old.md'), 'preserve');
    expect(run(initScript, ['--project', legacy]).status).not.toBe(0);
    expect(existsSync(join(legacy, '.thoth'))).toBe(false);
    expect(readFileSync(join(legacy, 'openspec/changes/old.md'), 'utf8')).toBe(
      'preserve',
    );
  });

  test('rejects symlinked governance ancestors before creating files', () => {
    const root = project();
    const outside = project();
    symlinkSync(outside, join(root, '.thoth'), 'junction');
    const result = run(initScript, ['--project', root]);
    expect(result.status).not.toBe(0);
    expect(existsSync(join(outside, 'constitution.md'))).toBe(false);
  });

  test('rejects invalid constitution version, dates, placeholders and sync report', () => {
    const root = project();
    const path = join(root, 'constitution.md');
    writeFileSync(path, valid);
    expect(run(constitutionScript, ['--constitution', path]).status).toBe(0);
    writeFileSync(
      path,
      valid
        .replaceAll('2.0.0', 'next')
        .replace('2026-06-20', 'YYYY-MM-DD')
        .replace('Traceable delivery', '[PRINCIPLE_NAME]'),
    );
    const result = run(constitutionScript, ['--constitution', path]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONSTITUTION-PLACEHOLDER' }),
        expect.objectContaining({ code: 'CONSTITUTION-VERSION' }),
        expect.objectContaining({ code: 'CONSTITUTION-DATE' }),
      ]),
    );
    writeFileSync(path, valid.replace(/<!--[\s\S]+?-->\n/, ''));
    expect(
      JSON.parse(run(constitutionScript, ['--constitution', path]).stdout)
        .errors,
    ).toContainEqual(
      expect.objectContaining({ code: 'CONSTITUTION-SYNC-IMPACT' }),
    );
  });
});

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
