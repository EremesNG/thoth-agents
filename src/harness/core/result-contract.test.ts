import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPECIALIST_RESULT_CONTRACT } from './agent-pack';

describe('specialist result contract', () => {
  it('publishes strict required fields and role extensions as generated data', () => {
    expect(SPECIALIST_RESULT_CONTRACT.schemaVersion).toBe(1);
    expect(Object.keys(SPECIALIST_RESULT_CONTRACT.roles)).toEqual([
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ]);
    expect(SPECIALIST_RESULT_CONTRACT.common.properties.status.enum).toEqual([
      'complete',
      'partial',
      'blocked',
      'failed',
    ]);
    expect(SPECIALIST_RESULT_CONTRACT.common.additionalProperties).toBe(false);
    expect(SPECIALIST_RESULT_CONTRACT.roles.explorer.properties).toEqual({});
    expect(SPECIALIST_RESULT_CONTRACT.roles.worker.required).toEqual([
      'changedFiles',
      'nextAction',
    ]);
    for (const role of ['worker', 'designer'] as const) {
      expect(
        SPECIALIST_RESULT_CONTRACT.roles[role].properties.changedFiles,
      ).toEqual({
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', minLength: 1 },
            change: {
              type: 'string',
              enum: ['added', 'modified', 'deleted', 'renamed'],
            },
            previousPath: { type: 'string' },
          },
          required: ['path', 'change'],
          additionalProperties: false,
          requiredIff: {
            field: 'previousPath',
            discriminator: 'change',
            value: 'renamed',
            issueCode: 'CHANGED_FILE_RENAME',
          },
        },
      });
    }
    expect(
      JSON.parse(
        readFileSync('skills/thoth-sdd/scripts/result-contract.json', 'utf8'),
      ),
    ).toEqual(SPECIALIST_RESULT_CONTRACT);
  });
});
