import { describe, expect, test } from 'vitest';
import { CUSTOM_SKILLS } from '../../cli/custom-skills';
import { renderCodexSkillLayout } from '../writers/skill-layout';
import {
  getBundledSkillRegistry,
  getSkillRegistry,
  SHARED_SKILL_SUPPORT,
} from './skills';

const PORTABLE_SDD_SKILLS = [
  'requirements-interview',
  'sdd-init',
  'sdd-propose',
  'sdd-spec',
  'sdd-design',
  'sdd-tasks',
  'executing-plans',
  'sdd-apply',
  'sdd-verify',
  'sdd-archive',
  'plan-reviewer',
];

describe('skill registry contract', () => {
  test('aligns bundled skill entries with custom-skills output', () => {
    expect(
      getBundledSkillRegistry().map((skill) => ({
        name: skill.name,
        description: skill.description,
        allowedAgents: skill.allowedRoles,
        sourcePath: skill.sourcePath,
      })),
    ).toEqual(CUSTOM_SKILLS);
  });

  test('includes requirements interview and all SDD workflow skills', () => {
    const names = getBundledSkillRegistry().map((skill) => skill.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'requirements-interview',
        'sdd-init',
        'sdd-propose',
        'sdd-spec',
        'sdd-design',
        'sdd-tasks',
        'executing-plans',
        'sdd-apply',
        'sdd-verify',
        'sdd-archive',
        'plan-reviewer',
      ]),
    );
  });

  test('records exact source paths and allowed role purpose metadata', () => {
    const sddApply = getBundledSkillRegistry().find(
      (skill) => skill.name === 'sdd-apply',
    );
    const planReviewer = getBundledSkillRegistry().find(
      (skill) => skill.name === 'plan-reviewer',
    );

    expect(sddApply).toMatchObject({
      sourcePath: 'src/skills/sdd-apply',
      allowedRoles: ['orchestrator'],
      purpose: 'sdd',
    });
    expect(planReviewer).toMatchObject({
      sourcePath: 'src/skills/plan-reviewer',
      allowedRoles: ['orchestrator', 'oracle'],
      purpose: 'review',
    });
  });

  test('includes shared skill support files without making them install skills', () => {
    expect(SHARED_SKILL_SUPPORT).toMatchObject({
      name: '_shared',
      sourcePath: 'src/skills/_shared',
      kind: 'shared-support',
    });
    expect(getSkillRegistry().map((entry) => entry.name)).toContain('_shared');
    expect(CUSTOM_SKILLS.map((entry) => entry.name)).not.toContain('_shared');
  });

  test('SDD portability matrix keeps workflow skills in the shared registry', () => {
    const matrix = getBundledSkillRegistry()
      .filter((skill) => PORTABLE_SDD_SKILLS.includes(skill.name))
      .map((skill) => ({
        name: skill.name,
        purpose: skill.purpose,
        allowedRoles: skill.allowedRoles,
        sourcePath: skill.sourcePath,
      }));

    expect(matrix).toEqual([
      {
        name: 'requirements-interview',
        purpose: 'requirements',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/requirements-interview',
      },
      {
        name: 'plan-reviewer',
        purpose: 'review',
        allowedRoles: ['orchestrator', 'oracle'],
        sourcePath: 'src/skills/plan-reviewer',
      },
      {
        name: 'sdd-init',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-init',
      },
      {
        name: 'sdd-propose',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-propose',
      },
      {
        name: 'sdd-spec',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-spec',
      },
      {
        name: 'sdd-design',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-design',
      },
      {
        name: 'sdd-tasks',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-tasks',
      },
      {
        name: 'sdd-apply',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-apply',
      },
      {
        name: 'executing-plans',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/executing-plans',
      },
      {
        name: 'sdd-verify',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-verify',
      },
      {
        name: 'sdd-archive',
        purpose: 'sdd',
        allowedRoles: ['orchestrator'],
        sourcePath: 'src/skills/sdd-archive',
      },
    ]);
  });

  test('SDD portability matrix renders workflow skills under plugin-bundled Codex paths', () => {
    const result = renderCodexSkillLayout({
      projectRoot: process.cwd(),
      skills: getSkillRegistry().filter(
        (skill) =>
          PORTABLE_SDD_SKILLS.includes(skill.name) || skill.name === '_shared',
      ),
      surfaceId: 'plugin-skills-directory',
      outputMode: 'plugin-package',
    });

    expect(result.diagnostics).toEqual([]);
    for (const skillName of PORTABLE_SDD_SKILLS) {
      expect(result.artifacts.map((artifact) => artifact.path)).toContain(
        `.codex-plugin/skills/${skillName}/SKILL.md`,
      );
    }
  });
});
