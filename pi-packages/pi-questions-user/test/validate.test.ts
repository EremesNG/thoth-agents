import { expect, it } from 'vitest';
import { questionParameters } from '../src/schema.js';
import { validateQuestions } from '../src/validate.js';

const choice = {
  id: 'plan',
  header: 'Plan',
  prompt: 'Which plan?',
  options: [{ value: 'safe', label: 'Safe' }],
};

it.each([
  [{ questions: [] }, 'questions', 'empty_questions'],
  [{ questions: [choice, choice] }, 'questions[1].id', 'duplicate_id'],
  [{ questions: [{ ...choice, id: '  ' }] }, 'questions[0].id', 'blank'],
  [{ questions: [{ ...choice, header: '' }] }, 'questions[0].header', 'blank'],
  [
    { questions: [{ ...choice, prompt: '\t' }] },
    'questions[0].prompt',
    'blank',
  ],
  [
    { questions: [{ ...choice, options: [] }] },
    'questions[0].options',
    'missing_options',
  ],
  [
    { questions: [{ ...choice, type: 'multi', options: undefined }] },
    'questions[0].options',
    'missing_options',
  ],
  [
    { questions: [{ ...choice, options: [{ value: ' ', label: 'Okay' }] }] },
    'questions[0].options[0].value',
    'blank',
  ],
  [
    { questions: [{ ...choice, options: [{ value: 'x', label: '' }] }] },
    'questions[0].options[0].label',
    'blank',
  ],
  [
    {
      questions: [
        {
          ...choice,
          options: [
            { value: 'x', label: 'A' },
            { value: 'x', label: 'B' },
          ],
        },
      ],
    },
    'questions[0].options[1].value',
    'duplicate_value',
  ],
  [
    {
      questions: [
        { ...choice, options: [{ value: 'x', label: ' Type something. ' }] },
      ],
    },
    'questions[0].options[0].label',
    'reserved_label',
  ],
  [
    { questions: [{ ...choice, type: 'text' }] },
    'questions[0].options',
    'unexpected_options',
  ],
  [
    { questions: [{ ...choice, type: 'confirm' }] },
    'questions[0].options',
    'unexpected_options',
  ],
] as const)('reports structured semantic issues for %j', (input, path, code) => {
  const result = validateQuestions(input);
  expect(result).toMatchObject({
    valid: false,
    issues: [{ path, code, message: expect.any(String) }],
  });
});

it.each([
  null,
  {},
  { questions: [null] },
  { title: 7, questions: [choice] },
  { questions: [{ ...choice, type: 'number' }] },
  { questions: [{ ...choice, type: null }] },
  {
    questions: [
      { ...choice, options: [{ value: 'x', label: 'X', preview: 1 }] },
    ],
  },
  {
    questions: [
      { ...choice, options: [{ value: 'x', label: 'X', description: false }] },
    ],
  },
  { questions: [{ ...choice, required: 'yes' }] },
  { questions: [{ ...choice, options: [{ value: 2, label: 'Two' }] }] },
  {
    questions: [
      { ...choice, options: [{ value: 'x', label: 'X', recommended: 'yes' }] },
    ],
  },
])('reports shape errors without throwing for %j', (input) => {
  expect(validateQuestions(input)).toMatchObject({
    valid: false,
    issues: expect.any(Array),
  });
});

it('aggregates independent issues and scopes duplicate values to each question', () => {
  const result = validateQuestions({
    questions: [
      { ...choice, header: ' ', prompt: '' },
      { ...choice, id: 'next' },
    ],
  });
  expect(result).toMatchObject({
    valid: false,
    issues: [
      { path: 'questions[0].header', code: 'blank' },
      { path: 'questions[0].prompt', code: 'blank' },
    ],
  });
  expect(
    validateQuestions({ questions: [choice, { ...choice, id: 'next' }] }).valid,
  ).toBe(true);
});

it.each([
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
])('accepts prototype-named ids and values and detects only real duplicates of %s', (key) => {
  const questions = [
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ].map((id) => ({
    ...choice,
    id,
    type: 'multi' as const,
    options: [
      { value: '__proto__', label: 'Prototype' },
      { value: 'constructor', label: 'Constructor' },
      { value: 'toString', label: 'String' },
      { value: 'hasOwnProperty', label: 'Own' },
    ],
  }));
  expect(validateQuestions({ questions })).toEqual({
    valid: true,
    value: { questions },
  });
  const duplicateId = { ...questions[0], id: key };
  expect(
    validateQuestions({ questions: [...questions, duplicateId] }),
  ).toMatchObject({
    valid: false,
    issues: [{ path: 'questions[4].id', code: 'duplicate_id' }],
  });
  expect(
    validateQuestions({
      questions: [
        {
          ...questions[0],
          options: [
            ...questions[0].options,
            { value: key, label: 'Duplicate' },
          ],
        },
      ],
    }),
  ).toMatchObject({
    valid: false,
    issues: [
      { path: 'questions[0].options[4].value', code: 'duplicate_value' },
    ],
  });
});

it('accepts text and confirm without options, including an empty array', () => {
  const questions = [
    { id: 'text', header: 'Text', prompt: 'Your thoughts?', type: 'text' },
    {
      id: 'confirm',
      header: 'Confirm',
      prompt: 'Proceed?',
      type: 'confirm',
      options: [],
    },
  ];
  expect(validateQuestions({ questions })).toEqual({
    valid: true,
    value: { questions },
  });
});

it('accepts an unbounded questionnaire and defaults omitted types to single', () => {
  const questions = Array.from({ length: 8 }, (_, i) => ({
    id: `q${i}`,
    header: 'Choose',
    prompt: 'Which approach?',
    required: true,
    options: Array.from({ length: 12 }, (_, j) => ({
      value: `v${j}`,
      label: `Option ${j}`,
      description: 'Details',
      preview: '# Preview',
      recommended: j === 1,
    })),
  }));
  const result = validateQuestions({ title: 'Planning', questions });
  expect(result).toEqual({
    valid: true,
    value: {
      title: 'Planning',
      questions: questions.map((q) => ({ ...q, type: 'single' })),
    },
  });
  const schema = JSON.stringify(questionParameters);
  expect(schema).not.toMatch(/maxItems|maxLength/);
});
