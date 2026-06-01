import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import type { SkillRegistryEntry } from '../core/skills';
import { getSkillRegistry } from '../core/skills';
import { renderCodexSkillLayout } from './skill-layout';

const sampleSkill: SkillRegistryEntry = {
  name: 'sdd-apply',
  description: 'Apply SDD tasks',
  allowedRoles: ['orchestrator'],
  sourcePath: 'src/skills/sdd-apply',
  kind: 'skill',
  purpose: 'sdd',
};

const SDD_SEMANTIC_ANCHORS: Record<string, string[]> = {
  'requirements-interview': [
    'mandatory step-0 entry point',
    'scope faithfulness',
    'new root session',
    'mem_session(action="start")',
    'mem_save(kind="prompt")',
    'artifact store policy choice',
    'Full SDD',
  ],
  'sdd-init': ['Bootstrap OpenSpec structure', 'Persistence Mode'],
  'sdd-propose': [
    'Create the proposal artifact',
    'Deferred / Needs Discovery',
    'Preserve the original user intent',
    'Persistence Mode',
  ],
  'sdd-spec': ['Write OpenSpec delta specs', 'Persistence Mode'],
  'sdd-design': [
    'Create `design.md`',
    'technical solution design',
    'Do not route this phase to the designer agent',
    'Persistence Mode',
  ],
  'sdd-tasks': [
    'proposal, spec, and design',
    'Preserve accepted proposal or spec scope and success criteria',
    'plan review',
    'Persistence Mode',
  ],
  'executing-plans': [
    'orchestrator owns task progress tracking',
    'must not contradict accepted proposal or spec scope',
    'Persistence mode determines target stores',
  ],
  'sdd-apply': [
    'Spec and design artifacts',
    'Proposal artifact',
    'Persistence Mode',
  ],
  'sdd-verify': ['Verify implementation against specs', 'Persistence Mode'],
  'sdd-archive': ['Close the SDD loop', 'Persistence Mode'],
  'plan-reviewer': [
    'pre-execution approval gate',
    'Focus on whether the plan can be executed as written',
    'persistence-mode',
    '[OKAY]',
    '[REJECT]',
  ],
};

const HANDOFF_SKILL_ANCHORS: Record<string, string[]> = {
  'thoth-mem-agents': [
    'Session close and compaction',
    'root-owned `mem_save(kind="session_summary")`',
    'carry recovery instructions, never the raw handoff body',
    'instruction-level due to runtime enforcement limits',
    'mem_context',
    'mem_project',
    'mem_recall(mode="compact")',
    'mem_recall(mode="context")',
    'mem_get(id=...)',
  ],
  '.codex-plugin/skills/_shared/persistence-contract.md': [
    'Delegated Handoffs',
    '`mem_session(action="checkpoint"|"summary")`',
    '`mem_save(kind="session_summary")`',
    'Subagents recover context through bounded recall',
    'Use HyDE/fused hybrid recall',
    '`topic_key`, `type`, `time_from`',
    '`mem_context(recall_query=...)` or bounded',
    '`mem_project(action="graph"|"topics"|"topic")`',
  ],
  '.codex-plugin/skills/_shared/thoth-mem-convention.md': [
    'Root-owned delegation handoffs',
    'parent-scoped recovery instructions',
    'deterministic SDD artifact',
    'mem_recall(mode="compact", query="topic_key:sdd/{change-name}/state")',
    'Use HyDE/fused hybrid recall',
    '`mem_get(include_timeline=true)` when chronology matters',
    '`mem_context(recall_query=...)` or bounded',
    '`mem_project(action="graph"|"topics"|"topic")`',
  ],
  '.codex-plugin/skills/_shared/openspec-convention.md': [
    'Delegated handoff summaries are not OpenSpec artifacts',
    'canonical OpenSpec paths',
  ],
};

function codexSkillContent(
  artifacts: ReturnType<typeof renderCodexSkillLayout>['artifacts'],
  skillName: string,
): string {
  const artifact = artifacts.find(
    (candidate) =>
      candidate.path === `.codex-plugin/skills/${skillName}/SKILL.md`,
  );

  expect(artifact).toBeDefined();
  return String(artifact?.content);
}

function codexSkillArtifactContent(
  artifacts: ReturnType<typeof renderCodexSkillLayout>['artifacts'],
  artifactPath: string,
): string {
  const artifact = artifacts.find(
    (candidate) => candidate.path === artifactPath,
  );

  expect(artifact).toBeDefined();
  return String(artifact?.content);
}

