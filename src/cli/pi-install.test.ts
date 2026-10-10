import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { inspectPiExternalPackage } from './pi-external-package';
import {
  applyPiSetup,
  buildPiSetupPlan,
  mergePiGrepMcpConfig,
  mergePiSubagentsConfig,
  PI_MINIMUM_VERSION,
  PI_PACKAGE_SPECS,
  parsePiPackageList,
  verifyPiFirstPartyPackage,
  writePiManagedText,
} from './pi-install';
import {
  readPiPackageReceipt,
  writePiPackageReceipt,
} from './pi-package-receipt';
import { PI_SPECIALIST_NAMES } from './pi-resources';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function localSource(from: string, to: string): string {
  const path = relative(from, to);
  return path.startsWith('.') ? path : `.${sep}${path}`;
}

function externalPackageFixture(
  packageName: string,
  version?: string,
): {
  installedPath: string;
  candidate: { scope: 'user'; source: string; installedPath: string };
} {
  const installedPath = mkdtempSync(join(tmpdir(), 'thoth-pi-external-'));
  roots.push(installedPath);
  if (version !== undefined)
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ name: packageName, version }),
    );
  return {
    installedPath,
    candidate: {
      scope: 'user',
      source: `npm:${packageName}@>=1.2.3`,
      installedPath,
    },
  };
}

function externalPackageList(
  homeDir: string,
  versions: Partial<
    Record<(typeof PI_PACKAGE_SPECS)[number]['id'], string>
  > = {},
  sources: Partial<
    Record<(typeof PI_PACKAGE_SPECS)[number]['id'], string>
  > = {},
): string[] {
  return PI_PACKAGE_SPECS.flatMap((spec) => {
    const installedPath = join(homeDir, 'external', spec.id);
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({
        name: spec.packageName,
        version: versions[spec.id] ?? spec.version,
      }),
    );
    return [`  ${sources[spec.id] ?? spec.source}`, `    ${installedPath}`];
  });
}

function fixture() {
  const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-install-'));
  roots.push(homeDir);
  const version = '0.3.12';
  const source = `npm:thoth-agents@${version}`;
  return {
    homeDir,
    cwd: join(homeDir, 'project'),
    env: {},
    packageRoot: process.cwd(),
    expectedVersion: version,
    receiptOptions: { configRoot: join(homeDir, '.config') },
    verifyFirstParty: () => ({
      success: true as const,
      receipt: {
        schemaVersion: 1 as const,
        owner: 'thoth-agents' as const,
        scope: 'user' as const,
        packageName: 'thoth-agents' as const,
        source,
        installSource: source,
        version,
        manifestSha256: 'a'.repeat(64),
        extensionSha256: 'b'.repeat(64),
      },
    }),
  };
}

function nativeInstallerFixture(paths: ReturnType<typeof fixture>) {
  const packages = new Map<string, { source: string; installedPath: string }>();
  const mutations: string[][] = [];
  const extraPackages: string[] = [];
  function seed(packageName: string, source: string, version: string) {
    const installedPath = join(
      paths.homeDir,
      'native-packages',
      packageName.replaceAll('/', '-'),
    );
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ name: packageName, version }),
    );
    packages.set(packageName, { source, installedPath });
    return installedPath;
  }
  const commandExecutor = (command: string, args: readonly string[]) => {
    if (command === 'node')
      return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
    if (args[0] === '--version')
      return { exitCode: 0, stdout: '1.0.2', stderr: '' };
    if (args[0] === 'install' || args[0] === 'remove')
      mutations.push([...args]);
    if (args[0] === 'install') {
      const source = args[1] ?? '';
      if (source === 'npm:thoth-agents@0.3.12')
        packages.set('thoth-agents', {
          source,
          installedPath: paths.packageRoot,
        });
      else {
        const spec = PI_PACKAGE_SPECS.find((pkg) => pkg.source === source);
        if (spec) seed(spec.packageName, source, spec.version);
      }
    }
    if (args[0] === 'list')
      return {
        exitCode: 0,
        stdout: [
          'User packages:',
          ...[...packages.values()].flatMap(({ source, installedPath }) => [
            `  ${source}`,
            `    ${installedPath}`,
          ]),
          ...extraPackages,
        ].join('\n'),
        stderr: '',
      };
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  return { seed, packages, extraPackages, mutations, commandExecutor };
}

