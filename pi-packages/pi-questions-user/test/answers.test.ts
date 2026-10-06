import { expect, it } from 'vitest';
import {
  buildResult,
  createState,
  markSkipped,
  selectOption,
  setCustomText,
  setOptionNote,
  setQuestionNote,
  toggleOption,
} from '../src/answers.js';
import type { Questionnaire } from '../src/schema.js';

it('combines multi picks with custom text and preserves question and per-option notes', () => {
  const initial = createState({
    questions: [
      {
        id: 'many',
        header: 'Many',
        prompt: 'Which?',
        type: 'multi',
        options: [
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ],
      },
    ],
  });
  let state = toggleOption(toggleOption(initial, 'many', 'a'), 'many', 'b');
  state = toggleOption(state, 'many', 'a');
  state = setCustomText(state, 'many', 'Also gamma');
  state = setQuestionNote(state, 'many', 'Keep it simple');
  state = setOptionNote(state, 'many', 'b', 'Best fit');
  const result = buildResult(state);
  expect(result.details.answers.many).toEqual({
    status: 'answered',
    values: ['b'],
    labels: ['Beta'],
    customText: 'Also gamma',
    note: 'Keep it simple',
    optionNotes: { b: 'Best fit' },
  });
  expect(result.content[0].text).toContain('Also gamma');
  expect(result.content[0].text).toContain('Keep it simple');
  expect(result.content[0].text).toContain('Beta: Best fit');
  expect(initial.answers.many).toEqual({
    status: 'skipped',
    values: [],
    labels: [],
  });
});

it('single free text replaces picks, picks replace free text, and blank text is unanswered', () => {
  const initial = createState(questionnaire);
  const custom = setCustomText(
    selectOption(initial, 'choice', 'safe'),
    'choice',
    'My plan',
  );
  expect(custom.answers.choice).toEqual({
    status: 'answered',
    values: [],
    labels: [],
    customText: 'My plan',
  });
  expect(selectOption(custom, 'choice', 'fast').answers.choice).toEqual({
    status: 'answered',
    values: ['fast'],
    labels: ['Fast'],
  });
  expect(setCustomText(custom, 'choice', '  ').answers.choice).toEqual({
    status: 'skipped',
    values: [],
    labels: [],
  });
});

it('marks required questions skipped without inventing an answer and retains annotations', () => {
  let state = createState({
    questions: [
      {
        id: 'required',
        header: 'Required',
        prompt: 'Explain',
        type: 'text',
        required: true,
      },
    ],
  });
  state = setQuestionNote(
    setCustomText(state, 'required', 'Draft'),
    'required',
    'Later',
  );
  const result = buildResult(markSkipped(state, 'required'));
  expect(result.details.answers.required).toEqual({
    status: 'skipped',
    values: [],
    labels: [],
    note: 'Later',
  });
  expect(result.content[0].text).toContain('Skipped (unanswered)');
});

it('cancellation and abort preserve recorded answers and warn against assuming unanswered ones', () => {
  const state = selectOption(createState(questionnaire), 'choice', 'safe');
  for (const options of [
    { cancelled: true },
    { cancelled: true, error: 'aborted' as const },
  ]) {
    const result = buildResult(state, options);
    expect(result.details).toMatchObject({
      ...options,
      answers: {
        choice: { status: 'answered', values: ['safe'], labels: ['Safe'] },
        confirm: { status: 'skipped', values: [], labels: [] },
      },
    });
    expect(result.content[0].text).toContain('Cancelled');
    expect(result.content[0].text).toContain(
      'Unanswered questions must not be assumed',
    );
  }
});

it('builds detached results and supports special ids safely', () => {
  const state = createState({
    questions: [
      {
        id: '__proto__',
        header: 'Special',
        prompt: 'Thoughts?',
        type: 'text',
      },
    ],
  });
  const result = buildResult(setCustomText(state, '__proto__', 'Fine'));
  expect(Object.hasOwn(result.details.answers, '__proto__')).toBe(true);
  result.details.questions[0].header = 'Changed';
  result.details.answers.__proto__.values.push('invented');
  expect(state.questions[0].header).toBe('Special');
  expect(state.answers.__proto__.values).toEqual([]);
});

