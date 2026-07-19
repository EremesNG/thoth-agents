import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const VALID_SPEC = `# Feature Specification: Example

## User stories

### US1 - Deliver example (Priority: P1)

As a user, I can use the example.

**Independent test**: Exercise the public example in isolation.

**Acceptance scenarios**:

1. **Given** a valid input, **When** the action runs, **Then** the result is visible.

## Functional requirements

- **FR-001**: The system MUST expose the example.

## Success criteria

- **SC-001**: Focused checks pass.

## Assumptions

- The runtime is installed.

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

const VALID_TASKS = `# Tasks: Example

## MVP scope

US1 is the independently testable MVP.

## Dependencies

T001 -> T002.

- [ ] T001 [US1] Cover FR-001 and SC-001 with a failing example test in \`src/example.test.ts\` | Verify: the focused test fails for the expected missing behavior
- [ ] T002 [US1] Implement FR-001 and SC-001 in \`src/example.ts\` | Verify: the focused test passes and reports the observable result
- [ ] T003 [P] [US1] Document FR-001 and SC-001 in \`README.md\` | Verify: the documented example matches the tested public behavior

## Parallel execution examples

T003 may run with T001 because the files do not overlap.
`;

const VALID_CHECKLIST = `# Requirements checklist

## Initial validation

- [x] CHK001 [Completeness] FR-001 has an acceptance scenario.
- [x] CHK002 [Clarity] FR-001 has one observable interpretation.
- [x] CHK003 [Consistency] SC-001 aligns with US1.
- [x] CHK004 [Measurability] SC-001 is measurable.
- [x] CHK005 [Coverage] US1 maps to FR-001 and SC-001.

## Revalidation

- [x] CHK006 [Coverage] US1, FR-001, and SC-001 were revalidated after planning.
`;

const VALID_CONSTITUTION = `# Project Constitution

## Principles

### 1. Simplicity

Use one bounded public seam.
`;

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

function validate(changeRoot: string, through = 'final') {
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
  test('validates only the artifacts required through the current gate', () => {
    const { project, change } = createChange('thoth-progressive-sdd-');
    try {
      writeFileSync(join(change, 'spec.md'), VALID_SPEC);
      expect(validate(change, 'specify').status).toBe(0);

      writeFileSync(join(change, 'plan.md'), VALID_PLAN);
      expect(validate(change, 'plan').status).toBe(0);

      writeFileSync(join(change, 'tasks.md'), VALID_TASKS);
      expect(validate(change, 'tasks').status).toBe(0);

      const missingTasks = validate(change, 'final');
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
        'SDD-CHECKLIST-TAXONOMY',
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
          '\n## Functional requirements',
          `${secondStory}\n## Functional requirements`,
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

  test('requires unique sequential checklist IDs and non-empty revalidation', () => {
    const { project, change } = createChange('thoth-checklist-contract-');
    try {
      writeFixture(change, {
        checklist: VALID_CHECKLIST.replace(
          '- [x] CHK006 [Coverage] US1, FR-001, and SC-001 were revalidated after planning.',
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
