import { describe, expect, test } from 'vitest';
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

function sectionsFor(role: AgentRoleName) {
  if (role === 'orchestrator') {
    return createOrchestratorPromptSections();
  }
  if ((READ_ONLY_ROLES as readonly string[]).includes(role)) {
    return createReadOnlySpecialistPromptSections(
      role as (typeof READ_ONLY_ROLES)[number],
    );
  }
  return createWriteCapableSpecialistPromptSections(
    role as (typeof WRITER_ROLES)[number],
  );
}

describe('v0.3 prompt rendering', () => {
  test('special-cases only the built-in OpenAI model family', () => {
    expect(detectModelFamilyFromModel('openai/gpt-5.6-sol')).toBe('openai');
    expect(detectModelFamilyFromModel('kimi-for-coding/k2p5')).toBeUndefined();
    expect(
      detectModelFamilyFromModel('github-copilot/claude-opus-4.6'),
    ).toBeUndefined();
    expect(detectModelFamilyFromModel('zai-coding-plan/glm-5')).toBeUndefined();
  });

  test.each([
    OPENCODE_PROMPT_DIALECT,
    CODEX_PROMPT_DIALECT,
    CLAUDE_CODE_PROMPT_DIALECT,
  ])('keeps the $harness root compact and adaptive', (dialect) => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      dialect,
    );

    expect(prompt.length).toBeLessThan(8_000);
    expect(prompt).toContain('adaptive root');
    expect(prompt).toContain('bounded direct work');
    expect(prompt).toContain('net gain');
    expect(prompt).toContain('maximum delegation depth is 1');
    expect(prompt).toContain('one writer');
    expect(prompt).toContain('Direct');
    expect(prompt).toContain('Accelerated SDD');
    expect(prompt).toContain('Full SDD');

    for (const legacy of [
      'delegate-first',
      'requirements-interview',
      'sdd-propose',
      'sdd-init',
      'plan-review.md',
      'executing-plans',
    ]) {
      expect(prompt).not.toContain(legacy);
    }
  });

  test('keeps Spec Kit coordination in root and independent review in oracle', () => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).not.toMatch(/@sdd-(?:specify|plan|tasks)/);
    expect(prompt).toContain(
      'Root owns specify, clarify, plan, checklist, tasks',
    );
    expect(prompt).toContain(
      'Delegate analyze and every verify phase to @oracle',
    );
    expect(prompt).toContain('bundled `thoth-sdd` skill');
    expect(prompt).toContain('spec.md');
    expect(prompt).toContain('plan.md');
    expect(prompt).toContain('tasks.md');
    expect(prompt).toContain('verify -> archive');
    expect(prompt).toContain(
      'Artifact-backed failure loop: verify fail -> converge -> implement -> verify',
    );
    expect(prompt).toContain(
      'Direct failure loop: verify fail -> implement -> verify',
    );
  });

  test('loads phase contracts on demand instead of inlining them', () => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('read only the reference for the current phase');
    expect(prompt).toContain('thoth-sdd validator');
    expect(prompt).not.toContain('<root-phase-modes>');
    expect(prompt).not.toContain('<phase-protocol phase=verify>');
  });

  test.each([
    OPENCODE_PROMPT_DIALECT,
    CODEX_PROMPT_DIALECT,
    CLAUDE_CODE_PROMPT_DIALECT,
  ])('requires the canonical SDD dispatch envelope in $harness', (dialect) => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      dialect,
    );

    for (const heading of [
      'PHASE',
      'ROUTE / CHANGE',
      'OBJECTIVE',
      'INPUT ARTIFACTS',
      'REQUIREMENTS',
      'BOUNDARIES',
      'VERIFICATION',
      'EXPECTED OUTPUT',
      'HANDOFF',
    ]) {
      expect(prompt).toContain(heading);
    }
  });

  test.each([
    OPENCODE_PROMPT_DIALECT,
    CODEX_PROMPT_DIALECT,
    CLAUDE_CODE_PROMPT_DIALECT,
  ])('uses external decision and context skills only for their bounded triggers in $harness', (dialect) => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      dialect,
    );

    expect(prompt).toContain('progressive-context-router');
    expect(prompt).toContain('repository instruction or context-router work');
    expect(prompt).toContain('architectural-grilling');
    expect(prompt).toContain('before specification');
    expect(prompt).toContain('explicitly asks');
    expect(prompt).toContain(
      'material human-owned product or architecture decisions',
    );
    expect(prompt).toContain(
      'Do not invoke it merely because the route is Full',
    );
    expect(prompt).toContain('spec.md and plan.md remain canonical');
    expect(prompt).toContain(
      'never invoke the thoth-agents CLI, `npx skills add`',
    );
    expect(prompt).toContain('incomplete installation');
  });

  test.each(READ_ONLY_ROLES)('keeps %s read-only', (role) => {
    const prompt = renderRolePrompt(
      createReadOnlySpecialistPromptSections(role),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain(`You are ${role}`);
    expect(prompt).toContain('read-only');
    expect(prompt).toContain('Do not mutate the workspace');
  });

  test('makes oracle the independent on-demand analyze and verify reviewer', () => {
    const prompt = renderRolePrompt(
      createReadOnlySpecialistPromptSections('oracle'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('matching bundled thoth-sdd reference');
    expect(prompt).toContain('remain read-only');
    expect(prompt).toContain('Reject self-review');
    expect(prompt).toContain('requirements and contracts');
    expect(prompt).not.toContain('<phase-protocol');
  });

  test('keeps explorer focused on decision-ready repository evidence', () => {
    const prompt = renderRolePrompt(
      createReadOnlySpecialistPromptSections('explorer'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('paths, symbols, and concise anchors');
    expect(prompt).toContain('decision-ready');
    expect(prompt).not.toContain('<phase-protocol');
  });

  test.each(WRITER_ROLES)('keeps %s as a bounded leaf writer', (role) => {
    const prompt = renderRolePrompt(
      createWriteCapableSpecialistPromptSections(role),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain(`You are ${role}`);
    expect(prompt).toContain('write-capable');
    expect(prompt).toContain('Do not delegate further');
  });

  test('keeps quick bounded to implementation rather than coordination', () => {
    const prompt = renderRolePrompt(
      createWriteCapableSpecialistPromptSections('quick'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('smallest complete edit');
    expect(prompt).not.toContain('archive-report.md');
    expect(prompt).not.toContain('coordination-write');
  });

  test('uses the shared compact child return contract', () => {
    for (const role of [...READ_ONLY_ROLES, ...WRITER_ROLES]) {
      const prompt = renderRolePrompt(
        sectionsFor(role),
        OPENCODE_PROMPT_DIALECT,
      );

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

  test('renders harness-native delegation without leaking OpenCode tools', () => {
    const codex = renderRolePrompt(
      createOrchestratorPromptSections(),
      CODEX_PROMPT_DIALECT,
    );
    const claude = renderRolePrompt(
      createOrchestratorPromptSections(),
      CLAUDE_CODE_PROMPT_DIALECT,
    );

    expect(codex).toContain('collaboration.spawn_agent');
    expect(codex).toContain('request_user_input');
    expect(codex).not.toContain('task_status');
    expect(codex).not.toContain('todowrite');

    expect(claude).toContain('Agent');
    expect(claude).toContain('AskUserQuestion');
    expect(claude).toContain('thoth-agents:oracle');
    expect(claude).not.toMatch(/thoth-agents:sdd-(?:specify|plan|tasks)/);
    expect(claude).not.toContain('collaboration.spawn_agent');
  });
});
