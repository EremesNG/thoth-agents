import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('plugin runtime compatibility', () => {
  test('built plugin does not require a host global Bun object', () => {
    const source = readFileSync('dist/index.js', 'utf8');

    expect(source).not.toContain('globalThis.Bun');
    expect(source).not.toMatch(/{[^}]*spawn[^}]*}\s*=\s*globalThis\.Bun/);
    expect(source).not.toContain('import.meta.require');
  });
});
