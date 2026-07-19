import { describe, expect, test } from 'vitest';
import type { AgentRoleName } from '../harness/core/agent-pack';
import {
  CLAUDE_CODE_PROMPT_DIALECT,
  CODEX_PROMPT_DIALECT,
  OPENCODE_PROMPT_DIALECT,
} from './prompt-dialects';
import {
  createCoordinationSpecialistPromptSections,
  createOrchestratorPromptSections,
  createReadOnlySpecialistPromptSections,
  createWriteCapableSpecialistPromptSections,
  detectModelFamilyFromModel,
  renderRolePrompt,
} from './prompt-sections';

const READ_ONLY_ROLES = ['explorer', 'librarian', 'oracle'] as const;
const COORDINATION_ROLES = ['sdd-specify', 'sdd-plan', 'sdd-tasks'] as const;
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
  if ((COORDINATION_ROLES as readonly string[]).includes(role)) {
    return createCoordinationSpecialistPromptSections(
      role as (typeof COORDINATION_ROLES)[number],
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

  test('routes Spec Kit phases to the three coordination agents', () => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('@sdd-specify');
    expect(prompt).toContain('@sdd-plan');
    expect(prompt).toContain('@sdd-tasks');
    expect(prompt).toContain('spec.md');
    expect(prompt).toContain('plan.md');
    expect(prompt).toContain('tasks.md');
    expect(prompt).toContain('openspec/changes/<feature>/');
    expect(prompt).toContain('verify -> archive');
    expect(prompt).toContain(
      'Artifact-backed failure loop: verify fail -> converge -> implement -> verify',
    );
    expect(prompt).toContain(
      'Direct failure loop: verify fail -> implement -> verify',
    );
  });

  test('gives the adaptive root compact contracts for phases it executes', () => {
    const prompt = renderRolePrompt(
      createOrchestratorPromptSections(),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('<root-phase-modes>');
    expect(prompt).toContain('phase=implement');
    expect(prompt).toContain('phase=verify');
    expect(prompt).toContain('verdict: pass | fail');
    expect(prompt).toContain('phase=archive');
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
  });

  test.each(
    COORDINATION_ROLES,
  )('limits %s to governed coordination writes', (role) => {
    const prompt = renderRolePrompt(
      createCoordinationSpecialistPromptSections(role),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain(`You are ${role}`);
    expect(prompt).toContain('coordination-write');
    expect(prompt).toContain('openspec/');
    expect(prompt).toContain('Do not edit product code');
    expect(prompt).not.toContain('artifactSkill');
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

  test('distinguishes oracle analyze and verify phase modes', () => {
    const prompt = renderRolePrompt(
      createReadOnlySpecialistPromptSections('oracle'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('phase=analyze');
    expect(prompt).toContain('cross-artifact consistency');
    expect(prompt).toContain('requirement coverage');
    expect(prompt).toContain('phase=verify');
    expect(prompt).toContain('compliance matrix');
    expect(prompt).toContain('verify-report.md');
  });

  test('gives explorer an explicit evidence handoff to specification', () => {
    const prompt = renderRolePrompt(
      createReadOnlySpecialistPromptSections('explorer'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('phase=explore');
    expect(prompt).toContain('relevant paths');
    expect(prompt).toContain('handoff');
    expect(prompt).toContain('specify');
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

  test('gives quick distinct implement and archive protocols', () => {
    const prompt = renderRolePrompt(
      createWriteCapableSpecialistPromptSections('quick'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('phase=implement');
    expect(prompt).toContain('assigned implementation surface');
    expect(prompt).toContain('phase=archive');
    expect(prompt).toContain('archive-report.md');
    expect(prompt).toMatch(/must not implicitly merge/i);
  });

  test('gives sdd-tasks an append-only convergence mode', () => {
    const prompt = renderRolePrompt(
      createCoordinationSpecialistPromptSections('sdd-tasks'),
      OPENCODE_PROMPT_DIALECT,
    );

    expect(prompt).toContain('phase=tasks');
    expect(prompt).toContain('phase=converge');
    expect(prompt).toContain('append-only');
    expect(prompt).toContain('Do not edit product code');
  });

  test('uses the shared compact child return contract', () => {
    for (const role of [
      ...READ_ONLY_ROLES,
      ...COORDINATION_ROLES,
      ...WRITER_ROLES,
    ]) {
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
    expect(claude).toContain('thoth-agents:sdd-specify');
    expect(claude).not.toContain('collaboration.spawn_agent');
  });
});
