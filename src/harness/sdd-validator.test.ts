import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const script = join(process.cwd(), 'skills/thoth-sdd/scripts/validate.mjs');
const roots: string[] = [];
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
function fixture(
  id = 'example',
  deltas = '- None.',
  specs: Record<string, string | null> = {},
  reviewDisposition = 'SKIPPED',
  reviewSelection: string | null = 'EXPLICIT_SKIP',
  implementationAuthorization = 'AUTHORIZED',
  includeEnvelope = true,
) {
  const root = mkdtempSync(join(tmpdir(), 'sdd-'));
  roots.push(root);
  const change = join(root, '.thoth/changes', id);
  mkdirSync(change, { recursive: true });
  mkdirSync(join(root, '.thoth/specs'), { recursive: true });
  writeFileSync(join(root, 'source.txt'), 'verified implementation\n');
  const capabilities = [
    ...new Set(
      [
        ...deltas.matchAll(
          /^- `(?:ADDED|MODIFIED|REMOVED|RENAMED) ([a-z0-9-]+)/gm,
        ),
      ].map((match) => match[1]),
    ),
  ];
  const reviewedSpecs = capabilities.map((capability) => {
    const content = specs[capability] ?? null;
    const path = `.thoth/specs/${capability}/spec.md`;
    if (content === null) return `- Source: ${path} | absent`;
    const canonical = join(root, path);
    mkdirSync(join(root, '.thoth/specs', capability), { recursive: true });
    writeFileSync(canonical, content);
    return `- Source: ${path} | sha256:${digest(content)}`;
  });
  const before = `# Change: ${id}\n\n**Classification**: substantial\n**Scope**: coordinated\n**Uncertainty**: low\n**Risk**: low\n\n## Exploration\n\n- Inspected source and constraints.\n\n## Intent\n\nDeliver explicit behavior.\n\n## Non-goals\n\nNo unrelated migration.\n\n## Acceptance\n\n- AC-1: Visible result is checked.\n\n## Clarifications\n\n- No material question remains; accepted intent is settled.\n\n## Decisions\n\n- Scope and behavior confirmed.\n\n## Durable deltas\n\n${deltas}\n\n## Plan\n\nUpdate source and test behavior; no process tooling.\n\n## Tasks\n\n- [x] AC-1: Implement and test the behavior.\n\n## Authorization\n\n**Plan review**: ${reviewDisposition}\n${reviewSelection === null ? '' : `**Plan review selection**: ${reviewSelection}\n`}**Implementation**: ${implementationAuthorization}\n\n`;
  const envelope = `\`\`\`thoth-result
${JSON.stringify({
  schemaVersion: 1,
  role: 'oracle',
  status: 'complete',
  conclusion: 'Verified.',
  evidence: [],
  verification: [],
  risks: [],
  openQuestions: [],
  nextAction: null,
  review: {
    kind: 'final-verification',
    verdict: 'PASS',
    reviewedRecord: `.thoth/changes/${id}/${id}.md`,
    reviewedRecordSha256: digest(before.split('## Authorization')[0]),
  },
})}
\`\`\``;
  const verification = `## Verification\n\n**Reviewer**: oracle\n**Independent from implementer**: Yes\n**Verdict**: PASS\n**Reviewed record SHA-256**: ${digest(before.split('## Authorization')[0])}\n\n- AC-1: PASS | pnpm test | behavior observed\n- Source: source.txt | sha256:${digest('verified implementation\n')}\n${reviewedSpecs.length ? `${reviewedSpecs.join('\n')}\n` : ''}\n## Closeout\n\n**Archive**: READY\n`;
  const boundVerification = includeEnvelope
    ? verification.replace(
        '## Closeout',
        `**Oracle envelope**:

${envelope}

## Closeout`,
      )
    : verification;
  writeFileSync(join(change, `${id}.md`), before + boundVerification);
  return {
    root,
    change,
    id,
    before,
    verification: boundVerification,
    envelope,
  };
}
function validate(change: string, through = 'ready', validatorScript = script) {
  const result = spawnSync(
    process.execPath,
    [validatorScript, '--change', change, '--through', through, '--json'],
    { windowsHide: true, encoding: 'utf8' },
  );
  return {
    ...result,
    report: JSON.parse(result.stdout) as {
      valid: boolean;
      changeId?: string;
      recordPath?: string;
      errors: { code: string }[];
    },
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('ID-named SDD validator', () => {
  test.each([
    'skills',
    'plugin/skills',
  ])('%s closeout refuses an envelope after an intervening H2', (skillsRoot) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          '**Oracle envelope**:',
          '## Oracle result\n\n**Oracle envelope**:',
        ),
    );
    const result = validate(
      f.change,
      'closeout',
      join(process.cwd(), skillsRoot, 'thoth-sdd/scripts/validate.mjs'),
    );
    expect(result.status).not.toBe(0);
    expect(result.report.errors.map(({ code }) => code)).toContain(
      'SDD-ORACLE-ENVELOPE-MISSING',
    );
  });

  test.each([
    'skills',
    'plugin/skills',
  ])('%s closeout accepts an envelope after an intervening H3', (skillsRoot) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          '**Oracle envelope**:',
          '### Oracle result\n\n**Oracle envelope**:',
        ),
    );
    const result = validate(
      f.change,
      'closeout',
      join(process.cwd(), skillsRoot, 'thoth-sdd/scripts/validate.mjs'),
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.report.valid).toBe(true);
  });

  test('closeout rejects a missing Oracle envelope while verify remains unchanged', () => {
    const f = fixture(
      'example',
      '- None.',
      {},
      'SKIPPED',
      'EXPLICIT_SKIP',
      'AUTHORIZED',
      false,
    );
    expect(validate(f.change, 'verify').report.valid).toBe(true);
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-ORACLE-ENVELOPE-MISSING');
  });

  test('closeout counts a FAIL envelope hidden after a heading in an example', () => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          '## Closeout',
          `\`\`\`\`markdown
## Hidden heading
${f.envelope.replace('"verdict":"PASS"', '"verdict":"FAIL"')}
\`\`\`\`

## Closeout`,
        ),
    );
    expect(
      validate(f.change, 'closeout').report.errors.map((e) => e.code),
    ).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
  });

  test.each([
    ['backtick', '````markdown', '````'],
    ['tilde', '~~~~markdown', '~~~~~'],
  ])('closeout rejects a %s literal example beside the genuine envelope', (_name, start, end) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          '**Oracle envelope**:',
          `${start}\n**Oracle envelope**:\n\n${f.envelope}\n- AC-99: FAIL | example\n- Source: missing.txt | absent\n${end}\n\n**Oracle envelope**:`,
        ),
    );
    expect(
      validate(f.change, 'closeout').report.errors.map((e) => e.code),
    ).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
  });

  test.each([
    '> ',
    '- ',
    '1. ',
    '    ',
    '> - ',
  ])('closeout counts a %s prefixed example anywhere in the record', (prefix) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification +
        `\n${prefix}${f.envelope.split('\n').join(`\n${prefix}`)}\n`,
    );
    expect(
      validate(f.change, 'closeout').report.errors.map((e) => e.code),
    ).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
  });

  test.each([
    'before Authorization',
    'after Closeout',
  ])('closeout counts a second marker %s', (position) => {
    const f = fixture();
    const text = f.before + f.verification;
    writeFileSync(
      join(f.change, `${f.id}.md`),
      position === 'before Authorization'
        ? text.replace(
            '## Authorization',
            '**Oracle envelope**:\n\n## Authorization',
          )
        : `${text}\n**Oracle envelope**:\n`,
    );
    expect(
      validate(f.change, 'closeout').report.errors.map((e) => e.code),
    ).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
  });

  test.each([
    'before Authorization',
    'after Closeout',
    'inside Authorization',
  ])('closeout refuses a single binding %s', (position) => {
    const f = fixture();
    const binding = `**Oracle envelope**:\n\n${f.envelope}\n\n`;
    const text = (f.before + f.verification).replace(binding, '');
    writeFileSync(
      join(f.change, `${f.id}.md`),
      position === 'before Authorization'
        ? text.replace('## Authorization', `${binding}## Authorization`)
        : position === 'inside Authorization'
          ? text.replace('## Verification', `${binding}## Verification`)
          : text + binding,
    );
    expect(
      validate(f.change, 'closeout').report.errors.map((e) => e.code),
    ).toContain('SDD-ORACLE-ENVELOPE-MISSING');
  });

  test.each([
    '## verification',
    ' ## Verification',
    '## Verification ',
    '## closeout',
    ' ## Closeout',
    '## Closeout ',
  ])('closeout requires exact placement heading %s', (heading) => {
    const f = fixture();
    const canonical = heading.toLowerCase().includes('verification')
      ? '## Verification'
      : '## Closeout';
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before + f.verification.replace(canonical, heading),
    );
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-ORACLE-ENVELOPE-MISSING');
  });

  test('closeout refuses a block that closes after the Closeout heading', () => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          `${f.envelope}\n\n## Closeout`,
          `${f.envelope.slice(0, -3)}## Closeout\n\`\`\``,
        ),
    );
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-ORACLE-ENVELOPE-MISSING');
  });

  test('a leading BOM is retained in the reviewed digest but ignored for line matching', () => {
    const f = fixture();
    const oldDigest = digest(f.before.split('## Authorization')[0]);
    const newDigest = digest(`\uFEFF${f.before.split('## Authorization')[0]}`);
    writeFileSync(
      join(f.change, `${f.id}.md`),
      `\uFEFF${f.before}${f.verification}`.replaceAll(oldDigest, newDigest),
    );
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
  });

  test.each([
    ['tilde', '~~~thoth-result', '~~~'],
    ['long backtick', '````thoth-result', '````'],
    ['indented', '  ```thoth-result', '  ```'],
    ['extra space', '``` thoth-result', '```'],
    ['trailing info space', '```thoth-result ', '```'],
  ])('closeout rejects a top-level %s envelope fence unchanged', (_name, start, end) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          f.envelope,
          f.envelope.replace('```thoth-result', start).replace(/```$/, end),
        ),
    );
    const result = validate(f.change, 'closeout');
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map(({ code }) => code)).toContain(
      'SDD-ORACLE-ENVELOPE-INVALID',
    );
    expect(result.stdout).toContain('ENVELOPE_FORMAT');
  });

  test.each([
    [
      'marker inside a text fence',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace(
          '**Oracle envelope**:',
          '```text\n**Oracle envelope**:\n```',
        ),
      'MISSING',
    ],
    [
      'intervening prose',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace(
          '**Oracle envelope**:',
          '**Oracle envelope**:\nNot adjacent.',
        ),
      'MISSING',
    ],
    [
      'extra info string',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace('```thoth-result', '```thoth-result json'),
      'INVALID',
    ],
    [
      'short closing fence',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace('```thoth-result', '````thoth-result'),
      'INVALID',
    ],
    [
      'mismatched closing character',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace(f.envelope, f.envelope.replace(/```$/, '~~~')),
      'INVALID',
    ],
  ])('closeout rejects %s with fence-aware extraction', (_name, mutate, suffix) => {
    const f = fixture();
    writeFileSync(join(f.change, `${f.id}.md`), f.before + mutate(f));
    expect(
      validate(f.change, 'closeout').report.errors.map((e) => e.code),
    ).toContain(`SDD-ORACLE-ENVELOPE-${suffix}`);
  });

  test.each([
    'FAIL',
    'PASS',
  ])('closeout rejects a preceding %s envelope beside the marked PASS', (verdict) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          '**Oracle envelope**:',
          `${f.envelope.replace('"verdict":"PASS"', `"verdict":"${verdict}"`)}\n\n**Oracle envelope**:`,
        ),
    );
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
  });

  test.each([
    'THOTH-RESULT',
    'ThOtH-ReSuLt',
  ])('closeout counts a second %s block as duplicate', (info) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification +
        `\n${f.envelope.replace('thoth-result', info)}\n`,
    );
    const result = validate(f.change, 'closeout');
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map(({ code }) => code)).toContain(
      'SDD-ORACLE-ENVELOPE-DUPLICATE',
    );
  });

  test('closeout rejects duplicate envelope blocks', () => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          f.envelope,
          `${f.envelope}

${f.envelope}`,
        ),
    );
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-ORACLE-ENVELOPE-DUPLICATE');
  });

  test.each([
    ['canonical', '```thoth-result', '```', '\n'],
    ['uppercase info', '```THOTH-RESULT', '```', '\n'],
    ['mixed-case info', '```ThOtH-ReSuLt', '```', '\n'],
    ['CRLF', '```thoth-result', '```', '\r\n'],
    ['tilde', '~~~thoth-result', '~~~', '\n'],
    ['long backtick', '````thoth-result', '````', '\n'],
    ['indented', '   ```thoth-result', '   ```', '\n'],
    ['leading info space', '``` thoth-result', '```', '\n'],
    ['trailing info space', '```thoth-result ', '```', '\n'],
    ['extra info', '```thoth-result json', '```', '\n'],
    ['info prefix', '```thoth-result-example', '```', '\n'],
    ['closing space', '```thoth-result', '``` ', '\n'],
    ['long closing fence', '```thoth-result', '````', '\n'],
  ])('closeout acceptance matches validate-result for %s blocks', (_name, start, end, newline) => {
    const f = fixture();
    const block = f.envelope
      .replace('```thoth-result', start)
      .replace(/```$/, end)
      .replace(/\n/g, newline);
    const direct = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'skills/thoth-sdd/scripts/validate-result.mjs'),
        '--review-kind',
        'final-verification',
        '--record-sha256',
        digest(f.before.split('## Authorization')[0]),
      ],
      { windowsHide: true, encoding: 'utf8', input: block },
    );
    expect(direct.status).not.toBeNull();
    const directReport = JSON.parse(direct.stdout) as { valid: boolean };
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before + f.verification.replace(f.envelope, block),
    );
    expect(validate(f.change, 'closeout').report.valid).toBe(
      directReport.valid,
    );
  });

  test('the template envelope placeholder remains compatible with verify', () => {
    const f = fixture();
    const template = readFileSync(
      join(process.cwd(), 'skills/thoth-sdd/templates/change.md'),
      'utf8',
    );
    expect(template).toMatch(
      /\*\*Oracle envelope\*\*:\s*```thoth-result\r?\nPENDING\r?\n```/,
    );
    const verification = template
      .slice(template.indexOf('## Verification'))
      .replace(/^- Source:.*\r?\n/gm, '')
      .replace(
        '## Closeout',
        `- Source: source.txt | sha256:${digest('verified implementation\n')}\n\n## Closeout`,
      );
    writeFileSync(join(f.change, `${f.id}.md`), f.before + verification);
    expect(validate(f.change, 'verify').report.valid).toBe(true);
  });

  test.each([
    [
      'marker with no block',
      (f: ReturnType<typeof fixture>) => f.verification.replace(f.envelope, ''),
      'MISSING',
    ],
    [
      'block without marker',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace('**Oracle envelope**:', ''),
      'MISSING',
    ],
    [
      'block before marker',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace(
          `**Oracle envelope**:\n\n${f.envelope}`,
          `${f.envelope}\n\n**Oracle envelope**:`,
        ),
      'MISSING',
    ],
    [
      'block outside Verification',
      (f: ReturnType<typeof fixture>) =>
        f.verification
          .replace(f.envelope, '')
          .replace('**Archive**: READY', `**Archive**: READY\n\n${f.envelope}`),
      'MISSING',
    ],
    [
      'duplicate marker',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace(
          '**Oracle envelope**:',
          '**Oracle envelope**:\n**Oracle envelope**:',
        ),
      'DUPLICATE',
    ],
    [
      'unterminated block',
      (f: ReturnType<typeof fixture>) =>
        f.verification.replace(f.envelope, f.envelope.slice(0, -3)),
      'INVALID',
    ],
  ])('closeout rejects %s', (_name, mutate, suffix) => {
    const f = fixture();
    writeFileSync(join(f.change, `${f.id}.md`), f.before + mutate(f));
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain(`SDD-ORACLE-ENVELOPE-${suffix}`);
  });

  test.each([
    [
      'invalid JSON',
      (block: string) => block.replace('"schemaVersion":1', '"schemaVersion":'),
      'INVALID',
    ],
    [
      'wrong review kind',
      (block: string) => block.replace('final-verification', 'plan-review'),
      'INVALID',
    ],
    [
      'non-PASS verdict',
      (block: string) => block.replace('"verdict":"PASS"', '"verdict":"FAIL"'),
      'NOT-PASS',
    ],
    [
      'wrong record',
      (block: string) =>
        block.replace(
          '.thoth/changes/example/example.md',
          '.thoth/changes/other/other.md',
        ),
      'RECORD-MISMATCH',
    ],
    [
      'wrong digest',
      (block: string) =>
        block.replace(
          /"reviewedRecordSha256":"[a-f0-9]{64}"/,
          `"reviewedRecordSha256":"${'0'.repeat(64)}"`,
        ),
      'DIGEST-MISMATCH',
    ],
  ])('closeout rejects %s in the embedded envelope', (_name, mutate, suffix) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before + f.verification.replace(f.envelope, mutate(f.envelope)),
    );
    const result = validate(f.change, 'closeout');
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map(({ code }) => code)).toContain(
      `SDD-ORACLE-ENVELOPE-${suffix}`,
    );
    if (suffix === 'INVALID') {
      expect(result.stdout).toMatch(/JSON_SYNTAX|REVIEW_KIND_MISMATCH/);
    }
  });

  test('closeout rejects a Verdict field that disagrees with the PASS envelope', () => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace('**Verdict**: PASS', '**Verdict**: FAIL'),
    );
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-ORACLE-ENVELOPE-VERDICT-MISMATCH');
  });

  test('verify then embed then closeout preserves the reviewed prefix digest', () => {
    const f = fixture(
      'example',
      '- None.',
      {},
      'SKIPPED',
      'EXPLICIT_SKIP',
      'AUTHORIZED',
      false,
    );
    const record = join(f.change, `${f.id}.md`);
    const prefixDigest = digest(
      readFileSync(record, 'utf8').split('## Authorization')[0],
    );
    expect(validate(f.change, 'verify').status).toBe(0);
    writeFileSync(
      record,
      readFileSync(record, 'utf8').replace(
        '## Closeout',
        `**Oracle envelope**:\n\n${f.envelope}\n\n## Closeout`,
      ),
    );
    expect(
      digest(readFileSync(record, 'utf8').split('## Authorization')[0]),
    ).toBe(prefixDigest);
    expect(validate(f.change, 'closeout').status).toBe(0);
  });

  test.each([
    ['Authorization', '**Implementation**: AUTHORIZED'],
    ['Verification', '**Verdict**: PASS'],
    ['Closeout', '**Archive**: READY'],
  ])('keeps closeout valid after %s-only bookkeeping edits following PASS', (section, field) => {
    const f = fixture();
    const record = join(f.change, `${f.id}.md`);
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
    writeFileSync(
      record,
      readFileSync(record, 'utf8').replace(
        field,
        `${field}\n\n- ${section} bookkeeping confirmed by root.`,
      ),
    );
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
  });

  test.each([
    ['annotated', (line: string) => `${line} (reviewed)`],
    ['duplicated', (line: string) => `${line}\n${line}`],
    ['duplicate-annotated', (line: string) => `${line}\n${line} (note)`],
    ['substring-embedded', (line: string) => `note: ${line}`],
    ['missing', () => ''],
    [
      'uppercase',
      (line: string) =>
        line.replace(/[a-f0-9]{64}$/, (hex) => hex.toUpperCase()),
    ],
  ])('rejects a %s reviewed-record SHA line at closeout', (_name, invalidLine) => {
    const f = fixture();
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before +
        f.verification.replace(
          /^\*\*Reviewed record SHA-256\*\*: .*$/m,
          invalidLine,
        ),
    );
    const result = validate(f.change, 'closeout');
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-STALE',
    );
  });

  test('rejects trailing whitespace on a SHA field at the end of Verification', () => {
    const f = fixture();
    const shaLine = f.verification.match(
      /^\*\*Reviewed record SHA-256\*\*: .*$/m,
    )?.[0];
    const reordered = f.verification
      .replace(`${shaLine}\n`, '')
      .replace('## Closeout', `${shaLine} \n\n## Closeout`);
    writeFileSync(join(f.change, `${f.id}.md`), f.before + reordered);

    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toEqual([
      'SDD-VERIFICATION-STALE',
      'SDD-ORACLE-ENVELOPE-DIGEST-MISMATCH',
    ]);
  });

  test('verify accepts final-review and Archive placeholders with complete tasks and reviewed sources', () => {
    const f = fixture();
    const placeholders = f.verification
      .replace('**Reviewer**: oracle', '**Reviewer**: PENDING')
      .replace(
        '**Independent from implementer**: Yes',
        '**Independent from implementer**: PENDING',
      )
      .replace('**Verdict**: PASS', '**Verdict**: PENDING')
      .replace(
        /^\*\*Reviewed record SHA-256\*\*: .*$/m,
        '**Reviewed record SHA-256**: PENDING',
      )
      .replace(
        '- AC-1: PASS | pnpm test | behavior observed',
        '- AC-1: PENDING | check | evidence',
      )
      .replace('**Archive**: READY', '**Archive**: PENDING');
    writeFileSync(join(f.change, `${f.id}.md`), f.before + placeholders);

    expect(validate(f.change, 'verify').report.valid).toBe(true);
    const closeout = validate(f.change, 'closeout');
    expect(closeout.report.errors.map(({ code }) => code)).toEqual([
      'SDD-VERIFICATION',
      'SDD-VERIFICATION-STALE',
      'SDD-ORACLE-ENVELOPE-DIGEST-MISMATCH',
      'SDD-ORACLE-ENVELOPE-VERDICT-MISMATCH',
      'SDD-VERIFICATION-COVERAGE',
      'SDD-ARCHIVE-READINESS',
    ]);
  });

  test.each([
    'verify',
    'closeout',
  ])('%s requires the case-sensitive Authorization heading', (gate) => {
    for (const replacement of ['## Approval', '## authorization']) {
      const f = fixture();
      writeFileSync(
        join(f.change, `${f.id}.md`),
        f.before.replace('## Authorization', replacement) + f.verification,
      );
      const result = validate(f.change, gate);
      expect(result.report.valid, replacement).toBe(false);
      expect(
        result.report.errors.map(({ code }) => code),
        replacement,
      ).toContain('SDD-AUTHORIZATION');
    }
  });

  test('rejects any pre-Authorization edit after PASS as stale', () => {
    const f = fixture();
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
    writeFileSync(
      join(f.change, `${f.id}.md`),
      f.before.replace(
        'Deliver explicit behavior.',
        'Deliver changed behavior.',
      ) + f.verification,
    );
    const result = validate(f.change, 'closeout');
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map(({ code }) => code)).toEqual([
      'SDD-VERIFICATION-STALE',
      'SDD-ORACLE-ENVELOPE-INVALID',
      'SDD-ORACLE-ENVELOPE-DIGEST-MISMATCH',
    ]);
  });

  test.each([
    'verify',
    'closeout',
  ])('%s rejects annotated Authorization after PASS', (gate) => {
    const annotated = fixture(
      'annotated-auth',
      '- None.',
      {},
      'OKAY (note)',
      'EXPLICIT_REVIEW',
    );
    expect(validate(annotated.change, 'ready').report.valid).toBe(true);
    expect(
      validate(annotated.change, gate).report.errors.map(({ code }) => code),
    ).toContain('SDD-AUTHORIZATION');
  });

  test('verify rejects incomplete tasks that are valid at ready', () => {
    const incomplete = fixture('incomplete');
    writeFileSync(
      join(incomplete.change, `${incomplete.id}.md`),
      incomplete.before.replace('- [x] AC-1:', '- [ ] AC-1:') +
        incomplete.verification,
    );
    expect(validate(incomplete.change, 'ready').report.valid).toBe(true);
    expect(
      validate(incomplete.change, 'verify').report.errors.map(
        ({ code }) => code,
      ),
    ).toEqual(['SDD-TASK-INCOMPLETE']);
  });

  test('verify rejects stale, missing, and malformed reviewed implementation sources', () => {
    const f = fixture();
    writeFileSync(join(f.root, 'source.txt'), 'changed implementation\n');
    expect(
      validate(f.change, 'verify').report.errors.map(({ code }) => code),
    ).toEqual(['SDD-VERIFICATION-SOURCE']);

    writeFileSync(join(f.root, 'source.txt'), 'verified implementation\n');
    for (const replacement of ['', '- Source: source.txt | sha256:PENDING']) {
      writeFileSync(
        join(f.change, `${f.id}.md`),
        f.before +
          f.verification.replace(
            /^- Source: source.txt \| sha256:.*$/m,
            replacement,
          ),
      );
      expect(
        validate(f.change, 'verify').report.errors.map(({ code }) => code),
      ).toEqual(['SDD-VERIFICATION-SOURCE']);
    }
  });

  test.each([
    'verify',
    'closeout',
  ])('requires plan-review selection provenance at %s', (gate) => {
    const invalidSelections = [
      ['missing', 'SKIPPED', null],
      ['placeholder', 'SKIPPED', 'PENDING'],
      ['unsupported', 'OKAY', 'DECLINED'],
      [
        'duplicate',
        'SKIPPED',
        'EXPLICIT_SKIP\n**Plan review selection**: EXPLICIT_REVIEW',
      ],
      ['one-empty-default', 'OKAY', 'DEFAULT_REVIEW_AFTER_1'],
      ['two-empty-default', 'OKAY', 'DEFAULT_REVIEW_AFTER_2'],
      ['review-selected-but-skipped', 'SKIPPED', 'EXPLICIT_REVIEW'],
      ['skip-selected-but-reviewed', 'OKAY', 'EXPLICIT_SKIP'],
      ['default-review-but-skipped', 'SKIPPED', 'DEFAULT_REVIEW_AFTER_3'],
    ] as const;

    for (const [id, disposition, selection] of invalidSelections) {
      const f = fixture(id, '- None.', {}, disposition, selection);
      const result = validate(f.change, gate);

      expect(result.report.valid, id).toBe(false);
      expect(
        result.report.errors.map(({ code }) => code),
        id,
      ).toContain('SDD-REVIEW-SELECTION');
    }
  });

  test('accepts explicit review and a third-empty recommended review at closeout', () => {
    for (const [id, selection] of [
      ['explicit-review', 'EXPLICIT_REVIEW'],
      ['third-empty-default', 'DEFAULT_REVIEW_AFTER_3'],
    ] as const) {
      const f = fixture(id, '- None.', {}, 'OKAY', selection);
      expect(validate(f.change, 'closeout').report.valid, id).toBe(true);
    }
  });

  test('permits the initial review-selection placeholder at ready', () => {
    const f = fixture(
      'pending-review-selection',
      '- None.',
      {},
      'PENDING',
      'PENDING',
      'PENDING',
    );

    expect(validate(f.change, 'ready').report.valid).toBe(true);
    expect(
      validate(f.change, 'closeout').report.errors.map(({ code }) => code),
    ).toContain('SDD-REVIEW-SELECTION');
  });

  test('a template-derived record permits Authorization, Verification, and Closeout placeholders at ready', () => {
    const f = fixture();
    const template = readFileSync(
      join(process.cwd(), 'skills/thoth-sdd/templates/change.md'),
      'utf8',
    );
    const prepared = template
      .replace('# Change: <id>', `# Change: ${f.id}`)
      .replace('<local|coordinated|cross-cutting>', 'coordinated')
      .replace('<low|medium|high>', 'low')
      .replace('<low|medium|high>', 'low')
      .replace(
        /^TBD: .*$/gm,
        'Accepted behavior and focused checks are concrete.',
      )
      .replace(/^- PENDING: .*$/gm, '- Material choices are settled.')
      .replace('- AC-1: TBD', '- AC-1: Visible result is checked.')
      .replace(
        '- [ ] AC-1: TBD',
        '- [ ] AC-1: Implement and test the behavior.',
      );
    writeFileSync(join(f.change, `${f.id}.md`), prepared);

    expect(validate(f.change, 'ready').report.valid).toBe(true);
  });

  test('validates one substantial record and locates it by its known ID', () => {
    const f = fixture();
    expect(validate(f.change, 'explore').report.valid).toBe(true);
    expect(validate(f.change, 'specify').report.valid).toBe(true);
    expect(validate(f.change, 'clarify').report.valid).toBe(true);
    expect(validate(f.change, 'plan').report.valid).toBe(true);
    expect(validate(f.change, 'tasks').report.valid).toBe(true);
    expect(validate(f.change).report.valid).toBe(true);
    expect(validate(f.change, 'verify').report.valid).toBe(true);
    expect(validate(f.change, 'closeout').report.valid).toBe(true);
    expect(validate(f.change).report).toMatchObject({
      changeId: 'example',
      recordPath: join(f.change, 'example.md'),
    });
  });

  test('validates the plan before tasks exist and requires task coverage at tasks and ready', () => {
    const f = fixture();
    const path = join(f.change, `${f.id}.md`);
    const withoutTasks = f.before.replace(
      '## Tasks\n\n- [x] AC-1: Implement and test the behavior.\n\n',
      '',
    );
    writeFileSync(path, withoutTasks);
    expect(validate(f.change, 'plan').status).toBe(0);
    for (const gate of ['tasks', 'ready', 'verify']) {
      const result = validate(f.change, gate);
      expect(result.status).toBe(1);
      expect(result.report.errors.map(({ code }) => code)).toContain(
        'SDD-TASK-COVERAGE',
      );
    }
  });

  test('blocks unresolved material intent instead of passing clarification or plan', () => {
    const f = fixture();
    const path = join(f.change, `${f.id}.md`);
    const unresolved = f.before.replace(
      'No material question remains; accepted intent is settled.',
      'PENDING: ask product owner about behavior.',
    );
    writeFileSync(path, unresolved + f.verification);
    for (const gate of ['clarify', 'plan', 'ready', 'verify'])
      expect(validate(f.change, gate).report.valid, gate).toBe(false);
  });

  test.each([
    'verify',
    'closeout',
  ])('requires reviewed canonical baselines and rejects same-title edits at %s', (gate) => {
    const addition =
      '- `ADDED widget` **New behavior** — The widget MUST respond.\n  - GIVEN an active widget; WHEN invoked; THEN it responds.';
    const original =
      '# Widget Specification\n\n## Requirements\n\n### Requirement: Existing behavior\n\nThe original reviewed statement.\n';
    const f = fixture('reviewed-spec', addition, { widget: original });
    const record = join(f.change, `${f.id}.md`);
    expect(validate(f.change, gate).report.valid).toBe(true);

    const updated = join(f.root, '.thoth/specs/widget/spec.md');
    writeFileSync(updated, original.replace('original reviewed', 'newer'));
    const stale = validate(f.change, gate);
    expect(stale.report.valid).toBe(false);
    expect(stale.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-SPEC-BASELINE',
    );

    writeFileSync(updated, original);
    writeFileSync(
      record,
      readFileSync(record, 'utf8').replace(
        `- Source: .thoth/specs/widget/spec.md | sha256:${digest(original)}\n`,
        '',
      ),
    );
    const missing = validate(f.change, gate);
    expect(missing.report.valid).toBe(false);
    expect(missing.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-SPEC-BASELINE',
    );
  });

  test.each([
    'verify',
    'closeout',
  ])('reviews absence for a new capability and rejects later creation at %s', (gate) => {
    const addition =
      '- `ADDED widget` **New behavior** — The widget MUST respond.\n  - GIVEN an active widget; WHEN invoked; THEN it responds.';
    const f = fixture('absent-spec', addition);
    expect(validate(f.change, gate).report.valid).toBe(true);
    const created = join(f.root, '.thoth/specs/widget/spec.md');
    mkdirSync(join(f.root, '.thoth/specs/widget'), { recursive: true });
    writeFileSync(created, '# Widget Specification\n');
    const stale = validate(f.change, gate);
    expect(stale.report.valid).toBe(false);
    expect(stale.report.errors.map(({ code }) => code)).toContain(
      'SDD-VERIFICATION-SPEC-BASELINE',
    );
  });

  test('rejects unsafe IDs and never guesses another markdown filename', () => {
    for (const id of ['CON', 'nul', 'COM1', 'LPT9', 'a..b']) {
      const f = fixture(id);
      expect(
        validate(f.change).report.errors.map(({ code }) => code),
      ).toContain('SDD-CHANGE-ID');
    }
    const f = fixture('known-id');
    rmSync(join(f.change, 'known-id.md'));
    writeFileSync(join(f.change, 'other.md'), f.before + f.verification);
    expect(validate(f.change).report.errors.map(({ code }) => code)).toContain(
      'SDD-CHANGE-MISSING',
    );
  });

  test('rejects separators and traversal instead of resolving them as change IDs', () => {
    const f = fixture();
    const unsafe = [
      join(f.root, '.thoth/changes/../escape'),
      join(f.root, '.thoth/changes/nested/child'),
      join(f.root, '.thoth/changes/bad\\\\id'),
    ];
    for (const path of unsafe) expect(validate(path).status).not.toBe(0);
  });

  test('rejects duplicate record artifacts and auxiliary process outputs', () => {
    const f = fixture();
    writeFileSync(join(f.change, 'another.md'), 'not canonical');
    expect(validate(f.change).report.errors.map(({ code }) => code)).toContain(
      'SDD-AUXILIARY-ARTIFACT',
    );
    rmSync(join(f.change, 'another.md'));
    mkdirSync(join(f.change, 'evidence'));
    expect(validate(f.change).report.valid).toBe(false);
  });

  test('retrieves an archived record by date-prefixed directory and stable ID filename', () => {
    const f = fixture('stable-id');
    const archive = join(f.root, '.thoth/changes/archive/2026-09-28-stable-id');
    mkdirSync(archive, { recursive: true });
    writeFileSync(
      join(archive, 'stable-id.md'),
      readFileSync(join(f.change, 'stable-id.md'), 'utf8'),
    );
    const result = validate(archive, 'closeout');
    expect(result.status).toBe(0);
    expect(result.report).toMatchObject({
      valid: true,
      changeId: 'stable-id',
      recordPath: join(archive, 'stable-id.md'),
    });
    expect(existsSync(join(archive, '2026-09-28-stable-id.md'))).toBe(false);
  });

  test('rejects symlinked ancestors and unknown route options', () => {
    const f = fixture();
    const outside = join(f.root, 'outside');
    mkdirSync(outside);
    const symlinkRoot = join(f.root, 'symlink-project');
    mkdirSync(symlinkRoot);
    symlinkSync(outside, join(symlinkRoot, '.thoth'), 'junction');
    const throughLink = join(symlinkRoot, '.thoth/changes/link-id');
    expect(validate(throughLink).status).not.toBe(0);
    const withRoute = spawnSync(
      process.execPath,
      [script, '--change', f.change, '--route', 'full', '--through', 'ready'],
      { windowsHide: true, encoding: 'utf8' },
    );
    expect(withRoute.status).toBe(2);
  });
});
