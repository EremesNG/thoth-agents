import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from '../../harness/core/owned-skills';
import { PI_PACKAGE_SPECS } from '../pi-install';
import {
  getPiPackageReceiptPath,
  writePiPackageReceipt,
} from '../pi-package-receipt';
import { PI_SPECIALIST_NAMES } from '../pi-resources';
import {
  applyPiPlan,
  buildPiInstallPlan,
  buildPiModelPlan,
  buildPiSyncPlan,
  buildPiUpdatePlan,
  getPiStatus,
} from './pi';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function seedManagedGrepConfig(homeDir: string): void {
  const path = join(homeDir, '.config', 'mcp', 'mcp.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        mcpServers: {
          grep: {
            url: 'https://mcp.grep.app',
            protocolVersion: 'legacy',
            lifecycle: 'lazy',
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

function seedPiPackage(root: string, missingSkill?: string): void {
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'pi.js'), 'export default () => {}');
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"thoth-agents","version":"1.0.0"}',
  );
  for (const name of THOTH_OWNED_SKILL_NAMES) {
    mkdirSync(join(root, 'skills', name), { recursive: true });
    if (name !== missingSkill)
      writeFileSync(
        join(root, 'skills', name, 'SKILL.md'),
        `---\nname: ${name}\ndescription: Test ${name}\n---\n`,
      );
  }
  mkdirSync(join(root, 'pi', 'agents'), { recursive: true });
  for (const name of PI_SPECIALIST_NAMES)
    writeFileSync(
      join(root, 'pi', 'agents', `${name}.md`),
      `---\nname: ${name}\nmanaged-by: thoth-agents\n---\n${name}\n`,
    );
}

function writeLocalPiReceipt(homeDir: string, packageRoot: string): string {
  const source = '..\\pi-packages\\thoth-agents';
  const sha256 = (path: string) =>
    createHash('sha256').update(readFileSync(path)).digest('hex');
  expect(
    writePiPackageReceipt(
      {
        schemaVersion: 1,
        owner: 'thoth-agents',
        scope: 'user',
        packageName: 'thoth-agents',
        source,
        installSource: packageRoot,
        version: '1.0.0',
        manifestSha256: sha256(join(packageRoot, 'package.json')),
        extensionSha256: sha256(join(packageRoot, 'dist', 'pi.js')),
      },
      { homeDir },
    ).success,
  ).toBe(true);
  return source;
}

