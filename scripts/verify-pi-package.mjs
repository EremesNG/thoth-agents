import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
const tempRoot = mkdtempSync(join(tmpdir(), 'thoth-pi-package-'));
function windowsShimCli(command) {
  const located = spawnSync('where.exe', [`${command}.cmd`], {
    encoding: 'utf8',
  })
    .stdout?.split(/\r?\n/)
    .find(Boolean);
  if (!located) throw new Error(`${command} executable is unavailable.`);
  const shim = readFileSync(located, 'utf8');
  const target = shim.match(/%~dp0\\([^"\r\n]*?\.js)(?=")/i)?.[1];
  if (!target) throw new Error(`Could not resolve ${command} launcher target.`);
  const cli = join(dirname(located), target);
  if (!existsSync(cli))
    throw new Error(`${command} launcher target is missing: ${cli}`);
  return cli;
}
function run(command, args, options = {}) {
  const isWindowsShim = process.platform === 'win32' && command === 'npm';
  const executable = isWindowsShim ? process.execPath : command;
  const executableArgs = isWindowsShim
    ? [windowsShimCli(command), ...args]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  return result;
}
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function runPi(args, piHome) {
  if (process.platform !== 'win32')
    return run('pi', args, {
      env: { ...process.env, PI_CODING_AGENT_DIR: piHome },
    });
  const cli = windowsShimCli('pi');
  return run(process.execPath, [cli, ...args], {
    env: { ...process.env, PI_CODING_AGENT_DIR: piHome },
  });
}
function parsePiList(output) {
  const packages = [];
  let scope = 'user';
  for (const line of output.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value === 'No packages installed.') continue;
    if (value === 'User packages:') {
      scope = 'user';
      continue;
    }
    if (value === 'Project packages:') {
      scope = 'project';
      continue;
    }
    const previous = packages.at(-1);
    if (/^\s{4,}\S/.test(line) && previous && !previous.installedPath) {
      previous.installedPath = value;
      continue;
    }
    packages.push({ scope, source: value.replace(/ \(filtered\)$/, '') });
  }
  return packages;
}
try {
  if (!existsSync(join(projectRoot, 'dist', 'pi.js')))
    throw new Error('dist/pi.js is missing; run pnpm run build first.');
  const packOutput = JSON.parse(
    run('npm', [
      'pack',
      '--json',
      '--pack-destination',
      tempRoot,
      '--ignore-scripts',
    ]).stdout,
  );
  const packed = Array.isArray(packOutput)
    ? packOutput[0]
    : Object.values(packOutput)[0];
  const archive = join(tempRoot, packed.filename);
  const installRoot = join(tempRoot, 'installed');
  mkdirSync(installRoot);
  run('npm', [
    'install',
    archive,
    '--prefix',
    installRoot,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  const candidate = join(installRoot, 'node_modules', 'thoth-agents');
  const manifest = JSON.parse(
    readFileSync(join(candidate, 'package.json'), 'utf8'),
  );
  if (
    manifest.name !== 'thoth-agents' ||
    JSON.stringify(manifest.pi) !==
      JSON.stringify({ extensions: ['./dist/pi.js'], skills: ['./skills'] })
  )
    throw new Error('Packed Pi manifest is invalid.');
  const agentContents = new Map();
  const agents = readdirSync(join(candidate, 'pi', 'agents'))
    .filter((name) => name.endsWith('.md'))
    .sort();
  for (const agent of agents)
    agentContents.set(
      agent,
      readFileSync(join(candidate, 'pi', 'agents', agent), 'utf8'),
    );
  if (
    JSON.stringify(agents) !==
    JSON.stringify([
      'thoth-designer.md',
      'thoth-explorer.md',
      'thoth-librarian.md',
      'thoth-oracle.md',
      'thoth-worker.md',
    ])
  )
    throw new Error(
      `Packed specialist inventory is invalid: ${agents.join(', ')}`,
    );
  for (const [agent, content] of agentContents) {
    const frontmatter =
      content.match(/^---\r?\n([\s\S]*?)\r?\n---/m)?.[1] ?? '';
    const model = frontmatter
      .match(/^model:\s*"?([^"\r\n]+)"?\s*$/m)?.[1]
      ?.trim();
    const effort = frontmatter
      .match(/^effort:\s*"?([^"\r\n]+)"?\s*$/m)?.[1]
      ?.trim();
    const mode = frontmatter
      .match(/^subagent_mode:\s*"?([^"\r\n]+)"?\s*$/m)?.[1]
      ?.trim();
    if (
      !model ||
      !effort ||
      !['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ||
      !['task', 'background'].includes(mode) ||
      /^(defaultContext|maxSubagentDepth|async):/m.test(frontmatter) ||
      /^thinking:/m.test(frontmatter)
    )
      throw new Error(`Packed specialist contract is stale: ${agent}`);
  }
  if (
    agentContents
      .get('thoth-librarian.md')
      ?.match(/^subagent_mode:\s*"?([^"\r\n]+)"?\s*$/m)?.[1] !== 'background'
  )
    throw new Error('Packed librarian must run in background.');
  const skills = readdirSync(join(candidate, 'skills'), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(candidate, 'skills', entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort();
  if (skills.length !== 5)
    throw new Error(
      `Expected five packaged skills, received ${skills.length}.`,
    );
  for (const forbidden of [
    'thoth-mem',
    'pi-subagents',
    'pi-subagents-j0k3r',
    '@thoth-agents/pi-subagents',
    'pi-packages/pi-subagents',
    'pi-mcp-adapter',
    'context7',
    'pi-exa',
  ])
    if (existsSync(join(candidate, forbidden)))
      throw new Error(`External implementation tree was packed: ${forbidden}`);
  const unrelated = join(tempRoot, 'unrelated');
  mkdirSync(unrelated);
  // Native peers resolve through Pi's loader rather than a bare Node import.
  // The real-Pi probe below verifies the packed entrypoint from an isolated home.
  const piHome = join(tempRoot, 'pi-home');
  mkdirSync(piHome);
  runPi(['install', candidate, '--no-approve'], piHome);
  const configuredPackages = parsePiList(
    runPi(['list', '--no-approve'], piHome).stdout,
  );
  const installedCandidates = configuredPackages.filter(
    ({ scope, installedPath }) =>
      scope === 'user' &&
      installedPath &&
      resolve(installedPath).toLowerCase() === resolve(candidate).toLowerCase(),
  );
  if (installedCandidates.length !== 1)
    throw new Error(
      `Real Pi did not report one local candidate at ${candidate}.`,
    );
  const configuredSource = installedCandidates[0].source;
  if (resolve(configuredSource) === resolve(candidate))
    throw new Error('Real Pi did not canonicalize the absolute local source.');
  const extensionPath = join(candidate, 'dist', 'pi.js');
  const probeModule = pathToFileURL(
    join(projectRoot, 'src', 'cli', 'pi-native-probe.ts'),
  ).href;
  const probeOptions = {
    extensionPath,
    packageRoot: candidate,
    piHome,
    manifestSha256: sha256(join(candidate, 'package.json')),
    extensionSha256: sha256(extensionPath),
  };
  const probeCode = `import { observePiNativeRoot } from ${JSON.stringify(probeModule)}; console.log(JSON.stringify(observePiNativeRoot(${JSON.stringify(probeOptions)})));`;
  const probe = run(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '--eval',
    probeCode,
  ]);
  const observation = JSON.parse(probe.stdout.trim().split(/\r?\n/).at(-1));
  if (observation.state !== 'observed-at-install')
    throw new Error(
      `Packed Pi extension was not observed by real Pi: ${observation.basis?.join('; ') ?? observation.state}`,
    );
  const discoveredSkills = (observation.discoveredSkills ?? [])
    .map(({ name, location }) => ({ name, location: resolve(location) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const expectedSkills = skills.map((name) => ({
    name,
    location: resolve(candidate, 'skills', name, 'SKILL.md'),
  }));
  if (JSON.stringify(discoveredSkills) !== JSON.stringify(expectedSkills))
    throw new Error(
      `Real Pi did not discover exactly the five attributable skills: ${JSON.stringify(discoveredSkills)}.`,
    );
  const materializedSpecialists = [
    ...(observation.materializedSpecialists ?? []),
  ].sort();
  if (
    observation.sessionStartCount !== 1 ||
    observation.orchestratorChild !== false ||
    JSON.stringify(materializedSpecialists) !==
      JSON.stringify(agents.map((name) => name.replace(/\.md$/, '')).sort())
  )
    throw new Error(
      `Real Pi session_start specialist materialization is invalid: ${JSON.stringify({ sessionStartCount: observation.sessionStartCount, materializedSpecialists, orchestratorChild: observation.orchestratorChild })}.`,
    );
  console.log(
    JSON.stringify({
      status: 'complete',
      archive,
      package: `${manifest.name}@${manifest.version}`,
      extension: './dist/pi.js',
      skills: skills.length,
      specialists: agents.length,
      observation: observation.state,
      discoveredSkills: discoveredSkills.map(({ name }) => name),
      materializedSpecialists,
      sessionStartCount: observation.sessionStartCount,
      orchestratorChild: observation.orchestratorChild,
      configuredSource,
      resolvedPath: installedCandidates[0].installedPath,
    }),
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
