import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { expect, it, vi } from 'vitest';
import { createState, setOptionNote } from '../src/answers.js';
import { runRpcQuestions } from '../src/rpc.js';

type RpcUI = Pick<ExtensionUIContext, 'select' | 'input'>;

const single = {
  id: 'plan',
  header: 'Plan',
  prompt: 'Choose a plan',
  type: 'single' as const,
  options: [
    { value: 'safe', label: 'Safe', recommended: true },
    { value: 'fast', label: 'Fast' },
  ],
};

function scriptedUI(
  selects: ((options: string[]) => string | undefined)[],
  inputs: (string | undefined)[] = [],
): RpcUI {
  return {
    select: vi.fn(async (_title, options) => selects.shift()?.(options)),
    input: vi.fn(async () => inputs.shift()),
  };
}

it('multi toggles repeatedly, combines custom text, and finishes only on Done', async () => {
  const ui = scriptedUI(
    [
      (options) => options.find((row) => row.includes('1.')),
      (options) => options.find((row) => row.includes('2.')),
      (options) => options.find((row) => row.includes('1.')),
      () => 'Type something.',
      () => 'Done',
    ],
    ['Also custom'],
  );
  const result = await runRpcQuestions(
    createState({ questions: [{ ...single, type: 'multi' }] }),
    ui,
  );
  expect(result.details.answers.plan).toEqual({
    status: 'answered',
    values: ['fast'],
    labels: ['Fast'],
    customText: 'Also custom',
  });
  expect(ui.select).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.arrayContaining([
      '[ ] 1. Safe (recommended)',
      '[x] 2. Fast',
      'Done',
    ]),
    expect.anything(),
  );
});

it.each(
  ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].flatMap((key) =>
    (['single', 'multi'] as const).map((type) => ({ key, type })),
  ),
)('RPC preserves $key ids, values and saved notes ($type)', async ({
  key,
  type,
}) => {
  const initial = setOptionNote(
    createState({
      questions: [
        {
          ...single,
          id: key,
          type,
          options: [{ value: key, label: 'Special' }],
        },
      ],
    }),
    key,
    key,
    'Saved note',
  );
  const restored = JSON.parse(JSON.stringify(initial));
  const result = await runRpcQuestions(
    restored,
    scriptedUI([(rows) => rows[0], () => 'Done']),
  );
  const details = JSON.parse(JSON.stringify(result.details));
  expect(details.cancelled).toBe(false);
  expect(Object.hasOwn(details.answers, key)).toBe(true);
  expect(details.answers[key]).toEqual({
    status: 'answered',
    values: [key],
    labels: ['Special'],
    optionNotes: { [key]: 'Saved note' },
  });
  expect(result.content[0].text).toContain('Special: Saved note');
});

it.each([
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
])('RPC never presents inherited answers for %s as recorded multi picks', async (id) => {
  const state = createState({
    questions: [{ ...single, id, type: 'multi' }],
  });
  state.answers = Object.create({
    [id]: { status: 'answered', values: ['safe'], labels: ['Safe'] },
  });
  const ui = scriptedUI([() => 'Done']);
  await expect(runRpcQuestions(state, ui)).rejects.toThrow();
  expect(ui.select).not.toHaveBeenCalled();
});

it('single free text is input, and required questions may be explicitly skipped', async () => {
  const result = await runRpcQuestions(
    createState({
      questions: [single, { ...single, id: 'next', required: true }],
    }),
    scriptedUI([() => 'Type something.', () => 'Skip'], ['My alternative']),
  );
  expect(result.details).toMatchObject({
    cancelled: false,
    answers: {
      plan: {
        status: 'answered',
        values: [],
        labels: [],
        customText: 'My alternative',
      },
      next: { status: 'skipped', values: [], labels: [] },
    },
  });
});

it('cancellation retains prior answers and multi selections without assuming the rest', async () => {
  const result = await runRpcQuestions(
    createState({
      questions: [
        single,
        { ...single, id: 'many', type: 'multi' },
        { id: 'later', header: 'Later', prompt: 'Explain', type: 'text' },
      ],
    }),
    scriptedUI(
      [
        (options) => options[0],
        (options) => options[1],
        () => 'Type something.',
      ],
      [undefined],
    ),
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    answers: {
      plan: { status: 'answered', values: ['safe'] },
      many: { status: 'answered', values: ['fast'] },
      later: { status: 'skipped', values: [] },
    },
  });
  expect(result.content[0].text).toContain(
    'Unanswered questions must not be assumed',
  );
});

it('disambiguates duplicate option labels and labels resembling control rows', async () => {
  const result = await runRpcQuestions(
    createState({
      questions: [
        {
          ...single,
          options: [
            { value: 'a', label: 'Done' },
            { value: 'b', label: 'Done' },
            { value: 'c', label: 'Skip' },
          ],
        },
      ],
    }),
    scriptedUI([(options) => options[1]]),
  );
  expect(result.details.answers.plan.values).toEqual(['b']);
});

it.each([
  'single',
  'text',
  'confirm',
] as const)('undefined in a %s dialog means cancellation, not skipping', async (type) => {
  const question =
    type === 'single'
      ? single
      : { id: 'plan', header: 'Plan', prompt: 'Choose', type };
  const result = await runRpcQuestions(
    createState({ questions: [question] }),
    scriptedUI([() => undefined]),
  );
  expect(result.details.cancelled).toBe(true);
  expect(result.details.error).toBeUndefined();
});

