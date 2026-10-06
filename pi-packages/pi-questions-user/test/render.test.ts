import type { Theme } from '@earendil-works/pi-coding-agent';
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
} from '../src/answers.js';
import { createQuestionRenderers, summarizeResult } from '../src/render.js';

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
  it('summarizes answers, skips, cancellation and errors', () => {
    const state = answered();
    const done = summarizeResult(buildResult(state).details, '');
    expect(done.status).toBe('completed');
    expect(done.rows).toEqual([
      'Approach: Safe (+1 note)',
      'Why: because',
      'Skipme: skipped',
    ]);
    const cancelled = summarizeResult(
      buildResult(state, { cancelled: true }).details,
      '',
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.rows.at(-1)).toContain('Cancelled');
    const failed = summarizeResult(
      buildResult(state, { error: 'no_ui' }).details,
      '',
    );
    expect(failed.status).toBe('failed');
    expect(failed.rows[0]).toBe('Error: no_ui');
    expect(summarizeResult(undefined, 'boom')).toEqual({
      status: 'failed',
      rows: ['boom'],
    });
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
    expect(summarizeResult(details, '').rows).toEqual([
      'Special: Special option (+1 note)',
    ]);
    details.answers = Object.create({ [key]: details.answers[key] });
    expect(summarizeResult(details, '').rows).toEqual(['Special: skipped']);
  });

  it('falls back to a native padded box when no kit is registered', () => {
    const renderers = createQuestionRenderers();
    const call = renderers.renderCall?.(
      questionnaire as never,
      theme,
      context({ isPartial: true }),
    );
    const callText = call?.render(60).join('\n');
    expect(callText).toContain('Ask user');
    expect(callText).toContain('3 questions: Approach, Why, Skipme');
    const result = renderers.renderResult?.(
      buildResult(answered()),
      { expanded: false, isPartial: false },
      theme,
      context(),
    );
    const out = result?.render(60).join('\n');
    expect(out).toContain('Approach: Safe');
    expect(out).toContain('Why: because');
    expect(out).not.toContain('╭');
  });

  it('renders through the pi-core kit when it is registered at render time', () => {
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
    const out = result?.render(60).join('\n');
    expect(out).toContain('╰');
    expect(out).toContain('Approach: Safe');
    expect(out).toContain('Cancelled');
    const call = renderers.renderCall?.(questionnaire as never, theme, ctx);
    expect(call?.render(60).join('\n')).toContain('╭─ Ask user');
  });

  it('marks error results', () => {
    const renderers = createQuestionRenderers();
    const result = renderers.renderResult?.(
      buildResult(createState(questionnaire), { error: 'invalid_questions' }),
      { expanded: false, isPartial: false },
      theme,
      context({ isError: true }),
    );
    expect(result?.render(60).join('\n')).toContain('✗ Ask user');
  });
});
