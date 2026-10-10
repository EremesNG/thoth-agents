import { sep } from 'node:path';
import { expect, it } from 'vitest';
import { formatCwd } from '../src/index.js';

it('abbreviates home using native separators without normalizing outside paths', () => {
  expect(formatCwd('/home/test/project/../src', '/home/test/')).toBe(
    `~${sep}src`,
  );
  expect(formatCwd('/home/test/', '/home/test')).toBe('~');
  expect(formatCwd('/home/test-other/src', '/home/test')).toBe(
    '/home/test-other/src',
  );
  expect(formatCwd('/home/test/../other', '/home/test')).toBe(
    '/home/test/../other',
  );
  expect(formatCwd('/home/test/..cache', '/home/test')).toBe(`~${sep}..cache`);
  expect(formatCwd('/work/a/../b')).toBe('/work/a/../b');
});

it.runIf(process.platform === 'win32')(
  'preserves Windows drive and separator behavior',
  () => {
    expect(formatCwd('c:/users/test/project', 'C:\\Users\\Test\\')).toBe(
      '~\\project',
    );
    expect(formatCwd('C:\\Users\\Test\\project', 'C:\\Users\\Test')).toBe(
      '~\\project',
    );
    expect(formatCwd('D:\\project', 'C:\\Users\\Test')).toBe('D:\\project');
  },
);
