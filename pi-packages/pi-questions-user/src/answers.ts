import { getOwn } from './records.js';
import type { Question, Questionnaire, QuestionOption } from './schema.js';
import type { ValidationIssue } from './validate.js';

export interface QuestionAnswer {
  status: 'answered' | 'skipped';
  values: string[];
  labels: string[];
  customText?: string;
  note?: string;
  optionNotes?: Record<string, string>;
}

/** Plain serializable state. Transitions return new state; callers keep the returned value. */
export interface AnswerState extends Questionnaire {
  answers: Record<string, QuestionAnswer>;
}

export type QuestionError = 'no_ui' | 'invalid_questions' | 'aborted';

export interface ResultOptions {
  cancelled?: boolean;
  error?: QuestionError;
  issues?: ValidationIssue[];
}

export interface QuestionDetails extends AnswerState {
  cancelled: boolean;
  error?: QuestionError;
  issues?: ValidationIssue[];
}

export interface QuestionResult {
  content: { type: 'text'; text: string }[];
  details: QuestionDetails;
}

export function createState(questionnaire: Questionnaire): AnswerState {
  const questions = structuredClone(questionnaire.questions).map((question) =>
    question.type === 'confirm'
      ? {
          ...question,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        }
      : question,
  );
  return {
    ...(questionnaire.title !== undefined
      ? { title: questionnaire.title }
      : {}),
    questions,
    answers: Object.fromEntries(
      questions.map((question) => [
        question.id,
        { status: 'skipped', values: [], labels: [] },
      ]),
    ),
  };
}

/** A questionnaire always has its own answer entry for every question id. */
export function getAnswer(state: AnswerState, id: string): QuestionAnswer {
  const answer = getOwn(state.answers, id);
  if (!answer) throw new Error(`Missing answer for question: ${id}`);
  return answer;
}

function getQuestion(state: AnswerState, id: string): Question {
  const question = state.questions.find((question) => question.id === id);
  if (!question) throw new Error(`Unknown question: ${id}`);
  return question;
}

function getOption(question: Question, value: string): QuestionOption {
  const option = question.options?.find((option) => option.value === value);
  if (!option) throw new Error(`Unknown option for ${question.id}: ${value}`);
  return option;
}

function updateAnswer(
  state: AnswerState,
  id: string,
  answer: QuestionAnswer,
): AnswerState {
  const status =
    answer.values.length || answer.customText?.trim() ? 'answered' : 'skipped';
  return {
    ...state,
    answers: { ...state.answers, [id]: { ...answer, status } },
  };
}

export function selectOption(
  state: AnswerState,
  id: string,
  value: string,
): AnswerState {
  const question = getQuestion(state, id);
  if (question.type !== 'single' && question.type !== 'confirm') {
    throw new Error('selectOption requires a single or confirm question.');
  }
  const option = getOption(question, value);
  const { customText: _customText, ...answer } = getAnswer(state, id);
  return updateAnswer(state, id, {
    ...answer,
    values: [value],
    labels: [option.label],
  });
}

export function toggleOption(
  state: AnswerState,
  id: string,
  value: string,
): AnswerState {
  const question = getQuestion(state, id);
  if (question.type !== 'multi')
    throw new Error('toggleOption requires a multi question.');
  getOption(question, value);
  const answer = getAnswer(state, id);
  const selected = new Set(answer.values);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  const options = (question.options ?? []).filter((option) =>
    selected.has(option.value),
  );
  return updateAnswer(state, id, {
    ...answer,
    values: options.map((option) => option.value),
    labels: options.map((option) => option.label),
  });
}

export function setCustomText(
  state: AnswerState,
  id: string,
  text: string,
): AnswerState {
  const question = getQuestion(state, id);
  if (question.type === 'confirm')
    throw new Error('Confirm questions do not take custom text.');
  const { customText: _customText, ...answer } = getAnswer(state, id);
  return updateAnswer(state, id, {
    ...answer,
    ...(question.type === 'multi' ? {} : { values: [], labels: [] }),
    ...(text.trim() ? { customText: text } : {}),
  });
}

export function setQuestionNote(
  state: AnswerState,
  id: string,
  note: string,
): AnswerState {
  getQuestion(state, id);
  const { note: _note, ...answer } = getAnswer(state, id);
  return updateAnswer(state, id, {
    ...answer,
    ...(note.trim() ? { note } : {}),
  });
}

export function setOptionNote(
  state: AnswerState,
  id: string,
  value: string,
  note: string,
): AnswerState {
  const question = getQuestion(state, id);
  getOption(question, value);
  const { optionNotes, ...answer } = getAnswer(state, id);
  const notes: Record<string, string> = Object.assign(
    Object.create(null),
    optionNotes,
  );
  if (note.trim()) notes[value] = note;
  else delete notes[value];
  return updateAnswer(state, id, {
    ...answer,
    ...(Object.keys(notes).length ? { optionNotes: notes } : {}),
  });
}

export function markSkipped(state: AnswerState, id: string): AnswerState {
  getQuestion(state, id);
  const { customText: _customText, ...answer } = getAnswer(state, id);
  return updateAnswer(state, id, { ...answer, values: [], labels: [] });
}

export function buildResult(
  state: AnswerState,
  options: ResultOptions = {},
): QuestionResult {
  const details: QuestionDetails = {
    ...structuredClone(state),
    cancelled: options.cancelled ?? false,
    ...(options.error ? { error: options.error } : {}),
    ...(options.issues ? { issues: structuredClone(options.issues) } : {}),
  };
  const lines = state.questions.map((question) => {
    const answer = getAnswer(state, question.id);
    const summary =
      answer.status === 'answered'
        ? [...answer.labels, answer.customText]
            .filter((part) => part !== undefined)
            .join(', ')
        : 'Skipped (unanswered)';
    const notes = Object.entries(answer.optionNotes ?? {}).map(
      ([value, note]) => {
        const label =
          question.options?.find((option) => option.value === value)?.label ??
          value;
        return `  ${label}: ${note}`;
      },
    );
    return [
      `${question.header} [${question.id}]: ${summary}`,
      ...(answer.note ? [`  Note: ${answer.note}`] : []),
      ...notes,
    ].join('\n');
  });
  return {
    content: [
      {
        type: 'text',
        text: [
          state.title,
          ...(details.error ? [`Error: ${details.error}`] : []),
          ...(details.issues?.map(
            (issue) => `${issue.path}: ${issue.message}`,
          ) ?? []),
          ...lines,
          ...(details.cancelled
            ? [
                'Cancelled. Recorded answers are retained. Unanswered questions must not be assumed.',
              ]
            : []),
        ]
          .filter((line) => line !== undefined)
          .join('\n'),
      },
    ],
    details,
  };
}
