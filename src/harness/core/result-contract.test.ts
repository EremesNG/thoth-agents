import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPECIALIST_RESULT_CONTRACT } from './agent-pack';

describe('specialist result contract', () => {
  it('publishes strict required fields and role extensions as generated data', () => {
    expect(SPECIALIST_RESULT_CONTRACT.schemaVersion).toBe(1);
    expect(Object.keys(SPECIALIST_RESULT_CONTRACT.roles)).toEqual(['oracle']);
    expect(SPECIALIST_RESULT_CONTRACT.common.properties.role.enum).toEqual([
      'oracle',
    ]);
    expect(Object.keys(SPECIALIST_RESULT_CONTRACT.reviewKinds)).toEqual([
      'plan-review',
      'final-verification',
    ]);
    expect(SPECIALIST_RESULT_CONTRACT.common.additionalProperties).toBe(false);
    expect(SPECIALIST_RESULT_CONTRACT.roles.oracle.required).toEqual([
      'nextAction',
      'review',
    ]);
    expect(
      JSON.parse(
        readFileSync('skills/thoth-sdd/scripts/result-contract.json', 'utf8'),
      ),
    ).toEqual(SPECIALIST_RESULT_CONTRACT);
  });
});
