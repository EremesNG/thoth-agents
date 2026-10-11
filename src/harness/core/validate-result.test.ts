import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateResult } from '../../../skills/thoth-sdd/scripts/validate-result.mjs';

const digest = 'a'.repeat(64);
function fixture(role = 'oracle'): any {
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

describe('Oracle gate result validation', () => {
  it('accepts an Oracle plan review with or without an expected role', () => {
    const result = fixture();
    for (const options of [{}, { role: 'oracle' as const }])
      expect(validateResult(`\n ${fence(result)} \n`, options)).toEqual({
        valid: true,
        envelope: result,
        issues: [],
      });
  });
  it.each([
    'explorer',
    'librarian',
    'designer',
    'worker',
  ])('rejects nongate role %s', (role) => {
    expect(codes(fence(fixture(role)))).toContain('INVALID_VALUE');
    expect(codes(fence(fixture()), { role })).toEqual(['EXPECTATION_INVALID']);
  });
  it.each(['diagnosis', 'advice'])('rejects nongate review kind %s', (kind) => {
    const result = fixture();
    result.review = { kind, verdict: null };
    expect(codes(fence(result))).toContain('INVALID_VALUE');
    expect(codes(fence(fixture()), { reviewKind: kind })).toEqual([
      'EXPECTATION_INVALID',
    ]);
  });
});

describe('strict envelopes and contract rejection', () => {
  it('rejects an object role without throwing during role discrimination', () => {
    const result = fixture();
    result.role = {};
    expect(codes(fence(result))).toContain('TYPE_MISMATCH');
  });
  it('rejects missing common fields and undeclared fields', () => {
    const result = fixture();
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
  it('requires Oracle extensions and forbids changedFiles', () => {
    for (const key of ['nextAction', 'review']) {
      const result = fixture();
      delete result[key];
      expect(codes(fence(result))).toContain('REQUIRED_FIELD');
    }
    const result = fixture();
    result.changedFiles = [];
    expect(codes(fence(result))).toContain('UNDECLARED_FIELD');
  });
  it('checks assignment review kind', () => {
    expect(
      codes(fence(fixture()), { reviewKind: 'final-verification' }),
    ).toContain('REVIEW_KIND_MISMATCH');
  });
  it('checks evidence id uniqueness and references in checks and risks', () => {
    const result = fixture();
    result.review.verdict = 'REJECT';
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
  ])('accepts %s verdict %s', (kind, verdict) => {
    const result = fixture('oracle');
    result.review = {
      kind,
      verdict,
      ...(kind === 'final-verification'
        ? { reviewedRecord: 'record.md', reviewedRecordSha256: digest }
        : {}),
    };
    expect(validateResult(fence(result)).valid).toBe(true);
  });
  it.each([
    ['plan-review', 'PASS'],
    ['final-verification', 'OKAY'],
  ])('rejects %s verdict %s', (kind, verdict) => {
    const result = fixture('oracle');
    result.review = {
      kind,
      verdict,
      ...(kind === 'final-verification'
        ? { reviewedRecord: 'record.md', reviewedRecordSha256: digest }
        : {}),
    };
    expect(codes(fence(result))).toContain('VERDICT_MISMATCH');
  });
  it('rejects null verdicts', () => {
    const result = fixture();
    result.review.verdict = null;
    expect(codes(fence(result))).toContain('TYPE_MISMATCH');
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
  it('accepts nonpositive verdicts with blocked status and blocking risks', () => {
    for (const [kind, verdict] of [
      ['plan-review', 'REJECT'],
      ['final-verification', 'BLOCKED'],
    ]) {
      const result = fixture('oracle');
      result.status = 'blocked';
      result.review = {
        kind,
        verdict,
        ...(kind === 'final-verification'
          ? { reviewedRecord: 'record.md', reviewedRecordSha256: digest }
          : {}),
      };
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
  it.each([
    'PASS',
    'FAIL',
    'BLOCKED',
  ])('requires both record binding fields for %s without an expected digest', (verdict) => {
    for (const missing of ['reviewedRecord', 'reviewedRecordSha256']) {
      const result = fixture();
      result.review = {
        kind: 'final-verification',
        verdict,
        reviewedRecord: 'record.md',
        reviewedRecordSha256: digest,
      };
      delete result.review[missing];
      expect(validateResult(fence(result)).issues).toEqual([
        expect.objectContaining({
          code: 'RECORD_BINDING_REQUIRED',
          path: `/review/${missing}`,
        }),
      ]);
    }
  });
  it('binds final verification to an assigned record digest', () => {
    const result = fixture('oracle');
    result.review = { kind: 'final-verification', verdict: 'PASS' };
    expect(codes(fence(result))).toEqual([
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

describe('canonical validator CLI', () => {
  it('validates stdin and reports invalid input using exits 0 and 1', () => {
    expect(cli(['--role', 'oracle'], fence(fixture())).status).toBe(0);
    expect(cli([], fence(fixture())).status).toBe(0);
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
    expect(cli([], fence(fixture('worker'))).status).toBe(1);
  });
  it.each([
    ['--bogus'],
    ['--role'],
    ['--role', 'root'],
    ...['explorer', 'librarian', 'designer', 'worker'].map((role) => [
      '--role',
      role,
    ]),
    ...['diagnosis', 'advice'].map((kind) => ['--review-kind', kind]),
    ['--review-kind', 'unknown'],
    ['--record-sha256', 'bad'],
    ['--role', 'oracle', '--role', 'oracle'],
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

describe('installed validator assets', () => {
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
          ['--role', 'oracle'],
          fence(fixture()),
          resolve('plugin/skills/thoth-sdd/scripts/validate-result.mjs'),
          dir,
        ).status,
      ).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
