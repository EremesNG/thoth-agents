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

const INTERNAL_SPEC = `# Feature Specification: Example

## Intent and scope

**Why**: Keep internal implementation traceable.<br>
**Impact**: No durable behavior changes.<br>
**Affected capabilities**: None

## User stories

### US1 - Internal delivery (Priority: P1)

**Covers**: FR-001, SC-001

**Acceptance scenarios**:

1. **Given** the implementation, **When** checks run, **Then** they pass.

## Functional requirements

- **FR-001 — Internal delivery**: \`[INTERNAL]\` The system MUST preserve behavior.

## Success criteria

- **SC-001** \`[buildable]\`: Focused checks pass.
`;

const OUTCOME_SPEC = INTERNAL_SPEC.replace(
  '**Covers**: FR-001, SC-001',
  '**Covers**: FR-001, SC-001, SC-002',
).replace(
  '- **SC-001** `[buildable]`: Focused checks pass.',
  '- **SC-001** `[buildable]`: Focused checks pass.\n- **SC-002** `[outcome]`: Every release has an observed result.',
);

const DURABLE_DELTA_SPEC = `# Feature Specification: Durable example

## Intent and scope

**Why**: Update the durable example contract.<br>
**Impact**: Adds, modifies, removes, and renames observable behavior.<br>
**Affected capabilities**: \`example\`

## User stories

### US1 - Durable delivery (Priority: P1)

**Covers**: FR-001, FR-002, FR-003, FR-004, SC-001

**Acceptance scenarios**:

1. **Given** a valid request, **When** the example runs, **Then** the durable result is visible.

## Functional requirements

- **FR-001 — Added behavior**: \`[ADDED example]\` The system MUST expose added behavior.
- **FR-002 — Existing behavior**: \`[MODIFIED example]\` The system MUST expose updated behavior.
- **FR-003 — Removed behavior**: \`[REMOVED example]\` The system MUST no longer expose removed behavior.
- **FR-004 — New name**: \`[RENAMED example FROM Old name]\` The system MUST expose renamed behavior.

## Success criteria

- **SC-001** \`[buildable]\`: All durable contract checks pass.
`;

const MULTILINE_DURABLE_DELTA_SPEC = DURABLE_DELTA_SPEC.replace(
  '1. **Given** a valid request, **When** the example runs, **Then** the durable result is visible.',
  `1. **Given** a valid request with wrapped
   context, **When** the example runs across a wrapped
   execution path, **Then** the complete durable
   result is visible.
2. **Given** a second valid request,
   **When** another execution path runs,
   **Then** the second durable result is visible.`,
);

const EXISTING_CANONICAL_SPEC = `# Example Specification

## Purpose

Durable example behavior.

## Requirements

### Requirement: Existing behavior

The system MUST expose old behavior.

#### Scenario: existing

- **GIVEN** an existing request
- **WHEN** it runs
- **THEN** the old result is visible

### Requirement: Removed behavior

The system MUST expose removed behavior.

#### Scenario: removed

- **GIVEN** a removed request
- **WHEN** it runs
- **THEN** the removed result is visible

### Requirement: Old name

The system MUST expose the old name.

#### Scenario: old name

- **GIVEN** an old request
- **WHEN** it runs
- **THEN** the old name is visible
`;

const VALID_VERIFY_REPORT = `# Verification Report: Example

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: Every accepted contract is represented.
- **Correctness**: The implementation matches the specification.
- **Coherence**: Specification, implementation, and evidence agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | \`src/example.ts:1\` | \`pnpm test\` | PASS |
| SC-001 \`[buildable]\` | \`src/example.test.ts:1\` | \`pnpm test\` | PASS |

## Findings

- None.

## Residual risks

- None.
`;

const DURABLE_VERIFY_REPORT = VALID_VERIFY_REPORT.replace(
  '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
  '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |\n| FR-002 | `src/example.ts:2` | `pnpm test` | PASS |\n| FR-003 | `src/example.ts:3` | `pnpm test` | PASS |\n| FR-004 | `src/example.ts:4` | `pnpm test` | PASS |',
);

const OUTCOME_RISK_VERIFY_REPORT = VALID_VERIFY_REPORT.replace(
  '| SC-001 `[buildable]` | `src/example.test.ts:1` | `pnpm test` | PASS |',
  '| SC-001 `[buildable]` | `src/example.test.ts:1` | `pnpm test` | PASS |\n| SC-002 `[outcome]` | Product observation pending | `N/A` | RISK |',
).replace(
  '## Residual risks\n\n- None.',
  '## Residual risks\n\n- SC-002: [observation plan]',
);

