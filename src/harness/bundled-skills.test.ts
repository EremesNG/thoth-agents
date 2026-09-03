import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from './core/owned-skills';
import { generateIntegrationPackages } from './generate-integration-packages';

function runInit(
  script: string,
  project: string,
  extraArguments: string[] = [],
) {
  return spawnSync(
    process.execPath,
    [script, '--project', project, '--json', ...extraArguments],
    { encoding: 'utf8' },
  );
}

function readSkillFrontmatter(skillsRoot: string, skillName: string): string {
  const content = readFileSync(join(skillsRoot, skillName, 'SKILL.md'), 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    content,
  )?.[1];
  expect(frontmatter, `${skillName} frontmatter`).toBeDefined();
  return frontmatter ?? '';
}

function frontmatterString(frontmatter: string, field: string): string {
  const scalar = new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm')
    .exec(frontmatter)?.[1]
    .trim();
  expect(scalar, `${field} field`).toBeDefined();
  if (!scalar) return '';
  const quote = scalar[0];
  return (quote === '"' || quote === "'") && scalar.endsWith(quote)
    ? scalar.slice(1, -1)
    : scalar;
}

describe('bundled thoth-init', () => {
  test('initializes only the minimum OpenSpec governance structure', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-bundle-'));
    const project = mkdtempSync(join(tmpdir(), 'thoth-project-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });

      mkdirSync(join(project, '.codex'), { recursive: true });
      writeFileSync(
        join(project, '.codex', 'config.toml'),
        '[features]\nunrelated_feature = true\n',
      );
      writeFileSync(join(project, 'AGENTS.md'), '# Project instructions\n');

      const script = join(
        packageRoot,
        'plugin',
        'skills',
        'thoth-init',
        'scripts',
        'init.mjs',
      );
      const first = runInit(script, project);

      expect(first.status, first.stderr).toBe(0);
      const report = JSON.parse(first.stdout);
      expect(report).toMatchObject({
        status: 'ready',
        project,
      });
      expect(report).not.toHaveProperty('harness');
      expect(report).toHaveProperty('created');
      expect(report).toHaveProperty('managed');
      expect(report).toHaveProperty('preserved');

      for (const directory of [
        'changes',
        join('changes', 'archive'),
        'specs',
        'memory',
      ]) {
        expect(
          existsSync(join(project, 'openspec', directory)),
          directory,
        ).toBe(true);
      }
      expect(
        existsSync(join(project, 'openspec', 'memory', 'constitution.md')),
      ).toBe(true);
      const initializedConstitution = readFileSync(
        join(project, 'openspec', 'memory', 'constitution.md'),
        'utf8',
      );
      expect(initializedConstitution).not.toContain('YYYY-MM-DD');
      expect(initializedConstitution).toMatch(
        /\*\*Ratified\*\*: \d{4}-\d{2}-\d{2}<br>/,
      );
      expect(initializedConstitution).toMatch(
        /\*\*Last amended\*\*: \d{4}-\d{2}-\d{2}/,
      );
      expect(initializedConstitution).toContain(
        'Every route MUST include verification proportional',
      );
      expect(initializedConstitution).toMatch(
        /Trivial\s+deterministic Direct work MAY be verified by Root/i,
      );
      expect(initializedConstitution).toMatch(
        /Materially risky Direct work and[\s\S]+Accelerated or Full final verify MUST use a fresh independent read-only/i,
      );
      const constitutionValidator = spawnSync(
        process.execPath,
        [
          join(
            packageRoot,
            'plugin',
            'skills',
            'thoth-constitution',
            'scripts',
            'validate.mjs',
          ),
          '--constitution',
          join(project, 'openspec', 'memory', 'constitution.md'),
          '--json',
        ],
        { encoding: 'utf8' },
      );
      expect(constitutionValidator.status, constitutionValidator.stderr).toBe(
        0,
      );
      expect(existsSync(join(project, 'openspec', 'templates'))).toBe(false);
      expect(existsSync(join(project, '.agents'))).toBe(false);
      expect(existsSync(join(project, '.opencode'))).toBe(false);
      expect(existsSync(join(project, '.claude'))).toBe(false);
      expect(readFileSync(join(project, 'AGENTS.md'), 'utf8')).toBe(
        '# Project instructions\n',
      );
      expect(readFileSync(join(project, '.codex', 'config.toml'), 'utf8')).toBe(
        '[features]\nunrelated_feature = true\n',
      );
      expect(readdirSync(project).sort()).toEqual([
        '.codex',
        'AGENTS.md',
        'openspec',
      ]);

      const constitutionPath = join(
        project,
        'openspec',
        'memory',
        'constitution.md',
      );
      writeFileSync(constitutionPath, '# Project-owned constitution\n');

      const second = runInit(script, project);
      expect(second.status, second.stderr).toBe(0);
      expect(readFileSync(constitutionPath, 'utf8')).toBe(
        '# Project-owned constitution\n',
      );
      expect(JSON.parse(second.stdout)).toMatchObject({
        status: 'ready',
        created: [],
      });
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('preserves the constitution and ignores legacy templates byte-for-byte', () => {
    const project = mkdtempSync(join(tmpdir(), 'thoth-preserve-'));
    const script = join(
      process.cwd(),
      'skills',
      'thoth-init',
      'scripts',
      'init.mjs',
    );

    try {
      const constitutionPath = join(
        project,
        'openspec',
        'memory',
        'constitution.md',
      );
      const templatePath = join(project, 'openspec', 'templates', 'spec.md');
      mkdirSync(join(project, 'openspec', 'memory'), { recursive: true });
      mkdirSync(join(project, 'openspec', 'templates'), { recursive: true });
      writeFileSync(constitutionPath, '# Custom constitution\r\n');
      writeFileSync(templatePath, '# Custom spec template\r\n');

      const result = runInit(script, project);

      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(constitutionPath, 'utf8')).toBe(
        '# Custom constitution\r\n',
      );
      expect(readFileSync(templatePath, 'utf8')).toBe(
        '# Custom spec template\r\n',
      );
      const report = JSON.parse(result.stdout);
      expect(report.preserved).toContain(constitutionPath);
      expect([
        ...report.created,
        ...report.managed,
        ...report.preserved,
      ]).not.toContain(templatePath);
      expect(existsSync(join(project, '.agents'))).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('rejects obsolete harness arguments and nonexistent project roots', () => {
    const parent = mkdtempSync(join(tmpdir(), 'thoth-preflight-'));
    const project = join(parent, 'missing-project');
    const script = join(
      process.cwd(),
      'skills',
      'thoth-init',
      'scripts',
      'init.mjs',
    );

    try {
      const obsolete = runInit(script, parent, ['--harness', 'opencode']);
      expect(obsolete.status).not.toBe(0);
      expect(obsolete.stderr).toContain('Unknown argument: --harness');

      const missing = runInit(script, project);
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain('existing project directory');
      expect(existsSync(project)).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test('preflights path collisions before writing any OpenSpec assets', () => {
    const project = mkdtempSync(join(tmpdir(), 'thoth-collision-'));
    const script = join(
      process.cwd(),
      'skills',
      'thoth-init',
      'scripts',
      'init.mjs',
    );

    try {
      mkdirSync(join(project, 'openspec'));
      writeFileSync(join(project, 'openspec', 'changes'), 'collision\n');

      const result = runInit(script, project);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('must be a directory');
      expect(existsSync(join(project, 'openspec', 'memory'))).toBe(false);
      expect(existsSync(join(project, 'openspec', 'templates'))).toBe(false);
      expect(existsSync(join(project, 'openspec', '.thoth-agents.json'))).toBe(
        false,
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('initializes without a bundled SDD template directory', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-incomplete-'));
    const project = mkdtempSync(join(tmpdir(), 'thoth-project-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });
      rmSync(join(packageRoot, 'plugin', 'skills', 'thoth-sdd', 'templates'), {
        recursive: true,
        force: true,
      });
      const script = join(
        packageRoot,
        'plugin',
        'skills',
        'thoth-init',
        'scripts',
        'init.mjs',
      );

      const result = runInit(script, project);

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ status: 'ready' });
      expect(existsSync(join(project, 'openspec'))).toBe(true);
      expect(existsSync(join(project, 'openspec', 'templates'))).toBe(false);
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('canonical SDD bundle contracts', () => {
  test('publishes Agent Skills-compliant metadata in canonical and generated skills', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-skill-metadata-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });

      for (const skillsRoot of [
        join(process.cwd(), 'skills'),
        join(packageRoot, 'plugin', 'skills'),
      ]) {
        for (const skillName of THOTH_OWNED_SKILL_NAMES) {
          const frontmatter = readSkillFrontmatter(skillsRoot, skillName);
          const name = frontmatterString(frontmatter, 'name');
          const description = frontmatterString(frontmatter, 'description');
          const compatibility = frontmatterString(frontmatter, 'compatibility');

          expect(name).toBe(skillName);
          expect(name).toMatch(/^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/);
          expect(description.length).toBeGreaterThan(0);
          expect(description.length).toBeLessThanOrEqual(1024);
          expect(frontmatterString(frontmatter, 'license')).toBe('MIT');
          expect(compatibility.length).toBeLessThanOrEqual(500);
          expect(frontmatter).toMatch(
            /^metadata:\r?\n {2}author: thoth-agents\r?\n {2}version: ["']1\.0["']$/m,
          );
          expect(frontmatter).not.toMatch(/^allowed-tools:/m);
        }
      }
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('resolves workflow assets from the installed skill bundle', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-contracts-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });

      for (const skillsRoot of [
        join(process.cwd(), 'skills'),
        join(packageRoot, 'plugin', 'skills'),
      ]) {
        const sddRoot = join(skillsRoot, 'thoth-sdd');
        const sddSkill = readFileSync(join(sddRoot, 'SKILL.md'), 'utf8');
        const archiveSkill = readFileSync(
          join(skillsRoot, 'thoth-archive', 'SKILL.md'),
          'utf8',
        );
        const initSkill = readFileSync(
          join(skillsRoot, 'thoth-init', 'SKILL.md'),
          'utf8',
        );
        const planReviewerSkill = readFileSync(
          join(skillsRoot, 'plan-reviewer', 'SKILL.md'),
          'utf8',
        );
        const constitutionSkill = readFileSync(
          join(skillsRoot, 'thoth-constitution', 'SKILL.md'),
          'utf8',
        );
        const phaseTemplates = new Map([
          ['specify.md', 'spec.md'],
          ['plan.md', 'plan.md'],
          ['checklist.md', 'checklist.md'],
          ['tasks.md', 'tasks.md'],
          ['verify.md', 'verify-report.md'],
        ]);

        expect(sddSkill).toContain(
          'Resolve `<skill-dir>` as the directory containing this `SKILL.md`',
        );
        expect(sddSkill).toContain(
          '`<skill-dir>/references/phases/specify.md`',
        );
        expect(sddSkill).toContain('node "<skill-dir>/scripts/validate.mjs"');

        for (const [phase, template] of phaseTemplates) {
          const contract = readFileSync(
            join(sddRoot, 'references', 'phases', phase),
            'utf8',
          );
          expect(contract, phase).toContain(
            `<skill-dir>/templates/${template}`,
          );
        }

        expect(archiveSkill).toContain(
          '`<skills-root>/thoth-sdd/templates/archive-report.md`',
        );
        expect(archiveSkill).toContain(
          'node "<skills-root>/thoth-sdd/scripts/validate.mjs"',
        );
        expect(archiveSkill).toContain(
          'node "<skill-dir>/scripts/archive.mjs"',
        );
        expect(`${sddSkill}\n${archiveSkill}`).not.toContain(
          'openspec/templates/',
        );
        expect(initSkill).not.toContain('- `openspec/templates/`');
        expect(initSkill).toContain('node "<skill-dir>/scripts/init.mjs"');
        expect(initSkill).toMatch(
          /never (?:creates?|copies|validates|reads|synchronizes)[\s\S]+SDD\s+workflow templates/i,
        );
        expect(initSkill).toMatch(
          /legacy `openspec\/templates\/`[\s\S]+untouched/i,
        );
        expect(planReviewerSkill).toContain(
          'Resolve `<skill-dir>` as the directory containing this `SKILL.md`',
        );
        expect(planReviewerSkill).toContain(
          '`<skill-dir>/templates/plan-review.md`',
        );
        expect(constitutionSkill).toContain(
          'Resolve `<skill-dir>` as the directory containing this `SKILL.md`',
        );
        expect(constitutionSkill).toContain(
          'node "<skill-dir>/scripts/validate.mjs"',
        );
        expect(constitutionSkill).toContain(
          '`<skill-dir>/templates/constitution.md`',
        );
      }
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('defines a freshness-aware read-only plan review contract', () => {
    const skillPath = join(
      process.cwd(),
      'skills',
      'plan-reviewer',
      'SKILL.md',
    );
    const templatePath = join(
      process.cwd(),
      'skills',
      'plan-reviewer',
      'templates',
      'plan-review.md',
    );

    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(templatePath)).toBe(true);

    const skill = readFileSync(skillPath, 'utf8');
    const template = readFileSync(templatePath, 'utf8');

    expect(skill).toContain('name: plan-reviewer');
    expect(skill).toContain('[OKAY]');
    expect(skill).toContain('[REJECT]');
    expect(skill).toContain('at most 3 actionable blockers');
    expect(skill).toContain('SHA-256');
    expect(skill).toMatch(/Oracle.*read-only/is);
    expect(skill).toMatch(/Root.*persists.*plan-review\.md/is);
    expect(skill).toMatch(
      /approved scope.*approach.*ownership.*verification.*risks/is,
    );
    expect(skill).toContain('`Implement (Recommended)` or `Stop`');
    expect(skill).toMatch(
      /implementation question.*three\s+total\s+attempts/is,
    );
    expect(skill).toMatch(/third answerless.*implementation.*selected/is);
    expect(skill).toMatch(/explicit.*`Stop`.*wins/is);
    expect(skill).toMatch(/\[OKAY\].*alone.*not.*authorize/is);
    expect(skill).toContain('mandatory final verification');
    expect(skill).toMatch(/do not mirror.*provider memory/is);
    expect(skill).toContain('## Native parallel executability');
    expect(skill).toMatch(
      /structural ready validation.*semantic independence/is,
    );
    expect(skill).toMatch(/lane path union.*owner/is);
    expect(skill).toMatch(/prerequisites.*barrier/is);
    expect(skill).toMatch(/native capacity.*dispatch-before-wait/is);
    expect(skill).toContain('truthful sequential fallback');
    expect(template).toContain('**Status**: [OKAY|REJECT]');
    expect(template).toContain('## Source SHA-256');
    expect(template).toContain('spec.md');
    expect(template).toContain('plan.md');
    expect(template).toContain('tasks.md');
  });

  test('defines bounded recommended defaults for route and plan review choices', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-sdd-defaults-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });

      for (const skillsRoot of [
        join(process.cwd(), 'skills'),
        join(packageRoot, 'plugin', 'skills'),
      ]) {
        const sdd = readFileSync(
          join(skillsRoot, 'thoth-sdd', 'SKILL.md'),
          'utf8',
        );
        const planReview = readFileSync(
          join(skillsRoot, 'plan-reviewer', 'SKILL.md'),
          'utf8',
        );

        expect(sdd).toMatch(/three total attempts/i);
        expect(sdd).toMatch(/third answerless.*recommended route.*selected/is);
        expect(sdd).toMatch(
          /third answerless.*Review plan with Oracle \(Recommended\).*selected/is,
        );
        expect(planReview).toMatch(/three total attempts/i);
        expect(planReview).toMatch(
          /third answerless.*Review plan with Oracle \(Recommended\).*selected/is,
        );
        expect(planReview).toMatch(/explicit.*Proceed without review.*wins/is);
        expect(planReview).toMatch(/repair.*planning artifacts/is);
        expect(planReview).toMatch(/revalidate.*affected.*gate/is);
        expect(planReview).toMatch(/fresh Oracle.*until.*\[OKAY\]/is);
        expect(planReview).toMatch(/material human-owned blocker/i);
        expect(sdd).toMatch(
          /bounded fallbacks apply only to the route, plan-review, and implementation\s+questions/is,
        );
        expect(sdd).toMatch(
          /never.*secrets.*destructive.*security-sensitive.*material human-owned/is,
        );
      }
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('keeps the constitutional template aligned with bounded SDD defaults', () => {
    const packageRoot = mkdtempSync(
      join(tmpdir(), 'thoth-constitution-defaults-'),
    );

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });

      for (const skillsRoot of [
        join(process.cwd(), 'skills'),
        join(packageRoot, 'plugin', 'skills'),
      ]) {
        const constitution = readFileSync(
          join(
            skillsRoot,
            'thoth-constitution',
            'templates',
            'constitution.md',
          ),
          'utf8',
        );

        expect(constitution).toMatch(/three\s+total\s+attempts/i);
        expect(constitution).toMatch(/recommended route.*selected/is);
        expect(constitution).toMatch(
          /Review plan with Oracle \(Recommended\).*selected/is,
        );
        expect(constitution).toMatch(
          /approved plan.*summary.*Implement \(Recommended\)/is,
        );
        expect(constitution).toMatch(
          /third answerless.*implementation.*selected/is,
        );
        expect(constitution).toMatch(/explicit.*answer.*wins/is);
        expect(constitution).not.toMatch(
          /plan review is optional and user-selected/i,
        );
      }
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('keeps public SDD guidance free of explicit-user-only plan-review wording', () => {
    for (const relativePath of [
      'README.md',
      'skills/README.md',
      'docs/agent/architecture.md',
      'docs/agent/sdd-and-skills.md',
      'docs/claude-code-install.md',
      'docs/claude-code-plugin-packaging.md',
      'docs/codex-install.md',
      'docs/quick-reference.md',
      'docs/sdd-pipeline.md',
      'docs/skills-and-mcps.md',
    ]) {
      const content = readFileSync(join(process.cwd(), relativePath), 'utf8');

      expect(content, relativePath).not.toMatch(
        /user-selected plan review|only after the user selects review|optional when the user selects Oracle review|oracle owns user-selected plan review/i,
      );
    }

    const codexInstall = readFileSync(
      join(process.cwd(), 'docs', 'codex-install.md'),
      'utf8',
    );
    expect(codexInstall).toMatch(/summarizes.*context.*before.*route/is);
    expect(codexInstall).toMatch(/explicit answer.*wins/is);
    expect(codexInstall).toMatch(/third answerless.*selects.*recommendation/is);
    expect(codexInstall).not.toMatch(/follows the user's selection/i);
  });

  test('keeps final verification mandatory with route- and risk-aware ownership', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-verification-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });

      for (const skillsRoot of [
        join(process.cwd(), 'skills'),
        join(packageRoot, 'plugin', 'skills'),
      ]) {
        const constitution = readFileSync(
          join(
            skillsRoot,
            'thoth-constitution',
            'templates',
            'constitution.md',
          ),
          'utf8',
        );
        const sdd = readFileSync(
          join(skillsRoot, 'thoth-sdd', 'SKILL.md'),
          'utf8',
        );
        const implement = readFileSync(
          join(skillsRoot, 'thoth-sdd', 'references', 'phases', 'implement.md'),
          'utf8',
        );
        const verify = readFileSync(
          join(skillsRoot, 'thoth-sdd', 'references', 'phases', 'verify.md'),
          'utf8',
        );
        const planReview = readFileSync(
          join(skillsRoot, 'plan-reviewer', 'SKILL.md'),
          'utf8',
        );
        expect(constitution).toContain(
          'Every route MUST include verification proportional',
        );
        expect(constitution).toMatch(
          /trivial\s+deterministic Direct work MAY be verified by Root/i,
        );
        expect(constitution).toMatch(
          /materially risky Direct work and\s+every Accelerated or Full final verify MUST use a fresh independent read-only\s+reviewer/i,
        );
        for (const routeContract of [sdd, implement, verify]) {
          expect(routeContract).toMatch(
            /every route requires[\s\S]+mandatory verification/i,
          );
          expect(routeContract).toMatch(
            /trivial deterministic Direct[\s\S]+(?:verified by Root|Root[\s\S]+focused checks)/i,
          );
          expect(routeContract).toMatch(
            /materially risky\s+Direct[\s\S]+Accelerated or Full[\s\S]+fresh read-only\s+Oracle/i,
          );
          expect(routeContract).toMatch(
            /implementation\s+writer never approves/i,
          );
        }
        expect(planReview).toMatch(
          /Every route still requires post-implementation verification/i,
        );
        expect(planReview).toMatch(
          /trivial deterministic Direct[\s\S]+Root-verified[\s\S]+materially risky Direct[\s\S]+Accelerated or Full[\s\S]+fresh read-only Oracle/i,
        );
        expect(planReview).toMatch(
          /plan review[\s\S]+never (?:replaces|substitutes for)[\s\S]+final verification/i,
        );
        expect(planReview).not.toContain(
          'Every route still requires independent post-implementation verification by a non-writer.',
        );
      }
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('teaches baseline-relative durable requirements and typed success criteria', () => {
    const spec = readFileSync(
      join(process.cwd(), 'skills', 'thoth-sdd', 'templates', 'spec.md'),
      'utf8',
    );
    const specify = readFileSync(
      join(
        process.cwd(),
        'skills',
        'thoth-sdd',
        'references',
        'phases',
        'specify.md',
      ),
      'utf8',
    );

    expect(spec).toContain('## Intent and scope');
    expect(spec).toContain('**Affected capabilities**');
    expect(spec).toContain('**Covers**: FR-001, SC-001');
    expect(spec).toContain('`[DELTA capability-slug]`');
    expect(spec).not.toMatch(/^- \*\*FR-001.+`\[ADDED/m);
    expect(`${spec}\n${specify}`).toMatch(
      /ADDED[\s\S]+MODIFIED[\s\S]+REMOVED[\s\S]+RENAMED/,
    );
    expect(specify).toContain('openspec/specs/<capability>/spec.md');
    expect(specify).toContain('semantic-overlap review');
    expect(spec).toContain('`[buildable]`');
    expect(spec).toContain('`[outcome]`');
  });

  test('keeps parallelism and checklist revalidation honest and conditional', () => {
    const tasks = readFileSync(
      join(process.cwd(), 'skills', 'thoth-sdd', 'templates', 'tasks.md'),
      'utf8',
    );
    const checklist = readFileSync(
      join(process.cwd(), 'skills', 'thoth-sdd', 'templates', 'checklist.md'),
      'utf8',
    );

    expect(tasks).toContain('`- None: <evidence-backed reason>`');
    expect(tasks).toContain('<!-- PARALLEL-EXECUTION-EVIDENCE -->');
    expect(checklist).toContain('**Activation reason**');
    expect(checklist).toContain('## Domain lenses');
    expect(checklist).toContain('Not required: [evidence-backed reason]');
  });

  test('defines native dispatch groups, lanes, and lifecycle barriers', () => {
    const tasks = readFileSync(
      join(process.cwd(), 'skills', 'thoth-sdd', 'templates', 'tasks.md'),
      'utf8',
    );
    const phaseTasks = readFileSync(
      join(
        process.cwd(),
        'skills',
        'thoth-sdd',
        'references',
        'phases',
        'tasks.md',
      ),
      'utf8',
    );
    const implement = readFileSync(
      join(
        process.cwd(),
        'skills',
        'thoth-sdd',
        'references',
        'phases',
        'implement.md',
      ),
      'utf8',
    );
    for (const contract of [tasks, phaseTasks]) {
      expect(contract).toContain('### Group P1');
      expect(contract).toContain('Lane L1: T001 -> T002 | Owner: deep');
      expect(contract).toContain('Prerequisites: None');
      expect(contract).toContain('Barrier: Final verification');
      expect(contract).toContain('Rationale:');
      expect(contract).toMatch(
        /Every `\[P\]` task belongs to exactly one lane/i,
      );
      expect(contract).toMatch(/cross-lane.*(?:disjoint|dependency)/i);
      expect(contract).toMatch(
        /Rationale.*path-disjointness.*cross-lane dependency\s+evidence/is,
      );
      expect(contract).toContain('- None: <evidence-backed reason>');
      expect(contract).not.toMatch(/concrete (?:task )?pairings?/i);
    }
    for (const assertion of [
      'one fresh native specialist assignment per admitted lane',
      'every dispatch in that native wave before any wait',
      'dispatch the next undispatched ready lane before waiting again',
      'root alone updates task state',
      'terminal evidence per lane',
      'only after every lane is terminal and reconciled',
      'truthful sequential fallback',
    ]) {
      expect(implement.toLowerCase()).toContain(assertion.toLowerCase());
    }
    expect(implement).not.toMatch(/wait_all|fixed concurrency/i);
  });

  test('keeps plan and task scaffolds parser-inert until populated', () => {
    const plan = readFileSync(
      join(process.cwd(), 'skills', 'thoth-sdd', 'templates', 'plan.md'),
      'utf8',
    );
    const tasks = readFileSync(
      join(process.cwd(), 'skills', 'thoth-sdd', 'templates', 'tasks.md'),
      'utf8',
    );

    expect(plan).toContain('one ordered name set');
    expect(plan).toContain('<!-- PRE-DESIGN-CONSTITUTION-ENTRIES -->');
    expect(plan).toContain('<!-- POST-DESIGN-CONSTITUTION-ENTRIES -->');
    expect(plan).not.toMatch(/^- \*\*\[Exact principle heading/m);
    expect(tasks).toContain('start at `T001`');
    expect(tasks).toContain('exactly one backtick span');
    expect(tasks).toContain('<!-- STORY-US1-TASKS -->');
    expect(tasks).toContain('<!-- FINAL-VERIFICATION-TASKS -->');
    expect(tasks).not.toMatch(/^- \[[ x~]\] T\d{3}/m);
  });

  test('keeps verification and archive templates aligned with closeout fields', () => {
    const verifyReport = readFileSync(
      join(
        process.cwd(),
        'skills',
        'thoth-sdd',
        'templates',
        'verify-report.md',
      ),
      'utf8',
    );
    const archiveReport = readFileSync(
      join(
        process.cwd(),
        'skills',
        'thoth-sdd',
        'templates',
        'archive-report.md',
      ),
      'utf8',
    );

    for (const dimension of ['Completeness', 'Correctness', 'Coherence']) {
      expect(verifyReport).toContain(`- **${dimension}**:`);
    }
    expect(verifyReport).toContain('## Compliance matrix');
    expect(verifyReport).toContain('SC-001 `[buildable]`');
    expect(verifyReport).toContain('SC-002 `[outcome]`');
    expect(verifyReport).toContain('## Residual risks');
    expect(archiveReport).toContain('**Status**: READY');
    expect(archiveReport).toContain(
      '`openspec/changes/archive/YYYY-MM-DD-[feature]/`',
    );
    expect(archiveReport).toContain(
      'Pending: archive applies declared durable deltas transactionally.',
    );
  });

  test('documents fast-forward gates and archive-ready closeout', () => {
    const skill = readFileSync(
      join(process.cwd(), 'skills', 'thoth-sdd', 'SKILL.md'),
      'utf8',
    );
    const archive = readFileSync(
      join(
        process.cwd(),
        'skills',
        'thoth-sdd',
        'templates',
        'archive-report.md',
      ),
      'utf8',
    );

    expect(skill).toContain('fast-forward');
    expect(skill).toContain('ready|closeout');
    expect(skill).not.toContain('|final>');
    expect(archive).toContain('**Status**: READY');
    expect(archive).toContain('## Canonical specification sync');
  });
});