describe('Pi setup', () => {
  test.each([
    'local',
    'pinned',
    'git',
    'npm-alias',
  ])('preserves and verifies compatible user theme, background and sidebar copies from %s sources', (sourceKind) => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const manifests = [
      '@thoth-agents/pi-thoth-theme',
      '@thoth-agents/pi-background-tasks',
      '@thoth-agents/pi-sidebar',
    ].map((name) => {
      const version = sourceKind === 'local' ? '0.3.0' : '0.4.0';
      const source =
        sourceKind === 'pinned'
          ? `npm:${name}@${version}`
          : sourceKind === 'npm-alias'
            ? `npm:operator-${name.split('/')[1]}@npm:${name}@${version}`
            : sourceKind === 'git'
              ? `git:https://example.test/operator/${name.split('/')[1]}.git`
              : `./operator-${name.split('/')[1]}`;
      const installedPath = native.seed(name, source, version);
      return { path: join(installedPath, 'package.json'), source };
    });
    const before = manifests.map(({ path }) => readFileSync(path, 'utf8'));
    const result = applyPiSetup(
      buildPiSetupPlan({ ...paths, commandExecutor: native.commandExecutor }),
    );

    expect(result.success).toBe(true);
    expect(result.installedPackages).toEqual(
      expect.arrayContaining([
        'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
        'npm:@thoth-agents/pi-background-tasks@>=0.3.0',
        'npm:@thoth-agents/pi-sidebar@>=0.3.0',
      ]),
    );
    for (const source of [
      'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
      'npm:@thoth-agents/pi-background-tasks@>=0.3.0',
      'npm:@thoth-agents/pi-sidebar@>=0.3.0',
    ])
      expect(native.mutations.flat()).not.toContain(source);
    expect(manifests.map(({ path }) => readFileSync(path, 'utf8'))).toEqual(
      before,
    );
    for (const { source } of manifests)
      expect(result.diagnostics.join('\n')).toContain(source);
  });
  test.each([
    '@thoth-agents/pi-thoth-theme',
    '@thoth-agents/pi-background-tasks',
    '@thoth-agents/pi-sidebar',
  ])('leaves below-floor user copy %s untouched and blocks completion with native upgrade guidance', (name) => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const source = `npm:${name}@0.2.9`;
    const installedPath = native.seed(name, source, '0.2.9');
    const manifestPath = join(installedPath, 'package.json');
    const before = readFileSync(manifestPath, 'utf8');
    const result = applyPiSetup(
      buildPiSetupPlan({ ...paths, commandExecutor: native.commandExecutor }),
    );

    expect(result).toMatchObject({
      success: false,
      changed: [],
      installedPackages: [],
      failedStep: 'preflight',
      error: expect.stringContaining('>=0.3.0'),
      manualRecovery: expect.stringContaining(
        `pi remove ${source} --no-approve`,
      ),
    });
    expect(result.manualRecovery).toContain(
      `pi install npm:${name}@>=0.3.0 --no-approve`,
    );
    expect(native.mutations).toEqual([]);
    expect(readFileSync(manifestPath, 'utf8')).toBe(before);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test.each([
    ['./renamed-theme', 'missing'],
    ['git:https://example.test/operator/renamed.git', 'malformed'],
    ['npm:@thoth-agents/pi-background-tasks@0.3.0', 'nameless'],
    ['./renamed-background', 'directory'],
    ['npm:@thoth-agents/pi-sidebar@0.3.0', 'nameless'],
  ])('fails closed for unreadable or missing manifest identity (%s, %s)', (source, problem) => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const installedPath = native.seed(
      source.includes('pi-sidebar')
        ? '@thoth-agents/pi-sidebar'
        : '@thoth-agents/pi-background-tasks',
      source,
      '0.3.0',
    );
    const manifestPath = join(installedPath, 'package.json');
    if (problem === 'malformed') writeFileSync(manifestPath, '{');
    else if (problem === 'nameless')
      writeFileSync(manifestPath, '{"version":"0.3.0"}');
    else {
      rmSync(manifestPath);
      if (problem === 'directory') mkdirSync(manifestPath);
    }
    const result = applyPiSetup(
      buildPiSetupPlan({ ...paths, commandExecutor: native.commandExecutor }),
    );

    expect(result).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      error: expect.stringContaining('manifest identity'),
    });
    expect(result.error).toContain(source);
    expect(native.mutations).toEqual([]);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test.each([
    '@thoth-agents/pi-thoth-theme',
    '@thoth-agents/pi-sidebar',
  ])('dry-run blocks a configured below-floor %s checkout without commands or filesystem mutation', (name) => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const installedPath = native.seed(name, './placeholder', '0.2.9');
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = JSON.stringify({
      packages: [installedPath],
      theme: 'mine',
    });
    writeFileSync(settingsPath, settings);
    const commands: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command, args) => {
        commands.push([command, ...args]);
        return native.commandExecutor(command, args);
      },
    });

    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain('>=0.3.0');
    expect(plan.blockers.join('\n')).toContain(
      `pi remove ${installedPath} --no-approve`,
    );
    expect(plan.blockers.join('\n')).toContain(
      `pi install npm:${name}@>=0.3.0 --no-approve`,
    );
    expect(applyPiSetup(plan)).toMatchObject({ success: false, changed: [] });
    expect(commands).toEqual([]);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
    expect(
      JSON.parse(readFileSync(join(installedPath, 'package.json'), 'utf8'))
        .version,
    ).toBe('0.2.9');
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test('fresh installation verifies theme, background tasks and sidebar, then preserves them idempotently', () => {
    const paths = fixture();
    paths.packageRoot = join(paths.homeDir, 'root-package');
    mkdirSync(join(paths.packageRoot, 'pi', 'agents'), { recursive: true });
    writeFileSync(
      join(paths.packageRoot, 'package.json'),
      '{"name":"thoth-agents","version":"0.3.12"}',
    );
    for (const name of PI_SPECIALIST_NAMES)
      writeFileSync(
        join(paths.packageRoot, 'pi', 'agents', `${name}.md`),
        `---\nname: ${name}\nmanaged-by: thoth-agents\n---\n${name}\n`,
      );
    const native = nativeInstallerFixture(paths);
    const options = { ...paths, commandExecutor: native.commandExecutor };
    const first = applyPiSetup(buildPiSetupPlan(options));
    expect(first.success).toBe(true);
    for (const [name, source] of [
      [
        '@thoth-agents/pi-thoth-theme',
        'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
      ],
      [
        '@thoth-agents/pi-background-tasks',
        'npm:@thoth-agents/pi-background-tasks@>=0.3.0',
      ],
      ['@thoth-agents/pi-sidebar', 'npm:@thoth-agents/pi-sidebar@>=0.3.0'],
    ]) {
      expect(first.installedPackages).toContain(source);
      expect(native.mutations).toContainEqual([
        'install',
        source,
        '--no-approve',
      ]);
      const installedPath = native.packages.get(name)?.installedPath ?? '';
      expect(
        JSON.parse(readFileSync(join(installedPath, 'package.json'), 'utf8')),
      ).toEqual({ name, version: '0.3.0' });
    }
    const before = first.changed.map((path) => readFileSync(path, 'utf8'));
    const receipt = readPiPackageReceipt(paths.receiptOptions);
    native.mutations.length = 0;
    const second = applyPiSetup(buildPiSetupPlan(options));
    expect(second.success).toBe(true);
    expect(second.installedPackages).toEqual(first.installedPackages);
    // Root receipt/reinstall behavior is intentionally unchanged.
    expect(native.mutations).toEqual([
      ['install', 'npm:thoth-agents@0.3.12', '--no-approve'],
    ]);
    expect(first.changed.map((path) => readFileSync(path, 'utf8'))).toEqual(
      before,
    );
    expect(readPiPackageReceipt(paths.receiptOptions)).toEqual(receipt);
  });

  test.each(
    ['@thoth-agents/pi-thoth-theme', '@thoth-agents/pi-sidebar'].flatMap(
      (name) =>
        [
          'duplicate',
          'project',
          'invalid-version',
          'prerelease',
          'wrong-name',
        ].map((problem) => ({ name, problem })),
    ),
  )('leaves ambiguous or invalid user copies untouched ($name, $problem)', ({
    name,
    problem,
  }) => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const source = `npm:${name}@0.3.0`;
    const installedPath = native.seed(
      name,
      source,
      problem === 'invalid-version'
        ? 'not-semver'
        : problem === 'prerelease'
          ? '0.4.0-beta.1'
          : '0.3.0',
    );
    if (problem === 'wrong-name')
      writeFileSync(
        join(installedPath, 'package.json'),
        '{"name":"@operator/not-the-preserved-package","version":"9.0.0"}',
      );
    if (problem === 'duplicate' || problem === 'project')
      native.extraPackages.push(
        ...(problem === 'project' ? ['Project packages:'] : []),
        `  git:https://example.test/operator/${name.split('/')[1]}.git`,
        `    ${installedPath}`,
      );
    const before = readFileSync(join(installedPath, 'package.json'), 'utf8');
    const result = applyPiSetup(
      buildPiSetupPlan({ ...paths, commandExecutor: native.commandExecutor }),
    );

    expect(result).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
    });
    expect(result.error).toContain(name);
    expect(native.mutations).toEqual([]);
    expect(readFileSync(join(installedPath, 'package.json'), 'utf8')).toBe(
      before,
    );
  });

  test.each([
    'missing',
    'below-floor',
  ])('individually re-verifies a preserved copy without reinstalling when its manifest changes (%s)', (problem) => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const source = 'npm:@thoth-agents/pi-thoth-theme@0.3.0';
    const installedPath = native.seed(
      '@thoth-agents/pi-thoth-theme',
      source,
      '0.3.0',
    );
    let afterTodoLists = 0;
    const result = applyPiSetup(
      buildPiSetupPlan({
        ...paths,
        commandExecutor: (command, args) => {
          if (
            args[0] === 'list' &&
            native.packages.has('@thoth-agents/pi-todo')
          ) {
            afterTodoLists += 1;
            if (afterTodoLists === 3) {
              if (problem === 'missing')
                rmSync(join(installedPath, 'package.json'));
              else native.seed('@thoth-agents/pi-thoth-theme', source, '0.2.9');
            }
          }
          return native.commandExecutor(command, args);
        },
      }),
    );

    expect(result).toMatchObject({
      success: false,
      failedStep: 'package',
      error: expect.stringContaining(
        problem === 'missing' ? 'manifest identity' : '>=0.3.0',
      ),
      receiptCommitted: true,
    });
    expect(result.installedPackages).not.toContain(
      'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
    );
    expect(native.mutations.flat()).not.toContain(
      'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
    );
    expect(existsSync(join(installedPath, 'package.json'))).toBe(
      problem !== 'missing',
    );
    if (problem === 'below-floor')
      expect(result.manualRecovery).toContain(
        `pi remove ${source} --no-approve`,
      );
    expect(
      existsSync(join(paths.homeDir, '.pi', 'agent', 'subagents.json')),
    ).toBe(false);
  });

  test('preservation remains opt-in: an existing pinned delegation copy keeps managed reinstall behavior', () => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    native.seed(
      '@thoth-agents/pi-subagents',
      'npm:@thoth-agents/pi-subagents@0.3.0',
      '0.3.0',
    );
    const result = applyPiSetup(
      buildPiSetupPlan({
        ...paths,
        commandExecutor: native.commandExecutor,
      }),
    );

    expect(result.success).toBe(true);
    expect(native.mutations).toContainEqual([
      'install',
      'npm:@thoth-agents/pi-subagents@>=0.3.0',
      '--no-approve',
    ]);
    expect(result.diagnostics.join('\n')).not.toContain(
      'Preserved and verified @thoth-agents/pi-subagents',
    );
  });

  test('preserves configured local copies using resolved directories when pi list omits their paths', () => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const packagePaths = [
      '@thoth-agents/pi-thoth-theme',
      '@thoth-agents/pi-background-tasks',
      '@thoth-agents/pi-sidebar',
    ].map((name) => {
      const installedPath = native.seed(name, './placeholder', '0.3.0');
      native.packages.set(name, { source: installedPath, installedPath });
      return installedPath;
    });
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = JSON.stringify({ packages: packagePaths, theme: 'mine' });
    writeFileSync(settingsPath, settings);
    const commandExecutor = (command: string, args: readonly string[]) => {
      const result = native.commandExecutor(command, args);
      return args[0] === 'list'
        ? {
            ...result,
            stdout: result.stdout
              .split('\n')
              .filter(
                (line) => !packagePaths.some((path) => line === `    ${path}`),
              )
              .join('\n'),
          }
        : result;
    };
    const dryRun = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor,
    });
    expect(dryRun.ready).toBe(true);
    expect(applyPiSetup(dryRun)).toMatchObject({ success: true, changed: [] });
    expect(native.mutations).toEqual([]);
    const result = applyPiSetup(
      buildPiSetupPlan({ ...paths, commandExecutor }),
    );

    expect(result.success).toBe(true);
    for (const source of [
      'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
      'npm:@thoth-agents/pi-background-tasks@>=0.3.0',
      'npm:@thoth-agents/pi-sidebar@>=0.3.0',
    ]) {
      expect(result.installedPackages).toContain(source);
      expect(native.mutations.flat()).not.toContain(source);
    }
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
  });

  test.each([
    'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
    'npm:@thoth-agents/pi-background-tasks@>=0.3.0',
    'npm:@thoth-agents/pi-sidebar@>=0.3.0',
  ])('fresh install requires individual verification of %s before managed completion', (source) => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const result = applyPiSetup(
      buildPiSetupPlan({
        ...paths,
        commandExecutor: (command, args) => {
          const result = native.commandExecutor(command, args);
          if (args[0] === 'install' && args[1] === source) {
            const name = source.slice(4).replace(/@>=.*$/, '');
            native.seed(name, source, '0.2.9');
          }
          return result;
        },
      }),
    );

    expect(result).toMatchObject({
      success: false,
      failedStep: 'package',
      error: expect.stringContaining(`Pi did not verify ${source}`),
      receiptCommitted: true,
    });
    expect(result.installedPackages).not.toContain(source);
    expect(native.mutations).toContainEqual([
      'install',
      source,
      '--no-approve',
    ]);
    expect(
      existsSync(join(paths.homeDir, '.pi', 'agent', 'subagents.json')),
    ).toBe(false);
  });

  test('fails closed when a configured user copy disappears from pi list after preview', () => {
    const paths = fixture();
    const native = nativeInstallerFixture(paths);
    const name = '@thoth-agents/pi-thoth-theme';
    const installedPath = native.seed(name, './placeholder', '0.3.0');
    native.packages.set(name, { source: installedPath, installedPath });
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ packages: [installedPath] }));
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: native.commandExecutor,
    });
    expect(plan.ready).toBe(true);
    rmSync(join(installedPath, 'package.json'));
    native.packages.delete(name);
    const result = applyPiSetup(plan);

    expect(result).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      error: expect.stringContaining('manifest identity'),
    });
    expect(native.mutations).toEqual([]);
    expect(existsSync(join(installedPath, 'package.json'))).toBe(false);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test('validates external package scope, identity, and stable minimum version from its manifest', () => {
    const spec = {
      source: 'npm:@scope/example@>=1.2.3',
      packageName: '@scope/example',
      version: '1.2.3',
    };
    const equal = externalPackageFixture(spec.packageName, '1.2.3');
    equal.candidate.source = spec.source;
    expect(inspectPiExternalPackage([equal.candidate], spec)).toMatchObject({
      state: 'installed',
      version: '1.2.3',
    });

    const newer = externalPackageFixture(spec.packageName, '2.0.0');
    newer.candidate.source = spec.source;
    expect(inspectPiExternalPackage([newer.candidate], spec)).toMatchObject({
      state: 'installed',
      version: '2.0.0',
    });

    for (const version of ['1.2.2', '2.0.0-beta.1', 'not-semver']) {
      const invalid = externalPackageFixture(spec.packageName, version);
      invalid.candidate.source = spec.source;
      expect(inspectPiExternalPackage([invalid.candidate], spec).state).toBe(
        'drift',
      );
    }
    const missingVersion = externalPackageFixture(spec.packageName);
    missingVersion.candidate.source = spec.source;
    expect(
      inspectPiExternalPackage([missingVersion.candidate], spec).state,
    ).toBe('drift');

    const wrongName = externalPackageFixture('@scope/example-extra', '9.0.0');
    wrongName.candidate.source = 'npm:@scope/example-extra@>=1.2.3';
    expect(inspectPiExternalPackage([wrongName.candidate], spec).state).toBe(
      'missing',
    );
    expect(
      inspectPiExternalPackage([{ ...equal.candidate, scope: 'project' }], spec)
        .state,
    ).toBe('drift');
  });

  test('validates an adopted runtime installed from a local source by its manifest identity', () => {
    const spec = {
      source: 'npm:@thoth-agents/pi-subagents@>=0.1.0',
      packageName: '@thoth-agents/pi-subagents',
      version: '0.1.0',
    };
    const local = externalPackageFixture(spec.packageName, spec.version);
    local.candidate.source = local.installedPath;

    expect(
      inspectPiExternalPackage([local.candidate], spec, false),
    ).toMatchObject({
      state: 'installed',
      source: local.installedPath,
      installedPath: local.installedPath,
      version: '0.1.0',
    });
  });

  test('parses user and project sources with their resolved installed directories', () => {
    expect(
      parsePiPackageList(
        'User packages:\n  npm:thoth-agents@1.0.0\n    C:\\packages\\thoth-agents\nProject packages:\n  ./local-thoth-agents\n    C:\\project\\local-thoth-agents',
      ),
    ).toEqual([
      {
        scope: 'user',
        source: 'npm:thoth-agents@1.0.0',
        installedPath: 'C:\\packages\\thoth-agents',
      },
      {
        scope: 'project',
        source: './local-thoth-agents',
        installedPath: 'C:\\project\\local-thoth-agents',
      },
    ]);
  });

  test('verifies the resolved installed package directory instead of the executing package', () => {
    const paths = fixture();
    const installedRoot = join(paths.homeDir, 'resolved-package');
    mkdirSync(installedRoot);
    let verifiedRoot = '';
    let installed = false;
    const plan = buildPiSetupPlan({
      ...paths,
      verifyFirstParty: (input) => {
        verifiedRoot = input.packageRoot;
        return paths.verifyFirstParty();
      },
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install') installed = true;
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: installed
              ? `User packages:\n  npm:thoth-agents@0.3.12\n    ${installedRoot}`
              : '',
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(applyPiSetup(plan).success).toBe(false);
    expect(verifiedRoot).toBe(installedRoot);
  });

  test('commits Pi canonical local source with its absolute command-safe install source', () => {
    const paths = fixture();
    const installedRoot = join(paths.homeDir, 'unpacked', 'package');
    const canonicalSource = localSource(paths.cwd, installedRoot);
    mkdirSync(installedRoot, { recursive: true });
    writeFileSync(
      join(installedRoot, 'package.json'),
      '{"name":"thoth-agents","version":"0.3.12"}',
    );
    let installed = false;
    const plan = buildPiSetupPlan({
      ...paths,
      firstPartySource: installedRoot,
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
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install') installed = true;
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: installed
              ? `User packages:\n  ${canonicalSource}\n    ${installedRoot}`
              : '',
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      receiptCommitted: true,
    });
    expect(readPiPackageReceipt(paths.receiptOptions)).toMatchObject({
      status: 'valid',
      receipt: { source: canonicalSource, installSource: installedRoot },
    });
  });

  test('rejects stale specialist provenance and missing manifest skills', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-candidate-'));
    roots.push(root);
    mkdirSync(join(root, 'dist'), { recursive: true });
    mkdirSync(join(root, 'pi'), { recursive: true });
    writeFileSync(join(root, 'dist', 'pi.js'), 'export default () => {}');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'thoth-agents',
        version: '0.3.12',
        pi: { extensions: ['./dist/pi.js'], skills: ['./skills'] },
      }),
    );
    const roles = PI_SPECIALIST_NAMES;
    const files = Object.fromEntries(
      roles.map((role) => [`agents/${role}.md`, '0'.repeat(64)]),
    );
    const provenancePath = join(root, 'pi', '.thoth-agents-assets.json');
    writeFileSync(
      provenancePath,
      JSON.stringify({ schemaVersion: 1, owner: 'thoth-agents', files }),
    );
    const input = {
      source: localSource(dirname(root), root),
      installSource: root,
      version: '0.3.12',
      packageRoot: root,
    };
    expect(verifyPiFirstPartyPackage(input)).toMatchObject({
      success: false,
      error: expect.stringContaining('specialist asset'),
    });

    mkdirSync(join(root, 'pi', 'agents'), { recursive: true });
    for (const role of roles) {
      const path = join(root, 'pi', 'agents', `${role}.md`);
      writeFileSync(path, role);
      files[`agents/${role}.md`] = createHash('sha256')
        .update(readFileSync(path))
        .digest('hex');
    }
    writeFileSync(
      provenancePath,
      JSON.stringify({ schemaVersion: 1, owner: 'thoth-agents', files }),
    );
    expect(verifyPiFirstPartyPackage(input)).toMatchObject({
      success: false,
      error: expect.stringContaining('manifest skill'),
    });
  });

  test('plans minimum-only external packages in order and dry-run mutates nothing', () => {
    const paths = fixture();
    let calls = 0;
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: () => {
        calls += 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(
      plan.items
        .filter(({ kind }) => kind === 'package')
        .map(({ target }) => target),
    ).toEqual([
      'npm:thoth-agents@0.3.12',
      'npm:@thoth-agents/pi-subagents@>=0.3.0',
      'npm:@upstash/context7-pi@>=0.1.2',
      'npm:pi-web-access@>=0.27.0',
      'npm:pi-mcp-adapter@>=2.32.1',
      'npm:@thoth-agents/pi-questions-user@>=0.3.0',
      'npm:@thoth-agents/pi-todo@>=0.3.0',
      'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
      'npm:@thoth-agents/pi-background-tasks@>=0.3.0',
      'npm:@thoth-agents/pi-sidebar@>=0.3.0',
    ]);
    expect(PI_MINIMUM_VERSION).toBe('0.99.0');
    expect(plan.items[0]?.description).toContain('Pi >=0.99.0');
    expect(PI_PACKAGE_SPECS).toHaveLength(9);
    expect(PI_PACKAGE_SPECS.map(({ source }) => source)).not.toEqual(
      expect.arrayContaining([
        'npm:@feniix/pi-exa@5.1.1',
        'npm:@juicesharp/rpiv-web-tools@2.9.0',
      ]),
    );
    expect(plan.items.map(({ kind }) => kind)).toEqual([
      'preflight',
      'package',
      'package',
      'package',
      'package',
      'package',
      'package',
      'package',
      'package',
      'package',
      'package',
      'settings',
      'mcp',
      'agent',
      'agent',
      'agent',
      'agent',
      'agent',
    ]);
    expect(applyPiSetup(plan)).toMatchObject({
      success: true,
      changed: [],
      installedPackages: [],
    });
    expect(calls).toBe(0);
    expect(
      plan.items.some(({ command }) => command?.args[0] === 'remove'),
    ).toBe(false);
    expect(existsSync(plan.paths.piRoot)).toBe(false);
  });

  test.each([
    ['npm:@juicesharp/rpiv-ask-user-question@>=2.9.0', 'managed-real'],
    ['./renamed-questions', 'local'],
    [
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0',
      'legacy-global',
    ],
    [
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0',
      'managed',
    ],
    ['npm:operator-questions@2.9.0', 'legacy-global'],
    [
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0',
      'legacy-global',
      'pnpm',
    ],
    [
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0',
      'legacy-global',
      'bun',
    ],
    ['git:https://example.test/operator/renamed-questions.git', 'git'],
  ])('previews and applies the same native question-provider removal (%s, %s)', (source, layout, manager = 'npm') => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const globalNpmRoot =
      manager === 'bun'
        ? join(paths.homeDir, 'bun', 'install', 'global', 'node_modules')
        : join(paths.homeDir, 'global', 'node_modules');
    const oldPackagePath =
      layout === 'legacy-global'
        ? join(globalNpmRoot, 'operator-questions')
        : layout === 'managed'
          ? join(
              dirname(settingsPath),
              'npm',
              'node_modules',
              'operator-questions',
            )
          : layout === 'managed-real'
            ? join(
                dirname(settingsPath),
                'npm',
                'node_modules',
                '@juicesharp',
                'rpiv-ask-user-question',
              )
            : layout === 'git'
              ? join(
                  dirname(settingsPath),
                  'git',
                  'example.test',
                  'operator',
                  'renamed-questions',
                )
              : join(dirname(settingsPath), 'renamed-questions');
    mkdirSync(oldPackagePath, { recursive: true });
    writeFileSync(
      join(oldPackagePath, 'package.json'),
      JSON.stringify({
        name: '@juicesharp/rpiv-ask-user-question',
        version: '2.9.0',
      }),
    );
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        packages: [{ source, extensions: [] }],
        npmCommand: [manager],
      }),
    );
    const externalLines = externalPackageList(paths.homeDir);
    const unrelated = externalPackageFixture(
      '@vendor/rpiv-ask-user-question-extra',
      '1.0.0',
    );
    const questionsIndex = PI_PACKAGE_SPECS.findIndex(
      ({ id }) => id === 'ask-user-question',
    );
    let oldInstalled = true;
    let questionsInstalled = false;
    let rootInstalled = false;
    let rootVerified = false;
    const mutations: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      verifyFirstParty: () => {
        rootVerified = true;
        return paths.verifyFirstParty();
      },
      commandExecutor: (command, args) => {
        if (command === manager) {
          const metadataArgs =
            manager === 'pnpm'
              ? ['list', '-g', '--json']
              : manager === 'bun'
                ? ['pm', 'bin', '-g']
                : ['root', '-g'];
          expect(args).toEqual(metadataArgs);
          return {
            exitCode: 0,
            stdout:
              manager === 'pnpm'
                ? JSON.stringify([
                    {
                      dependencies: {
                        'operator-questions': { path: oldPackagePath },
                      },
                    },
                  ])
                : manager === 'bun'
                  ? join(paths.homeDir, 'bun', 'bin')
                  : globalNpmRoot,
            stderr: '',
          };
        }
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'remove') {
          expect(rootVerified).toBe(true);
          mutations.push([...args]);
          oldInstalled = false;
        }
        if (args[0] === 'install') {
          mutations.push([...args]);
          if (args[1] === 'npm:thoth-agents@0.3.12') rootInstalled = true;
          if (args[1] === 'npm:@thoth-agents/pi-questions-user@>=0.3.0')
            questionsInstalled = true;
        }
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              'User packages:',
              ...(rootInstalled
                ? ['  npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              ...(oldInstalled ? [`  ${source}`, `    ${oldPackagePath}`] : []),
              '  npm:@vendor/rpiv-ask-user-question-extra@1.0.0',
              `    ${unrelated.installedPath}`,
              ...externalLines.filter(
                (_, index) =>
                  questionsInstalled ||
                  Math.floor(index / 2) !== questionsIndex,
              ),
            ].join('\n'),
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const removalPreview = plan.items.flatMap(({ command }) =>
      command?.args[0] === 'remove' ? [command.args] : [],
    );
    expect(removalPreview).toEqual([['remove', source, '--no-approve']]);
    expect(applyPiSetup(plan)).toMatchObject({
      success: true,
      installedPackages: expect.arrayContaining([
        'npm:@thoth-agents/pi-questions-user@>=0.3.0',
      ]),
    });
    expect(mutations.filter(([action]) => action === 'remove')).toEqual(
      removalPreview,
    );
    expect(mutations).toEqual([
      ['install', 'npm:thoth-agents@0.3.12', '--no-approve'],
      ['remove', source, '--no-approve'],
      [
        'install',
        'npm:@thoth-agents/pi-questions-user@>=0.3.0',
        '--no-approve',
      ],
    ]);
  });

  test.each([
    'before mutation',
    'after root verification',
  ])('blocks an unpreviewed user question provider discovered %s', (arrival) => {
    const paths = fixture();
    const source =
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0';
    const installedPath = join(paths.homeDir, 'late-questions');
    mkdirSync(installedPath);
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({
        name: '@juicesharp/rpiv-ask-user-question',
        version: '2.9.0',
      }),
    );
    let rootInstalled = false;
    let incumbentPresent = arrival === 'before mutation';
    const mutations: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      verifyFirstParty: () => {
        incumbentPresent = true;
        return paths.verifyFirstParty();
      },
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (command === 'npm')
          return { exitCode: 1, stdout: '', stderr: 'no global metadata' };
        if (args[0] === 'install' || args[0] === 'remove') {
          mutations.push(args.join(' '));
          rootInstalled = true;
        }
        return {
          exitCode: 0,
          stdout:
            args[0] === 'list'
              ? [
                  'User packages:',
                  ...(rootInstalled
                    ? ['  npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                    : []),
                  ...(incumbentPresent
                    ? [`  ${source}`, `    ${installedPath}`]
                    : []),
                ].join('\n')
              : '',
          stderr: '',
        };
      },
    });
    expect(plan.ready).toBe(true);
    expect(
      plan.items.some(({ command }) => command?.args[0] === 'remove'),
    ).toBe(false);

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      error: expect.stringContaining('not previewed'),
      manualRecovery: expect.stringContaining(
        `pi remove ${source} --no-approve`,
      ),
    });
    expect(mutations).toEqual(
      arrival === 'before mutation'
        ? []
        : ['install npm:thoth-agents@0.3.12 --no-approve'],
    );
    expect(existsSync(plan.paths.mcpConfigPath)).toBe(false);
  });

  test.each([
    ['before mutation', 'unreadable'],
    ['after root verification', 'unreadable'],
    ['before mutation', 'nameless'],
    ['after root verification', 'nameless'],
  ])('blocks a previewed local question provider whose manifest identity is lost (%s, %s)', (arrival, manifestState) => {
    const paths = fixture();
    const source = './operator-questions';
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const installedPath = join(dirname(settingsPath), 'operator-questions');
    const manifestPath = join(installedPath, 'package.json');
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify({
        name: '@juicesharp/rpiv-ask-user-question',
        version: '2.9.0',
      }),
    );
    writeFileSync(settingsPath, JSON.stringify({ packages: [source] }));
    const mutations: string[] = [];
    let rootInstalled = false;
    const lostIdentity = manifestState === 'unreadable' ? '{broken' : '{}';
    const plan = buildPiSetupPlan({
      ...paths,
      verifyFirstParty: () => {
        if (arrival === 'after root verification')
          writeFileSync(manifestPath, lostIdentity);
        return paths.verifyFirstParty();
      },
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (command === 'npm') return { exitCode: 1, stdout: '', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install' || args[0] === 'remove') {
          mutations.push(args.join(' '));
          rootInstalled = true;
        }
        return {
          exitCode: 0,
          stdout:
            args[0] === 'list'
              ? [
                  'User packages:',
                  `  ${source}`,
                  `    ${installedPath}`,
                  ...(rootInstalled
                    ? ['  npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                    : []),
                ].join('\n')
              : '',
          stderr: '',
        };
      },
    });
    expect(plan.ready).toBe(true);
    if (arrival === 'before mutation')
      writeFileSync(manifestPath, lostIdentity);

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      error: expect.stringContaining('manifest identity'),
      manualRecovery: expect.stringContaining(
        `pi remove ${source} --no-approve`,
      ),
    });
    expect(mutations).toEqual(
      arrival === 'before mutation'
        ? []
        : ['install npm:thoth-agents@0.3.12 --no-approve'],
    );
  });

  test.each([
    ['npm', 'install'],
    ['npx', '--yes', 'npm'],
    ['npm', 'exec', '--', 'npm'],
    ['operator-wrapper', 'npm'],
    ['operator-wrapper'],
    ['npm install'],
    ['npx --yes /tools/npm'],
    ['npm install C:\\tools\\npm.cmd'],
    ['npx --yes && /tools/npm'],
    ['npm install; /tools/npm'],
  ])('never executes an unsafe configured metadata command in dry-run (%j)', (...npmCommand) => {
    const paths = fixture();
    const source = 'npm:operator-questions@2.9.0';
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = JSON.stringify({ packages: [source], npmCommand });
    writeFileSync(settingsPath, settings);
    const calls: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command, args) => {
        calls.push([command, ...args]);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(calls).toEqual([]);
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain(source);
    expect(plan.blockers.join('\n')).toContain('manifest identity');
    expect(applyPiSetup(plan)).toMatchObject({ success: false, changed: [] });
    expect(calls).toEqual([]);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
  });

  test.each([
    { npmCommand: null },
    { npmCommand: 'npm install' },
    { npmCommand: [] },
    { npmCommand: ['npm', false] },
  ])('does not execute malformed npmCommand configuration in dry-run (%j)', (settings) => {
    const paths = fixture();
    const source = 'npm:operator-questions@2.9.0';
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ ...settings, packages: [source] }),
    );
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command) => {
        calls.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(calls).toEqual([]);
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain(source);
  });

  test.each([
    ['npm', 'bare'],
    ['npm', 'path'],
    ['npm', 'path with spaces'],
    ['pnpm', 'bare'],
    ['pnpm', 'path'],
    ['bun', 'bare'],
    ['bun', 'path'],
  ])('uses only fixed read-only metadata argv in dry-run (%s, %s)', (manager, form) => {
    const paths = fixture();
    const command =
      form === 'bare'
        ? manager
        : join(
            paths.homeDir,
            form === 'path' ? 'tools' : 'tools with spaces',
            `${manager}.cmd`,
          );
    if (form === 'path with spaces') {
      mkdirSync(dirname(command), { recursive: true });
      writeFileSync(command, '@echo off');
    }
    const source =
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0';
    const globalRoot =
      manager === 'bun'
        ? join(paths.homeDir, 'install', 'global', 'node_modules')
        : join(paths.homeDir, 'global', 'node_modules');
    const installedPath = join(globalRoot, 'operator-questions');
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ name: '@juicesharp/rpiv-ask-user-question' }),
    );
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ packages: [source], npmCommand: [command] }),
    );
    const calls: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (executable, args) => {
        calls.push([executable, ...args]);
        return {
          exitCode: 0,
          stdout:
            manager === 'pnpm'
              ? JSON.stringify([
                  {
                    dependencies: {
                      'operator-questions': { path: installedPath },
                    },
                  },
                ])
              : manager === 'bun'
                ? join(paths.homeDir, 'bin')
                : globalRoot,
          stderr: '',
        };
      },
    });

    expect(plan.ready).toBe(true);
    expect(plan.items).toContainEqual(
      expect.objectContaining({
        command: { command: 'pi', args: ['remove', source, '--no-approve'] },
      }),
    );
    expect(applyPiSetup(plan)).toMatchObject({ success: true, changed: [] });
    expect(calls).toEqual([
      manager === 'pnpm'
        ? [command, 'list', '-g', '--json']
        : manager === 'bun'
          ? [command, 'pm', 'bin', '-g']
          : [command, 'root', '-g'],
    ]);
  });

  test('does not fall back to another metadata command when pnpm cannot locate a package', () => {
    const paths = fixture();
    const source = 'npm:operator-questions@2.9.0';
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ packages: [source], npmCommand: ['pnpm'] }),
    );
    const calls: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command, args) => {
        calls.push([command, ...args]);
        return { exitCode: 0, stdout: '[{}]', stderr: '' };
      },
    });

    expect(calls).toEqual([['pnpm', 'list', '-g', '--json']]);
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain(source);
  });

  test.each([
    ['user', 'local'],
    ['project', 'local'],
    ['user', 'git'],
    ['project', 'git'],
    ['user', 'npm'],
    ['project', 'npm'],
    ['user', 'npm-alias'],
    ['project', 'npm-alias'],
  ] as const)('allows manifest-free prompt resources without question identity blockers (%s, %s)', (scope, layout) => {
    const paths = fixture();
    const baseDir =
      scope === 'user'
        ? join(paths.homeDir, '.pi', 'agent')
        : join(paths.cwd, '.pi');
    const source =
      layout === 'npm'
        ? 'npm:operator-prompts@1.0.0'
        : layout === 'npm-alias'
          ? 'npm:operator-prompts@npm:@vendor/prompts@1.0.0'
          : layout === 'git'
            ? 'git:https://example.test/operator/prompts.git'
            : './operator-prompts';
    const installedPath =
      layout === 'npm' || layout === 'npm-alias'
        ? join(baseDir, 'npm', 'node_modules', 'operator-prompts')
        : layout === 'git'
          ? join(baseDir, 'git', 'example.test', 'operator', 'prompts')
          : join(baseDir, 'operator-prompts');
    mkdirSync(join(installedPath, 'prompts'), { recursive: true });
    writeFileSync(
      join(installedPath, 'prompts', 'review.md'),
      'Review this code.',
    );
    const settingsPath = join(baseDir, 'settings.json');
    const settings = JSON.stringify({
      packages: [{ source, extensions: [], prompts: ['prompts/*.md'] }],
      npmCommand: ['npx', '--yes', 'npm'],
    });
    writeFileSync(settingsPath, settings);
    const calls: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command, args) => {
        calls.push([command, ...args]);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(plan.blockers).toEqual([]);
    expect(plan.ready).toBe(true);
    expect(
      plan.items.filter(({ command }) => command?.args[0] === 'remove'),
    ).toEqual([]);
    expect(applyPiSetup(plan)).toMatchObject({ success: true, changed: [] });
    expect(calls).toEqual([]);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
  });

  test.each([
    { scope: 'user', reportInstalledPath: true },
    { scope: 'project', reportInstalledPath: true },
    { scope: 'user', reportInstalledPath: false },
    { scope: 'project', reportInstalledPath: false },
  ] as const)('allows a configured local source containing an npm prefix in preview and apply ($scope, installedPath=$reportInstalledPath)', ({
    scope,
    reportInstalledPath,
  }) => {
    const paths = fixture();
    const source = './operator npm:prompts';
    const baseDir =
      scope === 'user'
        ? join(paths.homeDir, '.pi', 'agent')
        : join(paths.cwd, '.pi');
    const installedPath = join(
      baseDir,
      process.platform === 'win32'
        ? 'operator-prompts'
        : 'operator npm:prompts',
    );
    mkdirSync(join(installedPath, 'prompts'), { recursive: true });
    const promptPath = join(installedPath, 'prompts', 'review.md');
    writeFileSync(promptPath, 'Review this code.');
    const settingsPath = join(baseDir, 'settings.json');
    const settings = JSON.stringify({
      packages: [{ source, extensions: [], prompts: ['prompts/*.md'] }],
    });
    writeFileSync(settingsPath, settings);
    const externalLines = externalPackageList(paths.homeDir);
    let rootInstalled = false;
    const calls: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        calls.push([command, ...args]);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install' && args[1] === 'npm:thoth-agents@0.3.12')
          rootInstalled = true;
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              'User packages:',
              ...(rootInstalled
                ? ['  npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              ...externalLines,
              ...(scope === 'project' ? ['Project packages:'] : []),
              `  ${source} (filtered)`,
              ...(reportInstalledPath ? [`    ${installedPath}`] : []),
            ].join('\n'),
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(plan.ready).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(calls).toEqual([]);
    expect(applyPiSetup(plan)).toMatchObject({ success: true });
    expect(calls.some(([, action]) => action === 'remove')).toBe(false);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
    expect(readFileSync(promptPath, 'utf8')).toBe('Review this code.');
  });

  test.each([
    'npm:operator-prompts@npm:',
    'npm:operator-prompts@npm:@unknown-scope',
  ])('blocks an npm alias whose real target cannot be determined (%s)', (source) => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const installedPath = join(
      dirname(settingsPath),
      'npm',
      'node_modules',
      'operator-prompts',
    );
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ packages: [source] }));
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command) => {
        calls.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain(source);
    expect(plan.blockers.join('\n')).toContain('manifest identity');
    expect(calls).toEqual([]);
  });

  test.each([
    ['user', 'local'],
    ['project', 'local'],
    ['user', 'git'],
    ['project', 'git'],
  ] as const)('allows a readable nameless resource manifest despite a question-like source (%s, %s)', (scope, layout) => {
    const paths = fixture();
    const baseDir =
      scope === 'user'
        ? join(paths.homeDir, '.pi', 'agent')
        : join(paths.cwd, '.pi');
    const source =
      layout === 'git'
        ? 'git:https://example.test/operator/rpiv-ask-user-question.git'
        : './rpiv-ask-user-question';
    const installedPath =
      layout === 'git'
        ? join(
            baseDir,
            'git',
            'example.test',
            'operator',
            'rpiv-ask-user-question',
          )
        : join(baseDir, 'rpiv-ask-user-question');
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ pi: { prompts: ['./prompts'] } }),
    );
    writeFileSync(
      join(baseDir, 'settings.json'),
      JSON.stringify({ packages: [source] }),
    );
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command) => {
        calls.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(plan.blockers).toEqual([]);
    expect(plan.ready).toBe(true);
    expect(
      plan.items.filter(({ command }) => command?.args[0] === 'remove'),
    ).toEqual([]);
    expect(applyPiSetup(plan)).toMatchObject({ success: true, changed: [] });
    expect(calls).toEqual([]);
  });

  test('previews a blocker when an npm alias manifest cannot be read', () => {
    const paths = fixture();
    const source =
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0';
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const installedPath = join(
      dirname(settingsPath),
      'npm',
      'node_modules',
      'operator-questions',
    );
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(join(installedPath, 'package.json'), '{broken');
    writeFileSync(settingsPath, JSON.stringify({ packages: [source] }));
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command) => {
        calls.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain(source);
    expect(plan.blockers.join('\n')).toContain('manifest identity');
    expect(applyPiSetup(plan)).toMatchObject({ success: false, changed: [] });
    expect(calls).toEqual([]);
  });

  test.each([
    'failed',
    'unverified',
  ])('stops before replacement installation when native question removal is %s', (failure) => {
    const paths = fixture();
    const source = 'npm:@juicesharp/rpiv-ask-user-question@2.9.0';
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
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
    writeFileSync(settingsPath, JSON.stringify({ packages: [source] }));
    let rootInstalled = false;
    const mutations: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              'User packages:',
              ...(rootInstalled
                ? ['  npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              `  ${source}`,
            ].join('\n'),
            stderr: '',
          };
        if (args[0] === 'install' || args[0] === 'remove')
          mutations.push(args.join(' '));
        if (args[0] === 'install') rootInstalled = true;
        return {
          exitCode: args[0] === 'remove' && failure === 'failed' ? 1 : 0,
          stdout: '',
          stderr: failure === 'failed' ? 'native removal failed' : '',
        };
      },
    });
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'package',
      error: expect.stringContaining(
        failure === 'failed' ? 'Failed to remove' : 'did not verify removal',
      ),
      installedPackages: ['npm:thoth-agents@0.3.12'],
    });
    expect(mutations).toEqual([
      'install npm:thoth-agents@0.3.12 --no-approve',
      `remove ${source} --no-approve`,
    ]);
    expect(existsSync(plan.paths.mcpConfigPath)).toBe(false);
  });

  test.each([
    ['npm:@juicesharp/rpiv-ask-user-question@>=2.9.0', 'managed-real'],
    ['./renamed-questions', 'local'],
    [
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0',
      'managed',
    ],
    [
      'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0',
      'legacy-global',
    ],
  ])('previews native question-provider removal without mutation (%s, %s)', (source, layout) => {
    const paths = fixture();
    const agentDir = join(paths.homeDir, '.pi', 'agent');
    const globalNpmRoot = join(paths.homeDir, 'global', 'node_modules');
    const installedPath =
      layout === 'managed-real'
        ? join(
            agentDir,
            'npm',
            'node_modules',
            '@juicesharp',
            'rpiv-ask-user-question',
          )
        : layout === 'managed'
          ? join(agentDir, 'npm', 'node_modules', 'operator-questions')
          : layout === 'legacy-global'
            ? join(globalNpmRoot, 'operator-questions')
            : join(agentDir, 'renamed-questions');
    mkdirSync(installedPath, { recursive: true });
    const manifest = JSON.stringify({
      name: '@juicesharp/rpiv-ask-user-question',
      version: '2.9.0',
    });
    writeFileSync(join(installedPath, 'package.json'), manifest);
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const settings = JSON.stringify({
      packages: [{ source, extensions: [] }],
      theme: 'operator',
    });
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, settings);
    const calls: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      commandExecutor: (command, args) => {
        calls.push([command, ...args]);
        return { exitCode: 0, stdout: globalNpmRoot, stderr: '' };
      },
    });
    expect(plan.ready).toBe(true);
    expect(plan.items).toContainEqual(
      expect.objectContaining({
        command: { command: 'pi', args: ['remove', source, '--no-approve'] },
      }),
    );
    expect(applyPiSetup(plan)).toMatchObject({
      success: true,
      changed: [],
      installedPackages: [],
    });
    expect(calls).toEqual(
      layout === 'legacy-global' ? [['npm', 'root', '-g']] : [],
    );
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
    expect(readFileSync(join(installedPath, 'package.json'), 'utf8')).toBe(
      manifest,
    );
  });

  test.each([
    'npm',
    'npm-alias',
    'local',
    'unmapped',
  ])('blocks a project question-provider conflict without granting trust (%s)', (kind) => {
    const paths = fixture();
    const source =
      kind === 'npm'
        ? 'npm:@juicesharp/rpiv-ask-user-question@2.9.0'
        : kind === 'npm-alias'
          ? 'npm:operator-questions@npm:@juicesharp/rpiv-ask-user-question@2.9.0'
          : './operator-questions';
    const installedPath =
      kind === 'local'
        ? join(paths.cwd, '.pi', 'operator-questions')
        : kind === 'npm-alias'
          ? join(paths.cwd, '.pi', 'npm', 'node_modules', 'operator-questions')
          : join(
              paths.cwd,
              '.pi',
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
    if (kind !== 'unmapped')
      writeFileSync(
        join(paths.cwd, '.pi', 'settings.json'),
        JSON.stringify({ packages: [{ source }] }),
      );
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command) => {
        calls.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain('question package');
    expect(plan.blockers.join('\n')).toContain('--local --approve');
    expect(
      plan.items.some(({ command }) => command?.args[0] === 'remove'),
    ).toBe(false);
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
    });
    expect(calls).toEqual([]);
  });

  test('rechecks project question conflicts after preview and blocks before native mutation', () => {
    const paths = fixture();
    const mutations: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (args[0] === 'install' || args[0] === 'remove')
          mutations.push(args.join(' '));
        return {
          exitCode: 0,
          stdout:
            command === 'node'
              ? 'v22.19.0'
              : args[0] === '--version'
                ? '1.0.2'
                : 'No packages installed.',
          stderr: '',
        };
      },
    });
    expect(plan.ready).toBe(true);
    const settingsPath = join(paths.cwd, '.pi', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        packages: ['npm:@juicesharp/rpiv-ask-user-question@2.9.0'],
      }),
    );
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      manualRecovery: expect.stringContaining('--local --approve'),
    });
    expect(mutations).toEqual([]);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test('uses and validates an explicit local delegation runtime without npm fallback', () => {
    const paths = fixture();
    const runtimeRoot = mkdtempSync(join(tmpdir(), 'thoth-pi-runtime-'));
    roots.push(runtimeRoot);
    writeFileSync(
      join(runtimeRoot, 'package.json'),
      JSON.stringify({ name: '@thoth-agents/pi-subagents', version: '1.0.0' }),
    );

    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      runtimePackageRoot: runtimeRoot,
    });
    const packageItems = plan.items.filter(({ kind }) => kind === 'package');
    expect(plan.ready).toBe(true);
    expect(packageItems[1]).toMatchObject({
      target: runtimeRoot,
      command: {
        args: ['install', runtimeRoot, '--no-approve'],
      },
    });

    const invalidRoot = mkdtempSync(join(tmpdir(), 'thoth-pi-runtime-bad-'));
    roots.push(invalidRoot);
    writeFileSync(
      join(invalidRoot, 'package.json'),
      JSON.stringify({ name: 'pi-subagents-j0k3r', version: '1.0.0' }),
    );
    const invalidPlan = buildPiSetupPlan({
      ...paths,
      dryRun: true,
      runtimePackageRoot: invalidRoot,
    });
    expect(invalidPlan.ready).toBe(false);
    expect(invalidPlan.blockers.join('\n')).toMatch(/local.*runtime.*name/i);
    expect(
      invalidPlan.items
        .filter(({ kind }) => kind === 'package')
        .map(({ target }) => target),
    ).toContain(invalidRoot);
  });

  test.each([
    '0.99.0',
    '1.0.2',
  ])('accepts Pi %s for local setup', (piVersion) => {
    const paths = fixture();
    const runtimeRoot = mkdtempSync(join(tmpdir(), 'thoth-pi-runtime-apply-'));
    roots.push(runtimeRoot);
    writeFileSync(
      join(runtimeRoot, 'package.json'),
      JSON.stringify({ name: '@thoth-agents/pi-subagents', version: '1.0.0' }),
    );
    const allExternalLines = externalPackageList(paths.homeDir);
    const otherPackageLines = PI_PACKAGE_SPECS.flatMap((spec, index) =>
      spec.id === 'delegation'
        ? []
        : allExternalLines.slice(index * 2, index * 2 + 2),
    );
    const runtimeSource = localSource(paths.homeDir, runtimeRoot);
    const installedSources: string[] = [];
    let firstPartyInstalled = false;
    let runtimeInstalled = false;
    const plan = buildPiSetupPlan({
      ...paths,
      runtimePackageRoot: runtimeRoot,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: piVersion, stderr: '' };
        if (args[0] === 'install') {
          const source = args[1] ?? '';
          installedSources.push(source);
          if (source === 'npm:thoth-agents@0.3.12') firstPartyInstalled = true;
          if (source === runtimeRoot) runtimeInstalled = true;
          return { exitCode: 0, stdout: 'installed', stderr: '' };
        }
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              ...(firstPartyInstalled
                ? ['npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              ...(runtimeInstalled
                ? [runtimeSource, `    ${runtimeRoot}`]
                : []),
              ...otherPackageLines,
            ].join('\n'),
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    const applied = applyPiSetup(plan);
    expect(applied.success).toBe(true);
    expect(installedSources).toContain(runtimeRoot);
    expect(installedSources).not.toContain(PI_PACKAGE_SPECS[0].source);
    expect(applied.installedPackages).toContain(runtimeRoot);
  });

  test('rejects Pi hosts below the 0.99.0 minimum before changing Pi state', () => {
    const paths = fixture();
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.98.9', stderr: '' };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      error: expect.stringContaining('Pi >=0.99.0 is required'),
      changed: [],
      installedPackages: [],
      receiptCommitted: false,
    });
    expect(calls.some((call) => /pi (install|remove)/.test(call))).toBe(false);
    expect(readdirSync(paths.homeDir)).toEqual([]);
  });

  test.each([
    { taskPackages: [] },
    {
      taskPackages: [
        'npm:@juicesharp/rpiv-todo-extra@0.0.1',
        'npm:custom-task-extension@1.0.0',
      ],
    },
  ])('applies setup while preserving unrelated optional task extensions: $taskPackages', ({
    taskPackages,
  }) => {
    const paths = fixture();
    const commands: string[][] = [];
    const packages = ['npm:unrelated@1.0.0', ...taskPackages];
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const settings = {
      theme: 'dark',
      packages,
      subagents: { disableBuiltins: false, operatorSetting: 'preserve' },
    };
    for (const source of packages) {
      const name = source.slice(4).replace(/@[^@/]+$/, '');
      const installedPath = join(
        dirname(settingsPath),
        'npm',
        'node_modules',
        name,
      );
      mkdirSync(installedPath, { recursive: true });
      writeFileSync(
        join(installedPath, 'package.json'),
        JSON.stringify({ name, version: '1.0.0' }),
      );
    }
    const subagentsConfigPath = join(
      paths.homeDir,
      '.pi',
      'agent',
      'subagents.json',
    );
    const legacySubagentConfigPath = join(
      paths.homeDir,
      '.pi',
      'agent',
      'extensions',
      'subagent',
      'config.json',
    );
    mkdirSync(dirname(settingsPath), { recursive: true });
    mkdirSync(dirname(legacySubagentConfigPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings));
    writeFileSync(
      subagentsConfigPath,
      JSON.stringify({
        session_resources: 'full',
        enable_continue: true,
        operatorSetting: 'preserve',
      }),
    );
    writeFileSync(
      legacySubagentConfigPath,
      JSON.stringify({ inlineToolDisplay: 'summary' }),
    );
    let firstPartyInstalled = false;
    let listCalls = 0;
    const externalPackages = externalPackageList(paths.homeDir);
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push([command, ...args]);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list') {
          listCalls += 1;
          if (listCalls === 3) {
            const changedMcpPath = join(
              paths.homeDir,
              '.config',
              'mcp',
              'mcp.json',
            );
            mkdirSync(dirname(changedMcpPath), { recursive: true });
            writeFileSync(
              changedMcpPath,
              JSON.stringify({ imports: ['added-after-plan.json'] }),
            );
          }
          return {
            exitCode: 0,
            stdout: [
              ...(firstPartyInstalled
                ? ['npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              ...externalPackages,
              ...packages,
            ].join('\n'),
            stderr: '',
          };
        }
        if (args[0] === 'install' && args[1] === 'npm:thoth-agents@0.3.12')
          firstPartyInstalled = true;
        return { exitCode: 0, stdout: 'installed', stderr: '' };
      },
    });
    const result = applyPiSetup(plan);
    expect(result.success).toBe(true);
    expect(result.configuredPackageRoot).toBe(paths.packageRoot);
    expect(result.installedPackages).toEqual([
      'npm:thoth-agents@0.3.12',
      ...PI_PACKAGE_SPECS.map(({ source }) => source),
    ]);
    expect(existsSync(plan.paths.appendSystemPath)).toBe(false);
    expect(
      plan.items
        .filter(({ kind }) => kind === 'agent')
        .every(({ target }) => existsSync(target)),
    ).toBe(true);
    expect(JSON.parse(readFileSync(plan.paths.settingsPath, 'utf8'))).toEqual(
      settings,
    );
    expect(JSON.parse(readFileSync(subagentsConfigPath, 'utf8'))).toEqual({
      session_resources: 'lean',
      enable_continue: false,
      operatorSetting: 'preserve',
    });
    expect(readFileSync(legacySubagentConfigPath, 'utf8')).toBe(
      JSON.stringify({ inlineToolDisplay: 'summary' }),
    );
    const mcp = JSON.parse(readFileSync(plan.paths.mcpConfigPath, 'utf8'));
    expect(mcp.imports).toEqual(['added-after-plan.json']);
    expect(mcp.mcpServers.grep).toEqual({
      url: 'https://mcp.grep.app',
      protocolVersion: 'legacy',
      lifecycle: 'lazy',
    });
    expect(mcp.mcpServers.grep).not.toHaveProperty('directTools');
    const mutations = commands.filter(
      ([, action]) => action === 'install' || action === 'remove',
    );
    expect(
      mutations.some((args) =>
        args.some((arg) => /rpiv-todo|custom-task-extension/.test(arg)),
      ),
    ).toBe(false);
  });

  test.each([
    { dryRun: false, entry: 'npm:@juicesharp/rpiv-todo@2.12.0' },
    { dryRun: true, entry: 'npm:@juicesharp/rpiv-todo' },
    {
      dryRun: false,
      entry: { source: 'npm:@juicesharp/rpiv-todo@>=2.9.0', extensions: [] },
    },
    {
      dryRun: true,
      entry: { source: 'npm:@juicesharp/rpiv-todo@2.12.0', skills: [] },
    },
  ])('blocks an incumbent todo declaration without mutation (dryRun=$dryRun, $entry)', ({
    dryRun,
    entry,
  }) => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const subagentsPath = join(paths.homeDir, '.pi', 'agent', 'subagents.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = JSON.stringify({
      theme: 'operator-theme',
      packages: [entry, 'npm:operator-package@1.0.0'],
    });
    const subagents = JSON.stringify({ session_resources: 'full' });
    writeFileSync(settingsPath, settings);
    writeFileSync(subagentsPath, subagents);
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain(
      'pi remove npm:@juicesharp/rpiv-todo --no-approve',
    );
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      error: expect.stringContaining(
        'pi remove npm:@juicesharp/rpiv-todo --no-approve',
      ),
    });
    expect(commands).toEqual([]);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
    expect(readFileSync(subagentsPath, 'utf8')).toBe(subagents);
    expect(existsSync(plan.paths.mcpConfigPath)).toBe(false);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test.each(
    [false, true].flatMap((dryRun) => [
      {
        dryRun,
        source: '../operator-task-list',
        packagePath: 'operator-task-list',
      },
      {
        dryRun,
        source: 'npm:@juicesharp/rpiv-todo@2.12.0',
        packagePath: '.pi/npm/node_modules/@juicesharp/rpiv-todo',
      },
      {
        dryRun,
        source: 'npm:operator-tasks@npm:@juicesharp/rpiv-todo@2.12.0',
        packagePath: '.pi/npm/node_modules/operator-tasks',
      },
    ]),
  )('blocks a project todo incumbent without trusting project settings (dryRun=$dryRun, $source)', ({
    dryRun,
    source,
    packagePath,
  }) => {
    const paths = fixture();
    const settingsPath = join(paths.cwd, '.pi', 'settings.json');
    const installedPath = join(paths.cwd, packagePath);
    mkdirSync(installedPath, { recursive: true });
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = JSON.stringify({
      packages: [dryRun ? source : { source, extensions: [] }],
      npmCommand: ['must-not-run-project-code'],
    });
    writeFileSync(settingsPath, settings);
    const manifestPath = join(installedPath, 'package.json');
    const manifest = JSON.stringify({
      name: '@juicesharp/rpiv-todo',
      version: '2.12.0',
    });
    writeFileSync(manifestPath, manifest);
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return { exitCode: 0, stdout: 'No packages installed.', stderr: '' };
        return { exitCode: 1, stdout: '', stderr: 'unexpected mutation' };
      },
    });
    const result = applyPiSetup(plan);

    expect(plan.ready).toBe(false);
    expect(result).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      error: expect.stringContaining(
        `pi remove ${source.startsWith('npm:') ? 'npm:@juicesharp/rpiv-todo' : source} --local --approve.`,
      ),
    });
    expect(commands).toEqual([]);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
    expect(readFileSync(manifestPath, 'utf8')).toBe(manifest);
    expect(existsSync(plan.paths.piRoot)).toBe(false);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test.each([
    ['git:https://example.test/operator/tasks.git@v2.12.0', 'example.test'],
    ['https://example.test/operator/tasks.git', 'example.test'],
    ['https://github.com/operator/tasks.git/', 'github.com'],
    ['https://www.github.com/operator/tasks', 'github.com'],
    ['git:example.test/operator/tasks@feature/board', 'example.test'],
    ['ssh://git@example.test/operator/tasks.git', 'example.test'],
    ['git:git@example.test:operator/tasks.git@v2.12.0', 'example.test'],
    ['git:github.com/operator/tasks@v2.12.0', 'github.com'],
    ['git:github:operator/tasks#v2.12.0', 'github.com'],
    ['git:operator/tasks', 'github.com'],
    ['git:https://github.com/operator/tasks/tree/main', 'github.com'],
    ['git:gitlab:operator/tasks#v2.12.0', 'gitlab.com'],
    ['git:bitbucket:operator/tasks', 'bitbucket.org'],
  ])('blocks a project Git todo incumbent from its native checkout manifest (%s)', (source, host) => {
    const paths = fixture();
    const settingsPath = join(paths.cwd, '.pi', 'settings.json');
    const installedPath = join(
      paths.cwd,
      '.pi',
      'git',
      host,
      'operator',
      'tasks',
    );
    mkdirSync(installedPath, { recursive: true });
    const settings = JSON.stringify({ packages: [source] });
    writeFileSync(settingsPath, settings);
    const manifestPath = join(installedPath, 'package.json');
    const manifest = JSON.stringify({ name: '@juicesharp/rpiv-todo' });
    writeFileSync(manifestPath, manifest);
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return { exitCode: 0, stdout: 'No packages installed.', stderr: '' };
      },
    });

    expect(plan.ready).toBe(false);
    expect(plan.projectIncumbentTodos).toHaveLength(1);
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      error: expect.stringContaining(`pi remove ${source} --local --approve.`),
    });
    expect(commands).toEqual([]);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
    expect(readFileSync(manifestPath, 'utf8')).toBe(manifest);
    expect(existsSync(plan.paths.piRoot)).toBe(false);
  });

  test.each(
    [false, true].flatMap((dryRun) =>
      [
        '.pi/git/github.com/operator/tasks',
        '.pi/npm/node_modules/operator-tasks',
      ].map((packagePath) => ({ dryRun, packagePath })),
    ),
  )('blocks an unconfigured installed todo manifest read-only (dryRun=$dryRun, $packagePath)', ({
    dryRun,
    packagePath,
  }) => {
    const paths = fixture();
    const installedPath = join(paths.cwd, packagePath);
    mkdirSync(installedPath, { recursive: true });
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
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return { exitCode: 1, stdout: '', stderr: 'must not execute' };
      },
    });

    expect(plan.ready).toBe(false);
    expect(plan.projectIncumbentTodos).toHaveLength(1);
    expect(plan.blockers.join('\n')).toContain(installedPath);
    expect(plan.blockers.join('\n')).toContain(
      'pi remove npm:@juicesharp/rpiv-todo --local --approve.',
    );
    expect(plan.blockers.join('\n')).toContain(
      'pi remove <source> --local --approve.',
    );
    expect(plan.blockers.join('\n')).toContain('Review the project');
    expect(plan.blockers.join('\n')).not.toContain(
      `pi remove ${installedPath}`,
    );
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
    });
    expect(commands).toEqual([]);
    expect(readFileSync(manifestPath, 'utf8')).toBe(manifest);
    expect(existsSync(join(paths.cwd, '.pi', 'settings.json'))).toBe(false);
    expect(existsSync(plan.paths.piRoot)).toBe(false);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test.each([
    '.pi/git/unknown.test/nested/operator/tasks',
    '.pi/npm/node_modules/alias/node_modules/renamed-tasks',
  ])('rechecks an unmapped install root after preview before mutation (%s)', (packagePath) => {
    const paths = fixture();
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return {
          exitCode: 0,
          stdout: args[0] === 'list' ? 'No packages installed.' : 'v22.19.0',
          stderr: '',
        };
      },
    });
    expect(plan.ready).toBe(true);
    const installedPath = join(paths.cwd, packagePath);
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ name: '@juicesharp/rpiv-todo' }),
    );

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      manualRecovery: expect.stringContaining(
        'pi remove <source> --local --approve.',
      ),
      error: expect.stringContaining(installedPath),
    });
    expect(
      commands.some((call) => /pi (install|remove)|--approve/.test(call)),
    ).toBe(false);
    expect(existsSync(plan.paths.piRoot)).toBe(false);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test('scans linked npm package manifests without following directory cycles or executing them', () => {
    const paths = fixture();
    const installRoot = join(paths.cwd, '.pi', 'npm');
    const modulesRoot = join(installRoot, 'node_modules');
    const linkedTarget = join(paths.homeDir, 'operator-tasks');
    const installedPath = join(modulesRoot, 'linked-tasks');
    mkdirSync(modulesRoot, { recursive: true });
    mkdirSync(linkedTarget);
    const manifest = JSON.stringify({
      name: '@juicesharp/rpiv-todo',
      main: 'must-not-execute.js',
    });
    writeFileSync(join(linkedTarget, 'package.json'), manifest);
    writeFileSync(
      join(linkedTarget, 'must-not-execute.js'),
      'throw new Error("Project code executed");',
    );
    symlinkSync(installRoot, join(modulesRoot, 'cycle'), 'junction');
    symlinkSync(linkedTarget, installedPath, 'junction');
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return { exitCode: 1, stdout: '', stderr: 'must not execute' };
      },
    });
    expect(plan.projectIncumbentTodos).toHaveLength(1);
    expect(plan.blockers.join('\n')).toContain(installedPath);
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
    });
    expect(commands).toEqual([]);
    expect(readFileSync(join(linkedTarget, 'package.json'), 'utf8')).toBe(
      manifest,
    );
  });

  test('does not mistake unrelated, malformed, or dangling project installs for incumbent todos', () => {
    const paths = fixture();
    const modulesRoot = join(paths.cwd, '.pi', 'npm', 'node_modules');
    for (const [packagePath, manifest] of [
      ['.pi/git/example.test/operator/rpiv-todo', '{ malformed manifest'],
      [
        '.pi/npm/node_modules/operator-tasks',
        '{"name":"@juicesharp/rpiv-todo-extra"}',
      ],
      [
        '.pi/npm/node_modules/@vendor/renamed-tasks',
        '{"name":"@thoth-agents/pi-todo"}',
      ],
    ]) {
      const installedPath = join(paths.cwd, packagePath);
      mkdirSync(installedPath, { recursive: true });
      writeFileSync(join(installedPath, 'package.json'), manifest);
    }
    symlinkSync(
      join(paths.homeDir, 'missing-package'),
      join(modulesRoot, 'dangling-package'),
      'junction',
    );
    const plan = buildPiSetupPlan({ ...paths, dryRun: true });
    expect(plan.blockers).toEqual([]);
    expect(plan.ready).toBe(true);
    expect(plan.projectIncumbentTodos).toEqual([]);
    expect(applyPiSetup(plan)).toMatchObject({
      success: true,
      changed: [],
      installedPackages: [],
    });
  });

  test.each([
    'absolute',
    'bare',
    'file-url',
    'home-relative',
    ...(process.platform === 'win32' ? ['msys', 'wsl'] : []),
  ])('resolves a project %s local todo source without executing it', (kind) => {
    const paths = fixture();
    const installedPath =
      kind === 'bare'
        ? join(paths.cwd, '.pi', 'operator-package')
        : join(paths.homeDir, 'operator-package');
    mkdirSync(installedPath, { recursive: true });
    writeFileSync(
      join(installedPath, 'package.json'),
      JSON.stringify({ name: '@juicesharp/rpiv-todo' }),
    );
    const shellPath = installedPath
      .replace(
        /^([a-z]):[\\/]/i,
        (_, drive: string) => `/${drive.toLowerCase()}/`,
      )
      .replaceAll('\\', '/');
    const source =
      kind === 'bare'
        ? 'operator-package'
        : kind === 'file-url'
          ? pathToFileURL(installedPath).href
          : kind === 'home-relative'
            ? '~/operator-package'
            : kind === 'msys'
              ? shellPath
              : kind === 'wsl'
                ? `/mnt${shellPath}`
                : installedPath;
    const settingsPath = join(paths.cwd, '.pi', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ packages: [source] }));
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return { exitCode: 0, stdout: 'No packages installed.', stderr: '' };
      },
    });

    expect(plan.ready).toBe(false);
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
    });
    expect(plan.blockers.join('\n')).toContain(
      `pi remove ${source} --local --approve.`,
    );
    expect(commands).toEqual([]);
  });

  test.each([
    { source: '../operator-tasks', packagePath: 'operator-tasks' },
    {
      source: 'git:https://example.test/operator/tasks.git',
      packagePath: '.pi/git/example.test/operator/tasks',
    },
  ])('rechecks a project package manifest after preview before mutation ($source)', ({
    source,
    packagePath,
  }) => {
    const paths = fixture();
    const installedPath = join(paths.cwd, packagePath);
    mkdirSync(installedPath, { recursive: true });
    const manifestPath = join(installedPath, 'package.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({ name: 'operator-task-tools' }),
    );
    const settingsPath = join(paths.cwd, '.pi', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ packages: [source] }));
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return {
          exitCode: 0,
          stdout: args[0] === 'list' ? 'No packages installed.' : 'v22.19.0',
          stderr: '',
        };
      },
    });
    expect(plan.ready).toBe(true);
    writeFileSync(
      manifestPath,
      JSON.stringify({ name: '@juicesharp/rpiv-todo' }),
    );

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      manualRecovery: expect.stringContaining(
        `pi remove ${source} --local --approve.`,
      ),
    });
    expect(
      commands.some((call) => /pi (install|remove)|--approve/.test(call)),
    ).toBe(false);
    expect(existsSync(plan.paths.piRoot)).toBe(false);
  });

  test('fails closed if project settings become malformed after preview', () => {
    const paths = fixture();
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return {
          exitCode: 0,
          stdout: args[0] === 'list' ? 'No packages installed.' : 'v22.19.0',
          stderr: '',
        };
      },
    });
    expect(plan.ready).toBe(true);
    const settingsPath = join(paths.cwd, '.pi', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, '{ invalid JSON');
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
    });
    expect(
      commands.some((call) => /pi (install|remove)|--approve/.test(call)),
    ).toBe(false);
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ invalid JSON');
  });

  test.each([
    'settings',
    'list',
  ])('reports both incumbent removal instructions before mutation (%s)', (surface) => {
    const paths = fixture();
    const sources = [
      'npm:pi-subagents@0.72.0',
      'npm:@juicesharp/rpiv-todo@2.12.0',
    ];
    if (surface === 'settings') {
      const path = join(paths.homeDir, '.pi', 'agent', 'settings.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ packages: sources }));
    }
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: surface === 'settings',
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        return { exitCode: 0, stdout: sources.join('\n'), stderr: '' };
      },
    });
    const result = applyPiSetup(plan);

    expect(result).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
    });
    expect(result.error).toContain(
      'pi remove npm:@juicesharp/rpiv-todo --no-approve',
    );
    expect([result.error, result.manualRecovery].join('\n')).toContain(
      'pi remove npm:pi-subagents@0.72.0 --no-approve',
    );
    expect(commands.some((call) => /pi (install|remove)/.test(call))).toBe(
      false,
    );
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test('blocks the incumbent package before mutation and preserves object-form settings', () => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const subagentsConfigPath = join(
      paths.homeDir,
      '.pi',
      'agent',
      'subagents.json',
    );
    const legacyConfigPath = join(
      paths.homeDir,
      '.pi',
      'agent',
      'extensions',
      'subagent',
      'config.json',
    );
    mkdirSync(dirname(settingsPath), { recursive: true });
    mkdirSync(dirname(legacyConfigPath), { recursive: true });
    const settings = {
      theme: 'dark',
      packages: [
        {
          source: 'npm:pi-subagents@0.72.0',
          extensions: ['extensions/index.js'],
          skills: [],
        },
        'npm:operator-package@1.0.0',
      ],
    };
    const subagentsConfig = { operatorSetting: 'preserve' };
    const legacyConfig = { inlineToolDisplay: 'summary' };
    writeFileSync(settingsPath, JSON.stringify(settings));
    writeFileSync(subagentsConfigPath, JSON.stringify(subagentsConfig));
    writeFileSync(legacyConfigPath, JSON.stringify(legacyConfig));
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toContain('npm:pi-subagents@0.72.0');
    expect(plan.blockers.join('\n')).toContain(
      'pi remove npm:pi-subagents@0.72.0 --no-approve',
    );
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
    });
    expect(commands).toEqual([]);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual(settings);
    expect(JSON.parse(readFileSync(subagentsConfigPath, 'utf8'))).toEqual(
      subagentsConfig,
    );
    expect(JSON.parse(readFileSync(legacyConfigPath, 'utf8'))).toEqual(
      legacyConfig,
    );
  });

  test.each([
    { scope: 'User', source: 'npm:@juicesharp/rpiv-todo@2.12.0' },
    {
      scope: 'User',
      source: '../operator-task-list',
      packageName: '@juicesharp/rpiv-todo',
    },
    {
      scope: 'User',
      source: 'git+https://example.test/operator/tasks.git',
      packageName: '@juicesharp/rpiv-todo',
    },
    {
      scope: 'User',
      source: 'git+https://example.test/operator/rpiv-todo.git',
    },
  ])('blocks an incumbent todo from pi list before mutation ($scope, $source)', ({
    scope,
    source,
    packageName,
    removalCommand = 'pi remove npm:@juicesharp/rpiv-todo --no-approve',
    sourceRemovalCommand = `pi remove ${source} --no-approve`,
  }) => {
    const paths = fixture();
    const installedPath = join(paths.homeDir, 'incumbent');
    mkdirSync(installedPath);
    if (packageName)
      writeFileSync(
        join(installedPath, 'package.json'),
        JSON.stringify({ name: packageName, version: '2.12.0' }),
      );
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: `${scope} packages:\n  ${source}\n    ${installedPath}`,
            stderr: '',
          };
        return { exitCode: 0, stdout: 'unexpected mutation', stderr: '' };
      },
    });
    const result = applyPiSetup(plan);

    expect(result).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      error: expect.stringContaining(`${removalCommand}.`),
      manualRecovery: expect.stringContaining(`${removalCommand}.`),
    });
    if (!source.startsWith('npm:'))
      expect(result.manualRecovery).toContain(`${sourceRemovalCommand}.`);
    expect(commands.some((call) => /pi (install|remove)/.test(call))).toBe(
      false,
    );
    expect(existsSync(plan.paths.piRoot)).toBe(false);
    expect(existsSync(plan.paths.mcpConfigPath)).toBe(false);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test.each([
    false,
    true,
  ])('reports both todo scopes before mutation (settings=%s)', (settings) => {
    const paths = fixture();
    const source = 'npm:@juicesharp/rpiv-todo@2.12.0';
    if (settings) {
      for (const path of [
        join(paths.homeDir, '.pi', 'agent', 'settings.json'),
        join(paths.cwd, '.pi', 'settings.json'),
      ]) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify({ packages: [source] }));
      }
    }
    const commands: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      dryRun: settings,
      commandExecutor: (command, args) => {
        commands.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        return {
          exitCode: 0,
          stdout: `User packages:\n  ${source}`,
          stderr: '',
        };
      },
    });
    if (!settings) {
      // Settings changed after preview; apply must inspect them again, without trust.
      const path = join(paths.cwd, '.pi', 'settings.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ packages: [source] }));
    }
    const result = applyPiSetup(plan);

    expect(result).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
    });
    for (const command of [
      'pi remove npm:@juicesharp/rpiv-todo --no-approve.',
      'pi remove npm:@juicesharp/rpiv-todo --local --approve.',
    ]) {
      expect(result.error).toContain(command);
      if (!settings) expect(result.manualRecovery).toContain(command);
    }
    expect(commands.some((call) => /pi (install|remove)/.test(call))).toBe(
      false,
    );
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test('blocks manifest-identified and ambiguous local or Git incumbents before first-party installation', () => {
    const cases = [
      {
        source: '../operator-runtime',
        packageName: 'pi-subagents',
      },
      {
        source: 'git+https://example.test/operator/delegation.git',
        packageName: 'pi-subagents-j0k3r',
      },
      {
        source: 'git+https://example.test/operator/pi-subagents.git',
        packageName: undefined,
      },
      {
        source: 'npm:pi-subagents-j0k3r@1.6.1',
        packageName: undefined,
      },
    ];

    for (const [index, candidate] of cases.entries()) {
      const paths = fixture();
      const installedPath = mkdtempSync(
        join(tmpdir(), `thoth-pi-incumbent-${index}-`),
      );
      roots.push(installedPath);
      if (candidate.packageName)
        writeFileSync(
          join(installedPath, 'package.json'),
          JSON.stringify({ name: candidate.packageName, version: '1.0.0' }),
        );
      const calls: string[] = [];
      const commandExecutor = (command: string, args: readonly string[]) => {
        calls.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: `User packages:\n  ${candidate.source}\n    ${installedPath}`,
            stderr: '',
          };
        return { exitCode: 0, stdout: 'unexpected', stderr: '' };
      };
      const plan = buildPiSetupPlan({ ...paths, commandExecutor });

      expect(plan.ready).toBe(true);
      expect(applyPiSetup(plan)).toMatchObject({
        success: false,
        failedStep: 'preflight',
        installedPackages: [],
        manualRecovery: expect.stringContaining('pi remove'),
      });
      expect(calls.some((call) => call.includes('pi install'))).toBe(false);
    }
  });

  test('restores a satisfying newer local source if native range installation would downgrade it', () => {
    const paths = fixture();
    const packageLines = externalPackageList(
      paths.homeDir,
      { delegation: '9.0.0' },
      { delegation: 'npm:@thoth-agents/pi-subagents@9.0.0' },
    );
    const delegationPath = packageLines[1]?.trim() ?? '';
    const priorSource = localSource(paths.homeDir, delegationPath);
    packageLines[0] = `  ${priorSource}`;
    let firstPartyInstalled = false;
    const installCalls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install') {
          installCalls.push(args[1] ?? '');
          if (args[1] === 'npm:thoth-agents@0.3.12') firstPartyInstalled = true;
          if (args[1] === PI_PACKAGE_SPECS[0].source) {
            packageLines[0] = `  ${PI_PACKAGE_SPECS[0].source}`;
            writeFileSync(
              join(delegationPath, 'package.json'),
              JSON.stringify({
                name: '@thoth-agents/pi-subagents',
                version: '0.1.0',
              }),
            );
          }
          if (args[1] === priorSource) {
            packageLines[0] = `  ${priorSource}`;
            writeFileSync(
              join(delegationPath, 'package.json'),
              JSON.stringify({
                name: '@thoth-agents/pi-subagents',
                version: '9.0.0',
              }),
            );
          }
          return { exitCode: 0, stdout: 'installed', stderr: '' };
        }
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              ...(firstPartyInstalled
                ? ['npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              ...packageLines,
            ].join('\n'),
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      error: expect.stringContaining('exact-version recovery verified'),
      manualRecovery: `Manual recovery: run pi install ${priorSource} --no-approve, then verify with pi list and the installed package manifest.`,
    });
    expect(installCalls).toContain(priorSource);
  });

  test('rejects installed package evidence with the expected name at the wrong version', () => {
    const paths = fixture();
    const externalLines = externalPackageList(
      paths.homeDir,
      { delegation: '0.0.1' },
      { delegation: 'npm:@thoth-agents/pi-subagents@0.0.1' },
    );
    let firstPartyInstalled = false;
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              ...(firstPartyInstalled
                ? ['npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              ...externalLines,
            ].join('\n'),
            stderr: '',
          };
        if (args[0] === 'install' && args[1] === 'npm:thoth-agents@0.3.12')
          firstPartyInstalled = true;
        return { exitCode: 0, stdout: 'installed', stderr: '' };
      },
    });

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'package',
      installedPackages: ['npm:thoth-agents@0.3.12'],
      error: expect.stringContaining(PI_PACKAGE_SPECS[0].source),
    });
    expect(existsSync(plan.paths.appendSystemPath)).toBe(false);
  });

  test.each([
    {
      id: 'web-access' as const,
      failedSource: 'npm:pi-web-access@>=0.27.0',
      installedPackages: [
        'npm:thoth-agents@0.3.12',
        'npm:@thoth-agents/pi-subagents@>=0.3.0',
        'npm:@upstash/context7-pi@>=0.1.2',
      ],
    },
    {
      id: 'ask-user-question' as const,
      failedSource: 'npm:@thoth-agents/pi-questions-user@>=0.3.0',
      installedPackages: [
        'npm:thoth-agents@0.3.12',
        'npm:@thoth-agents/pi-subagents@>=0.3.0',
        'npm:@upstash/context7-pi@>=0.1.2',
        'npm:pi-web-access@>=0.27.0',
        'npm:pi-mcp-adapter@>=2.32.1',
      ],
    },
    {
      id: 'todo' as const,
      failedSource: 'npm:@thoth-agents/pi-todo@>=0.3.0',
      installedPackages: [
        'npm:thoth-agents@0.3.12',
        'npm:@thoth-agents/pi-subagents@>=0.3.0',
        'npm:@upstash/context7-pi@>=0.1.2',
        'npm:pi-web-access@>=0.27.0',
        'npm:pi-mcp-adapter@>=2.32.1',
        'npm:@thoth-agents/pi-questions-user@>=0.3.0',
      ],
    },
  ])('stops before managed resources when $id cannot be individually verified', ({
    id,
    failedSource,
    installedPackages,
  }) => {
    const paths = fixture();
    let firstPartyInstalled = false;
    const externalPackages = externalPackageList(paths.homeDir, {
      [id]: '0.0.1',
    });
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: [
              ...(firstPartyInstalled
                ? ['npm:thoth-agents@0.3.12', `    ${paths.packageRoot}`]
                : []),
              ...externalPackages,
            ].join('\n'),
            stderr: '',
          };
        if (args[0] === 'install' && args[1] === 'npm:thoth-agents@0.3.12')
          firstPartyInstalled = true;
        return { exitCode: 0, stdout: 'installed', stderr: '' };
      },
    });

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'package',
      error: expect.stringContaining(failedSource),
      installedPackages,
    });
    expect(existsSync(plan.paths.mcpConfigPath)).toBe(false);
    expect(
      plan.items
        .filter(({ kind }) => kind === 'agent')
        .every(({ target }) => !existsSync(target)),
    ).toBe(true);
  });

  test.each([
    'plain',
    'scoped',
    'mismatched-inventory',
  ])('rejects malformed list output that only embeds the pinned source before mutation (%s)', (layout) => {
    const paths = fixture();
    const malformedSource = `malformed ${PI_PACKAGE_SPECS[0].source} evidence`;
    const installedPath = join(paths.homeDir, 'reported-package');
    if (layout === 'mismatched-inventory') {
      const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(
        settingsPath,
        JSON.stringify({ packages: ['./operator-prompts'] }),
      );
      mkdirSync(installedPath);
    }
    const mutations: string[][] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (args[0] === 'install' || args[0] === 'remove')
          mutations.push([...args]);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout:
              layout === 'plain'
                ? malformedSource
                : [
                    'User packages:',
                    `  ${malformedSource}`,
                    ...(layout === 'mismatched-inventory'
                      ? [`    ${installedPath}`]
                      : []),
                  ].join('\n'),
            stderr: '',
          };
        return { exitCode: 0, stdout: 'installed', stderr: '' };
      },
    });

    expect(plan.ready).toBe(true);
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      changed: [],
      installedPackages: [],
      error: expect.stringContaining('manifest identity'),
    });
    expect(mutations).toEqual([]);
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });

  test('merges j0k3r global delegation settings without overwriting unrelated settings', () => {
    expect(
      mergePiSubagentsConfig({
        session_resources: 'full',
        enable_continue: true,
        execution_mode: 'background',
        operatorSetting: 'preserve',
      }),
    ).toEqual({
      session_resources: 'lean',
      enable_continue: false,
      execution_mode: 'background',
      operatorSetting: 'preserve',
    });
  });

  test('blocks a legacy delegation declaration during dry-run without deleting user settings', () => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = {
      theme: 'dark',
      packages: [{ source: 'npm:pi-subagents@0.72.0', skills: [] }],
    };
    writeFileSync(settingsPath, JSON.stringify(settings));
    const plan = buildPiSetupPlan({ ...paths, dryRun: true });
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toEqual([
      expect.stringContaining('pi-subagents@0.72.0'),
    ]);
    expect(applyPiSetup(plan).success).toBe(false);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual(settings);
  });

  test('reports manual recovery instead of loading the legacy delegation runtime beside the new runtime', () => {
    const paths = fixture();
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: 'User packages:\n  npm:pi-subagents@0.72.0',
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      error: expect.stringContaining('pi-subagents@0.72.0'),
      manualRecovery: expect.stringContaining('pi remove'),
    });
    expect(calls.some((call) => call.includes('pi install'))).toBe(false);
  });

  test('rejects symlinked managed settings before package mutation', () => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const external = join(paths.homeDir, 'external-settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(external, JSON.stringify({ theme: 'untouched' }));
    symlinkSync(external, settingsPath, 'file');
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toMatch(/symlink/i);
    expect(applyPiSetup(plan).success).toBe(false);
    expect(calls).toEqual([]);
    expect(JSON.parse(readFileSync(external, 'utf8'))).toEqual({
      theme: 'untouched',
    });
  });

  test('rejects a symlinked managed parent before package mutation', () => {
    const paths = fixture();
    const piRoot = join(paths.homeDir, '.pi', 'agent');
    const external = join(paths.homeDir, 'external-agent-root');
    mkdirSync(join(paths.homeDir, '.pi'), { recursive: true });
    mkdirSync(external);
    symlinkSync(external, piRoot, 'junction');
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toMatch(/symlink/i);
    expect(applyPiSetup(plan).success).toBe(false);
    expect(calls).toEqual([]);
  });

  test('rejects dangling symlink targets without creating their referents', () => {
    const paths = fixture();
    const target = join(paths.homeDir, 'managed.json');
    const missing = join(paths.homeDir, 'missing.json');
    symlinkSync(missing, target, 'file');
    expect(() => writePiManagedText(target, 'unsafe')).toThrow(/symlink/i);
    expect(existsSync(missing)).toBe(false);
  });

  test('uses exclusive unique sidecars and preserves unrelated fixed sidecars', () => {
    const paths = fixture();
    const target = join(paths.homeDir, 'managed.json');
    writeFileSync(target, 'before');
    writeFileSync(`${target}.tmp`, 'unrelated temp');
    writeFileSync(`${target}.bak`, 'unrelated backup');
    expect(writePiManagedText(target, 'after')).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('after');
    expect(readFileSync(`${target}.tmp`, 'utf8')).toBe('unrelated temp');
    expect(readFileSync(`${target}.bak`, 'utf8')).toBe('unrelated backup');
    expect(
      readdirSync(dirname(target)).some((name) =>
        name.startsWith('managed.json.bak-'),
      ),
    ).toBe(true);
  });

  test('fails before package mutation on an unowned grep conflict and preserves unrelated config', () => {
    const paths = fixture();
    const mcpPath = join(paths.homeDir, '.config', 'mcp', 'mcp.json');
    mkdirSync(join(paths.homeDir, '.config', 'mcp'), { recursive: true });
    writeFileSync(
      mcpPath,
      JSON.stringify({
        theme: 'dark',
        mcpServers: {
          other: { url: 'https://example.test' },
          grep: { url: 'https://wrong.test' },
        },
      }),
    );
    let calls = 0;
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: () => {
        calls += 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(plan.ready).toBe(false);
    expect(applyPiSetup(plan).success).toBe(false);
    expect(calls).toBe(0);
    expect(JSON.parse(readFileSync(mcpPath, 'utf8')).theme).toBe('dark');
  });

  test('inspects canonical names only inside agent frontmatter', () => {
    const paths = fixture();
    const agentsRoot = join(paths.homeDir, '.pi', 'agent', 'agents');
    mkdirSync(agentsRoot, { recursive: true });
    writeFileSync(
      join(agentsRoot, 'notes.md'),
      '---\ndescription: "notes"\n---\nExample:\nname: explorer\n',
    );
    expect(buildPiSetupPlan(paths).ready).toBe(true);
  });

  test('allows an unowned generic agent identity to coexist', () => {
    const paths = fixture();
    const agentsRoot = join(paths.homeDir, '.pi', 'agent', 'agents');
    mkdirSync(agentsRoot, { recursive: true });
    writeFileSync(
      join(agentsRoot, 'explorer.md'),
      '---\nname: explorer\n---\nmanaged-by: thoth-agents\n',
    );
    const plan = buildPiSetupPlan(paths);
    expect(plan.ready).toBe(true);
    expect(plan.blockers).toEqual([]);
  });

  test('rejects an unowned namespaced specialist identity', () => {
    const paths = fixture();
    const agentsRoot = join(paths.homeDir, '.pi', 'agent', 'agents');
    mkdirSync(agentsRoot, { recursive: true });
    writeFileSync(
      join(agentsRoot, 'thoth-worker.md'),
      '---\nname: thoth-worker\ndescription: "user-owned definition"\n---\n',
    );
    const plan = buildPiSetupPlan(paths);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toEqual([
      expect.stringContaining(
        'defines canonical specialist thoth-worker without thoth-agents ownership',
      ),
    ]);
  });

  test('preserves unrelated MCP fields for the exact managed merge', () => {
    expect(
      mergePiGrepMcpConfig({
        imports: ['shared.json'],
        mcpServers: { other: { command: 'x' } },
      }),
    ).toEqual({
      imports: ['shared.json'],
      mcpServers: {
        other: { command: 'x' },
        grep: {
          url: 'https://mcp.grep.app',
          protocolVersion: 'legacy',
          lifecycle: 'lazy',
        },
      },
    });
  });

  test('compensates a failed first-party verification before any external mutation', () => {
    const paths = fixture();
    const calls: string[] = [];
    let installed = false;
    const plan = buildPiSetupPlan({
      ...paths,
      verifyFirstParty: () => ({
        success: false as const,
        error: 'observer unavailable',
      }),
      commandExecutor: (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install') {
          installed = true;
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'remove') {
          installed = false;
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: installed
              ? `npm:thoth-agents@0.3.12\n    ${paths.packageRoot}`
              : '',
            stderr: '',
          };
        return { exitCode: 1, stdout: '', stderr: 'unexpected' };
      },
    });
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      receiptCommitted: false,
    });
    expect(calls).toContain('pi remove npm:thoth-agents@0.3.12 --no-approve');
    expect(calls.some((call) => call.includes('npm:pi-subagents-j0k3r@'))).toBe(
      false,
    );
  });

  test('restores and verifies the exact prior receipt-owned source after replacement failure', () => {
    const paths = fixture();
    const priorInstallSource = join(paths.homeDir, 'prior', 'package');
    mkdirSync(priorInstallSource, { recursive: true });
    writeFileSync(
      join(priorInstallSource, 'package.json'),
      '{"name":"thoth-agents","version":"0.3.11"}',
    );
    const previous = {
      schemaVersion: 1 as const,
      owner: 'thoth-agents' as const,
      scope: 'user' as const,
      packageName: 'thoth-agents' as const,
      source: localSource(paths.cwd, priorInstallSource),
      installSource: priorInstallSource,
      version: '0.3.11',
      manifestSha256: 'c'.repeat(64),
      extensionSha256: 'd'.repeat(64),
    };
    expect(writePiPackageReceipt(previous, paths.receiptOptions).success).toBe(
      true,
    );
    let configured = `User packages:\n  ${previous.source}\n    ${previous.installSource}`;
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      verifyFirstParty: () => ({ success: false, error: 'digest mismatch' }),
      commandExecutor: (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install')
          configured =
            args[1] === previous.installSource
              ? `User packages:\n  ${previous.source}\n    ${previous.installSource}`
              : (args[1] ?? configured);
        if (args[0] === 'list')
          return { exitCode: 0, stdout: configured, stderr: '' };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      receiptCommitted: false,
    });
    expect(calls).toContain(
      `pi install ${previous.installSource} --no-approve`,
    );
    expect(readPiPackageReceipt(paths.receiptOptions)).toMatchObject({
      status: 'valid',
      receipt: previous,
    });
  });

  test('returns the original and rollback errors with exact manual recovery', () => {
    const paths = fixture();
    let installed = false;
    const plan = buildPiSetupPlan({
      ...paths,
      verifyFirstParty: () => ({ success: false, error: 'observer failed' }),
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '1.0.2', stderr: '' };
        if (args[0] === 'install') {
          installed = true;
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'remove')
          return { exitCode: 1, stdout: '', stderr: 'remove denied' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: installed
              ? `npm:thoth-agents@0.3.12\n    ${paths.packageRoot}`
              : '',
            stderr: '',
          };
        return { exitCode: 1, stdout: '', stderr: 'unexpected' };
      },
    });

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      rollbackFailed: true,
      error: expect.stringMatching(
        /observer failed.*rollback failed.*remove denied/,
      ),
      manualRecovery: 'pi remove npm:thoth-agents@0.3.12 --no-approve',
    });
    expect(readPiPackageReceipt(paths.receiptOptions).status).toBe('missing');
  });
});