function createChange() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-archive-'));
  const changesRoot = join(root, 'openspec', 'changes');
  const change = join(changesRoot, 'example');
  const specs = join(root, 'openspec', 'specs');
  mkdirSync(change, { recursive: true });
  mkdirSync(specs, { recursive: true });
  writeFileSync(join(specs, 'baseline.md'), 'permanent specification\n');
  writeFileSync(join(change, 'spec.md'), INTERNAL_SPEC);
  writeFileSync(join(change, 'plan.md'), '# Plan\n');
  writeFileSync(
    join(change, 'tasks.md'),
    '- [x] T001 [US1] Complete the change in `src/example.ts` | Verify: focused test passes\n',
  );
  writeFileSync(join(change, 'verify-report.md'), VALID_VERIFY_REPORT);
  writeFileSync(
    join(change, 'archive-report.md'),
    `# Archive Report: Example

**Status**: READY<br>
**Oracle verdict**: PASS<br>
**Archive path**: \`openspec/changes/archive/YYYY-MM-DD-[feature]/\`

## Completed scope

- Example.

## Verification lineage

- \`verify-report.md\` records oracle PASS.

## Canonical specification sync

- Pending: archive applies declared durable deltas transactionally.
`,
  );
  return { root, change, changesRoot, specs };
}

