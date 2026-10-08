import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

type Section = 'Improvements' | 'Bugfixes';
type Area =
  | 'Core'
  | 'Agents'
  | 'Skills'
  | 'Tools & MCP'
  | 'Hooks'
  | 'CLI & Config'
  | 'Docs & CI';

type Commit = {
  hash: string;
  subject: string;
  author: string | undefined;
  files: string[];
};

const areaOrder: Area[] = [
  'Core',
  'Agents',
  'Skills',
  'Tools & MCP',
  'Hooks',
  'CLI & Config',
  'Docs & CI',
];
const sectionOrder: Section[] = ['Improvements', 'Bugfixes'];
const botAuthors = new Set([
  'actions-user',
  'github-actions[bot]',
  'dependabot[bot]',
]);
let internalAuthors = new Set<string>();

export type GenerateOptions = {
  from?: string;
  to?: string;
  outputPath?: string;
  tagPrefix?: string;
  path?: string;
  excludePath?: string;
  packageTags?: string;
};

type Context = {
  cwd?: string;
  /** GitHub `owner/repo`; `null` disables repository and `gh` lookups. */
  repository?: string | null;
  /** Set false to skip the `gh api` author lookup (offline runs). */
  lookupAuthors?: boolean;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = parseArgs(process.argv.slice(2));

  writeFileSync(
    args.outputPath ?? 'release-notes.md',
    generateReleaseNotes(args),
  );
}

export function generateReleaseNotes(
  options: GenerateOptions,
  context: Context = {},
): string {
  const repo =
    context.repository === undefined
      ? getGitHubRepository(context.cwd)
      : (context.repository ?? undefined);

  internalAuthors = new Set(
    [process.env.GITHUB_REPOSITORY_OWNER, repo?.split('/')[0]]
      .filter(Boolean)
      .map((author) => author?.toLowerCase()),
  );

  const currentRef =
    options.to ?? process.env.GITHUB_REF_NAME ?? getCurrentTag(context.cwd);
  const previousRef =
    options.from ??
    getPreviousTag(currentRef, options.tagPrefix ?? 'v', context.cwd);
  const commits = getCommits(
    previousRef,
    currentRef,
    options.path,
    options.excludePath,
    context.cwd,
  );
  const authorLogins =
    context.lookupAuthors === false
      ? new Map<string, string>()
      : getGitHubAuthorLogins(previousRef, currentRef, repo);
  const notes = renderReleaseNotes(
    commits.map((commit) => ({
      ...commit,
      author: authorLogins.get(commit.hash) ?? commit.author,
    })),
    previousRef,
    currentRef,
  );

  if (!options.packageTags) {
    return notes;
  }

  const section = renderPackageTagsSection(
    getPackageTags(currentRef, options.packageTags, context.cwd),
    repo,
  );

  return section ? `${notes}\n${section}` : notes;
}

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd });
}

export function parseArgs(values: string[]): GenerateOptions {
  const parsed: GenerateOptions = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if ((value === '--from' || value === '-f') && values[index + 1]) {
      parsed.from = normalizeRef(values[index + 1]);
      index += 1;
      continue;
    }

    if ((value === '--to' || value === '-t') && values[index + 1]) {
      parsed.to = normalizeRef(values[index + 1]);
      index += 1;
      continue;
    }

    const flags = {
      '--tag-prefix': 'tagPrefix',
      '--path': 'path',
      '--exclude-path': 'excludePath',
      '--package-tags': 'packageTags',
    } as const;
    const key = flags[value as keyof typeof flags];

    if (key && values[index + 1]) {
      parsed[key] = values[index + 1];
      index += 1;
      continue;
    }

    if (!value.startsWith('-')) {
      parsed.outputPath = value;
    }
  }

  return parsed;
}

function getCurrentTag(cwd?: string): string {
  return git(['describe', '--tags', '--exact-match'], cwd).trim();
}

export function getPreviousTag(
  ref: string,
  prefix = 'v',
  cwd?: string,
): string | undefined {
  const tags = git(['tag', '--sort=-creatordate', '--merged', ref], cwd)
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value !== ref && value.startsWith(prefix));

  return tags[0];
}

