import {
  FREE_TEXT_LABEL,
  type Questionnaire,
  type QuestionParameters,
} from './schema.js';

export type ValidationIssueCode =
  | 'invalid_type'
  | 'blank'
  | 'empty_questions'
  | 'duplicate_id'
  | 'missing_options'
  | 'unexpected_options'
  | 'duplicate_value'
  | 'reserved_label';

export interface ValidationIssue {
  path: string;
  code: ValidationIssueCode;
  message: string;
}

export type ValidationResult =
  | { valid: true; value: Questionnaire }
  | { valid: false; issues: ValidationIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateQuestions(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, code: ValidationIssueCode, message: string) => {
    issues.push({ path, code, message });
  };
  const string = (value: unknown, path: string, nonBlank = false) => {
    if (typeof value !== 'string') {
      issue(path, 'invalid_type', 'Expected a string.');
    } else if (nonBlank && !value.trim()) {
      issue(path, 'blank', 'Must not be blank.');
    }
  };
  const optional = (
    value: unknown,
    path: string,
    type: 'string' | 'boolean',
  ) => {
    if (value !== undefined && typeof value !== type) {
      issue(path, 'invalid_type', `Expected a ${type}.`);
    }
  };

  if (!isObject(input)) {
    return {
      valid: false,
      issues: [
        {
          path: '',
          code: 'invalid_type',
          message: 'Expected a questionnaire object.',
        },
      ],
    };
  }
  optional(input.title, 'title', 'string');
  if (!Array.isArray(input.questions)) {
    issue('questions', 'invalid_type', 'Expected an array of questions.');
    return { valid: false, issues };
  }
  if (!input.questions.length) {
    issue('questions', 'empty_questions', 'At least one question is required.');
  }

  const ids = new Set<string>();
  input.questions.forEach((question: unknown, index: number) => {
    const path = `questions[${index}]`;
    if (!isObject(question)) {
      issue(path, 'invalid_type', 'Expected a question object.');
      return;
    }
    for (const key of ['id', 'header', 'prompt']) {
      string(question[key], `${path}.${key}`, true);
    }
    if (typeof question.id === 'string') {
      if (ids.has(question.id))
        issue(`${path}.id`, 'duplicate_id', 'Question ids must be unique.');
      ids.add(question.id);
    }
    const type = question.type === undefined ? 'single' : question.type;
    if (!['single', 'multi', 'text', 'confirm'].includes(type as string)) {
      issue(
        `${path}.type`,
        'invalid_type',
        'Expected single, multi, text or confirm.',
      );
    }
    optional(question.required, `${path}.required`, 'boolean');
    const options = question.options;
    if (options !== undefined && !Array.isArray(options)) {
      issue(`${path}.options`, 'invalid_type', 'Expected an array of options.');
      return;
    }
    if (
      (type === 'single' || type === 'multi') &&
      (!options || !options.length)
    ) {
      issue(
        `${path}.options`,
        'missing_options',
        'Single and multi questions need at least one option.',
      );
    }
    if ((type === 'text' || type === 'confirm') && options?.length) {
      issue(
        `${path}.options`,
        'unexpected_options',
        'Text and confirm questions take no options.',
      );
    }
    const values = new Set<string>();
    options?.forEach((option: unknown, optionIndex: number) => {
      const optionPath = `${path}.options[${optionIndex}]`;
      if (!isObject(option)) {
        issue(optionPath, 'invalid_type', 'Expected an option object.');
        return;
      }
      string(option.value, `${optionPath}.value`, true);
      string(option.label, `${optionPath}.label`, true);
      if (typeof option.value === 'string') {
        if (values.has(option.value))
          issue(
            `${optionPath}.value`,
            'duplicate_value',
            'Option values must be unique within a question.',
          );
        values.add(option.value);
      }
      if (
        typeof option.label === 'string' &&
        option.label.trim() === FREE_TEXT_LABEL
      ) {
        issue(
          `${optionPath}.label`,
          'reserved_label',
          'The free-text label is reserved.',
        );
      }
      optional(option.description, `${optionPath}.description`, 'string');
      optional(option.preview, `${optionPath}.preview`, 'string');
      optional(option.recommended, `${optionPath}.recommended`, 'boolean');
    });
  });
  if (issues.length) return { valid: false, issues };

  const params = input as QuestionParameters;
  return {
    valid: true,
    value: {
      ...(params.title !== undefined ? { title: params.title } : {}),
      questions: params.questions.map((question) => ({
        ...question,
        type: question.type ?? 'single',
      })),
    },
  };
}
