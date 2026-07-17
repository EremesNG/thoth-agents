import { describe, expect, test } from 'vitest';
import {
  CLAUDE_CODE_PROMPT_DIALECT,
  CODEX_PROMPT_DIALECT,
  getPromptDialect,
  OPENCODE_PROMPT_DIALECT,
} from './prompt-dialects';

describe('prompt dialects', () => {
  test('renders OpenCode-native tool and role wording explicitly', () => {
    expect(OPENCODE_PROMPT_DIALECT.harness).toBe('opencode');
    expect(OPENCODE_PROMPT_DIALECT.tools.delegationTool).toBe('task');
    expect(OPENCODE_PROMPT_DIALECT.tools.backgroundStatusTool).toBe(
      'task_status',
    );
    expect(OPENCODE_PROMPT_DIALECT.tools.userQuestionTool).toBe('question');
    expect(OPENCODE_PROMPT_DIALECT.tools.progressTool).toBe('todowrite');
    expect(OPENCODE_PROMPT_DIALECT.tools.roleReference('deep')).toBe('@deep');
    expect(OPENCODE_PROMPT_DIALECT.dispatchLabel('task')).toBe('task');
    expect(OPENCODE_PROMPT_DIALECT.dispatchLabel('root-coordinator')).toBe(
      'root coordinator',
    );
    expect(OPENCODE_PROMPT_DIALECT.dispatchLabel('synchronous-task-only')).toBe(
      'synchronous task only',
    );
    expect(OPENCODE_PROMPT_DIALECT.tools.hostStatusSurface).toBe('task_status');
  });

  test('renders Codex-native role-agent and status-surface wording explicitly', () => {
    expect(CODEX_PROMPT_DIALECT.harness).toBe('codex');
    expect(CODEX_PROMPT_DIALECT.tools.userQuestionTool).toBe(
      'request_user_input',
    );
    expect(CODEX_PROMPT_DIALECT.tools.roleReference('deep')).toBe(
      'deep role agent',
    );
    expect(CODEX_PROMPT_DIALECT.renderRoleInvocation('orchestrator')).toBe(
      'orchestrator role agent',
    );
    expect(CODEX_PROMPT_DIALECT.renderRoleInvocation('deep')).toBe(
      'deep subagent',
    );
    expect(CODEX_PROMPT_DIALECT.dispatchLabel('synchronous-task-only')).toBe(
      'synchronous multi_agent_v1.spawn_agent only',
    );
    expect(CODEX_PROMPT_DIALECT.tools.backgroundStatusTool).toBe(
      'multi_agent_v1.wait_agent',
    );
    expect(CODEX_PROMPT_DIALECT.tools.delegationTool).toBe(
      'multi_agent_v1.spawn_agent',
    );
    expect(CODEX_PROMPT_DIALECT.tools.backgroundDelegationTool).toBe(
      'multi_agent_v1.spawn_agent',
    );
    expect(CODEX_PROMPT_DIALECT.tools.progressTool).toBe(
      'functions.update_plan',
    );
    expect(CODEX_PROMPT_DIALECT.tools.hostStatusSurface).toBe(
      'multi_agent_v1.wait_agent',
    );
    expect(CODEX_PROMPT_DIALECT.dispatchLabel('root-coordinator')).toBe(
      'ambient Codex root session coordinator',
    );
  });

  test('discloses Codex capability gaps without weakening role identity', () => {
    expect(
      CODEX_PROMPT_DIALECT.capabilities.renderCapabilityDisclosure(
        'delegatedExecution',
      ),
    ).toContain('instruction-only');
    expect(
      CODEX_PROMPT_DIALECT.capabilities.renderCapabilityDisclosure(
        'runtimeHooks',
      ),
    ).toContain('unknown');
    expect(
      OPENCODE_PROMPT_DIALECT.capabilities.renderCapabilityDisclosure(
        'delegatedExecution',
      ),
    ).toBeUndefined();
  });

  test('Codex capability disclosures preserve instruction-only responsibility contracts', () => {
    for (const capability of [
      'delegatedExecution',
      'parallelDelegation',
      'rolePermissions',
      'parentContextInjection',
      'memoryGovernanceEnforcement',
    ] as const) {
      const disclosure =
        CODEX_PROMPT_DIALECT.capabilities.renderCapabilityDisclosure(
          capability,
        );

      expect(disclosure).toContain('instruction-only in Codex');
      expect(disclosure).toContain(
        'preserve the role responsibility as prompt guidance',
      );
    }

    expect(
      CODEX_PROMPT_DIALECT.capabilities.renderCapabilityDisclosure(
        'runtimeHooks',
      ),
    ).toContain('diagnostic-only');
  });

  test('models portable lifecycle status and same-session probe terminology', () => {
    expect(CODEX_PROMPT_DIALECT.tools.lifecycle).toEqual({
      terminalState: 'terminal completion or failure',
      nonterminalState: 'quiet or nonterminal wait/status result',
      sameSessionProbe:
        'multi_agent_v1.wait_agent on the same subagent session',
      enforcement: 'instruction-only',
    });
    expect(OPENCODE_PROMPT_DIALECT.tools.lifecycle).toEqual({
      terminalState: 'terminal task_status result',
      nonterminalState: 'nonterminal task_status result',
      sameSessionProbe: 'task_status on the same task session',
      enforcement: 'runtime-supported',
    });
    expect(
      JSON.stringify(OPENCODE_PROMPT_DIALECT.tools.lifecycle),
    ).not.toContain('multi_agent_v1');
  });

  test('renders Claude Code-native tool and role wording as a first-class harness', () => {
    expect(CLAUDE_CODE_PROMPT_DIALECT.harness).toBe('claude');
    expect(CLAUDE_CODE_PROMPT_DIALECT.tools.delegationTool).toBe('Task');
    expect(CLAUDE_CODE_PROMPT_DIALECT.tools.userQuestionTool).toBe(
      'AskUserQuestion',
    );
    expect(CLAUDE_CODE_PROMPT_DIALECT.tools.progressTool).toBe('TodoWrite');
    // Plugin subagents are namespaced: subagent_type is `thoth-agents:<role>`.
    expect(CLAUDE_CODE_PROMPT_DIALECT.tools.roleReference('deep')).toBe(
      'Task(subagent_type: thoth-agents:deep)',
    );
    expect(
      CLAUDE_CODE_PROMPT_DIALECT.renderRoleInvocation('orchestrator'),
    ).toBe('main-thread orchestrator');
    expect(CLAUDE_CODE_PROMPT_DIALECT.renderRoleInvocation('deep')).toBe(
      'thoth-agents:deep',
    );
    expect(CLAUDE_CODE_PROMPT_DIALECT.dispatchLabel('root-coordinator')).toBe(
      'main-session coordinator',
    );
  });

  test('Claude Code is first-class with no capability disclosures', () => {
    for (const capability of [
      'delegatedExecution',
      'runtimeHooks',
      'rolePermissions',
      'parentContextInjection',
      'memoryGovernanceEnforcement',
    ] as const) {
      expect(
        CLAUDE_CODE_PROMPT_DIALECT.capabilities.renderCapabilityDisclosure(
          capability,
        ),
      ).toBeUndefined();
      expect(
        CLAUDE_CODE_PROMPT_DIALECT.capabilities.capabilities[capability],
      ).toBe('supported');
    }
  });

  test('supports OpenCode, Codex, and Claude Code prompt dialect ids', () => {
    expect(getPromptDialect('opencode')).toBe(OPENCODE_PROMPT_DIALECT);
    expect(getPromptDialect('codex')).toBe(CODEX_PROMPT_DIALECT);
    expect(getPromptDialect('claude')).toBe(CLAUDE_CODE_PROMPT_DIALECT);

    for (const dialectId of [
      'unknown',
      'cursor',
      'gemini-cli',
      'aider',
      'zed',
    ]) {
      expect(() => getPromptDialect(dialectId)).toThrow(
        `Unsupported prompt dialect: ${dialectId}`,
      );
    }
  });
});