describe('Pi operations', () => {
  const installedRuntime = (command: string, args: readonly string[]) => {
    if (command === 'node')
      return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
    if (args[0] === '--version')
      return { exitCode: 0, stdout: '0.84.4', stderr: '' };
    return {
      exitCode: 0,
      stdout: PI_PACKAGE_SPECS.map(({ source }) => source).join('\n'),
      stderr: '',
    };
  };

  test('keeps install and update complete while sync excludes packages/provider/ledger', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-op-'));
    roots.push(homeDir);
    const context = { cwd: join(homeDir, 'project'), homeDir };
    const install = buildPiInstallPlan(context);
    const update = buildPiUpdatePlan(context);
    const sync = buildPiSyncPlan(context);
    expect(install.items.map(({ title }) => title)).toEqual(
      update.items.map(({ title }) => title),
    );
    expect(
      install.items.some(({ preview }) =>
        preview?.includes('pi-subagents-j0k3r@1.5.9'),
      ),
    ).toBe(true);
    expect(
      install.items.some(
        ({ preview }) =>
          preview?.includes('thoth-mem') && preview.includes('setup pi'),
      ),
    ).toBe(true);
    expect(sync.items.some(({ target }) => target.kind === 'package')).toBe(
      false,
    );
    expect(sync.items.some(({ title }) => title.includes('provider'))).toBe(
      false,
    );
    expect(
      sync.items.some(({ title }) => title.includes('Record completed')),
    ).toBe(false);
    expect(
      sync.items.some(({ title }) =>
        title.includes('Inspect five package-declared Pi skills'),
      ),
    ).toBe(true);
    expect(sync.canApply).toBe(false);
    expect(sync.blockerTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Pi package-declared skill evidence blocker',
        }),
      ]),
    );
  });

  test('reports provider evidence and Exa credential state independently', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-status-'));
    roots.push(homeDir);
    const report = getPiStatus(
      { cwd: homeDir, homeDir, env: {} },
      {
        providerEvidence: {
          state: 'degraded',
          source: 'provider',
          basis: ['remote unavailable'],
        },
      },
    );
    expect(report.providerCapability?.state).toBe('degraded');
    expect(
      report.diagnostics.some(
        ({ code }) => code === 'pi-exa-credential-required',
      ),
    ).toBe(true);
  });

  test('reports independent managed-ready and credential-required research runtime states', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-research-ready-'));
    roots.push(homeDir);
    seedManagedGrepConfig(homeDir);
    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: installedRuntime,
    });

    expect(
      report.targets
        .filter(({ label }) => label?.endsWith('runtime availability'))
        .map(({ label, observed }) => ({ label, observed })),
    ).toEqual([
      { label: 'Context7 runtime availability', observed: 'ready' },
      { label: 'Exa runtime availability', observed: 'credential-required' },
      { label: 'grep.app runtime availability', observed: 'ready' },
    ]);
  });

  test('keeps injected remote and schema outcomes separate from managed install health', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-research-runtime-'));
    roots.push(homeDir);
    seedManagedGrepConfig(homeDir);
    const report = getPiStatus(
      {
        cwd: homeDir,
        homeDir,
        env: { EXA_API_KEY: 'operator-owned' },
        piCommandExecutor: installedRuntime,
      },
      {
        research: {
          context7: { state: 'unreachable', basis: ['timeout'] },
          exa: { state: 'failed', basis: ['provider error'] },
          grep: { state: 'drifted', basis: ['searchGitHub schema changed'] },
        },
      } as never,
    );

    expect(report.state).toBe('missing');
    expect(
      report.targets
        .filter(({ label }) => label?.endsWith('runtime availability'))
        .map(({ observed }) => observed),
    ).toEqual(['unreachable', 'failed', 'drifted']);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pi-context7-runtime-unreachable' }),
        expect.objectContaining({ code: 'pi-exa-runtime-failed' }),
        expect.objectContaining({ code: 'pi-grep-runtime-drifted' }),
      ]),
    );
  });

  test('reports incompatible Node and Pi versions as drift', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-version-'));
    roots.push(homeDir);
    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.18.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.83.0', stderr: '' };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(
      report.targets.find(({ label }) => label === 'Node.js runtime')?.state,
    ).toBe('drift');
    expect(
      report.targets.find(({ label }) => label === 'Pi runtime')?.state,
    ).toBe('drift');
  });

  test('does not claim loadability or observation when the receipt manifest digest drifts', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-receipt-drift-'));
    roots.push(homeDir);
    const packageRoot = join(homeDir, 'package');
    const extensionPath = join(packageRoot, 'dist', 'pi.js');
    const manifestPath = join(packageRoot, 'package.json');
    mkdirSync(dirname(extensionPath), { recursive: true });
    writeFileSync(extensionPath, 'export default function extension() {}');
    writeFileSync(manifestPath, '{"name":"thoth-agents","version":"1.0.0"}');
    const sha256 = (path: string) =>
      createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(
      writePiPackageReceipt(
        {
          schemaVersion: 1,
          owner: 'thoth-agents',
          scope: 'user',
          packageName: 'thoth-agents',
          source: 'npm:thoth-agents@1.0.0',
          installSource: 'npm:thoth-agents@1.0.0',
          version: '1.0.0',
          manifestSha256: sha256(manifestPath),
          extensionSha256: sha256(extensionPath),
        },
        { homeDir },
      ).success,
    ).toBe(true);
    writeFileSync(manifestPath, '{"name":"thoth-agents","version":"1.0.1"}');

    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      packageRoot,
      env: {},
      piCommandExecutor: (command, args) => {
        const result = installedRuntime(command, args);
        return args[0] === 'list'
          ? {
              ...result,
              stdout: `${result.stdout}\nUser packages:\n  npm:thoth-agents@1.0.0\n    ${packageRoot}`,
            }
          : result;
      },
    });
    expect(
      report.targets.find(
        ({ label }) => label === 'Native Pi extension loadability',
      ),
    ).toMatchObject({ state: 'drift', observed: 'unavailable' });
    expect(
      report.targets.find(({ label }) => label === 'Native root observation'),
    ).toMatchObject({ state: 'drift', observed: 'unobserved' });
  });

  test('binds a local canonical source to its receipt install path for status', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-local-status-'));
    roots.push(homeDir);
    const installedRoot = join(homeDir, 'packages', 'candidate');
    const extensionPath = join(installedRoot, 'dist', 'pi.js');
    const manifestPath = join(installedRoot, 'package.json');
    mkdirSync(dirname(extensionPath), { recursive: true });
    writeFileSync(extensionPath, 'export default function extension() {}');
    writeFileSync(manifestPath, '{"name":"thoth-agents","version":"1.0.0"}');
    const sha256 = (path: string) =>
      createHash('sha256').update(readFileSync(path)).digest('hex');
    const canonicalSource = '..\\packages\\candidate';
    expect(
      writePiPackageReceipt(
        {
          schemaVersion: 1,
          owner: 'thoth-agents',
          scope: 'user',
          packageName: 'thoth-agents',
          source: canonicalSource,
          installSource: installedRoot,
          version: '1.0.0',
          manifestSha256: sha256(manifestPath),
          extensionSha256: sha256(extensionPath),
        },
        { homeDir },
      ).success,
    ).toBe(true);
    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command, args) => {
        const result = installedRuntime(command, args);
        return args[0] === 'list'
          ? {
              ...result,
              stdout: `${result.stdout}\nUser packages:\n  ${canonicalSource}\n    ${installedRoot}`,
            }
          : result;
      },
    });
    expect(
      report.targets.find(
        ({ label }) => label === 'Native Pi extension loadability',
      ),
    ).toMatchObject({ state: 'installed', observed: 'loadable' });
    expect(
      report.targets.find(
        ({ label }) => label === 'First-party Pi configured source',
      ),
    ).toMatchObject({
      state: 'installed',
      expected: `${canonicalSource} -> ${installedRoot}`,
      observed: `${canonicalSource} -> ${installedRoot}`,
    });
    expect(
      report.targets.find(({ label }) => label === 'Native root observation'),
    ).toMatchObject({
      state: 'installed',
      observed: 'observed-at-install (receipt-bound)',
    });
  });

  test('reports a configured-unowned first-party package and blocks Update without adopting its skills', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-unowned-status-'));
    roots.push(homeDir);
    const packageRoot = process.cwd();
    const context = {
      cwd: homeDir,
      homeDir,
      packageRoot,
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        const result = installedRuntime(command, args);
        return args[0] === 'list'
          ? {
              ...result,
              stdout: `User packages:\n  npm:thoth-agents@0.3.12\n    ${packageRoot}`,
            }
          : result;
      },
    };

    const report = getPiStatus(context);
    expect(
      report.targets.find(
        ({ label }) => label === 'First-party Pi package ownership',
      ),
    ).toMatchObject({ state: 'drift', observed: 'configured-unowned' });
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'pi-first-party-configured-unowned',
          severity: 'critical',
        }),
      ]),
    );
    expect(
      report.targets.filter(({ label }) =>
        label?.startsWith('Pi package-declared skill:'),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'unknown',
          observed: 'package ownership unavailable',
        }),
      ]),
    );

    const update = buildPiUpdatePlan(context);
    expect(update.canApply).toBe(false);
    expect(update.blockerTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'First-party Pi package ownership blocker',
          observed: expect.stringContaining('configured-unowned'),
        }),
      ]),
    );
    expect(applyPiPlan(update).applied).toBe(false);
  });

  test('keeps missing, owned-missing, malformed, shadowed, and mismatched ownership distinct', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-ownership-matrix-'));
    roots.push(homeDir);
    const installedRoot = join(homeDir, 'packages', 'candidate');
    const extensionPath = join(installedRoot, 'dist', 'pi.js');
    const manifestPath = join(installedRoot, 'package.json');
    mkdirSync(dirname(extensionPath), { recursive: true });
    writeFileSync(extensionPath, 'export default function extension() {}');
    writeFileSync(manifestPath, '{"name":"thoth-agents","version":"1.0.0"}');
    const sha256 = (path: string) =>
      createHash('sha256').update(readFileSync(path)).digest('hex');
    const commandExecutor =
      (list: string) => (command: string, args: readonly string[]) => {
        const result = installedRuntime(command, args);
        return args[0] === 'list' ? { ...result, stdout: list } : result;
      };
    const ownership = (list: string) =>
      getPiStatus({
        cwd: homeDir,
        homeDir,
        env: {},
        piCommandExecutor: commandExecutor(list),
      }).targets.find(
        ({ label }) => label === 'First-party Pi package ownership',
      )?.observed;

    expect(ownership('No packages installed.')).toBe('missing');
    expect(
      ownership(
        `User packages:\n  ..\\packages\\candidate\n    ${installedRoot}`,
      ),
    ).toBe('configured-unowned');

    const receiptPath = getPiPackageReceiptPath({ homeDir });
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, '{');
    expect(
      ownership(
        `User packages:\n  ..\\packages\\candidate\n    ${installedRoot}`,
      ),
    ).toBe('conflicting');

    expect(
      writePiPackageReceipt(
        {
          schemaVersion: 1,
          owner: 'thoth-agents',
          scope: 'user',
          packageName: 'thoth-agents',
          source: 'npm:thoth-agents@1.0.0',
          installSource: 'npm:thoth-agents@1.0.0',
          version: '1.0.0',
          manifestSha256: sha256(manifestPath),
          extensionSha256: sha256(extensionPath),
        },
        { homeDir },
      ).success,
    ).toBe(true);
    expect(ownership('No packages installed.')).toBe('owned-missing');
    expect(
      ownership(
        `Project packages:\n  npm:thoth-agents@1.0.0\n    ${installedRoot}`,
      ),
    ).toBe('conflicting');
    expect(
      ownership(
        `User packages:\n  npm:thoth-agents@2.0.0\n    ${installedRoot}`,
      ),
    ).toBe('conflicting');
    const wrongRoot = join(homeDir, 'packages', 'wrong-version');
    mkdirSync(wrongRoot, { recursive: true });
    writeFileSync(
      join(wrongRoot, 'package.json'),
      '{"name":"thoth-agents","version":"2.0.0"}',
    );
    expect(
      ownership(`User packages:\n  npm:thoth-agents@1.0.0\n    ${wrongRoot}`),
    ).toBe('conflicting');
  });

  test('resolves package-declared skill preview from the configured Pi root, never the executing CLI root', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-divergent-root-'));
    roots.push(homeDir);
    const executingRoot = join(homeDir, 'npx-cache', 'thoth-agents');
    const configuredRoot = join(homeDir, 'pi-packages', 'thoth-agents');
    for (const root of [executingRoot, configuredRoot]) {
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'dist', 'pi.js'), 'export default () => {}');
      writeFileSync(
        join(root, 'package.json'),
        '{"name":"thoth-agents","version":"1.0.0"}',
      );
      for (const name of THOTH_OWNED_SKILL_NAMES) {
        mkdirSync(join(root, 'skills', name), { recursive: true });
        writeFileSync(
          join(root, 'skills', name, 'SKILL.md'),
          `---\nname: ${name}\ndescription: Test ${name}\n---\n`,
        );
      }
      mkdirSync(join(root, 'pi', 'agents'), { recursive: true });
      for (const name of PI_SPECIALIST_NAMES)
        writeFileSync(
          join(root, 'pi', 'agents', `${name}.md`),
          `---\nname: ${name}\nmanaged-by: thoth-agents\n---\n${name}\n`,
        );
    }
    const sha256 = (path: string) =>
      createHash('sha256').update(readFileSync(path)).digest('hex');
    const source = '..\\pi-packages\\thoth-agents';
    expect(
      writePiPackageReceipt(
        {
          schemaVersion: 1,
          owner: 'thoth-agents',
          scope: 'user',
          packageName: 'thoth-agents',
          source,
          installSource: configuredRoot,
          version: '1.0.0',
          manifestSha256: sha256(join(configuredRoot, 'package.json')),
          extensionSha256: sha256(join(configuredRoot, 'dist', 'pi.js')),
        },
        { homeDir },
      ).success,
    ).toBe(true);
    const plan = buildPiSyncPlan({
      cwd: homeDir,
      homeDir,
      packageRoot: executingRoot,
      env: {},
      piCommandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.84.4', stderr: '' };
        return {
          exitCode: 0,
          stdout: `User packages:\n  ${source}\n    ${configuredRoot}`,
          stderr: '',
        };
      },
    });
    const skillItem = plan.items.find(({ target }) =>
      target.label?.includes('package-declared skills'),
    );

    expect(skillItem?.preview).toContain(configuredRoot);
    expect(skillItem?.preview).not.toContain(executingRoot);
    expect(plan.canApply).toBe(true);
    const applied = applyPiPlan(plan);
    expect(applied.applied).toBe(true);
    expect(applied.changedTargets).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'skill' })]),
    );
    expect(applied.diagnosticTargets).toEqual(
      THOTH_OWNED_SKILL_NAMES.map((name) =>
        expect.objectContaining({
          kind: 'skill',
          path: join(configuredRoot, 'skills', name, 'SKILL.md'),
        }),
      ),
    );
  });

  test('rejects a stale Sync plan before MCP or specialist mutation when the configured root disappears', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-stale-sync-'));
    roots.push(homeDir);
    const configuredRoot = join(homeDir, 'pi-packages', 'thoth-agents');
    seedPiPackage(configuredRoot);
    const source = writeLocalPiReceipt(homeDir, configuredRoot);
    let configured = true;
    const plan = buildPiSyncPlan({
      cwd: homeDir,
      homeDir,
      packageRoot: process.cwd(),
      env: {},
      piCommandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.84.4', stderr: '' };
        return {
          exitCode: 0,
          stdout: configured
            ? `User packages:\n  ${source}\n    ${configuredRoot}`
            : 'No packages installed.',
          stderr: '',
        };
      },
    });
    const mcpPath = join(homeDir, '.config', 'mcp', 'mcp.json');
    configured = false;
    rmSync(configuredRoot, { recursive: true, force: true });

    const applied = applyPiPlan(plan);
    expect(applied).toMatchObject({ applied: false, changedTargets: [] });
    expect(existsSync(mcpPath)).toBe(false);
    expect(existsSync(join(homeDir, '.pi', 'agent', 'agents'))).toBe(false);
  });

  test('marks a missing SKILL.md unavailable and rejects Sync before any mutation', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-skill-contract-'));
    roots.push(homeDir);
    const configuredRoot = join(homeDir, 'pi-packages', 'thoth-agents');
    seedPiPackage(configuredRoot, 'plan-reviewer');
    const source = writeLocalPiReceipt(homeDir, configuredRoot);
    const context = {
      cwd: homeDir,
      homeDir,
      packageRoot: process.cwd(),
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.84.4', stderr: '' };
        return {
          exitCode: 0,
          stdout: `User packages:\n  ${source}\n    ${configuredRoot}`,
          stderr: '',
        };
      },
    };

    const status = getPiStatus(context);
    expect(
      status.targets.find(
        ({ label }) => label === 'Pi package-declared skill: plan-reviewer',
      ),
    ).toMatchObject({ state: 'missing' });
    const plan = buildPiSyncPlan(context);
    expect(plan.canApply).toBe(false);
    const applied = applyPiPlan(plan);
    expect(applied).toMatchObject({ applied: false, changedTargets: [] });
    expect(existsSync(join(homeDir, '.config', 'mcp', 'mcp.json'))).toBe(false);
    expect(existsSync(join(homeDir, '.pi', 'agent', 'agents'))).toBe(false);

    writeFileSync(
      join(configuredRoot, 'skills', 'plan-reviewer', 'SKILL.md'),
      '# malformed\n',
    );
    expect(
      getPiStatus(context).targets.find(
        ({ label }) => label === 'Pi package-declared skill: plan-reviewer',
      ),
    ).toMatchObject({
      state: 'drift',
      observed: expect.stringContaining('malformed'),
    });
    expect(buildPiSyncPlan(context).canApply).toBe(false);
  });

  test('rejects body-bait skill drift in a stale healthy Sync plan before any mutation', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-skill-body-bait-'));
    roots.push(homeDir);
    const configuredRoot = join(homeDir, 'pi-packages', 'thoth-agents');
    seedPiPackage(configuredRoot);
    const source = writeLocalPiReceipt(homeDir, configuredRoot);
    const context = {
      cwd: homeDir,
      homeDir,
      packageRoot: process.cwd(),
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.84.4', stderr: '' };
        return {
          exitCode: 0,
          stdout: `User packages:\n  ${source}\n    ${configuredRoot}`,
          stderr: '',
        };
      },
    };
    const plan = buildPiSyncPlan(context);
    expect(plan.canApply).toBe(true);
    writeFileSync(
      join(configuredRoot, 'skills', 'plan-reviewer', 'SKILL.md'),
      '---\nname: wrong\ndescription: wrong\n---\nname: plan-reviewer\ndescription: body bait\n',
    );

    const status = getPiStatus(context);
    expect(
      status.targets.find(
        ({ label }) => label === 'Pi package-declared skill: plan-reviewer',
      ),
    ).toMatchObject({ state: 'drift' });
    const applied = applyPiPlan(plan);
    expect(applied).toMatchObject({ applied: false, changedTargets: [] });
    expect(existsSync(join(homeDir, '.config', 'mcp', 'mcp.json'))).toBe(false);
    expect(existsSync(join(homeDir, '.pi', 'agent', 'agents'))).toBe(false);
    expect(existsSync(getPiPackageReceiptPath({ homeDir }))).toBe(true);
  });

  test('reports MCP mutation when a later specialist sync fails', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-truthful-sync-'));
    roots.push(homeDir);
    const configuredRoot = join(homeDir, 'pi-packages', 'thoth-agents');
    seedPiPackage(configuredRoot);
    rmSync(join(configuredRoot, 'pi', 'agents', 'deep.md'));
    const source = writeLocalPiReceipt(homeDir, configuredRoot);
    const plan = buildPiSyncPlan({
      cwd: homeDir,
      homeDir,
      packageRoot: process.cwd(),
      env: {},
      piCommandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.84.4', stderr: '' };
        return {
          exitCode: 0,
          stdout: `User packages:\n  ${source}\n    ${configuredRoot}`,
          stderr: '',
        };
      },
    });
    const mcpPath = join(homeDir, '.config', 'mcp', 'mcp.json');

    const applied = applyPiPlan(plan);
    expect(applied.applied).toBe(false);
    expect(existsSync(mcpPath)).toBe(true);
    expect(applied.changedTargets).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: mcpPath })]),
    );
  });

  test('rejects ambient orchestrator model mutation while allowing owned specialists', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-model-'));
    roots.push(homeDir);
    expect(
      buildPiModelPlan(
        {
          harness: 'pi',
          dryRun: true,
          roles: [{ role: 'orchestrator', model: 'x' }],
        },
        { cwd: homeDir, homeDir },
      ).canApply,
    ).toBe(false);
    expect(
      buildPiModelPlan(
        {
          harness: 'pi',
          dryRun: true,
          roles: [{ role: 'deep', model: 'provider/model' }],
        },
        { cwd: homeDir, homeDir },
      ).canApply,
    ).toBe(true);
  });

  test('rejects unsupported and unavailable Pi specialist effort values before mutation', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-effort-'));
    roots.push(homeDir);
    const unsupported = buildPiModelPlan(
      {
        harness: 'pi',
        dryRun: false,
        roles: [
          {
            role: 'deep',
            model: 'provider/model',
            availableEfforts: ['ultra'],
            effort: { kind: 'effort', value: 'ultra' },
          },
        ],
      },
      { cwd: homeDir, homeDir },
    );
    const unavailable = buildPiModelPlan(
      {
        harness: 'pi',
        dryRun: false,
        roles: [
          {
            role: 'deep',
            model: 'provider/model',
            availableEfforts: ['low'],
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
      { cwd: homeDir, homeDir },
    );

    for (const plan of [unsupported, unavailable]) {
      expect(plan.canApply).toBe(false);
      expect(plan.warnings).toEqual([
        expect.objectContaining({ code: 'pi-model-effort-unsupported' }),
      ]);
      expect(applyPiPlan(plan).applied).toBe(false);
    }
  });

  test('updates model fields only inside owned specialist frontmatter', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-model-apply-'));
    roots.push(homeDir);
    const agentPath = join(homeDir, '.pi', 'agent', 'agents', 'deep.md');
    mkdirSync(dirname(agentPath), { recursive: true });
    writeFileSync(
      agentPath,
      '---\nname: deep\nmanaged-by: thoth-agents\n---\nExample:\nmodel: keep-this-body-text\n',
    );
    const plan = buildPiModelPlan(
      {
        harness: 'pi',
        dryRun: false,
        roles: [
          {
            role: 'deep',
            model: 'provider/model',
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
      { cwd: homeDir, homeDir },
    );
    expect(applyPiPlan(plan).applied).toBe(true);
    const content = readFileSync(agentPath, 'utf8');
    expect(content).toContain('model: "provider/model"');
    expect(content).toContain('effort: "high"');
    expect(content).toContain('model: keep-this-body-text');
  });
});
