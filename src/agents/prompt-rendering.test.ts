import { describe, expect, test } from 'bun:test';
import { createAgents } from './index';
import type { AgentPromptRole, HarnessPromptDialect } from './prompt-dialects';
import {
  CODEX_PROMPT_DIALECT,
  OPENCODE_PROMPT_DIALECT,
} from './prompt-dialects';
import {
  createOrchestratorPromptSections,
  createQuestionProtocolSection,
  createReadOnlySpecialistPromptSections,
  createSubagentRulesSection,
  createWriteCapableSpecialistPromptSections,
  renderPromptSection,
  renderRolePrompt,
} from './prompt-sections';
import {
  composeAgentPrompt,
  QUESTION_PROTOCOL,
  SUBAGENT_RULES,
  SUBAGENT_RULES_READONLY,
  SUBAGENT_RULES_WRITABLE,
} from './prompt-utils';

const AGENT_ROLES = [
  'orchestrator',
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
] as const satisfies readonly AgentPromptRole[];

function roleSections(role: AgentPromptRole) {
  switch (role) {
    case 'orchestrator':
      return createOrchestratorPromptSections();
    case 'explorer':
    case 'librarian':
    case 'oracle':
      return createReadOnlySpecialistPromptSections(role);
    case 'designer':
    case 'quick':
    case 'deep':
      return createWriteCapableSpecialistPromptSections(role);
  }
}

function rolePrompt(
  role: AgentPromptRole,
  dialect: HarnessPromptDialect,
): string {
  return renderRolePrompt(roleSections(role), dialect);
}

function expectNoCodexOnlyOpenCodeLeaks(prompt: string): void {
  expect(prompt).not.toContain('Use `question`');
  expect(prompt).not.toContain('call `todowrite`');
  expect(prompt).not.toContain('`task_status`');
  expect(prompt).not.toContain('normal synchronous `task` execution');
  expect(prompt).not.toContain('@explorer');
  expect(prompt).not.toContain('@designer');
  expect(prompt).not.toContain('@deep');
}

