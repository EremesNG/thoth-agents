import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateResult } from '../../../skills/thoth-sdd/scripts/validate-result.mjs';

const digest = 'a'.repeat(64);
function fixture(role = 'explorer'): any {
  const result: any = {
    schemaVersion: 1,
    role,
    status: 'complete',
    conclusion: 'Scoped outcome',
    evidence: [
      {
        id: 'e1',
        kind: 'file',
        locator: 'src/example.ts:1',
        claim: 'Observed fact',
        basis: 'observed',
        uncertainty: 'none',
      },
    ],
    verification: [
      {
        check: 'focused test',
        method: 'vitest',
        outcome: 'pass',
        evidenceIds: ['e1'],
        reason: 'passed',
      },
    ],
    risks: [],
    openQuestions: [],
  };
  if (role === 'worker' || role === 'designer')
    Object.assign(result, {
      changedFiles: [{ path: 'src/example.ts', change: 'modified' }],
      nextAction: null,
    });
  if (role === 'oracle')
    Object.assign(result, {
      nextAction: null,
      review: { kind: 'plan-review', verdict: 'OKAY' },
    });
  return result;
}
const fence = (value: unknown) =>
  `\`\`\`thoth-result\n${JSON.stringify(value)}\n\`\`\``;
const codes = (message: string, options = {}) =>
  validateResult(message, options).issues.map((i) => i.code);

describe('specialist result validation', () => {
  it.each([
    'explorer',
    'librarian',
    'oracle',
    'designer',
    'worker',
  ])('accepts a complete %s fixture', (role) => {
    const result = fixture(role);
    expect(validateResult(`\n ${fence(result)} \n`, { role })).toEqual({
      valid: true,
      envelope: result,
      issues: [],
    });
  });
});

describe.each(['worker', 'designer'])('%s changed file records', (role) => {
  it.each([
    'added',
    'modified',
    'deleted',
    'renamed',
  ])('accepts %s records', (change) => {
    const result = fixture(role);
    result.changedFiles = [
      {
        path: 'new.ts',
        change,
        ...(change === 'renamed' ? { previousPath: 'old.ts' } : {}),
      },
    ];
    expect(validateResult(fence(result)).valid).toBe(true);
    result.changedFiles = [];
    expect(validateResult(fence(result)).valid).toBe(true);
  });
  it.each([
    [{ path: 'new.ts', change: 'renamed' }],
    ...['added', 'modified', 'deleted'].map((change) => [
      { path: 'new.ts', change, previousPath: 'old.ts' },
    ]),
  ])('requires previousPath iff renamed: %j', (entry) => {
    const result = fixture(role);
    result.changedFiles = [entry];
    expect(validateResult(fence(result)).issues).toContainEqual(
      expect.objectContaining({
        code: 'CHANGED_FILE_RENAME',
        path: '/changedFiles/0/previousPath',
      }),
    );
  });
  it.each([
    ['legacy.ts', 'TYPE_MISMATCH', ''],
    [{ path: '', change: 'modified' }, 'INVALID_VALUE', '/path'],
    [{ change: 'modified' }, 'REQUIRED_FIELD', '/path'],
    [{ path: 'file.ts' }, 'REQUIRED_FIELD', '/change'],
    [{ path: 'file.ts', change: 'unknown' }, 'INVALID_VALUE', '/change'],
    [
      { path: 'file.ts', change: 'modified', extra: true },
      'UNDECLARED_FIELD',
      '/extra',
    ],
    [
      { path: 'file.ts', change: 'renamed', previousPath: null },
      'TYPE_MISMATCH',
      '/previousPath',
    ],
  ])('rejects malformed record %j', (entry, code, suffix) => {
    const result = fixture(role);
    result.changedFiles = [entry];
    expect(validateResult(fence(result)).issues).toContainEqual(
      expect.objectContaining({ code, path: `/changedFiles/0${suffix}` }),
    );
  });
});

