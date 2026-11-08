import { describe, expect, it } from 'vitest';
import { countActionMatches, matchAction } from './wildcard.js';

describe('OpenCode wildcard semantics', () => {
  it.each([
    ['server/path/tool', 'server*', 'linux', true],
    ['read', 'rea?', 'linux', true],
    ['reads', 'rea?', 'linux', false],
    ['xread', 'read', 'linux', false],
    ['a.+^$}{()|[]', 'a.+^$}{()|[]', 'linux', true],
    ['abc', 'a.+', 'linux', false],
    ['C:\\Tools\\Read', 'c:/tools/*', 'win32', true],
    ['READ', 'read', 'linux', false],
    ['git', 'git *', 'linux', true],
    ['git status', 'git *', 'linux', true],
    ['gitx', 'git *', 'linux', false],
    ['a\nb', 'a?b', 'linux', true],
  ] as const)('%s matches %s on %s: %s', (input, pattern, platform, expected) => {
    expect(matchAction(input, pattern, platform)).toBe(expected);
  });

  it('counts registered actions matching a manual pattern', () => {
    expect(countActionMatches('mcp_*', ['read', 'mcp_a', 'mcp_b'])).toBe(2);
    expect(countActionMatches('offline_*', ['read'])).toBe(0);
  });
});