describe('semantic prompt section rendering', () => {
  test('keeps shared question policy semantic while rendering harness tool names', () => {
    const section = createQuestionProtocolSection();

    expect(section.toolConcept).toBe('userQuestion');
    expect(JSON.stringify(section)).not.toContain('`question`');
    expect(JSON.stringify(section)).not.toContain('`task`');

    expect(renderPromptSection(section, OPENCODE_PROMPT_DIALECT)).toContain(
      'Use `question` only for blocking choices',
    );
    expect(renderPromptSection(section, CODEX_PROMPT_DIALECT)).toContain(
      'Use `request_user_input` only for blocking choices',
    );
  });

  test('renders shared subagent rules with OpenCode and Codex nomenclature', () => {
    const baseRules = createSubagentRulesSection('base');
    const writableRules = createSubagentRulesSection('writable');

    expect(JSON.stringify(baseRules)).not.toContain('todowrite');
    expect(JSON.stringify(baseRules)).not.toContain('question');

    const openCode = renderPromptSection(baseRules, OPENCODE_PROMPT_DIALECT);
    const codex = renderPromptSection(writableRules, CODEX_PROMPT_DIALECT);

    expect(openCode).toContain('call `todowrite`');
    expect(openCode).toContain(
      'Use `question` only for local blocking decisions',
    );
    expect(codex).toContain('call `Codex progress tracking surface`');
    expect(codex).toContain(
      'Use `request_user_input` only for local blocking decisions',
    );
    expect(codex).toContain('mem_save');
  });

  test('compatibility exports preserve default OpenCode shared prompt text', () => {
    expect(QUESTION_PROTOCOL).toContain('Use `question` only');
    expect(SUBAGENT_RULES).toContain('call `todowrite`');
    expect(SUBAGENT_RULES_READONLY).toContain('Never write memory');
    expect(SUBAGENT_RULES_WRITABLE).toContain(
      'Always use the parent session_id/project',
    );
  });

  test('shared semantic policy sources remain neutral before dialect rendering', () => {
    const sharedSections = [
      createQuestionProtocolSection(),
      createSubagentRulesSection('base'),
      createSubagentRulesSection('readonly'),
      createSubagentRulesSection('writable'),
    ];
    const source = JSON.stringify(sharedSections);

    expect(source).not.toContain('"question"');
    expect(source).not.toContain('task_status');
    expect(source).not.toContain('todowrite');
    expect(source).not.toContain('@deep');
  });

  test('preserves composeAgentPrompt replacement and append semantics', () => {
    expect(
      composeAgentPrompt({
        basePrompt: 'Base {{name}}',
        customAppendPrompt: 'Append {{name}}',
        placeholders: { name: 'Ada' },
      }),
    ).toBe('Base Ada\n\nAppend Ada');

    expect(
      composeAgentPrompt({
        basePrompt: 'Base {{name}}',
        customPrompt: 'Replacement {{name}}',
        customAppendPrompt: 'Append {{name}}',
        placeholders: { name: 'Ada' },
      }),
    ).toBe('Replacement Ada');
  });

  test('keeps OpenCode as the default createAgents prompt dialect', () => {
    const prompts = createAgents().map((agent) => agent.config.prompt ?? '');

    expect(prompts.join('\n')).toContain('Use `question` only');
    expect(prompts.join('\n')).toContain('call `todowrite`');
    expect(prompts.join('\n')).toContain('@deep');
    expect(prompts.join('\n')).not.toContain('request_user_input');
  });

  test('orchestrator prompt renders root coordination contracts from semantic sections', () => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain(
      'You are the delegate-first root coordinator and decision engine',
    );
    expect(prompt).toContain('Default to normal synchronous `task` execution');
    expect(prompt).toContain('Plan gate: after tasks, ask with `question`');
    expect(prompt).toContain('track progress in todowrite');
    expect(prompt).toContain('Root-session memory is yours');
    expect(prompt).toContain(
      'current main/root agent is the orchestrator/root coordinator',
    );
    expect(prompt).toContain(
      'At the start of a new root session, when thoth-mem tools are available',
    );
    expect(prompt).toContain('call `mem_session_start`');
    expect(prompt).toContain(
      'save the real user prompt with `mem_save_prompt`',
    );
    expect(prompt).toContain('3-layer recall protocol: `mem_search`');
    expect(prompt).toContain('Before ending the root session');
    expect(prompt).toContain('After compaction');
    expect(prompt).toContain('@designer');
    expect(prompt).not.toContain('request_user_input');
  });

  test('read-only specialist prompts preserve evidence-focused role boundaries', () => {
    const explorer = renderRolePrompt(
      createReadOnlySpecialistPromptSections('explorer'),
      OPENCODE_PROMPT_DIALECT,
    );
    const librarian = renderRolePrompt(
      createReadOnlySpecialistPromptSections('librarian'),
      OPENCODE_PROMPT_DIALECT,
    );
    const oracle = renderRolePrompt(
      createReadOnlySpecialistPromptSections('oracle'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(explorer).toContain('- Mode: read-only');
    expect(explorer).toContain('Return decision-ready evidence');
    expect(explorer).toContain('Never write memory');
    expect(librarian).toContain(
      'Every substantive claim must carry a source URL',
    );
    expect(oracle).toContain('plan-reviewer for SDD plans');
    expect(oracle).toContain('- Dispatch method: synchronous task only');
    expect([explorer, librarian, oracle].join('\n')).toContain(
      'Use `question` only for blocking choices',
    );
  });

  test('write-capable specialist prompts preserve implementation and verification boundaries', () => {
    const designer = renderRolePrompt(
      createWriteCapableSpecialistPromptSections('designer'),
      OPENCODE_PROMPT_DIALECT,
    );
    const quick = renderRolePrompt(
      createWriteCapableSpecialistPromptSections('quick'),
      OPENCODE_PROMPT_DIALECT,
    );
    const deep = renderRolePrompt(
      createWriteCapableSpecialistPromptSections('deep'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(designer).toContain('- Mode: write-capable');
    expect(designer).toContain('verify it visually');
    expect(designer).toContain('screenshot');
    expect(quick).toContain('Implement well-defined changes quickly');
    expect(quick).toContain('NEVER run git commands that discard changes');
    expect(deep).toContain(
      'Use test-driven-development and systematic-debugging',
    );
    expect(deep).toContain('Do not skip verification');
    expect([designer, quick, deep].join('\n')).toContain('mem_save');
  });

  test('all seven OpenCode role prompts preserve role identity, scope, safety, and output contracts', () => {
    const prompts = Object.fromEntries(
      AGENT_ROLES.map((role) => [
        role,
        rolePrompt(role, OPENCODE_PROMPT_DIALECT),
      ]),
    ) as Record<AgentPromptRole, string>;

    expect(prompts.orchestrator).toContain(
      'delegate-first root coordinator and decision engine',
    );
    expect(prompts.orchestrator).toContain('Mode: primary coordinator');
    expect(prompts.orchestrator).toContain('track progress in todowrite');
    expect(prompts.orchestrator).toContain('Root-session memory is yours');
    expect(prompts.orchestrator).toContain('@explorer');

    for (const role of ['explorer', 'librarian', 'oracle'] as const) {
      expect(prompts[role]).toContain(`You are ${role}.`);
      expect(prompts[role]).toContain('- Mode: read-only');
      expect(prompts[role]).toContain('Never write memory');
      expect(prompts[role]).toContain('Use `question` only');
      expect(prompts[role]).toContain('Never discard working-tree changes');
    }

    expect(prompts.explorer).toContain('Scope: local repository discovery');
    expect(prompts.explorer).toContain('Return exactly these sections');
    expect(prompts.librarian).toContain('source URL');
    expect(prompts.oracle).toContain('plan-reviewer for SDD plans');

    for (const role of ['designer', 'quick', 'deep'] as const) {
      expect(prompts[role]).toContain(`You are ${role}.`);
      expect(prompts[role]).toContain('- Mode: write-capable');
      expect(prompts[role]).toContain('Dispatch method: synchronous task only');
      expect(prompts[role]).toContain('mem_save');
      expect(prompts[role]).toContain('Task Result envelope');
      expect(prompts[role]).toContain('Never discard working-tree changes');
    }

    expect(prompts.designer).toContain('Scope: UI/UX decisions');
    expect(prompts.designer).toContain('visual verification');
    expect(prompts.quick).toContain('Scope: fast bounded implementation');
    expect(prompts.quick).toContain(
      'NEVER run git commands that discard changes',
    );
    expect(prompts.deep).toContain(
      'Scope: thorough implementation and verification',
    );
    expect(prompts.deep).toContain('Do not skip verification');
  });

  test('all seven Codex role prompts use Codex terminology without weakening role identity', () => {
    const prompts = Object.fromEntries(
      AGENT_ROLES.map((role) => [role, rolePrompt(role, CODEX_PROMPT_DIALECT)]),
    ) as Record<AgentPromptRole, string>;

    for (const role of AGENT_ROLES) {
      expect(prompts[role]).toContain('request_user_input');
      expectNoCodexOnlyOpenCodeLeaks(prompts[role]);
    }

    expect(prompts.orchestrator).toContain(
      'delegate-first root coordinator and decision engine',
    );
    expect(prompts.orchestrator).toContain('Codex custom-agent task');
    expect(prompts.orchestrator).toContain('deep role agent');
    expect(prompts.orchestrator).toContain('Codex progress tracking surface');
    expect(prompts.orchestrator).toContain(
      'current main/root agent is the orchestrator/root coordinator',
    );
    expect(prompts.orchestrator).toContain('mem_session_start');
    expect(prompts.orchestrator).toContain('mem_save_prompt');

    for (const role of ['explorer', 'librarian', 'oracle'] as const) {
      expect(prompts[role]).toContain(`You are ${role}.`);
      expect(prompts[role]).toContain('- Mode: read-only');
      expect(prompts[role]).toContain('Never write memory');
    }

    for (const role of ['designer', 'quick', 'deep'] as const) {
      expect(prompts[role]).toContain(`You are ${role}.`);
      expect(prompts[role]).toContain('- Mode: write-capable');
      expect(prompts[role]).toContain(
        'Dispatch method: synchronous Codex custom-agent task only',
      );
      expect(prompts[role]).toContain('mem_save');
    }

    expect(prompts.designer).toContain('visual verification');
    expect(prompts.quick).toContain('fast bounded implementation');
    expect(prompts.deep).toContain('Do not skip verification');
  });
});
