import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const contract = JSON.parse(
  readFileSync(new URL('./result-contract.json', import.meta.url), 'utf8'),
);
const childPath = (path, key) =>
  `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

/** Parse JSON ourselves so duplicate keys cannot be erased by JSON.parse. */
function parseStrictJSON(source) {
  let cursor = 0;
  const fail = (code, path, message) => {
    throw { code, path, message };
  };
  const whitespace = () => {
    while (/[\t\n\r ]/.test(source[cursor] ?? '\0')) cursor++;
  };
  const syntax = (path) =>
    fail('JSON_SYNTAX', path, `Invalid JSON at offset ${cursor}.`);
  function string(path) {
    const start = cursor++;
    while (cursor < source.length) {
      const char = source[cursor++];
      if (char === '\\') cursor++;
      else if (char === '"') {
        try {
          return JSON.parse(source.slice(start, cursor));
        } catch {
          syntax(path);
        }
      }
    }
    syntax(path);
  }
  function value(path, depth) {
    if (depth > 256)
      fail('JSON_SYNTAX', path, 'JSON nesting exceeds 256 levels.');
    whitespace();
    const char = source[cursor];
    if (char === '"') return string(path);
    if (char === '{' || char === '[') {
      const isObject = char === '{';
      const close = isObject ? '}' : ']';
      const result = isObject ? Object.create(null) : [];
      const keys = new Set();
      cursor++;
      whitespace();
      if (source[cursor] === close) {
        cursor++;
        return result;
      }
      for (;;) {
        let key = result.length;
        if (isObject) {
          if (source[cursor] !== '"') syntax(path);
          key = string(path);
          if (keys.has(key))
            fail(
              'JSON_DUPLICATE_KEY',
              childPath(path, key),
              `Duplicate key ${JSON.stringify(key)}.`,
            );
          keys.add(key);
          whitespace();
          if (source[cursor++] !== ':') syntax(path);
        }
        result[key] = value(childPath(path, key), depth + 1);
        whitespace();
        if (source[cursor] === close) {
          cursor++;
          return result;
        }
        if (source[cursor++] !== ',') syntax(path);
        whitespace();
      }
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        source.slice(cursor),
      );
    if (!token) syntax(path);
    cursor += token[0].length;
    const result = JSON.parse(token[0]);
    if (typeof result === 'number' && !Number.isFinite(result)) syntax(path);
    return result;
  }
  const result = value('', 0);
  whitespace();
  if (cursor !== source.length) syntax('');
  return result;
}

function checkExpectations(options, issue) {
  const expectations = [
    ['role', Object.keys(contract.roles)],
    ['reviewKind', Object.keys(contract.reviewKinds)],
  ];
  for (const [key, values] of expectations) {
    if (options[key] !== undefined && !values.includes(options[key]))
      issue('EXPECTATION_INVALID', '', `Unknown expected ${key}.`);
  }
  if (
    options.recordSha256 !== undefined &&
    !/^[a-f0-9]{64}$/.test(options.recordSha256)
  )
    issue(
      'EXPECTATION_INVALID',
      '',
      'Expected digest must be 64 lowercase hex characters.',
    );
}

export function validateResult(message, options = {}) {
  const issues = [];
  const issue = (code, path, text) =>
    issues.push({ code, path, message: text });
  const invalid = () => ({ valid: false, issues });
  checkExpectations(options, issue);
  if (issues.length) return invalid();
  const trimmed = typeof message === 'string' ? message.trim() : '';
  const block = new RegExp(
    `^\`\`\`${contract.fence}\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\`$`,
  ).exec(trimmed);
  if (!block || (trimmed.match(/^```.*$/gm) ?? []).length !== 2) {
    issue(
      'ENVELOPE_FORMAT',
      '',
      'Expected exactly one thoth-result fence and no surrounding prose.',
    );
    return invalid();
  }
  let envelope;
  try {
    envelope = parseStrictJSON(block[1]);
  } catch (error) {
    issues.push(error);
    return invalid();
  }
  function check(value, schema, path) {
    const type =
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(type)) {
      issue('TYPE_MISMATCH', path, `Expected ${types.join(' or ')}.`);
      return;
    }
    if ('const' in schema && value !== schema.const)
      issue('INVALID_VALUE', path, 'Value differs from required constant.');
    if (schema.enum && !schema.enum.includes(value))
      issue('INVALID_VALUE', path, 'Value is not in the allowed enumeration.');
    if (type === 'string') {
      if (schema.minLength && value.length < schema.minLength)
        issue('INVALID_VALUE', path, 'String must not be empty.');
      if (schema.pattern && !new RegExp(schema.pattern).test(value))
        issue(
          'INVALID_VALUE',
          path,
          'String does not match the required pattern.',
        );
    }
    if (type === 'array') {
      value.forEach((item, index) => {
        check(item, schema.items, childPath(path, index));
      });
    }
    if (type === 'object') {
      for (const key of schema.required)
        if (!Object.hasOwn(value, key))
          issue(
            'REQUIRED_FIELD',
            childPath(path, key),
            'Required field is missing.',
          );
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties, key))
          issue(
            'UNDECLARED_FIELD',
            childPath(path, key),
            'Undeclared field is forbidden.',
          );
        else check(value[key], schema.properties[key], childPath(path, key));
      }
    }
  }
  const roleSchema =
    envelope &&
    typeof envelope.role === 'string' &&
    Object.hasOwn(contract.roles, envelope.role)
      ? contract.roles[envelope.role]
      : { properties: {}, required: [] };
  check(
    envelope,
    {
      ...contract.common,
      properties: { ...contract.common.properties, ...roleSchema.properties },
      required: [...contract.common.required, ...roleSchema.required],
    },
    '',
  );
  if (issues.length) return invalid();
  if (options.role && envelope.role !== options.role)
    issue('ROLE_MISMATCH', '/role', 'Role does not match assignment.');
  if (options.reviewKind && envelope.review.kind !== options.reviewKind)
    issue(
      'REVIEW_KIND_MISMATCH',
      '/review/kind',
      'Review kind does not match assignment.',
    );
  const ids = new Set();
  envelope.evidence.forEach((entry, index) => {
    if (contract.rules.evidenceIdUnique && ids.has(entry.id))
      issue(
        'EVIDENCE_ID_DUPLICATE',
        `/evidence/${index}/id`,
        'Evidence ids must be unique.',
      );
    ids.add(entry.id);
  });
  for (const field of contract.rules.evidenceReferences) {
    envelope[field].forEach((entry, index) => {
      entry.evidenceIds.forEach((id, ref) => {
        if (!ids.has(id))
          issue(
            'EVIDENCE_REFERENCE',
            `/${field}/${index}/evidenceIds/${ref}`,
            'Reference does not identify supplied evidence.',
          );
      });
    });
  }
  const { kind, verdict } = envelope.review;
  if (!contract.reviewKinds[kind].verdicts.includes(verdict))
    issue(
      'VERDICT_MISMATCH',
      '/review/verdict',
      'Verdict is not allowed for this review kind.',
    );
  if (contract.rules.positiveVerdicts.includes(verdict)) {
    if (envelope.status !== contract.rules.positiveStatus)
      issue(
        'VERDICT_STATUS',
        '/status',
        'Positive verdict requires complete status.',
      );
    envelope.risks.forEach((risk, index) => {
      if (!contract.rules.positiveAllowsBlockingRisks && risk.blocking)
        issue(
          'BLOCKING_RISK',
          `/risks/${index}/blocking`,
          'Positive verdict forbids blocking risks.',
        );
    });
  }
  if (envelope.review.kind === contract.rules.recordBindingReviewKind) {
    for (const key of contract.rules.recordBindingRequiredFields) {
      if (!envelope.review[key])
        issue(
          'RECORD_BINDING_REQUIRED',
          `/review/${key}`,
          'Final verification requires reviewed record binding.',
        );
    }
  }
  if (options.recordSha256 !== undefined) {
    if (envelope.review.kind !== contract.rules.recordBindingReviewKind)
      issue(
        'REVIEW_KIND_MISMATCH',
        '/review/kind',
        'Record binding requires final-verification.',
      );
    if (
      envelope.review.reviewedRecordSha256 &&
      envelope.review.reviewedRecordSha256 !== options.recordSha256
    )
      issue(
        'RECORD_DIGEST_MISMATCH',
        '/review/reviewedRecordSha256',
        'Digest does not match assignment.',
      );
  }
  return issues.length ? invalid() : { valid: true, envelope, issues };
}

export const RESULT_VALIDATOR_USAGE =
  'node validate-result.mjs [--role oracle] [--review-kind plan-review|final-verification] [--record-sha256 <hex>] [--input <path>]';
function main(args) {
  const options = {};
  let input;
  const names = {
    '--role': 'role',
    '--review-kind': 'reviewKind',
    '--record-sha256': 'recordSha256',
    '--input': 'input',
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (
      !Object.hasOwn(names, flag) ||
      seen.has(flag) ||
      !args[index + 1] ||
      args[index + 1].startsWith('--')
    ) {
      console.log(
        JSON.stringify({
          valid: false,
          issues: [
            { code: 'CLI_USAGE', path: '', message: RESULT_VALIDATOR_USAGE },
          ],
        }),
      );
      return 2;
    }
    seen.add(flag);
    const value = args[++index];
    if (flag === '--input') input = value;
    else options[names[flag]] = value;
  }
  const expectationIssues = [];
  checkExpectations(options, (code, path, message) => {
    expectationIssues.push({ code, path, message });
  });
  if (expectationIssues.length) {
    console.log(JSON.stringify({ valid: false, issues: expectationIssues }));
    return 2;
  }
  let message;
  try {
    message = readFileSync(input ?? 0, 'utf8');
  } catch {
    console.log(
      JSON.stringify({
        valid: false,
        issues: [
          { code: 'CLI_INPUT', path: '', message: 'Unable to read input.' },
        ],
      }),
    );
    return 2;
  }
  const result = validateResult(message, options);
  console.log(JSON.stringify(result));
  return result.valid ? 0 : 1;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = main(process.argv.slice(2));