test('installer requires the first pi-subagents release owning tools configuration', () => {
  expect(
    PI_PACKAGE_SPECS.find((spec) => spec.id === 'delegation'),
  ).toMatchObject({
    source: 'npm:@thoth-agents/pi-subagents@>=0.3.0',
    version: '0.3.0',
  });
});

test('installer requires the pi-todo release using work-panel contract v2', () => {
  expect(PI_PACKAGE_SPECS.find((spec) => spec.id === 'todo')).toMatchObject({
    source: 'npm:@thoth-agents/pi-todo@>=0.3.0',
    packageName: '@thoth-agents/pi-todo',
    version: '0.3.0',
  });
});

test.each([
  ['0.2.9', 'drift'],
  ['0.3.0-beta.1', 'drift'],
  ['0.3.0', 'installed'],
  ['0.4.0', 'installed'],
])('installer verifies pi-todo version %s as %s', (version, state) => {
  const spec = PI_PACKAGE_SPECS.find((spec) => spec.id === 'todo');
  if (!spec) throw new Error('Missing pi-todo installer specification');
  const { candidate } = externalPackageFixture(spec.packageName, version);
  candidate.source = spec.source;
  expect(inspectPiExternalPackage([candidate], spec)).toMatchObject({
    state,
    version,
  });
});
