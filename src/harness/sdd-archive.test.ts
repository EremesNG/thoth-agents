import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

const script = join(process.cwd(), 'skills/thoth-archive/scripts/archive.mjs');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const roots: string[] = [];
function fixture(
  deltas = '- None.',
  id = 'demo',
  specs: Record<string, string | null> = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'sdd-archive-'));
  roots.push(root);
  const change = join(root, '.thoth/changes', id);
  mkdirSync(change, { recursive: true });
  mkdirSync(join(root, '.thoth/specs'), { recursive: true });
  writeFileSync(join(root, 'source.txt'), 'reviewed\n');
  const capabilities = [
    ...new Set(
      [
        ...deltas.matchAll(
          /^- `(?:ADDED|MODIFIED|REMOVED|RENAMED) ([a-z0-9-]+)/gm,
        ),
      ].map((match) => match[1]),
    ),
  ];
  const reviewedSpecs = capabilities.map((capability) => {
    const content = specs[capability] ?? null;
    const path = `.thoth/specs/${capability}/spec.md`;
    if (content === null) return `- Source: ${path} | absent`;
    const canonical = join(root, path);
    mkdirSync(join(root, '.thoth/specs', capability), { recursive: true });
    writeFileSync(canonical, content);
    return `- Source: ${path} | sha256:${hash(content)}`;
  });
  const before = `# Change: ${id}\n\n**Classification**: substantial\n**Scope**: coordinated\n**Uncertainty**: low\n**Risk**: low\n\n## Exploration\n\n- Inspected source and constraints.\n\n## Intent\n\nDeliver behavior.\n\n## Non-goals\n\nNo unrelated edits.\n\n## Acceptance\n\n- AC-1: Tested outcome.\n\n## Clarifications\n\n- Accepted intent is settled; no material question remains.\n\n## Decisions\n\n- Scope confirmed.\n\n## Durable deltas\n\n${deltas}\n\n## Plan\n\nChange implementation and tests.\n\n## Tasks\n\n- [x] AC-1: Complete tested behavior.\n\n## Authorization\n\n**Plan review**: OKAY\n**Plan review selection**: EXPLICIT_REVIEW\n**Implementation**: AUTHORIZED\n\n`;
  const envelope = `\`\`\`thoth-result
${JSON.stringify({
  schemaVersion: 1,
  role: 'oracle',
  status: 'complete',
  conclusion: 'Verified.',
  evidence: [],
  verification: [],
  risks: [],
  openQuestions: [],
  nextAction: null,
  review: {
    kind: 'final-verification',
    verdict: 'PASS',
    reviewedRecord: `.thoth/changes/${id}/${id}.md`,
    reviewedRecordSha256: hash(before.split('## Authorization')[0]),
  },
})}
\`\`\``;
  const verify = `## Verification\n\n**Reviewer**: oracle\n**Independent from implementer**: Yes\n**Verdict**: PASS\n**Reviewed record SHA-256**: ${hash(before.split('## Authorization')[0])}\n\n- AC-1: PASS | pnpm test | observed behavior\n- Source: source.txt | sha256:${hash('reviewed\n')}\n${reviewedSpecs.length ? `${reviewedSpecs.join('\n')}\n` : ''}\n## Closeout\n\n**Archive**: READY\n`;
  writeFileSync(
    join(change, `${id}.md`),
    before +
      verify.replace(
        '## Closeout',
        `**Oracle envelope**:\n\n${envelope}\n\n## Closeout`,
      ),
  );
  return { root, change, id, before };
}
function archive(
  f: { root: string; change: string },
  env = {},
  archiveScript = script,
) {
  return spawnSync(
    process.execPath,
    [archiveScript, '--change', f.change, '--date', '2026-09-28', '--json'],
    { windowsHide: true, encoding: 'utf8', env: { ...process.env, ...env } },
  );
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const addition =
  '- `ADDED widget` **New behavior** — The widget MUST respond.\n  - GIVEN an active widget; WHEN invoked; THEN it responds.';

describe('transactional .thoth change archive', () => {
  test.each([
    'skills',
    'plugin/skills',
  ])('%s archive refuses an envelope after an intervening H2 without mutations', (skillsRoot) => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const misplaced = readFileSync(record, 'utf8').replace(
      '**Oracle envelope**:',
      '## Oracle result\n\n**Oracle envelope**:',
    );
    writeFileSync(record, misplaced);
    const result = archive(
      f,
      {},
      join(process.cwd(), skillsRoot, 'thoth-archive/scripts/archive.mjs'),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SDD-ORACLE-ENVELOPE-MISSING');
    expect(readFileSync(record, 'utf8')).toBe(misplaced);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test.each([
    'skills',
    'plugin/skills',
  ])('%s archive accepts an envelope after an intervening H3', (skillsRoot) => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const amended = readFileSync(record, 'utf8').replace(
      '**Oracle envelope**:',
      '### Oracle result\n\n**Oracle envelope**:',
    );
    writeFileSync(record, amended);
    const result = archive(
      f,
      {},
      join(process.cwd(), skillsRoot, 'thoth-archive/scripts/archive.mjs'),
    );
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(record)).toBe(false);
    expect(
      readFileSync(
        join(f.root, '.thoth/changes/archive/2026-09-28-demo/demo.md'),
        'utf8',
      ),
    ).toBe(amended);
    expect(
      readFileSync(join(f.root, '.thoth/specs/widget/spec.md'), 'utf8'),
    ).toContain('The widget MUST respond.');
  });

  test('refuses an envelope bound to another record without changing record or specs', () => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const mismatched = readFileSync(record, 'utf8').replace(
      '.thoth/changes/demo/demo.md',
      '.thoth/changes/other/other.md',
    );
    writeFileSync(record, mismatched);
    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SDD-ORACLE-ENVELOPE-RECORD-MISMATCH');
    expect(readFileSync(record, 'utf8')).toBe(mismatched);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test.each([
    'FAIL',
    'PASS',
  ])('refuses a preceding %s envelope beside the marked PASS without mutations', (verdict) => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const original = readFileSync(record, 'utf8');
    const envelope = original.match(/```thoth-result\n[\s\S]*?\n```/)![0];
    const duplicated = original.replace(
      '**Oracle envelope**:',
      `${envelope.replace('"verdict":"PASS"', `"verdict":"${verdict}"`)}\n\n**Oracle envelope**:`,
    );
    writeFileSync(record, duplicated);
    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
    expect(readFileSync(record, 'utf8')).toBe(duplicated);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test.each([
    'THOTH-RESULT',
    'ThOtH-ReSuLt',
  ])('refuses a second %s block without mutations', (info) => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const original = readFileSync(record, 'utf8');
    const envelope = original.match(/```thoth-result\n[\s\S]*?\n```/)![0];
    const duplicated = `${original}\n${envelope.replace('thoth-result', info)}\n`;
    writeFileSync(record, duplicated);
    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
    expect(readFileSync(record, 'utf8')).toBe(duplicated);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test('refuses a FAIL envelope hidden by an example heading without mutations', () => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const original = readFileSync(record, 'utf8');
    const envelope = original.match(/```thoth-result\n[\s\S]*?\n```/)![0];
    const duplicated = original.replace(
      '## Closeout',
      `\`\`\`\`markdown\n## Hidden heading\n${envelope.replace('"verdict":"PASS"', '"verdict":"FAIL"')}\n\`\`\`\`\n\n## Closeout`,
    );
    writeFileSync(record, duplicated);
    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
    expect(readFileSync(record, 'utf8')).toBe(duplicated);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test('refuses an envelope inside Authorization without mutations', () => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const original = readFileSync(record, 'utf8');
    const binding = original.match(
      /\*\*Oracle envelope\*\*:\n\n```thoth-result\n[\s\S]*?\n```\n\n/,
    )![0];
    const misplaced = original
      .replace(binding, '')
      .replace('## Verification', `${binding}## Verification`);
    writeFileSync(record, misplaced);
    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SDD-ORACLE-ENVELOPE-MISSING');
    expect(readFileSync(record, 'utf8')).toBe(misplaced);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test('archives after Authorization-only bookkeeping edits without a new review', () => {
    const f = fixture();
    const record = join(f.change, `${f.id}.md`);
    const amended = readFileSync(record, 'utf8').replace(
      '**Implementation**: AUTHORIZED',
      '**Implementation**: AUTHORIZED\n\n- Authorization confirmed by root.',
    );
    writeFileSync(record, amended);
    const result = archive(f);
    expect(result.status, result.stderr).toBe(0);
    expect(
      readFileSync(
        join(f.root, '.thoth/changes/archive/2026-09-28-demo/demo.md'),
        'utf8',
      ),
    ).toBe(amended);
  });

  test('rejects a pre-Authorization edit as stale without mutating the active record or specs', () => {
    const f = fixture(addition);
    const record = join(f.change, `${f.id}.md`);
    const stale = readFileSync(record, 'utf8').replace(
      'Deliver behavior.',
      'Deliver changed behavior.',
    );
    writeFileSync(record, stale);
    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SDD-VERIFICATION-STALE');
    expect(readFileSync(record, 'utf8')).toBe(stale);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test('archives the verified ID-named record and applies declared canonical delta only', () => {
    const f = fixture(addition);
    const result = archive(f);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    const archiveDir = join(f.root, '.thoth/changes/archive/2026-09-28-demo');
    expect(report).toMatchObject({
      status: 'archived',
      changeId: 'demo',
      archivePath: archiveDir,
      recordPath: join(archiveDir, 'demo.md'),
      specsUpdated: ['widget'],
    });
    expect(readFileSync(join(archiveDir, 'demo.md'), 'utf8')).toContain(
      '**Archive**: READY',
    );
    expect(existsSync(join(archiveDir, '2026-09-28-demo.md'))).toBe(false);
    expect(existsSync(f.change)).toBe(false);
    expect(
      readFileSync(join(f.root, '.thoth/specs/widget/spec.md'), 'utf8'),
    ).toContain('### Requirement: New behavior');
  });

  test('adds into an existing capability from its reviewed baseline', () => {
    const existing =
      '# Widget Specification\n\n## Requirements\n\n### Requirement: Existing behavior\n\nThe existing requirement remains.\n';
    const f = fixture(addition, 'demo', { widget: existing });
    const result = archive(f);
    expect(result.status, result.stderr).toBe(0);
    const updated = readFileSync(
      join(f.root, '.thoth/specs/widget/spec.md'),
      'utf8',
    );
    expect(updated).toContain('### Requirement: Existing behavior');
    expect(updated).toContain('The existing requirement remains.');
    expect(updated).toContain('### Requirement: New behavior');
  });

  test('supports --project only when it matches the active change root', () => {
    const f = fixture();
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--project',
        f.root,
        '--change',
        f.change,
        '--date',
        '2026-09-28',
        '--json',
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).changeId).toBe('demo');
    const other = fixture();
    const mismatch = spawnSync(
      process.execPath,
      [
        script,
        '--project',
        f.root,
        '--change',
        other.change,
        '--date',
        '2026-09-28',
        '--json',
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    expect(mismatch.status).not.toBe(0);
    expect(existsSync(join(other.change, 'demo.md'))).toBe(true);
  });

  test('rejects missing or stale verification without changing active record or specs', () => {
    const f = fixture(addition);
    writeFileSync(join(f.root, 'source.txt'), 'stale\n');
    expect(archive(f).status).not.toBe(0);
    expect(existsSync(f.change)).toBe(true);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
  });

  test('does not overwrite same-title changes when reviewed baseline coverage is missing', () => {
    const modified =
      '- `MODIFIED widget` **Existing behavior** — The updated behavior MUST hold.\n  - GIVEN an existing widget; WHEN invoked; THEN updated behavior holds.';
    const reviewed =
      '# Widget Specification\n\n## Requirements\n\n### Requirement: Existing behavior\n\nThe reviewed behavior.\n';
    const f = fixture(modified, 'demo', { widget: reviewed });
    const record = join(f.change, `${f.id}.md`);
    writeFileSync(
      record,
      readFileSync(record, 'utf8').replace(
        `- Source: .thoth/specs/widget/spec.md | sha256:${hash(reviewed)}\n`,
        '',
      ),
    );
    const spec = join(f.root, '.thoth/specs/widget/spec.md');
    const newer = reviewed.replace('reviewed behavior', 'newer behavior');
    writeFileSync(spec, newer);

    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(existsSync(f.change)).toBe(true);
    expect(readFileSync(spec, 'utf8')).toBe(newer);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test('rejects same-title canonical edits without replacing newer content', () => {
    const modified =
      '- `MODIFIED widget` **Existing behavior** — The updated behavior MUST hold.\n  - GIVEN an existing widget; WHEN invoked; THEN updated behavior holds.';
    const reviewed =
      '# Widget Specification\n\n## Requirements\n\n### Requirement: Existing behavior\n\nThe reviewed behavior.\n';
    const f = fixture(modified, 'demo', { widget: reviewed });
    const spec = join(f.root, '.thoth/specs/widget/spec.md');
    const newer = reviewed.replace('reviewed behavior', 'newer behavior');
    writeFileSync(spec, newer);

    const result = archive(f);
    expect(result.status).not.toBe(0);
    expect(existsSync(f.change)).toBe(true);
    expect(
      existsSync(join(f.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
    expect(readFileSync(spec, 'utf8')).toBe(newer);
    expect(existsSync(join(f.root, '.thoth/.archive-transaction'))).toBe(false);
  });

  test('requires reviewed baselines and rejects deleted or newly created canonical targets', () => {
    const missing = fixture(addition);
    const missingRecord = join(missing.change, `${missing.id}.md`);
    writeFileSync(
      missingRecord,
      readFileSync(missingRecord, 'utf8').replace(
        '- Source: .thoth/specs/widget/spec.md | absent\n',
        '',
      ),
    );
    expect(archive(missing).status).not.toBe(0);
    expect(existsSync(missing.change)).toBe(true);
    expect(
      existsSync(join(missing.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);

    const added = fixture(addition);
    const created = join(added.root, '.thoth/specs/widget/spec.md');
    mkdirSync(join(added.root, '.thoth/specs/widget'), { recursive: true });
    writeFileSync(created, '# Widget Specification\n');
    expect(archive(added).status).not.toBe(0);
    expect(readFileSync(created, 'utf8')).toBe('# Widget Specification\n');
    expect(existsSync(added.change)).toBe(true);

    const modified =
      '- `MODIFIED widget` **Existing behavior** — The updated behavior MUST hold.\n  - GIVEN an existing widget; WHEN invoked; THEN updated behavior holds.';
    const original =
      '# Widget Specification\n\n## Requirements\n\n### Requirement: Existing behavior\n\nOriginal.\n';
    const deleted = fixture(modified, 'demo', { widget: original });
    rmSync(join(deleted.root, '.thoth/specs/widget/spec.md'));
    expect(archive(deleted).status).not.toBe(0);
    expect(existsSync(deleted.change)).toBe(true);
    expect(
      existsSync(join(deleted.root, '.thoth/changes/archive/2026-09-28-demo')),
    ).toBe(false);
  });

  test('preserves unaffected requirements and applies exact-title modifications, removals, and renames', () => {
    const deltas =
      '- `MODIFIED widget` **Old** — The new statement MUST hold.\n  - GIVEN old behavior; WHEN changed; THEN new behavior.\n- `REMOVED widget` **Delete** — The obsolete behavior is removed.\n- `RENAMED widget FROM Previous` **Next** — The renamed behavior MUST hold.\n  - GIVEN prior behavior; WHEN renamed; THEN the new behavior holds.';
    const original =
      '# Widget Specification\n\n## Requirements\n\n### Requirement: Old\n\nOriginal\n\n### Requirement: Delete\n\nRemove\n\n### Requirement: Previous\n\nRename\n\n### Requirement: Untouched\n\nPreserve byte-for-byte\n';
    const f = fixture(deltas, 'demo', { widget: original });
    const specs = join(f.root, '.thoth/specs/widget');
    const result = archive(f);
    expect(result.status, result.stderr).toBe(0);
    const updated = readFileSync(join(specs, 'spec.md'), 'utf8');
    expect(updated).toContain(
      '### Requirement: Untouched\n\nPreserve byte-for-byte',
    );
    expect(updated).toContain('### Requirement: Next');
    expect(updated).not.toContain('### Requirement: Delete');
    expect(updated).not.toContain('### Requirement: Previous');
    expect(updated).toContain('The new statement MUST hold.');
  });

  test('fails closed on unsafe IDs, destination collisions, and symlinked parents', () => {
    for (const id of ['con', 'nul', 'COM1', 'LPT9']) {
      const f = fixture('- None.', id);
      expect(archive(f).status, id).not.toBe(0);
      expect(existsSync(f.change)).toBe(true);
    }
    const f = fixture();
    const destination = join(f.root, '.thoth/changes/archive/2026-09-28-demo');
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, 'unrelated'), 'preserve');
    expect(archive(f).status).not.toBe(0);
    expect(readFileSync(join(destination, 'unrelated'), 'utf8')).toBe(
      'preserve',
    );
    expect(existsSync(f.change)).toBe(true);

    const symlink = fixture();
    const outside = join(symlink.root, 'outside');
    mkdirSync(outside);
    rmSync(join(symlink.root, '.thoth/changes/archive'), {
      recursive: true,
      force: true,
    });
    symlinkSync(
      outside,
      join(symlink.root, '.thoth/changes/archive'),
      'junction',
    );
    expect(archive(symlink).status).not.toBe(0);
    expect(existsSync(symlink.change)).toBe(true);
  });

  test('rolls back a handled canonical write fault and preserves the active record', () => {
    const f = fixture(addition);
    const result = archive(f, {
      THOTH_ARCHIVE_TEST_FAULT: 'after-first-canonical-write',
    });
    expect(result.status).not.toBe(0);
    expect(existsSync(f.change)).toBe(true);
    expect(existsSync(join(f.root, '.thoth/specs/widget/spec.md'))).toBe(false);
  });
});
