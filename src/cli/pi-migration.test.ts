import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { PI_ROOT_END, PI_ROOT_START } from '../harness/writers/pi-agent';
import { migrateLegacyPiResources } from './pi-migration';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-pi-migration-'));
  roots.push(root);
  const packageRoot = join(root, 'package');
  const piRoot = join(root, 'pi');
  mkdirSync(join(packageRoot, 'skills', 'thoth-init'), { recursive: true });
  writeFileSync(join(packageRoot, 'skills', 'thoth-init', 'SKILL.md'), 'owned');
  mkdirSync(join(piRoot, 'skills'), { recursive: true });
  cpSync(
    join(packageRoot, 'skills', 'thoth-init'),
    join(piRoot, 'skills', 'thoth-init'),
    { recursive: true },
  );
  writeFileSync(
    join(piRoot, 'APPEND_SYSTEM.md'),
    `user\n${PI_ROOT_START}\nlegacy\n${PI_ROOT_END}\ntail\n`,
  );
  return { packageRoot, piRoot };
}
describe('legacy Pi migration', () => {
  test('removes only exact root block and exact copied skills while retaining backups', () => {
    const options = fixture();
    const result = migrateLegacyPiResources(options);
    expect(result.success).toBe(true);
    expect(readFileSync(join(options.piRoot, 'APPEND_SYSTEM.md'), 'utf8')).toBe(
      'user\ntail\n',
    );
    expect(existsSync(join(options.piRoot, 'skills', 'thoth-init'))).toBe(
      false,
    );
    expect(
      existsSync(
        join(options.piRoot, 'skills', 'thoth-init.thoth-agents-legacy.bak'),
      ),
    ).toBe(true);
  });
  test('preserves modified skill content and reports manual action', () => {
    const options = fixture();
    writeFileSync(
      join(options.piRoot, 'skills', 'thoth-init', 'SKILL.md'),
      'modified',
    );
    const result = migrateLegacyPiResources(options);
    expect(result.manualActions).toEqual([
      expect.stringContaining('thoth-init'),
    ]);
    expect(existsSync(join(options.piRoot, 'skills', 'thoth-init'))).toBe(true);
  });
});
