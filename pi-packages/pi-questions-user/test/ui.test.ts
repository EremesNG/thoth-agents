import type {
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { type TUI, visibleWidth } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type AnswerState,
  createState,
  type QuestionResult,
  setOptionNote,
} from '../src/answers.js';
import type { QuestionUISession } from '../src/custom-ui.js';
import type { Questionnaire } from '../src/schema.js';
import { createQuestionnaireUI } from '../src/ui/index.js';

const theme = {
  fg: (_c: string, t: string) => t,
  bg: (_c: string, t: string) => t,
  bold: (t: string) => t,
} as unknown as Theme;

const KEY = {
  tab: '\t',
  shiftTab: '\x1b[Z',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  enter: '\r',
  esc: '\x1b',
  pageDown: '\x1b[6~',
};

const options = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    value: `v${i + 1}`,
    label: `Option ${i + 1}`,
    description: `Description ${i + 1}`,
    ...(i === 0 ? { preview: '# Preview one\n\nbody' } : {}),
    ...(i === 1 ? { recommended: true } : {}),
  }));

function setup(
  questionnaire: Questionnaire,
  rows = 40,
  signal?: AbortSignal,
  state = createState(questionnaire),
) {
  const session: QuestionUISession = {
    state,
    signal,
    onStateChange: vi.fn((state) => {
      session.state = state;
    }),
  };
  const results: (QuestionResult | undefined)[] = [];
  let mounted = false;
  let dispose: (() => void) | undefined;
  const tui = { requestRender() {}, terminal: { rows } } as unknown as TUI;
  const ui = createQuestionnaireUI(session)(
    tui,
    theme,
    {} as KeybindingsManager,
    (r) => {
      results.push(r);
      // Pi restores the editor/unmounts the questionnaire before disposing it.
      mounted = false;
      dispose?.();
    },
  ) as ReturnType<ReturnType<typeof createQuestionnaireUI>> & {
    handleInput(d: string): void;
    render(w: number): string[];
  };
  const component = ui as unknown as {
    handleInput(d: string): void;
    render(w: number): string[];
    dispose?(): void;
  };
  dispose = () => component.dispose?.();
  mounted = results.length === 0;
  const send = (...keys: string[]) => {
    for (const key of keys) component.handleInput(key);
  };
  const text = (width = 80) => component.render(width).join('\n');
  return {
    session,
    results,
    send,
    text,
    component,
    get mounted() {
      return mounted;
    },
  };
}

const two: Questionnaire = {
  title: 'Planning',
  questions: [
    {
      id: 'a',
      header: 'First',
      prompt: 'Pick one',
      type: 'single',
      required: true,
      options: options(3),
    },
    {
      id: 'b',
      header: 'Second',
      prompt: 'Pick many',
      type: 'multi',
      options: options(3),
    },
  ],
};

beforeAll(() => initTheme('dark'));

let kitToken: symbol | undefined;
afterEach(() => {
  if (kitToken) withdrawRenderKit(kitToken);
  kitToken = undefined;
});

const lines = (n: number, prefix = 'line') =>
  Array.from({ length: n }, (_, i) => `${prefix} ${i}`).join('\n\n');

/** Previews of 0, 3 and 40 lines plus a confirm and a text question. */
const uneven: Questionnaire = {
  title: 'Uneven',
  questions: [
    {
      id: 'a',
      header: 'Mixed',
      prompt:
        'A prompt that is long enough to wrap onto a second line at eighty columns wide.',
      type: 'single',
      required: true,
      options: [
        { value: 'none', label: 'No preview' },
        { value: 'short', label: 'Short', preview: lines(2) },
        { value: 'long', label: 'Long', preview: lines(40) },
        ...options(12).map((o) => ({ ...o, value: `x${o.value}` })),
      ],
    },
    {
      id: 'b',
      header: 'Many',
      prompt: 'Pick',
      type: 'multi',
      options: options(3),
    },
    { id: 'c', header: 'Sure', prompt: 'Proceed?', type: 'confirm' },
    { id: 'd', header: 'Why', prompt: 'Explain', type: 'text' },
  ],
};