it.each(
  ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].flatMap((id) =>
    (['single', 'multi'] as const).map((type) => ({ id, type })),
  ),
)('round-trips prototype-named ids, values and notes for $id ($type)', ({
  id,
  type,
}) => {
  const initial = createState({
    questions: [
      {
        id,
        header: 'Special',
        prompt: 'Choose',
        type,
        options: [
          { value: '__proto__', label: 'Prototype' },
          { value: 'constructor', label: 'Constructor' },
          { value: 'toString', label: 'String' },
          { value: 'hasOwnProperty', label: 'Own' },
        ],
      },
    ],
  });
  let state = initial;
  for (const value of [
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ]) {
    if (type === 'single') state = selectOption(state, id, value);
    else {
      state = toggleOption(state, id, value);
      state = toggleOption(state, id, value);
      state = toggleOption(state, id, value);
    }
    state = setOptionNote(state, id, value, `Note for ${value}`);
  }
  state = setQuestionNote(state, id, 'Question note');
  const result = buildResult(state);
  const expected = {
    status: 'answered',
    values:
      type === 'single'
        ? ['hasOwnProperty']
        : ['__proto__', 'constructor', 'toString', 'hasOwnProperty'],
    labels:
      type === 'single'
        ? ['Own']
        : ['Prototype', 'Constructor', 'String', 'Own'],
    note: 'Question note',
    optionNotes: {
      ['__proto__']: 'Note for __proto__',
      constructor: 'Note for constructor',
      toString: 'Note for toString',
      hasOwnProperty: 'Note for hasOwnProperty',
    },
  };
  expect(Object.hasOwn(state.answers, id)).toBe(true);
  expect(state.answers[id]).toEqual(expected);
  expect(result.details.answers[id]).toEqual(expected);
  const restored = JSON.parse(JSON.stringify(result.details));
  expect(Object.hasOwn(restored.answers, id)).toBe(true);
  expect(restored.answers[id]).toEqual(expected);
  expect(result.content[0].text).toContain('Prototype: Note for __proto__');
  expect(initial.answers[id].status).toBe('skipped');
  state = setOptionNote(state, id, '__proto__', '  ');
  expect(Object.hasOwn(state.answers[id].optionNotes ?? {}, '__proto__')).toBe(
    false,
  );
  expect(result.details.answers[id].optionNotes?.__proto__).toBe(
    'Note for __proto__',
  );
});

it.each([
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
])('rejects inherited answers instead of treating %s as recorded state', (id) => {
  for (const type of ['single', 'multi'] as const) {
    const state = createState({
      questions: [
        {
          id,
          header: 'Special',
          prompt: 'Choose',
          type,
          options: [{ value: '__proto__', label: 'Prototype' }],
        },
      ],
    });
    state.answers = Object.create({ [id]: state.answers[id] });
    const actions = [
      () =>
        type === 'single'
          ? selectOption(state, id, '__proto__')
          : toggleOption(state, id, '__proto__'),
      () => setCustomText(state, id, 'Custom'),
      () => setQuestionNote(state, id, 'Note'),
      () => setOptionNote(state, id, '__proto__', 'Note'),
      () => markSkipped(state, id),
      () => buildResult(state),
    ];
    for (const action of actions) expect(action).toThrow();
  }
});

it('rejects unknown references and incompatible actions instead of inventing options', () => {
  const state = createState(questionnaire);
  expect(() => selectOption(state, 'missing', 'safe')).toThrow(
    'Unknown question',
  );
  expect(() => selectOption(state, 'choice', 'missing')).toThrow(
    'Unknown option',
  );
  expect(() => toggleOption(state, 'choice', 'safe')).toThrow('multi');
  expect(() => setCustomText(state, 'confirm', 'Maybe')).toThrow('Confirm');
  expect(() => setOptionNote(state, 'choice', 'missing', 'Note')).toThrow(
    'Unknown option',
  );
});

const questionnaire: Questionnaire = {
  title: 'Plan',
  questions: [
    {
      id: 'choice',
      header: 'Approach',
      prompt: 'Which?',
      type: 'single',
      options: [
        { value: 'safe', label: 'Safe', recommended: true },
        { value: 'fast', label: 'Fast' },
      ],
    },
    { id: 'confirm', header: 'Confirm', prompt: 'Proceed?', type: 'confirm' },
  ],
};

it('never preselects recommendations and reports selections with ids, labels and metadata', () => {
  const initial = createState(questionnaire);
  expect(initial.answers.choice).toEqual({
    status: 'skipped',
    values: [],
    labels: [],
  });
  const state = selectOption(
    selectOption(initial, 'choice', 'safe'),
    'choice',
    'fast',
  );
  const result = buildResult(selectOption(state, 'confirm', 'no'));
  expect(result.details).toMatchObject({
    title: 'Plan',
    cancelled: false,
    answers: {
      choice: { status: 'answered', values: ['fast'], labels: ['Fast'] },
      confirm: { status: 'answered', values: ['no'], labels: ['No'] },
    },
    questions: [
      { id: 'choice', type: 'single' },
      {
        id: 'confirm',
        type: 'confirm',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
    ],
  });
  expect(result.content[0].text).toContain('Approach [choice]: Fast');
  expect(initial.answers.choice.values).toEqual([]);
});
