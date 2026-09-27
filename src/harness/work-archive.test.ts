import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  fingerprintAcceptance,
  fingerprintPaths,
  fingerprintTechnical,
  fingerprintUnit,
  fingerprintWork,
  workEvidencePaths,
} from '../../skills/thoth-work/scripts/work.mjs';

const projects: string[] = [];
afterEach(() => {
  for (const project of projects.splice(0))
    rmSync(project, { recursive: true, force: true });
});
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');

function yaml(value: any, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === 'object'
          ? `${pad}-\n${yaml(item, indent + 2)}`
          : `${pad}- ${JSON.stringify(item)}\n`,
      )
      .join('');
  return Object.entries(value)
    .map(([key, item]) => {
      if (Array.isArray(item) && item.length === 0) return `${pad}${key}: []\n`;
      return item && typeof item === 'object'
        ? `${pad}${key}:\n${yaml(item, indent + 2)}`
        : `${pad}${key}: ${JSON.stringify(item)}\n`;
    })
    .join('');
}

function fixture(input = 'input.txt') {
  const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-archive-'));
  projects.push(projectRoot);
  const changeRoot = join(projectRoot, '.thoth/changes/example');
  const source = '.thoth/changes/example/context/capability.md';
  const evidence = '.thoth/changes/example/evidence/oracle.md';
  mkdirSync(join(changeRoot, 'context'), { recursive: true });
  mkdirSync(join(changeRoot, 'evidence'), { recursive: true });
  mkdirSync(join(projectRoot, '.thoth/specs/feature'), { recursive: true });
  mkdirSync(dirname(join(projectRoot, input)), { recursive: true });
  writeFileSync(join(projectRoot, input), 'input');
  writeFileSync(join(projectRoot, 'output.txt'), 'implementation');
  writeFileSync(
    join(projectRoot, '.thoth/specs/feature/spec.md'),
    'old contract\n',
  );
  writeFileSync(join(projectRoot, source), 'new contract\n');
  writeFileSync(
    join(projectRoot, evidence),
    'Independent Oracle PASS: actual agreement, diff and checks reviewed.\n',
  );
  const result = {
    status: 'accepted',
    evidenceFingerprint: fingerprintPaths({ projectRoot, paths: [evidence] })
      .fingerprint,
    reviewedBy: 'oracle',
    reviewedAt: '2026-09-26T12:00:00Z',
    evidence: [evidence],
    inputFingerprint: fingerprintPaths({ projectRoot, paths: [input] })
      .fingerprint,
    outputFingerprint: fingerprintPaths({ projectRoot, paths: ['output.txt'] })
      .fingerprint,
  };
  const work: any = {
    version: 1,
    change: { id: 'example' },
    agreement: {
      status: 'approved',
      fingerprint: 'pending',
      source: 'user approved implementation',
    },
    goal: 'Replace a declared durable contract after independent verification',
    bounds: { include: ['feature'], exclude: ['unrelated changes'] },
    autonomy: {
      allowed: ['implementation'],
      requiresApproval: ['new product scope'],
      forbidden: ['deployment'],
    },
    acceptance: [
      {
        id: 'A1',
        criterion: 'New behavior is verified',
        inputs: [input],
        outputs: ['output.txt'],
        checks: ['focused behavior test passes'],
        result: { ...result },
      },
    ],
    units: [
      {
        id: 'U1',
        output: 'Verified feature',
        dependsOn: [],
        reads: [input],
        writes: ['output.txt'],
        resources: [],
        owner: { role: 'worker' },
        checks: [{ id: 'C1', criterion: 'Public behavior passes' }],
        acceptance: ['A1'],
        baseline: { status: 'unknown' },
        semantic: { status: 'accepted', result: { ...result } },
      },
    ],
    durableUpdates: [
      {
        capability: 'feature',
        operation: 'replace',
        source,
        sourceDigest: digest('new contract\n'),
        expectedDigest: digest('old contract\n'),
      },
    ],
  };
  work.agreement.fingerprint = fingerprintWork(work);
  work.units[0].semantic.result.definitionFingerprint = fingerprintUnit(
    work.units[0],
  );
  work.acceptance[0].result.definitionFingerprint = fingerprintAcceptance(
    work.acceptance[0],
  );
  const paths = workEvidencePaths(work);
  work.verification = {
    reviewer: 'oracle',
    verdict: 'pass',
    agreementFingerprint: fingerprintWork(work),
    technicalFingerprint: fingerprintTechnical(work),
    evidence: [evidence],
    evidenceFingerprint: fingerprintPaths({ projectRoot, paths: [evidence] })
      .fingerprint,
    inputFingerprint: fingerprintPaths({ projectRoot, paths: paths.inputs })
      .fingerprint,
    outputFingerprint: fingerprintPaths({ projectRoot, paths: paths.outputs })
      .fingerprint,
  };
  const save = () => writeFileSync(join(changeRoot, 'work.yaml'), yaml(work));
  save();
  return { projectRoot, changeRoot, work, save };
}

