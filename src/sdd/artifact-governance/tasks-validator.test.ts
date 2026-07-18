import { describe, expect, test } from 'vitest';
import { validateTasksArtifact } from './index';

function createPlan(body: string): string {
  return `# Tasks: Sample Change
${body}`;
}

const validPlan = createPlan(`## Phase 1: Foundation
- [ ] 1.1 Add validator contract
  **Verification**:
  - Run: \`pnpm test -- src/sdd/artifact-governance/tasks-validator.test.ts\`
  - Expected: Validator assertions pass`);

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

  test.each([
    {
      name: 'OpenSpec-only',
      comparison: {
        outcome: 'partial',
        inspectableSource: 'openspec',
        providerState: 'unsupported',
        missingSources: ['thoth-mem'],
        metadata: { comparedSources: ['openspec'] },
      },
      sources: {
        prompt: null,
        thothMem: null,
        openspec: { source: 'openspec', content: validPlan },
      },
      code: 'persistence.hybrid-partial',
    },
    {
      name: 'provider-only',
      comparison: {
        outcome: 'partial',
        inspectableSource: 'thoth-mem',
        providerState: 'supported',
        missingSources: ['openspec'],
        metadata: { comparedSources: ['thoth-mem'] },
      },
      sources: {
        prompt: null,
        thothMem: { source: 'thoth-mem', content: validPlan },
        openspec: null,
      },
      code: 'persistence.hybrid-partial',
    },
    {
      name: 'unavailable',
      comparison: {
        outcome: 'unavailable',
        inspectableSource: null,
        providerState: 'unsupported',
        missingSources: ['thoth-mem', 'openspec'],
        metadata: { comparedSources: [] },
      },
      sources: { prompt: null, thothMem: null, openspec: null },
      code: 'persistence.source-unavailable',
    },
    {
      name: 'diverged',
      comparison: {
        outcome: 'diverged',
        inspectableSource: null,
        providerState: 'supported',
        missingSources: [],
        metadata: { comparedSources: ['thoth-mem', 'openspec'] },
      },
      sources: {
        prompt: null,
        thothMem: { source: 'thoth-mem', content: validPlan },
        openspec: {
          source: 'openspec',
          content: `${validPlan}\n<!-- drift -->`,
        },
      },
      code: 'persistence.hybrid-diverged',
    },
  ])('reports $name hybrid persistence with canonical metadata and no repair semantics', ({
    comparison,
    sources,
    code,
  }) => {
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: validPlan,
      persistence: { comparison, sources },
    } as Parameters<typeof validateTasksArtifact>[0]);

    expect(result.mode).toBe('hybrid');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code,
        metadata: expect.objectContaining({
          outcome: comparison.outcome,
          inspectableSource: comparison.inspectableSource,
          providerState: comparison.providerState,
          missingSources: comparison.missingSources.join(','),
        }),
      }),
    );
    expect(result.findings.map((finding) => finding.code)).not.toEqual(
      expect.arrayContaining([
        'tasks.persistence-repairable-source-gap',
        'tasks.persistence-hybrid-divergence',
      ]),
    );
    expect(JSON.stringify(result.findings)).not.toMatch(
      /recoverable|fallback|repair/i,
    );
  });

  test('treats a matching hybrid as complete without honoring deprecated authority metadata', () => {
    const comparison = {
      outcome: 'complete',
      inspectableSource: 'openspec',
      providerState: 'supported',
      missingSources: [],
      metadata: { comparedSources: ['thoth-mem', 'openspec'] },
    } as const;
    const result = validateTasksArtifact({
      mode: 'hybrid',
      content: validPlan,
      persistence: {
        comparison: {
          ...comparison,
          // Adversarial legacy metadata must not replace the outcome contract.
          sourceOfTruth: null,
        },
        sources: {
          prompt: null,
          thothMem: { source: 'thoth-mem', content: validPlan },
          openspec: { source: 'openspec', content: validPlan },
        },
      },
    } as Parameters<typeof validateTasksArtifact>[0]);

    expect(result.mode).toBe('hybrid');
    expect(result.valid).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(comparison).not.toHaveProperty('recoverable');
    expect(comparison).not.toHaveProperty('sourceOfTruth');
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