it('Done without picks and blank text are skipped, not implied answers', async () => {
  const result = await runRpcQuestions(
    createState({
      questions: [
        { ...single, type: 'multi' },
        { id: 'text', header: 'Text', prompt: 'Explain', type: 'text' },
      ],
    }),
    scriptedUI([() => 'Done'], ['  ']),
  );
  expect(result.details.answers).toEqual({
    plan: { status: 'skipped', values: [], labels: [] },
    text: { status: 'skipped', values: [], labels: [] },
  });
});

it('a pre-aborted request does not open a dialog', async () => {
  const controller = new AbortController();
  controller.abort();
  const ui = scriptedUI([]);
  const result = await runRpcQuestions(
    createState({ questions: [single] }),
    ui,
    controller.signal,
  );
  expect(result.details).toMatchObject({ cancelled: true, error: 'aborted' });
  expect(ui.select).not.toHaveBeenCalled();
});

it('abort settles even if the host ignores the signal and retains earlier multi picks', async () => {
  const controller = new AbortController();
  let first = true;
  const ui: RpcUI = {
    select: vi.fn(async (_title, options, opts) => {
      expect(opts?.signal).toBe(controller.signal);
      if (first) {
        first = false;
        return options[0];
      }
      controller.abort();
      return new Promise<string | undefined>(() => {});
    }),
    input: vi.fn(),
  };
  const result = await runRpcQuestions(
    createState({ questions: [{ ...single, type: 'multi' }] }),
    ui,
    controller.signal,
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    error: 'aborted',
    answers: {
      plan: { status: 'answered', values: ['safe'], labels: ['Safe'] },
    },
  });
}, 200);

it('does not record a choice returned simultaneously with abort', async () => {
  const controller = new AbortController();
  const ui = scriptedUI([
    (options) => {
      controller.abort();
      return options[0];
    },
  ]);
  const result = await runRpcQuestions(
    createState({ questions: [single] }),
    ui,
    controller.signal,
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    error: 'aborted',
    answers: {
      plan: { status: 'skipped', values: [] },
    },
  });
});

it('synchronously throwing aborted host dialogs do not leak a rejection', async () => {
  const controller = new AbortController();
  const ui: RpcUI = {
    select: () => {
      controller.abort();
      throw new Error('Host closed');
    },
    input: vi.fn(),
  };
  const result = await runRpcQuestions(
    createState({ questions: [single] }),
    ui,
    controller.signal,
  );
  expect(result.details).toMatchObject({ cancelled: true, error: 'aborted' });
});

it('does not relabel unrelated host failures as user cancellation', async () => {
  const ui: RpcUI = {
    select: vi.fn(async () => {
      throw new Error('Host failure');
    }),
    input: vi.fn(),
  };
  await expect(
    runRpcQuestions(createState({ questions: [single] }), ui),
  ).rejects.toThrow('Host failure');
});

it('asks single, text and confirm sequentially and maps labels back to stable values', async () => {
  const ui: RpcUI = {
    select: vi.fn<RpcUI['select']>(
      async (_title, options) =>
        options.find((option) => option.includes('Fast')) ?? 'No',
    ),
    input: vi.fn(async () => 'My rationale'),
  };
  const result = await runRpcQuestions(
    createState({
      title: 'Planning',
      questions: [
        single,
        { id: 'text', header: 'Rationale', prompt: 'Why?', type: 'text' },
        {
          id: 'confirm',
          header: 'Confirm',
          prompt: 'Proceed?',
          type: 'confirm',
        },
      ],
    }),
    ui,
  );
  expect(result.details).toMatchObject({
    cancelled: false,
    answers: {
      plan: { status: 'answered', values: ['fast'], labels: ['Fast'] },
      text: {
        status: 'answered',
        values: [],
        labels: [],
        customText: 'My rationale',
      },
      confirm: { status: 'answered', values: ['no'], labels: ['No'] },
    },
  });
  expect(ui.select).toHaveBeenCalledWith(
    expect.stringContaining('Choose a plan'),
    expect.arrayContaining(['Type something.']),
    expect.anything(),
  );
  expect(ui.input).toHaveBeenCalledWith(
    expect.stringContaining('Why?'),
    undefined,
    expect.anything(),
  );
});

it('uses localized control rows and maps them back', async () => {
  const seen: string[][] = [];
  const ui: RpcUI = {
    select: vi.fn<RpcUI['select']>(async (_title, options) => {
      seen.push(options);
      return ['Escribe algo.', 'Listo', 'Saltar'][seen.length - 1];
    }),
    input: vi.fn(async () => 'mi texto'),
  };
  const labels = {
    typeSomething: 'Escribe algo.',
    skip: 'Saltar',
    done: 'Listo',
  };
  const result = await runRpcQuestions(
    createState({
      labels,
      questions: [
        { ...single, type: 'multi' as const },
        { id: 'c', header: 'C', prompt: 'Ok?', type: 'confirm' as const },
      ],
    }),
    ui,
  );
  expect(seen[0]).toEqual(
    expect.arrayContaining(['Escribe algo.', 'Listo', 'Saltar']),
  );
  expect(result.details.answers.plan.customText).toBe('mi texto');
  expect(result.details.answers.c.status).toBe('skipped');
});

it('asks confirm with localized Yes/No and stable values', async () => {
  const ui: RpcUI = {
    select: vi.fn<RpcUI['select']>(async (_t, options) => {
      expect(options.slice(0, 2)).toEqual(['Sí', 'No']);
      return 'Sí';
    }),
    input: vi.fn(),
  };
  const result = await runRpcQuestions(
    createState({
      labels: { yes: 'Sí' },
      questions: [
        { id: 'c', header: 'C', prompt: 'Ok?', type: 'confirm' as const },
      ],
    }),
    ui,
  );
  expect(result.details.answers.c).toMatchObject({
    values: ['yes'],
    labels: ['Sí'],
  });
});
