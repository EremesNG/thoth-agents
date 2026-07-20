import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
- Modified principles: Traceable delivery (archive semantics redefined)
- Added sections: None
- Removed sections: None
- Templates: ✅ skills/thoth-archive/SKILL.md
- Follow-up TODOs: None
-->
# Example Constitution

**Version**: 2.0.0<br>
**Ratified**: 2026-06-20<br>
**Last amended**: 2026-07-19

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
  test('keeps the repository constitution lifecycle valid', () => {
    const result = spawnSync(
      process.execPath,
      [
        VALIDATE_SCRIPT,
        '--constitution',
        join(process.cwd(), 'openspec', 'memory', 'constitution.md'),
        '--json',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
  });

  test('accepts a complete SemVer amendment and sync-impact report', () => {
    const result = validate(VALID_CONSTITUTION);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: true,
      version: '2.0.0',
    });
  });

  test('rejects unresolved placeholders and invalid lifecycle metadata', () => {
    const result = validate(
      VALID_CONSTITUTION.replaceAll('2.0.0', 'next')
        .replace('2026-06-20', 'YYYY-MM-DD')
        .replace('Traceable delivery', '[PRINCIPLE_NAME]'),
    );

    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.errors.map((error: { code: string }) => error.code)).toEqual(
      expect.arrayContaining([
        'CONSTITUTION-PLACEHOLDER',
        'CONSTITUTION-VERSION',
        'CONSTITUTION-DATE',
      ]),
    );
  });

  test('requires a sync-impact report whose version matches the constitution', () => {
    const missing = validate(
      VALID_CONSTITUTION.replace(/<!--[\s\S]+?-->\n/, ''),
    );
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout).errors).toContainEqual(
      expect.objectContaining({ code: 'CONSTITUTION-SYNC-IMPACT' }),
    );

    const mismatched = validate(
      VALID_CONSTITUTION.replace('1.1.0 -> 2.0.0', '1.1.0 -> 1.2.0'),
    );
    expect(mismatched.status).toBe(1);
    expect(JSON.parse(mismatched.stdout).errors).toContainEqual(
      expect.objectContaining({ code: 'CONSTITUTION-SYNC-VERSION' }),
    );
  });

  test('requires explicit MAJOR, MINOR, and PATCH governance semantics', () => {
    const result = validate(
      VALID_CONSTITUTION.replace(
        /- MAJOR[\s\S]+?- PATCH[^\n]+\n/,
        '- Amendments use an appropriate version.\n',
      ),
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors).toContainEqual(
      expect.objectContaining({ code: 'CONSTITUTION-SEMVER-POLICY' }),
    );
  });
});
