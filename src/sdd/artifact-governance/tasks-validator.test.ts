import { describe, expect, test } from 'vitest';
import { validateTasksArtifact } from './index';

function createPlan(body: string): string {
  return `# Tasks: Sample Change
${body}`;
}

describe('validateTasksArtifact', () => {
  test('accepts a valid tasks plan with recognized phases and verification blocks', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 1: Foundation
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass

## Phase 2: Follow-up
- [x] 2.1 Wire report output
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Follow-up assertions pass`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.validator).toBe('tasks-validator');
    expect(result.artifact).toBe('tasks.md');
    expect(result.valid).toBe(true);
    expect(result.summary.errorCount).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  test('accepts a [P] parallel marker placed after the task number', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 2: Parallel Work
- [ ] 2.1 [P] Integrate with API
  **Verification**:
  - Run: \`pnpm run lint\`
  - Expected: No linting errors`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.valid).toBe(true);
    expect(
      result.findings.some(
        (finding) => finding.code === 'tasks.malformed-numbering',
      ),
    ).toBe(false);
  });

  test('accepts canonical annotation markers without findings', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 2: Core Implementation
- [ ] 2.1 [P] Implement core logic — \`src/core/handler.ts\`
  **[USN-2]** | Priority: P1
  **Spec:** \`core-domain/Core Logic\`
  **Independent Test:** Run the handler tests; they pass against the impl.
  **Verification**:
  - Run: \`pnpm test -- -t "core handler"\`
  - Expected: All handler tests pass`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.valid).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  test('accepts the canonical sdd-tasks SKILL.md example annotations', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 1: Foundation
- [ ] 1.1 Set up project structure — \`src/config/\`
  **[USN-1]** | Priority: P1
  **Spec:** \`config-domain/Project Structure\`
  **Independent Test:** Inspect \`src/config/\` exists and typechecks in isolation.
  **Verification**:
  - Run: \`pnpm run typecheck\`
  - Expected: No TypeScript errors in config files

## Phase 3: Integration
- [ ] 3.1 [P] Integrate with API — \`src/api/client.ts\`
  **[USN-3]** | Priority: P2
  **Spec:** \`api-domain/Client Integration\`
  **Independent Test:** Run the API client lint in isolation.
  **Verification**:
  - Run: \`pnpm run lint src/api/\`
  - Expected: No linting errors in API module`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.valid).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  test('warns on a lowercase parallel marker in the canonical slot', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 2: Parallel Work
- [ ] 2.1 [p] Integrate with API
  **Verification**:
  - Run: \`pnpm run lint\`
  - Expected: No linting errors`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.valid).toBe(true);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.malformed-parallel-marker',
        severity: 'warning',
        line: 3,
      }),
    );
  });

  test('does not flag a bracketed token inside the task title', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 2: Parallel Work
- [ ] 2.1 Document the [p] placeholder syntax
  **Verification**:
  - Run: \`pnpm run lint\`
  - Expected: No linting errors`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.valid).toBe(true);
    expect(
      result.findings.some(
        (finding) => finding.code === 'tasks.malformed-parallel-marker',
      ),
    ).toBe(false);
  });

  test('warns on a malformed USN marker', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 1: Foundation
- [ ] 1.1 Add validator contract
  **[USN-two]** | Priority: P1
  **Verification**:
  - Run: \`pnpm test\`
  - Expected: Validator assertions pass`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.valid).toBe(true);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.malformed-usn-marker',
        severity: 'warning',
        line: 3,
      }),
    );
  });

  test('warns on a malformed Priority marker', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 1: Foundation
- [ ] 1.1 Add validator contract
  **[USN-1]** | Priority: high
  **Verification**:
  - Run: \`pnpm test\`
  - Expected: Validator assertions pass`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.valid).toBe(true);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.malformed-priority-marker',
        severity: 'warning',
        line: 3,
      }),
    );
  });

  test('reports missing task states', () => {
    const result = validateTasksArtifact({
      mode: 'openspec',
      content: createPlan(`## Phase 1: Foundation
- [] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass`),
    });

    expect(result.valid).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.missing-state',
        severity: 'error',
        line: 3,
      }),
    );
  });

  test('reports malformed numbered checklist items', () => {
    const result = validateTasksArtifact({
      mode: 'none',
      content: createPlan(`## Phase 1: Foundation
- [ ] one Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass`),
    });

    expect(result.valid).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.malformed-numbering',
        severity: 'error',
        line: 3,
      }),
    );
  });

  test('reports incomplete verification blocks', () => {
    const result = validateTasksArtifact({
      mode: 'thoth-mem',
      content: createPlan(`## Phase 1: Foundation
- [~] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\``),
    });

    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'tasks.missing-verification-expected',
          severity: 'error',
          line: 3,
        }),
      ]),
    );
  });

  test('reports unrecoverable persistence source gaps as errors without enabling blocking', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 1: Foundation
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass`),
      persistence: {
        comparison: {
          status: 'single-source',
          sourceOfTruth: null,
          recoverable: false,
          missingSources: ['thoth-mem', 'openspec'],
          metadata: {
            comparedSources: [],
          },
        },
        sources: {
          prompt: null,
          thothMem: null,
          openspec: null,
        },
      },
    } as Parameters<typeof validateTasksArtifact>[0]);

    expect(result.valid).toBe(false);
    expect(result.shouldBlock).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.persistence-source-gap',
        severity: 'error',
      }),
    );
  });

  test('keeps repairable hybrid divergence warning-first', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 1: Foundation
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass`),
      persistence: {
        comparison: {
          status: 'diverged',
          sourceOfTruth: 'thoth-mem',
          recoverable: true,
          missingSources: [],
          metadata: {
            comparedSources: ['thoth-mem', 'openspec'],
            matched: false,
          },
        },
        sources: {
          prompt: null,
          thothMem: { source: 'thoth-mem', content: 'task copy a' },
          openspec: { source: 'openspec', content: 'task copy b' },
        },
      },
    } as Parameters<typeof validateTasksArtifact>[0]);

    expect(result.valid).toBe(true);
    expect(result.summary.warningCount).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.persistence-hybrid-divergence',
        severity: 'warning',
      }),
    );
  });

  test('keeps repairable single-source persistence gaps warning-first', () => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: createPlan(`## Phase 1: Foundation
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass`),
      persistence: {
        comparison: {
          status: 'single-source',
          sourceOfTruth: 'openspec',
          recoverable: true,
          missingSources: ['thoth-mem'],
          metadata: {
            comparedSources: ['openspec'],
          },
        },
        sources: {
          prompt: null,
          thothMem: null,
          openspec: { source: 'openspec', content: 'task copy b' },
        },
      },
    } as Parameters<typeof validateTasksArtifact>[0]);

    expect(result.valid).toBe(true);
    expect(result.summary.warningCount).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.persistence-repairable-source-gap',
        severity: 'warning',
      }),
    );
  });

  test('warns when the validated content drifts from the authoritative persistence source', () => {
    const promptPlan = createPlan(`## Phase 1: Prompt Copy
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Prompt assertions pass`);
    const authoritativePlan = createPlan(`## Phase 1: Stored Copy
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Stored assertions pass`);

    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: promptPlan,
      persistence: {
        comparison: {
          status: 'match',
          sourceOfTruth: 'thoth-mem',
          recoverable: false,
          missingSources: [],
          metadata: {
            comparedSources: ['thoth-mem', 'openspec'],
            matched: true,
          },
        },
        sources: {
          prompt: { source: 'prompt', content: promptPlan },
          thothMem: { source: 'thoth-mem', content: authoritativePlan },
          openspec: { source: 'openspec', content: authoritativePlan },
        },
      },
    } as Parameters<typeof validateTasksArtifact>[0]);

    expect(result.valid).toBe(true);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.persistence-contract-drift',
        severity: 'warning',
      }),
    );
  });

  test('reports authoritative-source drift as info when validating the canonical snapshot', () => {
    const promptPlan = createPlan(`## Phase 1: Prompt Copy
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Prompt assertions pass`);
    const authoritativePlan = createPlan(`## Phase 1: Stored Copy
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Stored assertions pass`);

    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: authoritativePlan,
      persistence: {
        comparison: {
          status: 'match',
          sourceOfTruth: 'thoth-mem',
          recoverable: false,
          missingSources: [],
          metadata: {
            comparedSources: ['thoth-mem', 'openspec'],
            matched: true,
          },
        },
        sources: {
          prompt: { source: 'prompt', content: promptPlan },
          thothMem: { source: 'thoth-mem', content: authoritativePlan },
          openspec: { source: 'openspec', content: authoritativePlan },
        },
      },
    } as Parameters<typeof validateTasksArtifact>[0]);

    expect(result.valid).toBe(true);
    expect(result.summary.infoCount).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.persistence-contract-drift',
        severity: 'info',
      }),
    );
  });

  test('reports invalid task states as execution contract errors', () => {
    const result = validateTasksArtifact({
      mode: 'openspec',
      content: createPlan(`## Phase 1: Foundation
- [pending] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass`),
    });

    expect(result.valid).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'tasks.invalid-state',
        severity: 'error',
        line: 3,
      }),
    );
  });
});
