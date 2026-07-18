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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProviderEvidenceInput } from '../../harness/types';
import { applyCodexSetup, buildCodexSetupPlan } from '../codex-install';
import {
  applyCodexPlan,
  buildCodexInstallPlan,
  buildCodexModelPlan,
  buildCodexSyncPlan,
  buildCodexUpdatePlan,
  getCodexStatus,
  resolveCodexEffort,
} from './codex';
import type { HarnessStatusReport } from './types';

const installRequiredSkillMock = vi.hoisted(() => vi.fn());

vi.mock('../skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skills')>();
  return { ...actual, installRequiredSkill: installRequiredSkillMock };
});

const PACKAGE_ROOT = process.cwd();

function requiredSkillPath(home: string, name: string): string {
  return join(home, '.codex', 'skills', name, 'SKILL.md');
}

function writeRequiredSkills(home: string): void {
  for (const name of [
    'simplify',
    'tdd',
    'progressive-context-router',
    'architectural-grilling',
  ]) {
    const path = requiredSkillPath(home, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${name}\n---\n`);
  }
}

beforeEach(() => {
  installRequiredSkillMock.mockReset();
  installRequiredSkillMock.mockImplementation((skill, harness, options) => {
    const path = requiredSkillPath(options.homeDir, skill.skillName);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${skill.skillName}\n---\n`);
    return { skill, harness, skillPath: path, status: 'installed' };
  });
});

function context(dir: string, home: string) {
  return {
    cwd: dir,
    homeDir: home,
    packageRoot: PACKAGE_ROOT,
  };
}

const getCodexStatusWithEvidence = getCodexStatus as unknown as (
  operationContext: ReturnType<typeof context>,
  evidence?: ProviderEvidenceInput,
) => HarnessStatusReport;

function setup(dir: string, home: string): void {
  const result = applyCodexSetup(
    buildCodexSetupPlan({
      dryRun: false,
      reset: false,
      scope: 'user',
      projectRoot: dir,
      homeDir: home,
      packageRoot: PACKAGE_ROOT,
    }),
  );
  expect(result.success).toBe(true);
  writeRequiredSkills(home);
}

function rolePath(home: string, role: string): string {
  return join(home, '.codex', 'agents', `thoth-agents-${role}.toml`);
}

function managedModelsPath(home: string): string {
  return join(home, '.codex', 'agents', '.thoth-agents-managed-models.json');
}

function roleModel(content: string): string | undefined {
  return /^model\s*=\s*"([^"]+)"\s*$/m.exec(content)?.[1];
}

