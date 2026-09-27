import { describe, expect, test } from 'vitest';
import { renderClaudeCodeRootInstructions } from '../harness/adapters/claude-code';
import { renderCodexRootInstructions } from '../harness/adapters/codex';
import { renderOpenCodeAgentConfigs } from '../harness/adapters/opencode';
import { renderPiRootInstructions } from '../harness/adapters/pi';
import type { AgentRoleName } from '../harness/core/agent-pack';
import {
  CLAUDE_CODE_PROMPT_DIALECT,
  CODEX_PROMPT_DIALECT,
  OPENCODE_PROMPT_DIALECT,
} from './prompt-dialects';
import {
  createOrchestratorPromptSections,
  createReadOnlySpecialistPromptSections,
  createWriteCapableSpecialistPromptSections,
  detectModelFamilyFromModel,
  renderRolePrompt,
} from './prompt-sections';

const READ_ONLY_ROLES = ['explorer', 'librarian', 'oracle'] as const;
const WRITER_ROLES = ['designer', 'quick', 'deep'] as const;
const DIALECTS = [
  OPENCODE_PROMPT_DIALECT,
  CODEX_PROMPT_DIALECT,
  CLAUDE_CODE_PROMPT_DIALECT,
] as const;

function sectionsFor(role: AgentRoleName) {
  if (role === 'orchestrator') return createOrchestratorPromptSections();
  if ((READ_ONLY_ROLES as readonly string[]).includes(role)) {
    return createReadOnlySpecialistPromptSections(
      role as (typeof READ_ONLY_ROLES)[number],
    );
  }
  return createWriteCapableSpecialistPromptSections(
    role as (typeof WRITER_ROLES)[number],
  );
}

