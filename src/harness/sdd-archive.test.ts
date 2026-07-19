import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ARCHIVE_SCRIPT = join(
  process.cwd(),
  'skills',
  'thoth-archive',
  'scripts',
  'archive.mjs',
);

function createChange() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-archive-'));
  const changesRoot = join(root, 'openspec', 'changes');
  const change = join(changesRoot, 'example');
  const specs = join(root, 'openspec', 'specs');
  mkdirSync(change, { recursive: true });
  mkdirSync(specs, { recursive: true });
  writeFileSync(join(specs, 'baseline.md'), 'permanent specification\n');
  writeFileSync(join(change, 'spec.md'), '# Specification\n');
  writeFileSync(join(change, 'plan.md'), '# Plan\n');
  writeFileSync(
    join(change, 'tasks.md'),
    '- [x] T001 [US1] Complete the change in `src/example.ts` | Verify: focused test passes\n',
  );
  writeFileSync(
    join(change, 'verify-report.md'),
    '# Verification\n\n**Verdict**: PASS\n\nNo open findings.\n',
  );
  writeFileSync(
    join(change, 'archive-report.md'),
    '# Archive\n\nTarget: `openspec/changes/archive/YYYY-MM-DD-[feature]/`\n',
  );
  return { root, change, changesRoot };
}

function archive(change: string) {
  return spawnSync(
    process.execPath,
    [ARCHIVE_SCRIPT, '--change', change, '--date', '2026-07-19', '--json'],
    { encoding: 'utf8' },
  );
}

describe('SDD archive transition', () => {
  test('blocks incomplete tasks', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'tasks.md'),
        '- [ ] T001 [US1] Finish in `src/example.ts` | Verify: focused test passes\n',
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('All tasks must be complete');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('blocks a non-passing oracle verdict', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        '# Verification\n\n**Verdict**: FAIL\n',
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must record PASS');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('blocks an unresolved critical finding even after PASS', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        '# Verification\n\n**Verdict**: PASS\n\n- CRITICAL unresolved: unsafe migration.\n',
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unresolved CRITICAL');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('moves an eligible change without modifying permanent specifications', () => {
    const fixture = createChange();
    try {
      const result = archive(fixture.change);
      const target = join(fixture.changesRoot, 'archive', '2026-07-19-example');

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'archived',
        archivePath: target,
      });
      expect(existsSync(fixture.change)).toBe(false);
      expect(existsSync(target)).toBe(true);
      expect(readFileSync(join(target, 'archive-report.md'), 'utf8')).toContain(
        'openspec/changes/archive/2026-07-19-example/',
      );
      expect(
        readFileSync(
          join(fixture.root, 'openspec', 'specs', 'baseline.md'),
          'utf8',
        ),
      ).toBe('permanent specification\n');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
