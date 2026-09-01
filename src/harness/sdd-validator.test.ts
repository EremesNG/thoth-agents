import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const VALID_SPEC = `# Feature Specification: Example

**Change ID**: \`example\`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Users need one observable example behavior.<br>
**Impact**: Adds the example capability without changing unrelated behavior.<br>
**Affected capabilities**: \`example\`

## User stories

### US1 - Deliver example (Priority: P1)

As a user, I can use the example.

**Independent test**: Exercise the public example in isolation.

**Covers**: FR-001, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a valid input, **When** the action runs, **Then** the result is visible.

## Edge cases

- Invalid input is rejected without partial output.

## Functional requirements

- **FR-001 — Observable example**: \`[ADDED example]\` The system MUST expose the example.

## Success criteria

- **SC-001** \`[buildable]\`: Focused checks pass.
- **SC-002** \`[outcome]\`: Every documented example has an observable result.

## Assumptions

- The runtime is installed.

## Dependencies

- None.

## Out of scope

- Remote deployment.
`;

const VALID_PLAN = `# Implementation Plan: Example

## Constitution Check (pre-design)

- **Simplicity**: PASS — The design uses one bounded public seam.

## Design

Implement FR-001 in \`src/example.ts\` and verify SC-001.

## Constitution Check (post-design)

- **Simplicity**: PASS — The implementation keeps the same bounded seam.
`;

const VALID_PARALLEL_GROUP = `### Group P1

- Lane L1: T001 -> T002 | Owner: deep
- Lane L2: T003 | Owner: quick
- Prerequisites: None
- Barrier: Final verification
- Rationale: The lane path sets are disjoint and neither lane consumes peer output.`;

const VALID_TASKS = `# Tasks: Example

## MVP scope

US1 is the independently testable MVP.

## Dependencies

T001 -> T002.

- [ ] T001 [P] [US1] Cover FR-001 and SC-001 with a failing example test in \`src/example.test.ts\` | Verify: the focused test fails for the expected missing behavior
- [ ] T002 [P] [US1] Implement FR-001 and SC-001 in \`src/example.ts\` | Verify: the focused test passes and reports the observable result
- [ ] T003 [P] [US1] Document FR-001 and SC-001 in \`README.md\` | Verify: the documented example matches the tested public behavior

## Parallel execution

${VALID_PARALLEL_GROUP}
`;

const VALID_COMPLETED_TASKS = VALID_TASKS.replaceAll('- [ ]', '- [x]');

const VALID_VERIFY_REPORT = `# Verification Report: Example

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: All accepted scope is represented.
- **Correctness**: The implementation matches the contract.
- **Coherence**: Spec, plan, tasks, code, and docs agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | \`src/example.ts:1\` | \`pnpm test\` | PASS |
| SC-001 \`[buildable]\` | \`src/example.test.ts:1\` | \`pnpm test\` | PASS |
| SC-002 \`[outcome]\` | Product observation pending | \`N/A\` | RISK |

## Findings

- None.

## Residual risks

- SC-002: Production outcome remains to be observed after release.
`;

const VALID_ARCHIVE_REPORT = `# Archive Report: Example

**Status**: READY<br>
**Oracle verdict**: PASS<br>
**Archive path**: \`openspec/changes/archive/YYYY-MM-DD-[feature]/\`

## Completed scope

- US1, FR-001, and SC-001.

## Verification lineage

- \`verify-report.md\` records oracle PASS.

## Canonical specification sync

- Pending: archive applies declared durable deltas transactionally.

## Deviations and residual warnings

- None.
`;

const VALID_CHECKLIST = `# Requirements checklist

**Activation reason**: Contract risk warrants an explicit requirements audit.

## Initial validation

- [x] CHK001 [Completeness] FR-001 has an acceptance scenario.
- [x] CHK002 [Clarity] FR-001 has one observable interpretation.
- [x] CHK003 [Consistency] SC-001 and SC-002 align with US1.
- [x] CHK004 [Measurability] SC-001 is measurable.
- [x] CHK005 [Coverage] US1 maps to FR-001, SC-001, and SC-002.

## Domain lenses

- None: no security, accessibility, compliance, or migration lens applies.

## Revalidation

- [x] CHK006 [Coverage] US1, FR-001, SC-001, and SC-002 were revalidated after planning.
`;

const VALID_CONSTITUTION = `# Project Constitution

## Principles

### 1. Simplicity

Use one bounded public seam.
`;

const TEMPLATE_ROOT = join(process.cwd(), 'skills', 'thoth-sdd', 'templates');

function replaceRequired(content: string, marker: string, replacement: string) {
  if (!content.includes(marker)) {
    throw new Error(`Template marker is missing: ${marker}`);
  }
  return content.replace(marker, replacement);
}

