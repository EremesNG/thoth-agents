import { describe, expect, test } from 'vitest';
import {
  CODEX_PROMPT_DIALECT,
  OPENCODE_PROMPT_DIALECT,
} from '../../agents/prompt-dialects';
import { getAgentPackContract, getAgentRole } from './agent-pack';
import {
  ALL_MEMORY_TOOLS,
  getMemoryGovernanceContract,
  getRoleMemoryGovernance,
  memoryGovernanceDiagnostics,
  PARENT_SCOPED_READ_TOOLS,
  READ_RECALL_CHAIN,
  renderMemoryGovernanceInstructions,
  ROOT_OWNED_OPERATIONS,
  WRITE_CAPABLE_DELEGATED_TOOLS,
} from './memory-governance';

describe('memory governance contract', () => {
  test('defines a role-by-role memory permission matrix', () => {
    const contract = getMemoryGovernanceContract(getAgentPackContract().roles);

    expect(ALL_MEMORY_TOOLS).toEqual([
      'mem_save',
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_session',
    ]);
    expect(contract.rootOwnedOperations).toEqual(ROOT_OWNED_OPERATIONS);
    expect(contract.rootOwnedOperations).toEqual([
      { tool: 'mem_session', action: 'start' },
      { tool: 'mem_session', action: 'checkpoint' },
      { tool: 'mem_session', action: 'summary' },
      { tool: 'mem_save', kind: 'prompt' },
      { tool: 'mem_save', kind: 'session_summary' },
    ]);
    expect(contract.readRecallChain).toEqual(READ_RECALL_CHAIN);
    expect(contract.readRecallChain).toEqual([
      { tool: 'mem_recall', mode: 'compact' },
      { tool: 'mem_recall', mode: 'context' },
      { tool: 'mem_get' },
    ]);
    expect(contract.writeCapableDelegatedTools).toEqual(
      WRITE_CAPABLE_DELEGATED_TOOLS,
    );
    expect(contract.protectedTopicNamespaces).toEqual(['sdd/*']);
    expect(contract.roles.map((role) => role.role)).toEqual([
      'orchestrator',
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]);
  });

  test('keeps root-owned operations with the orchestrator while splitting callable tools by role', () => {
    const orchestrator = getRoleMemoryGovernance(getAgentRole('orchestrator'));
    const explorer = getRoleMemoryGovernance(getAgentRole('explorer'));
    const quick = getRoleMemoryGovernance(getAgentRole('quick'));

    expect(orchestrator.allowedTools).toEqual(ALL_MEMORY_TOOLS);
    expect(orchestrator.rootOwnedOperations).toEqual(ROOT_OWNED_OPERATIONS);
    expect(explorer.allowedTools).toEqual(PARENT_SCOPED_READ_TOOLS);
    expect(explorer.forbiddenTools).toEqual(['mem_save', 'mem_session']);
    expect(quick.allowedTools).toEqual(WRITE_CAPABLE_DELEGATED_TOOLS);
    expect(quick.forbiddenTools).toEqual(['mem_session']);
    expect(orchestrator.rules.join('\n')).toContain(
      'mem_session(action="start"|"checkpoint"|"summary"), mem_save(kind="prompt"), and mem_save(kind="session_summary") are root/main orchestrator-owned operations',
    );
    expect(orchestrator.rules.join('\n')).toContain(
      'initial/root agent when the harness does not expose an orchestrator-named agent',
    );
    expect(orchestrator.rules.join('\n')).toContain(
      'save or refresh the handoff body with root-owned mem_session(action="summary") or mem_save(kind="session_summary")',
    );
    expect(orchestrator.rules.join('\n')).toContain(
      'not the handoff body, raw transcripts, or generated subagent prompts',
    );
  });

  test('separates read-only recall from delegated write-capable memory saves', () => {
    const explorer = getRoleMemoryGovernance(getAgentRole('explorer'));
    const deep = getRoleMemoryGovernance(getAgentRole('deep'));

    expect(explorer.requiresParentContext).toBe(true);
    expect(explorer.allowedTools).toEqual([
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
    ]);
    expect(explorer.mayWriteDurableObservations).toBe(false);

    expect(deep.requiresParentContext).toBe(true);
    expect(deep.allowedTools).toEqual([
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_save',
    ]);
    expect(deep.mayWriteDurableObservations).toBe(true);
  });

  test('renders parent context and protected SDD namespace instructions', () => {
    const prompt = renderMemoryGovernanceInstructions(getAgentRole('deep'));

    expect(prompt).toContain('parent session_id and project');
    expect(prompt).toContain(
      'Delegated handoff recovery uses the parent-scoped recall funnel: mem_recall(mode="compact") -> mem_recall(mode="context") -> mem_get(...)',
    );
    expect(prompt).toContain('missing, stale, contradictory, or insufficient');
    expect(prompt).toContain(
      'Never own mem_session(action="start"|"checkpoint"|"summary") or mem_save(kind="prompt"|"session_summary")',
    );
    expect(prompt).toContain('Never save generated subagent prompts');
    expect(prompt).toContain('Protect the sdd/* topic namespace');
    expect(prompt).toContain(
      'mem_save(kind="observation") is allowed only for delegated durable observations or assigned deterministic SDD artifacts/apply-progress',
    );
    expect(prompt).toContain('Project-scoped read tools require explicit');
    expect(prompt).toContain('mem_context(recall_query=...)');
    expect(prompt).toContain('mem_project(action="graph"|"topics"|"topic")');
  });

  test('renders neutral governance through harness-specific wording without weakening root ownership', () => {
    const openCode = renderMemoryGovernanceInstructions(
      getAgentRole('quick'),
      OPENCODE_PROMPT_DIALECT,
    );
    const codex = renderMemoryGovernanceInstructions(
      getAgentRole('quick'),
      CODEX_PROMPT_DIALECT,
    );

    for (const prompt of [openCode, codex]) {
      expect(prompt).toContain('parent session_id and project');
      expect(prompt).toContain(
        'Never own mem_session(action="start"|"checkpoint"|"summary") or mem_save(kind="prompt"|"session_summary")',
      );
      expect(prompt).toContain(
        'mem_save(kind="observation") is allowed only for delegated durable observations or assigned deterministic SDD artifacts/apply-progress',
      );
      expect(prompt).toContain('Protect the sdd/* topic namespace');
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

  test('reports governance gaps without treating instruction text as runtime enforcement', () => {
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
    expect(
      diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    ).toContain('root-owned memory operations');
    expect(
      diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    ).toContain('handoff recovery instructions');
    expect(
      diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    ).toContain('deterministic SDD artifacts only');
  });
});
