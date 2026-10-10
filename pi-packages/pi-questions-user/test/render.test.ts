import type { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import type { RenderCardOptions } from '@thoth-agents/pi-core';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildResult,
  createState,
  selectOption,
  setCustomText,
  setOptionNote,
  setQuestionNote,
  toggleOption,
} from '../src/answers.js';
import { createQuestionTool } from '../src/index.js';
import { createQuestionRenderers, summarizeResult } from '../src/render.js';

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips SGR
const strip = (text: string) => text.replace(/\[[0-9;]*m/g, '');
const summarize = (
  details: Parameters<typeof summarizeResult>[0],
  options?: Parameters<typeof summarizeResult>[2],
) => {
  const result = summarizeResult(details, '', options);
  return { ...result, rows: result.rows.map(strip) };
};

const theme = {
  fg: (_c: string, t: string) => t,
  bg: (_c: string, t: string) => t,
  bold: (t: string) => t,
} as unknown as Theme;

const questionnaire = {
  title: 'Plan',
  questions: [
    {
      id: 'a',
      header: 'Approach',
      prompt: 'p',
      type: 'single' as const,
      options: [{ value: 'x', label: 'Safe' }],
    },
    { id: 'b', header: 'Why', prompt: 'p', type: 'text' as const },
    { id: 'c', header: 'Skipme', prompt: 'p', type: 'text' as const },
  ],
};

function answered() {
  let state = createState(questionnaire);
  state = selectOption(state, 'a', 'x');
  state = setQuestionNote(state, 'a', 'careful');
  state = setCustomText(state, 'b', 'because');
  return state;
}

const context = (extra: Record<string, unknown> = {}) =>
  ({
    state: {},
    isPartial: false,
    isError: false,
    executionStarted: true,
    ...extra,
  }) as never;

let token: symbol | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
});

