import { expect, it } from 'vitest';
import { parseOracleVerdict } from './oracle-verdict';
import { envelope } from './test-envelope';

it('maps only validated final-verification envelopes to verdicts', () => {
  expect(parseOracleVerdict(envelope())).toBe('PASS');
  expect(parseOracleVerdict(envelope('final-verification', 'BLOCKED'))).toBe(
    'NON_PASS',
  );
  expect(parseOracleVerdict(envelope('plan-review', 'OKAY'))).toBe('UNKNOWN');
});

it.each([
  '```markdown\n[PASS]\n```',
  '~~~\n[PASS]\n~~~',
  '> [PASS]',
  '**> Verdict:** PASS',
  '# > Verdict: PASS',
])('ignores fenced and quoted examples: %s', (text) => {
  expect(parseOracleVerdict(text)).toBe('UNKNOWN');
});

it.each([
  '## Verdict: PASS',
  'Verdict: PASS',
  '**Verdict:** [PASS]',
  '[PASS]',
  'Conclusion: PASS.',
  '**Conclusion**: PASS',
  '*Verdict:* [PASS].',
  '__Conclusion:__ pass',
  'verdict – PASS',
  '- **Verdict:** PASS',
  '* **Verdict**: [PASS]',
  '+ __Verdict__: PASS',
  '1. ## Verdict: PASS',
  '  Verdict: PASS',
])('rejects legacy affirmative text without an envelope: %s', (text) => {
  expect(parseOracleVerdict(text)).toBe('UNKNOWN');
});

it.each([
  'A [PASS] verdict is not justified.',
  '[PASS] is not my verdict.',
  'Verdict: PASS is not warranted; verification remains incomplete.',
  'Example only: [PASS]. Actual verdict is FAIL.',
  'Verdict: PASS — withdrawn; approval denied.',
  'Verdict: PASS\nVerdict: PASS — not justified.',
  '**conclusion:** PASS — AC-1 through AC-5 satisfied',
  '[PASS] — all checks',
  '[PASS]; all checks',
  'Verdict: PASS?',
  'Verdict: NOT PASS',
  'Verdict: PASS..',
  'PASS',
  '',
  'Narrative mentions [FAIL] but has no verdict.',
  '[PASS]\nVerdict: FAIL',
  'Verdict: FAIL\n[PASS]',
  'Verdict: PASS\nVerdict: PASS',
  '[PASS]\n[OKAY]',
  'Verdict: PASS\nConclusion: cannot approve',
  'Verdict: FAIL\nVerdict: BLOCKED',
  'Verdict: PASS\n- Verdict: FAIL',
  'Verdict: PASS\n* Verdict: FAIL',
  'Verdict: PASS\n+ Verdict: FAIL',
  'Verdict: PASS\n1. Verdict: FAIL',
  '    [PASS]',
  '\t[PASS]',
  'Verdict: PASS\n    [FAIL]',
  'Verdict: PASS\n> **Verdict:** FAIL',
  'Verdict: PASS\n- ```\n- [FAIL]\n- ```',
  ...[
    'not',
    'no',
    "isn't",
    'never',
    'cannot',
    'unable',
    'without',
    'unwarranted',
    'unjustified',
    'insufficient',
    'pending',
    'incomplete',
    'example',
    'hypothetical',
  ].flatMap((qualifier) => [
    `[PASS] — ${qualifier}`,
    `Verdict: PASS; ${qualifier}`,
  ]),
])('fails closed on qualified, absent, or multiple verdicts: %s', (text) => {
  expect(parseOracleVerdict(text)).toBe('UNKNOWN');
});

it.each([
  'Verdict: BLOCKED — missing sources',
  '[FAIL] Verification rejected.',
  'Conclusion: [BLOCKED] — missing checks',
  'Verdict: REJECT; verification failed',
  '[INCONCLUSIVE]',
  'Verdict: INCONCLUSIVE; not PASS',
])('rejects legacy non-approval text without an envelope: %s', (text) => {
  expect(parseOracleVerdict(text)).toBe('UNKNOWN');
});

it.each([
  '```\n[FAIL]\n```\nVerdict: PASS',
  '~~~markdown\nVerdict: FAIL\n~~~\n[PASS]',
  ' > Verdict: FAIL\nConclusion: PASS.',
  '> ```\n> [FAIL]\n> ```\nVerdict: PASS',
  '````\n```\nVerdict: FAIL\n````\nVerdict: PASS',
])('rejects example verdicts even beside an actual verdict: %s', (text) => {
  expect(parseOracleVerdict(text)).toBe('UNKNOWN');
});

it.each([
  '```\n[PASS]',
  '~~~\n```\n[PASS]\n```',
])('ignores unterminated or mismatched fences: %s', (text) => {
  expect(parseOracleVerdict(text)).toBe('UNKNOWN');
});
