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

describe('Pi setup', () => {
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
      source: 'npm:@thoth-agents/pi-subagents@>=1.0.0',
      packageName: '@thoth-agents/pi-subagents',
      version: '1.0.0',
    };
    const local = externalPackageFixture(spec.packageName, spec.version);
    local.candidate.source = local.installedPath;

    expect(
      inspectPiExternalPackage([local.candidate], spec, false),
    ).toMatchObject({
      state: 'installed',
      source: local.installedPath,
      installedPath: local.installedPath,
      version: '1.0.0',
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
      'npm:@thoth-agents/pi-subagents@>=1.0.0',
      'npm:@upstash/context7-pi@>=0.1.2',
      'npm:pi-web-access@>=0.27.0',
      'npm:pi-mcp-adapter@>=2.32.1',
      'npm:@juicesharp/rpiv-ask-user-question@>=2.9.0',
      'npm:@thoth-agents/pi-todo@>=0.1.0',
    ]);
    expect(PI_MINIMUM_VERSION).toBe('0.99.0');
    expect(plan.items[0]?.description).toContain('Pi >=0.99.0');
    expect(PI_PACKAGE_SPECS).toHaveLength(6);
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
    expect(existsSync(plan.paths.piRoot)).toBe(false);
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
              ...PI_PACKAGE_SPECS.map(
                ({ packageName }) => `npm:${packageName}@0.0.1`,
              ),
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
        'npm:@thoth-agents/pi-subagents@>=1.0.0',
        'npm:@upstash/context7-pi@>=0.1.2',
      ],
    },
    {
      id: 'todo' as const,
      failedSource: 'npm:@thoth-agents/pi-todo@>=0.1.0',
      installedPackages: [
        'npm:thoth-agents@0.3.12',
        'npm:@thoth-agents/pi-subagents@>=1.0.0',
        'npm:@upstash/context7-pi@>=0.1.2',
        'npm:pi-web-access@>=0.27.0',
        'npm:pi-mcp-adapter@>=2.32.1',
        'npm:@juicesharp/rpiv-ask-user-question@>=2.9.0',
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

  test('rejects malformed list output that only embeds the pinned source', () => {
    const paths = fixture();
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
            stdout: `malformed ${PI_PACKAGE_SPECS[0].source} evidence`,
            stderr: '',
          };
        return { exitCode: 0, stdout: 'installed', stderr: '' };
      },
    });

    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'package',
      installedPackages: ['npm:thoth-agents@0.3.12'],
    });
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
