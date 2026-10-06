import { type Static, Type } from 'typebox';

export const FREE_TEXT_LABEL = 'Type something.';

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

export const questionParameters = Type.Object({
  title: Type.Optional(Type.String()),
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
  questions: Question[];
}
