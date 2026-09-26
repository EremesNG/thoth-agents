import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const VALIDATE_SCRIPT = join(
  process.cwd(),
  'skills',
  'thoth-constitution',
  'scripts',
  'validate.mjs',
);

const VALID_CONSTITUTION = `<!--
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

function validate(content: string) {
  const root = mkdtempSync(join(tmpdir(), 'thoth-constitution-'));
  const constitution = join(root, 'constitution.md');
  writeFileSync(constitution, content);
  const result = spawnSync(
    process.execPath,
    [VALIDATE_SCRIPT, '--constitution', constitution, '--json'],
    { encoding: 'utf8' },
  );
  rmSync(root, { recursive: true, force: true });
  return result;
}

describe('constitution lifecycle validator', () => {
  test('keeps repository and initialization governance aligned to the AI-first agreement', () => {
    const repository = readFileSync(
      join(process.cwd(), '.thoth', 'constitution.md'),
      'utf8',
    );
    const template = readFileSync(
      join(
        process.cwd(),
        'skills',
        'thoth-constitution',
        'templates',
        'constitution.md',
      ),
      'utf8',
    );

    expect(repository).toContain('**Version**: 9.0.0');
    expect(repository).toContain('- Version change: 8.0.0 -> 9.0.0');
    expect(repository).toContain('**Ratified**: 2026-06-16');
    expect(repository).toContain('**Last amended**: 2026-09-26');
    const normalizedRepository = repository.replace(/\s+/g, ' ').toLowerCase();
    const normalizedTemplate = template.replace(/\s+/g, ' ').toLowerCase();
    for (const policy of [
      'native runtime authority',
      'root must offer oracle review',
      'after oracle [okay]',
      'three confirmed unanswered native returns',
      'explicit answers and stop always win',
      'delegation depth is one',
      'each mutable surface has one writer',
      '`.thoth/changes/<id>/work.yaml`',
      'provider memory is independent',
      'reconcile projected state with native liveness',
      'fan out every ready, conflict-free unit',
      'must not impose a global wave barrier',
      'independent fresh oracle final judgment',
      'no implementation writer may approve its own work',
      'worktrees remain a deferred runtime concern',
    ]) {
      expect(normalizedRepository, policy).toContain(policy);
      expect(normalizedTemplate, policy).toContain(policy);
    }
    expect(repository).not.toMatch(/Direct|Accelerated|Full|route question/);
    expect(template).not.toMatch(/Direct|Accelerated|Full|route question/);
  });

  test('keeps the repository constitution lifecycle valid', () => {
    const result = spawnSync(
      process.execPath,
      [
        VALIDATE_SCRIPT,
        '--constitution',
        join(process.cwd(), '.thoth', 'constitution.md'),
        '--json',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: true,
      version: '9.0.0',
    });
  });

  test('accepts complete amendment metadata and rejects incomplete lifecycle data', () => {
    const valid = validate(VALID_CONSTITUTION);
    expect(valid.status, valid.stderr).toBe(0);

    const invalid = validate(
      VALID_CONSTITUTION.replaceAll('2.0.0', 'next')
        .replace('2026-06-20', 'YYYY-MM-DD')
        .replace('Traceable delivery', '[PRINCIPLE_NAME]'),
    );
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONSTITUTION-PLACEHOLDER' }),
        expect.objectContaining({ code: 'CONSTITUTION-VERSION' }),
        expect.objectContaining({ code: 'CONSTITUTION-DATE' }),
      ]),
    );
  });

  test('requires a matching sync report and explicit SemVer policy', () => {
    const missingReport = validate(
      VALID_CONSTITUTION.replace(/<!--[\s\S]+?-->\n/, ''),
    );
    expect(JSON.parse(missingReport.stdout).errors).toContainEqual(
      expect.objectContaining({ code: 'CONSTITUTION-SYNC-IMPACT' }),
    );

    const mismatchedVersion = validate(
      VALID_CONSTITUTION.replace('1.1.0 -> 2.0.0', '1.1.0 -> 1.2.0'),
    );
    expect(JSON.parse(mismatchedVersion.stdout).errors).toContainEqual(
      expect.objectContaining({ code: 'CONSTITUTION-SYNC-VERSION' }),
    );

    const missingSemver = validate(
      VALID_CONSTITUTION.replace(
        /- MAJOR[\s\S]+?- PATCH[^\n]+\n/,
        '- Amendments use an appropriate version.\n',
      ),
    );
    expect(JSON.parse(missingSemver.stdout).errors).toContainEqual(
      expect.objectContaining({ code: 'CONSTITUTION-SEMVER-POLICY' }),
    );
  });
});
