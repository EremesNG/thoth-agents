import type {
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import {
  CURSOR_MARKER,
  getKeybindings,
  type TUI,
  visibleWidth,
} from '@earendil-works/pi-tui';
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
import {
  DEFAULT_LABELS,
  LABEL_KEYS,
  type Questionnaire,
} from '../src/schema.js';
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
  shiftEnter: '\x1b[13;2u',
  esc: '\x1b',
  pageDown: '\x1b[6~',
  shiftUp: '\x1b[1;2A',
  shiftDown: '\x1b[1;2B',
  altUp: '\x1b[1;3A',
  altDown: '\x1b[1;3B',
  collapse: '\x1d',
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
  const requestRender = vi.fn();
  const tui = { requestRender, terminal: { rows } } as unknown as TUI;
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
    requestRender,
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
  describe('single-row chrome', () => {
    const prompt = Array.from({ length: 50 }, (_, i) => `Prompt-${i}`).join(
      '\n',
    );
    const physicalRows = (frame: string[]) => frame.join('\n').split('\n');
    const expectRows = (frame: string[], width: number) => {
      expect(physicalRows(frame)).toHaveLength(frame.length);
      expect(frame.every((line) => !/[\r\n\t]/.test(line))).toBe(true);
      expect(frame.every((line) => visibleWidth(line) <= width)).toBe(true);
    };

    it.each([
      { width: 80, label: 'HEAD\nMIDDLE\nTAIL' },
      { width: 140, label: 'HEAD\nMIDDLE\nTAIL' },
      { width: 80, label: 'HEAD\r\t  MIDDLE\r\tTAIL' },
      { width: 140, label: 'HEAD\r\t  MIDDLE\r\tTAIL' },
    ])('normalizes option-note heading whitespace at $width×40 without growing the frame ($label)', ({
      width,
      label,
    }) => {
      const host = setup({
        questions: [
          {
            id: 'a',
            header: 'Choice',
            prompt,
            type: 'single',
            options: [{ value: 'a', label }],
          },
        ],
      });
      const height = host.component.render(width).length;
      expect(height).toBe(26);
      host.send('n');
      const frame = host.component.render(width);
      expect(frame).toHaveLength(height);
      expect(physicalRows(frame)).toHaveLength(height);
      expect(frame.join('\n')).toContain('Note for “HEAD MIDDLE TAIL”');
      expectRows(frame, width);
      expect(host.session.state.questions[0].options?.[0].label).toBe(label);
    });

    it.each([
      'Planning\nDetails',
      'Planning\r\n\t  Details',
    ])('normalizes the multiline title %j in the collapsed row', (title) => {
      const host = setup({ ...two, title });
      host.send(KEY.collapse);
      const frame = host.component.render(80);
      expect(frame).toEqual([' Planning Details · Ctrl+] expand · Esc cancel']);
      expect(physicalRows(frame)).toHaveLength(1);
      expectRows(frame, 80);
    });

    it.each([
      { width: 80, kit: false },
      { width: 140, kit: false },
      { width: 80, kit: true },
      { width: 140, kit: true },
    ])('normalizes multiline titles and tab headers at $width columns (kit: $kit)', ({
      width,
      kit,
    }) => {
      if (kit) kitToken = registerRenderKit(createTestRenderKit(), {});
      const host = setup({
        title: 'Planning\r\n\t  Details',
        questions: two.questions.map((q, i) => ({
          ...q,
          prompt,
          header: i === 0 ? 'First\nDetails' : 'Second\r\n\t  Details',
        })),
      });
      for (const header of ['[○ First Details]', '[○ Second Details]']) {
        const frame = host.component.render(width);
        expect(frame).toHaveLength(26);
        expect(physicalRows(frame)).toHaveLength(26);
        expect(frame[0]).toContain('Planning Details');
        expect(frame[1]).toContain(header);
        expectRows(frame, width);
        host.send(KEY.tab);
      }
      const review = host.component.render(width);
      expect(review.join('\n')).toContain('First Details:');
      expect(review.join('\n')).toContain('Second Details:');
      expectRows(review, width);
    });

    it.each([
      80, 140,
    ])('normalizes multiline label overrides in fixed rows across UI modes at %i columns', (width) => {
      const host = setup({
        labels: Object.fromEntries(
          LABEL_KEYS.map((key) => [key, `${DEFAULT_LABELS[key]}\r\n\t  extra`]),
        ),
        questions: [
          ...two.questions.map((q) => ({ ...q, prompt })),
          { id: 't', header: 'Text', prompt, type: 'text' },
        ],
      });
      const check = () => expectRows(host.component.render(width), width);
      check();
      host.send(KEY.down);
      check();
      expect(host.text(width)).toContain('Preview extra · ★ Recommended extra');
      host.send('n');
      check();
      expect(host.text(width)).toContain('Note for extra “Option 2”');
      expect(host.text(width)).toContain('Enter save extra');
      host.send('draft\n\t note', KEY.esc, 'N');
      check();
      expect(host.text(width)).toContain('Note for this question extra');
      host.send('question\n\t note', KEY.esc, KEY.down, KEY.down, KEY.enter);
      check();
      expect(host.text(width)).toContain('Type something. extra');
      host.send(KEY.esc, KEY.tab);
      check();
      host.send(KEY.tab);
      check();
      expect(host.text(width)).toContain('Your answer extra');
      host.send(KEY.esc);
      check();
      expect(host.text(width)).toContain(
        'No text yet. Press Enter to write an answer. extra',
      );
      host.send(KEY.tab);
      check();
      expect(host.text(width)).toContain('Review your answers extra');
      host.send(KEY.collapse);
      check();
      expect(host.text(width)).toContain(
        'Ask user extra · Ctrl+] expand extra',
      );
      expect(host.session.state.labels?.preview).toBe('Preview\r\n\t  extra');
    });
  });

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
    expect(text()).toContain('› 1. ○   Option 1');
    expect(text()).toContain('  2. ○ ★ Option 2');
    expect(text()).not.toContain('Option 2 ★ recommended');
    expect(session.state.answers.a.values).toEqual([]);
  });

  it('puts recommended status in the preview header without duplicating label text', () => {
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Choice',
          prompt: 'Pick',
          type: 'single',
          options: [
            { value: 'a', label: 'Plain' },
            {
              value: 'b',
              label: 'Better (Recommended)',
              recommended: true,
              preview: lines(40),
            },
          ],
        },
      ],
    });
    host.send(KEY.down);
    const out = host.text();
    expect(out).toContain('› 2. ○ ★ Better (Recommended)');
    expect(out).toMatch(/Preview · ★ Recommended \d+-\d+\/\d+/);
    expect(out).not.toContain('(Recommended) ★');
    expect(out).not.toContain('★ recommended');
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

  it('shows the full Work Panel proposal and wrapped choices when they fit', () => {
    const prompt =
      'Ambos widgets son secciones del Work Panel compartido de pi-core. Propuesta: mientras el agente trabaja, cada sección muestra lo en ejecución + los fallidos y hasta 3 completados del turno. En reposo (sin nada en ejecución), cada sección queda en 1 línea: `▲ Agents · 4 done · 1 failed` / `▲ Background · 2 done`. Navegación: `←` enfoca el panel (como hoy), `↑/↓` se mueve entre las líneas de sección, `Enter` abre el historial de esa sección, `→/Esc` sale. Los fallidos del turno pasan al resumen al enviar tu siguiente prompt. ¿De acuerdo?';
    const host = setup({
      questions: [
        {
          id: 'panel',
          header: 'Work Panel',
          prompt,
          type: 'single',
          options: [
            { value: 'yes', label: 'Así como está propuesto' },
            {
              value: 'inline',
              label:
                'Enter expande la sección en el sitio (filas) y un segundo Enter abre el historial completo',
            },
          ],
        },
      ],
    });
    const out = host.component.render(78);
    expect(out.length).toBeGreaterThanOrEqual(16);
    expect(out.length).toBeLessThanOrEqual(26);
    const body = out.map((line) => line.slice(2, -2).trim()).join(' ');
    expect(body).toContain(prompt);
    expect(body).toContain(
      'Enter expande la sección en el sitio (filas) y un segundo Enter abre el historial completo',
    );
    expect(out.join('\n')).not.toContain('…');
  });

  it.each([
    80, 140,
  ])('wraps option labels with an aligned hanging indent at %i columns', (width) => {
    for (const recommended of [false, true]) {
      const label =
        'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega';
      const host = setup({
        questions: [
          {
            id: 'a',
            header: 'Wrap',
            prompt: 'Pick',
            type: 'multi',
            options: [
              { value: 'a', label, recommended },
              { value: 'b', label: 'Other' },
            ],
          },
        ],
      });
      const out = host.component.render(width);
      const first = out.findIndex((line) => line.includes('alpha'));
      const last = out.findIndex((line) => line.includes('omega'));
      expect(last).toBeGreaterThan(first);
      const indent = recommended ? 9 : 7;
      for (const line of out.slice(first + 1, last + 1)) {
        expect(line.slice(2)).toMatch(new RegExp(`^ {${indent}}\\S`));
      }
      const rendered = out
        .slice(first, last + 1)
        .map((line) =>
          line.slice(2 + indent, width === 140 ? 2 + 59 : -2).trim(),
        )
        .join(' ');
      expect(rendered).toBe(label);
    }
  });

  it('gives spare rows to the preview and keeps two preview body rows when options overflow', () => {
    const questionnaire = (count: number): Questionnaire => ({
      questions: [
        {
          id: 'a',
          header: 'Preview',
          prompt: 'Pick',
          type: 'single',
          options: options(count).map((option) => ({
            ...option,
            recommended: false,
            preview: lines(40),
          })),
        },
      ],
    });
    const spare = setup(questionnaire(2));
    expect(spare.component.render(80)).toHaveLength(26);
    expect(spare.text()).toContain('Preview 1-13/79');
    expect(spare.text()).toContain('line 6');
    const crowded = setup(questionnaire(30));
    expect(crowded.component.render(80)).toHaveLength(26);
    expect(crowded.text()).toContain('Preview 1-2/79');
    expect(crowded.text()).toContain('line 0');
    expect(crowded.text()).not.toContain('line 1');
  });

  it('gives the preview rows left over between whole wrapped options in a scrolling window', () => {
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Whole items',
          prompt: 'Pick',
          type: 'single',
          options: Array.from({ length: 30 }, (_, i) => ({
            value: `v${i}`,
            label: `Choice ${i}\nContinuation ${i}`,
            preview: lines(40),
          })),
        },
      ],
    });
    expect(host.text()).toContain('Preview 1-3/79');
    expect(host.text()).toContain('Continuation 0');
    expect(host.component.render(80)).toHaveLength(26);
  });

  it('returns unused prompt and list rows on shorter tabs to the preview without changing height', () => {
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Long',
          prompt: 'One\nTwo\nThree\nFour\nFive\nSix',
          type: 'single',
          options: options(30).map((option) => ({
            ...option,
            recommended: false,
            preview: lines(40),
          })),
        },
        {
          id: 'b',
          header: 'Short',
          prompt: 'Pick',
          type: 'single',
          options: options(3).map((option) => ({
            ...option,
            recommended: false,
            preview: lines(40),
          })),
        },
      ],
    });
    expect(host.component.render(80)).toHaveLength(26);
    expect(host.text()).toContain('Preview 1-2/79');
    host.send(KEY.tab);
    expect(host.component.render(80)).toHaveLength(26);
    expect(host.text()).toContain('Preview 1-12/79');
  });

  it.each([
    80, 140,
  ])('keeps every row of the selected option visible in a scrolling list at %i columns', (width) => {
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Window',
          prompt: 'Pick',
          type: 'multi',
          options: Array.from({ length: 20 }, (_, i) => ({
            value: `v${i}`,
            label: `Choice-${i} starts here with a deliberately long explanation that wraps across multiple lines and ends at Tail-${i}.`,
          })),
        },
      ],
    });
    for (let i = 0; i < 15; i++) {
      host.send(KEY.down);
      const out = host.text(width);
      expect(out).toContain(`Choice-${i + 1}`);
      expect(out).toContain(`Tail-${i + 1}.`);
      expect(out).toContain(`${i + 2}/21`);
    }
    host.send(KEY.up);
    expect(host.text(width)).toContain('Choice-14');
    expect(host.text(width)).toContain('Tail-14.');
  });

  it('scrolls the option list before capping a prompt that fits with the minimum preview', () => {
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Priority',
          type: 'single',
          prompt: Array.from({ length: 13 }, (_, i) => `Prompt-row-${i}`).join(
            '\n',
          ),
          options: options(30),
        },
      ],
    });
    const out = host.component.render(80);
    expect(out).toHaveLength(26);
    expect(out.join('\n')).toContain('Prompt-row-12');
    expect(out.join('\n')).toContain('1/31');
    expect(out.join('\n')).toContain('Preview 1-2/3');
    expect(out.join('\n')).not.toContain('Alt+↑↓ prompt');
  });

  it('shows all fourteen prompt rows above a one-row preview at 80×40', () => {
    const promptRows = Array.from({ length: 14 }, (_, i) => `Prompt-row-${i}`);
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Priority',
          type: 'single',
          prompt: promptRows.join('\n'),
          options: options(30).map((option) => ({
            ...option,
            preview: 'One preview row',
          })),
        },
      ],
    });
    const out = host.component.render(80);
    expect(out).toHaveLength(26);
    const body = out.map((line) => line.slice(2, -2).trim()).join('\n');
    expect(body).toContain(promptRows.join('\n'));
    expect(out.join('\n')).not.toContain('Alt+↑↓ prompt');
    expect(out.join('\n')).toContain('› 1. ○   Option 1');
    expect(out.join('\n')).toContain('1/31');
    expect(out.join('\n')).toContain('One preview row');
    host.send(KEY.down);
    expect(host.component.render(80)).toHaveLength(26);
    expect(host.text()).toContain('Prompt-row-13');
    expect(host.text()).toContain('› 2. ○ ★ Option 2');
  });

  it('shows all sixteen prompt rows beside a complete selected option at 140×40', () => {
    const promptRows = Array.from({ length: 16 }, (_, i) => `Prompt-row-${i}`);
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Priority',
          type: 'single',
          prompt: promptRows.join('\n'),
          options: options(30).map((option) => ({
            ...option,
            preview: 'One preview row',
          })),
        },
      ],
    });
    const out = host.component.render(140);
    expect(out).toHaveLength(26);
    const body = out.map((line) => line.slice(2, -2).trim()).join('\n');
    expect(body).toContain(promptRows.join('\n'));
    expect(out.join('\n')).not.toContain('Alt+↑↓ prompt');
    expect(out.join('\n')).toContain('› 1. ○   Option 1');
    expect(out.join('\n')).toContain('1/31');
    expect(out.join('\n')).toContain('One preview row');
    host.send(KEY.down);
    expect(host.component.render(140)).toHaveLength(26);
    expect(host.text(140)).toContain('Prompt-row-15');
    expect(host.text(140)).toContain('› 2. ○ ★ Option 2');
  });

  it.each([
    80, 140,
  ])('shows a fitting active prompt despite a six-row label on another tab at %i columns', (width) => {
    const promptRows = Array.from(
      { length: 13 },
      (_, i) => `Active-prompt-${i}`,
    );
    const labelRows = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Prompt',
          type: 'single',
          prompt: promptRows.join('\n'),
          options: options(30),
        },
        {
          id: 'b',
          header: 'Label',
          type: 'single',
          prompt: 'Pick',
          options: [
            {
              value: 'long',
              label: labelRows.join('\n'),
              preview: lines(40),
            },
            { value: 'short', label: 'Short' },
          ],
        },
      ],
    });
    const height = host.component.render(width).length;
    expect(height).toBe(26);
    for (const keys of [[], [KEY.down], ['n'], [KEY.esc, KEY.up]]) {
      host.send(...keys);
      const frame = host.component.render(width);
      expect(frame).toHaveLength(height);
      const body = frame.map((line) => line.slice(2, -2).trim()).join('\n');
      expect(body).toContain(promptRows.join('\n'));
      expect(frame.join('\n')).not.toContain('Alt+↑↓ prompt');
    }
    host.send(KEY.tab);
    const labelFrame = host.component.render(width);
    expect(labelFrame).toHaveLength(height);
    for (const row of labelRows) expect(labelFrame.join('\n')).toContain(row);
    for (const keys of [[KEY.down], ['N'], [KEY.esc, KEY.tab], [KEY.tab]]) {
      host.send(...keys);
      expect(host.component.render(width)).toHaveLength(height);
    }
    expect(host.text(width)).toContain('Active-prompt-12');
    expect(host.text(width)).not.toContain('Alt+↑↓ prompt');
  });

  it.each([
    16, 21,
  ])('reveals every wrapped prompt tail when scrolling at 80×%i', (rows) => {
    const host = setup(
      {
        questions: [
          {
            id: 'a',
            header: 'Prompt',
            type: 'single',
            prompt: ['A', 'B', 'C']
              .map((letter, i) => `${letter.repeat(70)}_TAIL${i}`)
              .join('\n'),
            options: options(3),
          },
        ],
      },
      rows,
    );
    const height = host.component.render(80).length;
    expect(host.text()).toContain('Alt+↑↓ prompt');
    const frames: string[] = [];
    for (let i = 0; i < 12; i++) {
      const frame = host.component.render(80);
      expect(frame).toHaveLength(height);
      expect(frame.every((line) => visibleWidth(line) <= 80)).toBe(true);
      frames.push(frame.join('\n'));
      host.send(KEY.altDown);
    }
    for (const tail of ['_TAIL0', '_TAIL1', '_TAIL2']) {
      expect(frames.join('\n')).toContain(tail);
    }
  });

  it('scrolls capped prompts with Alt+arrows, shows an indicator and resets on tab switch', () => {
    const prompt = Array.from({ length: 50 }, (_, i) => `Prompt-row-${i}`).join(
      '\n',
    );
    const host = setup({
      questions: [
        {
          id: 'a',
          header: 'Long',
          prompt,
          type: 'single',
          options: options(3),
        },
        {
          id: 'b',
          header: 'Short',
          prompt: 'Short prompt',
          type: 'single',
          options: options(2),
        },
      ],
    });
    expect(host.component.render(80)).toHaveLength(26);
    expect(host.text()).toContain('Prompt-row-0');
    expect(host.text()).not.toContain('Prompt-row-49');
    expect(host.text()).toMatch(/↓ \d+ more/);
    expect(host.text()).toContain('Alt+↑↓ prompt');
    host.send(KEY.altDown);
    expect(host.text()).not.toContain('Prompt-row-0');
    expect(host.text()).toContain('↑ 1 more');
    host.send(KEY.altUp);
    expect(host.text()).toContain('Prompt-row-0');
    for (let i = 0; i < 60; i++) host.send(KEY.altDown);
    expect(host.text()).toContain('Prompt-row-49');
    host.send(KEY.tab, KEY.shiftTab);
    expect(host.text()).toContain('Prompt-row-0');
    host.send('n', KEY.altDown);
    expect(host.text()).not.toContain('Prompt-row-0');
    expect(host.text()).toContain('Note for');
    expect(setup(two).text()).not.toContain('Alt+↑↓ prompt');
  });

  it.each([
    80, 140,
  ])('shows prompt scroll help only for the active overflowing prompt without changing height at %i columns', (width) => {
    const host = setup({
      questions: [
        {
          ...two.questions[0],
          prompt: Array.from({ length: 50 }, (_, i) => `Prompt-${i}`).join(
            '\n',
          ),
        },
        { ...two.questions[1], prompt: 'Short prompt' },
      ],
    });
    const height = host.component.render(width).length;
    expect(host.text(width)).toContain('Alt+↑↓ prompt');
    host.send(KEY.tab);
    expect(host.text(width)).toContain('Short prompt');
    expect(host.text(width)).not.toContain('Alt+↑↓ prompt');
    expect(host.component.render(width)).toHaveLength(height);
    host.send('N');
    expect(host.text(width)).not.toContain('Alt+↑↓ prompt');
    expect(host.component.render(width)).toHaveLength(height);
    host.send(KEY.esc, KEY.tab);
    expect(host.text(width)).toContain('Review your answers');
    expect(host.text(width)).not.toContain('Alt+↑↓ prompt');
    expect(host.component.render(width)).toHaveLength(height);
    host.send(KEY.tab);
    expect(host.text(width)).toContain('Alt+↑↓ prompt');
    expect(host.component.render(width)).toHaveLength(height);
  });

  it.each([
    false,
    true,
  ])('preserves native editor Alt+arrows unless the active prompt overflows (%s)', (overflow) => {
    const keybindings = getKeybindings();
    const previous = keybindings.getUserBindings();
    keybindings.setUserBindings({
      ...previous,
      'tui.editor.cursorUp': 'alt+up',
      'tui.editor.cursorDown': 'alt+down',
    });
    try {
      const host = setup({
        questions: [
          {
            ...two.questions[0],
            prompt: Array.from({ length: 50 }, (_, i) => `Prompt-${i}`).join(
              '\n',
            ),
          },
          {
            id: 'b',
            header: 'Text',
            prompt: overflow
              ? Array.from({ length: 50 }, (_, i) => `Edit-prompt-${i}`).join(
                  '\n',
                )
              : 'Short prompt',
            type: 'text',
          },
        ],
      });
      host.send(KEY.tab);
      host.component.render(80);
      host.send(
        '\x1b[200~Head\nTail\x1b[201~',
        KEY.altUp,
        '!',
        KEY.altDown,
        '!',
        KEY.esc,
      );
      expect(host.session.state.answers.b.customText).toBe(
        overflow ? 'Head\nTail!!' : 'Head!\nTail!',
      );
      if (overflow) {
        expect(host.text()).not.toContain('Edit-prompt-0');
        expect(host.text()).toContain('↑ 1 more');
      } else expect(host.text()).toContain('Short prompt');
    } finally {
      keybindings.setUserBindings(previous);
    }
  });

  it.each([
    'options',
    'review',
    'text',
    'custom',
    'optionNote',
    'questionNote',
  ])('collapses to one row, ignores input and restores the exact %s state', (mode) => {
    const host = setup({
      title: 'Planning',
      questions: [
        {
          ...two.questions[0],
          prompt: Array.from({ length: 50 }, (_, i) => `Prompt-${i}`).join(
            '\n',
          ),
          options: options(30).map((option) => ({
            ...option,
            preview: lines(40),
          })),
        },
        { id: 'text', header: 'Text', prompt: 'Explain', type: 'text' },
      ],
    });
    if (mode === 'options') {
      for (let i = 0; i < 20; i++) host.send(KEY.down);
      host.send(KEY.altDown, KEY.shiftDown);
    } else if (mode === 'review') host.send(KEY.tab, KEY.tab, KEY.down);
    else if (mode === 'text') host.send(KEY.tab, 'draft', KEY.left);
    else if (mode === 'custom') {
      for (let i = 0; i < 30; i++) host.send(KEY.down);
      host.send(KEY.enter, 'draft', KEY.left);
    } else host.send(mode === 'optionNote' ? 'n' : 'N', 'draft', KEY.left);
    const before = host.component.render(80);
    const state = host.session.state;
    expect(before.join('\n')).toContain('Ctrl+] collapse');
    host.requestRender.mockClear();
    host.send(KEY.collapse);
    const collapsed = host.component.render(80);
    expect(collapsed).toEqual([' Planning · Ctrl+] expand · Esc cancel']);
    expect(visibleWidth(host.component.render(20)[0])).toBeLessThanOrEqual(20);
    host.send(
      KEY.down,
      KEY.tab,
      KEY.enter,
      '1',
      'ignored',
      KEY.altDown,
      KEY.right,
    );
    expect(host.component.render(80)).toEqual(collapsed);
    expect(host.results).toEqual([]);
    expect(host.session.state).toBe(state);
    host.send(KEY.collapse);
    expect(host.component.render(80)).toEqual(before);
    expect(host.requestRender).toHaveBeenCalledTimes(2);
  });

  it('toggles only once per Kitty key press, ignoring repeats and releases', () => {
    const host = setup(two);
    host.send('\x1b[93;5u', '\x1b[93;5:2u', '\x1b[93;5:3u');
    expect(host.component.render(80)).toHaveLength(1);
    host.send('\x1b[93;5u', '\x1b[93;5:3u');
    expect(host.component.render(80).length).toBeGreaterThan(1);
  });

  it('Esc cancels while collapsed even when an editor was active', () => {
    const host = setup(two);
    host.send('1', 'N', 'draft', KEY.collapse, KEY.esc);
    expect(host.results[0]?.details.cancelled).toBe(true);
    expect(host.results[0]?.details.answers.a.values).toEqual(['v1']);
    expect(host.results).toHaveLength(1);
  });

  it('keeps the selected option and height cap even when a tiny terminal cannot fit the normal minimums', () => {
    const host = setup(
      {
        questions: [
          {
            id: 'a',
            header: 'Tiny',
            type: 'single',
            prompt: Array.from(
              { length: 50 },
              (_, i) => `Prompt-row-${i}`,
            ).join('\n'),
            options: options(30),
          },
        ],
      },
      16,
    );
    expect(() => host.component.render(80)).not.toThrow();
    const out = host.component.render(80);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.join('\n')).toContain('› 1. ○   Option 1');
    expect(out.find((line) => line.includes('Prompt-row-0'))).toContain('↓');
    host.send(KEY.down);
    expect(host.text()).toContain('› 2. ○ ★ Option 2');
  });

  it('keeps all three selected label rows visible at 80×16 without growing the frame', () => {
    const host = setup(
      {
        questions: [
          {
            id: 'a',
            header: 'Tiny',
            type: 'single',
            prompt: 'Pick',
            options: [
              { value: 'short', label: 'Short' },
              { value: 'long', label: 'HEAD\nMIDDLE\nTAIL' },
            ],
          },
        ],
      },
      16,
    );
    expect(host.component.render(80)).toHaveLength(12);
    host.send(KEY.down);
    const out = host.component.render(80);
    const first = out.findIndex((line) => line.includes('› 2. ○ HEAD'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(
      out.slice(first, first + 3).map((line) => line.slice(2, -2).trim()),
    ).toEqual(['› 2. ○ HEAD', 'MIDDLE', 'TAIL']);
    expect(out).toHaveLength(12);
    host.send(KEY.up, KEY.down);
    expect(host.text()).toContain('TAIL');
    expect(host.component.render(80)).toHaveLength(12);
  });

  it('keeps all four selected label rows visible at 80×21 without growing the frame', () => {
    const host = setup(
      {
        questions: [
          {
            id: 'a',
            header: 'Tiny',
            type: 'single',
            prompt: 'Pick',
            options: [
              { value: 'short', label: 'Short' },
              { value: 'long', label: 'HEAD\nMIDDLE-ONE\nMIDDLE-TWO\nTAIL' },
            ],
          },
        ],
      },
      21,
    );
    expect(host.component.render(80)).toHaveLength(13);
    host.send(KEY.down);
    const out = host.component.render(80);
    const first = out.findIndex((line) => line.includes('› 2. ○ HEAD'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(
      out.slice(first, first + 4).map((line) => line.slice(2, -2).trim()),
    ).toEqual(['› 2. ○ HEAD', 'MIDDLE-ONE', 'MIDDLE-TWO', 'TAIL']);
    expect(out).toHaveLength(13);
    host.send(KEY.up, KEY.down);
    expect(host.text()).toContain('TAIL');
    expect(host.component.render(80)).toHaveLength(13);
  });

  it('marks the last visible label row when the selected label cannot fit even with a one-row prompt', () => {
    const host = setup(
      {
        questions: [
          {
            id: 'a',
            header: 'Tiny',
            type: 'single',
            prompt: 'Prompt-first\nPrompt-last',
            options: [
              { value: 'short', label: 'Short' },
              {
                value: 'long',
                label: 'HEAD\nMIDDLE-ONE\nMIDDLE-TWO\nMIDDLE-THREE\nTAIL',
              },
            ],
          },
        ],
      },
      16,
    );
    const height = host.component.render(80).length;
    host.send(KEY.down);
    expect(() => host.component.render(80)).not.toThrow();
    const out = host.component.render(80);
    const first = out.findIndex((line) => line.includes('› 2. ○ HEAD'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(
      out.slice(first, first + 3).map((line) => line.slice(2, -2).trim()),
    ).toEqual(['› 2. ○ HEAD', 'MIDDLE-ONE', 'MIDDLE-TWO…']);
    expect(out.find((line) => line.includes('Prompt-first'))).toContain('↓');
    expect(out.join('\n')).not.toContain('TAIL');
    expect(out).toHaveLength(height);
    expect(out.length).toBeLessThanOrEqual(12);
    host.send(KEY.altDown);
    expect(host.text()).toContain('Prompt-last');
    expect(host.component.render(80)).toHaveLength(height);
    host.send(KEY.up, KEY.down);
    expect(host.text()).toContain('MIDDLE-TWO…');
    expect(host.component.render(80)).toHaveLength(height);
  });

  it.each([
    { kind: 'multiline', label: 'Head\nTail' },
    {
      kind: 'wrapped',
      label:
        'Head starts here with a deliberately long explanation that wraps across multiple lines and continues with additional context before the selected option finally ends at Tail.',
    },
  ])('prioritizes every row of a selected $kind label over preview rows at 80×21', ({
    label,
  }) => {
    const host = setup(
      {
        questions: [
          {
            id: 'a',
            header: 'Tiny',
            type: 'single',
            prompt: 'Pick',
            options: [
              { value: 'short', label: 'Short' },
              { value: 'long', label, preview: 'Preview-body-content' },
            ],
          },
        ],
      },
      21,
    );
    const height = host.component.render(80).length;
    host.send(KEY.down);
    const out = host.component.render(80);
    const first = out.findIndex((line) => line.includes('Head'));
    const last = out.findIndex((line) => line.includes('Tail'));
    expect(last).toBeGreaterThan(first);
    expect(
      out
        .slice(first, last + 1)
        .map((line) => line.slice(9, -2).trim())
        .join(' '),
    ).toBe(label.replace('\n', ' '));
    expect(out.join('\n')).not.toContain('Preview-body-content');
    expect(out).toHaveLength(height);
    expect(out.length).toBeLessThanOrEqual(13);
    host.send(KEY.up, KEY.down);
    expect(host.text()).toContain('Tail');
    expect(host.component.render(80)).toHaveLength(height);
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
    expect(text()).toContain('↓');
    send(KEY.down);
    expect(text()).toContain('Plain description');
  });

  it.each([
    80, 140,
  ])('scrolls a 15-line preview to its last line with Shift+arrows and brackets at %i columns', (width) => {
    const q: Questionnaire = {
      questions: [
        {
          id: 'a',
          header: 'P',
          prompt: 'p',
          type: 'single',
          options: [
            { value: 'x', label: 'X', preview: lines(8) },
            { value: 'y', label: 'Y' },
          ],
        },
      ],
    };
    for (const key of [KEY.shiftDown, ']']) {
      const { send, component } = setup(q, 24);
      const joined = () => component.render(width).join('\n');
      const before = component.render(width);
      expect(joined()).toMatch(/↓ \d+ more/);
      expect(joined()).not.toContain('line 7');
      for (let i = 0; i < 20; i++) send(key);
      const after = component.render(width);
      expect(after.join('\n')).toContain('line 7');
      expect(after.join('\n')).not.toMatch(/↓ \d+ more/);
      expect(after.join('\n')).toMatch(/↑ \d+ more/);
      expect(after.length).toBe(before.length);
      send(KEY.shiftUp);
      expect(joined()).toContain('↓ 1 more');
    }
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

  it.each([
    { mode: 'text', width: 80 },
    { mode: 'text', width: 140 },
    { mode: 'custom', width: 80 },
    { mode: 'custom', width: 140 },
    { mode: 'optionNote', width: 80 },
    { mode: 'optionNote', width: 140 },
    { mode: 'questionNote', width: 80 },
    { mode: 'questionNote', width: 140 },
  ])('keeps the $mode draft and native borders visible under a 50-line prompt at $width×40 without changing height', ({
    mode,
    width,
  }) => {
    const host = setup({
      questions: [
        {
          id: 'draft',
          header: 'Draft',
          prompt: Array.from({ length: 50 }, (_, i) => `Prompt-${i}`).join(
            '\n',
          ),
          ...(mode === 'text'
            ? { type: 'text' as const }
            : { type: 'single' as const, options: options(1) }),
        },
        two.questions[1],
      ],
    });
    const openKeys =
      mode === 'text'
        ? []
        : mode === 'custom'
          ? [KEY.down, KEY.enter]
          : [mode === 'optionNote' ? 'n' : 'N'];
    const height = host.component.render(width).length;
    host.send(...openKeys, 'VISIBLE-DRAFT');
    const frame = host.component.render(width);
    expect(frame.join('\n')).toContain('VISIBLE-DRAFT');
    const cursorRow = frame.findIndex((line) => line.includes(CURSOR_MARKER));
    expect(cursorRow).toBeGreaterThan(0);
    for (const border of [frame[cursorRow - 1], frame[cursorRow + 1]]) {
      expect(border.slice(2, -2).trim()).toMatch(/^─+$/);
    }
    expect(frame).toHaveLength(height);
    expect(frame.join('\n')).toContain('Alt+↑↓ prompt');
    host.send(KEY.esc, KEY.tab);
    expect(host.component.render(width)).toHaveLength(height);
    host.send(KEY.shiftTab, ...(mode === 'text' ? [KEY.enter] : openKeys));
    expect(host.text(width)).toContain('VISIBLE-DRAFT');
    expect(host.component.render(width)).toHaveLength(height);
  });

  it.each([
    { width: 80, rows: 40 },
    { width: 140, rows: 40 },
    { width: 80, rows: 16 },
    { width: 140, rows: 16 },
  ])('keeps the cursor line of a tall draft visible instead of its tail at $width×$rows', ({
    width,
    rows,
  }) => {
    const host = setup(
      {
        questions: [
          {
            id: 'draft',
            header: 'Draft',
            prompt: Array.from({ length: 50 }, (_, i) => `Prompt-${i}`).join(
              '\n',
            ),
            type: 'text',
          },
        ],
      },
      rows,
    );
    const height = host.component.render(width).length;
    for (let i = 0; i < 20; i++) {
      host.send(`Draft-${i}`, ...(i < 19 ? [KEY.shiftEnter] : []));
    }
    for (let i = 0; i < 18; i++) host.send(KEY.up);
    host.send('VISIBLE-DRAFT');
    const frame = host.component.render(width);
    expect(frame.join('\n')).toContain('VISIBLE-DRAFT');
    const cursorRow = frame.findIndex((line) => line.includes(CURSOR_MARKER));
    expect(cursorRow).toBeGreaterThan(0);
    for (const border of [frame[cursorRow - 1], frame[cursorRow + 1]]) {
      expect(border.slice(2, -2).trim()).toMatch(/^─.*─$/);
    }
    expect(frame).toHaveLength(height);
    expect(frame.every((line) => visibleWidth(line) <= width)).toBe(true);
    if (rows === 16) {
      expect(frame.find((line) => line.includes('Prompt-0'))).toContain('↓');
    }
    host.send(KEY.esc);
    expect(host.component.render(width)).toHaveLength(height);
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
        expect([...heights][0]).toBeGreaterThanOrEqual(16);
        expect([...heights][0]).toBeLessThanOrEqual(26);
        if (kit) {
          withdrawRenderKit(kitToken as symbol);
          kitToken = undefined;
        }
      }
    });

    it('uses at least the base height and grows for content up to 65% of the terminal', () => {
      const height = (rows: number) =>
        setup(uneven, rows).component.render(80).length;
      expect(height(40)).toBe(26);
      expect(height(60)).toBeGreaterThanOrEqual(24);
      expect(height(60)).toBeLessThanOrEqual(39);
      expect(height(60)).toBeGreaterThan(height(30));
      expect(height(100)).toBeGreaterThanOrEqual(40);
      expect(height(100)).toBeLessThanOrEqual(65);
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
        collapse: 'replegar',
        expand: 'desplegar',
        recommended: 'recomendado',
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

    it('localizes collapse controls and recommended preview headers', () => {
      const host = setup(labelled);
      expect(host.text()).toContain('Ctrl+] replegar');
      host.send(KEY.collapse);
      expect(host.component.render(80)).toEqual([
        ' Ask user · Ctrl+] desplegar · Esc cancelar',
      ]);
      host.send(KEY.collapse, KEY.tab, KEY.down);
      expect(host.text()).toContain('Preview · ★ Recomendado');
      expect(host.text()).not.toContain('Option 2 ★');
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
