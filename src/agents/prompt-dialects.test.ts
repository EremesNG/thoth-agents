import { describe, expect, test } from 'vitest';
import {
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
  });

  test('renders Codex-native role-agent and status-surface wording explicitly', () => {
    expect(CODEX_PROMPT_DIALECT.harness).toBe('codex');
    expect(CODEX_PROMPT_DIALECT.tools.userQuestionTool).toBe(
      'request_user_input',
    );
    expect(CODEX_PROMPT_DIALECT.tools.roleReference('deep')).toBe(
      'deep role agent',
    );
    expect(CODEX_PROMPT_DIALECT.dispatchLabel('synchronous-task-only')).toBe(
      'synchronous Codex custom-agent task only',
    );
    expect(CODEX_PROMPT_DIALECT.tools.backgroundStatusTool).toBe(
      'Codex host status surface',
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

  test('rejects unsupported prompt dialect ids', () => {
    expect(() => getPromptDialect('unknown')).toThrow(
      'Unsupported prompt dialect: unknown',
    );
  });
});
