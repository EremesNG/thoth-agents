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

describe('memory governance contract', () => {
  test('defines a role-by-role memory permission matrix', () => {
    const contract = getMemoryGovernanceContract(getAgentPackContract().roles);

    expect(contract.rootOwnedTools).toEqual([
      'mem_session_start',
      'mem_session_summary',
      'mem_save_prompt',
    ]);
    expect(contract.readRecallChain).toEqual([
      'mem_search',
      'mem_timeline',
      'mem_get_observation',
    ]);
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

  test('keeps root-only tools owned by the orchestrator', () => {
    const orchestrator = getRoleMemoryGovernance(getAgentRole('orchestrator'));
    const explorer = getRoleMemoryGovernance(getAgentRole('explorer'));
    const quick = getRoleMemoryGovernance(getAgentRole('quick'));

    expect(orchestrator.allowedTools).toEqual(
      expect.arrayContaining([
        'mem_session_start',
        'mem_session_summary',
        'mem_save_prompt',
      ]),
    );
    expect(explorer.forbiddenTools).toEqual(
      expect.arrayContaining([
        'mem_session_start',
        'mem_session_summary',
        'mem_save_prompt',
        'mem_save',
      ]),
    );
    expect(quick.forbiddenTools).toEqual(
      expect.arrayContaining([
        'mem_session_start',
        'mem_session_summary',
        'mem_save_prompt',
      ]),
    );
    expect(orchestrator.rules.join('\n')).toContain(
      'root/main orchestrator-owned',
    );
    expect(orchestrator.rules.join('\n')).toContain(
      'initial/root agent when the harness does not expose an orchestrator-named agent',
    );
    expect(orchestrator.rules.join('\n')).toContain(
      'save or refresh the handoff body with root-owned mem_session_summary',
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
      'mem_search',
      'mem_timeline',
      'mem_get_observation',
      'mem_context',
      'mem_project_summary',
      'mem_project_graph',
      'mem_topic_keys',
    ]);
    expect(explorer.mayWriteDurableObservations).toBe(false);

    expect(deep.requiresParentContext).toBe(true);
    expect(deep.allowedTools).toEqual(
      expect.arrayContaining([
        'mem_save',
        'mem_suggest_topic_key',
        'mem_context',
        'mem_project_summary',
        'mem_project_graph',
        'mem_topic_keys',
      ]),
    );
    expect(deep.mayWriteDurableObservations).toBe(true);
  });

  test('renders parent context and protected SDD namespace instructions', () => {
    const prompt = renderMemoryGovernanceInstructions(getAgentRole('deep'));

    expect(prompt).toContain('parent session_id and project');
    expect(prompt).toContain('Delegated handoff recovery uses parent-scoped');
    expect(prompt).toContain('missing, stale, contradictory, or insufficient');
    expect(prompt).toContain('Never call mem_session_start');
    expect(prompt).toContain('Never save generated subagent prompts');
    expect(prompt).toContain('Protect the sdd/* topic namespace');
    expect(prompt).toContain(
      'mem_save only for delegated durable observations or assigned deterministic SDD artifacts/apply-progress',
    );
    expect(prompt).toContain('Project-scoped read tools require explicit');
    expect(prompt).toContain('mem_context');
    expect(prompt).toContain('mem_project_summary');
    expect(prompt).toContain('mem_project_graph');
    expect(prompt).toContain('mem_topic_keys');
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
        'Never call mem_session_start, mem_session_summary, or mem_save_prompt',
      );
      expect(prompt).toContain(
        'Write-capable agents may call mem_save only for delegated durable observations or assigned deterministic SDD artifacts/apply-progress',
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
    ).toContain('handoff recovery instructions');
    expect(
      diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    ).toContain('deterministic SDD artifacts only');
  });
});