function archive(change: string, fault?: string) {
  return spawnSync(
    process.execPath,
    [ARCHIVE_SCRIPT, '--change', change, '--date', '2026-07-19', '--json'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(fault ? { THOTH_ARCHIVE_TEST_FAULT: fault } : {}),
      },
    },
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
        VALID_VERIFY_REPORT.replace('**Verdict**: PASS', '**Verdict**: FAIL'),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must record PASS');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('blocks a critical finding without explicit resolution even after PASS', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        VALID_VERIFY_REPORT.replace(
          '- None.\n\n## Residual risks',
          '- CRITICAL: unsafe migration.\n\n## Residual risks',
        ),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unresolved CRITICAL');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    '- CRITICAL RESOLVED: migration risk was eliminated.',
    '- No CRITICAL findings remain.',
  ])('accepts non-blocking finding text: %s', (finding) => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        VALID_VERIFY_REPORT.replace(
          '- None.\n\n## Residual risks',
          `${finding}\n\n## Residual risks`,
        ),
      );

      expect(archive(fixture.change).status).toBe(0);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    {
      label: 'titleless requirement heading',
      canonical:
        '# Example Specification\n\n## Requirements\n\n### Requirement:\n\nBroken body.\n',
    },
    {
      label: 'duplicate exact requirement title',
      canonical: `${EXISTING_CANONICAL_SPEC}\n### Requirement: Existing behavior\n\nDuplicate body.\n`,
    },
  ])('rejects a canonical baseline with $label before permanent writes', ({
    canonical,
  }) => {
    const fixture = createChange();
    try {
      const capabilityDir = join(fixture.specs, 'example');
      const canonicalPath = join(capabilityDir, 'spec.md');
      const reportPath = join(fixture.change, 'archive-report.md');
      mkdirSync(capabilityDir, { recursive: true });
      writeFileSync(canonicalPath, canonical);
      writeFileSync(join(fixture.change, 'spec.md'), DURABLE_DELTA_SPEC);
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        DURABLE_VERIFY_REPORT,
      );
      const originalReport = readFileSync(reportPath, 'utf8');

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('SDD-SPEC-DELTA-BASELINE');
      expect(readFileSync(canonicalPath, 'utf8')).toBe(canonical);
      expect(readFileSync(reportPath, 'utf8')).toBe(originalReport);
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'a non-oracle reviewer',
      VALID_VERIFY_REPORT.replace(
        '**Reviewer**: oracle',
        '**Reviewer**: quick',
      ),
      'independent oracle reviewer',
    ],
    [
      'self verification',
      VALID_VERIFY_REPORT.replace(
        '**Independent from implementer**: Yes',
        '**Independent from implementer**: No',
      ),
      'independent oracle reviewer',
    ],
    [
      'missing review dimensions',
      VALID_VERIFY_REPORT.replace(
        /## Review dimensions[\s\S]+?## Compliance matrix/,
        '## Compliance matrix',
      ),
      'review dimensions',
    ],
    [
      'missing compliance evidence',
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |\n',
        '',
      ),
      'Verification evidence is missing',
    ],
    [
      'template placeholders used as PASS evidence',
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `[path:line]` | `[command]` | PASS |',
      ),
      'Verification evidence is missing',
    ],
    [
      'template placeholders used as review dimensions',
      VALID_VERIFY_REPORT.replace(
        /## Review dimensions[\s\S]+?## Compliance matrix/,
        '## Review dimensions\n\n- **Completeness**: [All accepted scope.]\n- **Correctness**: [Behavior matches.]\n- **Coherence**: [Artifacts agree.]\n\n## Compliance matrix',
      ),
      'review dimensions',
    ],
    [
      'a duplicate requirement row that hides FAIL',
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `src/example.ts:1` | `pnpm test` | FAIL |\n| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
      ),
      'unique known requirement IDs',
    ],
    [
      'an unknown requirement row',
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |\n| FR-999 | `src/ghost.ts:1` | `pnpm test` | FAIL |',
      ),
      'unique known requirement IDs',
    ],
    [
      'a malformed requirement row beside PASS',
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `src/example.ts:1` | `pnpm test` | FAIL | extra |\n| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
      ),
      'unique known requirement IDs',
    ],
  ])('revalidates direct archive closeout for %s', (_label, report, message) => {
    const fixture = createChange();
    try {
      writeFileSync(join(fixture.change, 'verify-report.md'), report);

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
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
      expect(readFileSync(join(target, 'archive-report.md'), 'utf8')).toContain(
        '**Status**: ARCHIVED',
      );
      expect(readFileSync(join(target, 'archive-report.md'), 'utf8')).toContain(
        'None: no durable behavior delta.',
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

  test('transactionally applies ADDED, MODIFIED, REMOVED, and RENAMED deltas', () => {
    const fixture = createChange();
    try {
      const capabilityDir = join(fixture.specs, 'example');
      mkdirSync(capabilityDir, { recursive: true });
      writeFileSync(join(capabilityDir, 'spec.md'), EXISTING_CANONICAL_SPEC);
      writeFileSync(join(fixture.change, 'spec.md'), DURABLE_DELTA_SPEC);
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        DURABLE_VERIFY_REPORT,
      );

      const result = archive(fixture.change);
      const canonical = readFileSync(join(capabilityDir, 'spec.md'), 'utf8');

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'archived',
        specsUpdated: ['example'],
      });
      expect(canonical).toContain('### Requirement: Added behavior');
      expect(canonical).toContain('The system MUST expose updated behavior.');
      expect(canonical).not.toContain('### Requirement: Removed behavior');
      expect(canonical).not.toContain('### Requirement: Old name');
      expect(canonical).toContain('### Requirement: New name');
      expect(canonical).toContain('#### Scenario: US1 - Durable delivery 1');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('preserves every multiline acceptance scenario in canonical deltas', () => {
    const fixture = createChange();
    try {
      const capabilityDir = join(fixture.specs, 'example');
      mkdirSync(capabilityDir, { recursive: true });
      writeFileSync(join(capabilityDir, 'spec.md'), EXISTING_CANONICAL_SPEC);
      writeFileSync(
        join(fixture.change, 'spec.md'),
        MULTILINE_DURABLE_DELTA_SPEC,
      );
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        DURABLE_VERIFY_REPORT,
      );

      const result = archive(fixture.change);
      const canonical = readFileSync(join(capabilityDir, 'spec.md'), 'utf8');

      expect(result.status, result.stderr).toBe(0);
      expect(canonical).toContain(
        '- **GIVEN** a valid request with wrapped context',
      );
      expect(canonical).toContain(
        '- **WHEN** the example runs across a wrapped execution path',
      );
      expect(canonical).toContain(
        '- **THEN** the complete durable result is visible',
      );
      expect(canonical).toContain('#### Scenario: US1 - Durable delivery 2');
      expect(canonical).toContain('- **GIVEN** a second valid request');
      expect(canonical).toContain(
        '- **THEN** the second durable result is visible',
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    {
      label: 'ADDED for an existing exact title',
      spec: DURABLE_DELTA_SPEC.replace(
        'FR-001 — Added behavior',
        'FR-001 — Existing behavior',
      ),
      code: 'SDD-SPEC-DELTA-ADDED-EXISTS',
    },
    {
      label: 'MODIFIED for a missing exact title',
      spec: DURABLE_DELTA_SPEC.replace(
        'FR-002 — Existing behavior',
        'FR-002 — Missing behavior',
      ),
      code: 'SDD-SPEC-DELTA-MODIFIED-MISSING',
    },
  ])('rejects $label with the shared preflight before permanent writes', ({
    spec,
    code,
  }) => {
    const fixture = createChange();
    try {
      const capabilityDir = join(fixture.specs, 'example');
      const canonicalPath = join(capabilityDir, 'spec.md');
      const reportPath = join(fixture.change, 'archive-report.md');
      mkdirSync(capabilityDir, { recursive: true });
      writeFileSync(canonicalPath, EXISTING_CANONICAL_SPEC);
      writeFileSync(join(fixture.change, 'spec.md'), spec);
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        DURABLE_VERIFY_REPORT,
      );
      const originalReport = readFileSync(reportPath, 'utf8');

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(code);
      expect(readFileSync(canonicalPath, 'utf8')).toBe(EXISTING_CANONICAL_SPEC);
      expect(readFileSync(reportPath, 'utf8')).toBe(originalReport);
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    ['after-original-backup'],
    ['after-first-canonical-write'],
    ['after-report-write'],
    ['before-change-move'],
  ])('rolls back canonical and report writes on a handled %s fault', (fault) => {
    const fixture = createChange();
    try {
      const capabilityDir = join(fixture.specs, 'example');
      const canonicalPath = join(capabilityDir, 'spec.md');
      const reportPath = join(fixture.change, 'archive-report.md');
      mkdirSync(capabilityDir, { recursive: true });
      writeFileSync(canonicalPath, EXISTING_CANONICAL_SPEC);
      writeFileSync(join(fixture.change, 'spec.md'), DURABLE_DELTA_SPEC);
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        DURABLE_VERIFY_REPORT,
      );
      const originalReport = readFileSync(reportPath, 'utf8');

      const result = archive(fixture.change, fault);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Injected archive fault: ${fault}`);
      expect(readFileSync(canonicalPath, 'utf8')).toBe(EXISTING_CANONICAL_SPEC);
      expect(existsSync(fixture.change)).toBe(true);
      expect(readFileSync(reportPath, 'utf8')).toBe(originalReport);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('continues canonical rollback when report recovery itself fails', () => {
    const fixture = createChange();
    try {
      const capabilityDir = join(fixture.specs, 'example');
      const canonicalPath = join(capabilityDir, 'spec.md');
      mkdirSync(capabilityDir, { recursive: true });
      writeFileSync(canonicalPath, EXISTING_CANONICAL_SPEC);
      writeFileSync(join(fixture.change, 'spec.md'), DURABLE_DELTA_SPEC);
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        DURABLE_VERIFY_REPORT,
      );

      const result = archive(
        fixture.change,
        'after-report-write,report-restore',
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('report recovery');
      expect(readFileSync(canonicalPath, 'utf8')).toBe(EXISTING_CANONICAL_SPEC);
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('leaves every permanent spec untouched when one declared delta is invalid', () => {
    const fixture = createChange();
    try {
      const invalidSpec = DURABLE_DELTA_SPEC.replace(
        '**Affected capabilities**: `example`',
        '**Affected capabilities**: `new-capability`, `missing-capability`',
      )
        .replaceAll('example]`', 'new-capability]`')
        .replace('[MODIFIED new-capability]', '[MODIFIED missing-capability]')
        .replace('[REMOVED new-capability]', '[REMOVED missing-capability]')
        .replace(
          '[RENAMED new-capability FROM Old name]',
          '[RENAMED missing-capability FROM Old name]',
        );
      writeFileSync(join(fixture.change, 'spec.md'), invalidSpec);
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        DURABLE_VERIFY_REPORT,
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('missing-capability');
      expect(existsSync(join(fixture.specs, 'new-capability', 'spec.md'))).toBe(
        false,
      );
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a malformed FR even when another FR parses successfully', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'spec.md'),
        DURABLE_DELTA_SPEC.replace(
          '- **FR-002 — Existing behavior**: `[MODIFIED example]` The system MUST expose updated behavior.',
          '- **FR-002**: The system MUST expose a silently ignored requirement.',
        ),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Every FR-###');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    'FR-01',
    'FR-0010',
  ])('rejects functional requirement ID width %s', (invalidId) => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'spec.md'),
        DURABLE_DELTA_SPEC.replace(
          '- **FR-002 — Existing behavior**: `[MODIFIED example]` The system MUST expose updated behavior.',
          `- **${invalidId} — Existing behavior**: \`[MODIFIED example]\` The system MUST expose updated behavior.`,
        ),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Every FR-###');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects an unformatted functional requirement candidate', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'spec.md'),
        DURABLE_DELTA_SPEC.replace(
          '- **FR-004 — New name**: `[RENAMED example FROM Old name]` The system MUST expose renamed behavior.',
          '- **FR-004 — New name**: `[RENAMED example FROM Old name]` The system MUST expose renamed behavior.\n  - FR-005 The system MUST not silently disappear.',
        ),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Every FR-###');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    'SC-01',
    'SC-0010',
  ])('rejects success criterion ID width %s', (invalidId) => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'spec.md'),
        INTERNAL_SPEC.replace(
          '- **SC-001** `[buildable]`: Focused checks pass.',
          `- **${invalidId}** \`[buildable]\`: Focused checks pass.`,
        ),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Every SC-###');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects an unformatted success criterion candidate', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'spec.md'),
        DURABLE_DELTA_SPEC.replace(
          '- **SC-001** `[buildable]`: All durable contract checks pass.',
          '- **SC-001** `[buildable]`: All durable contract checks pass.\n  - SC-002 Every malformed criterion is rejected.',
        ),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Every SC-###');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects requirements displaced from their canonical sections', () => {
    const fixture = createChange();
    try {
      writeFileSync(
        join(fixture.change, 'spec.md'),
        INTERNAL_SPEC.replace('## Functional requirements\n\n', ''),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Functional requirements');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('requires an explicit disposition for every outcome criterion', () => {
    const fixture = createChange();
    try {
      writeFileSync(join(fixture.change, 'spec.md'), OUTCOME_SPEC);

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('SC-002');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a placeholder residual risk for an outcome criterion', () => {
    const fixture = createChange();
    try {
      writeFileSync(join(fixture.change, 'spec.md'), OUTCOME_SPEC);
      writeFileSync(
        join(fixture.change, 'verify-report.md'),
        OUTCOME_RISK_VERIFY_REPORT,
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('SC-002');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('blocks an archive report that is not prepared for closeout', () => {
    const fixture = createChange();
    try {
      const reportPath = join(fixture.change, 'archive-report.md');
      writeFileSync(
        reportPath,
        readFileSync(reportPath, 'utf8').replace('READY', 'BLOCKED'),
      );

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('archive-report.md must record READY');
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'a status suffix',
      (report: string) =>
        report.replace('**Status**: READY', '**Status**: READY-ish'),
      'record READY',
    ],
    [
      'an unapproved oracle verdict',
      (report: string) =>
        report.replace('**Oracle verdict**: PASS', '**Oracle verdict**: FAIL'),
      'oracle PASS',
    ],
    [
      'missing verification lineage',
      (report: string) => report.replace('verify-report.md', 'review.md'),
      'verification lineage',
    ],
    [
      'a non-canonical target placeholder',
      (report: string) =>
        report.replace(
          'openspec/changes/archive/YYYY-MM-DD-[feature]/',
          'openspec/archive/example/',
        ),
      'dated archive target',
    ],
    [
      'a target placeholder displaced into notes',
      (report: string) =>
        report.replace(
          '**Archive path**: `openspec/changes/archive/YYYY-MM-DD-[feature]/`',
          '**Archive path**: `openspec/archive/example/`\n\n## Notes\n\n- `openspec/changes/archive/YYYY-MM-DD-[feature]/`',
        ),
      'dated archive target',
    ],
    [
      'a pending sync marker displaced from its section',
      (report: string) =>
        report.replace(
          '- Pending: archive applies declared durable deltas transactionally.',
          '- None.\n\n## Notes\n\n- Pending: archive applies declared durable deltas transactionally.',
        ),
      'pending canonical specification sync',
    ],
  ])('blocks archive metadata with %s', (_label, mutate, message) => {
    const fixture = createChange();
    try {
      const reportPath = join(fixture.change, 'archive-report.md');
      writeFileSync(reportPath, mutate(readFileSync(reportPath, 'utf8')));

      const result = archive(fixture.change);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(existsSync(fixture.change)).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
