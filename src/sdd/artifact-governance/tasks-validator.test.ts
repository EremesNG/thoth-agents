import { describe, expect, test } from 'bun:test';
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass

## Phase 2: Follow-up
- [x] 2.1 Wire report output
  **Verification**:
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Follow-up assertions pass`),
      path: 'openspec/changes/example/tasks.md',
    });

    expect(result.validator).toBe('tasks-validator');
    expect(result.artifact).toBe('tasks.md');
    expect(result.valid).toBe(true);
    expect(result.summary.errorCount).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  test('reports missing task states', () => {
    const result = validateTasksArtifact({
      mode: 'openspec',
      content: createPlan(`## Phase 1: Foundation
- [] 1.1 Add validator contract
  **Verification**:
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\``),
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Prompt assertions pass`);
    const authoritativePlan = createPlan(`## Phase 1: Stored Copy
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Prompt assertions pass`);
    const authoritativePlan = createPlan(`## Phase 1: Stored Copy
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
  - Run: \`bun test src/sdd/artifact-governance/tasks-validator.test.ts\`
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