describe('question renderers', () => {
  it('summarizes single, custom, notes and skipped answers', () => {
    const done = summarize(buildResult(answered()).details);
    expect(done.status).toBe('completed');
    expect(done.rows).toEqual([
      'Approach  ✓ Safe',
      '          ✎ careful',
      'Why       ✓ “because”',
      'Skipme    – skipped',
    ]);
  });

  it('joins multi picks with custom text and lists option notes', () => {
    let state = createState({
      questions: [
        {
          id: 'm',
          header: 'Pick',
          prompt: 'p',
          type: 'multi' as const,
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
          ],
        },
      ],
    });
    state = toggleOption(state, 'm', 'a');
    state = toggleOption(state, 'm', 'b');
    state = setCustomText(state, 'm', 'more');
    state = setOptionNote(state, 'm', 'a', 'because');
    expect(summarize(buildResult(state).details).rows).toEqual([
      'Pick  ✓ Alpha, Beta, “more”',
      '      ✎ Alpha: because',
    ]);
  });

  it('keeps partial answers when cancelled and reports it as status', () => {
    const cancelled = summarize(
      buildResult(answered(), { cancelled: true }).details,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelled).toBe('Cancelled');
    expect(cancelled.rows[0]).toBe('Approach  ✓ Safe');
    expect(cancelled.rows.join('\n')).not.toContain('kept');
  });

  it('reports errors on one line and plain text without details', () => {
    const failed = summarize(
      buildResult(answered(), { error: 'no_ui' }).details,
    );
    expect(failed.status).toBe('failed');
    expect(failed.rows[0]).toBe('✗ Error: no_ui');
    expect(summarizeResult(undefined, 'boom')).toEqual({
      status: 'failed',
      rows: ['boom'],
    });
  });

  it('truncates a long note when collapsed and wraps it with prompts when expanded', () => {
    const state = setQuestionNote(
      selectOption(
        createState({
          questions: [
            {
              id: 'a',
              header: 'Approach',
              prompt: 'Which approach should we take?',
              type: 'single' as const,
              options: [{ value: 'x', label: 'Safe' }],
            },
          ],
        }),
        'a',
        'x',
      ),
      'a',
      'one two three four five six seven eight',
    );
    const details = buildResult(state).details;
    const collapsed = summarize(details, { width: 24 }).rows;
    expect(collapsed).toEqual(['Approach  ✓ Safe', '          ✎ one two thr…']);
    const expanded = summarize(details, { width: 24, expanded: true }).rows;
    expect(expanded[0]).toBe('Which approach should we');
    expect(expanded[1]).toBe('take?');
    expect(expanded.slice(2)).toEqual([
      'Approach  ✓ Safe',
      '          ✎ one two',
      '            three four',
      '            five six',
      '            seven eight',
    ]);
  });

  it('caps and ellipsizes long headers; narrow widths never overflow', () => {
    const state = createState({
      questions: [
        {
          id: 'a',
          header: 'A very long header indeed',
          prompt: 'p',
          type: 'text' as const,
        },
      ],
    });
    const details = buildResult(state).details;
    expect(summarize(details).rows).toEqual(['A very long hea…  – skipped']);
    for (const width of [1, 3, 6, 12])
      for (const row of summarize(details, { width }).rows)
        expect(visibleWidth(row)).toBeLessThanOrEqual(width);
  });

  it.each([
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ])('summarizes own answers for %s but ignores inherited answers', (key) => {
    const state = setOptionNote(
      selectOption(
        createState({
          questions: [
            {
              id: key,
              header: 'Special',
              prompt: 'Choose',
              type: 'single',
              options: [{ value: key, label: 'Special option' }],
            },
          ],
        }),
        key,
        key,
      ),
      key,
      key,
      'Saved note',
    );
    const details = JSON.parse(JSON.stringify(buildResult(state).details));
    expect(summarize(details).rows).toEqual([
      'Special  ✓ Special option',
      '         ✎ Special option: Saved note',
    ]);
    details.answers = Object.create({ [key]: details.answers[key] });
    expect(summarize(details).rows).toEqual(['Special  – skipped']);
  });

  it('falls back to a native padded box: pending line, then title plus answers once', () => {
    const renderers = createQuestionRenderers();
    const call = renderers.renderCall?.(
      questionnaire as never,
      theme,
      context({ isPartial: true }),
    );
    const callText = call?.render(60).join('\n');
    expect(callText).toContain('Ask user · Plan');
    expect(callText).toContain('? Approach · ? Why · ? Skipme');
    expect(callText).not.toContain('questions:');
    const ctx = context();
    const answeredCall = renderers.renderCall?.(
      questionnaire as never,
      theme,
      ctx,
    );
    const result = renderers.renderResult?.(
      buildResult(answered()),
      { expanded: false, isPartial: false },
      theme,
      ctx,
    );
    const out = result?.render(60).join('\n');
    expect(out).toContain('Approach  ✓ Safe');
    expect(out).toContain('Why       ✓ “because”');
    expect(out).not.toContain('╭');
    const settled = answeredCall?.render(60).join('\n');
    expect(settled).toContain('Ask user · Plan');
    expect(settled).not.toContain('?');
    expect(settled).not.toContain('Safe');
  });

  it('omits the title suffix when no title was supplied', () => {
    const call = createQuestionRenderers().renderCall?.(
      { questions: questionnaire.questions } as never,
      theme,
      context({ isPartial: true }),
    );
    const text = call?.render(60).join('\n') ?? '';
    expect(text).toContain('Ask user');
    expect(text).not.toContain('Ask user ·');
  });

  it('renders through the pi-core kit: one block, cancelled footer, partial answers', () => {
    const renderers = createQuestionRenderers();
    const ctx = context();
    const result = renderers.renderResult?.(
      buildResult(answered(), { cancelled: true }),
      { expanded: true, isPartial: false },
      theme,
      ctx,
    );
    expect(result?.render(60).join('\n')).not.toContain('╰');
    // Same component instance picks the kit up on the next render.
    token = registerRenderKit(createTestRenderKit(), {});
    result?.invalidate();
    const out = result?.render(60).join('\n') ?? '';
    expect(out).toContain('╰');
    expect(out).toContain('Approach  ✓ Safe');
    expect(out).toContain('✗');
    expect(out).toContain('Cancelled');
    const call = renderers.renderCall?.(questionnaire as never, theme, ctx);
    const top = call?.render(60).join('\n') ?? '';
    expect(top).toContain('╭─ Ask user · Plan');
    expect(top).not.toContain('Safe');
    expect(top).not.toContain('╰');
  });

  it('shows prompts only when expanded through the kit', () => {
    token = registerRenderKit(createTestRenderKit(), {});
    const make = (expanded: boolean) =>
      createQuestionRenderers()
        .renderResult?.(
          buildResult(answered()),
          { expanded, isPartial: false },
          theme,
          context(),
        )
        .render(60)
        .join('\n') ?? '';
    expect(make(false)).not.toContain('p\nApproach');
    expect(make(true)).toContain('p\nApproach');
  });

  it('marks error results', () => {
    const renderers = createQuestionRenderers();
    const result = renderers.renderResult?.(
      buildResult(createState(questionnaire), { error: 'invalid_questions' }),
      { expanded: false, isPartial: false },
      theme,
      context({ isError: true }),
    );
    expect(result?.render(60).join('\n')).toContain(
      '✗ Error: invalid_questions',
    );
  });

  it('gives call and result parts the same final border tone', () => {
    const base = createTestRenderKit();
    const seen: RenderCardOptions[] = [];
    token = registerRenderKit(
      {
        ...base,
        card(t, options, width) {
          seen.push(options);
          return base.card(t, options, width);
        },
      },
      {},
    );
    const renderers = createQuestionRenderers();
    const run = (details: ReturnType<typeof buildResult>, isError = false) => {
      seen.length = 0;
      const ctx = context({ isError });
      // Pi builds the call slot first, before the result exists.
      const call = renderers.renderCall?.(questionnaire as never, theme, ctx);
      call?.render(60);
      const result = renderers.renderResult?.(
        details,
        { expanded: false, isPartial: false },
        theme,
        ctx,
      );
      seen.length = 0;
      // Pi then re-renders both slots with the result present.
      renderers.renderCall?.(questionnaire as never, theme, ctx).render(60);
      result?.render(60);
      return seen.map((o) => [o.part, !!o.isSuccess, !!o.isError]);
    };
    expect(run(buildResult(answered()))).toEqual([
      ['start', true, false],
      ['end', true, false],
    ]);
    expect(run(buildResult(answered(), { error: 'no_ui' }), true)).toEqual([
      ['start', false, true],
      ['end', false, true],
    ]);
  });

  it('localizes skipped/cancelled/error rows with the labels carried in details', () => {
    const state = createState({
      labels: {
        skipped: 'omitida',
        cancelled: 'Cancelado',
        error: 'Error',
      },
      questions: questionnaire.questions.slice(2),
    });
    const cancelled = summarize(
      buildResult(state, { cancelled: true }).details,
    );
    expect(cancelled.rows).toEqual(['Skipme  – omitida']);
    expect(cancelled.cancelled).toBe('Cancelado');
  });

  it('aligns the header column and wraps long answers under the answer column', () => {
    const state = setCustomText(
      createState({
        questions: [
          { id: 'a', header: 'A', prompt: 'p', type: 'text' as const },
          { id: 'b', header: 'Longer', prompt: 'p', type: 'text' as const },
        ],
      }),
      'b',
      'one two three four five six',
    );
    const { rows } = summarize(buildResult(state).details, {
      width: 22,
      expanded: true,
    });
    expect(rows.slice(1, 3)).toEqual(['A       – skipped', 'p']);
    expect(rows.slice(3)).toEqual([
      'Longer  ✓ “one two',
      '          three four',
      '          five six”',
    ]);
  });

  it('lists validation issues under the error row', () => {
    const details = buildResult(createState(questionnaire), {
      error: 'invalid_questions',
      issues: [
        {
          path: 'questions[0].id',
          code: 'blank',
          message: 'Must not be blank.',
        },
      ],
    }).details;
    expect(summarize(details, { expanded: true }).rows.slice(0, 2)).toEqual([
      '✗ Error: invalid_questions',
      '  questions[0].id: Must not be blank.',
    ]);
  });

  describe('one-line collapsed rows', () => {
    const blank = () => createState(questionnaire);
    const issues = [
      {
        path: 'questions[0].id',
        code: 'blank' as const,
        message: 'Must not be blank.',
      },
    ];

    it.each([
      'no_ui',
      'aborted',
    ] as const)('renders %s as a single error row, collapsed and expanded', (error) => {
      const details = buildResult(blank(), { cancelled: true, error }).details;
      expect(summarize(details).cancelled).toBeUndefined();
      expect(summarize(details).rows).toEqual([`✗ Error: ${error}`]);
      expect(summarize(details, { expanded: true }).rows).toEqual([
        `✗ Error: ${error}`,
      ]);
    });

    describe('real execute() error results', () => {
      const run = async (kind: 'no_ui' | 'aborted') => {
        const controller = new AbortController();
        if (kind === 'aborted') controller.abort();
        return createQuestionTool().execute(
          'call',
          questionnaire as never,
          controller.signal,
          undefined,
          { hasUI: kind === 'aborted' } as never,
        );
      };

      it.each([
        'no_ui',
        'aborted',
      ] as const)('%s renders one error row and no Cancelled, native and kit, collapsed and expanded', async (kind) => {
        const result = await run(kind);
        expect(result.details).toMatchObject({ cancelled: true, error: kind });
        const lines = (expanded: boolean) =>
          createQuestionRenderers()
            .renderResult?.(
              result,
              { expanded, isPartial: false },
              theme,
              context(),
            )
            ?.render(60)
            .map(strip)
            .map((line) => line.trim())
            .filter(Boolean) ?? [];
        for (const expanded of [false, true]) {
          expect(lines(expanded)).toEqual([`✗ Error: ${kind}`]);
        }
        token = registerRenderKit(createTestRenderKit(), {});
        for (const expanded of [false, true]) {
          const out = lines(expanded).join(' | ');
          expect(out.match(/Error: /g)).toHaveLength(1);
          expect(out).not.toContain('Cancelled');
          expect(out).toContain('✗');
          expect(out).toContain(`Error: ${kind}`);
        }
      });
    });

    it('truncates the error row to the width', () => {
      const { rows } = summarize(
        buildResult(blank(), { error: 'invalid_questions' }).details,
        { width: 12 },
      );
      expect(rows).toHaveLength(1);
      expect(visibleWidth(rows[0] ?? '')).toBeLessThanOrEqual(12);
    });

    it('shows validation issues only when expanded', () => {
      const details = buildResult(blank(), {
        error: 'invalid_questions',
        issues,
      }).details;
      expect(summarize(details).rows).toEqual(['✗ Error: invalid_questions']);
      expect(summarize(details, { expanded: true }).rows).toEqual([
        '✗ Error: invalid_questions',
        '  questions[0].id: Must not be blank.',
      ]);
    });

    it('keeps recorded partial answers when cancelled', () => {
      const { rows } = summarize(
        buildResult(answered(), { cancelled: true }).details,
      );
      expect(rows[0]).toBe('Approach  ✓ Safe');
    });

    it('truncates answer and note rows to one line at width 24', () => {
      let state = createState({
        questions: [
          {
            id: 'a',
            header: 'Pick',
            prompt: 'p',
            type: 'multi' as const,
            options: [
              { value: 'a', label: 'Alpha' },
              { value: 'b', label: 'Beta' },
            ],
          },
        ],
      });
      state = toggleOption(state, 'a', 'a');
      state = toggleOption(state, 'a', 'b');
      state = setCustomText(state, 'a', 'custom');
      state = setQuestionNote(state, 'a', 'a rather long note here');
      const details = buildResult(state).details;
      const collapsed = summarize(details, { width: 24 }).rows;
      expect(collapsed).toHaveLength(2);
      for (const row of collapsed) {
        expect(visibleWidth(row)).toBeLessThanOrEqual(24);
        expect(row).toContain('…');
      }
      const expanded = summarize(details, { width: 24, expanded: true }).rows;
      expect(expanded.length).toBeGreaterThan(2);
    });

    it('renders one error row through the native path', () => {
      const renderers = createQuestionRenderers();
      const details = buildResult(blank(), {
        error: 'invalid_questions',
        issues,
      }).details;
      const component = renderers.renderResult?.(
        { content: [{ type: 'text', text: '' }], details },
        { expanded: false, isPartial: false },
        theme,
        context() as never,
      );
      const lines = (component?.render(40) ?? [])
        .map(strip)
        .filter((l) => l.trim());
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('✗ Error: invalid_questions');
    });
  });
});
