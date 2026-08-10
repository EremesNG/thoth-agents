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
    expect(skill).toContain('ask whether to implement or stop');
    expect(skill).toContain('mandatory final Oracle verify');
    expect(skill).toMatch(/do not mirror.*provider memory/is);
    expect(template).toContain('**Status**: [OKAY|REJECT]');
    expect(template).toContain('## Source SHA-256');
    expect(template).toContain('spec.md');
    expect(template).toContain('plan.md');
    expect(template).toContain('tasks.md');
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
