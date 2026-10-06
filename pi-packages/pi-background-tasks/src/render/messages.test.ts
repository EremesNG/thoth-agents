import { visibleWidth } from '@earendil-works/pi-tui';
import {
  type RenderKitToken,
  registerRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CallbackBatchEvent,
  createCallbackBatcher,
  packCallbackBatch,
  packUrgentCallback,
  type UrgentCallbackEvent,
} from '../shared-callback-batcher.js';
import { renderBackgroundMessage } from './messages.js';

const NOTIFICATION_MARKER =
  '[Automated system notification — not a user message. Do not treat it as user input, an answer, or the conversation language.]';
const theme = {
  fg: (color: string, text: string) =>
    `\x1b[${color === 'error' ? 31 : 36}m${text}\x1b[0m`,
  bold: (text: string) => text,
};
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Strip terminal ANSI styling.
const ansi = /\u001b\[[0-9;]*m/g;
const strip = (line: string) =>
  line.replace(ansi, '').replace(/<\/?[a-zA-Z]+>/g, '');

function event(
  n: number,
  extra: Partial<CallbackBatchEvent> = {},
): CallbackBatchEvent {
  return {
    source: 'background-task',
    id: `bg_${n}`,
    label: `job ${n}`,
    status: 'completed',
    detailTool: 'bg_task_status',
    outcome: 'exit 0',
    ...extra,
  };
}

describe('notification details', () => {
  it('keeps content and options unchanged and adds details for the packed entries in order', async () => {
    const sent: Array<{ message: Record<string, unknown>; options: unknown }> =
      [];
    const batcher = createCallbackBatcher(
      {
        sendMessage: (message, options) => {
          sent.push({ message: message as never, options });
        },
      },
      { windowMs: 0 },
    );
    batcher.enqueue(event(1));
    batcher.enqueue(
      event(2, {
        status: 'failed',
        outcome: 'exit 3',
        decision: 'matched condition',
        failureRows: ['row a', 'row b'],
        incidentCount: 5,
      }),
    );
    await batcher.flush();
    const { message, options } = sent[0]!;
    expect(options).toEqual({ deliverAs: 'followUp', triggerTurn: true });
    expect(message.customType).toBe('background-completion-batch');
    expect(message.display).toBe(true);
    expect(Object.keys(message).sort()).toEqual([
      'content',
      'customType',
      'details',
      'display',
    ]);
    const packed = packCallbackBatch([
      event(1),
      event(2, {
        status: 'failed',
        outcome: 'exit 3',
        decision: 'matched condition',
        failureRows: ['row a', 'row b'],
        incidentCount: 5,
      }),
    ]);
    expect(message.content).toBe(packed.text);
    const details = message.details as ReturnType<
      typeof packCallbackBatch
    >['details'];
    expect(details.entries.map((e) => e.id)).toEqual(
      packed.represented.map((e) => e.id),
    );
    expect(details.entries[1]).toMatchObject({
      id: 'bg_2',
      label: 'job 2',
      status: 'failed',
      outcome: 'exit 3',
      decision: 'matched condition',
      rows: ['row a', 'row b'],
      incidents: { total: 5, shown: 2, omitted: 3 },
    });
    expect(JSON.parse(JSON.stringify(details))).toEqual(details);
    expect(JSON.stringify(details)).not.toContain('isDelivered');
  });

  it.each([
    2048, 8192,
  ])('marks both sent notification types within the %i-byte content budget', async (maxBytes) => {
    const sent: Array<{ customType: string; content: string }> = [];
    const batcher = createCallbackBatcher(
      {
        sendMessage: (message) => {
          sent.push(message);
        },
      },
      { maxBytes },
    );
    try {
      for (let i = 0; i < 120; i += 1) {
        batcher.enqueue(
          event(i, {
            label: `job ${i} é`,
            status: 'succeeded',
            outcome: 'succeeded',
          }),
        );
      }
      expect(await batcher.flush()).toBe(true);
      expect(
        await batcher.deliverUrgent({
          source: 'background-task',
          id: 'failure:bg_urgent',
          inspectId: 'bg_urgent',
          label: 'urgent',
          status: 'failed',
          customType: 'background-task-failure',
          content: 'é'.repeat(20_000),
          detailTool: 'bg_task_status',
        }),
      ).toBe(true);
      expect(sent.map((message) => message.customType)).toEqual([
        'background-completion-batch',
        'background-task-failure',
      ]);
      for (const message of sent) {
        expect(message.content.split('\n')[0]).toBe(NOTIFICATION_MARKER);
        expect(
          new TextEncoder().encode(message.content).byteLength,
        ).toBeLessThanOrEqual(maxBytes);
        expect(message.content).not.toContain('�');
        expect(message.content).toContain('bg_task_status');
      }
    } finally {
      batcher.cancel();
    }
  });

  it('counts omitted completions and bounds details at 2 KiB and 8 KiB', () => {
    for (const maxBytes of [2048, 8192]) {
      const events = Array.from({ length: 80 }, (_, i) =>
        event(i, {
          label: `label ${'x'.repeat(150)} ${i}`,
          decision: 'd'.repeat(500),
          failureRows: Array.from(
            { length: 6 },
            (_, r) => `incident ${r} ${'é'.repeat(120)}`,
          ),
        }),
      );
      const packed = packCallbackBatch(events, { maxBytes });
      expect(packed.omitted).toBeGreaterThan(0);
      expect(packed.details.omitted).toBe(packed.omitted);
      expect(packed.details.entries.length + packed.details.unlisted).toBe(
        packed.represented.length,
      );
      expect(bytes(packed.details)).toBeLessThanOrEqual(maxBytes);
    }
  });

  it('bounds a single long-incident event', () => {
    const long = event(1, {
      status: 'failed',
      failureRows: ['q"\\n'.repeat(900)],
      incidentCount: 40,
      decision: 'z'.repeat(3000),
    });
    for (const maxBytes of [2048, 8192]) {
      const packed = packCallbackBatch([long, event(2)], { maxBytes });
      expect(bytes(packed.details)).toBeLessThanOrEqual(maxBytes);
      expect(packed.details.entries[0]?.incidents?.total).toBe(40);
    }
  });

  it('projects urgent failures with inspectId and shown rows', async () => {
    const urgent: UrgentCallbackEvent = {
      source: 'background-task',
      id: 'failure:bg_9:k',
      inspectId: 'bg_9',
      label: 'build',
      status: 'failure',
      customType: 'background-task-failure',
      content: 'still running with 2 failure observations',
      detailTool: 'bg_task_status',
      failureRows: ['first', 'second'],
      incidentCount: 2,
    };
    const sent: Array<Record<string, unknown>> = [];
    const options: unknown[] = [];
    const batcher = createCallbackBatcher({
      sendMessage: (m, o) => {
        sent.push(m as never);
        options.push(o);
      },
    });
    await batcher.deliverUrgent(urgent);
    const packed = packUrgentCallback(urgent);
    expect(sent[0]).toMatchObject({
      customType: 'background-task-failure',
      content: packed.text,
      display: true,
    });
    expect(options[0]).toEqual({ deliverAs: 'followUp', triggerTurn: true });
    const details = sent[0]!.details as typeof packed.details;
    expect(details.kind).toBe('failure');
    expect(details.entries).toHaveLength(1);
    expect(details.entries[0]).toMatchObject({
      id: 'bg_9',
      label: 'build',
      rows: ['first', 'second'],
      incidents: { total: 2, shown: 2, omitted: 0 },
    });
  });

  it('bounds urgent details with a huge explanation and rows', () => {
    const urgent: UrgentCallbackEvent = {
      source: 'background-task',
      id: 'f',
      inspectId: 'bg_1',
      label: 'x'.repeat(400),
      status: 'failure',
      customType: 'background-task-failure',
      content: 'c'.repeat(20_000),
      failureRows: Array.from(
        { length: 50 },
        (_, i) => `row ${i} ${'r'.repeat(300)}`,
      ),
      incidentCount: 50,
    };
    for (const maxBytes of [2048, 8192]) {
      const packed = packUrgentCallback(urgent, { maxBytes });
      expect(bytes(packed.details)).toBeLessThanOrEqual(maxBytes);
      expect(packed.details.entries[0]?.incidents?.total).toBe(50);
    }
  });
});

let token: RenderKitToken | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
});

