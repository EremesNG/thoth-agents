import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ALL_AGENT_NAMES } from '../../config';
import { generateLiteConfig } from '../providers';

const installRequiredSkillMock = vi.hoisted(() =>
  vi.fn(() => ({ status: 'installed' as const })),
);

vi.mock('../skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skills')>();
  return {
    ...actual,
    REQUIRED_SKILLS: [
      {
        name: 'simplify',
        repo: 'https://example.test/simplify',
        skillName: 'simplify',
        description: 'test skill',
      },
      {
        name: 'tdd',
        repo: 'https://example.test/tdd',
        skillName: 'tdd',
        description: 'test skill',
      },
      {
        name: 'progressive-context-router',
        repo: 'https://example.test/progressive-context-router',
        skillName: 'progressive-context-router',
        description: 'test skill',
      },
      {
        name: 'architectural-grilling',
        repo: 'https://example.test/architectural-grilling',
        skillName: 'architectural-grilling',
        description: 'test skill',
      },
    ],
    installRequiredSkill: installRequiredSkillMock,
  };
});

import {
  applyOpenCodePlan,
  buildOpenCodeInstallPlan,
  buildOpenCodeModelPlan,
  buildOpenCodeSyncPlan,
  buildOpenCodeUpdatePlan,
  getOpenCodeStatus,
} from './opencode';

describe('OpenCode operations adapter v0.3', () => {
  let configRoot: string;
  let tempRoot: string;
  let originalConfigDir: string | undefined;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    installRequiredSkillMock.mockReset();
    installRequiredSkillMock.mockReturnValue({ status: 'installed' });
    originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    tempRoot = mkdtempSync(join(tmpdir(), 'thoth-opencode-v03-'));
    configRoot = join(tempRoot, 'opencode');
    mkdirSync(configRoot, { recursive: true });
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    process.env.XDG_CONFIG_HOME = tempRoot;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR;
    } else {
      process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
    }
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const context = () => ({
    cwd: configRoot,
    env: { HOME: join(configRoot, 'home') },
  });

  const mainConfigPath = () => join(configRoot, 'opencode.json');
  const liteConfigPath = () => join(configRoot, 'thoth-agents.json');

  function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  function validLiteConfig(): Record<string, unknown> {
    return generateLiteConfig({
      agent: 'opencode',
      hasTmux: false,
      dryRun: false,
      reset: false,
    });
  }

  function writeManagedConfig(): void {
    writeJson(mainConfigPath(), { plugin: ['thoth-agents@latest'] });
    writeJson(liteConfigPath(), validLiteConfig());
  }

  function writeRequiredSkill(name: string): void {
    const path = join(
      configRoot,
      'home',
      '.config',
      'opencode',
      'skills',
      name,
      'SKILL.md',
    );
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${name}\n---\n`);
  }

  test('classifies missing required skills as managed drift', () => {
    writeManagedConfig();
    const status = getOpenCodeStatus(context());

    expect(status.state).toBe('drift');
    expect(status.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'important',
          code: 'opencode-required-skills-missing',
        }),
      ]),
    );
    expect(
      status.diagnostics.some(({ code }) => code?.includes('bundled-skills')),
    ).toBe(false);
  });

  test('reports the four required external skills and no bundled phase skills', () => {
    writeManagedConfig();
    writeRequiredSkill('simplify');

    const status = getOpenCodeStatus(context());
    const skills = status.targets.filter(({ kind }) => kind === 'skill');

    expect(skills).toEqual([
      expect.objectContaining({ label: 'Simplify', state: 'installed' }),
      expect.objectContaining({ label: 'Tdd', state: 'missing' }),
      expect.objectContaining({
        label: 'Progressive-Context-Router',
        state: 'missing',
      }),
      expect.objectContaining({
        label: 'Architectural-Grilling',
        state: 'missing',
      }),
    ]);
    expect(
      skills.some(({ expected }) => expected?.includes('bundled thoth-agents')),
    ).toBe(false);
  });

  test('previews ten-role sync and install flows with required external skills', () => {
    const sync = buildOpenCodeSyncPlan(context());
    const install = buildOpenCodeInstallPlan(context());
    const previews = [...sync.items, ...install.items]
      .map(({ preview }) => preview ?? '')
      .join('\n');

    expect(previews).toContain('sdd-specify');
    expect(previews).toContain('sdd-plan');
    expect(previews).toContain('sdd-tasks');
    expect([...sync.items, ...install.items]).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Refresh bundled thoth-agents OpenCode skills',
        }),
      ]),
    );
    expect(previews).not.toContain('installCustomSkills');
    expect(previews).toContain('simplify');
    expect(previews).toContain('tdd');
    expect(previews).toContain('progressive-context-router');
    expect(previews).toContain('architectural-grilling');
    expect(previews).not.toContain('playwright-cli');
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(existsSync(liteConfigPath())).toBe(false);
  });

  test('applies an install with the complete canonical roster', () => {
    const result = applyOpenCodePlan(buildOpenCodeInstallPlan(context()));
    const written = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as {
      presets: { openai: Record<string, unknown> };
    };

    expect(result.applied).toBe(true);
    expect(Object.keys(written.presets.openai)).toEqual(ALL_AGENT_NAMES);
    expect(result.changedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ observed: 'ten-role roster written' }),
        expect.objectContaining({ label: 'Required OpenCode skills' }),
      ]),
    );
    expect(installRequiredSkillMock).toHaveBeenCalledTimes(4);
    expect(installRequiredSkillMock).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'tdd' }),
      'opencode',
      expect.any(Object),
    );
    expect(installRequiredSkillMock).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'architectural-grilling' }),
      'opencode',
      expect.any(Object),
    );
  });

  test('blocks completion when a required skill cannot be installed', () => {
    installRequiredSkillMock.mockReturnValue({ status: 'failed' });

    const result = applyOpenCodePlan(buildOpenCodeInstallPlan(context()));

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'critical',
          code: 'opencode-required-skill-failed',
        }),
      ]),
    );
  });

  test('accepts model overrides for SDD phase agents', () => {
    writeManagedConfig();
    writeRequiredSkill('simplify');
    writeRequiredSkill('tdd');
    writeRequiredSkill('progressive-context-router');
    writeRequiredSkill('architectural-grilling');
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'sdd-plan',
            provider: 'openai',
            model: 'gpt-5.6-sol',
          },
        ],
      },
      context(),
    );

    const result = applyOpenCodePlan(plan);
    const written = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as {
      agents: Record<string, { model: string; variant?: string }>;
    };

    expect(result.applied).toBe(true);
    expect(written.agents['sdd-plan']).toEqual({
      model: 'openai/gpt-5.6-sol',
    });
  });

  test('rejects unissued or mutated plans before writing', () => {
    const update = buildOpenCodeUpdatePlan(context());
    update.summary = 'tampered';

    const result = applyOpenCodePlan(update);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'critical' }),
      ]),
    );
    expect(existsSync(mainConfigPath())).toBe(false);
  });
});
