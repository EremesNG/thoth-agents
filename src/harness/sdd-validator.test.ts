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

const script = join(process.cwd(), 'skills/thoth-sdd/scripts/validate.mjs');
const roots: string[] = [];
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
function fixture(
  id = 'example',
  deltas = '- None.',
  specs: Record<string, string | null> = {},
  reviewDisposition = 'SKIPPED',
  reviewSelection: string | null = 'EXPLICIT_SKIP',
  implementationAuthorization = 'AUTHORIZED',
) {
  const root = mkdtempSync(join(tmpdir(), 'sdd-'));
  roots.push(root);
  const change = join(root, '.thoth/changes', id);
  mkdirSync(change, { recursive: true });
  mkdirSync(join(root, '.thoth/specs'), { recursive: true });
  writeFileSync(join(root, 'source.txt'), 'verified implementation\n');
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
    return `- Source: ${path} | sha256:${digest(content)}`;
  });
  const before = `# Change: ${id}\n\n**Classification**: substantial\n**Scope**: coordinated\n**Uncertainty**: low\n**Risk**: low\n\n## Exploration\n\n- Inspected source and constraints.\n\n## Intent\n\nDeliver explicit behavior.\n\n## Non-goals\n\nNo unrelated migration.\n\n## Acceptance\n\n- AC-1: Visible result is checked.\n\n## Clarifications\n\n- No material question remains; accepted intent is settled.\n\n## Decisions\n\n- Scope and behavior confirmed.\n\n## Durable deltas\n\n${deltas}\n\n## Plan\n\nUpdate source and test behavior; no process tooling.\n\n## Tasks\n\n- [x] AC-1: Implement and test the behavior.\n\n## Authorization\n\n**Plan review**: ${reviewDisposition}\n${reviewSelection === null ? '' : `**Plan review selection**: ${reviewSelection}\n`}**Implementation**: ${implementationAuthorization}\n\n`;
  const verification = `## Verification\n\n**Reviewer**: oracle\n**Independent from implementer**: Yes\n**Verdict**: PASS\n**Reviewed record SHA-256**: ${digest(before.split('## Authorization')[0])}\n\n- AC-1: PASS | pnpm test | behavior observed\n- Source: source.txt | sha256:${digest('verified implementation\n')}\n${reviewedSpecs.length ? `${reviewedSpecs.join('\n')}\n` : ''}\n## Closeout\n\n**Archive**: READY\n`;
  writeFileSync(join(change, `${id}.md`), before + verification);
  return { root, change, id, before, verification };
}
function validate(change: string, through = 'ready') {
  const result = spawnSync(
    process.execPath,
    [script, '--change', change, '--through', through, '--json'],
    { windowsHide: true, encoding: 'utf8' },
  );
  return {
    ...result,
    report: JSON.parse(result.stdout) as {
      valid: boolean;
      changeId?: string;
      recordPath?: string;
      errors: { code: string }[];
    },
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('ID-named SDD validator', () => {
  test.each([
    ['Authorization', '**Implementation**: AUTHORIZED'],
    ['Verification', '**Verdict**: PASS'],
    ['Closeout', '**Archive**: READY'],
  ])('keeps closeout valid after %s-only bookkeeping edits following PASS', (section, field) => {
    const f = fixture();
    const record = join(f.change, `${f.id}.md`);
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
    writeFileSync(
      record,
      readFileSync(record, 'utf8').replace(
        field,
        `${field}\n\n- ${section} bookkeeping confirmed by root.`,
      ),
    );
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
  });

  test.each([
    ['annotated', (line: string) => `${line} (reviewed)`],
    ['duplicated', (line: string) => `${line}\n${line}`],
    ['duplicate-annotated', (line: string) => `${line}\n${line} (note)`],
    ['substring-embedded', (line: string) => `note: ${line}`],
    ['missing', () => ''],
    [
      'uppercase',
      (line: string) =>
        line.replace(/[a-f0-9]{64}$/, (hex) => hex.toUpperCase()),
    ],
  ])('rejects a %s reviewed-record SHA line at closeout', (_name, invalidLine) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          /^\*\*Reviewed record SHA-256\*\*: .*$/m,
          invalidLine,
        ),
    );
    const result = validate(f.change, 'closeout');
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-STALE',
    );
  });

  test('rejects trailing whitespace on a SHA field at the end of Verification', () => {
    const f = fixture();
    const shaLine = f.verification.match(
      /^\*\*Reviewed record SHA-256\*\*: .*$/m,
    )?.[0];
    const reordered = f.verification
      .replace(`${shaLine}\n`, '')
      .replace('## Closeout', `${shaLine} \n\n## Closeout`);
    writeFileSync(join(f.change, `${f.id}.md`), f.before + reordered);

    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toEqual(['SDD-VERIFICATION-STALE']);
  });

  test('verify accepts final-review and Archive placeholders with complete tasks and reviewed sources', () => {
    const f = fixture();
    const placeholders = f.verification
      .replace('**Reviewer**: oracle', '**Reviewer**: PENDING')
      .replace(
        '**Independent from implementer**: Yes',
        '**Independent from implementer**: PENDING',
      )
      .replace('**Verdict**: PASS', '**Verdict**: PENDING')
      .replace(
        /^\*\*Reviewed record SHA-256\*\*: .*$/m,
        '**Reviewed record SHA-256**: PENDING',
      )
      .replace(
        '- AC-1: PASS | pnpm test | behavior observed',
        '- AC-1: PENDING | check | evidence',
      )
      .replace('**Archive**: READY', '**Archive**: PENDING');
    writeFileSync(join(f.change, `${f.id}.md`), f.before + placeholders);

    expect(validate(f.change, 'verify').report.valid).toBe(true);
    const closeout = validate(f.change, 'closeout');
    expect(closeout.report.errors.map(({ code }) => code)).toEqual([
      'SDD-VERIFICATION',
      'SDD-VERIFICATION-STALE',
      'SDD-VERIFICATION-COVERAGE',
      'SDD-ARCHIVE-READINESS',
    ]);
  });

  test.each([
    'verify',
    'closeout',
  ])('%s requires the case-sensitive Authorization heading', (gate) => {
    for (const replacement of ['## Approval', '## authorization']) {
      const f = fixture();
      writeFileSync(
        join(f.change, `${f.id}.md`),
        f.before.replace('## Authorization', replacement) + f.verification,
      );
      const result = validate(f.change, gate);
      expect(result.report.valid, replacement).toBe(false);
      expect(
        result.report.errors.map(({ code }) => code),
        replacement,
      ).toContain('SDD-AUTHORIZATION');
    }
  });

  test('rejects any pre-Authorization edit after PASS as stale', () => {
    const f = fixture();
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before.replace(
        'Deliver explicit behavior.',
        'Deliver changed behavior.',
      ) + f.verification,
    );
    const result = validate(f.change, 'closeout');
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map(({ code }) => code)).toEqual([
      'SDD-VERIFICATION-STALE',
    ]);
  });

  test.each([
    'verify',
    'closeout',
  ])('%s rejects annotated Authorization after PASS', (gate) => {
    const annotated = fixture(
      'annotated-auth',
      '- None.',
      {},
      'OKAY (note)',
      'EXPLICIT_REVIEW',
    );
    expect(validate(annotated.change, 'ready').report.valid).toBe(true);
    expect(
      validate(annotated.change, gate).report.errors.map(({ code }) => code),
    ).toContain('SDD-AUTHORIZATION');
  });

  test('verify rejects incomplete tasks that are valid at ready', () => {
    const incomplete = fixture('incomplete');
    writeFileSync(
      join(incomplete.change, `${incomplete.id}.md`),
      incomplete.before.replace('- [x] AC-1:', '- [ ] AC-1:') +
        incomplete.verification,
    );
    expect(validate(incomplete.change, 'ready').report.valid).toBe(true);
    expect(
      validate(incomplete.change, 'verify').report.errors.map(
        ({ code }) => code,
      ),
    ).toEqual(['SDD-TASK-INCOMPLETE']);
  });

  test('verify rejects stale, missing, and malformed reviewed implementation sources', () => {
    const f = fixture();
    writeFileSync(join(f.root, 'source.txt'), 'changed implementation\n');
    expect(
      validate(f.change, 'verify').report.errors.map(({ code }) => code),
    ).toEqual(['SDD-VERIFICATION-SOURCE']);

    writeFileSync(join(f.root, 'source.txt'), 'verified implementation\n');
    for (const replacement of ['', '- Source: source.txt | sha256:PENDING']) {
      writeFileSync(
        join(f.change, `${f.id}.md`),
        f.before +
          f.verification.replace(
            /^- Source: source.txt \| sha256:.*$/m,
            replacement,
          ),
      );
      expect(
        validate(f.change, 'verify').report.errors.map(({ code }) => code),
      ).toEqual(['SDD-VERIFICATION-SOURCE']);
    }
  });

  test.each([
    'verify',
    'closeout',
  ])('requires plan-review selection provenance at %s', (gate) => {
    const invalidSelections = [
      ['missing', 'SKIPPED', null],
      ['placeholder', 'SKIPPED', 'PENDING'],
      ['unsupported', 'OKAY', 'DECLINED'],
      [
        'duplicate',
        'SKIPPED',
        'EXPLICIT_SKIP\n**Plan review selection**: EXPLICIT_REVIEW',
      ],
      ['one-empty-default', 'OKAY', 'DEFAULT_REVIEW_AFTER_1'],
      ['two-empty-default', 'OKAY', 'DEFAULT_REVIEW_AFTER_2'],
      ['review-selected-but-skipped', 'SKIPPED', 'EXPLICIT_REVIEW'],
      ['skip-selected-but-reviewed', 'OKAY', 'EXPLICIT_SKIP'],
      ['default-review-but-skipped', 'SKIPPED', 'DEFAULT_REVIEW_AFTER_3'],
    ] as const;

    for (const [id, disposition, selection] of invalidSelections) {
      const f = fixture(id, '- None.', {}, disposition, selection);
      const result = validate(f.change, gate);

      expect(result.report.valid, id).toBe(false);
      expect(
        result.report.errors.map(({ code }) => code),
        id,
      ).toContain('SDD-REVIEW-SELECTION');
    }
  });

  test('accepts explicit review and a third-empty recommended review at closeout', () => {
    for (const [id, selection] of [
      ['explicit-review', 'EXPLICIT_REVIEW'],
      ['third-empty-default', 'DEFAULT_REVIEW_AFTER_3'],
    ] as const) {
      const f = fixture(id, '- None.', {}, 'OKAY', selection);
      expect(validate(f.change, 'closeout').report.valid, id).toBe(true);
    }
  });

  test('permits the initial review-selection placeholder at ready', () => {
    const f = fixture(
      'pending-review-selection',
      '- None.',
      {},
      'PENDING',
      'PENDING',
      'PENDING',
    );

    expect(validate(f.change, 'ready').report.valid).toBe(true);
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-REVIEW-SELECTION');
  });

  test('a template-derived record permits Authorization, Verification, and Closeout placeholders at ready', () => {
    const f = fixture();
    const template = readFileSync(
      join(process.cwd(), 'skills/thoth-sdd/templates/change.md'),
      'utf8',
    );
    const prepared = template
      .replace('# Change: <id>', `# Change: ${f.id}`)
      .replace('<local|coordinated|cross-cutting>', 'coordinated')
      .replace('<low|medium|high>', 'low')
      .replace('<low|medium|high>', 'low')
      .replace(
        /^TBD: .*$/gm,
        'Accepted behavior and focused checks are concrete.',
      )
      .replace(/^- PENDING: .*$/gm, '- Material choices are settled.')
      .replace('- AC-1: TBD', '- AC-1: Visible result is checked.')
      .replace(
        '- [ ] AC-1: TBD',
        '- [ ] AC-1: Implement and test the behavior.',
      );
    writeFileSync(join(f.change, `${f.id}.md`), prepared);

    expect(validate(f.change, 'ready').report.valid).toBe(true);
  });

  test('validates one substantial record and locates it by its known ID', () => {
    const f = fixture();
    expect(validate(f.change, 'explore').report.valid).toBe(true);
    expect(validate(f.change, 'specify').report.valid).toBe(true);
    expect(validate(f.change, 'clarify').report.valid).toBe(true);
    expect(validate(f.change, 'plan').report.valid).toBe(true);
    expect(validate(f.change, 'tasks').report.valid).toBe(true);
    expect(validate(f.change).report.valid).toBe(true);
    expect(validate(f.change, 'verify').report.valid).toBe(true);
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
    expect(validate(f.change).report).toMatchObject({
      changeId: 'example',
      recordPath: join(f.change, 'example.md'),
    });
  });

  test('validates the plan before tasks exist and requires task coverage at tasks and ready', () => {
    const f = fixture();
    const path = join(f.change, `${f.id}.md`);
    const withoutTasks = f.before.replace(
      '## Tasks\n\n- [x] AC-1: Implement and test the behavior.\n\n',
      '',
    );
    writeFileSync(path, withoutTasks);
    expect(validate(f.change, 'plan').status).toBe(0);
    for (const gate of ['tasks', 'ready', 'verify']) {
      const result = validate(f.change, gate);
      expect(result.status).toBe(1);
      expect(result.report.errors.map(({ code }) => code)).toContain(
        'SDD-TASK-COVERAGE',
      );
    }
  });

  test('blocks unresolved material intent instead of passing clarification or plan', () => {
    const f = fixture();
    const path = join(f.change, `${f.id}.md`);
    const unresolved = f.before.replace(
      'No material question remains; accepted intent is settled.',
      'PENDING: ask product owner about behavior.',
    );
    writeFileSync(path, unresolved + f.verification);
    for (const gate of ['clarify', 'plan', 'ready', 'verify'])
      expect(validate(f.change, gate).report.valid, gate).toBe(false);
  });

  test.each([
    'verify',
    'closeout',
  ])('requires reviewed canonical baselines and rejects same-title edits at %s', (gate) => {
    const addition =
      '- `ADDED widget` **New behavior** — The widget MUST respond.\n  - GIVEN an active widget; WHEN invoked; THEN it responds.';
    const original =
      '# Widget Specification\n\n## Requirements\n\n### Requirement: Existing behavior\n\nThe original reviewed statement.\n';
    const f = fixture('reviewed-spec', addition, { widget: original });
    const record = join(f.change, `${f.id}.md`);
    expect(validate(f.change, gate).report.valid).toBe(true);

    const updated = join(f.root, '.thoth/specs/widget/spec.md');
    writeFileSync(updated, original.replace('original reviewed', 'newer'));
    const stale = validate(f.change, gate);
    expect(stale.report.valid).toBe(false);
    expect(stale.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-SPEC-BASELINE',
    );

    writeFileSync(updated, original);
    writeFileSync(
      record,
      readFileSync(record, 'utf8').replace(
        `- Source: .thoth/specs/widget/spec.md | sha256:${digest(original)}\n`,
        '',
      ),
    );
    const missing = validate(f.change, gate);
    expect(missing.report.valid).toBe(false);
    expect(missing.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-SPEC-BASELINE',
    );
  });

  test.each([
    'verify',
    'closeout',
  ])('reviews absence for a new capability and rejects later creation at %s', (gate) => {
    const addition =
      '- `ADDED widget` **New behavior** — The widget MUST respond.\n  - GIVEN an active widget; WHEN invoked; THEN it responds.';
    const f = fixture('absent-spec', addition);
    expect(validate(f.change, gate).report.valid).toBe(true);
    const created = join(f.root, '.thoth/specs/widget/spec.md');
    mkdirSync(join(f.root, '.thoth/specs/widget'), { recursive: true });
    writeFileSync(created, '# Widget Specification\n');
    const stale = validate(f.change, gate);
    expect(stale.report.valid).toBe(false);
    expect(stale.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-SPEC-BASELINE',
    );
  });

  test('rejects unsafe IDs and never guesses another markdown filename', () => {
    for (const id of ['CON', 'nul', 'COM1', 'LPT9', 'a..b']) {
      const f = fixture(id);
      expect(
        validate(f.change).report.errors.map(({ code }) => code),
      ).toContain('SDD-CHANGE-ID');
    }
    const f = fixture('known-id');
    rmSync(join(f.change, 'known-id.md'));
    writeFileSync(join(f.change, 'other.md'), f.before + f.verification);
    expect(validate(f.change).report.errors.map(({ code }) => code)).toContain(
      'SDD-CHANGE-MISSING',
    );
  });

  test('rejects separators and traversal instead of resolving them as change IDs', () => {
    const f = fixture();
    const unsafe = [
      join(f.root, '.thoth/changes/../escape'),
      join(f.root, '.thoth/changes/nested/child'),
      join(f.root, '.thoth/changes/bad\\\\id'),
    ];
    for (const path of unsafe) expect(validate(path).status).not.toBe(0);
  });

  test('rejects duplicate record artifacts and auxiliary process outputs', () => {
    const f = fixture();
    writeFileSync(join(f.change, 'another.md'), 'not canonical');
    expect(validate(f.change).report.errors.map(({ code }) => code)).toContain(
      'SDD-AUXILIARY-ARTIFACT',
    );
    rmSync(join(f.change, 'another.md'));
    mkdirSync(join(f.change, 'evidence'));
    expect(validate(f.change).report.valid).toBe(false);
  });

  test('retrieves an archived record by date-prefixed directory and stable ID filename', () => {
    const f = fixture('stable-id');
    const archive = join(f.root, '.thoth/changes/archive/2026-09-28-stable-id');
    mkdirSync(archive, { recursive: true });
    writeFileSync(
      join(archive, 'stable-id.md'),
      readFileSync(join(f.change, 'stable-id.md'), 'utf8'),
    );
    const result = validate(archive, 'closeout');
    expect(result.status).toBe(0);
    expect(result.report).toMatchObject({
      valid: true,
      changeId: 'stable-id',
      recordPath: join(archive, 'stable-id.md'),
    });
    expect(existsSync(join(archive, '2026-09-28-stable-id.md'))).toBe(false);
  });

  test('rejects symlinked ancestors and unknown route options', () => {
    const f = fixture();
    const outside = join(f.root, 'outside');
    mkdirSync(outside);
    const symlinkRoot = join(f.root, 'symlink-project');
    mkdirSync(symlinkRoot);
    symlinkSync(outside, join(symlinkRoot, '.thoth'), 'junction');
    const throughLink = join(symlinkRoot, '.thoth/changes/link-id');
    expect(validate(throughLink).status).not.toBe(0);
    const withRoute = spawnSync(
      process.execPath,
      [script, '--change', f.change, '--route', 'full', '--through', 'ready'],
      { windowsHide: true, encoding: 'utf8' },
    );
    expect(withRoute.status).toBe(2);
  });
});