function materializePlanningTemplates() {
  let plan = readFileSync(join(TEMPLATE_ROOT, 'plan.md'), 'utf8')
    .replaceAll('[Feature name]', 'Example')
    .replace(
      '[Current behavior, constraints, and affected surfaces.]',
      'The example has one bounded public seam and no migration.',
    )
    .replace(
      '| FR-001 | [Decision] | `[exact/path]` | [Public seam] |',
      '| FR-001 | Add the observable example | `src/example.ts` | Focused test |',
    )
    .replaceAll('[reason or not needed]', 'Not needed for this bounded change')
    .replace(
      '- [Risk, mitigation, rollback or migration.]',
      '- Risk is limited to the example seam; revert the source file to roll back.',
    );
  plan = replaceRequired(
    plan,
    '<!-- PRE-DESIGN-CONSTITUTION-ENTRIES -->',
    '- **Simplicity**: PASS — The design uses one bounded public seam.',
  );
  plan = replaceRequired(
    plan,
    '<!-- POST-DESIGN-CONSTITUTION-ENTRIES -->',
    '- **Simplicity**: PASS — The implementation keeps the same bounded seam.',
  );

  let tasks = readFileSync(join(TEMPLATE_ROOT, 'tasks.md'), 'utf8')
    .replaceAll('[Feature name]', 'Example')
    .replace(
      '[Name the first independently testable story and its completion evidence.]',
      'US1 is complete when the focused example test passes.',
    )
    .replace(
      '`T001 -> T002`; [cross-story dependency notes, or None.]',
      '`T001 -> T002`; documentation can follow the failing test independently.',
    )
    .replace(
      /## Parallel execution[\s\S]+?<!-- PARALLEL-EXECUTION-EVIDENCE -->/,
      '## Parallel execution\n\n<!-- PARALLEL-EXECUTION-EVIDENCE -->',
    );
  tasks = replaceRequired(
    tasks,
    '<!-- STORY-US1-TASKS -->',
    [
      '- [ ] T001 [P] [US1] Cover FR-001 and SC-001 with a failing example test in `src/example.test.ts` | Verify: the focused test fails for the expected missing behavior',
      '- [ ] T002 [P] [US1] Implement FR-001 and SC-001 in `src/example.ts` | Verify: the focused test passes and reports the observable result',
      '- [ ] T003 [P] [US1] Document FR-001 and SC-001 in `README.md` | Verify: the documented example matches the tested public behavior',
    ].join('\n'),
  );
  tasks = replaceRequired(
    tasks,
    '<!-- PARALLEL-EXECUTION-EVIDENCE -->',
    VALID_PARALLEL_GROUP,
  );
  tasks = replaceRequired(
    tasks,
    '<!-- FINAL-VERIFICATION-TASKS -->',
    '- [ ] T004 [US1] Map FR-001 and SC-001 evidence in `openspec/changes/example/verify-report.md` | Verify: oracle records a passing verdict with executed evidence',
  );

  return { plan, tasks };
}

function createChange(prefix: string) {
  const project = mkdtempSync(join(tmpdir(), prefix));
  const change = join(project, 'openspec', 'changes', 'example');
  mkdirSync(change, { recursive: true });
  mkdirSync(join(project, 'openspec', 'memory'), { recursive: true });
  writeFileSync(
    join(project, 'openspec', 'memory', 'constitution.md'),
    VALID_CONSTITUTION,
  );
  return { project, change };
}

function writeCanonicalSpec(project: string, content: string) {
  const capability = join(project, 'openspec', 'specs', 'example');
  mkdirSync(capability, { recursive: true });
  writeFileSync(join(capability, 'spec.md'), content);
}

