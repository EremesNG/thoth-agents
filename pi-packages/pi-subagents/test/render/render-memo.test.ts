import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { renderSubagentCompletionMessage } from '../../src/render/completion-message.js';
import { renderSubagentQuestionMessage } from '../../src/render/question-message.js';
import { boxedComponent } from '../../src/render/tools/components.js';

const theme = {
  fg: (_role: string, text: string) => text,
  bg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};

function toolComponent() {
  return boxedComponent(['first line', 'second line'], {
    title: 'Result',
    theme,
    status: 'completed',
  });
}

const renderers = [
  {
    name: 'tool',
    create: toolComponent,
    expected: ['╭─ Result', 'first line', 'second line', '╰─ ✓'],
  },
  {
    name: 'working tool',
    create: () =>
      boxedComponent(['⠋ work', 'literal ⠋ response'], {
        title: '⠋ Running',
        theme,
        status: 'running',
        context: { isPartial: true },
        workingRow: 0,
        wrapped: true,
      }),
    expected: ['╭─ ◐ Running', '◐ work', 'literal ⠋ response', '╰─ running'],
  },
  {
    name: 'expanded completion',
    create: () =>
      renderSubagentCompletionMessage(
        {
          details: {
            task: {
              agent: 'worker',
              status: 'completed',
              model: 'test/model',
              effort: 'high',
              result: 'first line\nsecond line',
            },
          },
        },
        { expanded: true },
        theme,
      ),
    expected: [
      '╭─ ✓ [subagent] worker · completed',
      'subagent: worker · model: test/model · effort: high · status: completed',
      '├─ response sent to the orchestrator',
      'first line',
      'second line',
      '╰─',
    ],
  },
  {
    name: 'compact completion',
    create: () =>
      renderSubagentCompletionMessage(
        {
          details: {
            task: {
              agent: 'worker',
              status: 'completed',
              model: 'test/model',
              effort: 'high',
              result: 'hidden response',
            },
          },
        },
        { expanded: false },
        theme,
      ),
    expected: [
      '╭─ ✓ [subagent] worker · completed',
      'subagent: worker · model: test/model · effort: high · status: completed',
      'ctrl+o to expand',
      '╰─',
    ],
  },
  {
    name: 'failed completion',
    create: () =>
      renderSubagentCompletionMessage(
        {
          details: {
            task: {
              agent: 'worker',
              status: 'failed',
              model: 'test/model',
              effort: 'high',
              error: 'timed out',
            },
          },
        },
        { expanded: true },
        theme,
      ),
    expected: [
      '╭─ ! ✗ [subagent] worker · failed',
      'subagent: worker · model: test/model · effort: high · status: failed',
      '├─ error',
      'timed out',
      '╰─',
    ],
  },
  ...[false, true].map((expanded) => ({
    name: `${expanded ? 'expanded' : 'compact'} question`,
    create: () =>
      renderSubagentQuestionMessage(
        {
          details: {
            task: { agent: 'worker' },
            agent: 'worker',
            task_id: 't1',
            request_id: 'q1',
            question: 'Which scope?\nRuntime only?',
          },
        },
        { expanded },
        theme,
      ),
    expected: [
      '╭─ ? [subagent] worker · question',
      ...(expanded
        ? [
            'task_id: t1 · request_id: q1',
            'Question for the orchestrator',
            'Which scope?',
            'Runtime only?',
            'Reply with subagent_reply.',
          ]
        : [
            'subagent: worker · awaiting orchestrator reply',
            'ctrl+o to expand',
          ]),
      '╰─',
    ],
  })),
];

describe('transcript KIT render memo', () => {
  it.each(
    renderers,
  )('reuses $name card lines at the same width without changing their output', ({
    create,
    expected,
  }) => {
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const token = registerRenderKit(kit, {});
    onTestFinished(() => withdrawRenderKit(token));
    const component = create();
    const first = component.render(100);

    expect(first).toEqual(expected);
    expect(component.render(100)).toBe(first);
    expect(card).toHaveBeenCalledTimes(1);
  });

  it.each(renderers)('keeps $name memo ownership per component instance', ({
    create,
    expected,
  }) => {
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const token = registerRenderKit(kit, {});
    onTestFinished(() => withdrawRenderKit(token));
    const first = create();
    const second = create();
    const firstLines = first.render(100);
    const secondLines = second.render(100);
    expect(secondLines).toEqual(expected);
    expect(secondLines).not.toBe(firstLines);
    expect(card).toHaveBeenCalledTimes(2);

    first.invalidate();
    expect(first.render(100)).toEqual(expected);
    expect(second.render(100)).toBe(secondLines);
    expect(card).toHaveBeenCalledTimes(3);
  });

  it.each(
    renderers,
  )('rebuilds $name after a width change, invalidation, or KIT replacement/withdrawal', ({
    create,
    expected,
  }) => {
    const component = create();
    const native = component.render(100);
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const token = registerRenderKit(kit, {});
    onTestFinished(() => withdrawRenderKit(token));

    expect(component.render(100)).toEqual(expected);
    const narrow = component.render(9);
    expect(component.render(9)).toBe(narrow);
    expect(card).toHaveBeenCalledTimes(2);
    expect(narrow.every((line) => [...line].length <= 9)).toBe(true);
    component.invalidate();
    const rebuilt = component.render(9);
    expect(rebuilt).toEqual(narrow);
    expect(rebuilt).not.toBe(narrow);
    expect(card).toHaveBeenCalledTimes(3);

    const replacement = createTestRenderKit();
    const replacementCard = vi.spyOn(replacement, 'card');
    const replacementToken = registerRenderKit(replacement, {});
    onTestFinished(() => withdrawRenderKit(replacementToken));
    expect(component.render(9)).toEqual(narrow);
    expect(component.render(9)).toEqual(narrow);
    expect(replacementCard).toHaveBeenCalledTimes(1);
    expect(card).toHaveBeenCalledTimes(3);

    withdrawRenderKit(replacementToken);
    expect(component.render(100)).toEqual(native);
    component.render(9);
    // Even the same KIT object must rebuild after an observed withdrawal.
    const restoredToken = registerRenderKit(replacement, {});
    onTestFinished(() => withdrawRenderKit(restoredToken));
    expect(component.render(9)).toEqual(narrow);
    expect(replacementCard).toHaveBeenCalledTimes(2);
  });

  it.each(
    renderers,
  )('keeps the $name native path uncached and unchanged at narrow and normal widths', ({
    create,
  }) => {
    const component = create();
    const fg = vi.spyOn(theme, 'fg');
    const bg = vi.spyOn(theme, 'bg');
    onTestFinished(() => {
      fg.mockRestore();
      bg.mockRestore();
    });
    for (const width of [1, 9, 40, 100]) {
      const native = component.render(width);
      fg.mockClear();
      bg.mockClear();
      expect(component.render(width)).toEqual(native);
      if (width >= 10)
        expect(fg.mock.calls.length + bg.mock.calls.length).toBeGreaterThan(0);
      component.invalidate();
      expect(component.render(width)).toEqual(native);
    }
  });
});
