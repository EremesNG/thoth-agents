/** Serializable source of truth shared by prompts and the installed validator. */
const text = { type: 'string' } as const;
const texts = { type: 'array', items: text } as const;
const nullableText = { type: ['string', 'null'] } as const;
function object<const P extends Record<string, unknown>>(properties: P) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}
function array<const T>(items: T) {
  return { type: 'array', items } as const;
}

const changedFile = {
  ...object({
    path: { type: 'string', minLength: 1 },
    change: {
      type: 'string',
      enum: ['added', 'modified', 'deleted', 'renamed'],
    },
    previousPath: text,
  }),
  required: ['path', 'change'],
  requiredIff: {
    field: 'previousPath',
    discriminator: 'change',
    value: 'renamed',
    issueCode: 'CHANGED_FILE_RENAME',
  },
} as const;
const changedFiles = array(changedFile);

const common = object({
  schemaVersion: { type: 'number', const: 1 },
  role: {
    type: 'string',
    enum: ['explorer', 'librarian', 'oracle', 'designer', 'worker'],
  },
  status: {
    type: 'string',
    enum: ['complete', 'partial', 'blocked', 'failed'],
  },
  conclusion: text,
  evidence: array(
    object({
      id: { type: 'string', minLength: 1 },
      kind: text,
      locator: text,
      claim: text,
      basis: { type: 'string', enum: ['observed', 'inferred'] },
      uncertainty: text,
    }),
  ),
  verification: array(
    object({
      check: text,
      method: text,
      outcome: { type: 'string', enum: ['pass', 'fail', 'not-run'] },
      evidenceIds: texts,
      reason: text,
    }),
  ),
  risks: array(
    object({
      description: text,
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      blocking: { type: 'boolean' },
      evidenceIds: texts,
    }),
  ),
  openQuestions: array(
    object({ question: text, owner: text, options: texts, facts: texts }),
  ),
});
const review = {
  ...object({
    kind: {
      type: 'string',
      enum: ['plan-review', 'final-verification', 'diagnosis', 'advice'],
    },
    verdict: { type: ['string', 'null'] },
    reviewedRecord: { type: 'string', minLength: 1 },
    reviewedRecordSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  }),
  required: ['kind', 'verdict'],
} as const;

export const SPECIALIST_RESULT_CONTRACT = {
  schemaVersion: 1,
  fence: 'thoth-result',
  common,
  roles: {
    explorer: object({}),
    librarian: object({}),
    oracle: object({ nextAction: nullableText, review }),
    designer: object({ changedFiles, nextAction: nullableText }),
    worker: object({ changedFiles, nextAction: nullableText }),
  },
  reviewKinds: {
    'plan-review': { verdicts: ['OKAY', 'REJECT'] },
    'final-verification': { verdicts: ['PASS', 'FAIL', 'BLOCKED'] },
    diagnosis: { verdicts: [null] },
    advice: { verdicts: [null] },
  },
  rules: {
    positiveVerdicts: ['OKAY', 'PASS'],
    positiveStatus: 'complete',
    positiveAllowsBlockingRisks: false,
    evidenceIdUnique: true,
    evidenceReferences: ['verification', 'risks'],
    recordBindingReviewKind: 'final-verification',
    recordBindingRequiredWithExpectedDigest: [
      'reviewedRecord',
      'reviewedRecordSha256',
    ],
  },
} as const;

export type SpecialistRole = keyof typeof SPECIALIST_RESULT_CONTRACT.roles;
export type OracleReviewKind =
  keyof typeof SPECIALIST_RESULT_CONTRACT.reviewKinds;
type SchemaValue<S> = S extends { const: infer C }
  ? C
  : S extends { enum: readonly (infer E)[] }
    ? E
    : S extends {
          type: 'object';
          properties: infer P;
          required: readonly string[];
        }
      ? { [K in keyof P]: SchemaValue<P[K]> }
      : S extends { type: 'array'; items: infer I }
        ? SchemaValue<I>[]
        : S extends { type: 'string' }
          ? string
          : S extends { type: 'number' }
            ? number
            : S extends { type: 'boolean' }
              ? boolean
              : S extends { type: readonly ['string', 'null'] }
                ? string | null
                : never;
export type ResultCommon = SchemaValue<typeof common>;
export type OracleReview = {
  [K in OracleReviewKind]: {
    kind: K;
    verdict: (typeof SPECIALIST_RESULT_CONTRACT.reviewKinds)[K]['verdicts'][number];
    reviewedRecord?: string;
    reviewedRecordSha256?: string;
  };
}[OracleReviewKind];
export type ChangedFile = {
  path: string;
} & (
  | { change: 'added' | 'modified' | 'deleted'; previousPath?: never }
  | { change: 'renamed'; previousPath: string }
);
export type SpecialistResult = {
  [R in SpecialistRole]: Omit<ResultCommon, 'role'> & {
    role: R;
  } & (R extends 'oracle'
      ? { nextAction: string | null; review: OracleReview }
      : R extends 'worker' | 'designer'
        ? { changedFiles: ChangedFile[]; nextAction: string | null }
        : object);
}[SpecialistRole];

/** Required field names for compact role-specific prompt rendering. */
export function getSpecialistResultFields(
  role: SpecialistRole,
): readonly string[] {
  return [
    ...common.required,
    ...SPECIALIST_RESULT_CONTRACT.roles[role].required,
  ];
}
