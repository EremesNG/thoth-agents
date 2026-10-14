import { expect, it } from 'vitest';
import { hasApprovalWrite } from './record-verdict';

it('ignores only unchanged prior approval lines, not new or duplicate approvals', () => {
  const instructions =
    'Verdict: `PASS`; Reviewed record SHA-256: exact UTF-8 bytes before';
  const before = `${instructions}\n**Verdict**: PENDING`;
  expect(
    hasApprovalWrite(
      `${instructions}\n**Verdict**: FAIL`,
      'final-verification',
      before,
    ),
  ).toBe(false);
  expect(
    hasApprovalWrite(
      `${instructions}\n**Verdict**: PASS`,
      'final-verification',
      before,
    ),
  ).toBe(true);
  expect(
    hasApprovalWrite(
      `${before}\n${instructions}`,
      'final-verification',
      before,
    ),
  ).toBe(true);
});

it.each([
  '**Verdict:** PASS',
  '**Verdict**: [PASS]',
  '__Verdict__: PASS',
  'Verdict: PASS',
  '**Verdict**: PASS',
  '- **Verdict:** [PASS].',
  '* Verdict: PASS',
  '+ Verdict: PASS',
  '1. ## Verdict: PASS',
  '> Verdict: PASS',
  '    Verdict: PASS',
  '\tVerdict: PASS',
  '```\nVerdict: PASS\n```',
  'Verdict — PASS',
  'Verdict – [PASS]',
  'Verdict - pass',
  'Verdict: NOT PASS',
  'Verdict: INCONCLUSIVE; not PASS',
  'Verdict: FAIL (previously [PASS])',
  'Verdict: `PASS`',
  'Verdict: PASS — withdrawn; approval denied.',
  'Verdict: PENDING\nVerdict: PASS',
  '**Reviewer**: oracle\n**Independent from implementer**: Yes\n**Verdict**: PASS\n',
])('detects approval tokens inclusively in a Verdict field: %s', (text) => {
  expect(hasApprovalWrite(text)).toBe(true);
});

it.each([
  '',
  'Verdict: FAIL',
  'Verdict: BLOCKED',
  'Verdict: REJECT',
  'Verdict: INCONCLUSIVE',
  'Verdict: PENDING',
  'Verdict: bypass',
  'Narrative mentions PASS, but does not write a Verdict field.',
  'Conclusion: PASS',
])('does not invent approval tokens: %s', (text) => {
  expect(hasApprovalWrite(text)).toBe(false);
});
