import { describe, expect, test } from 'vitest';
import {
  CODEX_PROMPT_DIALECT,
  OPENCODE_PROMPT_DIALECT,
} from '../../agents/prompt-dialects';
import { getAgentPackContract, getAgentRole } from './agent-pack';
import {
  getMemoryGovernanceContract,
  getRoleMemoryGovernance,
  memoryGovernanceDiagnostics,
  renderMemoryGovernanceInstructions,
} from './memory-governance';

const PROVIDER_OPERATION_PATTERN =
  /mem_(?:save|recall|get|context|project|session)\s*\(/;

describe('memory governance contract', () => {
  test('exposes only the provider-neutral orchestration outcomes owned by thoth-agents', () => {
    const contract = getMemoryGovernanceContract(getAgentPackContract().roles);

    expect(contract).toEqual(
      expect.objectContaining({
        providerOwnership: 'external',
        protectedTopicNamespaces: ['sdd/*'],
        canonicalTopicKey: 'sdd/{change}/{artifact}',
        requiresParentAuthorization: true,
        handoffOutcome: 'authorized-context-available',
        completionOutcome: 'resumable-summary-or-checkpoint',
        prohibitsFalseSuccess: true,
        prohibitsConsumerFallback: true,
      }),
    );
    expect(JSON.stringify(contract)).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)|recallChain|allowedTools|forbiddenTools|rootOwnedOperations/i,
    );
  });

  test('renders authorization, continuity, and capability gaps without provider protocol sequencing', () => {
    const prompt = renderMemoryGovernanceInstructions(getAgentRole('deep'));

    expect(prompt).toContain('installed provider guidance');
    expect(prompt).toContain('parent-scoped authorization');
    expect(prompt).toContain(
      'accepted scope, decisions, permissions, and artifacts',
    );
    expect(prompt).toContain('resumable summary or checkpoint outcome');
    expect(prompt).toContain('degraded or unsupported');
    expect(prompt).toContain('sdd/{change}/{artifact}');
    expect(prompt).not.toMatch(PROVIDER_OPERATION_PATTERN);
    expect(prompt).not.toMatch(
      /consumer-owned fallback|permanent closure|end-session|finalization/i,
    );
  });

  test('keeps role permissions intact while delegated provider use requires parent authorization', () => {
    const explorer = getRoleMemoryGovernance(getAgentRole('explorer'));
    const deep = getRoleMemoryGovernance(getAgentRole('deep'));

    expect(explorer.role).toBe('explorer');
    expect(explorer.requiresParentContext).toBe(true);
    expect(explorer.mayWriteDurableObservations).toBe(false);
    expect(deep.role).toBe('deep');
    expect(deep.requiresParentContext).toBe(true);
    expect(deep.mayWriteDurableObservations).toBe(true);
    expect(explorer.rules.join('\n')).toContain('parent-scoped authorization');
    expect(deep.rules.join('\n')).toContain('authorized context');
    expect([...explorer.rules, ...deep.rules].join('\n')).not.toMatch(
      PROVIDER_OPERATION_PATTERN,
    );
  });

  test('renders the same neutral outcomes through harness-specific wording', () => {
    const openCode = renderMemoryGovernanceInstructions(
      getAgentRole('quick'),
      OPENCODE_PROMPT_DIALECT,
    );
    const codex = renderMemoryGovernanceInstructions(
      getAgentRole('quick'),
      CODEX_PROMPT_DIALECT,
    );

    for (const prompt of [openCode, codex]) {
      expect(prompt).toContain('parent-scoped authorization');
      expect(prompt).toContain('resumable summary or checkpoint outcome');
      expect(prompt).toContain('sdd/{change}/{artifact}');
      expect(prompt).not.toMatch(PROVIDER_OPERATION_PATTERN);
    }

    expect(openCode).toContain('`question`');
    expect(openCode).toContain('todowrite');
    expect(openCode).toContain('@orchestrator');
    expect(codex).toContain('`request_user_input`');
    expect(codex).toContain('functions.update_plan');
    expect(codex).toContain('orchestrator role agent');
    expect(codex).not.toContain('`question`');
    expect(codex).not.toContain('todowrite');
  });

  test('reports enforcement gaps explicitly without treating prose as runtime support', () => {
    const diagnostics = memoryGovernanceDiagnostics({
      harness: 'codex',
      permissionControls: 'instruction-only',
      parentContextInjection: 'unknown',
      memoryWriteControls: 'instruction-only',
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex.permission.memory.enforcement_gap',
          fallback: 'instruction-only',
        }),
        expect.objectContaining({
          code: 'codex.context.parent_injection.unvalidated',
          fallback: 'instruction-only',
        }),
        expect.objectContaining({
          code: 'codex.permission.memory_write.enforcement_gap',
          fallback: 'instruction-only',
        }),
      ]),
    );
    expect(diagnostics.every((diagnostic) => diagnostic.message)).toBe(true);
    expect(diagnostics.map((item) => item.message).join('\n')).toContain(
      'degraded or unsupported',
    );
  });
});