describe('Codex skill layout writer', () => {
  test('renders primary skills to the validated Codex plugin skill destination', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skills-'));
    try {
      const sourceDir = path.join(projectRoot, sampleSkill.sourcePath);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, 'SKILL.md'),
        '# Apply\n\nFollow persistence mode rules.',
      );

      const result = renderCodexSkillLayout({
        projectRoot,
        skills: [sampleSkill],
        surfaceId: 'plugin-skills-directory',
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
        '.codex-plugin/skills/sdd-apply/SKILL.md',
        '.codex-plugin/skills/.thoth-agents-manifest.json',
      ]);
      expect(result.artifacts[0].content).toContain('Follow persistence');
      expect(String(result.artifacts[1].content)).toContain(
        'src/skills/sdd-apply/SKILL.md',
      );
      expect(String(result.artifacts[1].content)).toContain('sha256:');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('renders .agents skills only when explicit fallback mode is selected', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skills-'));
    try {
      const sourceDir = path.join(projectRoot, sampleSkill.sourcePath);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Apply\n');

      const result = renderCodexSkillLayout({
        projectRoot,
        skills: [sampleSkill],
        surfaceId: 'repo-skills-directory',
        outputMode: 'repo-local-fallback',
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
        '.agents/skills/sdd-apply/SKILL.md',
        '.agents/skills/.thoth-agents-manifest.json',
      ]);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('skips unvalidated skill destinations with diagnostics', () => {
    const result = renderCodexSkillLayout({
      projectRoot: process.cwd(),
      skills: [sampleSkill],
      surfaceId: 'inline-hooks',
    });

    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'codex.surface.hooks.unvalidated',
      fallback: 'diagnostic-only',
    });
  });

  test('diagnoses missing skill sources without emitting absent content', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skills-'));
    try {
      const result = renderCodexSkillLayout({
        projectRoot,
        skills: [sampleSkill],
        surfaceId: 'plugin-skills-directory',
      });

      expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
        '.codex-plugin/skills/.thoth-agents-manifest.json',
      ]);
      expect(String(result.artifacts[0]?.content)).toContain('"skills": []');
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'codex.skill.source_missing',
          message: expect.stringContaining('src/skills/sdd-apply'),
        }),
      ]);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('SDD skills retain phase responsibilities when rendered for Codex', () => {
    const skills = getSkillRegistry().filter(
      (skill) =>
        skill.name in SDD_SEMANTIC_ANCHORS || skill.kind === 'shared-support',
    );

    const result = renderCodexSkillLayout({
      projectRoot: process.cwd(),
      skills,
      surfaceId: 'plugin-skills-directory',
      outputMode: 'plugin-package',
    });

    expect(result.diagnostics).toEqual([]);

    for (const [skillName, anchors] of Object.entries(SDD_SEMANTIC_ANCHORS)) {
      const content = codexSkillContent(result.artifacts, skillName);

      for (const anchor of anchors) {
        expect(content).toContain(anchor);
      }
    }
  });

  test('Codex package retains multi-harness shared instruction anchors', () => {
    const sharedSupport = getSkillRegistry().filter(
      (skill) => skill.kind === 'shared-support',
    );

    const result = renderCodexSkillLayout({
      projectRoot: process.cwd(),
      skills: sharedSupport,
      surfaceId: 'plugin-skills-directory',
      outputMode: 'plugin-package',
    });

    expect(result.diagnostics).toEqual([]);
  });

  test('Codex package retains delegated handoff memory-governance anchors', () => {
    const skills = getSkillRegistry().filter(
      (skill) =>
        skill.name === 'thoth-mem-agents' || skill.kind === 'shared-support',
    );

    const result = renderCodexSkillLayout({
      projectRoot: process.cwd(),
      skills,
      surfaceId: 'plugin-skills-directory',
      outputMode: 'plugin-package',
    });

    expect(result.diagnostics).toEqual([]);

    for (const [target, anchors] of Object.entries(HANDOFF_SKILL_ANCHORS)) {
      const content = target.startsWith('.codex-plugin/')
        ? codexSkillArtifactContent(result.artifacts, target)
        : codexSkillContent(result.artifacts, target);

      for (const anchor of anchors) {
        expect(content).toContain(anchor);
      }
    }
  });

  test('SDD Codex skill manifest matches the deterministic fixture', () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'codex-skill-fixture-'),
    );
    try {
      const sourceDir = path.join(projectRoot, sampleSkill.sourcePath);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, 'SKILL.md'),
        '# Apply\n\nFollow persistence mode rules.',
      );
      const result = renderCodexSkillLayout({
        projectRoot,
        skills: [sampleSkill],
        surfaceId: 'plugin-skills-directory',
      });
      const manifest = result.artifacts.find(
        (artifact) =>
          artifact.path === '.codex-plugin/skills/.thoth-agents-manifest.json',
      );
      const fixture = fs.readFileSync(
        path.join(
          process.cwd(),
          'src/harness/__fixtures__/codex/skill-manifest.json',
        ),
        'utf8',
      );

      expect(String(manifest?.content)).toBe(fixture);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('duplicate plugin and fallback skill scopes emit unresolved precedence diagnostic', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skills-'));
    try {
      const sourceDir = path.join(projectRoot, sampleSkill.sourcePath);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Apply\n');

      const result = renderCodexSkillLayout({
        projectRoot,
        skills: [sampleSkill],
        surfaceId: 'plugin-skills-directory',
        outputModes: ['plugin-package', 'repo-local-fallback'],
      });

      expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
        '.codex-plugin/skills/sdd-apply/SKILL.md',
        '.agents/skills/sdd-apply/SKILL.md',
        '.codex-plugin/skills/.thoth-agents-manifest.json',
        '.agents/skills/.thoth-agents-manifest.json',
      ]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'codex.skill.duplicate_scope_precedence_unverified',
          message: expect.stringContaining('runtime precedence'),
        }),
      ]);
      expect(result.diagnostics[0]?.message).toContain(
        'Plugin-bundled skills are the intended primary package content',
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
