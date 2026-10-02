import { describe, expect, it } from 'vitest';
import { iconFor, iconForFile } from '../src/shared/icons.ts';

describe('iconFor', () => {
  it.each([
    ['file', '[file]'],
    ['folder', '[dir]'],
    ['read', '[read]'],
    ['write', '[write]'],
    ['edit', '[edit]'],
    ['bash', '$'],
    ['search', '?'],
    ['git', 'git'],
    ['model', 'model'],
    ['context', 'ctx'],
    ['cost', '$'],
    ['ok', '+'],
    ['error', '!'],
  ] as const)('resolves %s in Nerd Font and ASCII modes', (name, ascii) => {
    expect(iconFor(name, 'ascii')).toBe(ascii);
    expect(
      [...iconFor(name, 'nerd')].some(
        (char) => (char.codePointAt(0) ?? 0) > 127,
      ),
    ).toBe(true);
  });
});

describe('iconForFile', () => {
  it.each([
    ['main.ts', '[ts]', '\ue628'],
    ['C:\\project\\main.JS', '[js]', '\ue74e'],
    ['config.json', '{ }', '\ue60b'],
    ['/docs/README.md', '[md]', '\ue609'],
    ['script.py', '[py]', '\ue606'],
    ['install.sh', '$', '\uf489'],
  ])('recognizes the common extension in %s', (file, ascii, nerd) => {
    expect(iconForFile(file, 'ascii')).toBe(ascii);
    expect(iconForFile(file, 'nerd')).toBe(nerd);
  });

  it.each([
    'LICENSE',
    '.gitignore',
    'archive.unknown',
  ])('falls back to the generic file icon for %s', (file) => {
    expect(iconForFile(file, 'ascii')).toBe('[file]');
    expect(iconForFile(file, 'nerd')).toBe('\uf15b');
  });
});