describe('strict envelopes and contract rejection', () => {
  it('rejects an object role without throwing during role discrimination', () => {
    const result = fixture();
    result.role = {};
    expect(codes(fence(result))).toContain('TYPE_MISMATCH');
  });
  it.each([
    'explorer',
    'librarian',
    'oracle',
    'designer',
    'worker',
  ])('rejects invalid %s fixtures', (role) => {
    const result = fixture(role);
    delete result.evidence;
    expect(codes(fence(result))).toContain('REQUIRED_FIELD');
    result.evidence = [];
    result.verdict = 'PASS';
    expect(validateResult(fence(result)).issues).toContainEqual(
      expect.objectContaining({ code: 'UNDECLARED_FIELD', path: '/verdict' }),
    );
  });
  it.each([
    '',
    'no block',
    '```thoth-result\n{}',
    '```json\n{}\n```',
    `${fence(fixture())}\n${fence(fixture())}`,
    `prose\n${fence(fixture())}`,
    `${fence(fixture())}\nprose`,
  ])('rejects malformed fences: %s', (message) => {
    expect(codes(message)).toContain('ENVELOPE_FORMAT');
  });
  it.each([
    '{"a":1,"a":2}',
    String.raw`{"a":1,"\u0061":2}`,
    '{"nested":{"a":1,"a":2}}',
    String.raw`{"nested":[{"a":1,"\u0061":2}]}`,
  ])('rejects duplicate keys: %s', (json) => {
    expect(codes(`\`\`\`thoth-result\n${json}\n\`\`\``)).toEqual([
      'JSON_DUPLICATE_KEY',
    ]);
  });
  it('uses escaped JSON pointer paths for duplicates', () => {
    expect(
      validateResult('```thoth-result\n{"a/~":1,"a/~":2}\n```').issues[0].path,
    ).toBe('/a~1~0');
  });
  it.each([
    '{"a":}',
    '{"a":1,}',
    '[1,]',
    '{}{}',
    '{"a":01}',
    '{"a":NaN}',
    '{"a":1e999}',
    String.raw`{"a":"\x"}`,
    '{"a":"\n"}',
    '{"a":undefined}',
  ])('rejects invalid JSON: %s', (json) => {
    expect(codes(`\`\`\`thoth-result\n${json}\n\`\`\``)).toEqual([
      'JSON_SYNTAX',
    ]);
  });
  it('rejects oversized nesting without crashing', () => {
    expect(
      codes(
        `\`\`\`thoth-result\n${'['.repeat(300)}0${']'.repeat(300)}\n\`\`\``,
      ),
    ).toEqual(['JSON_SYNTAX']);
  });
  it.each([
    null,
    [],
    'string',
    1,
  ])('requires an object envelope: %j', (value) => {
    expect(codes(fence(value))).toContain('TYPE_MISMATCH');
  });
  it.each([
    'evidence',
    'verification',
    'risks',
    'openQuestions',
  ])('requires %s to be an array', (field) => {
    const result = fixture();
    result[field] = null;
    expect(codes(fence(result))).toContain('TYPE_MISMATCH');
  });
  it('checks nested fields, enums, and undeclared prototype-named keys', () => {
    const result = fixture();
    result.evidence[0].basis = 'guess';
    expect(codes(fence(result))).toContain('INVALID_VALUE');
    result.evidence[0].basis = 'inferred';
    result.evidence[0].constructor = 'not allowed';
    expect(codes(fence(result))).toContain('UNDECLARED_FIELD');
    expect(
      codes(fence(result).replace('"constructor"', '"__proto__"')),
    ).toContain('UNDECLARED_FIELD');
  });
  it('rejects missing extensions and forbidden explorer nextAction', () => {
    const worker = fixture('worker');
    delete worker.changedFiles;
    expect(codes(fence(worker))).toContain('REQUIRED_FIELD');
    const explorer = fixture();
    explorer.nextAction = null;
    expect(codes(fence(explorer))).toContain('UNDECLARED_FIELD');
  });
  it('checks assignment role and review kind', () => {
    expect(codes(fence(fixture()), { role: 'worker' })).toContain(
      'ROLE_MISMATCH',
    );
    expect(
      codes(fence(fixture('oracle')), { reviewKind: 'diagnosis' }),
    ).toContain('REVIEW_KIND_MISMATCH');
    expect(codes(fence(fixture()), { reviewKind: 'plan-review' })).toContain(
      'REVIEW_KIND_MISMATCH',
    );
  });
  it('checks evidence id uniqueness and references in checks and risks', () => {
    const result = fixture();
    result.evidence.push({ ...result.evidence[0] });
    result.verification[0].evidenceIds = ['missing'];
    result.risks = [
      {
        description: 'risk',
        severity: 'high',
        blocking: true,
        evidenceIds: ['missing'],
      },
    ];
    expect(codes(fence(result))).toEqual([
      'EVIDENCE_ID_DUPLICATE',
      'EVIDENCE_REFERENCE',
      'EVIDENCE_REFERENCE',
    ]);
  });
  it.each([
    ['plan-review', 'OKAY'],
    ['plan-review', 'REJECT'],
    ['final-verification', 'PASS'],
    ['final-verification', 'FAIL'],
    ['final-verification', 'BLOCKED'],
    ['diagnosis', null],
    ['advice', null],
  ])('accepts %s verdict %s', (kind, verdict) => {
    const result = fixture('oracle');
    result.review = { kind, verdict };
    expect(validateResult(fence(result)).valid).toBe(true);
  });
  it.each([
    ['plan-review', 'PASS'],
    ['final-verification', 'OKAY'],
    ['diagnosis', 'OKAY'],
    ['advice', 'PASS'],
    ['plan-review', null],
  ])('rejects %s verdict %s', (kind, verdict) => {
    const result = fixture('oracle');
    result.review = { kind, verdict };
    expect(codes(fence(result))).toContain('VERDICT_MISMATCH');
  });
  it.each([
    'partial',
    'blocked',
    'failed',
  ])('rejects positive verdict with %s status or blocking risk', (status) => {
    const result = fixture('oracle');
    result.status = status;
    result.risks = [
      {
        description: 'risk',
        severity: 'critical',
        blocking: true,
        evidenceIds: ['e1'],
      },
    ];
    expect(codes(fence(result))).toEqual(['VERDICT_STATUS', 'BLOCKING_RISK']);
  });
  it('accepts nonpositive and null verdicts with blocked status and blocking risks', () => {
    for (const [kind, verdict] of [
      ['plan-review', 'REJECT'],
      ['final-verification', 'BLOCKED'],
      ['diagnosis', null],
    ]) {
      const result = fixture('oracle');
      result.status = 'blocked';
      result.review = { kind, verdict };
      result.risks = [
        {
          description: 'risk',
          severity: 'medium',
          blocking: true,
          evidenceIds: [],
        },
      ];
      expect(validateResult(fence(result)).valid).toBe(true);
    }
  });
  it('binds final verification to an assigned record digest', () => {
    const result = fixture('oracle');
    result.review = { kind: 'final-verification', verdict: 'PASS' };
    expect(codes(fence(result), { recordSha256: digest })).toEqual([
      'RECORD_BINDING_REQUIRED',
      'RECORD_BINDING_REQUIRED',
    ]);
    Object.assign(result.review, {
      reviewedRecord: '.thoth/changes/change.md',
      reviewedRecordSha256: digest,
    });
    expect(validateResult(fence(result), { recordSha256: digest }).valid).toBe(
      true,
    );
    expect(codes(fence(result), { recordSha256: 'b'.repeat(64) })).toEqual([
      'RECORD_DIGEST_MISMATCH',
    ]);
    result.review.reviewedRecordSha256 = 'bad';
    expect(codes(fence(result))).toContain('INVALID_VALUE');
    expect(codes(fence(fixture()), { recordSha256: digest })).toContain(
      'REVIEW_KIND_MISMATCH',
    );
  });
});

