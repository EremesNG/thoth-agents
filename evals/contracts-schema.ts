import { z } from 'zod';

const text = z.string().min(1);
const pattern = text.refine((value) => {
  try {
    new RegExp(value, 'is');
    return true;
  } catch {
    return false;
  }
}, 'Must be a valid regular expression');
const level = z.enum(['low', 'medium', 'high']);
const classification = z.enum(['small', 'substantial']);
const common = {
  id: text.regex(/^[a-z][a-z0-9-]+$/),
  scenario: text,
  polarity: z.enum(['positive', 'negative']),
  productPatterns: z
    .array(
      z.strictObject({
        source: z.enum([
          'workflow',
          'phases',
          'orchestration',
          'verification',
          'memory',
        ]),
        pattern,
      }),
    )
    .min(1),
  rootPatterns: z.array(pattern).min(1),
  // U3 supplies prompts and consumes these deterministic grading requirements.
  // The contract id and expected product outcome stay identical in both suites.
  live: z
    .strictObject({
      prompt: text,
      caps: z
        .strictObject({
          timeMs: z.number().positive().optional(),
          turns: z.number().int().positive().optional(),
          caseUsd: z.number().positive().optional(),
        })
        .optional(),
      expectations: z
        .array(
          z.enum([
            'positive-progress',
            'no-change-record',
            'no-plan-review-question',
            'plan-review-options-before-implementation',
            'separate-implementation-authorization',
            'completed-fresh-oracle-before-pass',
            'delegated-memory-scope',
            'oracle-no-forwarded-skills',
            'designer-project-skill',
          ]),
        )
        .min(1),
    })
    .optional(),
};

export const contractCaseSchema = z.discriminatedUnion('contract', [
  z.strictObject({
    ...common,
    contract: z.literal('plan-authorization'),
  }),
  z.strictObject({
    ...common,
    contract: z.literal('independent-verification'),
    input: z.strictObject({ classification, risk: level }),
    expected: z.strictObject({
      verificationRequired: z.literal(true),
      independent: z.boolean(),
      owner: z.enum(['orchestrator', 'oracle']),
    }),
  }),
  z.strictObject({
    ...common,
    contract: z.literal('delegated-memory'),
    input: z.strictObject({
      role: z.enum([
        'orchestrator',
        'oracle',
        'explorer',
        'librarian',
        'designer',
        'worker',
      ]),
      authorization: z.enum(['none', 'recall', 'observe']),
    }),
    expected: z.strictObject({
      availableAuthorizations: z
        .array(z.enum(['none', 'recall', 'observe']))
        .length(3),
      requiresParentContext: z.boolean(),
      ownsRootLifecycle: z.boolean(),
      workspaceMode: z.enum(['adaptive-root', 'read-only', 'write-capable']),
    }),
    memoryPatterns: z.array(pattern).min(1),
  }),
  z.strictObject({
    ...common,
    contract: z.literal('small-proportionality'),
    input: z.strictObject({
      scope: z.enum(['local', 'coordinated', 'cross-cutting']),
      uncertainty: level,
      risk: level,
      understanding: z.strictObject({
        completed: z.tuple([
          z.literal('explore'),
          z.literal('specify'),
          z.literal('clarify'),
        ]),
        clarification: z.enum(['not-needed', 'resolved']),
      }),
    }),
    expected: z.strictObject({
      classification,
      planningRequired: z.boolean(),
      recordRequired: z.boolean(),
      independentVerificationRequired: z.boolean(),
    }),
  }),
]);

export const contractCaseFileSchema = z
  .strictObject({
    version: z.literal(1),
    cases: z.array(contractCaseSchema).min(1),
  })
  .superRefine(({ cases }, context) => {
    const ids = new Set<string>();
    for (const [index, item] of cases.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate case id',
          path: ['cases', index, 'id'],
        });
      }
      ids.add(item.id);
    }
  });

export type ContractCase = z.infer<typeof contractCaseSchema>;
export type ContractCaseFile = z.infer<typeof contractCaseFileSchema>;
