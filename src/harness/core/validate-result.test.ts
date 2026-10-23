import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  formatGateVerdict,
  summarizeGateResult,
  validateResult,
} from '../../../skills/thoth-sdd/scripts/validate-result.mjs';

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

describe('compact gate summaries', () => {
  it('summarizes a plan review without echoing its evidence or conclusion', () => {
    expect(summarizeGateResult(fence(fixture()))).toEqual({
      valid: true,
      role: 'oracle',
      kind: 'plan-review',
      verdict: 'OKAY',
      mode: 'record',
      record: null,
      recordSha256: null,
      recordDigest: 'none',
      issues: [],
    });
  });
  it('infers no-record mode only when neither final-verification binding is present', () => {
    const result = fixture();
    result.review = { kind: 'final-verification', verdict: 'PASS' };
    expect(summarizeGateResult(fence(result))).toMatchObject({
      valid: true,
      mode: 'no-record',
      recordDigest: 'none',
      issues: [],
    });
    for (const binding of [
      { reviewedRecord: 'record.md' },
      { reviewedRecordSha256: digest },
    ]) {
      result.review = {
        kind: 'final-verification',
        verdict: 'PASS',
        ...binding,
      };
      expect(summarizeGateResult(fence(result))).toMatchObject({
        valid: false,
        mode: 'record',
        issues: [
          {
            code: 'RECORD_BINDING_REQUIRED',
            path: `/review/${'reviewedRecord' in binding ? 'reviewedRecordSha256' : 'reviewedRecord'}`,
          },
        ],
      });
    }
  });

  it('reports safely readable fields and code/path issues even for invalid envelopes', () => {
    const result = fixture('worker');
    result.review = {
      kind: 'final-verification',
      verdict: 'PASS',
      reviewedRecord: 'record.md',
      reviewedRecordSha256: digest,
    };
    expect(summarizeGateResult(fence(result))).toMatchObject({
      valid: false,
      role: 'worker',
      kind: 'final-verification',
      verdict: 'PASS',
      record: 'record.md',
      recordSha256: digest,
      issues: [
        { code: 'INVALID_VALUE', path: '/role' },
        { code: 'UNDECLARED_FIELD', path: '/nextAction' },
        { code: 'UNDECLARED_FIELD', path: '/review' },
      ],
    });
    result.role = {};
    result.review = { kind: [], verdict: null, reviewedRecord: 1 };
    expect(summarizeGateResult(fence(result))).toMatchObject({
      valid: false,
      role: null,
      kind: null,
      verdict: null,
      record: null,
      recordSha256: null,
    });
    for (const message of [
      'missing',
      '```thoth-result\n{"role":"oracle","role":"worker"}\n```',
      fence(null),
    ]) {
      expect(summarizeGateResult(message)).toMatchObject({
        valid: false,
        role: null,
        kind: null,
        verdict: null,
        record: null,
        recordSha256: null,
      });
    }
  });

  it('compares exact record-prefix bytes while ignoring post-Authorization edits', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-gate-'));
    try {
      const prefix =
        '\uFEFF# Café\r\n\r\nInline ## Authorization\r\n## authorization\r\n## Authorization extra\r\n\r\n';
      const result = fixture();
      result.review = {
        kind: 'final-verification',
        verdict: 'PASS',
        reviewedRecord: 'record.md',
        reviewedRecordSha256:
          'a0909bbe261aafe6ccef57db558df8d25561cc42ed1e41edc5b797d4c9fadbed',
      };
      const path = join(dir, 'record.md');
      writeFileSync(path, `${prefix}## Authorization\r\nPENDING\r\n`);
      expect(summarizeGateResult(fence(result), { cwd: dir })).toMatchObject({
        valid: true,
        recordDigest: 'match',
        recordSha256: result.review.reviewedRecordSha256,
      });
      writeFileSync(path, `${prefix}## Authorization\r\nAUTHORIZED\r\n`);
      expect(
        summarizeGateResult(fence(result), { cwd: dir }).recordDigest,
      ).toBe('match');
      writeFileSync(
        path,
        `changed\r\n${prefix}## Authorization\r\nAUTHORIZED\r\n`,
      );
      expect(summarizeGateResult(fence(result), { cwd: dir })).toMatchObject({
        valid: true,
        recordDigest: 'mismatch',
        issues: [],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('reports unavailable digests for missing, unreadable, or escaping record paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-gate-paths-'));
    try {
      const cwd = join(dir, 'project');
      const outside = join(dir, 'project-sibling');
      mkdirSync(cwd);
      mkdirSync(outside);
      writeFileSync(join(outside, 'record.md'), '# Outside\n');
      symlinkSync(
        outside,
        join(cwd, 'escape'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const result = fixture();
      for (const [record, root] of [
        ['record.md', undefined],
        ['record.md', join(dir, 'missing')],
        ['missing.md', cwd],
        ['.', cwd],
        ['../project-sibling/record.md', cwd],
        [join(outside, 'record.md'), cwd],
        ['escape/record.md', cwd],
      ]) {
        result.review = {
          kind: 'final-verification',
          verdict: 'PASS',
          reviewedRecord: record,
          reviewedRecordSha256: digest,
        };
        expect(summarizeGateResult(fence(result), { cwd: root })).toMatchObject(
          {
            valid: true,
            recordDigest: 'unavailable',
            issues: [],
          },
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts absolute in-root paths and hashes the whole file when no exact heading exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-gate-heading-'));
    try {
      const path = join(dir, 'record.md');
      const result = fixture();
      result.review = {
        kind: 'final-verification',
        verdict: 'PASS',
        reviewedRecord: path,
        // SHA-256 of the empty prefix, independently known.
        reviewedRecordSha256:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };
      writeFileSync(path, '## Authorization\nignored');
      expect(
        summarizeGateResult(fence(result), { cwd: dir }).recordDigest,
      ).toBe('match');
      writeFileSync(path, '## authorization\nignored');
      expect(
        summarizeGateResult(fence(result), { cwd: dir }).recordDigest,
      ).toBe('mismatch');
      writeFileSync(path, '## Authorization \nignored');
      expect(
        summarizeGateResult(fence(result), { cwd: dir }).recordDigest,
      ).toBe('mismatch');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('formats exactly one compact verdict line and types the new exports', () => {
    const summary = summarizeGateResult(fence(fixture()));
    expect(formatGateVerdict(summary)).toBe(
      `thoth-gate-verdict ${JSON.stringify(summary)}`,
    );
    expect(
      formatGateVerdict({ ...summary, record: 'one\ntwo.md' }).split('\n'),
    ).toHaveLength(1);
    expectTypeOf(summarizeGateResult)
      .parameter(1)
      .toEqualTypeOf<{ cwd?: string } | undefined>();
    expectTypeOf(formatGateVerdict)
      .parameter(0)
      .toEqualTypeOf<typeof summary>();
    expectTypeOf(summary.recordDigest).toEqualTypeOf<
      'none' | 'match' | 'mismatch' | 'unavailable'
    >();
  });
});

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
  it.each([
    'PASS',
    'FAIL',
    'BLOCKED',
  ])('accepts recordless %s only in explicit no-record mode', (verdict) => {
    const result = fixture();
    result.review = { kind: 'final-verification', verdict };
    expect(validateResult(fence(result), { noRecord: true })).toEqual({
      valid: true,
      envelope: result,
      issues: [],
    });
    expect(codes(fence(result))).toEqual([
      'RECORD_BINDING_REQUIRED',
      'RECORD_BINDING_REQUIRED',
    ]);
  });
  it.each([
    { reviewedRecord: 'record.md' },
    { reviewedRecordSha256: digest },
    { reviewedRecord: 'record.md', reviewedRecordSha256: digest },
  ])('forbids present record binding in no-record mode: %j', (binding) => {
    const result = fixture();
    result.review = { kind: 'final-verification', verdict: 'PASS', ...binding };
    expect(validateResult(fence(result), { noRecord: true }).issues).toEqual(
      Object.keys(binding).map((key) =>
        expect.objectContaining({
          code: 'RECORD_BINDING_FORBIDDEN',
          path: `/review/${key}`,
        }),
      ),
    );
  });
  it('keeps normal schema and verdict checks in no-record mode', () => {
    const result = fixture();
    result.review = { kind: 'final-verification', verdict: 'OKAY' };
    expect(codes(fence(result), { noRecord: true })).toEqual([
      'VERDICT_MISMATCH',
    ]);
    result.review = {
      kind: 'final-verification',
      verdict: 'PASS',
      reviewedRecord: null,
    };
    expect(codes(fence(result), { noRecord: true })).toEqual(['TYPE_MISMATCH']);
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
  it('prints only compact summary JSON for valid and mismatched assignments', () => {
    const summary = {
      valid: true,
      role: 'oracle',
      kind: 'plan-review',
      verdict: 'OKAY',
      mode: 'record',
      record: null,
      recordSha256: null,
      recordDigest: 'none',
      issues: [],
    };
    expect(cli([], fence(fixture()))).toEqual({ status: 0, output: summary });
    expect(
      cli(['--review-kind', 'final-verification'], fence(fixture())),
    ).toEqual({
      status: 1,
      output: {
        ...summary,
        valid: false,
        issues: [{ code: 'REVIEW_KIND_MISMATCH', path: '/review/kind' }],
      },
    });
    expect(cli(['--bogus'], 'private envelope')).toEqual({
      status: 2,
      output: {
        ...summary,
        valid: false,
        role: null,
        kind: null,
        verdict: null,
        issues: [{ code: 'CLI_USAGE', path: '' }],
      },
    });
  });

  it('keeps explicit CLI no-record expectations and computes digest agreement from its cwd', () => {
    const result = fixture();
    result.review = { kind: 'final-verification', verdict: 'PASS' };
    expect(cli([], fence(result))).toMatchObject({
      status: 1,
      output: {
        valid: false,
        mode: 'no-record',
        issues: [
          { code: 'RECORD_BINDING_REQUIRED', path: '/review/reviewedRecord' },
          {
            code: 'RECORD_BINDING_REQUIRED',
            path: '/review/reviewedRecordSha256',
          },
        ],
      },
    });
    const dir = mkdtempSync(join(tmpdir(), 'thoth-gate-cli-'));
    try {
      writeFileSync(join(dir, 'record.md'), '## Authorization\nAUTHORIZED\n');
      result.review.reviewedRecord = 'record.md';
      result.review.reviewedRecordSha256 =
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      expect(cli([], fence(result), canonicalScript, dir)).toMatchObject({
        status: 0,
        output: { record: 'record.md', recordDigest: 'match' },
      });
      expect(
        cli(['--record-sha256', digest], fence(result), canonicalScript, dir),
      ).toMatchObject({
        status: 1,
        output: {
          valid: false,
          record: 'record.md',
          recordDigest: 'match',
          issues: [
            {
              code: 'RECORD_DIGEST_MISMATCH',
              path: '/review/reviewedRecordSha256',
            },
          ],
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates recordless final verification with an inferred or explicit kind', () => {
    const result = fixture();
    result.review = { kind: 'final-verification', verdict: 'PASS' };
    for (const args of [
      ['--no-record'],
      ['--review-kind', 'final-verification', '--no-record'],
      ['--no-record', '--review-kind', 'final-verification'],
    ]) {
      expect(cli(args, fence(result)).status).toBe(0);
      result.review.reviewedRecord = 'record.md';
      expect(cli(args, fence(result))).toMatchObject({
        status: 1,
        output: {
          valid: false,
          issues: [
            expect.objectContaining({ code: 'RECORD_BINDING_FORBIDDEN' }),
          ],
        },
      });
      delete result.review.reviewedRecord;
    }
  });
  it.each(
    [
      ['--no-record', '--record-sha256', digest],
      ['--record-sha256', digest, '--no-record'],
      ['--no-record', '--review-kind', 'plan-review'],
      ['--review-kind', 'plan-review', '--no-record'],
      ['--no-record'],
    ].map((args) => ({ args })),
  )('uses exit 2 for incompatible no-record mode: $args', ({ args }) => {
    expect(cli(args, fence(fixture()))).toMatchObject({
      status: 2,
      output: {
        valid: false,
        issues: [expect.objectContaining({ code: 'EXPECTATION_INVALID' })],
      },
    });
  });
  it('rejects incompatible no-record API expectations', () => {
    for (const options of [
      { noRecord: true, recordSha256: digest },
      { noRecord: true, reviewKind: 'plan-review' },
      { noRecord: true },
    ])
      expect(codes(fence(fixture()), options)).toEqual(['EXPECTATION_INVALID']);
  });
  it('validates stdin and reports invalid input using exits 0 and 1', () => {
    expect(cli(['--role', 'oracle'], fence(fixture())).status).toBe(0);
    expect(cli([], fence(fixture())).status).toBe(0);
    expect(cli([], 'missing')).toMatchObject({
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
  it.each(
    [
      ['--bogus'],
      ['--no-record', '--no-record'],
      ['--no-record', 'true'],
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
    ].map((args) => ({ args })),
  )('uses exit 2 for usage errors: $args', ({ args }) => {
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
  it('bundles a consumer with the repository esbuild toolchain and runs without external contract assets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-validator-bundle-'));
    try {
      const entry = join(dir, 'consumer.mjs');
      writeFileSync(
        entry,
        `
        import { validateResult, summarizeGateResult, formatGateVerdict } from ${JSON.stringify(canonicalScript.replaceAll('\\', '/'))};
        const message = ${JSON.stringify(fence(fixture()))};
        if (!validateResult(message).valid) throw new Error('Contract validation failed');
        console.log(formatGateVerdict(summarizeGateResult(message)));
      `,
      );
      await build({
        entryPoints: [entry],
        outdir: join(dir, 'dist'),
        outExtension: { '.js': '.mjs' },
        bundle: true,
        splitting: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
      });
      const result = spawnSync(
        process.execPath,
        [join(dir, 'dist/consumer.mjs')],
        {
          cwd: dir,
          input: 'not an envelope',
          encoding: 'utf8',
          timeout: 10000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        `thoth-gate-verdict ${JSON.stringify({
          valid: true,
          role: 'oracle',
          kind: 'plan-review',
          verdict: 'OKAY',
          mode: 'record',
          record: null,
          recordSha256: null,
          recordDigest: 'none',
          issues: [],
        })}\n`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs a standalone installed copy without source-tree dependencies or stderr warnings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-validator-copy-'));
    try {
      cpSync('skills/thoth-sdd/scripts', join(dir, 'scripts'), {
        recursive: true,
      });
      expect(
        cli(
          [],
          fence(fixture()),
          join(dir, 'scripts/validate-result.mjs'),
          dir,
        ),
      ).toMatchObject({
        status: 0,
        output: { valid: true, kind: 'plan-review', verdict: 'OKAY' },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ships identical validator and contract assets and runs from the plugin outside the source tree', () => {
    for (const name of [
      'validate-result.mjs',
      'validate-result.d.mts',
      'result-contract.json',
      'record-digest.mjs',
      'validate.mjs',
    ]) {
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