function archive(projectRoot: string, fault?: string, preload?: string) {
  return spawnSync(
    process.execPath,
    [
      ...(preload ? ['--import', pathToFileURL(preload).href] : []),
      join(process.cwd(), 'skills/thoth-archive/scripts/archive.mjs'),
      '--project',
      projectRoot,
      '--change',
      '.thoth/changes/example',
      '--date',
      '2026-09-26',
      '--json',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(fault ? { THOTH_ARCHIVE_TEST_FAULT: fault } : {}),
      },
    },
  );
}

describe('verified work archive', () => {
  test.each([
    'add',
    'remove',
    'rename',
  ] as const)('applies a declared %s without changing unrelated capabilities', (operation) => {
    const { projectRoot, work, save } = fixture();
    const update = work.durableUpdates[0];
    update.operation = operation;
    if (operation === 'add') {
      update.capability = 'new-feature';
      delete update.expectedDigest;
    }
    if (operation === 'remove') {
      delete update.source;
      delete update.sourceDigest;
    }
    if (operation === 'rename') update.target = 'new-feature';
    work.agreement.fingerprint = fingerprintWork(work);
    work.verification.agreementFingerprint = fingerprintWork(work);
    const paths = workEvidencePaths(work);
    work.verification.outputFingerprint = fingerprintPaths({
      projectRoot,
      paths: paths.outputs,
    }).fingerprint;
    save();
    const result = archive(projectRoot);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(existsSync(join(projectRoot, '.thoth/specs/feature/spec.md'))).toBe(
      operation === 'add',
    );
    if (operation !== 'remove')
      expect(
        readFileSync(
          join(projectRoot, '.thoth/specs/new-feature/spec.md'),
          'utf8',
        ),
      ).toBe('new contract\n');
  });

  test('does not enter when another archive wins shared transaction admission', () => {
    const { projectRoot, changeRoot } = fixture();
    const transaction = join(projectRoot, '.thoth/.archive-transaction');
    const preload = join(projectRoot, 'concurrent-archive.mjs');
    writeFileSync(
      preload,
      `import fs from 'node:fs';\nimport {syncBuiltinESMExports} from 'node:module';\nconst mkdir = fs.mkdirSync; let injected = false;\nfs.mkdirSync = function(path, options) { if (!injected && path === ${JSON.stringify(transaction)}) { injected = true; mkdir.call(this, path); fs.writeFileSync(path + '/other-archive', 'owned by another archive'); } return mkdir.call(this, path, options); };\nsyncBuiltinESMExports();\n`,
    );
    const result = archive(projectRoot, undefined, preload);
    expect(result.status).toBe(1);
    expect(
      readFileSync(join(projectRoot, '.thoth/specs/feature/spec.md'), 'utf8'),
    ).toBe('old contract\n');
    expect(readFileSync(join(transaction, 'other-archive'), 'utf8')).toBe(
      'owned by another archive',
    );
    expect(existsSync(changeRoot)).toBe(true);
  });

  test('revalidates dependency evidence after acquiring the shared archive lock', () => {
    const { projectRoot, changeRoot } = fixture(
      '.thoth/specs/dependency/spec.md',
    );
    const transaction = join(projectRoot, '.thoth/.archive-transaction');
    const dependency = join(projectRoot, '.thoth/specs/dependency/spec.md');
    const preload = join(projectRoot, 'completed-competing-archive.mjs');
    writeFileSync(
      preload,
      `import fs from 'node:fs';\nimport {syncBuiltinESMExports} from 'node:module';\nconst mkdir = fs.mkdirSync; let injected = false;\nfs.mkdirSync = function(path, options) { if (!injected && path === ${JSON.stringify(transaction)}) { injected = true; fs.writeFileSync(${JSON.stringify(dependency)}, 'updated by a completed archive'); } return mkdir.call(this, path, options); };\nsyncBuiltinESMExports();\n`,
    );
    const result = archive(projectRoot, undefined, preload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/stale|fingerprint/i);
    expect(
      readFileSync(join(projectRoot, '.thoth/specs/feature/spec.md'), 'utf8'),
    ).toBe('old contract\n');
    expect(existsSync(changeRoot)).toBe(true);
    expect(existsSync(transaction)).toBe(false);
  });

  test('preserves an unmanaged edit made at the filesystem replacement boundary', () => {
    const { projectRoot, changeRoot } = fixture();
    const target = join(projectRoot, '.thoth/specs/feature/spec.md');
    const preload = join(projectRoot, 'concurrent-edit.mjs');
    writeFileSync(
      preload,
      `import fs from 'node:fs';\nimport {syncBuiltinESMExports} from 'node:module';\nconst rename = fs.renameSync; let injected = false;\nfs.renameSync = function(from, to) { if (!injected && (from === ${JSON.stringify(target)} || to === ${JSON.stringify(target)})) { injected = true; fs.writeFileSync(${JSON.stringify(target)}, 'concurrent user edit\\n'); } return rename.call(this, from, to); };\nsyncBuiltinESMExports();\n`,
    );
    const result = archive(projectRoot, undefined, preload);
    expect(result.status).toBe(1);
    expect(readFileSync(target, 'utf8')).toBe('concurrent user edit\n');
    expect(existsSync(changeRoot)).toBe(true);
  });

  test('applies only an approved durable replacement and preserves the complete change evidence', () => {
    const { projectRoot, changeRoot } = fixture();
    writeFileSync(
      join(projectRoot, '.thoth/specs/unrelated.md'),
      'unrelated\n',
    );
    const result = archive(projectRoot);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(
      readFileSync(join(projectRoot, '.thoth/specs/feature/spec.md'), 'utf8'),
    ).toBe('new contract\n');
    expect(
      readFileSync(join(projectRoot, '.thoth/specs/unrelated.md'), 'utf8'),
    ).toBe('unrelated\n');
    expect(existsSync(changeRoot)).toBe(false);
    expect(
      existsSync(
        join(
          projectRoot,
          '.thoth/changes/archive/2026-09-26-example/evidence/oracle.md',
        ),
      ),
    ).toBe(true);
  });

  test('rejects stale durable baselines and missing independent PASS without writes', () => {
    const { projectRoot, changeRoot, work, save } = fixture();
    writeFileSync(
      join(projectRoot, '.thoth/specs/feature/spec.md'),
      'user edit\n',
    );
    expect(archive(projectRoot).status).toBe(1);
    expect(
      readFileSync(join(projectRoot, '.thoth/specs/feature/spec.md'), 'utf8'),
    ).toBe('user edit\n');
    writeFileSync(
      join(projectRoot, '.thoth/specs/feature/spec.md'),
      'old contract\n',
    );
    delete work.verification;
    save();
    expect(archive(projectRoot).stderr).toMatch(/verification|Oracle PASS/i);
    expect(existsSync(changeRoot)).toBe(true);
    expect(
      readFileSync(join(projectRoot, '.thoth/specs/feature/spec.md'), 'utf8'),
    ).toBe('old contract\n');
  });

  test('rolls back applied durable files after a handled failure and permits a safe retry', () => {
    const { projectRoot, changeRoot } = fixture();
    const failed = archive(projectRoot, 'after-updates');
    expect(failed.stderr).toMatch(/Injected archive fault/);
    expect(existsSync(changeRoot)).toBe(true);
    expect(
      readFileSync(join(projectRoot, '.thoth/specs/feature/spec.md'), 'utf8'),
    ).toBe('old contract\n');
    expect(existsSync(join(projectRoot, '.thoth/.archive-transaction'))).toBe(
      false,
    );
    expect(archive(projectRoot).status).toBe(0);
  });

  test('retains and reports an interrupted transaction instead of replaying it blindly', () => {
    const { projectRoot, changeRoot } = fixture();
    mkdirSync(join(projectRoot, '.thoth/.archive-example'));
    writeFileSync(
      join(projectRoot, '.thoth/.archive-example/recovery.json'),
      'retained backup',
    );
    const result = archive(projectRoot);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unfinished archive transaction/);
    expect(existsSync(changeRoot)).toBe(true);
    expect(
      readFileSync(
        join(projectRoot, '.thoth/.archive-example/recovery.json'),
        'utf8',
      ),
    ).toBe('retained backup');
  });
});