describe('Codex operations adapter', () => {
  test('resolves only exact catalog efforts in the documented Codex surface', () => {
    const base = {
      role: 'deep',
      model: 'gpt-5.6-sol',
      catalogId: 'openai/gpt-5.6-sol',
      availableEfforts: ['none', 'max', 'ultra', 'future-level'],
    };
    expect(
      resolveCodexEffort({
        ...base,
        effort: { kind: 'effort', value: 'ultra' },
      }),
    ).toEqual({ ok: true, value: 'ultra' });
    expect(
      resolveCodexEffort({
        ...base,
        effort: { kind: 'effort', value: 'future-level' },
      }),
    ).toMatchObject({ ok: false, code: 'codex-effort-undocumented' });
    expect(
      resolveCodexEffort({
        ...base,
        availableEfforts: ['none', 'max'],
        effort: { kind: 'effort', value: 'ultra' },
      }),
    ).toMatchObject({ ok: false, code: 'codex-effort-model-unsupported' });
    expect(
      resolveCodexEffort({ ...base, effort: { kind: 'inherit' } }),
    ).toEqual({ ok: true, value: undefined });
  });
  test('Codex status classifies missing, installed, drift, outdated, and unknown states', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      expect(getCodexStatus(context(dir, home)).state).toBe('missing');

      setup(dir, home);
      expect(getCodexStatus(context(dir, home)).state).toBe('installed');

      writeFileSync(
        rolePath(home, 'deep'),
        readFileSync(rolePath(home, 'deep'), 'utf8').replace(
          'name = "deep"',
          'name = "deep-drift"',
        ),
      );
      expect(getCodexStatus(context(dir, home)).state).toBe('drift');

      setup(dir, home);
      const manifestPath = join(
        home,
        '.codex',
        'plugins',
        'thoth-agents',
        '.codex-plugin',
        'plugin.json',
      );
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        version: string;
      };
      writeFileSync(
        manifestPath,
        `${JSON.stringify({ ...manifest, version: '0.0.0' }, null, 2)}\n`,
      );
      expect(getCodexStatus(context(dir, home)).state).toBe('outdated');

      setup(dir, home);
      writeFileSync(managedModelsPath(home), '{ invalid json');
      const unknown = getCodexStatus(context(dir, home));
      expect(unknown.state).toBe('unknown');
      expect(
        unknown.targets.some((target) =>
          target.observed?.includes('unparseable managed model state'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports degraded provider evidence without degrading installed consumer state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-evidence-'));
    try {
      const home = join(dir, 'home');
      setup(dir, home);
      const providerEvidence = {
        state: 'degraded' as const,
        source: 'harness' as const,
        basis: ['persistence evidenced; continuity not evidenced'],
      };

      const status = getCodexStatusWithEvidence(context(dir, home), {
        providerEvidence,
      });

      expect(status.state).toBe('installed');
      expect(status.providerCapability).toEqual(providerEvidence);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex update and sync plans wrap setup dry-runs without writing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const update = buildCodexUpdatePlan(context(dir, home));
      const sync = buildCodexSyncPlan(context(dir, home));

      expect(update.harness).toBe('codex');
      expect(update.action).toBe('update');
      expect(update.dryRun).toBe(true);
      expect(update.canApply).toBe(true);
      expect(update.warnings.map((item) => item.message).join('\n')).toContain(
        '/plugins',
      );
      expect(
        update.disclaimers.map((item) => item.message).join('\n'),
      ).toContain('Role permissions');
      expect(sync.action).toBe('sync');
      expect(
        sync.items.some((item) =>
          item.title.includes('Materialize Codex role'),
        ),
      ).toBe(true);
      expect(existsSync(join(home, '.codex'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex install plan wraps setup dry-run and can be applied', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const plan = buildCodexInstallPlan(context(dir, home));

      expect(plan.harness).toBe('codex');
      expect(plan.action).toBe('install');
      expect(plan.dryRun).toBe(true);
      expect(plan.canApply).toBe(true);
      expect(plan.title).toContain('Install');
      expect(plan.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Install required external skills for Codex',
          }),
        ]),
      );
      expect(existsSync(join(home, '.codex'))).toBe(false);

      const applied = applyCodexPlan(plan);
      expect(applied.applied).toBe(true);
      expect(existsSync(rolePath(home, 'deep'))).toBe(true);
      expect(installRequiredSkillMock).toHaveBeenCalledTimes(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex install is incomplete when a required skill fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-required-skill-'));
    try {
      const home = join(dir, 'home');
      installRequiredSkillMock.mockReturnValue({ status: 'failed' });

      const applied = applyCodexPlan(buildCodexInstallPlan(context(dir, home)));

      expect(applied.applied).toBe(false);
      expect(applied.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'critical',
            code: 'codex-required-skill-failed',
          }),
        ]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex model plan targets only generated subagent model lines and managed state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const plan = buildCodexModelPlan(
        {
          harness: 'codex',
          dryRun: true,
          roles: [
            { role: 'deep', model: 'openai/gpt-5.5' },
            {
              role: 'quick',
              provider: 'openai',
              model: 'gpt-5.4-mini',
              catalogId: 'openai/gpt-5.4-mini',
              availableEfforts: ['medium'],
              effort: { kind: 'effort', value: 'medium' },
            },
            { role: 'orchestrator', model: 'gpt-5.5' },
          ],
        },
        context(dir, home),
      );

      expect(plan.action).toBe('model-config');
      expect(plan.canApply).toBe(true);
      expect(plan.items).toHaveLength(2);
      expect.soft(plan.items[0]?.preview).toContain('"model":"gpt-5.5"');
      expect.soft(plan.items[1]?.preview).toContain('"model":"gpt-5.4-mini"');
      expect(plan.items[1]?.preview).toContain('"effort":"medium"');
      expect(plan.warnings.map((item) => item.message).join('\n')).toContain(
        'orchestrator',
      );
      expect(plan.disclaimers.map((item) => item.message).join('\n')).toContain(
        'generated subagent TOML model lines',
      );
      expect(existsSync(join(home, '.codex'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex apply requires explicit applyable plans and preserves user-owned TOML fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const unsafe = {
        ...buildCodexUpdatePlan(context(dir, home)),
        canApply: false,
      };
      expect(applyCodexPlan(unsafe).applied).toBe(false);
      expect(existsSync(join(home, '.codex'))).toBe(false);

      const update = buildCodexUpdatePlan(context(dir, home));
      const applied = applyCodexPlan(update);
      expect(applied.applied).toBe(true);
      expect(existsSync(rolePath(home, 'deep'))).toBe(true);
      expect(
        applyCodexPlan({ ...buildCodexUpdatePlan(context(dir, home)) }).applied,
      ).toBe(false);
      expect(
        applyCodexPlan({
          ...buildCodexInstallPlan(context(dir, home)),
          canApply: false,
        }).applied,
      ).toBe(false);

      const quickPath = rolePath(home, 'quick');
      const quickBefore = readFileSync(quickPath, 'utf8').replace(
        'sandbox_mode = "workspace-write"',
        'sandbox_mode = "read-only"',
      );
      writeFileSync(quickPath, quickBefore);
      const modelPlan = buildCodexModelPlan(
        {
          harness: 'codex',
          dryRun: true,
          roles: [{ role: 'quick', model: 'openai/gpt-5.4-mini' }],
        },
        context(dir, home),
      );
      const modelApplied = applyCodexPlan(modelPlan);
      expect(modelApplied.applied).toBe(true);
      const quickAfter = readFileSync(quickPath, 'utf8');
      expect(roleModel(quickAfter)).toBe('gpt-5.4-mini');
      expect(quickAfter).toContain('sandbox_mode = "read-only"');
      expect(quickAfter).toContain('model_reasoning_effort = "xhigh"');
      expect(quickAfter).not.toContain('toggle');
      expect(quickAfter).not.toContain('budget_tokens');

      const clearPlan = buildCodexModelPlan(
        {
          harness: 'codex',
          dryRun: true,
          roles: [
            {
              role: 'quick',
              model: 'openai/gpt-5.4-mini',
              effort: { kind: 'inherit' },
            },
          ],
        },
        context(dir, home),
      );
      expect(applyCodexPlan(clearPlan).applied).toBe(true);
      expect(readFileSync(quickPath, 'utf8')).not.toContain(
        'model_reasoning_effort',
      );
      expect(readFileSync(managedModelsPath(home), 'utf8')).toContain(
        'gpt-5.4-mini',
      );
      expect(readFileSync(managedModelsPath(home), 'utf8')).not.toContain(
        'openai/gpt-5.4-mini',
      );
      expect(getCodexStatus(context(dir, home)).state).toBe('drift');

      setup(dir, home);
      expect(roleModel(readFileSync(quickPath, 'utf8'))).toBe('gpt-5.4-mini');
      expect(readFileSync(quickPath, 'utf8')).not.toContain(
        'model_reasoning_effort',
      );
      expect(getCodexStatus(context(dir, home)).state).toBe('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
