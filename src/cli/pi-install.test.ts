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
import { afterEach, describe, expect, test } from 'vitest';
import { inspectPiExternalPackage } from './pi-external-package';
import {
  applyPiSetup,
  buildPiSetupPlan,
  mergePiGrepMcpConfig,
  mergePiSubagentConfig,
  mergePiUserSettings,
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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
      'npm:pi-subagents@>=0.71.0',
      'npm:@upstash/context7-pi@>=0.1.2',
      'npm:pi-web-access@>=0.27.0',
      'npm:pi-mcp-adapter@>=2.32.1',
      'npm:@juicesharp/rpiv-ask-user-question@>=2.9.0',
      'npm:@juicesharp/rpiv-todo@>=2.9.0',
    ]);
    expect(PI_MINIMUM_VERSION).toBe('0.86.1');
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
      'settings',
      'mcp',
      'agent',
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

  test('rejects Pi hosts below the upstream 0.86.1 minimum before installation', () => {
    const paths = fixture();
    const calls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.86.0', stderr: '' };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      error: expect.stringContaining('Pi >=0.86.1 is required'),
      installedPackages: [],
    });
    expect(calls.some((call) => call.includes('pi install'))).toBe(false);
  });

  test('applies packages, one root, six specialists, and exact proxy-only grep configuration', () => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    const subagentConfigPath = join(
      paths.homeDir,
      '.pi',
      'agent',
      'extensions',
      'subagent',
      'config.json',
    );
    mkdirSync(dirname(settingsPath), { recursive: true });
    mkdirSync(dirname(subagentConfigPath), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ theme: 'dark', packages: ['npm:unrelated@1.0.0'] }),
    );
    writeFileSync(
      subagentConfigPath,
      JSON.stringify({ inlineToolDisplay: 'summary' }),
    );
    let firstPartyInstalled = false;
    let listCalls = 0;
    const externalPackages = externalPackageList(paths.homeDir);
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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
    const settings = JSON.parse(readFileSync(plan.paths.settingsPath, 'utf8'));
    const subagentConfig = JSON.parse(
      readFileSync(plan.paths.subagentConfigPath, 'utf8'),
    );
    expect(settings).toMatchObject({
      theme: 'dark',
      packages: ['npm:unrelated@1.0.0'],
      subagents: { disableBuiltins: true },
    });
    expect(subagentConfig).toMatchObject({
      inlineToolDisplay: 'summary',
      defaultSubagentContext: 'fresh',
      maxSubagentDepth: 1,
    });
    const mcp = JSON.parse(readFileSync(plan.paths.mcpConfigPath, 'utf8'));
    expect(mcp.imports).toEqual(['added-after-plan.json']);
    expect(mcp.mcpServers.grep).toEqual({
      url: 'https://mcp.grep.app',
      protocolVersion: 'legacy',
      lifecycle: 'lazy',
    });
    expect(mcp.mcpServers.grep).not.toHaveProperty('directTools');
  });

  test('migrates a legacy exact source through Pi while preserving object filters and unrelated settings', () => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
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
    writeFileSync(settingsPath, JSON.stringify(settings));
    const packageLines = externalPackageList(
      paths.homeDir,
      { delegation: '0.72.0' },
      { delegation: 'npm:pi-subagents@0.72.0' },
    );
    let firstPartyInstalled = false;
    const installCalls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
        if (args[0] === 'install') {
          installCalls.push(args[1] ?? '');
          if (args[1] === 'npm:thoth-agents@0.3.12') firstPartyInstalled = true;
          if (args[1] === PI_PACKAGE_SPECS[0].source) {
            packageLines[0] = `  ${PI_PACKAGE_SPECS[0].source} (filtered)`;
            const current = JSON.parse(readFileSync(settingsPath, 'utf8'));
            current.packages[0].source = PI_PACKAGE_SPECS[0].source;
            writeFileSync(settingsPath, JSON.stringify(current));
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

    expect(applyPiSetup(plan).success).toBe(true);
    expect(installCalls).toEqual([
      'npm:thoth-agents@0.3.12',
      PI_PACKAGE_SPECS[0].source,
    ]);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toMatchObject({
      theme: 'dark',
      packages: [
        {
          source: PI_PACKAGE_SPECS[0].source,
          extensions: ['extensions/index.js'],
          skills: [],
        },
        'npm:operator-package@1.0.0',
      ],
      subagents: { disableBuiltins: true },
    });
  });

  test('restores a satisfying newer package if native range installation would downgrade it', () => {
    const paths = fixture();
    const packageLines = externalPackageList(
      paths.homeDir,
      { delegation: '9.0.0' },
      { delegation: 'npm:pi-subagents@9.0.0' },
    );
    const delegationPath = packageLines[1]?.trim() ?? '';
    let firstPartyInstalled = false;
    const installCalls: string[] = [];
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
        if (args[0] === 'install') {
          installCalls.push(args[1] ?? '');
          if (args[1] === 'npm:thoth-agents@0.3.12') firstPartyInstalled = true;
          if (args[1] === PI_PACKAGE_SPECS[0].source) {
            packageLines[0] = `  ${PI_PACKAGE_SPECS[0].source}`;
            writeFileSync(
              join(delegationPath, 'package.json'),
              JSON.stringify({ name: 'pi-subagents', version: '0.1.0' }),
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
      error: expect.stringContaining(
        'exact-version recovery failed or unverifiable',
      ),
      manualRecovery:
        'Manual recovery: run pi install npm:pi-subagents@9.0.0 --no-approve, then verify with pi list and the installed package manifest.',
    });
    expect(installCalls).toContain('npm:pi-subagents@9.0.0');
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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

  test('stops before managed resources when web access cannot be verified', () => {
    const paths = fixture();
    let firstPartyInstalled = false;
    const failedSource = 'npm:pi-web-access@>=0.27.0';
    const externalPackages = externalPackageList(paths.homeDir, {
      'web-access': '0.0.1',
    });
    const plan = buildPiSetupPlan({
      ...paths,
      commandExecutor: (command, args) => {
        if (command === 'node')
          return { exitCode: 0, stdout: 'v22.19.0', stderr: '' };
        if (args[0] === '--version')
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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
      installedPackages: [
        'npm:thoth-agents@0.3.12',
        'npm:pi-subagents@>=0.71.0',
        'npm:@upstash/context7-pi@>=0.1.2',
      ],
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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

  test('merges required delegation settings without overwriting unrelated user settings', () => {
    expect(
      mergePiUserSettings({ theme: 'dark', subagents: { fleetView: false } }),
    ).toEqual({
      theme: 'dark',
      subagents: { fleetView: false, disableBuiltins: true },
    });
    expect(
      mergePiSubagentConfig({
        inlineToolDisplay: 'summary',
        waitTool: false,
        missions: { enabled: true, directory: '/custom/missions' },
        scheduledRuns: { enabled: true, maxPending: 7 },
      }),
    ).toEqual({
      inlineToolDisplay: 'summary',
      waitTool: false,
      missions: { enabled: false, directory: '/custom/missions' },
      scheduledRuns: { enabled: false, maxPending: 7 },
      defaultSubagentContext: 'fresh',
      maxSubagentDepth: 1,
    });
    expect(() => mergePiUserSettings({ subagents: 'invalid' })).toThrow(
      'subagents must be a JSON object',
    );
  });

  test('blocks a legacy delegation declaration during dry-run without deleting user settings', () => {
    const paths = fixture();
    const settingsPath = join(paths.homeDir, '.pi', 'agent', 'settings.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    const settings = {
      theme: 'dark',
      packages: [{ source: 'npm:pi-subagents-j0k3r@1.5.9', skills: [] }],
    };
    writeFileSync(settingsPath, JSON.stringify(settings));
    const plan = buildPiSetupPlan({ ...paths, dryRun: true });
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toEqual([
      expect.stringContaining('pi-subagents-j0k3r@1.5.9'),
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
        if (args[0] === 'list')
          return {
            exitCode: 0,
            stdout: 'User packages:\n  npm:pi-subagents-j0k3r@1.5.9',
            stderr: '',
          };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(applyPiSetup(plan)).toMatchObject({
      success: false,
      failedStep: 'preflight',
      error: expect.stringContaining('pi-subagents-j0k3r'),
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
      join(agentsRoot, 'thoth-deep.md'),
      '---\nname: thoth-deep\ndescription: "user-owned definition"\n---\n',
    );
    const plan = buildPiSetupPlan(paths);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toEqual([
      expect.stringContaining(
        'defines canonical specialist thoth-deep without thoth-agents ownership',
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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
    expect(calls.some((call) => call.includes('pi-subagents@'))).toBe(false);
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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
          return { exitCode: 0, stdout: '0.86.1', stderr: '' };
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