describe('background message renderer', () => {
  it.each([
    { status: 'completed', outcome: 'exit 0', completed: true },
    { status: 'succeeded', outcome: 'succeeded', completed: true },
    { status: 'completed', completed: true },
    { status: 'running', completed: false },
    { status: 'pending', completed: false },
    { status: 'cancelled', completed: false },
    { status: 'rejected', completed: false },
    { status: 'skipped', completed: false },
    { status: 'stopped', completed: false },
    { status: 'unrecognized', completed: false },
    { status: 'completed', outcome: 'cancelled', completed: false },
    { status: 'completed', outcome: 'unrecognized', completed: false },
    { status: 'completed', outcome: 'exit 3', completed: false },
    { status: 'failed', outcome: 'exit 3', completed: false, isError: true },
    { status: 'lost', completed: false, isError: true },
    { status: 'succeeded', completed: false, incidentCount: 1, isError: true },
  ])('signals batch success only for affirmative outcomes ($status, $outcome)', ({
    status,
    outcome,
    completed,
    incidentCount,
    isError = false,
  }) => {
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    token = registerRenderKit(kit, {});
    const packed = packCallbackBatch([
      event(1),
      event(2, { status, outcome, incidentCount }),
    ]);
    const lines = renderBackgroundMessage(
      { content: packed.text, details: packed.details },
      {},
      theme,
    ).render(160);
    const options = card.mock.calls[0][1];
    // HEAD decorates all non-error batches as completed, including mixed ones.
    expect(options.status).toBe(isError ? 'failed' : 'completed');
    expect(options.footer).toBe(isError ? 'failed' : 'completed');
    expect(lines.at(-1)).toBe(
      isError ? '╰─ failed · failed' : '╰─ completed · completed',
    );
    expect(options.isSuccess).toBe(completed);
    expect(options.isError).toBe(isError);
  });

  it.each([
    { kind: 'batch', entries: [], omitted: 0, unlisted: 0 },
    { kind: 'batch', entries: [{ id: 'bg_1' }], omitted: 0, unlisted: 0 },
    {
      kind: 'batch',
      entries: [{ id: 'bg_1', status: 'completed' }, null],
      omitted: 0,
      unlisted: 0,
    },
    {
      kind: 'batch',
      entries: [{ id: 'bg_1', status: 'completed' }],
      omitted: 1,
      unlisted: 0,
    },
    {
      kind: 'batch',
      entries: [{ id: 'bg_1', status: 'completed' }],
      omitted: 0,
      unlisted: 1,
    },
    undefined,
  ])('does not infer success from missing or incomplete batch evidence (%j)', (details) => {
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const component = renderBackgroundMessage(
      { content: 'legacy text', details },
      {},
      theme,
    );
    const native = component.render(100);
    token = registerRenderKit(kit, {});
    expect(component.render(100).at(-1)).toBe('╰─ completed · completed');
    expect(card.mock.calls[0][1].status).toBe('completed');
    expect(card.mock.calls[0][1].footer).toBe('completed');
    expect(card.mock.calls[0][1].isSuccess).toBe(false);
    expect(card.mock.calls[0][1].isError).toBe(false);
    withdrawRenderKit(token);
    expect(component.render(100)).toEqual(native);
  });

  it.each([
    false,
    true,
  ])('reuses KIT messages (expanded=%s) until the render key or invalidation changes', (expanded) => {
    const message = {
      content: 'full detail',
      details: {
        kind: 'batch',
        entries: [{ id: 'bg_1', label: 'job 1', status: 'completed' }],
        omitted: 0,
        unlisted: 0,
      },
    };
    const plainTheme = {
      fg: (_role: string, text: string) => text,
      bold: (text: string) => text,
    };
    const component = renderBackgroundMessage(
      message,
      { expanded },
      plainTheme,
    );
    const native = component.render(100);
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const collapse = vi.spyOn(kit, 'collapse');
    token = registerRenderKit(kit, {});
    const lines = component.render(100);
    expect(lines).toEqual([
      '╭─ background 1 completion · done',
      ...(expanded
        ? ['full detail']
        : ['✓ job 1 · completed', '(ctrl+o to expand)']),
      '╰─ completed · completed',
    ]);
    expect(component.render(100)).toBe(lines);
    expect(card).toHaveBeenCalledTimes(1);
    expect(collapse).toHaveBeenCalledTimes(expanded ? 0 : 1);
    component.render(40);
    expect(card).toHaveBeenCalledTimes(2);
    component.invalidate();
    component.render(40);
    expect(card).toHaveBeenCalledTimes(3);
    expect(component.render(100)).toEqual(lines);
    expect(card).toHaveBeenCalledTimes(4);
    expect(
      renderBackgroundMessage(message, { expanded }, plainTheme).render(100),
    ).toEqual(lines);
    expect(card).toHaveBeenCalledTimes(5);

    const replacement = createTestRenderKit();
    const replacementCard = vi.spyOn(replacement, 'card');
    token = registerRenderKit(replacement, {});
    expect(component.render(100)).toEqual(lines);
    expect(component.render(100)).toEqual(lines);
    expect(replacementCard).toHaveBeenCalledTimes(1);
    withdrawRenderKit(token);
    expect(component.render(100)).toEqual(native);
    component.invalidate();
    expect(component.render(100)).toEqual(native);
    token = registerRenderKit(kit, {});
    expect(component.render(100)).toEqual(lines);
    expect(card).toHaveBeenCalledTimes(6);
  });

  const packed = packCallbackBatch([
    event(1),
    event(2, { status: 'failed', outcome: 'exit 3' }),
  ]);
  const message = { content: packed.text, details: packed.details };

  it.each([
    'background-completion-batch',
    'background-task-failure',
  ])('switches %s on re-render while preserving compact and full content', (customType) => {
    const packed =
      customType === 'background-completion-batch'
        ? packCallbackBatch([event(1)])
        : packUrgentCallback({
            source: 'background-task',
            id: 'f',
            inspectId: 'bg_1',
            label: 'job 1',
            status: 'failure',
            customType,
            content: 'urgent detail',
          });
    const component = renderBackgroundMessage(
      { content: packed.text, details: packed.details },
      {},
      theme,
    );
    const native = component.render(120).map(strip).join('\n');
    expect(native).not.toMatch(/[╭╰│]/);
    expect(native).toContain('job 1');
    token = registerRenderKit(createTestRenderKit(), {});
    const framed = component.render(120).map(strip).join('\n');
    expect(framed).toContain('╭─');
    expect(framed).toContain('╰─');
    expect(framed).toContain(
      customType === 'background-completion-batch' ? '✓ job 1' : '✗ job 1',
    );
    const expanded = renderBackgroundMessage(
      { content: packed.text, details: packed.details },
      { expanded: true },
      theme,
    )
      .render(160)
      .map(strip)
      .join('\n');
    expect(expanded).toContain(
      customType === 'background-completion-batch'
        ? 'Retrieve durable'
        : 'urgent detail',
    );
    expect(expanded).not.toContain('Automated system notification');
    withdrawRenderKit(token);
    expect(component.render(120).map(strip).join('\n')).toBe(native);
  });

  it('renders a collapsed native summary with an expand hint', () => {
    const lines = renderBackgroundMessage(message, { expanded: false }, theme)
      .render(80)
      .map(strip);
    expect(lines[0]).toContain('2 completions · 1 failed');
    expect(lines.join('\n')).toContain('job 1 · completed · exit 0');
    expect(lines.join('\n')).toContain('job 2 · failed · exit 3');
    expect(lines.join('\n')).toContain('to expand');
    expect(lines.join('\n')).not.toContain('Retrieve durable');
    expect(
      renderBackgroundMessage(message, { expanded: false }, theme)
        .render(80)
        .join(''),
    ).toContain('\x1b[31m');
  });

  it('folds long KIT summaries through the KIT collapse budget', () => {
    token = registerRenderKit(createTestRenderKit(), {});
    const packed = packCallbackBatch(
      Array.from({ length: 12 }, (_, index) => event(index)),
    );
    const text = renderBackgroundMessage(
      { content: packed.text, details: packed.details },
      {},
      theme,
    )
      .render(160)
      .map(strip)
      .join('\n');
    expect(text).toContain('✓ job 6');
    expect(text).not.toContain('job 7');
    expect(text).toContain('5 more lines');
    expect(text).toContain('to expand');
  });

  it('shows a failed status and its incident count only once', () => {
    const packed = packCallbackBatch([
      event(1, {
        label: 'render-fail (bg_1)',
        status: 'failed; 1 incident needs attention',
        outcome: 'failed',
        incidentCount: 1,
      }),
    ]);
    const lines = renderBackgroundMessage(
      { content: packed.text, details: packed.details },
      {},
      theme,
    )
      .render(160)
      .map(strip);
    expect(lines[1]?.replace(/^│\s*|\s*│$/g, '')).toBe(
      'render-fail (bg_1) · failed · 1 incident',
    );
    expect(packed.details.entries[0]).toMatchObject({
      status: 'failed; 1 incident needs attention',
      outcome: 'failed',
      incidents: { total: 1 },
    });
  });

  it.each([
    {
      status: 'failed; 2 incidents need attention',
      outcome: 'failed',
      incidentCount: 2,
      expected: 'job 1 · failed · 2 incidents',
    },
    {
      status: 'failed; 2 incidents needs attention',
      outcome: 'failed',
      incidentCount: 2,
      expected: 'job 1 · failed · 2 incidents',
    },
    { status: 'failed', outcome: 'failed', expected: 'job 1 · failed' },
    {
      status: 'failed; 1 incident needs attention',
      outcome: 'exit 3',
      incidentCount: 1,
      expected: 'job 1 · failed · exit 3 · 1 incident',
    },
    {
      status: 'succeeded',
      outcome: 'succeeded',
      expected: 'job 1 · succeeded',
    },
    {
      status: 'failed; 1 incident needs attention; stopped',
      outcome: 'failed',
      incidentCount: 1,
      expected:
        'job 1 · failed; 1 incident needs attention; stopped · failed · 1 incident',
    },
  ])('renders $expected', ({ status, outcome, incidentCount, expected }) => {
    const entry = {
      id: 'bg_1',
      label: 'job 1',
      status,
      outcome,
      ...(incidentCount
        ? {
            incidents: {
              total: incidentCount,
              shown: 0,
              omitted: incidentCount,
            },
          }
        : {}),
    };
    const lines = renderBackgroundMessage(
      { details: { kind: 'batch', entries: [entry], omitted: 0, unlisted: 0 } },
      {},
      theme,
    )
      .render(180)
      .map(strip);
    expect(lines[1]?.replace(/^│\s*|\s*│$/g, '')).toBe(expected);
  });

  it('shows the full text when expanded', () => {
    const text = renderBackgroundMessage(message, { expanded: true }, theme)
      .render(120)
      .map(strip)
      .join('\n');
    expect(text).toContain('Retrieve durable');
    expect(text).toContain('source=background-task');
  });

  it.each([
    false,
    true,
  ])('hides the notification marker in text and summary views (expanded=%s)', (expanded) => {
    const urgent = packUrgentCallback({
      source: 'background-task',
      id: 'f',
      inspectId: 'bg_1',
      label: 'build',
      status: 'failure',
      customType: 'background-task-failure',
      content: 'attention',
    });
    const cases = [
      {
        message,
        expected: expanded
          ? 'source=background-task'
          : 'job 1 · completed · exit 0',
      },
      {
        message: { content: urgent.text, details: urgent.details },
        expected: expanded ? 'attention' : 'build · failure',
      },
      {
        message: { content: message.content },
        expected: 'source=background-task',
      },
      { message: { content: urgent.text }, expected: 'attention' },
      {
        message: { content: `${NOTIFICATION_MARKER}\r\nplain old text` },
        expected: 'plain old text',
      },
      {
        message: {
          content: [
            { type: 'text', text: NOTIFICATION_MARKER },
            { type: 'text', text: 'text block fallback' },
          ],
        },
        expected: 'text block fallback',
      },
      { message: { content: NOTIFICATION_MARKER }, expected: 'background' },
    ];
    for (const { message, expected } of cases) {
      const text = renderBackgroundMessage(message, { expanded }, theme)
        .render(180)
        .map(strip)
        .join('\n');
      expect(text).toContain(expected);
      expect(text).not.toContain('Automated system notification');
      expect(text).not.toContain('not a user message');
    }
  });

  it('falls back to the text without details', () => {
    const lines = renderBackgroundMessage(
      { content: 'plain old text' },
      { expanded: false },
      theme,
    )
      .render(40)
      .map(strip);
    expect(lines.join('\n')).toContain('plain old text');
    expect(lines[0]).toContain('background');
    expect(lines.join('\n')).not.toMatch(/[╭╰│]/);
  });

  it('renders the failure message', () => {
    const { text, details } = packUrgentCallback({
      source: 'background-task',
      id: 'f',
      inspectId: 'bg_1',
      label: 'build',
      status: 'failure',
      customType: 'background-task-failure',
      content: 'attention',
      failureRows: ['r'],
      incidentCount: 1,
    });
    const out = renderBackgroundMessage(
      { content: text, details },
      { expanded: false },
      theme,
    )
      .render(80)
      .map(strip);
    expect(out[0]).toContain('background failure');
    expect(out[0]).toContain('build');
  });

  it('still renders an entry without a status', () => {
    const message = {
      details: {
        kind: 'batch',
        entries: [{ id: 'bg_legacy' }],
        omitted: 0,
        unlisted: 0,
      },
    };
    const lines = renderBackgroundMessage(message, {}, theme)
      .render(80)
      .map(strip);
    expect(lines[1]?.replace(/^│\s*|\s*│$/g, '')).toBe('bg_legacy');
  });

  it('stays within width at 0, 1, 40 and 80', () => {
    const wide = packCallbackBatch(
      Array.from({ length: 12 }, (_, i) =>
        event(i, { label: '日本語'.repeat(20) }),
      ),
    );
    for (const expanded of [false, true]) {
      for (const msg of [
        message,
        { content: wide.text, details: wide.details },
        { content: 'x'.repeat(300) },
      ]) {
        expect(
          renderBackgroundMessage(msg, { expanded }, theme).render(0),
        ).toEqual([]);
        for (const width of [1, 40, 80]) {
          for (const line of renderBackgroundMessage(
            msg,
            { expanded },
            theme,
          ).render(width)) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(width);
          }
        }
      }
    }
  });
});

describe('registration', () => {
  it('registers both renderers', async () => {
    const { default: extension } = await import('../index.js');
    const registerMessageRenderer = vi.fn();
    extension({
      on: vi.fn(),
      registerTool: vi.fn(),
      registerMessageRenderer,
      registerCommand: vi.fn(),
      events: { on: vi.fn(), emit: vi.fn() },
    } as never);
    expect(registerMessageRenderer.mock.calls.map((c) => c[0]).sort()).toEqual([
      'background-completion-batch',
      'background-task-failure',
    ]);
  });
});
