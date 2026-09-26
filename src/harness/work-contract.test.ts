import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  fingerprintWork,
  loadWork,
  validateWork,
} from '../../skills/thoth-work/scripts/work.mjs';

function fixture(units = VALID_UNIT) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-contract-'));
  const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
  mkdirSync(changeRoot, { recursive: true });
  const initial = VALID_WORK.replace('UNITS', units);
  writeFileSync(join(changeRoot, 'work.yaml'), initial);
  const loaded = loadWork({ projectRoot, changeRoot });
  writeFileSync(
    join(changeRoot, 'work.yaml'),
    initial.replace('PENDING', fingerprintWork(loaded.work)),
  );
  return { projectRoot, changeRoot };
}

const VALID_UNIT = `units:
  - id: implementation
    output: Implement the public contract
    dependsOn: []
    reads:
      - src/input.ts
    writes:
      - src/output.ts
    resources: []
    owner:
      role: deep
    checks:
      - id: focused-test
        criterion: Focused behavior passes
        command: pnpm exec vitest run src/output.test.ts
    acceptance:
      - AC-1
    baseline:
      status: unknown
    semantic:
      status: pending`;

const VALID_WORK = `version: 1
change:
  id: example
agreement:
  status: approved
  fingerprint: PENDING
  source: user
goal: Deliver a persisted work contract
bounds:
  include:
    - skills/thoth-work/**
  exclude:
    - runtime scheduling
autonomy:
  allowed:
    - edit assigned files
  requiresApproval:
    - destructive actions
  forbidden:
    - network access
acceptance:
  - id: AC-1
    criterion: The contract validates offline
    inputs:
      - src/input.ts
    outputs:
      - src/output.ts
    checks:
      - public validation returns success
UNITS
`;

describe('persisted work contract', () => {
  test('loads and validates an approved inline-unit contract at the ready gate', () => {
    const { projectRoot, changeRoot } = fixture();
    const result = validateWork({ projectRoot, changeRoot, through: 'ready' });

    expect(result.ok).toBe(true);
    expect(result.work?.units.map((unit: { id: string }) => unit.id)).toEqual([
      'implementation',
    ]);
    expect(result.fingerprints?.agreement).toMatch(/^sha256:[a-f0-9]{64}$/);

    const cli = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'skills', 'thoth-work', 'scripts', 'work.mjs'),
        'validate',
        '--project',
        projectRoot,
        '--id',
        'example',
        '--through',
        'ready',
      ],
      { encoding: 'utf8' },
    );
    expect(cli.stderr).toBe('');
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout)).toMatchObject({ ok: true });
  });

  test('loads external units while rejecting unsafe, duplicate, and cyclic contracts', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-contract-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    mkdirSync(join(changeRoot, 'units'), { recursive: true });
    writeFileSync(
      join(changeRoot, 'units', 'implementation.yaml'),
      VALID_UNIT.replace('units:\n  - ', '').replace(/^ {4}/gm, ''),
    );
    const external = VALID_WORK.replace(
      'UNITS',
      `unitRefs:
  - .thoth/changes/example/units/implementation.yaml`,
    );
    writeFileSync(join(changeRoot, 'work.yaml'), external);
    const loaded = loadWork({ projectRoot, changeRoot });
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      external.replace('PENDING', fingerprintWork(loaded.work)),
    );
    const externalResult = validateWork({
      projectRoot,
      changeRoot,
      through: 'ready',
    });
    expect(externalResult.ok, JSON.stringify(externalResult.errors)).toBe(true);

    writeFileSync(
      join(changeRoot, 'work.yaml'),
      VALID_WORK.replace('PENDING', 'sha256:invalid')
        .replace('UNITS', VALID_UNIT)
        .replace('goal: Deliver', 'goal: First\ngoal: Deliver'),
    );
    expect(() => loadWork({ projectRoot, changeRoot })).toThrow(/duplicate/i);

    writeFileSync(
      join(changeRoot, 'work.yaml'),
      VALID_WORK.replace('PENDING', 'sha256:invalid')
        .replace('UNITS', VALID_UNIT)
        .replace(
          'goal: Deliver a persisted work contract',
          'goal: &shared forbidden',
        ),
    );
    expect(() => loadWork({ projectRoot, changeRoot })).toThrow(/forbidden/i);

    const unknown = fixture(`${VALID_UNIT}`);
    const unknownPath = join(unknown.changeRoot, 'work.yaml');
    const unknownText = readFileSync(unknownPath, 'utf8').replace(
      'goal: Deliver a persisted work contract',
      'goal: Deliver a persisted work contract\nscheduler: forbidden',
    );
    writeFileSync(unknownPath, unknownText);
    expect(validateWork({ ...unknown, through: 'ready' }).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORK-UNKNOWN-KEY' }),
      ]),
    );

    writeFileSync(
      join(changeRoot, 'work.yaml'),
      VALID_WORK.replace(
        'UNITS',
        `unitRefs:
  - ../outside.yaml`,
      ),
    );
    expect(() => loadWork({ projectRoot, changeRoot })).toThrow(
      /safe relative path/i,
    );

    const cyclic = fixture(
      `${VALID_UNIT}
  - id: second
    output: Second output
    dependsOn:
      - implementation
    reads: []
    writes:
      - src/second.ts
    resources: []
    owner:
      role: quick
    checks:
      - id: second-check
        criterion: Second behavior passes
    acceptance:
      - AC-1
    baseline:
      status: unknown
    semantic:
      status: pending`.replace('dependsOn: []', 'dependsOn:\n      - second'),
    );
    expect(validateWork({ ...cyclic, through: 'ready' }).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORK-UNIT-CYCLE' }),
      ]),
    );
  });

  test('rejects unknown nested keys and invalid nested baseline types', () => {
    const unknownBounds = fixture();
    const unknownBoundsPath = join(unknownBounds.changeRoot, 'work.yaml');
    writeFileSync(
      unknownBoundsPath,
      readFileSync(unknownBoundsPath, 'utf8').replace(
        'bounds:\n',
        'bounds:\n  surprise: forbidden\n',
      ),
    );
    expect(validateWork({ ...unknownBounds, through: 'ready' }).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'WORK-UNKNOWN-KEY',
          path: 'bounds',
        }),
      ]),
    );

    const invalidBaseline = fixture(
      VALID_UNIT.replace(
        'baseline:\n      status: unknown',
        'baseline:\n      status: unknown\n      paths: invalid',
      ),
    );
    expect(
      validateWork({ ...invalidBaseline, through: 'ready' }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORK-BASELINE' }),
      ]),
    );
  });
});
