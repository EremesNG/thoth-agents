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
import { dirname, join, relative, sep } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { piAdapter } from '../../harness/adapters/pi';
import { THOTH_OWNED_SKILL_NAMES } from '../../harness/core/owned-skills';
import { getShippedModelRoles } from '../model-defaults';
import { buildPiSetupPlan, PI_PACKAGE_SPECS } from '../pi-install';
import {
  getPiPackageReceiptPath,
  writePiPackageReceipt,
} from '../pi-package-receipt';
import { PI_SPECIALIST_NAMES, syncPiSpecialists } from '../pi-resources';
import { buildRestoreModelPlan } from '../tui/operations';
import {
  applyPiPlan,
  buildPiInstallPlan,
  buildPiModelPlan,
  buildPiSyncPlan,
  buildPiUpdatePlan,
  defaultPiModelRoles,
  getPiStatus,
  type PiOperationContext,
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

function localSource(from: string, to: string): string {
  const path = relative(from, to);
  return path.startsWith('.') ? path : `.${sep}${path}`;
}

function writeLocalPiReceipt(homeDir: string, packageRoot: string): string {
  const source = localSource(homeDir, packageRoot);
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
      { homeDir, env: {} },
    ).success,
  ).toBe(true);
  return source;
}

describe('Pi operations', () => {
  const installedRuntime = (homeDir: string) => {
    const packageList = PI_PACKAGE_SPECS.flatMap((spec) => {
      const installedPath = join(homeDir, 'external', spec.id);
      mkdirSync(installedPath, { recursive: true });
      writeFileSync(
        join(installedPath, 'package.json'),
        JSON.stringify({ name: spec.packageName, version: spec.version }),
      );
      return [`  ${spec.source}`, `    ${installedPath}`];
    }).join('\n');
    return (command: string, args: readonly string[]) => {
      if (command === 'node')
        return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
      if (args[0] === '--version')
        return { exitCode: 0, stdout: '1.0.2', stderr: '' };
      return { exitCode: 0, stdout: packageList, stderr: '' };
    };
  };

  test('keeps install and update complete while sync excludes packages/provider/ledger', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-op-'));
    roots.push(homeDir);
    const context = { cwd: join(homeDir, 'project'), homeDir, env: {} };
    const install = buildPiInstallPlan(context);
    const update = buildPiUpdatePlan(context);
    const sync = buildPiSyncPlan(context);
    expect(install.items.map(({ title }) => title)).toEqual(
      update.items.map(({ title }) => title),
    );
    for (const source of [
      'npm:@thoth-agents/pi-subagents@>=0.3.0',
      'npm:@thoth-agents/pi-sidebar@>=0.3.0',
    ])
      expect(
        install.items.some(({ preview }) => preview?.includes(source)),
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

  test('reports the adopted runtime package floor, global lean config, and project override limit', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-j0k3r-status-'));
    roots.push(homeDir);
    const configPath = join(homeDir, '.pi', 'agent', 'subagents.json');
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      `${JSON.stringify(
        { session_resources: 'lean', enable_continue: false },
        null,
        2,
      )}\n`,
    );

    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: installedRuntime(homeDir),
    });

    expect(report.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'package',
          path: 'npm:@thoth-agents/pi-subagents@>=0.3.0',
          state: 'installed',
          observed: '0.3.0',
        }),
        expect.objectContaining({
          kind: 'package',
          path: 'npm:@thoth-agents/pi-todo@>=0.3.0',
          state: 'installed',
          observed: '0.3.0',
        }),
        expect.objectContaining({
          kind: 'file',
          path: configPath,
          state: 'installed',
        }),
      ]),
    );
    expect(report.disclaimers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'pi-lean-resources-global-only',
          message: expect.stringContaining('project-local'),
        }),
      ]),
    );
  });

  test('status recognizes the adopted runtime from a configured local source manifest', () => {
    const homeDir = mkdtempSync(
      join(tmpdir(), 'thoth-pi-local-runtime-status-'),
    );
    roots.push(homeDir);
    const localRuntimeRoot = join(homeDir, 'checked-out-fork');
    mkdirSync(localRuntimeRoot, { recursive: true });
    writeFileSync(
      join(localRuntimeRoot, 'package.json'),
      JSON.stringify({ name: '@thoth-agents/pi-subagents', version: '0.3.0' }),
    );
    const packageList = PI_PACKAGE_SPECS.flatMap((spec) => {
      const installedPath = join(homeDir, 'external', spec.id);
      mkdirSync(installedPath, { recursive: true });
      writeFileSync(
        join(installedPath, 'package.json'),
        JSON.stringify({ name: spec.packageName, version: spec.version }),
      );
      return [
        `  ${spec.id === 'delegation' ? localRuntimeRoot : spec.source}`,
        `    ${spec.id === 'delegation' ? localRuntimeRoot : installedPath}`,
      ];
    }).join('\n');
    const context = {
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command, args) =>
        command === 'node'
          ? { exitCode: 0, stdout: 'v24.20.0', stderr: '' }
          : args[0] === '--version'
            ? { exitCode: 0, stdout: '1.0.2', stderr: '' }
            : { exitCode: 0, stdout: packageList, stderr: '' },
    };
    const report = getPiStatus(context);

    expect(report.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'npm:@thoth-agents/pi-subagents@>=0.3.0',
          state: 'installed',
          observed: '0.3.0',
        }),
      ]),
    );

    const explicit = getPiStatus({
      ...context,
      runtimePackageRoot: localRuntimeRoot,
    });
    expect(explicit.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: localRuntimeRoot,
          state: 'installed',
          observed: '0.3.0',
        }),
      ]),
    );
  });

  test.each([
    ['local', '0.3.0', 'installed'],
    ['pinned', '0.4.0', 'installed'],
    ['git', '0.2.9', 'drift'],
    ['unreadable', '0.3.0', 'drift'],
  ])('status reports preserved theme, background and sidebar copies (%s, %s)', (sourceKind, version, state) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-preserved-status-'));
    roots.push(homeDir);
    const runtime = installedRuntime(homeDir);
    const packageList = runtime('pi', ['list']).stdout.split('\n');
    for (const [id, name] of [
      ['theme', '@thoth-agents/pi-thoth-theme'],
      ['background-tasks', '@thoth-agents/pi-background-tasks'],
      ['sidebar', '@thoth-agents/pi-sidebar'],
    ]) {
      const installedPath = join(homeDir, 'external', id);
      writeFileSync(
        join(installedPath, 'package.json'),
        sourceKind === 'unreadable' ? '{' : JSON.stringify({ name, version }),
      );
      const index = packageList.findIndex((line) =>
        line.trim().startsWith(`npm:${name}@`),
      );
      packageList[index] = `  ${
        sourceKind === 'pinned'
          ? `npm:${name}@${version}`
          : sourceKind === 'git'
            ? `git:https://example.test/operator/${id}.git`
            : installedPath
      }`;
    }
    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command, args) =>
        args[0] === 'list'
          ? { exitCode: 0, stdout: packageList.join('\n'), stderr: '' }
          : runtime(command, args),
    });

    for (const name of [
      '@thoth-agents/pi-thoth-theme',
      '@thoth-agents/pi-background-tasks',
      '@thoth-agents/pi-sidebar',
    ]) {
      const target = report.targets.find(
        ({ path }) => path === `npm:${name}@>=0.3.0`,
      );
      expect(target).toMatchObject({ kind: 'package', state });
      if (state === 'installed') expect(target?.observed).toBe(version);
      if (sourceKind === 'unreadable')
        expect(target?.observed).toContain('manifest identity');
    }
  });

  test.each([
    ['background-tasks', '@thoth-agents/pi-background-tasks'],
    ['sidebar', '@thoth-agents/pi-sidebar'],
  ])('applied Update preserves a compatible theme and blocks completion when fresh %s installation cannot be verified', (id, name) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-update-preserved-'));
    roots.push(homeDir);
    const runtime = installedRuntime(homeDir);
    const existingPackages = runtime('pi', ['list']).stdout.split('\n');
    const themeIndex = existingPackages.findIndex((line) =>
      line.includes('npm:@thoth-agents/pi-thoth-theme@'),
    );
    existingPackages[themeIndex] = '  npm:@thoth-agents/pi-thoth-theme@0.3.0';
    const packageIndex = existingPackages.findIndex((line) =>
      line.includes(`npm:${name}@`),
    );
    const packageLines = existingPackages.splice(packageIndex, 2);
    const packagePath = join(homeDir, 'external', id);
    let rootSource: string | undefined;
    let packageInstalled = false;
    const mutations: string[][] = [];
    const context: PiOperationContext = {
      cwd: homeDir,
      homeDir,
      env: {},
      buildPiSetupPlan: (options) =>
        buildPiSetupPlan({
          ...options,
          verifyFirstParty: (input) => ({
            success: true,
            receipt: {
              schemaVersion: 1,
              owner: 'thoth-agents',
              scope: 'user',
              packageName: 'thoth-agents',
              source: input.source,
              installSource: input.installSource,
              version: input.version,
              manifestSha256: 'a'.repeat(64),
              extensionSha256: 'b'.repeat(64),
            },
          }),
        }),
      piCommandExecutor: (command, args) => {
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              'User packages:',
              ...(rootSource
                ? [`  ${rootSource}`, `    ${process.cwd()}`]
                : []),
              ...existingPackages,
              ...(packageInstalled ? packageLines : []),
            ].join('\n'),
            stderr: '',
          };
        if (args[0] === 'install' || args[0] === 'remove') {
          mutations.push([...args]);
          if (args[1]?.startsWith('npm:thoth-agents@')) rootSource = args[1];
          if (args[1] === `npm:${name}@>=0.3.0`) {
            packageInstalled = true;
            writeFileSync(
              join(packagePath, 'package.json'),
              JSON.stringify({ name, version: '0.2.9' }),
            );
          }
        }
        return runtime(command, args);
      },
      installRequiredSkill: () => {
        throw new Error('Completion must be blocked before external skills');
      },
      runThothMemSetup: () => {
        throw new Error('Completion must be blocked before provider setup');
      },
    };
    const plan = buildPiUpdatePlan(context);
    expect(plan.canApply).toBe(true);
    const result = applyPiPlan(plan);

    expect(result.applied).toBe(false);
    expect(result.summary).toContain(`Pi did not verify npm:${name}@>=0.3.0`);
    expect(mutations).toContainEqual([
      'install',
      `npm:${name}@>=0.3.0`,
      '--no-approve',
    ]);
    expect(mutations.flat()).not.toContain(
      'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
    );
    expect(
      existsSync(
        join(homeDir, '.config', 'thoth-agents', 'install-state.json'),
      ),
    ).toBe(false);
  });

  test('reports and blocks an incumbent delegation runtime seen in Pi package state', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-incumbent-status-'));
    roots.push(homeDir);
    const runtime = installedRuntime(homeDir);
    const piCommandExecutor = (command: string, args: readonly string[]) => {
      const result = runtime(command, args);
      return args[0] === 'list'
        ? {
            ...result,
            stdout: `${result.stdout}\nUser packages:\n  npm:pi-subagents@0.72.0\n    ${join(homeDir, 'incumbent')}`,
          }
        : result;
    };
    const context = { cwd: homeDir, homeDir, env: {}, piCommandExecutor };

    const report = getPiStatus(context);
    expect(report.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Pi incumbent delegation runtime',
          state: 'drift',
          observed: 'npm:pi-subagents@0.72.0',
        }),
      ]),
    );
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'pi-incumbent-delegation-conflict',
          severity: 'critical',
          message: expect.stringContaining('pi remove npm:pi-subagents@0.72.0'),
        }),
      ]),
    );

    const update = buildPiUpdatePlan(context);
    expect(update.canApply).toBe(false);
    expect(update.blockerTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Pi delegation runtime blocker',
          observed: expect.stringContaining(
            'pi remove npm:pi-subagents@0.72.0',
          ),
        }),
      ]),
    );
  });

  test('identifies local or Git incumbents by manifest and ignores source spelling alone', () => {
    const homeDir = mkdtempSync(
      join(tmpdir(), 'thoth-pi-git-incumbent-status-'),
    );
    roots.push(homeDir);
    const installedPath = join(homeDir, 'package-cache', 'custom-package');
    mkdirSync(installedPath, { recursive: true });
    const source = 'git+https://example.test/vendor/custom-package.git';
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ name: 'pi-subagents-j0k3r', version: '1.0.0' }),
    );
    const runtime = installedRuntime(homeDir);
    const piCommandExecutor = (command: string, args: readonly string[]) => {
      const result = runtime(command, args);
      return args[0] === 'list'
        ? {
            ...result,
            stdout: `${result.stdout}\nUser packages:\n  ${source}\n    ${installedPath}`,
          }
        : result;
    };
    const context = { cwd: homeDir, homeDir, env: {}, piCommandExecutor };

    const incumbentStatus = getPiStatus(context);
    expect(incumbentStatus.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Pi incumbent delegation runtime',
          observed: source,
          state: 'drift',
        }),
      ]),
    );
    expect(buildPiUpdatePlan(context).canApply).toBe(false);

    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ name: 'vendor-agent-tools', version: '1.0.0' }),
    );
    expect(getPiStatus(context).targets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Pi incumbent delegation runtime' }),
      ]),
    );
  });

  test.each([
    {
      scope: 'User',
      source: '../operator-task-list',
      removalCommand: 'pi remove ../operator-task-list --no-approve',
    },
    {
      scope: 'Project',
      source: '../operator-task-list',
      packagePath: 'operator-task-list',
      removalCommand: 'pi remove ../operator-task-list --local --approve',
    },
    {
      scope: 'User',
      source: 'git+https://example.test/operator/rpiv-todo.git',
      removalCommand:
        'pi remove git+https://example.test/operator/rpiv-todo.git --no-approve',
    },
    {
      scope: 'Project',
      source: 'git:https://example.test/operator/tasks.git@v2.12.0',
      packagePath: '.pi/git/example.test/operator/tasks',
      removalCommand:
        'pi remove git:https://example.test/operator/tasks.git@v2.12.0 --local --approve',
    },
    ...[
      'https://github.com/operator/tasks.git/',
      'https://www.github.com/operator/tasks',
    ].map((source) => ({
      scope: 'Project',
      source,
      packagePath: '.pi/git/github.com/operator/tasks',
      removalCommand: `pi remove ${source} --local --approve`,
    })),
    {
      scope: 'Project',
      source: 'git:https://example.test/operator/rpiv-todo.git',
      packagePath: '.pi/git/example.test/operator/rpiv-todo',
      removalCommand:
        'pi remove git:https://example.test/operator/rpiv-todo.git --local --approve',
    },
  ])('identifies a local/Git todo incumbent by manifest, not source spelling alone ($scope, $source)', ({
    scope,
    source,
    packagePath,
    removalCommand,
  }) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-local-todo-status-'));
    roots.push(homeDir);
    const installedPath = join(homeDir, packagePath ?? 'operator-package');
    mkdirSync(installedPath, { recursive: true });
    if (scope === 'Project') {
      const settingsPath = join(homeDir, '.pi', 'settings.json');
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(
        settingsPath,
        JSON.stringify({ packages: [{ source, extensions: [] }] }),
      );
    }
    const manifestPath = join(installedPath, 'package.json');
    const runtime = installedRuntime(homeDir);
    const commands: string[] = [];
    const context = {
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        commands.push(`${command} ${args.join(' ')}`);
        const result = runtime(command, args);
        // Native --no-approve never lists project packages.
        return args[0] === 'list' && scope === 'User'
          ? {
              ...result,
              stdout: `${result.stdout}\nUser packages:\n  ${source}\n    ${installedPath}`,
            }
          : result;
      },
    };
    writeFileSync(
      manifestPath,
      JSON.stringify({ name: '@juicesharp/rpiv-todo', version: '2.12.0' }),
    );
    expect(getPiStatus(context).targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Pi incumbent task-list package',
          path: source,
          state: 'drift',
          description: expect.stringContaining(`${removalCommand}.`),
        }),
      ]),
    );
    for (const plan of [
      buildPiInstallPlan(context),
      buildPiUpdatePlan(context),
    ]) {
      expect(plan).toMatchObject({
        canApply: false,
        blockerTargets: expect.arrayContaining([
          expect.objectContaining({
            label: 'Pi task-list package blocker',
            observed: expect.stringContaining(`${removalCommand}.`),
          }),
        ]),
      });
      expect(applyPiPlan(plan)).toMatchObject({
        applied: false,
        changedTargets: [],
      });
    }
    expect(
      commands.some((call) => /pi (install|remove)|--approve/.test(call)),
    ).toBe(false);

    writeFileSync(
      manifestPath,
      JSON.stringify({ name: 'operator-task-tools', version: '1.0.0' }),
    );
    expect(getPiStatus(context).targets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Pi incumbent task-list package' }),
      ]),
    );
    expect(buildPiUpdatePlan(context).canApply).toBe(true);
  });

  test.each([
    {
      packagePath: '.pi/git/unknown.test/nested/operator/tasks',
      settings: undefined,
    },
    { packagePath: '.pi/npm/node_modules/operator-tasks', settings: undefined },
    {
      packagePath: '.pi/git/github.com/operator/tasks',
      settings: JSON.stringify({
        packages: ['git:unrecognized-layout'],
        npmCommand: ['must-not-run-project-code'],
      }),
    },
    {
      packagePath: '.pi/npm/node_modules/@vendor/renamed-tasks',
      settings: '{ malformed settings',
    },
  ])('reports an unmapped installed todo and blocks Install/Update ($packagePath, settings=$settings)', ({
    packagePath,
    settings,
  }) => {
    const homeDir = mkdtempSync(
      join(tmpdir(), 'thoth-pi-scanned-todo-status-'),
    );
    roots.push(homeDir);
    const cwd = join(homeDir, 'project');
    const installedPath = join(cwd, packagePath);
    mkdirSync(installedPath, { recursive: true });
    const settingsPath = join(cwd, '.pi', 'settings.json');
    if (settings !== undefined) writeFileSync(settingsPath, settings);
    const manifestPath = join(installedPath, 'package.json');
    const manifest = JSON.stringify({
      name: '@juicesharp/rpiv-todo',
      main: 'must-not-execute.js',
      scripts: { preinstall: 'must-not-run-project-code' },
    });
    writeFileSync(manifestPath, manifest);
    writeFileSync(
      join(installedPath, 'must-not-execute.js'),
      'throw new Error("Project code executed");',
    );
    const commands: string[] = [];
    const runtime = installedRuntime(homeDir);
    const context = {
      cwd,
      homeDir,
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        commands.push(`${command} ${args.join(' ')}`);
        return runtime(command, args);
      },
    };

    const report = getPiStatus(context);
    const incumbents = report.targets.filter(
      ({ label }) => label === 'Pi incumbent task-list package',
    );
    expect(incumbents).toHaveLength(1);
    expect(incumbents[0]).toMatchObject({
      path: installedPath,
      state: 'drift',
      description: expect.stringContaining(
        'pi remove <source> --local --approve.',
      ),
    });
    expect(incumbents[0].description).toContain(
      'pi remove npm:@juicesharp/rpiv-todo --local --approve.',
    );
    expect(incumbents[0].description).toContain('Review the project');
    expect(incumbents[0].description).not.toContain(
      `pi remove ${installedPath}`,
    );
    expect(
      report.diagnostics.map(({ message }) => message).join('\n'),
    ).toContain(installedPath);
    for (const plan of [
      buildPiInstallPlan(context),
      buildPiUpdatePlan(context),
    ]) {
      expect(plan.canApply).toBe(false);
      expect(plan.blockerTargets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Pi task-list package blocker',
            observed: expect.stringContaining(installedPath),
          }),
        ]),
      );
      expect(applyPiPlan(plan)).toMatchObject({
        applied: false,
        changedTargets: [],
      });
    }
    expect(
      commands.some((call) => /pi (install|remove)|--approve/.test(call)),
    ).toBe(false);
    expect(readFileSync(manifestPath, 'utf8')).toBe(manifest);
    if (settings !== undefined)
      expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
    else expect(existsSync(settingsPath)).toBe(false);
    expect(existsSync(join(homeDir, '.pi', 'agent'))).toBe(false);
    expect(existsSync(join(homeDir, '.config'))).toBe(false);
  });

  test.each([
    'missing',
    'invalid',
  ])('reports read-only identity limitations for a project Git todo source with a %s manifest', (manifestState) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-unresolved-todo-'));
    roots.push(homeDir);
    const source = 'git:https://example.test/operator/rpiv-todo.git@v2.12.0';
    const settingsPath = join(homeDir, '.pi', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = JSON.stringify({ packages: [source] });
    writeFileSync(settingsPath, settings);
    if (manifestState === 'invalid') {
      const packageRoot = join(
        homeDir,
        '.pi',
        'git',
        'example.test',
        'operator',
        'rpiv-todo',
      );
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, 'package.json'), 'invalid JSON');
    }
    const commands: string[] = [];
    const runtime = installedRuntime(homeDir);
    const context = {
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        commands.push(`${command} ${args.join(' ')}`);
        return runtime(command, args);
      },
    };
    const report = getPiStatus(context);
    expect(report.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Pi incumbent task-list package',
          path: source,
          state: 'drift',
          description: expect.stringContaining(
            'manifest identity is unavailable',
          ),
        }),
      ]),
    );
    expect(
      report.diagnostics.map(({ message }) => message).join('\n'),
    ).toContain('read-only inspection cannot confirm its installed identity');
    for (const plan of [
      buildPiInstallPlan(context),
      buildPiUpdatePlan(context),
    ]) {
      expect(plan.canApply).toBe(false);
      expect(applyPiPlan(plan)).toMatchObject({
        applied: false,
        changedTargets: [],
      });
    }
    expect(
      commands.some((call) => /pi (install|remove)|--approve/.test(call)),
    ).toBe(false);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
  });

  test('reports provider evidence without treating an absent Exa key as a web failure', () => {
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
    expect(report.diagnostics.map(({ code }) => code).join('\n')).not.toContain(
      'exa-credential-required',
    );
  });

  test.each([
    'user',
    'project',
  ])('reports the first-party question package as missing and previews safe retired-provider migration (%s)', (scope) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-question-migration-'));
    roots.push(homeDir);
    const source = 'npm:@juicesharp/rpiv-ask-user-question@>=2.9.0';
    const settingsPath =
      scope === 'user'
        ? join(homeDir, '.pi', 'agent', 'settings.json')
        : join(homeDir, '.pi', 'settings.json');
    const installedPath = join(
      dirname(settingsPath),
      'npm',
      'node_modules',
      '@juicesharp',
      'rpiv-ask-user-question',
    );
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({
        name: '@juicesharp/rpiv-ask-user-question',
        version: '2.9.0',
      }),
    );
    const settings = JSON.stringify({
      packages: [{ source, extensions: ['*'] }],
      theme: 'operator',
    });
    writeFileSync(settingsPath, settings);
    const commands: string[] = [];
    const context = {
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        commands.push(`${command} ${args.join(' ')}`);
        return {
          exitCode: 0,
          stdout:
            command === 'node'
              ? 'v22.19.0'
              : args[0] === '--version'
                ? '1.0.2'
                : scope === 'user'
                  ? `User packages:\n  ${source}`
                  : 'No packages installed.',
          stderr: '',
        };
      },
    };
    const status = getPiStatus(context);
    expect(status.targets).toContainEqual(
      expect.objectContaining({
        path: 'npm:@thoth-agents/pi-questions-user@>=0.3.0',
        state: 'missing',
      }),
    );
    for (const plan of [
      buildPiInstallPlan(context),
      buildPiUpdatePlan(context),
    ]) {
      expect(plan.canApply).toBe(scope === 'user');
      if (scope === 'user')
        expect(plan.items).toContainEqual(
          expect.objectContaining({
            preview: `pi remove ${source} --no-approve`,
          }),
        );
      else {
        expect(plan.blockerTargets).toContainEqual(
          expect.objectContaining({
            observed: expect.stringContaining(
              `pi remove ${source} --local --approve`,
            ),
          }),
        );
        expect(applyPiPlan(plan).applied).toBe(false);
      }
    }
    expect(
      commands.some((command) => /pi (install|remove)|--approve/.test(command)),
    ).toBe(false);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
  });

  test.each([
    {
      scope: 'User',
      removalCommand: 'pi remove npm:@juicesharp/rpiv-todo --no-approve',
    },
    {
      scope: 'Project',
      removalCommand: 'pi remove npm:@juicesharp/rpiv-todo --local --approve',
    },
  ])('reports an incumbent todo conflict and blocks update while reporting question support ($scope)', ({
    scope,
    removalCommand,
  }) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-rpiv-status-'));
    roots.push(homeDir);
    const askPath = join(homeDir, 'ask');
    const todoPath =
      scope === 'Project'
        ? join(
            homeDir,
            '.pi',
            'npm',
            'node_modules',
            '@juicesharp',
            'rpiv-todo',
          )
        : join(homeDir, 'todo');
    mkdirSync(askPath);
    mkdirSync(todoPath, { recursive: true });
    writeFileSync(
      join(askPath, 'package.json'),
      JSON.stringify({
        name: '@thoth-agents/pi-questions-user',
        version: '0.3.0',
      }),
    );
    writeFileSync(
      join(todoPath, 'package.json'),
      JSON.stringify({ name: '@juicesharp/rpiv-todo', version: '0.0.1' }),
    );
    if (scope === 'Project') {
      const settingsPath = join(homeDir, '.pi', 'settings.json');
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(
        settingsPath,
        JSON.stringify({ packages: ['npm:@juicesharp/rpiv-todo@>=2.9.0'] }),
      );
    }
    const commands: string[] = [];
    const context = {
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        commands.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        return {
          exitCode: 0,
          stdout: [
            'User packages:',
            '  npm:@thoth-agents/pi-questions-user@>=0.3.0',
            `    ${askPath}`,
            ...(scope === 'User'
              ? ['  npm:@juicesharp/rpiv-todo@>=2.9.0', `    ${todoPath}`]
              : []),
          ].join('\n'),
          stderr: '',
        };
      },
    };
    const report = getPiStatus(context);
    expect(report.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'npm:@thoth-agents/pi-todo@>=0.3.0',
          state: 'missing',
        }),
        expect.objectContaining({
          path: 'npm:@thoth-agents/pi-questions-user@>=0.3.0',
          state: 'installed',
          description: expect.stringContaining(
            'does not prove live tool availability',
          ),
        }),
        expect.objectContaining({
          label: 'Pi incumbent task-list package',
          path: 'npm:@juicesharp/rpiv-todo@>=2.9.0',
          state: 'drift',
          description: expect.stringContaining(`${removalCommand}.`),
        }),
      ]),
    );
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            scope === 'Project'
              ? 'pi-preflight-blocked'
              : 'pi-incumbent-todo-conflict',
          severity: 'critical',
          message: expect.stringContaining(`${removalCommand}.`),
        }),
      ]),
    );
    for (const plan of [
      buildPiInstallPlan(context),
      buildPiUpdatePlan(context),
    ]) {
      expect(plan.canApply).toBe(false);
      expect(plan.blockerTargets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Pi task-list package blocker',
            observed: expect.stringContaining(`${removalCommand}.`),
          }),
        ]),
      );
      expect(applyPiPlan(plan)).toMatchObject({
        applied: false,
        changedTargets: [],
      });
    }
    expect(commands.some((call) => /pi (install|remove)/.test(call))).toBe(
      false,
    );
  });

  test.each([
    false,
    true,
  ])('reports both todo scopes in status and update (user settings=%s)', (userSettings) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-todo-scopes-'));
    roots.push(homeDir);
    const source = 'npm:@juicesharp/rpiv-todo@2.12.0';
    if (userSettings) {
      const path = join(homeDir, '.pi', 'agent', 'settings.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ packages: [source] }));
    }
    const projectSettingsPath = join(homeDir, '.pi', 'settings.json');
    mkdirSync(dirname(projectSettingsPath), { recursive: true });
    writeFileSync(projectSettingsPath, JSON.stringify({ packages: [source] }));
    const runtime = installedRuntime(homeDir);
    const commands: string[] = [];
    const context = {
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command: string, args: readonly string[]) => {
        commands.push(`${command} ${args.join(' ')}`);
        const result = runtime(command, args);
        return args[0] === 'list'
          ? {
              ...result,
              stdout: `${result.stdout}\nUser packages:\n  ${source}`,
            }
          : result;
      },
    };
    const removalCommands = [
      'pi remove npm:@juicesharp/rpiv-todo --no-approve.',
      'pi remove npm:@juicesharp/rpiv-todo --local --approve.',
    ];
    const report = getPiStatus(context);
    for (const command of removalCommands) {
      expect(
        report.targets
          .filter(({ label }) => label === 'Pi incumbent task-list package')
          .map(({ description }) => description)
          .join('\n'),
      ).toContain(command);
      expect(
        report.diagnostics.map(({ message }) => message).join('\n'),
      ).toContain(command);
    }
    for (const plan of [
      buildPiInstallPlan(context),
      buildPiUpdatePlan(context),
    ]) {
      expect(plan.canApply).toBe(false);
      const recovery = plan.blockerTargets
        .filter(({ label }) => label === 'Pi task-list package blocker')
        .map(({ observed }) => observed)
        .join('\n');
      for (const command of removalCommands)
        expect(recovery).toContain(command);
      expect(applyPiPlan(plan)).toMatchObject({
        applied: false,
        changedTargets: [],
      });
    }
    expect(commands.some((call) => /pi (install|remove)/.test(call))).toBe(
      false,
    );
  });

  test('reports installed web access as unverified without live runtime evidence', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-research-ready-'));
    roots.push(homeDir);
    seedManagedGrepConfig(homeDir);
    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: installedRuntime(homeDir),
    });

    expect(
      report.targets
        .filter(({ label }) => label?.endsWith('runtime availability'))
        .map(({ label, observed }) => ({ label, observed })),
    ).toEqual([
      { label: 'Context7 runtime availability', observed: 'ready' },
      { label: 'Web access runtime availability', observed: 'unverified' },
      { label: 'grep.app runtime availability', observed: 'ready' },
    ]);
    expect(report.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Web access runtime availability',
          state: 'unknown',
        }),
      ]),
    );
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'pi-web-access-runtime-unverified',
          severity: 'minor',
        }),
      ]),
    );
  });

  test('keeps injected remote and schema outcomes separate from managed install health', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-research-runtime-'));
    roots.push(homeDir);
    seedManagedGrepConfig(homeDir);
    const report = getPiStatus(
      {
        cwd: homeDir,
        homeDir,
        env: {},
        piCommandExecutor: installedRuntime(homeDir),
      },
      {
        research: {
          context7: { state: 'unreachable', basis: ['timeout'] },
          'web-access': { state: 'failed', basis: ['provider error'] },
          grep: { state: 'drifted', basis: ['searchGitHub schema changed'] },
        },
      },
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
        expect.objectContaining({ code: 'pi-web-access-runtime-failed' }),
        expect.objectContaining({ code: 'pi-grep-runtime-drifted' }),
      ]),
    );
  });

  test('honors explicit ready web evidence and reports a missing package as drifted', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-web-evidence-'));
    roots.push(homeDir);
    const missing = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v24.20.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(
      missing.targets.find(
        ({ label }) => label === 'Web access runtime availability',
      )?.observed,
    ).toBe('drifted');

    const observed = getPiStatus(
      {
        cwd: homeDir,
        homeDir,
        env: {},
        piCommandExecutor: installedRuntime(homeDir),
      },
      {
        research: {
          'web-access': { state: 'ready', basis: ['observed live request'] },
        },
      },
    );
    expect(
      observed.targets.find(
        ({ label }) => label === 'Web access runtime availability',
      ),
    ).toMatchObject({ state: 'installed', observed: 'ready' });
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
        { homeDir, env: {} },
      ).success,
    ).toBe(true);
    writeFileSync(manifestPath, '{"name":"thoth-agents","version":"1.0.1"}');

    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      packageRoot,
      env: {},
      piCommandExecutor: (command, args) => {
        const result = installedRuntime(homeDir)(command, args);
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
    const canonicalSource = localSource(homeDir, installedRoot);
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
        { homeDir, env: {} },
      ).success,
    ).toBe(true);
    const report = getPiStatus({
      cwd: homeDir,
      homeDir,
      env: {},
      piCommandExecutor: (command, args) => {
        const result = installedRuntime(homeDir)(command, args);
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
        const result = installedRuntime(homeDir)(command, args);
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
        const result = installedRuntime(homeDir)(command, args);
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
        `User packages:\n  ${localSource(homeDir, installedRoot)}\n    ${installedRoot}`,
      ),
    ).toBe('configured-unowned');

    const receiptPath = getPiPackageReceiptPath({ homeDir, env: {} });
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, '{');
    expect(
      ownership(
        `User packages:\n  ${localSource(homeDir, installedRoot)}\n    ${installedRoot}`,
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
        { homeDir, env: {} },
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
    const source = localSource(homeDir, configuredRoot);
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
        { homeDir, env: {} },
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
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
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
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
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
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
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
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
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
    expect(existsSync(getPiPackageReceiptPath({ homeDir, env: {} }))).toBe(
      true,
    );
  });

  test('reports MCP mutation when a later specialist sync fails', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-truthful-sync-'));
    roots.push(homeDir);
    const configuredRoot = join(homeDir, 'pi-packages', 'thoth-agents');
    seedPiPackage(configuredRoot);
    rmSync(join(configuredRoot, 'pi', 'agents', 'thoth-worker.md'));
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
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
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
        { cwd: homeDir, homeDir, env: {} },
      ).canApply,
    ).toBe(false);
    expect(
      buildPiModelPlan(
        {
          harness: 'pi',
          dryRun: true,
          roles: [{ role: 'worker', model: 'provider/model' }],
        },
        { cwd: homeDir, homeDir, env: {} },
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
            role: 'worker',
            model: 'provider/model',
            availableEfforts: ['ultra'],
            effort: { kind: 'effort', value: 'ultra' },
          },
        ],
      },
      { cwd: homeDir, homeDir, env: {} },
    );
    const unavailable = buildPiModelPlan(
      {
        harness: 'pi',
        dryRun: false,
        roles: [
          {
            role: 'worker',
            model: 'provider/model',
            availableEfforts: ['low'],
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
      { cwd: homeDir, homeDir, env: {} },
    );

    for (const plan of [unsupported, unavailable]) {
      expect(plan.canApply).toBe(false);
      expect(plan.warnings).toEqual([
        expect.objectContaining({ code: 'pi-model-effort-unsupported' }),
      ]);
      expect(applyPiPlan(plan).applied).toBe(false);
    }
  });

  test('rejects CLI model saves when owned definitions changed after preview', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-stale-'));
    roots.push(homeDir);
    const agentPath = join(
      homeDir,
      '.pi',
      'agent',
      'agents',
      'thoth-worker.md',
    );
    mkdirSync(dirname(agentPath), { recursive: true });
    writeFileSync(
      agentPath,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: old/model\n---\nOriginal\n',
    );
    const plan = buildPiModelPlan(
      { harness: 'pi', roles: [{ role: 'worker', model: 'new/model' }] },
      { cwd: homeDir, homeDir, env: {} },
    );
    writeFileSync(
      agentPath,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\nmodel: external/change\n---\nEdited externally\n',
    );
    const result = applyPiPlan(plan);
    expect(result.applied).toBe(false);
    expect(readFileSync(agentPath, 'utf8')).toContain('external/change');
  });

  test('updates model fields only inside owned specialist frontmatter', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-model-apply-'));
    roots.push(homeDir);
    const agentPath = join(
      homeDir,
      '.pi',
      'agent',
      'agents',
      'thoth-worker.md',
    );
    mkdirSync(dirname(agentPath), { recursive: true });
    writeFileSync(
      agentPath,
      '---\nname: thoth-worker\nmanaged-by: thoth-agents\n---\nExample:\nmodel: keep-this-body-text\n',
    );
    const plan = buildPiModelPlan(
      {
        harness: 'pi',
        dryRun: false,
        roles: [
          {
            role: 'worker',
            model: 'provider/model',
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
      { cwd: homeDir, homeDir, env: {} },
    );
    expect(applyPiPlan(plan).applied).toBe(true);
    const content = readFileSync(agentPath, 'utf8');
    expect(content).toContain('model: "provider/model"');
    expect(content).toContain('effort: "high"');
    expect(content).toContain('model: keep-this-body-text');
  });

  test('preserves explicit inheritance through subsequent default synchronization', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-model-inherit-'));
    roots.push(homeDir);
    const packageRoot = join(homeDir, 'package');
    for (const artifact of piAdapter.render({ projectRoot: homeDir })
      .artifacts) {
      const target = join(packageRoot, 'pi', artifact.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, String(artifact.content));
    }
    const syncOptions = { packageRoot, piRoot: join(homeDir, '.pi', 'agent') };
    expect(syncPiSpecialists(syncOptions).success).toBe(true);
    const context = { cwd: homeDir, homeDir, env: {} };
    const plan = buildPiModelPlan(
      {
        harness: 'pi',
        dryRun: false,
        roles: [
          { role: 'worker', model: 'inherit', effort: { kind: 'inherit' } },
        ],
      },
      context,
    );
    expect(applyPiPlan(plan).applied).toBe(true);
    const inherited = readFileSync(
      join(syncOptions.piRoot, 'agents', 'thoth-worker.md'),
      'utf8',
    );
    expect(inherited).toContain('model: "inherit"');
    expect(inherited).not.toContain('thoth-model-inherit');
    expect(inherited).not.toContain('thoth-thinking-inherit');
    expect(syncPiSpecialists(syncOptions).success).toBe(true);
    expect(
      defaultPiModelRoles(context).find(({ role }) => role === 'worker'),
    ).toMatchObject({
      model: 'inherit',
      effort: { kind: 'inherit' },
    });
    const content = readFileSync(
      join(syncOptions.piRoot, 'agents', 'thoth-worker.md'),
      'utf8',
    );
    expect(content).toContain('model: "inherit"');
    expect(content).not.toMatch(/^thinking:/m);
  });
});

test('restores Pi defaults while preserving specialist bodies and ambient root', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'pi-restore-'));
  roots.push(homeDir);
  const defaults = getShippedModelRoles('pi');
  const paths = defaults.map((role) =>
    join(homeDir, '.pi', 'agent', 'agents', `thoth-${role.role}.md`),
  );
  for (const [index, path] of paths.entries()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `---
name: thoth-${defaults[index]?.role}
managed-by: thoth-agents
model: custom/model
thinking: high
tools: read
---
Keep this body.
`,
    );
  }
  const rootPath = join(homeDir, '.pi', 'agent', 'settings.json');
  writeFileSync(rootPath, '{"defaultModel":"custom-root"}');
  const before = paths.map((path) => readFileSync(path, 'utf8'));
  const plan = buildRestoreModelPlan('pi', [], {
    cwd: homeDir,
    homeDir,
    env: {},
  });
  expect(plan.canApply).toBe(true);
  expect(paths.map((path) => readFileSync(path, 'utf8'))).toEqual(before);
  expect(applyPiPlan(plan).applied).toBe(true);
  defaults.forEach((role, index) => {
    const content = readFileSync(paths[index] ?? '', 'utf8');
    expect(content).toContain(`model: "${role.model}"`);
    expect(content).toContain(
      `effort: "${role.effort?.kind === 'effort' ? role.effort.value : ''}"`,
    );
    expect(content).toContain('tools: read');
    expect(content).toContain('Keep this body.');
  });
  expect(readFileSync(rootPath, 'utf8')).toBe('{"defaultModel":"custom-root"}');
});
