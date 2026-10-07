import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, expect, test, vi } from 'vitest';
import { projectGitPackagePath } from './pi-git-source';
import { buildPiSetupPlan } from './pi-install';

// Import the pinned SDK's actual parser and package manager, not mirrored fixtures.
const sdkEntry = new URL(
  import.meta.resolve('@earendil-works/pi-coding-agent'),
);
const { parseGitUrl } = await import(new URL('./utils/git.js', sdkEntry).href);
const { isLocalPath } = await import(
  new URL('./utils/paths.js', sdkEntry).href
);
const { DefaultPackageManager } = await import(
  new URL('./core/package-manager.js', sdkEntry).href
);
const root = mkdtempSync(join(tmpdir(), 'thoth-pi-git-differential-'));
const projectRoot = join(root, '.pi');
// User scope with agentDir=.pi has the same layout as project scope, without
// invoking the SDK's project-trust gate or granting a trust decision.
const manager = new DefaultPackageManager({
  cwd: root,
  agentDir: projectRoot,
  settingsManager: {},
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const sources = [
  'https://github.com/operator/tasks',
  'https://github.com/operator/tasks.git',
  'https://github.com/operator/tasks.git/',
  'https://github.com/operator/tasks/',
  'https://github.com/operator/tasks///',
  'https://www.github.com/operator/tasks',
  'https://www.github.com/operator/tasks.git/',
  'https://GITHUB.COM/Operator/Tasks.GIT',
  'HTTPS://github.com/operator/tasks',
  'https://github.com/Operator/Tasks.git',
  'http://github.com/operator/tasks',
  'ssh://git@github.com/operator/tasks.git',
  'git://github.com/operator/tasks.git',
  'git@github.com:operator/tasks.git',
  'github:operator/tasks',
  'operator/tasks',
  'github.com/operator/tasks',
  'git:https://github.com/operator/tasks.git/',
  'git:https://www.github.com/operator/tasks',
  'git:git@github.com:operator/tasks.git',
  'git:github:operator/tasks',
  'git:operator/tasks',
  'git:github.com/operator/tasks',
  'git:www.github.com/operator/tasks',
  ' git: github.com/operator/tasks.git ',
  'git:https://github.com/operator/tasks.git@main',
  'git:https://github.com/operator/tasks.git@feature/board',
  'https://github.com/operator/tasks.git#main',
  'https://github.com/operator/tasks.git@main',
  'https://github.com/operator/tasks.git@',
  'git:git@github.com:operator/tasks.git@feature/board',
  'git:git@github.com:operator/tasks.git#main',
  'git:github:operator/tasks#main',
  'git:operator/tasks@main',
  'git:operator/tasks#main',
  'https://github.com/operator/tasks/tree/main',
  'https://github.com/operator/tasks/tree/feature/board',
  'https://gitlab.com/operator/tasks.git/',
  'https://www.gitlab.com/operator/tasks',
  'git:gitlab:operator/tasks#main',
  'git:gitlab:group/operator/tasks#main',
  'https://bitbucket.org/operator/tasks/src/main',
  'git:bitbucket:operator/tasks',
  'git:gist:0123456789abcdef',
  'git:gist:operator/0123456789abcdef#main',
  'https://example.test/operator/tasks.git',
  'https://example.test/operator/tasks.git/',
  'https://www.example.test/operator/tasks/',
  'https://EXAMPLE.TEST/Operator/Tasks.git',
  'HTTPS://example.test/operator/tasks.git',
  'ssh://git@example.test/operator/tasks.git',
  'git://example.test/operator/tasks.git',
  'git:git@example.test:operator/tasks.git',
  'git:example.test/operator/tasks.git',
  'git:localhost/operator/tasks.git',
  'git:intranet/operator/tasks.git',
  'https://example.test:8443/operator/tasks.git',
  'ssh://git@example.test:2222/operator/tasks.git@main',
  'https://github.com:8443/operator/tasks.git',
  'ssh://git@github.com:2222/operator/tasks.git',
  'https://example.test/operator/tasks.git#main',
  'https://example.test/operator/tasks.git@feature/board',
  'git:git@example.test:operator/tasks.git@main',
  'git:git@example.test:operator/tasks.git@',
  'git:example.test/operator/tasks.git#main',
  'git:example.test/operator/tasks.git@main',
  '../operator/tasks',
  './operator/tasks',
  '/tmp/operator/tasks',
  'C:\\operator\\tasks',
  '~/operator/tasks',
  pathToFileURL(join(root, 'operator', 'tasks')).href,
  'npm:@juicesharp/rpiv-todo',
  'git:/tmp/operator/tasks',
  'git:../operator/tasks',
  'git:git@example.test:/operator/tasks',
  'git:git@example.test:operator/../tasks',
  'git:git@example.test:operator/%2e%2e/tasks',
  'git:git@example.test:operator/%2ftasks',
  'git:git@example.test:operator/%5ctasks',
  'git:git@example.test:operator/%00tasks',
  'git:git@example.test:operator/%zz',
  'git:git@example.test:operator/tasks\\extra',
  'git:git@host/path:operator/tasks',
  'https://example.test/only-one-part',
  'git:',
];

test.each(
  sources,
)('resolves Git install paths exactly like Pi SDK 1.0.2: %s', (source) => {
  // DefaultPackageManager.parseSource gives local paths precedence over Git.
  const parsed = isLocalPath(source) ? null : parseGitUrl(source);
  let nativePath: string | undefined;
  if (parsed) {
    mkdirSync(join(projectRoot, 'git', parsed.host, parsed.path), {
      recursive: true,
    });
    nativePath = manager.getInstalledPath(source, 'user');
    expect(nativePath).toBeDefined();
  }
  expect(projectGitPackagePath(source, projectRoot)).toBe(nativePath);
});

test.each([
  'bare',
  'relative',
  'absolute',
  'file-url',
  'home-relative',
  'npm',
  'npm-alias',
  ...(process.platform === 'win32' ? ['msys', 'wsl', 'cygwin'] : []),
])('resolves project %s install paths exactly like Pi SDK 1.0.2', (kind) => {
  const sandbox = mkdtempSync(join(root, 'local-'));
  const cwd = join(sandbox, 'project');
  const homeDir = join(sandbox, 'home');
  const piRoot = join(cwd, '.pi');
  const npmName = kind === 'npm' ? '@juicesharp/rpiv-todo' : 'operator-tasks';
  const installedPath = kind.startsWith('npm')
    ? join(piRoot, 'npm', 'node_modules', npmName)
    : kind === 'bare'
      ? join(piRoot, 'operator-tasks')
      : kind === 'relative'
        ? join(cwd, 'operator-tasks')
        : join(homeDir, 'operator-tasks');
  const shellPath = installedPath
    .replace(
      /^([a-z]):[\\/]/i,
      (_, drive: string) => `/${drive.toLowerCase()}/`,
    )
    .replaceAll('\\', '/');
  const sources: Record<string, string> = {
    bare: 'operator-tasks',
    relative: '../operator-tasks',
    absolute: installedPath,
    'file-url': pathToFileURL(installedPath).href,
    'home-relative': '~/operator-tasks',
    npm: 'npm:@juicesharp/rpiv-todo@2.12.0',
    'npm-alias': 'npm:operator-tasks@npm:@juicesharp/rpiv-todo@2.12.0',
    msys: shellPath,
    wsl: `/mnt${shellPath}`,
    cygwin: `/cygdrive${shellPath}`,
  };
  const source = sources[kind];
  mkdirSync(installedPath, { recursive: true });
  mkdirSync(piRoot, { recursive: true });
  writeFileSync(
    join(installedPath, 'package.json'),
    JSON.stringify({ name: '@juicesharp/rpiv-todo' }),
  );
  writeFileSync(
    join(piRoot, 'settings.json'),
    JSON.stringify({ packages: [source] }),
  );
  vi.stubEnv('HOME', homeDir);
  try {
    const native = new DefaultPackageManager({
      cwd,
      agentDir: piRoot,
      settingsManager: {},
    });
    const nativePath = native.getInstalledPath(source, 'user');
    expect(nativePath).toBe(installedPath);
    const plan = buildPiSetupPlan({
      cwd,
      homeDir,
      env: {},
      packageRoot: process.cwd(),
    });
    expect(
      plan.projectIncumbentTodos?.map(({ installedPath }) => installedPath),
    ).toEqual([nativePath]);
    expect(plan.ready).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});
