import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { renderClaudeCodeRootInstructions } from '../src/harness/adapters/claude-code';
import { renderCodexRootInstructions } from '../src/harness/adapters/codex';
import { renderOpenCodeAgentConfigs } from '../src/harness/adapters/opencode';
import { renderPiRootInstructions } from '../src/harness/adapters/pi';
import {
  getAgentRole,
  ORCHESTRATION_POLICY,
  VERIFICATION_PROTOCOL,
} from '../src/harness/core/agent-pack';
import {
  getRoleMemoryGovernance,
  renderMemoryGovernanceInstructions,
} from '../src/harness/core/memory-governance';
import {
  classifySddChange,
  getSddFinalVerificationDecision,
  getSddWorkflowContract,
  SDD_PHASE_PROTOCOLS,
} from '../src/harness/core/sdd';
import { contractCaseFileSchema } from './contracts-schema';

const raw: unknown = JSON.parse(
  readFileSync(new URL('./contracts.json', import.meta.url), 'utf8'),
);
const fixture = contractCaseFileSchema.parse(raw);

// Same root rendering seams as agent-routing.test.ts, with Pi added here only.
const roots = {
  opencode: String(renderOpenCodeAgentConfigs().orchestrator?.prompt ?? ''),
  codex: renderCodexRootInstructions(),
  claude: renderClaudeCodeRootInstructions(),
  pi: renderPiRootInstructions(),
};
const productText = {
  workflow: JSON.stringify(getSddWorkflowContract()),
  phases: JSON.stringify(SDD_PHASE_PROTOCOLS),
  orchestration: JSON.stringify(ORCHESTRATION_POLICY),
  verification: VERIFICATION_PROTOCOL.join('\n'),
};

describe('versioned behavioral contracts', () => {
  test('validates cases and rejects invalid versions, duplicate ids and malformed expectations', () => {
    expect(contractCaseFileSchema.safeParse(raw).success).toBe(true);
    expect(
      contractCaseFileSchema.safeParse({ ...fixture, version: 99 }).success,
    ).toBe(false);
    expect(
      contractCaseFileSchema.safeParse({
        ...fixture,
        cases: [...fixture.cases, fixture.cases[0]],
      }).success,
    ).toBe(false);
    expect(
      contractCaseFileSchema.safeParse({
        ...fixture,
        cases: [
          {
            ...fixture.cases[0],
            live: { prompt: '', expectations: ['unknown'] },
          },
        ],
      }).success,
    ).toBe(false);
    for (const invalidCase of [
      { ...fixture.cases[0], contract: 'unknown' },
      { ...fixture.cases[0], rootPatterns: [] },
      { ...fixture.cases[0], rootPatterns: ['['] },
      {
        ...fixture.cases.find(
          (item) => item.contract === 'independent-verification',
        ),
        expected: {
          verificationRequired: true,
          independent: true,
          owner: 'worker',
        },
      },
    ]) {
      expect(
        contractCaseFileSchema.safeParse({ version: 1, cases: [invalidCase] })
          .success,
      ).toBe(false);
    }
    expect(
      contractCaseFileSchema.safeParse({
        version: 1,
        cases: [
          {
            ...fixture.cases[0],
            live: {
              prompt: 'Implement this bounded change.',
              expectations: [
                'positive-progress',
                'separate-implementation-authorization',
              ],
            },
          },
        ],
      }).success,
    ).toBe(true);
    for (const contract of [
      'plan-authorization',
      'independent-verification',
      'delegated-memory',
      'small-proportionality',
    ]) {
      for (const polarity of ['positive', 'negative']) {
        expect(
          fixture.cases.some(
            (item) => item.contract === contract && item.polarity === polarity,
          ),
          `${contract}:${polarity}`,
        ).toBe(true);
      }
    }
  });

  test.each(fixture.cases)('$id: $scenario', (item) => {
    const sources = {
      ...productText,
      memory:
        item.contract === 'delegated-memory'
          ? getRoleMemoryGovernance(getAgentRole(item.input.role)).rules.join(
              '\n',
            )
          : '',
    };
    switch (item.contract) {
      case 'plan-authorization':
        break; // Authorization is a prose contract, not an exported runtime gate.
      case 'independent-verification':
        expect(getSddFinalVerificationDecision(item.input)).toEqual(
          item.expected,
        );
        break;
      case 'delegated-memory': {
        const role = getAgentRole(item.input.role);
        expect(getRoleMemoryGovernance(role)).toMatchObject(item.expected);
        for (const pattern of item.memoryPatterns) {
          expect(renderMemoryGovernanceInstructions(role)).toMatch(
            new RegExp(pattern, 'is'),
          );
        }
        break;
      }
      case 'small-proportionality':
        expect(classifySddChange(item.input)).toMatchObject(item.expected);
        break;
    }
    for (const assertion of item.productPatterns) {
      expect(
        sources[assertion.source],
        `${item.id}:${assertion.source}`,
      ).toMatch(new RegExp(assertion.pattern, 'is'));
    }
    for (const [harness, root] of Object.entries(roots)) {
      for (const pattern of item.rootPatterns) {
        expect(root, `${item.id}:${harness}`).toMatch(
          new RegExp(pattern, 'is'),
        );
      }
    }
  });
});
