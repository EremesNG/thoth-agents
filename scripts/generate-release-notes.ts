import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

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
const internalAuthors = new Set(
  [process.env.GITHUB_REPOSITORY_OWNER, getGitHubRepository()?.split('/')[0]]
    .filter(Boolean)
    .map((author) => author?.toLowerCase()),
);

const args = parseArgs(process.argv.slice(2));
const outputPath = args.outputPath ?? 'release-notes.md';
const currentRef = args.to ?? process.env.GITHUB_REF_NAME ?? getCurrentTag();
const previousRef = args.from ?? getPreviousTag(currentRef);
const commits = getCommits(previousRef, currentRef);
const authorLogins = getGitHubAuthorLogins(previousRef, currentRef);
const releaseNotes = renderReleaseNotes(
  commits.map((commit) => ({
    ...commit,
    author: authorLogins.get(commit.hash) ?? commit.author,
  })),
  previousRef,
  currentRef,
);

writeFileSync(outputPath, releaseNotes);

function parseArgs(values: string[]): {
  from?: string;
  to?: string;
  outputPath?: string;
} {
  const parsed: { from?: string; to?: string; outputPath?: string } = {};

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

    if (!value.startsWith('-')) {
      parsed.outputPath = value;
    }
  }

  return parsed;
}

function getCurrentTag(): string {
  return execFileSync('git', ['describe', '--tags', '--exact-match'], {
    encoding: 'utf8',
  }).trim();
}

function getPreviousTag(ref: string): string | undefined {
  const tags = execFileSync(
    'git',
    ['tag', '--sort=-creatordate', '--merged', ref],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value !== ref);

  return tags[0];
}

function getCommits(from: string | undefined, to: string): Commit[] {
  const range = from ? `${from}..${to}` : to;
  const hashes = execFileSync('git', ['log', '--format=%H', range], {
    encoding: 'utf8',
  })
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  return removeRevertedCommits(
    hashes
      .map((hash) => toCommit(hash))
      .filter((commit) => isNotableCommit(commit.subject)),
  );
}

function toCommit(hash: string): Commit {
  const [subject = '', authorName = '', authorEmail = ''] = execFileSync(
    'git',
    ['show', '--no-patch', '--format=%s%x1f%an%x1f%ae', hash],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\x1f');
  const files = execFileSync(
    'git',
    ['diff-tree', '--no-commit-id', '--name-only', '-r', hash],
    { encoding: 'utf8' },
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
): Map<string, string> {
  if (!from) {
    return new Map();
  }

  const repo = getGitHubRepository();

  if (!repo) {
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

function getGitHubRepository(): string | undefined {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    }).trim();

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

function renderReleaseNotes(
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

  return `- \`${commit.hash.slice(0, 7)}\` ${commit.subject}${author}`;
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
      lines.push(`  - ${subject}`);
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

function normalizeRef(input: string | undefined): string | undefined {
  if (!input || input === 'HEAD' || input.startsWith('v')) {
    return input;
  }

  if (input.match(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)) {
    return `v${input}`;
  }

  return input;
}
