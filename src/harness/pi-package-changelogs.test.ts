import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { discoverPiPackages } from '../../scripts/release-pi.mjs';

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

describe('Pi package changelogs', () => {
  test.each(
    discoverPiPackages(),
  )('$directory only announces released versions at or below its package version', ({
    dir,
    version,
  }) => {
    const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
    // Match Pi's update reader, including upstream's unbracketed headings.
    const releases = Array.from(
      changelog.matchAll(/##\s+\[?(\d+)\.(\d+)\.(\d+)\]?/g),
      ([, major, minor, patch]) => `${major}.${minor}.${patch}`,
    );
    expect(
      releases.filter((release) => compareVersions(release, version) > 0),
      'Future headings repeat on every Pi launch: last-seen is package.json version',
    ).toEqual([]);
    expect(changelog).toContain('## [Unreleased]');
    expect(releases[0]).toBe(version);
  });
});
