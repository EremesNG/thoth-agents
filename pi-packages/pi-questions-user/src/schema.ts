import { type Static, type TString, Type } from 'typebox';

/** English defaults for every fixed UI string; the model may override any of them. */
export const DEFAULT_LABELS = {
  askUser: 'Ask user',
  yes: 'Yes',
  no: 'No',
  typeSomething: 'Type something.',
  yourAnswer: 'Your answer',
  submit: 'Submit answers',
  backToEdit: 'Back to edit',
  cancel: 'Cancel',
  review: 'Review',
  reviewHeading: 'Review your answers',
  required: 'required',
  unanswered: 'unanswered',
  requiredPending: 'required question(s) unanswered; you may still submit.',
  skipped: 'skipped',
  skip: 'Skip',
  done: 'Done',
  recommended: 'recommended',
  preview: 'Preview',
  noDescription: 'No description.',
  typeOwn: 'Press Enter to type your own answer.',
  noTextYet: 'No text yet. Press Enter to write an answer.',
  note: 'Note',
  noteForQuestion: 'Note for this question',
  noteFor: 'Note for',
  cancelled: 'Cancelled',
  cancelledKept: 'recorded answers kept.',
  error: 'Error',
  answered: 'answered',
  move: 'move',
  pick: 'pick',
  select: 'select',
  toggle: 'toggle',
  next: 'next',
  optionNote: 'option note',
  questionNote: 'question note',
  clear: 'clear',
  scrollPreview: 'preview',
  switchTab: 'switch',
  save: 'save',
  newline: 'newline',
  keepDraft: 'keep draft',
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;
export type Labels = Record<LabelKey, string>;
export type LabelOverrides = Partial<Labels>;

export const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as LabelKey[];

/** Overrides are validated non-blank upstream; blank or missing keys keep the English default. */
export function resolveLabels(overrides?: LabelOverrides): Labels {
  const labels: Labels = { ...DEFAULT_LABELS };
  for (const key of LABEL_KEYS) {
    const value = overrides?.[key];
    if (typeof value === 'string' && value.trim()) labels[key] = value;
  }
  return labels;
}

/** Reserved free-text row labels: the English default and the localized one. */
export function reservedLabels(overrides?: LabelOverrides): string[] {
  return [
    ...new Set([
      DEFAULT_LABELS.typeSomething,
      resolveLabels(overrides).typeSomething,
    ]),
  ];
}

export const questionOptionSchema = Type.Object({
  value: Type.String(),
  label: Type.String(),
  description: Type.Optional(Type.String()),
  preview: Type.Optional(Type.String()),
  recommended: Type.Optional(Type.Boolean()),
});

export const questionSchema = Type.Object({
  id: Type.String(),
  header: Type.String(),
  prompt: Type.String(),
  type: Type.Optional(
    Type.Union([
      Type.Literal('single'),
      Type.Literal('multi'),
      Type.Literal('text'),
      Type.Literal('confirm'),
    ]),
  ),
  required: Type.Optional(Type.Boolean()),
  options: Type.Optional(Type.Array(questionOptionSchema)),
});

export const labelsSchema = Type.Object(
  Object.fromEntries(
    LABEL_KEYS.map((key) => [
      key,
      Type.Optional(
        Type.String({ description: `Default: "${DEFAULT_LABELS[key]}"` }),
      ),
    ]),
  ) as Record<LabelKey, ReturnType<typeof Type.Optional<TString>>>,
  {
    description:
      'Optional UI strings translated to the language of the conversation. Omitted keys stay English. Option values and ids are never localized.',
  },
);

export const questionParameters = Type.Object({
  title: Type.Optional(Type.String()),
  labels: Type.Optional(labelsSchema),
  // Minimum count and semantic constraints are checked at execution for structured issues.
  questions: Type.Array(questionSchema),
});

export type QuestionParameters = Static<typeof questionParameters>;
export type QuestionOption = Static<typeof questionOptionSchema>;
export type QuestionType = NonNullable<Static<typeof questionSchema>['type']>;
export type Question = Omit<Static<typeof questionSchema>, 'type'> & {
  type: QuestionType;
};
export interface Questionnaire {
  title?: string;
  /** Present only when the caller sent overrides. */
  labels?: LabelOverrides;
  questions: Question[];
}
