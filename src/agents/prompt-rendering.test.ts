import { describe, expect, test } from 'vitest';
import { renderCodexRootInstructions } from '../harness/adapters/codex';
import { createAgents } from './index';
import type { AgentPromptRole, HarnessPromptDialect } from './prompt-dialects';
import {
  CLAUDE_CODE_PROMPT_DIALECT,
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
  appendPromptSections,
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

const READ_ONLY_ROLES = [
  'explorer',
  'librarian',
  'oracle',
] as const satisfies readonly AgentPromptRole[];

const WRITE_CAPABLE_ROLES = [
  'designer',
  'quick',
  'deep',
] as const satisfies readonly AgentPromptRole[];

const CANONICAL_ROLE_TERMS = [
  'orchestrator',
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
] as const;

const REFERENCE_ROLE_LEAKS = [
  'architect',
  'builder',
  'critic',
  'fixer',
  'researcher',
  'planner',
  'tester',
] as const;

const REFERENCE_REPO_LEAKS = [
  'Gentle-AI',
  'oh-my-opencode-slim',
  'slash command',
  'command model',
  'commands.md',
] as const;

const SHARED_ROLE_POLICY_CONCRETE_TOOL_LEAKS = [
  'playwright',
  'playwright-cli',
  'playwright test',
  'show-report',
  '--headed',
  '--debug',
  'browser-use',
  'in-app browser',
  'Chrome',
] as const;

const REASONING_DISCIPLINE_TERMS = [
  'Before solving/editing, post one short commentary update naming reasoning/root-cause check',
  'Do thought experiments',
  'test competing explanations, edge cases, failure modes',
  'root-cause fit',
  'Do not stop at first plausible explanation/superficial answer',
  'validate with evidence, edge cases, tests',
] as const;

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

function expectAllTerms(prompt: string, terms: readonly string[]): void {
  for (const term of terms) {
    expect(prompt).toContain(term);
  }
}

function expectNoReferenceRoleLeaks(prompt: string): void {
  for (const role of REFERENCE_ROLE_LEAKS) {
    expect(prompt.toLowerCase()).not.toMatch(new RegExp(`\\b${role}\\b`));
  }
}

function expectNoReferenceRepoLeaks(prompt: string): void {
  for (const marker of REFERENCE_REPO_LEAKS) {
    expect(prompt.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

function expectNoSharedRolePolicyConcreteToolLeaks(prompt: string): void {
  const lowerPrompt = prompt.toLowerCase();

  for (const term of SHARED_ROLE_POLICY_CONCRETE_TOOL_LEAKS) {
    expect(lowerPrompt).not.toContain(term.toLowerCase());
  }
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
    const readOnlyRules = createSubagentRulesSection('readonly');
    const writableRules = createSubagentRulesSection('writable');

    expect(JSON.stringify(baseRules)).not.toContain('todowrite');
    expect(JSON.stringify(baseRules)).not.toContain('question');

    const openCode = renderPromptSection(baseRules, OPENCODE_PROMPT_DIALECT);
    const openCodeReadOnly = renderPromptSection(
      readOnlyRules,
      OPENCODE_PROMPT_DIALECT,
    );
    const codex = renderPromptSection(writableRules, CODEX_PROMPT_DIALECT);

    expect(openCode).toContain('call `todowrite`');
    expect(openCode).toContain(
      'Use `question` only for local blocking decisions',
    );
    expect(codex).toContain('call `functions.update_plan`');
    expect(codex).toContain(
      'Use `request_user_input` only for local blocking decisions',
    );
    expect(codex).toContain('mem_save');
    expect(openCodeReadOnly).toContain('mem_context');
    expect(openCodeReadOnly).toContain('bounded `mem_project`');
    expect(openCodeReadOnly).toContain('mem_recall(mode="compact")');
    expect(openCodeReadOnly).toContain('mem_recall(mode="context")');
    expect(codex).toContain('mem_context');
    expect(codex).toContain('mem_project(action="graph"|"topics"|"topic")');
  });

  test('compatibility exports preserve default OpenCode shared prompt text', () => {
    expect(QUESTION_PROTOCOL).toContain('Use `question` only');
    expect(SUBAGENT_RULES).toContain('call `todowrite`');
    expect(SUBAGENT_RULES_READONLY).toContain('do not call `mem_save`');
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
    expect(prompt).toContain('Mutation: coordination artifacts only');
    expect(prompt).toContain(
      'You may perform small bounded local inspection when cheaper, faster, or clearer than delegation',
    );
    expect(prompt).toContain('Keep any direct check narrow and evidence-led');
    expect(prompt).toContain(
      'do not become the default discovery, implementation, or verification worker',
    );
    expect(prompt).toContain(
      'Delegate broad search, multi-file edits, risky verification, UI visual QA, independent review, correctness-heavy debugging, and implementation-heavy work.',
    );
    expect(prompt).toContain(
      'Choose direct action, delegation, parallelization, or review by net quality, speed, cost, and reliability.',
    );
    expect(prompt).toContain(
      'Capacity is separate: retry the named role up to 3 times',
    );
    expect(prompt).toContain('Plan gate: after tasks, ask with `question`');
    expect(prompt).toContain('<sdd-delegation-matrix>');
    expect(prompt).toContain('sdd-clarify -> @deep');
    expect(prompt).toContain('sdd-tasks -> @quick');
    expect(prompt).toContain('sdd-verify -> @oracle');
    expect(prompt).toContain('persistence: @quick');
    expect(prompt).toContain('track progress in todowrite');
    expect(prompt).toContain('Root-session memory is yours');
    expect(prompt).toContain(
      'The root agent is the orchestrator/root coordinator for the session.',
    );
    expect(prompt).toContain(
      'At the start of a new root session, when thoth-mem tools and session/project identity are available',
    );
    expect(prompt).toContain('call `mem_session(action="start")`');
    expect(prompt).toContain(
      'Save only the real user request with `mem_save(kind="prompt")`',
    );
    expect(prompt).toContain(
      'Targeted recall funnel: `mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get(...)`',
    );
    expect(prompt).toContain('`mem_recall` `limit` from 1 to 20');
    expect(prompt).toContain('kind="observation"|"prompt"');
    expect(prompt).toContain('offset`/`max_length`');
    expect(prompt).toContain('HAS_TYPE');
    expect(prompt).toContain('IN_PROJECT');
    expect(prompt).toContain('HAS_TOPIC_KEY');
    expect(prompt).toContain('HAS_WHAT');
    expect(prompt).toContain('HAS_WHY');
    expect(prompt).toContain('HAS_WHERE');
    expect(prompt).toContain('HAS_LEARNED');
    expect(prompt).toContain('Before ending the root session');
    expect(prompt).toContain('After compaction');
    expect(prompt).toContain('@designer');
    expect(prompt).not.toContain('request_user_input');
    expect(prompt).not.toContain('MUST NOT read or write any file');
  });

  test('orchestrator prompt renders the bounded verify-loop with three verdict branches and the round bound', () => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      OPENCODE_PROMPT_DIALECT,
    );

    // 4.4 — three verdict branches
    expect(prompt).toContain('On clean `pass`:');
    expect(prompt).toContain('On `fail` with rounds remaining (round < 3):');
    expect(prompt).toContain('On `fail` at the bound (round 3 still failing):');
    expect(prompt).toContain('On `pass with warnings`:');
    // 4.4 — 3-round bound reference
    expect(prompt).toContain('bounded to 3 rounds');
    expect(prompt).toContain('subject to the 3-round bound');
    // 4.4 — escalation language via the dialect-substituted question tool
    expect(prompt).toContain(
      'escalate the unresolved failure to the user with `question`',
    );
    expect(prompt).toContain(
      'report this as an unsupported-capability limitation',
    );
    // targeted-fix scope by remediation anchors
    expect(prompt).toContain(
      'Critical Issue remediation anchors (file and/or scenario)',
    );

    // 4.5 — the removed linear line must not reappear
    expect(prompt).not.toContain('then sdd-archive when verification passes');
  });

  test('verify-loop escalation substitutes {{userQuestionTool}} per harness dialect', () => {
    const byDialect = {
      opencode: {
        dialect: OPENCODE_PROMPT_DIALECT,
        tool: 'question',
        others: ['AskUserQuestion', 'request_user_input'],
      },
      claude: {
        dialect: CLAUDE_CODE_PROMPT_DIALECT,
        tool: 'AskUserQuestion',
        others: ['request_user_input'],
      },
      codex: {
        dialect: CODEX_PROMPT_DIALECT,
        tool: 'request_user_input',
        others: ['AskUserQuestion'],
      },
    } as const;

    for (const { dialect, tool, others } of Object.values(byDialect)) {
      const prompt = renderRolePrompt(
        createOrchestratorPromptSections(),
        dialect,
      );
      expect(prompt).toContain(
        `escalate the unresolved failure to the user with \`${tool}\``,
      );
      expect(prompt).not.toContain('{{userQuestionTool}}');
      for (const other of others) {
        expect(prompt).not.toContain(other);
      }
    }
  });

  test('orchestrator prompt permits bounded direct checks without making root a worker', () => {
    const openCode = rolePrompt('orchestrator', OPENCODE_PROMPT_DIALECT);
    const codex = renderCodexRootInstructions();

    for (const prompt of [openCode, codex]) {
      expectAllTerms(prompt, [
        'small bounded local inspection',
        'read a known file',
        'confirm a script name',
        'inspect a narrow artifact',
        'verify one concrete claim',
        'Keep any direct check narrow and evidence-led',
        'do not become the default discovery',
        'Delegate broad search, multi-file edits, risky verification, UI visual QA, independent review, correctness-heavy debugging, and implementation-heavy work.',
      ]);
      expect(prompt).not.toContain('Delegate all inspection');
      expect(prompt).not.toContain('Verify through delegation, not inline.');
    }
  });

  test('orchestrator prompt enforces claim verification and evidence-led correction', () => {
    const prompts = [
      rolePrompt('orchestrator', OPENCODE_PROMPT_DIALECT),
      renderCodexRootInstructions(),
    ];

    for (const prompt of prompts) {
      expectAllTerms(prompt, [
        'Verify material user/agent claims before relying on them',
        'implementation, architecture, verification, safety, or guidance',
        'Before solving/editing, post one short commentary update',
        'Do thought experiments',
        'Do not stop at first plausible explanation/superficial answer',
        'validate with evidence, edge cases, tests',
        'correct it plainly, explain tradeoffs, and offer alternatives',
      ]);
    }
  });

  test('orchestrator prompt bounds delegation by net gain and preserves root validation', () => {
    const prompts = [
      rolePrompt('orchestrator', OPENCODE_PROMPT_DIALECT),
      renderCodexRootInstructions(),
    ];

    for (const prompt of prompts) {
      expectAllTerms(prompt, [
        'net quality, speed, cost, and reliability',
        'Do not delegate when overhead exceeds a bounded direct check',
        'delegate when breadth, risk, specialization, or independent review materially improves the result',
        'Parallelize only independent delegations',
        'reconcile dependent steps after evidence returns',
        'Keep validation and final synthesis accountable to the root',
      ]);
      expectNoReferenceRepoLeaks(prompt);
      expectNoReferenceRoleLeaks(prompt);
    }
  });

  test('OpenCode and Codex root prompts preserve root-owned coordination, memory, input, progress, and reporting', () => {
    const openCode = rolePrompt('orchestrator', OPENCODE_PROMPT_DIALECT);
    const codex = renderCodexRootInstructions();

    for (const prompt of [openCode, codex]) {
      expectAllTerms(prompt, [
        'root coordinator',
        'decision engine',
        'delegate-first',
        'bounded direct',
        'evidence-led',
        'sequencing',
        'blocking user',
        'progress',
        'Root-session memory is yours',
        'mem_session(action="start")',
        'mem_save(kind="prompt")',
        'mem_session(action="summary")',
        'final',
        'Never request raw file dumps',
        'net quality, speed, cost, and reliability',
        'correct it plainly, explain tradeoffs, and offer alternatives',
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'quick',
        'deep',
      ]);
      expect(prompt).not.toMatch(/optional specialist/i);
      expectNoReferenceRoleLeaks(prompt);
    }

    expectAllTerms(openCode, ['`task`', '`question`', 'todowrite']);
    expectAllTerms(codex, [
      'collaboration.spawn_agent',
      '`request_user_input`',
      'functions.update_plan',
      'instruction-only',
      'delegated task instructions plus handoff retrieval instructions in `message`',
      'Do not include the handoff body in `message`',
    ]);
    expect(openCode).not.toContain(
      'delegated task instructions plus handoff retrieval instructions in `message`',
    );
    expect(openCode).not.toContain('full parent-context fork');
  });

  test('root prompts treat delegation handoff as root-owned compaction', () => {
    const openCode = rolePrompt('orchestrator', OPENCODE_PROMPT_DIALECT);
    const codex = renderCodexRootInstructions();

    for (const prompt of [openCode, codex]) {
      expectAllTerms(prompt, [
        'root-owned session context',
        'must not be embedded in the initial sub-agent prompt',
        'save or refresh that handoff body with root-owned',
        'mem_session(action="summary")',
        'mem_save(kind="session_summary")',
        'root-owned compaction could not be persisted',
        'task instructions plus handoff recovery instructions only',
        'parent `session_id`, project, persistence mode, memory permissions',
        'mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get(...)',
        'It must not include the handoff body',
        'raw transcripts, file dumps, secrets, credentials',
        'generated sub-agent prompts as memory source material',
        'handoff retrieval instructions when a root-owned handoff summary exists',
      ]);
    }

    expect(openCode).not.toContain('collaboration.spawn_agent');
    expect(openCode).not.toContain('`message`');
    expect(codex).toContain(
      'delegated task instructions plus handoff retrieval instructions in `message`',
    );
  });

  test('subagent prompts require parent-scoped handoff recall and forbid prompt saves', () => {
    const explorer = rolePrompt('explorer', OPENCODE_PROMPT_DIALECT);
    const deep = rolePrompt('deep', OPENCODE_PROMPT_DIALECT);

    for (const prompt of [explorer, deep]) {
      expectAllTerms(prompt, [
        'parent session_id',
        'project',
        'handoff recovery instructions',
        '`mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get(...)`',
        'parent-session handoff summary',
        'missing, stale, contradictory, or insufficient',
        'bounded `mem_project(action="graph"|"topics"|"topic")`',
        '`mem_recall` `limit` from 1 to 20',
        'kind="observation"|"prompt"',
        'offset`/`max_length`',
        'HAS_TYPE',
        'IN_PROJECT',
        'HAS_TOPIC_KEY',
        'HAS_WHAT',
        'HAS_WHY',
        'HAS_WHERE',
        'HAS_LEARNED',
        'generated subagent prompts',
      ]);
    }

    expect(explorer).toContain('do not call `mem_save`');
    expect(explorer).toContain('own any `mem_session(...)` lifecycle action');
    expect(deep).toContain(
      '`mem_save(kind="observation")` is allowed only for delegated durable implementation observations or assigned deterministic SDD artifacts/apply-progress',
    );
    expect(deep).toContain(
      'deterministic SDD artifacts use `sdd/{change}/{artifact}`',
    );
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
    expect(explorer).toContain('do not call `mem_save`');
    expect(librarian).toContain(
      'Every substantive claim must carry a source URL',
    );
    expect(oracle).toContain('plan-reviewer for SDD plans');
    expect(oracle).toContain('- Dispatch method: synchronous task only');
    expect([explorer, librarian, oracle].join('\n')).toContain(
      'Use `question` only for blocking choices',
    );
  });

  test('read-only specialists prohibit mutation, implementation ownership, and root memory while returning evidence', () => {
    const prompts = Object.fromEntries(
      READ_ONLY_ROLES.map((role) => [
        role,
        rolePrompt(role, OPENCODE_PROMPT_DIALECT),
      ]),
    ) as Record<(typeof READ_ONLY_ROLES)[number], string>;

    for (const [role, prompt] of Object.entries(prompts)) {
      expect(prompt).toContain(`You are ${role}.`);
      expect(prompt).toContain('Mode: read-only');
      expect(prompt).toMatch(/evidence|findings|anchors|source URL/i);
      expect(prompt).toMatch(/do not|never/i);
      expect(prompt).toMatch(/mutat|write|edit/i);
      expect(prompt).toContain('do not call `mem_save`');
      expect(prompt).toContain('Never discard working-tree changes');
      expect(prompt).not.toContain('workspace-write');
      expectNoReferenceRoleLeaks(prompt);
    }

    expectAllTerms(prompts.explorer, [
      'local repository discovery',
      'candidate files',
      'verification targets',
    ]);
    expectAllTerms(prompts.librarian, [
      'external docs',
      'source URL',
      'version',
    ]);
    expectAllTerms(prompts.oracle, [
      'read-only review',
      'findings',
      'plan-reviewer',
    ]);
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
    expect(designer).toContain('visual verification surface');
    expect(designer).toContain('temporary evidence');
    expect(designer).toContain('garbage to delete after review');
    expect(designer).toContain('non-blocking');
    expect(quick).toContain('Implement well-defined changes quickly');
    expect(quick).toContain('NEVER run git commands that discard changes');
    expect(deep).toContain(
      'Use test-driven-development and systematic-debugging',
    );
    expect(deep).toContain('Do not skip verification');
    expect([designer, quick, deep].join('\n')).toContain('mem_save');
  });

  test('write-capable specialists stay bounded and require verification evidence without taking root ownership', () => {
    const prompts = Object.fromEntries(
      WRITE_CAPABLE_ROLES.map((role) => [
        role,
        rolePrompt(role, OPENCODE_PROMPT_DIALECT),
      ]),
    ) as Record<(typeof WRITE_CAPABLE_ROLES)[number], string>;

    for (const [role, prompt] of Object.entries(prompts)) {
      expect(prompt).toContain(`You are ${role}.`);
      expect(prompt).toContain('Mode: write-capable');
      expect(prompt).toContain('synchronous task only');
      expect(prompt).toContain('Never discard working-tree changes');
      expect(prompt).toContain('Verification');
      expect(prompt).toContain('Task Result envelope');
      expectNoSharedRolePolicyConcreteToolLeaks(prompt);
      expect(prompt).toContain('mem_save');
      expect(prompt).toContain('Never own `mem_session(action="start"');
      expectNoReferenceRoleLeaks(prompt);
    }

    expectAllTerms(prompts.designer, [
      'UI/UX',
      'visual verification surface',
      'visual QA',
      'responsive',
    ]);
    expectAllTerms(prompts.quick, ['narrow', 'low-risk', 'mechanical']);
    expectAllTerms(prompts.deep, [
      'correctness-critical',
      'test-driven-development',
      'systematic-debugging',
      'edge-case',
    ]);
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
      expect(prompts[role]).toContain('do not call `mem_save`');
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

  test('all seven role prompts include reasoning discipline across harness dialects', () => {
    for (const dialect of [OPENCODE_PROMPT_DIALECT, CODEX_PROMPT_DIALECT]) {
      const prompts = Object.fromEntries(
        AGENT_ROLES.map((role) => [role, rolePrompt(role, dialect)]),
      ) as Record<AgentPromptRole, string>;

      for (const role of AGENT_ROLES) {
        expectAllTerms(prompts[role], REASONING_DISCIPLINE_TERMS);
      }
    }
  });

  test('the canonical roster remains exactly seven roles across rendered prompt coverage', () => {
    expect([...AGENT_ROLES]).toEqual([...CANONICAL_ROLE_TERMS]);

    const renderedByHarness = [
      OPENCODE_PROMPT_DIALECT,
      CODEX_PROMPT_DIALECT,
    ].map((dialect) =>
      AGENT_ROLES.map((role) => rolePrompt(role, dialect)).join('\n'),
    );

    for (const rendered of renderedByHarness) {
      for (const role of CANONICAL_ROLE_TERMS) {
        expect(rendered).toContain(role);
      }
      expectNoReferenceRoleLeaks(rendered);
    }
  });

  test('rendered prompts do not import reference repos or command models', () => {
    const renderedPrompts = [
      createAgents()
        .map((agent) => agent.config.prompt ?? '')
        .join('\n'),
      ...[OPENCODE_PROMPT_DIALECT, CODEX_PROMPT_DIALECT].map((dialect) =>
        AGENT_ROLES.map((role) => rolePrompt(role, dialect)).join('\n'),
      ),
    ];

    for (const rendered of renderedPrompts) {
      expectNoReferenceRoleLeaks(rendered);
      expectNoReferenceRepoLeaks(rendered);
    }
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
    expect(prompts.orchestrator).toContain('collaboration.spawn_agent');
    expect(prompts.orchestrator).toContain('deep subagent');
    expect(prompts.orchestrator).toContain('functions.update_plan');
    expect(prompts.orchestrator).toContain(
      'The root agent is the orchestrator/root coordinator for the session.',
    );
    expect(prompts.orchestrator).toContain('mem_session(action="start")');
    expect(prompts.orchestrator).toContain('mem_save(kind="prompt")');

    for (const role of ['explorer', 'librarian', 'oracle'] as const) {
      expect(prompts[role]).toContain(`You are ${role}.`);
      expect(prompts[role]).toContain('- Mode: read-only');
      expect(prompts[role]).toContain('do not call `mem_save`');
    }

    for (const role of ['designer', 'quick', 'deep'] as const) {
      expect(prompts[role]).toContain(`You are ${role}.`);
      expect(prompts[role]).toContain('- Mode: write-capable');
      expect(prompts[role]).toContain(
        'Dispatch method: synchronous collaboration.spawn_agent only',
      );
      expect(prompts[role]).toContain('mem_save');
    }

    expect(prompts.designer).toContain('visual verification');
    expect(prompts.quick).toContain('fast bounded implementation');
    expect(prompts.deep).toContain('Do not skip verification');
  });

  test('renders terminal-aware lifecycle and retry policy without Codex wording leaking into OpenCode', () => {
    const openCode = rolePrompt('orchestrator', OPENCODE_PROMPT_DIALECT);
    const codex = renderCodexRootInstructions();

    for (const prompt of [openCode, codex]) {
      expect(prompt).toContain('as in progress and probe the same session via');
      expect(prompt).toContain('no retry/reroute/interruption before');
      expect(prompt).toContain(
        'an explicit user deadline, user cancellation, or a superseding request',
      );
      expect(prompt).toContain(
        'Terminal result-quality and required-artifact checks share one sharpened retry; nonterminal probes use none.',
      );
      expect(prompt).toContain(
        'Capacity is separate: retry the named role up to 3 times',
      );
      expect(prompt).toContain(
        'never switch to `default`, `worker`, or another role',
      );
      expect(prompt).toMatch(
        /deep(?: subagent)? only when the task plan is complex/,
      );
      expect(prompt).not.toContain(
        'deep as recovery for silence, capacity, missing artifacts, or invalid results',
      );
    }

    expect(codex).toContain('collaboration.list_agents on the same task path');
    expect(codex).toContain('collaboration.wait_agent timeout or silence');
    expect(codex).toContain(
      'Use `collaboration.wait_agent` to wait and inspect status',
    );
    expect(codex).not.toContain(
      'Use `collaboration.wait_agent` to wait, poll, and collect',
    );
    expect(openCode).toContain('task_status on the same task session');
    expect(openCode).toContain('Use `task_status` to wait, poll, and collect');
    expect(openCode).not.toContain('collaboration.wait_agent');
    expect(openCode).not.toContain('same subagent session');

    const claude = rolePrompt('orchestrator', CLAUDE_CODE_PROMPT_DIALECT);
    expect(claude).toContain('Use `TaskOutput` to wait, poll, and collect');
  });

  test('composeAgentPrompt keeps generated model-family guidance before user append text and replacement isolated', () => {
    const basePrompt = appendPromptSections(
      'Generated base for {{role}}',
      'Model guidance for {{model}}',
    );

    const appended = composeAgentPrompt({
      basePrompt,
      customAppendPrompt: 'User append for {{role}}',
      placeholders: { model: 'gpt-5.5', role: 'deep' },
    });

    expect(appended).toBe(
      'Generated base for deep\n\nModel guidance for gpt-5.5\n\nUser append for deep',
    );
    expect(appended.indexOf('Model guidance')).toBeLessThan(
      appended.indexOf('User append'),
    );

    const replaced = composeAgentPrompt({
      basePrompt,
      customPrompt: 'Replacement only for {{role}} on {{model}}',
      customAppendPrompt: 'User append for {{role}}',
      placeholders: { model: 'gpt-5.5', role: 'deep' },
    });

    expect(replaced).toBe('Replacement only for deep on gpt-5.5');
    expect(replaced).not.toContain('Generated base');
    expect(replaced).not.toContain('User append');
  });
});