export function getPackageTags(
  ref: string,
  glob: string,
  cwd?: string,
): string[] {
  return git(['tag', '--points-at', `${ref}^{commit}`, '--list', glob], cwd)
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
}

export function renderPackageTagsSection(
  tags: string[],
  repo: string | undefined,
): string {
  if (tags.length === 0) {
    return '';
  }

  const items = tags.map((tag) =>
    repo
      ? `- [${tag}](https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)})`
      : `- ${tag}`,
  );

  return `## Pi packages\n\n${items.join('\n')}\n`;
}

export function isInsideDir(file: string, dir: string): boolean {
  return file.startsWith(`${dir.replace(/\/+$/, '')}/`);
}

function getCommits(
  from: string | undefined,
  to: string,
  path?: string,
  excludePath?: string,
  cwd?: string,
): Commit[] {
  const range = from ? `${from}..${to}` : to;
  const hashes = git(
    ['log', '--format=%H', range, ...(path ? ['--', path] : [])],
    cwd,
  )
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  return removeRevertedCommits(
    hashes
      .map((hash) => toCommit(hash, cwd))
      .filter((commit) => isNotableCommit(commit.subject))
      .filter(
        (commit) =>
          !excludePath ||
          commit.files.length === 0 ||
          !commit.files.every((file) => isInsideDir(file, excludePath)),
      ),
  );
}

function toCommit(hash: string, cwd?: string): Commit {
  const [subject = '', authorName = '', authorEmail = ''] = git(
    ['show', '--no-patch', '--format=%s%x1f%an%x1f%ae', hash],
    cwd,
  )
    .trim()
    .split('\x1f');
  const files = git(
    ['log', '-1', '-m', '--first-parent', '--name-only', '--format=', hash],
    cwd,
  )
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    hash,
    subject,
    author: gitHubUserFromEmail(authorEmail) ?? authorName,
    files,
  };
}

function getGitHubAuthorLogins(
  from: string | undefined,
  to: string,
  repo: string | undefined,
): Map<string, string> {
  if (!from || !repo) {
    return new Map();
  }

  try {
    const output = execFileSync(
      'gh',
      [
        'api',
        `/repos/${repo}/compare/${from}...${to}?per_page=100`,
        '--jq',
        '.commits[] | {sha: .sha, login: .author.login}',
      ],
      { encoding: 'utf8' },
    );

    return new Map(
      output
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { sha: string; login?: string })
        .filter((item) => item.login)
        .map((item) => [item.sha, item.login as string]),
    );
  } catch {
    return new Map();
  }
}

