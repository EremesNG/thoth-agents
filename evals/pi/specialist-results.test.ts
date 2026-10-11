import { expect, it } from 'vitest';
import { validateSpecialistTask } from './specialist-results';

import { envelope } from './test-envelope';

it('accepts only the whole validated envelope with expected review kind and record binding', () => {
  const digest = 'a'.repeat(64);
  const task = {
    agent: 'thoth-oracle',
    result: envelope('final-verification', 'PASS', digest),
  };
  expect(
    validateSpecialistTask(task, {
      reviewKind: 'final-verification',
      recordSha256: digest,
    }).valid,
  ).toBe(true);
  expect(
    validateSpecialistTask(task, { reviewKind: 'plan-review' }).valid,
  ).toBe(false);
  expect(
    validateSpecialistTask(task, { recordSha256: 'b'.repeat(64) }).valid,
  ).toBe(false);
  expect(
    validateSpecialistTask({
      ...task,
      result: `Preliminary notes.\n${task.result}`,
    }).valid,
  ).toBe(false);
  expect(
    validateSpecialistTask({ agent: 'thoth-oracle', result: '[PASS]' }).valid,
  ).toBe(false);
  for (const agent of ['thoth-designer', 'custom-reviewer', '']) {
    expect(validateSpecialistTask({ ...task, agent }).valid).toBe(false);
  }
});