describe('questionnaire UI', () => {
  it('shows title, tabs, header and prompt', () => {
    const { text } = setup(two);
    const out = text();
    expect(out).toContain('Planning');
    expect(out).toContain('First');
    expect(out).toContain('Second');
    expect(out).toContain('Review');
    expect(out).toContain('Pick one');
    expect(out).toContain('Type something.');
  });

  it('switches tabs with Tab, Shift+Tab and arrows, wrapping', () => {
    const { send, text } = setup(two);
    send(KEY.tab);
    expect(text()).toContain('Pick many');
    send(KEY.shiftTab);
    expect(text()).toContain('Pick one');
    send(KEY.left);
    expect(text()).toContain('Review your answers');
    send(KEY.right);
    expect(text()).toContain('Pick one');
  });

  it('never preselects the recommended option but marks it', () => {
    const { text, session } = setup(two);
    expect(text()).toContain('★ recommended');
    expect(session.state.answers.a.values).toEqual([]);
  });

  it('selects with numeric shortcut and advances; reports state changes', () => {
    const { send, session, text } = setup(two);
    send('2');
    expect(session.state.answers.a.values).toEqual(['v2']);
    expect(session.onStateChange).toHaveBeenCalled();
    expect(text()).toContain('Pick many');
  });

  it('selects with Enter on the focused option', () => {
    const { send, session } = setup(two);
    send(KEY.down, KEY.down, KEY.enter);
    expect(session.state.answers.a.values).toEqual(['v3']);
  });

  it('toggles multi options with Space and combines with custom text', () => {
    const { send, session } = setup(two);
    send(KEY.tab, ' ', KEY.down, KEY.down, ' ');
    expect(session.state.answers.b.values).toEqual(['v1', 'v3']);
    send(KEY.down, KEY.enter, 'h', 'i', KEY.enter);
    expect(session.state.answers.b).toMatchObject({
      values: ['v1', 'v3'],
      customText: 'hi',
      status: 'answered',
    });
  });

  it('records option and question notes and keeps editor drafts on Esc', () => {
    const { send, session, results, text } = setup(two);
    send('n', 'o', 'k', KEY.enter);
    expect(session.state.answers.a.optionNotes).toEqual({ v1: 'ok' });
    send('N', 'd', 'r', KEY.esc);
    expect(session.state.answers.a.note).toBe('dr');
    expect(results).toEqual([]);
    expect(text()).toContain('Note: dr');
  });

  it.each([
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ])('saves, reopens and cancels a note for %s after a JSON round-trip', (key) => {
    const questionnaire: Questionnaire = {
      questions: [
        {
          id: key,
          header: 'Special',
          prompt: 'Pick',
          type: 'multi',
          options: [
            { value: key, label: 'Special option' },
            { value: 'other', label: 'Other option' },
          ],
        },
      ],
    };
    const recorded = setOptionNote(
      createState(questionnaire),
      key,
      'other',
      'Other note',
    );
    const restored: AnswerState = JSON.parse(JSON.stringify(recorded));
    const host = setup(questionnaire, 40, undefined, restored);
    expect(host.text()).not.toMatch(/Special option.*✎/);
    expect(host.text()).not.toContain('Note:');
    host.send('n', 'n', 'o', 't', 'e', KEY.enter);
    expect(host.session.state.answers[key].optionNotes?.[key]).toBe('note');
    expect(host.text()).toContain('note');
    host.send('n');
    expect(host.text()).toContain('note');
    host.send('!', KEY.esc);
    expect(host.results).toEqual([]);
    host.send(KEY.esc);
    const details = JSON.parse(JSON.stringify(host.results[0]?.details));
    expect(details.cancelled).toBe(true);
    expect(Object.hasOwn(details.answers, key)).toBe(true);
    expect(details.answers[key].optionNotes).toEqual({
      [key]: 'note!',
      other: 'Other note',
    });
  });

  it.each([
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ])('does not render or edit an inherited answer for %s', (id) => {
    const questionnaire: Questionnaire = {
      questions: [
        {
          id,
          header: 'Special',
          prompt: 'Pick',
          type: 'multi',
          options: [{ value: '__proto__', label: 'Prototype' }],
        },
      ],
    };
    const state = createState(questionnaire);
    state.answers = Object.create({
      [id]: {
        status: 'answered',
        values: ['__proto__'],
        labels: ['Prototype'],
        optionNotes: { ['__proto__']: 'Inherited note' },
      },
    });
    const host = setup(questionnaire, 40, undefined, state);
    expect(() => host.text()).toThrow();
    expect(() => host.send('n')).toThrow();
    expect(host.session.onStateChange).not.toHaveBeenCalled();
  });

  it('windows 30 options and keeps the cursor visible', () => {
    const q: Questionnaire = {
      questions: [
        {
          id: 'a',
          header: 'Big',
          prompt: 'p',
          type: 'single',
          options: options(30),
        },
      ],
    };
    const { send, text, component } = setup(q);
    const first = component.render(80);
    expect(first.length).toBeLessThan(40);
    expect(text()).toContain('Option 1');
    expect(text()).not.toContain('Option 30');
    for (let i = 0; i < 29; i++) send(KEY.down);
    const out = text();
    expect(out).toContain('Option 30');
    expect(out).not.toContain('Option 1 ');
    expect(out).toContain('30/31');
  });

  it('places the preview below at 80 columns and beside at 140', () => {
    const { component } = setup(two);
    const narrow = component.render(80);
    const optionRow = narrow.findIndex((l) => l.includes('Option 1'));
    const previewRow = narrow.findIndex((l) => l.includes('Preview one'));
    expect(previewRow).toBeGreaterThan(optionRow);
    // Only the two frame sides: no list/preview column separator.
    expect(narrow[optionRow].split('│')).toHaveLength(3);
    const wide = component.render(140);
    const line = wide.find((l) => l.includes('Option 1'));
    expect(line).toContain('Preview');
    expect(
      wide.findIndex((l) => l.includes('Preview one')),
    ).toBeLessThanOrEqual(wide.findIndex((l) => l.includes('Option 3')));
    for (const width of [80, 140]) {
      for (const l of component.render(width)) {
        expect(visibleWidth(l)).toBeLessThanOrEqual(width);
      }
    }
  });

  it('shows description when the option has no preview and scrolls long previews', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n\n');
    const q: Questionnaire = {
      questions: [
        {
          id: 'a',
          header: 'P',
          prompt: 'p',
          type: 'single',
          options: [
            { value: 'x', label: 'X', preview: long },
            { value: 'y', label: 'Y', description: 'Plain description' },
          ],
        },
      ],
    };
    const { send, text } = setup(q);
    expect(text()).not.toContain('line 39');
    send(KEY.pageDown);
    expect(text()).not.toContain('line 0\n');
    expect(text()).toContain('PgUp/PgDn');
    send(KEY.down);
    expect(text()).toContain('Plain description');
  });

  it('single question submits directly; text type is editor-only', () => {
    const { send, results } = setup({
      questions: [
        {
          id: 'a',
          header: 'One',
          prompt: 'p',
          type: 'single',
          options: options(2),
        },
      ],
    });
    send('1');
    expect(results[0]?.details.answers.a.values).toEqual(['v1']);
    expect(results[0]?.details.cancelled).toBe(false);
    const t = setup({
      questions: [{ id: 't', header: 'T', prompt: 'p', type: 'text' }],
    });
    expect(t.text()).not.toContain('1.');
    t.send('h', 'e', 'y', KEY.enter);
    expect(t.results[0]?.details.answers.t.customText).toBe('hey');
  });

  it('confirm shows Yes/No without free text', () => {
    const { text } = setup({
      questions: [{ id: 'c', header: 'C', prompt: 'ok?', type: 'confirm' }],
    });
    expect(text()).toContain('Yes');
    expect(text()).toContain('No');
    expect(text()).not.toContain('Type something.');
  });

  it('review flags unanswered required questions and still submits', () => {
    const { send, text, results } = setup(two);
    send(KEY.tab, KEY.tab);
    const out = text();
    expect(out).toContain('required — unanswered');
    expect(out).toContain('may still submit');
    send(KEY.down, KEY.down, KEY.enter);
    expect(results[0]?.details.cancelled).toBe(false);
    expect(results[0]?.details.answers.a.status).toBe('skipped');
  });

  it('review: back to edit jumps to the unanswered required question; cancel keeps answers', () => {
    const { send, text, results } = setup(two);
    send(KEY.tab, KEY.tab, KEY.down, KEY.down, KEY.down, KEY.enter);
    expect(text()).toContain('Pick one');
    send('1');
    send(KEY.tab, KEY.down, KEY.down, KEY.down, KEY.down, KEY.enter);
    expect(results[0]?.details.cancelled).toBe(true);
    expect(results[0]?.details.answers.a.values).toEqual(['v1']);
  });

  it('Esc outside editors cancels and keeps recorded answers', () => {
    const { send, results } = setup(two);
    send('1', KEY.esc);
    expect(results).toHaveLength(1);
    expect(results[0]?.details.cancelled).toBe(true);
    expect(results[0]?.details.answers.a.values).toEqual(['v1']);
  });

  it('abort completes native teardown once, preserving recorded answers and leaving the component inert', () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const host = setup(two, 40, controller.signal);
    host.send('1');
    const recorded = host.session.state;
    expect(host.mounted).toBe(true);

    controller.abort();

    expect(host.results).toHaveLength(1);
    expect(host.results[0]?.details).toMatchObject({
      cancelled: true,
      error: 'aborted',
      answers: {
        a: { status: 'answered', values: ['v1'], labels: ['Option 1'] },
        b: { status: 'skipped', values: [], labels: [] },
      },
    });
    expect(host.mounted).toBe(false);
    expect(removeListener).toHaveBeenCalledWith(
      'abort',
      addListener.mock.calls[0][1],
    );
    host.send('2', KEY.enter, KEY.esc);
    controller.abort();
    expect(host.session.state).toBe(recorded);
    expect(host.results).toHaveLength(1);
  });

  it('submission removes the abort listener and a later abort cannot replace the submitted result', () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const host = setup(
      { questions: [two.questions[0]] },
      40,
      controller.signal,
    );
    host.send('1');
    const submitted = host.results[0];
    const recorded = host.session.state;
    expect(submitted?.details.cancelled).toBe(false);
    expect(removeListener).toHaveBeenCalledWith(
      'abort',
      addListener.mock.calls[0][1],
    );

    controller.abort();
    host.send('2', KEY.esc);

    expect(host.results).toEqual([submitted]);
    expect(submitted?.details.error).toBeUndefined();
    expect(host.session.state).toBe(recorded);
    expect(host.mounted).toBe(false);
  });

  it('an already-aborted session completes before the native host can mount it', () => {
    const controller = new AbortController();
    controller.abort();

    const host = setup(two, 40, controller.signal);

    expect(host.results).toHaveLength(1);
    expect(host.results[0]?.details).toMatchObject({
      cancelled: true,
      error: 'aborted',
    });
    expect(host.mounted).toBe(false);
    host.send('1', KEY.esc);
    expect(host.results).toHaveLength(1);
    expect(host.session.state.answers.a.status).toBe('skipped');
  });

  it.each([
    'cancel',
    'dispose',
  ] as const)('%s removes the abort listener and prevents later input or abort completion', (action) => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const host = setup(two, 40, controller.signal);
    host.send('1');
    const recorded = host.session.state;
    if (action === 'cancel') host.send(KEY.esc);
    else host.component.dispose?.();
    const completed = [...host.results];
    expect(removeListener).toHaveBeenCalledWith(
      'abort',
      addListener.mock.calls[0][1],
    );
    if (action === 'cancel') {
      expect(completed[0]?.details.cancelled).toBe(true);
      expect(completed[0]?.details.error).toBeUndefined();
    } else expect(completed).toEqual([]);

    controller.abort();
    host.send('2', KEY.esc);

    expect(host.results).toEqual(completed);
    expect(host.session.state).toBe(recorded);
  });

  it('renders large questionnaires quickly', () => {
    const questions = Array.from({ length: 200 }, (_, i) => ({
      id: `q${i}`,
      header: `H${i}`,
      prompt: 'p',
      type: 'single' as const,
      options: options(300),
    }));
    const { component, send } = setup({ questions });
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      component.render(120);
      send(KEY.down);
    }
    expect(performance.now() - start).toBeLessThan(1500);
  });

  describe('frame', () => {
    it('draws the kit frame when a render kit is registered at render time', () => {
      const host = setup(two);
      expect(host.text()).toContain('╭── Planning');
      kitToken = registerRenderKit(createTestRenderKit(), {});
      const out = host.component.render(80);
      expect(out[0]).toBe('╭─ Planning');
      expect(out.some((l) => l.startsWith('├─ 0/2 answered'))).toBe(true);
      expect(out.at(-1)).toBe('╰─');
      expect(out.join('\n')).toContain('Esc cancel');
    });

    it('falls back to a native rounded frame, dividers and a hint row without a kit', () => {
      const out = setup(two).component.render(80);
      expect(out[0]).toMatch(/^╭── Planning ─+╮$/);
      expect(out.filter((l) => l.startsWith('├'))).toHaveLength(2);
      expect(out.at(-1)).toMatch(/^╰─+╯$/);
      expect(out.filter((l) => l.startsWith('│ ↑↓ move'))).toHaveLength(1);
      for (const l of out) expect(visibleWidth(l)).toBe(80);
    });

    it.each([
      80, 140,
    ])('keeps one height across options, tabs and editors at %i columns', (width) => {
      for (const kit of [false, true]) {
        if (kit) kitToken = registerRenderKit(createTestRenderKit(), {});
        const host = setup(uneven, 40);
        const heights = new Set<number>();
        const seen = () => heights.add(host.component.render(width).length);
        seen();
        for (let i = 0; i < 14; i++) {
          host.send(KEY.down);
          seen();
        }
        host.send(KEY.pageDown);
        seen();
        host.send('n');
        seen();
        host.send('a', 'b', KEY.enter, 'N', 'c', KEY.esc);
        seen();
        for (let i = 0; i < 5; i++) {
          host.send(KEY.tab);
          seen();
        }
        expect(heights.size).toBe(1);
        // Whole component stays under half the terminal so chat history stays visible.
        expect([...heights][0]).toBeLessThanOrEqual(Math.floor(40 * 0.4));
        if (kit) {
          withdrawRenderKit(kitToken as symbol);
          kitToken = undefined;
        }
      }
    });

    it('scales the height budget with the terminal but never past 40% of it', () => {
      const height = (rows: number) =>
        setup(uneven, rows).component.render(80).length;
      expect(height(60)).toBeLessThanOrEqual(24);
      expect(height(60)).toBeGreaterThan(height(30));
      expect(height(100)).toBeLessThanOrEqual(40);
    });
  });

  describe('labels', () => {
    const labelled: Questionnaire = {
      labels: {
        yes: 'Sí',
        no: 'No',
        review: 'Revisión',
        reviewHeading: 'Revisa tus respuestas',
        submit: 'Enviar respuestas',
        backToEdit: 'Volver a editar',
        cancel: 'Cancelar',
        typeSomething: 'Escribe algo.',
        select: 'elegir',
        required: 'obligatoria',
        unanswered: 'sin responder',
        answered: 'respondidas',
        requiredPending:
          'pregunta(s) obligatoria(s) sin responder; puedes enviar.',
      },
      questions: [
        {
          id: 'c',
          header: 'Ok',
          prompt: '¿Seguimos?',
          type: 'confirm',
          required: true,
        },
        {
          id: 'o',
          header: 'Otro',
          prompt: 'Elige',
          type: 'single',
          options: options(2),
        },
      ],
    };

    it('renders confirm, free text, hints and tabs in the supplied language', () => {
      const host = setup(labelled);
      const out = host.text(140);
      expect(out).toContain('Sí');
      expect(out).toContain('0/2 respondidas');
      expect(out).toContain('(obligatoria)');
      expect(out).toContain('Enter elegir');
      expect(out).toContain('Esc cancelar');
      expect(out).toContain('Revisión');
      expect(out).not.toContain('Yes');
      host.send(KEY.tab);
      expect(host.text(140)).toContain('Escribe algo.');
      expect(host.text(140)).not.toContain('Type something.');
    });

    it('localizes review warnings for unanswered required questions', () => {
      const host = setup(labelled);
      host.send(KEY.tab, KEY.tab);
      const out = host.text(140);
      expect(out).toContain('⚠ obligatoria — sin responder');
      expect(out).toContain('1 pregunta(s) obligatoria(s)');
      expect(out).not.toContain('unanswered');
    });

    it('localizes the review tab while confirm values stay yes/no', () => {
      const host = setup(labelled);
      host.send('1');
      expect(host.session.state.answers.c).toMatchObject({
        values: ['yes'],
        labels: ['Sí'],
      });
      host.send(KEY.tab);
      const out = host.text(140);
      expect(out).toContain('Revisa tus respuestas');
      expect(out).toContain('Enviar respuestas');
      expect(out).toContain('Volver a editar');
      expect(out).toContain('Cancelar');
    });
  });
});
