import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ResultIssueCode,
  ResultValidationOptions,
} from '../../../skills/thoth-sdd/scripts/validate-result.mjs';
import { SPECIALIST_RESULT_CONTRACT } from './agent-pack';
import type { OracleReview } from './result-contract';

describe('specialist result contract', () => {
  it('types recordless final verification and its forbidden-binding issue', () => {
    expectTypeOf<ResultValidationOptions>()
      .toHaveProperty('noRecord')
      .toEqualTypeOf<boolean | undefined>();
    expectTypeOf<Extract<OracleReview, { kind: 'final-verification' }>>()
      .toHaveProperty('reviewedRecord')
      .toEqualTypeOf<string | undefined>();
    expectTypeOf<Extract<OracleReview, { kind: 'final-verification' }>>()
      .toHaveProperty('reviewedRecordSha256')
      .toEqualTypeOf<string | undefined>();
    expectTypeOf<'RECORD_BINDING_FORBIDDEN'>().toExtend<ResultIssueCode>();
  });
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
    expect(
      SPECIALIST_RESULT_CONTRACT.rules.recordBindingRequiredFields,
    ).toEqual(['reviewedRecord', 'reviewedRecordSha256']);
    expect(
      SPECIALIST_RESULT_CONTRACT.rules.recordBindingForbiddenUnderNoRecord,
    ).toEqual(['reviewedRecord', 'reviewedRecordSha256']);
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