describe('AI-first prompt rendering', () => {
  test.each([
    [
      'OpenCode',
      () => String(renderOpenCodeAgentConfigs().orchestrator?.prompt ?? ''),
    ],
    ['Codex', renderCodexRootInstructions],
    ['Claude Code', renderClaudeCodeRootInstructions],
    ['Pi', renderPiRootInstructions],
  ] as const)('offers both planning choices with bounded defaults in %s', (_harness, render) => {
    const prompt = render();
    expect(prompt).toContain('Review plan with Oracle (Recommended)');
    expect(prompt).toContain('Implement directly');
    expect(prompt).toMatch(
      /After.*\[OKAY\].*Implement \(Recommended\).*Stop with approved plan/,
    );
    expect(prompt).toMatch(/even when.*already authorized/);
    expect(prompt).toMatch(/three total native attempts.*each question/);
    expect(prompt).toMatch(
      /third confirmed unanswered return.*recommended option/,
    );
    expect(prompt).toMatch(/Explicit answers.*Stop.*always win/);
    expect(prompt).toMatch(/pending.*unavailable.*failure.*never count/);
    expect(prompt).toMatch(/never.*secrets.*destructive.*product decisions/);
    expect(prompt).toMatch(/No implementation writer may approve/);
    expect(prompt).toMatch(/closes only after PASS/);
  });

  test.each([
    [
      'OpenCode',
      () => String(renderOpenCodeAgentConfigs().orchestrator?.prompt ?? ''),
    ],
    ['Codex', renderCodexRootInstructions],
    ['Claude Code', renderClaudeCodeRootInstructions],
    ['Pi', renderPiRootInstructions],
  ] as const)('preserves pre-plan guarantees and artifact-free delegation in %s', (_harness, render) => {
    const prompt = render();
    expect(prompt).toMatch(/classify.*questions.*research.*changes/i);
    expect(prompt).toMatch(
      /direct work.*delegate.*without.*planning artifacts/i,
    );
    expect(prompt).toMatch(/delegation.*unit count.*do not.*persistence/i);
    expect(prompt).toMatch(/reclassify.*material.*uncertainty.*risk/i);
    expect(prompt).toMatch(/before planning: explore -> specify -> clarify/i);
    expect(prompt).toMatch(/investigate facts.*reuse decisions/i);
    expect(prompt).toMatch(/material uncertainty.*blocks.*readiness/i);
    expect(prompt).toMatch(/bounded technical unknowns.*resolution strategy/i);
    expect(prompt).toMatch(
      /thoth-work references\/planning\.md before persisting/i,
    );
    expect(prompt).toMatch(/architectural-grilling.*only.*explicit.*material/i);
    expect(prompt).toMatch(/no separate.*discovery.*specification.*documents/i);
  });

  test('special-cases only the built-in OpenAI model family', () => {
    expect(detectModelFamilyFromModel('openai/gpt-5.6-sol')).toBe('openai');
    expect(detectModelFamilyFromModel('kimi-for-coding/k2p5')).toBeUndefined();
  });

  test.each(DIALECTS)('renders the minimal workflow in $harness', (dialect) => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      dialect,
    );
    expect(prompt).toContain('.thoth/changes/<id>/work.yaml');
    expect(prompt).toContain('plan -> execute -> resume -> verify -> close');
    expect(prompt).toContain(
      'Trivial bounded work may follow implement -> verify',
    );
    expect(prompt).toContain('Existing authorization persists');
    expect(prompt).toContain(
      'technical replanning within the agreement does not require fresh approval',
    );
    expect(prompt).toContain('Review plan with Oracle (Recommended)');
    expect(prompt).toContain('No implementation writer may approve');
    expect(prompt).not.toMatch(/Accelerated SDD|Full SDD|route-selection/i);
    expect(prompt).not.toMatch(/openspec\//i);
  });

  test.each(
    DIALECTS,
  )('renders continuous dependency-ready dispatch in $harness', (dialect) => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      dialect,
    );
    expect(prompt).toContain(
      'dispatch every admitted conflict-free ready unit before waiting',
    );
    expect(prompt).toContain(
      'refill freed capacity with newly ready consumers before another wait',
    );
    expect(prompt).toContain('no global wave barrier');
    expect(prompt).toContain('root-accepted, and fresh');
    expect(prompt).toContain(dialect.tools.backgroundDelegationTool);
    expect(prompt).toContain(dialect.tools.lifecycle.terminalState);
    expect(prompt).toContain(dialect.tools.lifecycle.nonterminalState);
  });

  test.each(
    DIALECTS,
  )('keeps native state authoritative and recovery bounded in $harness', (dialect) => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      dialect,
    );
    expect(prompt).toContain(
      'Harness-native spawn, status, wait, steering, cancellation, and terminal results are the sole authority',
    );
    expect(prompt).toContain(
      'never invent an executor, queue, scheduler, portable wait API, or lifecycle mirror',
    );
    expect(prompt).toContain('never establish native liveness');
    expect(prompt).toContain('pending checkpoint');
    expect(prompt).toContain('relevant diff and dirty files');
    expect(prompt).toContain('dependency fingerprints');
    expect(prompt).toContain('reconcile external effects before replay');
    expect(prompt).toContain(
      'unknown native liveness blocks only the conflicting surface',
    );
    expect(prompt).toContain('Worktree automation is deferred');
  });

  test.each(
    DIALECTS,
  )('renders the work-unit envelope in $harness', (dialect) => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      dialect,
    );
    for (const heading of [
      'PHASE / WORK',
      'UNIT',
      'OBJECTIVE',
      'INPUTS',
      'REQUIREMENTS',
      'BOUNDARIES',
      'VERIFICATION',
      'EXPECTED OUTPUT',
      'HANDOFF',
      'MEMORY',
    ])
      expect(prompt).toContain(heading);
  });

  test.each(
    DIALECTS,
  )('renders all specialists as native tasks in $harness', (dialect) => {
    for (const role of [...READ_ONLY_ROLES, ...WRITER_ROLES]) {
      const prompt = renderRolePrompt(sectionsFor(role), dialect);
      expect(prompt).toContain(`Dispatch: ${dialect.dispatchLabel('task')}`);
      expect(prompt).toContain('Do not delegate further');
      expect(prompt).not.toContain('synchronous task only');
    }
  });

  test('keeps read-only and writer boundaries', () => {
    const explorer = renderRolePrompt(
      sectionsFor('explorer'),
      OPENCODE_PROMPT_DIALECT,
    );
    const deep = renderRolePrompt(sectionsFor('deep'), OPENCODE_PROMPT_DIALECT);
    const oracle = renderRolePrompt(
      sectionsFor('oracle'),
      OPENCODE_PROMPT_DIALECT,
    );
    expect(explorer).toContain('Do not mutate the workspace');
    expect(deep).toContain('Edit only the assigned work-unit surface');
    expect(oracle).toContain('independent judgment');
    expect(oracle).toContain('cannot substitute');
  });

  test('keeps project work evidence independent from provider memory', () => {
    for (const dialect of DIALECTS) {
      const root = renderRolePrompt(
        createOrchestratorPromptSections(),
        dialect,
      );
      expect(root).toContain('installed `thoth-mem` skill');
      expect(root).toContain('`.thoth/` is project work evidence');
      expect(root).toMatch(/do not mirror work artifacts/i);
      expect(root).not.toMatch(/mem_(?:save|recall|get|context)\s*\(/);
    }
  });

  test('uses each harness native lifecycle vocabulary', () => {
    const codex = renderCodexRootInstructions();
    const claude = renderClaudeCodeRootInstructions();
    const pi = renderPiRootInstructions();
    const opencode = String(
      renderOpenCodeAgentConfigs().orchestrator?.prompt ?? '',
    );
    expect(codex).toContain('collaboration.spawn_agent');
    expect(codex).toContain('collaboration.wait_agent');
    expect(claude).toContain('Agent(run_in_background=true)');
    expect(claude).toContain('TaskOutput');
    expect(opencode).toContain('task_status');
    expect(pi).toContain('subagents_enable({})');
    expect(pi).toContain('subagent({ agent, task');
    expect(pi).toContain('action: "status"');
    expect(pi).toContain('action: "stop"');
    expect(pi).not.toContain('subagent_run');
    expect(pi).not.toContain('subagent_result');
  });

  test('keeps child memory authorization and compact return fields', () => {
    for (const role of [...READ_ONLY_ROLES, ...WRITER_ROLES]) {
      const prompt = renderRolePrompt(
        sectionsFor(role),
        OPENCODE_PROMPT_DIALECT,
      );
      expect(prompt).toContain('`none`');
      expect(prompt).toContain('`recall`');
      expect(prompt).toContain('`observe`');
      for (const field of [
        'conclusion',
        'evidence',
        'verification',
        'risks',
        'openQuestions',
        'nextAction',
      ]) {
        expect(prompt).toContain(field);
      }
    }
  });

  test('keeps generated roots compact', () => {
    const roots = [
      String(renderOpenCodeAgentConfigs().orchestrator?.prompt ?? ''),
      renderCodexRootInstructions(),
      renderClaudeCodeRootInstructions(),
    ];
    // Keep the shared pre-plan guarantees bounded; detailed procedures stay routed.
    for (const root of roots) expect(root.length).toBeLessThan(12_500);
  });
});