function writeCanonicalRequirements(project: string, ...titles: string[]) {
  writeCanonicalSpec(
    project,
    `# Example Specification\n\n## Requirements\n\n${titles
      .map(
        (title) =>
          `### Requirement: ${title}\n\nThe system MUST preserve ${title}.`,
      )
      .join('\n\n')}\n`,
  );
}

function writeFixture(
  root: string,
  overrides: Partial<{
    spec: string;
    plan: string;
    tasks: string;
    checklist: string;
  }> = {},
) {
  mkdirSync(join(root, 'checklists'), { recursive: true });
  writeFileSync(join(root, 'spec.md'), overrides.spec ?? VALID_SPEC);
  writeFileSync(join(root, 'plan.md'), overrides.plan ?? VALID_PLAN);
  writeFileSync(join(root, 'tasks.md'), overrides.tasks ?? VALID_TASKS);
  writeFileSync(
    join(root, 'checklists', 'requirements.md'),
    overrides.checklist ?? VALID_CHECKLIST,
  );
}

function validate(changeRoot: string, through = 'ready') {
  return spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'skills', 'thoth-sdd', 'scripts', 'validate.mjs'),
      '--change',
      changeRoot,
      '--route',
      'full',
      '--through',
      through,
      '--json',
    ],
    { encoding: 'utf8' },
  );
}

describe('Spec Kit-compatible structural validator', () => {
  test('accepts the v0.3 intent, traceability, delta, and typed-SC contract', () => {
    const { project, change } = createChange('thoth-v03-spec-');
    try {
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);

      const result = validate(change, 'specify');

      expect(result.status, result.stdout).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    {
      label: 'ADDED when the exact title already exists',
      spec: VALID_SPEC,
      canonicalTitles: ['Observable example'],
      code: 'SDD-SPEC-DELTA-ADDED-EXISTS',
    },
    {
      label: 'MODIFIED when the exact title is missing',
      spec: VALID_SPEC.replace('[ADDED example]', '[MODIFIED example]'),
      canonicalTitles: [],
      code: 'SDD-SPEC-DELTA-MODIFIED-MISSING',
    },
    {
      label: 'REMOVED when the exact title is missing',
      spec: VALID_SPEC.replace('[ADDED example]', '[REMOVED example]'),
      canonicalTitles: [],
      code: 'SDD-SPEC-DELTA-REMOVED-MISSING',
    },
    {
      label: 'RENAMED when the previous title is missing',
      spec: VALID_SPEC.replace(
        '[ADDED example]',
        '[RENAMED example FROM Previous example]',
      ),
      canonicalTitles: [],
      code: 'SDD-SPEC-DELTA-RENAMED-SOURCE-MISSING',
    },
    {
      label: 'RENAMED when the destination title already exists',
      spec: VALID_SPEC.replace(
        '[ADDED example]',
        '[RENAMED example FROM Previous example]',
      ),
      canonicalTitles: ['Previous example', 'Observable example'],
      code: 'SDD-SPEC-DELTA-RENAMED-TARGET-EXISTS',
    },
  ])('rejects $label during specify', ({ spec, canonicalTitles, code }) => {
    const { project, change } = createChange('thoth-delta-mismatch-');
    try {
      if (canonicalTitles.length > 0) {
        writeCanonicalRequirements(project, ...canonicalTitles);
      }
      writeFileSync(join(change, 'spec.md'), spec);

      const result = validate(change, 'specify');
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        errors: Array<{ code: string }>;
      };

      expect(result.status).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.map((error) => error.code)).toContain(code);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('accepts MODIFIED for an existing exact title', () => {
    const { project, change } = createChange('thoth-delta-modified-');
    try {
      writeCanonicalRequirements(project, 'Observable example');
      writeFileSync(
        join(change, 'spec.md'),
        VALID_SPEC.replace('[ADDED example]', '[MODIFIED example]'),
      );

      const result = validate(change, 'specify');

      expect(result.status, result.stdout).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        valid: true,
        errors: [],
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('warns when ADDED targets an existing nonempty capability', () => {
    const { project, change } = createChange('thoth-delta-review-');
    try {
      writeCanonicalRequirements(project, 'Existing behavior');
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);

      const result = validate(change, 'specify');
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        errors: unknown[];
        warnings: Array<{ code: string; message: string }>;
      };

      expect(result.status, result.stdout).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.warnings).toContainEqual(
        expect.objectContaining({
          code: 'SDD-SPEC-DELTA-ADDED-REVIEW',
          message: expect.stringContaining('Existing behavior'),
        }),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects a titleless canonical requirement heading', () => {
    const { project, change } = createChange('thoth-delta-malformed-');
    try {
      writeCanonicalSpec(
        project,
        '# Example Specification\n\n## Requirements\n\n### Requirement:\n\nBroken body.\n',
      );
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);

      const result = validate(change, 'specify');
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        errors: Array<{ code: string }>;
      };

      expect(result.status).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.map((error) => error.code)).toContain(
        'SDD-SPEC-DELTA-BASELINE',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects duplicate canonical requirement titles', () => {
    const { project, change } = createChange('thoth-delta-duplicate-');
    try {
      writeCanonicalRequirements(
        project,
        'Observable example',
        'Observable example',
      );
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);

      const result = validate(change, 'specify');
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        errors: Array<{ code: string }>;
      };

      expect(result.status).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.map((error) => error.code)).toContain(
        'SDD-SPEC-DELTA-BASELINE',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('evaluates dependent durable deltas in declaration order', () => {
    const { project, change } = createChange('thoth-delta-ordered-');
    try {
      writeCanonicalRequirements(project, 'Previous example');
      const orderedSpec = VALID_SPEC.replace(
        '**Covers**: FR-001, SC-001, SC-002',
        '**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002',
      ).replace(
        '- **FR-001 — Observable example**: `[ADDED example]` The system MUST expose the example.',
        [
          '- **FR-001 — Observable example**: `[RENAMED example FROM Previous example]` The system MUST expose the renamed example.',
          '- **FR-002 — Observable example**: `[MODIFIED example]` The system MUST expose the updated example.',
          '- **FR-003 — Observable example**: `[REMOVED example]` The system MUST no longer expose the example.',
        ].join('\n'),
      );
      writeFileSync(join(change, 'spec.md'), orderedSpec);

      const result = validate(change, 'specify');

      expect(result.status, result.stdout).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        valid: true,
        errors: [],
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    'plan',
    'tasks',
    'ready',
  ])('rechecks durable intent through the %s gate', (through) => {
    const { project, change } = createChange('thoth-delta-later-gate-');
    try {
      writeCanonicalRequirements(project, 'Observable example');
      writeFixture(change);

      const result = validate(change, through);
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        errors: Array<{ code: string }>;
      };

      expect(result.status).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.map((error) => error.code)).toContain(
        'SDD-SPEC-DELTA-ADDED-EXISTS',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('does not read canonical baselines for INTERNAL requirements', () => {
    const { project, change } = createChange('thoth-delta-internal-');
    try {
      writeCanonicalSpec(
        project,
        '# Example Specification\n\n## Requirements\n\n### Requirement:\n\nBroken body.\n',
      );
      writeFileSync(
        join(change, 'spec.md'),
        VALID_SPEC.replace('[ADDED example]', '[INTERNAL]'),
      );

      const result = validate(change, 'specify');

      expect(result.status, result.stdout).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        valid: true,
        errors: [],
        warnings: [],
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'intent metadata',
      VALID_SPEC.replace(
        /## Intent and scope[\s\S]+?## User stories/,
        '## User stories',
      ),
      'SDD-SPEC-INTENT',
    ],
    [
      'canonical requirement section headings',
      VALID_SPEC.replace('## Functional requirements\n\n', '').replace(
        '## Success criteria\n\n',
        '',
      ),
      'SDD-SPEC-SECTIONS',
    ],
    [
      'edge-case and dependency sections',
      VALID_SPEC.replace(
        /## Edge cases[\s\S]+?## Functional requirements/,
        '## Functional requirements',
      ).replace(/## Dependencies[\s\S]+?## Out of scope/, '## Out of scope'),
      'SDD-SPEC-SECTIONS',
    ],
    [
      'story requirement coverage',
      VALID_SPEC.replace('**Covers**: FR-001, SC-001, SC-002\n\n', ''),
      'SDD-SPEC-STORY-COVERAGE',
    ],
    [
      'story coverage without success criteria',
      VALID_SPEC.replace(
        '**Covers**: FR-001, SC-001, SC-002',
        '**Covers**: FR-001',
      ),
      'SDD-SPEC-STORY-COVERAGE',
    ],
    [
      'story coverage without functional requirements',
      VALID_SPEC.replace(
        '**Covers**: FR-001, SC-001, SC-002',
        '**Covers**: SC-001, SC-002',
      ),
      'SDD-SPEC-STORY-COVERAGE',
    ],
    [
      'malformed functional requirement hidden beside a valid one',
      VALID_SPEC.replace(
        '- **FR-001 — Observable example**: `[ADDED example]` The system MUST expose the example.',
        '- **FR-001 — Observable example**: `[ADDED example]` The system MUST expose the example.\n- **FR-002**: The system MUST expose a silently ignored requirement.',
      ),
      'SDD-SPEC-FR-FORMAT',
    ],
    [
      'functional requirement ID with the wrong width',
      VALID_SPEC.replace(
        '- **FR-001 — Observable example**: `[ADDED example]` The system MUST expose the example.',
        '- **FR-001 — Observable example**: `[ADDED example]` The system MUST expose the example.\n- **FR-01 — Hidden example**: `[INTERNAL]` The system MUST not ignore malformed IDs.',
      ),
      'SDD-SPEC-FR-FORMAT',
    ],
    [
      'unformatted functional requirement candidate',
      VALID_SPEC.replace(
        '- **FR-001 — Observable example**: `[ADDED example]` The system MUST expose the example.',
        '- **FR-001 — Observable example**: `[ADDED example]` The system MUST expose the example.\n  - FR-002 The system MUST not silently disappear.',
      ),
      'SDD-SPEC-FR-FORMAT',
    ],
    [
      'success criterion ID with the wrong width',
      VALID_SPEC.replace(
        '- **SC-002** `[outcome]`: Every documented example has an observable result.',
        '- **SC-002** `[outcome]`: Every documented example has an observable result.\n- **SC-02** `[outcome]`: Every malformed criterion is rejected.',
      ),
      'SDD-SPEC-SC-TYPE',
    ],
    [
      'unformatted success criterion candidate',
      VALID_SPEC.replace(
        '- **SC-002** `[outcome]`: Every documented example has an observable result.',
        '- **SC-002** `[outcome]`: Every documented example has an observable result.\n  - SC-003 Every malformed criterion is rejected.',
      ),
      'SDD-SPEC-SC-TYPE',
    ],
    [
      'normative functional requirement',
      VALID_SPEC.replace('The system MUST expose', 'The system exposes'),
      'SDD-SPEC-FR-NORMATIVE',
    ],
    [
      'canonical delta metadata',
      VALID_SPEC.replace('[ADDED example]', '[UPSERT example]'),
      'SDD-SPEC-FR-DELTA',
    ],
    [
      'affected capability coverage',
      VALID_SPEC.replace(
        '**Affected capabilities**: `example`',
        '**Affected capabilities**: `other`',
      ),
      'SDD-SPEC-CAPABILITY-COVERAGE',
    ],
    [
      'typed success criteria',
      VALID_SPEC.replace('`[buildable]`', '`[metric]`'),
      'SDD-SPEC-SC-TYPE',
    ],
  ])('rejects invalid v0.3 %s', (_label, spec, expectedCode) => {
    const { project, change } = createChange('thoth-v03-invalid-spec-');
    try {
      writeFileSync(join(change, 'spec.md'), spec);

      const report = JSON.parse(validate(change, 'specify').stdout) as {
        errors: Array<{ code: string }>;
      };

      expect(report.errors.map(({ code }) => code)).toContain(expectedCode);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('validates only the artifacts required through the current gate', () => {
    const { project, change } = createChange('thoth-progressive-sdd-');
    try {
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);
      expect(validate(change, 'specify').status).toBe(0);

      writeFileSync(join(change, 'plan.md'), VALID_PLAN);
      expect(validate(change, 'plan').status).toBe(0);

      writeFileSync(join(change, 'tasks.md'), VALID_TASKS);
      expect(validate(change, 'tasks').status).toBe(0);

      const missingTasks = validate(change, 'ready');
      expect(missingTasks.status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('does not require tasks while validating the plan gate', () => {
    const { project, change } = createChange('thoth-plan-gate-');
    try {
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);
      writeFileSync(join(change, 'plan.md'), VALID_PLAN);

      const report = JSON.parse(validate(change, 'plan').stdout) as {
        valid: boolean;
        errors: Array<{ artifact: string }>;
      };
      expect(report.valid).toBe(true);
      expect(report.errors.map(({ artifact }) => artifact)).not.toContain(
        'tasks.md',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('accepts a complete governed artifact set', () => {
    const { project, change } = createChange('thoth-valid-sdd-');
    try {
      writeFixture(change);
      const result = validate(change);

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        valid: true,
        errors: [],
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('accepts completed planning artifacts materialized from bundled templates', () => {
    const { project, change } = createChange('thoth-template-ready-');
    try {
      const { plan, tasks } = materializePlanningTemplates();
      writeFixture(change, { plan, tasks });

      const result = validate(change, 'ready');

      expect(result.status, result.stdout).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        valid: true,
        errors: [],
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'mismatched Constitution principle coverage',
      ({ plan, tasks }: { plan: string; tasks: string }) => ({
        plan: plan.replace(
          '- **Simplicity**: PASS — The implementation keeps the same bounded seam.',
          '- **Assurance**: PASS — Oracle reviews the result.',
        ),
        tasks,
      }),
      'SDD-PLAN-CONSTITUTION-COVERAGE',
    ],
    [
      'a non-literal task path',
      ({ plan, tasks }: { plan: string; tasks: string }) => ({
        plan,
        tasks: tasks.replace('`src/example.ts`', '`[exact/source/path]`'),
      }),
      'SDD-TASK-FORMAT',
    ],
    [
      'a non-sequential task identifier',
      ({ plan, tasks }: { plan: string; tasks: string }) => ({
        plan,
        tasks: tasks.replace('T002 [P] [US1]', 'T005 [P] [US1]'),
      }),
      'SDD-TASK-SEQUENCE',
    ],
  ])('retains %s errors for template-derived artifacts', (_label, mutate, code) => {
    const { project, change } = createChange('thoth-template-invalid-');
    try {
      writeFixture(change, mutate(materializePlanningTemplates()));

      const report = JSON.parse(validate(change, 'ready').stdout) as {
        errors: Array<{ code: string }>;
      };

      expect(report.errors.map((error) => error.code)).toContain(code);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('replaces the ambiguous final gate with ready and closeout', () => {
    const { project, change } = createChange('thoth-gate-names-');
    try {
      writeFixture(change);

      const result = validate(change, 'final');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('ready');
      expect(result.stderr).toContain('closeout');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('validates a complete independent closeout contract', () => {
    const { project, change } = createChange('thoth-valid-closeout-');
    try {
      writeFixture(change, { tasks: VALID_COMPLETED_TASKS });
      writeFileSync(join(change, 'verify-report.md'), VALID_VERIFY_REPORT);
      writeFileSync(join(change, 'archive-report.md'), VALID_ARCHIVE_REPORT);

      expect(validate(change, 'closeout').status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('accepts an outcome criterion with concrete observed PASS evidence', () => {
    const { project, change } = createChange('thoth-observed-outcome-');
    try {
      writeFixture(change, { tasks: VALID_COMPLETED_TASKS });
      writeFileSync(
        join(change, 'verify-report.md'),
        VALID_VERIFY_REPORT.replace(
          '| SC-002 `[outcome]` | Product observation pending | `N/A` | RISK |',
          '| SC-002 `[outcome]` | `reports/example.json:1` | `pnpm test:e2e` | PASS |',
        ).replace(
          '- SC-002: Production outcome remains to be observed after release.',
          '- None.',
        ),
      );
      writeFileSync(join(change, 'archive-report.md'), VALID_ARCHIVE_REPORT);

      expect(validate(change, 'closeout').status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    '- CRITICAL RESOLVED: migration risk was eliminated.',
    '- No CRITICAL findings remain.',
  ])('accepts non-blocking finding text: %s', (finding) => {
    const { project, change } = createChange('thoth-resolved-critical-');
    try {
      writeFixture(change, { tasks: VALID_COMPLETED_TASKS });
      writeFileSync(
        join(change, 'verify-report.md'),
        VALID_VERIFY_REPORT.replace(
          '- None.\n\n## Residual risks',
          `${finding}\n\n## Residual risks`,
        ),
      );
      writeFileSync(join(change, 'archive-report.md'), VALID_ARCHIVE_REPORT);

      expect(validate(change, 'closeout').status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'incomplete tasks',
      VALID_TASKS,
      VALID_VERIFY_REPORT,
      VALID_ARCHIVE_REPORT,
      'SDD-CLOSEOUT-TASKS',
    ],
    [
      'self review',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace('Yes', 'No'),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-INDEPENDENCE',
    ],
    [
      'missing requirement evidence',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '| SC-001 `[buildable]` | `src/example.test.ts:1` | `pnpm test` | PASS |\n',
        '',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-COVERAGE',
    ],
    [
      'missing outcome criterion disposition',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '| SC-002 `[outcome]` | Product observation pending | `N/A` | RISK |\n',
        '',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-OUTCOME',
    ],
    [
      'outcome risk without an explicit residual risk',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '- SC-002: Production outcome remains to be observed after release.',
        '- None.',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-OUTCOME',
    ],
    [
      'outcome risk with a placeholder residual risk',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '- SC-002: Production outcome remains to be observed after release.',
        '- SC-002: TBD.',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-OUTCOME',
    ],
    [
      'outcome risk with a bracketed residual placeholder',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '- SC-002: Production outcome remains to be observed after release.',
        '- SC-002: [observation plan]',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-OUTCOME',
    ],
    [
      'PASS row with template evidence placeholders',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `[path:line]` | `[command]` | PASS |',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-COVERAGE',
    ],
    [
      'review dimensions left as template placeholders',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        /## Review dimensions[\s\S]+?## Compliance matrix/,
        '## Review dimensions\n\n- **Completeness**: [All accepted scope.]\n- **Correctness**: [Behavior matches.]\n- **Coherence**: [Artifacts agree.]\n\n## Compliance matrix',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-DIMENSIONS',
    ],
    [
      'duplicate compliance rows that hide a failure',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `src/example.ts:1` | `pnpm test` | FAIL |\n| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-MATRIX',
    ],
    [
      'unknown failed compliance row',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |\n| FR-999 | `src/ghost.ts:1` | `pnpm test` | FAIL |',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-MATRIX',
    ],
    [
      'malformed compliance candidate beside a passing row',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
        '| FR-001 | `src/example.ts:1` | `pnpm test` | FAIL | extra |\n| FR-001 | `src/example.ts:1` | `pnpm test` | PASS |',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-MATRIX',
    ],
    [
      'critical finding without a resolved status',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        '- None.\n\n## Residual risks',
        '- CRITICAL: possible data loss.\n\n## Residual risks',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-CRITICAL',
    ],
    [
      'missing review dimensions',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT.replace(
        /## Review dimensions[\s\S]+?## Compliance matrix/,
        '## Compliance matrix',
      ),
      VALID_ARCHIVE_REPORT,
      'SDD-VERIFY-DIMENSIONS',
    ],
    [
      'unprepared archive report',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT,
      VALID_ARCHIVE_REPORT.replace('**Status**: READY', '**Status**: BLOCKED'),
      'SDD-ARCHIVE-REPORT',
    ],
    [
      'archive target placeholder displaced from its field',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT,
      VALID_ARCHIVE_REPORT.replace(
        '**Archive path**: `openspec/changes/archive/YYYY-MM-DD-[feature]/`',
        '**Archive path**: `openspec/archive/example/`\n\n## Notes\n\n- `openspec/changes/archive/YYYY-MM-DD-[feature]/`',
      ),
      'SDD-ARCHIVE-REPORT',
    ],
    [
      'missing pending canonical sync',
      VALID_COMPLETED_TASKS,
      VALID_VERIFY_REPORT,
      VALID_ARCHIVE_REPORT.replace(
        '- Pending: archive applies declared durable deltas transactionally.',
        '- None.',
      ),
      'SDD-ARCHIVE-REPORT',
    ],
  ])('rejects closeout with %s', (_label, tasks, verifyReport, archiveReport, expectedCode) => {
    const { project, change } = createChange('thoth-invalid-closeout-');
    try {
      writeFixture(change, { tasks });
      writeFileSync(join(change, 'verify-report.md'), verifyReport);
      writeFileSync(join(change, 'archive-report.md'), archiveReport);

      const report = JSON.parse(validate(change, 'closeout').stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toContain(expectedCode);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'spec IDs and independent stories',
      { spec: '# Feature\n\nNo structured requirements.\n' },
      ['SDD-SPEC-STORIES', 'SDD-SPEC-FR', 'SDD-SPEC-SC'],
    ],
    [
      'Constitution gates',
      { plan: '# Plan\n\nNo gates.\n' },
      ['SDD-PLAN-CONSTITUTION-PRE', 'SDD-PLAN-CONSTITUTION-POST'],
    ],
    [
      'task grammar and MVP metadata',
      { tasks: '# Tasks\n\n- do the work\n' },
      ['SDD-TASK-FORMAT', 'SDD-TASK-MVP', 'SDD-TASK-PARALLEL'],
    ],
    [
      'checklist taxonomy and revalidation',
      { checklist: '# Checklist\n\n- looks good\n' },
      [
        'SDD-CHECKLIST-ID',
        'SDD-CHECKLIST-ACTIVATION',
        'SDD-CHECKLIST-TAXONOMY',
        'SDD-CHECKLIST-DOMAIN-LENSES',
        'SDD-CHECKLIST-REVALIDATION',
      ],
    ],
  ])('rejects missing %s', (_label, overrides, expectedCodes) => {
    const { project, change } = createChange('thoth-invalid-sdd-');
    try {
      writeFixture(change, overrides);
      const result = validate(change);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        errors: Array<{ code: string }>;
      };
      expect(report.valid).toBe(false);
      expect(report.errors.map(({ code }) => code)).toEqual(
        expect.arrayContaining(expectedCodes),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires an independent test and Given/When/Then for every story', () => {
    const { project, change } = createChange('thoth-story-contract-');
    try {
      const secondStory = `\n### US2 - Missing evidence (Priority: P2)\n\nAs a user, I can request a second outcome.\n`;
      writeFixture(change, {
        spec: VALID_SPEC.replace(
          '\n## Edge cases',
          `${secondStory}\n## Edge cases`,
        ),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'SDD-SPEC-INDEPENDENCE',
          'SDD-SPEC-ACCEPTANCE',
        ]),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('allows requirement references while keeping definitions unique', () => {
    const { project, change } = createChange('thoth-reference-ids-');
    try {
      writeFixture(change, {
        spec: VALID_SPEC.replace(
          'As a user, I can use the example.',
          'As a user, I can use the FR-001 outcome measured by SC-001.',
        ),
      });

      expect(validate(change).status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires complete US, FR, and SC coverage in tasks', () => {
    const { project, change } = createChange('thoth-task-coverage-');
    try {
      writeFixture(change, {
        tasks: VALID_TASKS.replaceAll('SC-001', 'success criterion'),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toContain(
        'SDD-TASK-COVERAGE',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires a verification outcome on every task', () => {
    const { project, change } = createChange('thoth-task-verification-');
    try {
      writeFixture(change, {
        tasks: VALID_TASKS.replace(
          ' | Verify: the focused test fails for the expected missing behavior',
          '',
        ),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toContain(
        'SDD-TASK-VERIFICATION',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('accepts an explicit explanation when no safe parallel work exists', () => {
    const { project, change } = createChange('thoth-no-parallel-work-');
    try {
      writeFixture(change, {
        tasks: VALID_TASKS.replaceAll(' [P]', '').replace(
          VALID_PARALLEL_GROUP,
          '- None: all tasks share an ordered contract surface.',
        ),
      });

      expect(validate(change, 'tasks').status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects a placeholder explanation for no parallel work', () => {
    const { project, change } = createChange('thoth-placeholder-parallel-');
    try {
      writeFixture(change, {
        tasks: VALID_TASKS.replaceAll(' [P]', '').replace(
          VALID_PARALLEL_GROUP,
          '- None: [reason no tasks can safely overlap]',
        ),
      });

      const report = JSON.parse(validate(change, 'tasks').stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toContain(
        'SDD-TASK-PARALLEL',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects a no-parallel claim when tasks are marked parallel', () => {
    const { project, change } = createChange('thoth-conflicting-parallel-');
    try {
      writeFixture(change, {
        tasks: VALID_TASKS.replace(
          VALID_PARALLEL_GROUP,
          `${VALID_PARALLEL_GROUP}\n\n- None: all work is sequential.`,
        ),
      });

      const report = JSON.parse(validate(change, 'tasks').stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toContain(
        'SDD-TASK-PARALLEL',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'a non-sequential group ID',
      VALID_TASKS.replace('### Group P1', '### Group P2'),
      'SDD-TASK-LANE-GRAMMAR',
    ],
    [
      'a group with fewer than two lanes',
      VALID_TASKS.replace('- Lane L2: T003 | Owner: quick\n', ''),
      'SDD-TASK-LANE-GRAMMAR',
    ],
    [
      'an unknown lane member',
      VALID_TASKS.replace('Lane L2: T003', 'Lane L2: T999'),
      'SDD-TASK-LANE-MEMBERSHIP',
    ],
    [
      'a non-parallel lane member',
      VALID_TASKS.replace('T003 [P] [US1]', 'T003 [US1]'),
      'SDD-TASK-LANE-MEMBERSHIP',
    ],
    [
      'a parallel task omitted from every lane',
      VALID_TASKS.replace('Lane L1: T001 -> T002', 'Lane L1: T001'),
      'SDD-TASK-LANE-MEMBERSHIP',
    ],
    [
      'a task assigned to two lanes',
      VALID_TASKS.replace(
        'Lane L1: T001 -> T002',
        'Lane L1: T001 -> T002 -> T003',
      ),
      'SDD-TASK-LANE-MEMBERSHIP',
    ],
    [
      'an ineligible lane owner',
      VALID_TASKS.replace('Owner: quick', 'Owner: worker'),
      'SDD-TASK-LANE-OWNER',
    ],
    [
      'a missing lane owner',
      VALID_TASKS.replace(' | Owner: quick', ''),
      'SDD-TASK-LANE-OWNER',
    ],
    [
      'an unknown prerequisite',
      VALID_TASKS.replace('Prerequisites: None', 'Prerequisites: T999'),
      'SDD-TASK-LANE-PREREQUISITE',
    ],
    [
      'a prerequisite inside the group',
      VALID_TASKS.replace('Prerequisites: None', 'Prerequisites: T001'),
      'SDD-TASK-LANE-PREREQUISITE',
    ],
    [
      'a member task used as the barrier',
      VALID_TASKS.replace('Barrier: Final verification', 'Barrier: T002'),
      'SDD-TASK-LANE-BARRIER',
    ],
    [
      'a missing barrier',
      VALID_TASKS.replace('- Barrier: Final verification\n', ''),
      'SDD-TASK-LANE-BARRIER',
    ],
    [
      'a declared dependency across lanes',
      VALID_TASKS.replace('T001 -> T002.', 'T001 -> T002; T002 -> T003.'),
      'SDD-TASK-LANE-DEPENDENCY',
    ],
    [
      'overlapping paths across lanes',
      VALID_TASKS.replace(
        'Document FR-001 and SC-001 in `README.md`',
        'Document FR-001 and SC-001 in `src/example.test.ts`',
      ),
      'SDD-TASK-LANE-OVERLAP',
    ],
  ])('rejects canonical parallel metadata with %s', (_label, tasks, code) => {
    const { project, change } = createChange('thoth-unsafe-parallel-');
    try {
      writeFixture(change, { tasks });

      const report = JSON.parse(validate(change, 'tasks').stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map((error) => error.code)).toContain(code);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test.each([
    [
      'multiple description spans',
      VALID_TASKS.replace(
        'Document FR-001 and SC-001 in `README.md`',
        'Document `Example` for FR-001 and SC-001 in `README.md`',
      ),
    ],
    [
      'a path that escapes the repository',
      VALID_TASKS.replace('`README.md`', '`../README.md`'),
    ],
    [
      'a glob instead of a literal path',
      VALID_TASKS.replace('`README.md`', '`docs/*.md`'),
    ],
    [
      'the bundled path placeholder',
      VALID_TASKS.replace('`README.md`', '`[exact/path]`'),
    ],
    [
      'a home-relative path',
      VALID_TASKS.replace('`README.md`', '`~/README.md`'),
    ],
  ])('rejects a non-exact task path with %s', (_label, tasks) => {
    const { project, change } = createChange('thoth-invalid-task-path-');
    try {
      writeFixture(change, { tasks });

      const report = JSON.parse(validate(change, 'tasks').stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toContain(
        'SDD-TASK-FORMAT',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires unique sequential checklist IDs and non-empty revalidation', () => {
    const { project, change } = createChange('thoth-checklist-contract-');
    try {
      writeFixture(change, {
        checklist: VALID_CHECKLIST.replace(
          '- [x] CHK006 [Coverage] US1, FR-001, SC-001, and SC-002 were revalidated after planning.',
          '',
        ).replace('CHK005', 'CHK004'),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'SDD-CHECKLIST-UNIQUE',
          'SDD-CHECKLIST-SEQUENCE',
          'SDD-CHECKLIST-REVALIDATION',
        ]),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('accepts an evidence-backed no-op revalidation', () => {
    const { project, change } = createChange('thoth-checklist-noop-');
    try {
      writeFixture(change, {
        checklist: VALID_CHECKLIST.replace(
          '- [x] CHK006 [Coverage] US1, FR-001, SC-001, and SC-002 were revalidated after planning.',
          '- Not required: no requirement-affecting artifact changed after the initial validation.',
        ),
      });

      expect(validate(change, 'checklist').status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires an activation reason and explicit domain-lens decision', () => {
    const { project, change } = createChange('thoth-checklist-lenses-');
    try {
      writeFixture(change, {
        checklist: VALID_CHECKLIST.replace(
          '**Activation reason**: Contract risk warrants an explicit requirements audit.\n\n',
          '',
        ).replace(/## Domain lenses[\s\S]+?## Revalidation/, '## Revalidation'),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'SDD-CHECKLIST-ACTIVATION',
          'SDD-CHECKLIST-DOMAIN-LENSES',
        ]),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects placeholder checklist activation and exception evidence', () => {
    const { project, change } = createChange('thoth-checklist-placeholders-');
    try {
      writeFixture(change, {
        checklist: VALID_CHECKLIST.replace(
          'Contract risk warrants an explicit requirements audit.',
          '[activation reason]',
        )
          .replace(
            'no security, accessibility, compliance, or migration lens applies.',
            '[domain decision]',
          )
          .replace(
            '- [x] CHK006 [Coverage] US1, FR-001, SC-001, and SC-002 were revalidated after planning.',
            '- Not required: [revalidation evidence]',
          ),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'SDD-CHECKLIST-ACTIVATION',
          'SDD-CHECKLIST-DOMAIN-LENSES',
          'SDD-CHECKLIST-REVALIDATION',
        ]),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects contradictory domain-lens and revalidation decisions', () => {
    const { project, change } = createChange('thoth-checklist-conflicts-');
    try {
      writeFixture(change, {
        checklist: VALID_CHECKLIST.replace(
          '- None: no security, accessibility, compliance, or migration lens applies.',
          '- [x] CHK006 [Security] Authentication is explicitly out of scope.\n- None: no domain-specific lens applies.',
        )
          .replace('CHK006 [Coverage]', 'CHK007 [Coverage]')
          .replace(
            'were revalidated after planning.',
            'were revalidated after planning.\n- Not required: no artifacts changed.',
          ),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'SDD-CHECKLIST-DOMAIN-LENSES',
          'SDD-CHECKLIST-REVALIDATION',
        ]),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires evidence and matching principles in both Constitution checks', () => {
    const { project, change } = createChange('thoth-constitution-evidence-');
    try {
      writeFixture(change, {
        plan: VALID_PLAN.replace(
          '- **Simplicity**: PASS — The design uses one bounded public seam.',
          '- **Simplicity**: PASS',
        ).replace(
          '- **Simplicity**: PASS — The implementation keeps the same bounded seam.',
          '- **Assurance**: PASS — Oracle reviews the result.',
        ),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'SDD-PLAN-CONSTITUTION-EVIDENCE',
          'SDD-PLAN-CONSTITUTION-COVERAGE',
        ]),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects placeholder Constitution evidence', () => {
    const { project, change } = createChange(
      'thoth-constitution-placeholders-',
    );
    try {
      writeFixture(change, {
        plan: VALID_PLAN.replaceAll(
          /The (?:design uses one bounded public seam|implementation keeps the same bounded seam)\./g,
          '[evidence]',
        ),
      });

      const report = JSON.parse(validate(change).stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(report.errors.map(({ code }) => code)).toContain(
        'SDD-PLAN-CONSTITUTION-EVIDENCE',
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires the project Constitution before planning', () => {
    const { project, change } = createChange('thoth-missing-constitution-');
    try {
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);
      writeFileSync(join(change, 'plan.md'), VALID_PLAN);
      rmSync(join(project, 'openspec', 'memory', 'constitution.md'));

      const report = JSON.parse(validate(change, 'plan').stdout) as {
        errors: Array<{ code: string; artifact: string }>;
      };
      expect(report.errors).toContainEqual(
        expect.objectContaining({
          code: 'SDD-ARTIFACT-MISSING',
          artifact: 'memory/constitution.md',
        }),
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('requires a plan and completed items at the checklist gate', () => {
    const { project, change } = createChange('thoth-checklist-gate-');
    try {
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);
      mkdirSync(join(change, 'checklists'), { recursive: true });
      writeFileSync(
        join(change, 'checklists', 'requirements.md'),
        VALID_CHECKLIST.replace('- [x] CHK006', '- [ ] CHK006'),
      );

      const missingPlan = JSON.parse(validate(change, 'checklist').stdout) as {
        errors: Array<{ code: string; artifact: string }>;
      };
      expect(missingPlan.errors).toContainEqual(
        expect.objectContaining({ artifact: 'plan.md' }),
      );

      writeFileSync(join(change, 'plan.md'), VALID_PLAN);
      const incomplete = JSON.parse(validate(change, 'checklist').stdout) as {
        errors: Array<{ code: string }>;
      };
      expect(incomplete.errors.map(({ code }) => code)).toContain(
        'SDD-CHECKLIST-INCOMPLETE',
      );

      writeFileSync(
        join(change, 'checklists', 'requirements.md'),
        VALID_CHECKLIST,
      );
      expect(validate(change, 'checklist').status).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
