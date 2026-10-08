import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  generateReleaseNotes,
  normalizeRef,
  parseArgs,
  renderReleaseNotes,
} from '../../scripts/generate-release-notes';

let dir: string;
const context = () => ({
  cwd: dir,
  repository: 'acme/widgets',
  lookupAuthors: false,
});

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
}

function commit(subject: string, ...files: string[]): void {
  for (const file of files) {
    const full = join(dir, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `${subject}\n${Math.random()}`);
  }
  git('add', '-A');
  git('commit', '-q', '-m', subject);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'Tester');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  commit('feat: root base', 'src/core.ts');
  git('tag', 'v1.0.0');
  commit('feat: root feature', 'src/core.ts');
  commit('fix: pi only fix', 'pi-packages/a/index.ts');
  git('tag', '@thoth-agents/pi-subagents@0.1.1');
  commit('feat: mixed change', 'pi-packages/a/index.ts', 'src/core.ts');
  git('tag', '@thoth-agents/pi-todo@0.2.0');
  git('tag', 'v1.1.0');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('generate-release-notes', () => {
  test('default root run uses the previous v* tag and ignores package tags', () => {
    const notes = generateReleaseNotes({ to: 'v1.1.0' }, context());

    expect(notes).toContain('Last release: v1.0.0');
    expect(notes).toContain('root feature');
    expect(notes).toContain('pi only fix');
    expect(notes).not.toContain('Pi packages');
  });

  test('custom tag prefix selects the previous package tag', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', tagPrefix: '@thoth-agents/pi-subagents@' },
      context(),
    );

    expect(notes).toContain('Last release: @thoth-agents/pi-subagents@0.1.1');
    expect(notes).toContain('mixed change');
    expect(notes).not.toContain('root feature');
  });

  test('--path keeps only commits touching the directory', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', path: 'pi-packages' },
      context(),
    );

    expect(notes).toContain('pi only fix');
    expect(notes).toContain('mixed change');
    expect(notes).not.toContain('root feature');
  });

  test('--exclude-path drops Pi-only commits but keeps mixed ones', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', excludePath: 'pi-packages' },
      context(),
    );

    expect(notes).not.toContain('pi only fix');
    expect(notes).toContain('mixed change');
    expect(notes).toContain('root feature');
  });

  test('--package-tags lists tagged packages with encoded release links', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', packageTags: '@thoth-agents/*' },
      context(),
    );

    expect(notes).toContain('## Pi packages');
    expect(notes).toContain(
      '- [@thoth-agents/pi-todo@0.2.0](https://github.com/acme/widgets/releases/tag/%40thoth-agents%2Fpi-todo%400.2.0)',
    );
    expect(notes).not.toContain('pi-subagents@0.1.1]');
  });

  test('--package-tags omits the section when nothing matches', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', packageTags: 'nomatch-*' },
      context(),
    );

    expect(notes).not.toContain('Pi packages');
  });

  test('parseArgs keeps legacy flags and reads new ones', () => {
    expect(
      parseArgs([
        'out.md',
        '-f',
        '1.0.0',
        '--to',
        'HEAD',
        '--tag-prefix',
        'p@',
        '--path',
        'a',
        '--exclude-path',
        'b',
        '--package-tags',
        'c*',
      ]),
    ).toEqual({
      outputPath: 'out.md',
      from: 'v1.0.0',
      to: 'HEAD',
      tagPrefix: 'p@',
      path: 'a',
      excludePath: 'b',
      packageTags: 'c*',
    });
  });

  test('normalizeRef does not mangle package tags', () => {
    expect(normalizeRef('@thoth-agents/pi-subagents@0.1.1')).toBe(
      '@thoth-agents/pi-subagents@0.1.1',
    );
    expect(normalizeRef('1.2.3')).toBe('v1.2.3');
  });
});

describe('release-note commit subjects', () => {
  test('quotes subject handles without suppressing external-author mentions', () => {
    const notes = renderReleaseNotes(
      [
        {
          hash: 'd8c0d3c',
          subject:
            'feat(pi-subagents)!: make * the active-tools selector and remove @active',
          author: 'external-author',
          files: ['pi-packages/pi-subagents/index.ts'],
        },
      ],
      undefined,
      'HEAD',
    );

    expect(notes).toBe(
      [
        '## Core',
        '### Improvements',
        '',
        '- `d8c0d3c` feat(pi-subagents)!: make * the active-tools selector and remove `@active` (@external-author)',
        '',
        '## Community Contributors Input',
        '',
        '**Thank you to 1 community contributor:**',
        '- @external-author:',
        '  - feat(pi-subagents)!: make * the active-tools selector and remove `@active`',
        '',
      ].join('\n'),
    );
  });

  test.each([
    [
      'scoped packages',
      'integrate @thoth-agents/pi-core',
      'integrate `@thoth-agents/pi-core`',
    ],
    [
      'existing inline code and hyphenated handles',
      'keep `@active` and `@thoth-agents/pi-core` but remove @user-name',
      'keep `@active` and `@thoth-agents/pi-core` but remove `@user-name`',
    ],
    [
      'multi-backtick code spans',
      'keep ``code ``` literal ` and @active`` but remove @user-name',
      'keep ``code ``` literal ` and @active`` but remove `@user-name`',
    ],
    [
      'handles next to punctuation',
      'use (@active), @user-name and @thoth-agents/pi-core.',
      'use (`@active`), `@user-name` and `@thoth-agents/pi-core`.',
    ],
    [
      'emails and handles preceded by word characters',
      'contact a@b.com, first.last@example.com or prefix@active',
      'contact a@b.com, first.last@example.com or prefix@active',
    ],
    [
      'handles inside longer code spans',
      'keep `selector = @active` but remove @active',
      'keep `selector = @active` but remove `@active`',
    ],
  ])('renders %s safely in commit subjects', (_case, subject, expected) => {
    const notes = renderReleaseNotes(
      [
        {
          hash: 'abcdef0',
          subject: `feat: ${subject}`,
          author: undefined,
          files: ['src/core.ts'],
        },
      ],
      undefined,
      'HEAD',
    );

    expect(notes).toBe(
      `## Core\n### Improvements\n\n- \`abcdef0\` feat: ${expected}\n`,
    );
  });
});

describe('generate-release-notes with annotated tags', () => {
  let annotated: string;
  const ag = (...args: string[]) =>
    execFileSync('git', args, { cwd: annotated, encoding: 'utf8' });

  beforeAll(() => {
    annotated = mkdtempSync(join(tmpdir(), 'release-notes-annotated-'));
    ag('init', '-q');
    ag('config', 'user.email', 't@example.com');
    ag('config', 'user.name', 'Tester');
    ag('config', 'commit.gpgsign', 'false');
    ag('config', 'tag.gpgsign', 'false');
    const annotatedCommit = (subject: string) => {
      writeFileSync(
        join(annotated, 'f.txt'),
        `${subject}
${Math.random()}`,
      );
      ag('add', '-A');
      ag('commit', '-q', '-m', subject);
    };
    annotatedCommit('feat: base');
    ag('tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
    annotatedCommit('feat: next');
    ag('tag', '-a', '@thoth-agents/pi-todo@0.2.0', '-m', 'pi-todo');
    ag('tag', '-a', 'v1.1.0', '-m', 'v1.1.0');
  });

  afterAll(() => {
    rmSync(annotated, { recursive: true, force: true });
  });

  test('previous tag and package tags resolve through annotated tag objects', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', packageTags: '@thoth-agents/*' },
      { cwd: annotated, repository: 'acme/widgets', lookupAuthors: false },
    );

    expect(notes).toContain('Last release: v1.0.0');
    expect(notes).toContain('## Pi packages');
    expect(notes).toContain('@thoth-agents/pi-todo@0.2.0');
  });
});

describe('generate-release-notes with merge commits', () => {
  let previous: string;

  function merge(branch: string, subject: string, ...files: string[]): void {
    git('checkout', '-q', '-b', branch, 'main');
    commit(`fix: ${branch} work`, ...files.slice(0, 1));
    git('checkout', '-q', 'main');
    // Diverge main so the merge is a true merge commit.
    commit(`fix: ${branch} main side`, 'src/side.ts');
    git('merge', '--no-ff', '-q', '-m', subject, branch);
  }

  beforeAll(() => {
    previous = dir;
    dir = mkdtempSync(join(tmpdir(), 'release-notes-merge-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'Tester');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    commit('feat: root base', 'src/core.ts');
    git('tag', 'v1.0.0');
    merge('pi', 'feat: merge pi only', 'pi-packages/a/index.ts');
    merge('root', 'feat: merge root only', 'src/other.ts');
    git('checkout', '-q', '-b', 'mixed', 'main');
    commit('fix: mixed work', 'pi-packages/a/index.ts', 'src/core.ts');
    git('checkout', '-q', 'main');
    commit('fix: mixed main side', 'src/side.ts');
    git('merge', '--no-ff', '-q', '-m', 'feat: merge mixed', 'mixed');
    git('tag', 'v1.1.0');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    dir = previous;
  });

  test('--exclude-path drops Pi-only merges and keeps mixed merges', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', excludePath: 'pi-packages' },
      context(),
    );

    expect(notes).not.toContain('merge pi only');
    expect(notes).toContain('merge root only');
    expect(notes).toContain('merge mixed');
  });

  test('--path ignores merges that only bring in other directories', () => {
    const notes = generateReleaseNotes(
      { to: 'v1.1.0', path: 'pi-packages' },
      context(),
    );

    expect(notes).not.toContain('merge root only');
    expect(notes).not.toContain('root main side');
    expect(notes).toContain('pi work');
  });
});