const canonicalScript = resolve('skills/thoth-sdd/scripts/validate-result.mjs');
function cli(
  args: string[],
  input: string,
  script = canonicalScript,
  cwd?: string,
) {
  const result = spawnSync(process.execPath, [script, ...args], {
    input,
    encoding: 'utf8',
    timeout: 10000,
    cwd,
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  return { status: result.status, output: JSON.parse(result.stdout) };
}

describe('installed validator CLI', () => {
  it('ships identical validator and contract assets and runs from the plugin outside the source tree', () => {
    for (const name of ['validate-result.mjs', 'result-contract.json']) {
      expect(readFileSync(`plugin/skills/thoth-sdd/scripts/${name}`)).toEqual(
        readFileSync(`skills/thoth-sdd/scripts/${name}`),
      );
    }
    const dir = mkdtempSync(join(tmpdir(), 'thoth-installed-'));
    try {
      expect(
        cli(
          ['--role', 'worker'],
          fence(fixture('worker')),
          resolve('plugin/skills/thoth-sdd/scripts/validate-result.mjs'),
          dir,
        ).status,
      ).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('validates stdin and reports invalid input using exits 0 and 1', () => {
    expect(cli(['--role', 'worker'], fence(fixture('worker'))).status).toBe(0);
    expect(cli([], 'missing')).toEqual({
      status: 1,
      output: {
        valid: false,
        issues: [expect.objectContaining({ code: 'ENVELOPE_FORMAT' })],
      },
    });
    const result = fixture('oracle');
    result.review = {
      kind: 'final-verification',
      verdict: 'PASS',
      reviewedRecord: 'record.md',
      reviewedRecordSha256: digest,
    };
    expect(
      cli(
        [
          '--role',
          'oracle',
          '--review-kind',
          'final-verification',
          '--record-sha256',
          digest,
        ],
        fence(result),
      ).status,
    ).toBe(0);
    expect(cli(['--role', 'worker'], fence(fixture())).status).toBe(1);
  });
  it.each([
    ['--bogus'],
    ['--role'],
    ['--role', 'root'],
    ['--review-kind', 'unknown'],
    ['--record-sha256', 'bad'],
    ['--role', 'worker', '--role', 'worker'],
  ])('uses exit 2 for usage errors: %j', (args) => {
    expect(cli(args, '').status).toBe(2);
  });
  it('reads --input with valid, invalid, and unreadable paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-result-'));
    try {
      const path = join(dir, 'result.txt');
      writeFileSync(path, fence(fixture()));
      expect(cli(['--input', path], 'ignored').status).toBe(0);
      writeFileSync(path, 'bad');
      expect(cli(['--input', path], '').status).toBe(1);
      expect(cli(['--input', join(dir, 'absent')], '').status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