function getGitHubRepository(cwd?: string): string | undefined {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  try {
    const remote = git(['remote', 'get-url', 'origin'], cwd).trim();

    return remote
      .replace(/^git@github\.com:/, '')
      .replace(/^https:\/\/github\.com\//, '')
      .replace(/\.git$/, '');
  } catch {
    return undefined;
  }
}

function isNotableCommit(subject: string): boolean {
  const match = subject.match(/^(?<type>[a-z]+)(?:\(.+\))?!?:/i);

  if (!match?.groups) {
    return false;
  }

  return !['ignore', 'test', 'chore', 'ci', 'release', 'docs'].includes(
    match.groups.type,
  );
}

function removeRevertedCommits(commits: Commit[]): Commit[] {
  const seen = new Map<string, Commit>();

  for (const commit of commits) {
    const reverted = commit.subject.match(/^Revert "(.+)"$/);

    if (reverted) {
      seen.delete(reverted[1]);
      continue;
    }

    const revertSubject = `Revert "${commit.subject}"`;

    if (seen.has(revertSubject)) {
      seen.delete(revertSubject);
      continue;
    }

    seen.set(commit.subject, commit);
  }

  return [...seen.values()];
}

export function renderReleaseNotes(
  commits: Commit[],
  from: string | undefined,
  to: string,
): string {
  const grouped = createEmptyGroups();

  for (const commit of commits) {
    grouped
      .get(areaForFiles(commit.files))
      ?.get(sectionForSubject(commit.subject))
      ?.push(formatCommit(commit));
  }

  const lines = from ? [`Last release: ${from}`, `Target ref: ${to}`, ''] : [];

  for (const area of areaOrder) {
    const sections = grouped.get(area);

    if (
      !sections ||
      [...sections.values()].every((items) => items.length < 1)
    ) {
      continue;
    }

    lines.push(`## ${area}`);

    for (const section of sectionOrder) {
      const entries = sections.get(section) ?? [];

      if (entries.length < 1) {
        continue;
      }

      lines.push(`### ${section}`, '', ...entries, '');
    }
  }

  const contributorLines = communityContributors(commits);

  if (contributorLines.length > 0) {
    lines.push('## Community Contributors Input', '', ...contributorLines);
  }

  if (lines.length === 0 || lines.every((line) => line === '')) {
    lines.push('No notable changes.');
  }

  return `${lines.join('\n').trim()}\n`;
}

function createEmptyGroups(): Map<Area, Map<Section, string[]>> {
  return new Map(
    areaOrder.map((area) => [
      area,
      new Map(sectionOrder.map((section) => [section, []])),
    ]),
  );
}

function areaForFiles(files: string[]): Area {
  if (files.some((file) => file.startsWith('src/agents/'))) {
    return 'Agents';
  }

  if (files.some((file) => file.startsWith('src/skills/'))) {
    return 'Skills';
  }

  if (
    files.some(
      (file) => file.startsWith('src/tools/') || file.startsWith('src/mcp/'),
    )
  ) {
    return 'Tools & MCP';
  }

  if (files.some((file) => file.startsWith('src/hooks/'))) {
    return 'Hooks';
  }

  if (
    files.some(
      (file) =>
        file.startsWith('src/cli/') ||
        file.startsWith('src/config/') ||
        file.startsWith('scripts/') ||
        file === 'package.json' ||
        file === 'tsconfig.json',
    )
  ) {
    return 'CLI & Config';
  }

  if (
    files.some(
      (file) =>
        file.startsWith('.github/') ||
        file.startsWith('docs/') ||
        file === 'README.md' ||
        file === 'AGENTS.md',
    )
  ) {
    return 'Docs & CI';
  }

  return 'Core';
}

function sectionForSubject(subject: string): Section {
  return subject.match(/^fix(\(.+\))?!?:/i) ? 'Bugfixes' : 'Improvements';
}

function formatCommit(commit: Commit): string {
  const author =
    commit.author && isExternalContributor(commit.author)
      ? ` (@${commit.author})`
      : '';

  return `- \`${commit.hash.slice(0, 7)}\` ${quoteSubjectHandles(commit.subject)}${author}`;
}

function quoteSubjectHandles(subject: string): string {
  // Preserve code spans, including delimiters made of multiple backticks.
  return subject.replace(
    /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)|(?<!\w)@[\w-]+(?:\/[\w-]+(?:\.[\w-]+)*)?/g,
    (token) => (token.startsWith('`') ? token : `\`${token}\``),
  );
}

function communityContributors(commits: Commit[]): string[] {
  const contributors = new Map<string, string[]>();

  for (const commit of commits) {
    if (!commit.author || !isExternalContributor(commit.author)) {
      continue;
    }

    if (!contributors.has(commit.author)) {
      contributors.set(commit.author, []);
    }

    contributors.get(commit.author)?.push(commit.subject);
  }

  if (contributors.size === 0) {
    return [];
  }

  const lines = [
    `**Thank you to ${contributors.size} community contributor${
      contributors.size > 1 ? 's' : ''
    }:**`,
  ];

  for (const [author, subjects] of contributors) {
    lines.push(`- @${author}:`);

    for (const subject of subjects) {
      lines.push(`  - ${quoteSubjectHandles(subject)}`);
    }
  }

  return lines;
}

function gitHubUserFromEmail(email: string): string | undefined {
  return email.match(/(?:\d+\+)?([^@]+)@users\.noreply\.github\.com/)?.at(1);
}

function isExternalContributor(author: string): boolean {
  const normalized = author.toLowerCase();

  return !botAuthors.has(author) && !internalAuthors.has(normalized);
}

export function normalizeRef(input: string | undefined): string | undefined {
  if (!input || input === 'HEAD' || input.startsWith('v')) {
    return input;
  }

  if (input.match(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)) {
    return `v${input}`;
  }

  return input;
}
