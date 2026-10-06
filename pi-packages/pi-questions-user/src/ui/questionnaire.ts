import type {
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { getSelectListTheme } from '@earendil-works/pi-coding-agent';
import {
  type Component,
  Editor,
  matchesKey,
  type TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import {
  type AnswerState,
  buildResult,
  getAnswer,
  markSkipped,
  type QuestionResult,
  selectOption,
  setCustomText,
  setOptionNote,
  setQuestionNote,
  toggleOption,
} from '../answers.js';
import type { QuestionUIFactory, QuestionUISession } from '../custom-ui.js';
import { getOwn } from '../records.js';
import type { Question } from '../schema.js';
import { type Labels, type QuestionOption, resolveLabels } from '../schema.js';
import { pad, renderFrame } from './frame.js';
import {
  CHROME_ROWS,
  heightBudget,
  isWide,
  MAX_PROMPT_ROWS,
  MIN_CONTENT_ROWS,
  splitColumns,
  windowStart,
} from './layout.js';
import { MarkdownCache } from './markdown-cache.js';

type EditTarget =
  | { kind: 'custom'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'optionNote'; id: string; value: string };

type ReviewRow =
  | { kind: 'question'; index: number }
  | { kind: 'action'; action: 'submit' | 'back' | 'cancel' };

const MIN_NARROW_PREVIEW = 2;
const REVIEW_ACTIONS = ['submit', 'back', 'cancel'] as const;

/** Static geometry of the frame body; see QuestionnaireComponent.layout. */
interface Layout {
  inner: number;
  wide: boolean;
  left: number;
  right: number;
  promptRows: number;
  content: number;
  listRows: number;
  previewBody: number;
}

/** Exactly `rows` lines: clipped, or padded with blanks. */
function fixed(lines: string[], rows: number): string[] {
  return Array.from({ length: rows }, (_, i) => lines[i] ?? '');
}

/** Free-text row index for questions that accept typed answers; absent for confirm. */
function hasFreeText(question: Question): boolean {
  return question.type !== 'confirm';
}

function rowCount(question: Question): number {
  return (question.options?.length ?? 0) + (hasFreeText(question) ? 1 : 0);
}

export class QuestionnaireComponent implements Component {
  private state: AnswerState;
  private tab = 0;
  private readonly cursors: number[];
  private readonly starts: number[];
  private reviewCursor = 0;
  private reviewStart = 0;
  private previewScroll = 0;
  private edit?: { target: EditTarget; editor: Editor };
  private finished = false;
  private readonly onAbort = () => this.finish(true, 'aborted');
  private readonly markdown = new MarkdownCache();
  private readonly layouts = new Map<string, Layout>();
  private readonly labels: Labels;
  private lastWidth = 80;

  constructor(
    private readonly session: QuestionUISession,
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: (result: QuestionResult | undefined) => void,
  ) {
    this.state = session.state;
    this.labels = resolveLabels(session.state.labels);
    this.cursors = this.state.questions.map(() => 0);
    this.starts = this.state.questions.map(() => 0);
    session.signal?.addEventListener('abort', this.onAbort, { once: true });
    this.enterTab();
    if (session.signal?.aborted) this.onAbort();
  }

  // --- state helpers -------------------------------------------------------

  private get reviewIndex(): number | undefined {
    return this.state.questions.length > 1
      ? this.state.questions.length
      : undefined;
  }

  private get question(): Question | undefined {
    return this.state.questions[this.tab];
  }

  private apply(next: AnswerState): void {
    this.state = next;
    this.session.onStateChange(next);
  }

  private finish(cancelled: boolean, error?: 'aborted'): void {
    if (this.finished) return;
    this.dispose();
    this.done(buildResult(this.state, { cancelled, error }));
  }

  dispose(): void {
    this.finished = true;
    this.session.signal?.removeEventListener('abort', this.onAbort);
  }

  // --- navigation ----------------------------------------------------------

  private goTo(tab: number): void {
    const last = this.reviewIndex ?? this.state.questions.length - 1;
    this.tab = (tab + last + 1) % (last + 1);
    this.previewScroll = 0;
    this.enterTab();
  }

  /** Unanswered text questions open straight into the editor. */
  private enterTab(): void {
    const question = this.question;
    if (
      question?.type === 'text' &&
      getAnswer(this.state, question.id).status !== 'answered'
    ) {
      this.openEditor({ kind: 'custom', id: question.id });
    }
  }

  private advance(): void {
    if (this.reviewIndex === undefined) {
      this.finish(false);
      return;
    }
    this.goTo(this.tab + 1);
  }

  private move(delta: number): void {
    const question = this.question;
    if (!question) return;
    const total = rowCount(question);
    this.cursors[this.tab] = Math.min(
      Math.max(this.cursors[this.tab] + delta, 0),
      total - 1,
    );
    this.previewScroll = 0;
  }

  private focusedValue(question: Question): string | undefined {
    return question.options?.[this.cursors[this.tab]]?.value;
  }

  // --- answering -----------------------------------------------------------

  private choose(question: Question, index: number, activate: boolean): void {
    const option = question.options?.[index];
    if (!option) {
      if (hasFreeText(question)) {
        this.openEditor({ kind: 'custom', id: question.id });
      }
      return;
    }
    if (question.type === 'multi') {
      this.apply(toggleOption(this.state, question.id, option.value));
      return;
    }
    this.apply(selectOption(this.state, question.id, option.value));
    if (activate) this.advance();
  }

  private activate(): void {
    const question = this.question;
    if (!question) return;
    const index = this.cursors[this.tab];
    const isOption = index < (question.options?.length ?? 0);
    if (question.type === 'multi' && isOption) {
      // Enter confirms a multi question; Space toggles.
      this.advance();
      return;
    }
    this.choose(question, index, true);
  }

  private openEditor(target: EditTarget): void {
    const answer = getAnswer(this.state, target.id);
    const initial =
      target.kind === 'custom'
        ? (answer.customText ?? '')
        : target.kind === 'note'
          ? (answer.note ?? '')
          : (getOwn(answer.optionNotes, target.value) ?? '');
    const editor = new Editor(
      this.tui,
      {
        borderColor: (s) => this.theme.fg('borderMuted', s),
        selectList: getSelectListTheme(),
      },
      { paddingX: 0 },
    );
    editor.setText(initial);
    editor.focused = true;
    // The editor clears itself on submit, so take the text from the callback.
    editor.onSubmit = (submitted) => this.closeEditor(true, submitted);
    this.edit = { target, editor };
  }

  /** Saves the draft text. Only an explicit submit may advance or finish. */
  private closeEditor(submitted: boolean, submittedText?: string): void {
    const edit = this.edit;
    if (!edit) return;
    this.edit = undefined;
    const text = submittedText ?? edit.editor.getText();
    const { target } = edit;
    if (target.kind === 'custom') {
      this.apply(setCustomText(this.state, target.id, text));
      const question = this.state.questions.find((q) => q.id === target.id);
      if (
        submitted &&
        question?.type !== 'multi' &&
        getAnswer(this.state, target.id).status === 'answered'
      ) {
        this.advance();
      }
    } else if (target.kind === 'note') {
      this.apply(setQuestionNote(this.state, target.id, text));
    } else {
      this.apply(setOptionNote(this.state, target.id, target.value, text));
    }
  }

  // --- input ---------------------------------------------------------------

  handleInput(data: string): void {
    if (this.finished) return;
    if (this.edit) {
      this.handleEditorInput(data);
      return;
    }
    if (matchesKey(data, 'escape')) {
      this.finish(true);
      return;
    }
    if (matchesKey(data, 'tab') || matchesKey(data, 'right')) {
      this.goTo(this.tab + 1);
      return;
    }
    if (matchesKey(data, 'shift+tab') || matchesKey(data, 'left')) {
      this.goTo(this.tab - 1);
      return;
    }
    if (this.tab === this.reviewIndex) {
      this.handleReviewInput(data);
      return;
    }
    this.handleQuestionInput(data);
  }

  private handleEditorInput(data: string): void {
    if (matchesKey(data, 'escape')) {
      this.closeEditor(false);
      return;
    }
    if (matchesKey(data, 'tab') || matchesKey(data, 'shift+tab')) {
      const delta = matchesKey(data, 'tab') ? 1 : -1;
      this.closeEditor(false);
      this.goTo(this.tab + delta);
      return;
    }
    this.edit?.editor.handleInput(data);
  }

  private handleQuestionInput(data: string): void {
    const question = this.question;
    if (!question) return;
    if (matchesKey(data, 'up')) {
      this.move(-1);
      return;
    }
    if (matchesKey(data, 'down')) {
      this.move(1);
      return;
    }
    if (matchesKey(data, 'home')) {
      this.move(-Number.MAX_SAFE_INTEGER);
      return;
    }
    if (matchesKey(data, 'end')) {
      this.move(Number.MAX_SAFE_INTEGER);
      return;
    }
    if (matchesKey(data, 'pageUp')) {
      this.scrollPreview(-1);
      return;
    }
    if (matchesKey(data, 'pageDown')) {
      this.scrollPreview(1);
      return;
    }
    if (matchesKey(data, 'enter')) {
      this.activate();
      return;
    }
    if (matchesKey(data, 'space')) {
      this.choose(question, this.cursors[this.tab], false);
      return;
    }
    if (/^[1-9]$/.test(data)) {
      const index = Number(data) - 1;
      if (index < (question.options?.length ?? 0)) {
        this.cursors[this.tab] = index;
        this.previewScroll = 0;
        this.choose(question, index, question.type !== 'multi');
      }
      return;
    }
    if (data === 'N' || matchesKey(data, 'shift+n')) {
      this.openEditor({ kind: 'note', id: question.id });
      return;
    }
    if (data === 'n') {
      const value = this.focusedValue(question);
      if (value !== undefined) {
        this.openEditor({ kind: 'optionNote', id: question.id, value });
      }
      return;
    }
    if (data === 'x' || matchesKey(data, 'delete')) {
      this.apply(markSkipped(this.state, question.id));
    }
  }

  private reviewRows(): ReviewRow[] {
    return [
      ...this.state.questions.map(
        (_q, index): ReviewRow => ({ kind: 'question', index }),
      ),
      ...REVIEW_ACTIONS.map(
        (action): ReviewRow => ({ kind: 'action', action }),
      ),
    ];
  }

  /** First unanswered required question, else first unanswered, else the first. */
  private firstUnanswered(): number {
    const questions = this.state.questions;
    const open = (q: Question) =>
      getAnswer(this.state, q.id).status !== 'answered';
    const index = questions.findIndex((q) => q.required && open(q));
    return index >= 0 ? index : Math.max(questions.findIndex(open), 0);
  }

  private handleReviewInput(data: string): void {
    const rows = this.reviewRows();
    if (matchesKey(data, 'up')) {
      this.reviewCursor = Math.max(this.reviewCursor - 1, 0);
    } else if (matchesKey(data, 'down')) {
      this.reviewCursor = Math.min(this.reviewCursor + 1, rows.length - 1);
    } else if (matchesKey(data, 'enter') || matchesKey(data, 'space')) {
      const row = rows[this.reviewCursor];
      if (row.kind === 'question') {
        this.goTo(row.index);
        return;
      }
      if (row.action === 'submit') {
        this.finish(false);
        return;
      }
      if (row.action === 'cancel') {
        this.finish(true);
        return;
      }
      this.goTo(this.firstUnanswered());
    }
  }

  private scrollPreview(direction: number): void {
    this.previewScroll = Math.max(
      0,
      this.previewScroll + direction * Math.max(1, this.previewHeight() >> 1),
    );
  }

  // --- rendering -----------------------------------------------------------

  invalidate(): void {
    this.markdown.clear();
    this.layouts.clear();
    this.edit?.editor.invalidate();
  }

  /**
   * Static geometry for a width/terminal height. It depends only on the
   * questionnaire content, never on cursor, tab or answers, so the component
   * keeps one height while the user navigates.
   */
  private layout(width: number): Layout {
    const rows = this.tui.terminal.rows;
    const key = `${width}x${rows}`;
    let layout = this.layouts.get(key);
    if (layout) return layout;
    const inner = Math.max(1, width - 4);
    const wide = isWide(width);
    const { left, right } = splitColumns(inner);
    const questions = this.state.questions;
    const promptRows = Math.min(
      MAX_PROMPT_ROWS,
      Math.max(1, ...questions.map((q) => this.promptLines(q, inner).length)),
    );
    const interactive = questions.filter((q) => q.type !== 'text');
    const listNeed = Math.max(0, ...interactive.map(rowCount));
    const previewNeed = Math.max(
      0,
      ...interactive.flatMap((q) =>
        (q.options ?? []).map(
          (option) =>
            this.markdown.render(
              this.previewSource(option),
              wide ? right : inner,
            ).length,
        ),
      ),
    );
    const narrowPreview = Math.min(
      Math.max(previewNeed, MIN_NARROW_PREVIEW),
      4,
    );
    const review =
      this.reviewIndex === undefined ? 0 : questions.length + 3 + 2;
    const needed = Math.max(
      MIN_CONTENT_ROWS,
      review,
      wide
        ? Math.max(listNeed, previewNeed + 1) + 1
        : listNeed + 1 + narrowPreview + 1,
    );
    const budget = heightBudget(rows) - CHROME_ROWS - promptRows;
    const content = Math.max(MIN_CONTENT_ROWS, Math.min(needed, budget));
    // Narrow: the list keeps priority (down to 3 rows); the preview takes the rest.
    const listRows = wide
      ? content
      : Math.min(listNeed, Math.max(3, content - 1 - MIN_NARROW_PREVIEW));
    const previewBody = wide
      ? content - 1
      : Math.max(1, content - 1 - listRows);
    layout = {
      inner,
      wide,
      left,
      right,
      promptRows,
      content,
      listRows,
      previewBody,
    };
    this.layouts.set(key, layout);
    return layout;
  }

  private previewHeight(): number {
    return this.layout(this.lastWidth).previewBody;
  }

  private promptLines(question: Question, width: number): string[] {
    return wrapTextWithAnsi(
      `${question.prompt}${question.required ? this.theme.fg('warning', ` (${this.labels.required})`) : ''}`,
      width,
    );
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    this.lastWidth = width;
    const layout = this.layout(width);
    const t = this.theme;
    const onReview = this.tab === this.reviewIndex;
    const answered = this.state.questions.filter(
      (q) => getAnswer(this.state, q.id).status === 'answered',
    ).length;
    const frame = renderFrame(
      t,
      {
        title: this.state.title ?? this.labels.askUser,
        head: [this.renderTabs(layout.inner)],
        sections: [
          {
            title: `${answered}/${this.state.questions.length} ${this.labels.answered}`,
            rows: [
              ...fixed(
                onReview
                  ? [t.bold(this.labels.reviewHeading)]
                  : this.question
                    ? this.promptLines(this.question, layout.inner)
                    : [],
                layout.promptRows,
              ),
              ...fixed(
                onReview
                  ? this.renderReview(layout)
                  : this.renderQuestion(layout),
                layout.content,
              ),
              this.noteRow(),
            ],
          },
          { title: '', rows: this.renderHints(layout.inner) },
        ],
      },
      width,
    );
    return frame.map((line) => truncateToWidth(line, width));
  }

  private noteRow(): string {
    const question = this.question;
    const note = question ? getAnswer(this.state, question.id).note : undefined;
    return note && !this.edit
      ? this.theme.fg(
          'muted',
          `✎ ${this.labels.note}: ${note.replace(/\s+/g, ' ')}`,
        )
      : '';
  }

  private renderTabs(width: number): string {
    const t = this.theme;
    const labels = this.state.questions.map((question, index) => {
      const answered = getAnswer(this.state, question.id).status === 'answered';
      const text = `${answered ? '✓' : '○'} ${question.header}`;
      return index === this.tab
        ? t.bold(t.fg('accent', `[${text}]`))
        : ` ${text} `;
    });
    if (this.reviewIndex !== undefined) {
      labels.push(
        this.tab === this.reviewIndex
          ? t.bold(t.fg('accent', `[${this.labels.review}]`))
          : ` ${this.labels.review} `,
      );
    }
    // Drop leading tabs until the active one fits.
    let first = 0;
    const span = (from: number) =>
      labels
        .slice(from, this.tab + 1)
        .reduce((sum, label) => sum + visibleWidth(label), 0);
    while (first < this.tab && span(first) > width - 2) first++;
    return (first > 0 ? '‹ ' : '') + labels.slice(first).join('');
  }

  private renderQuestion(layout: Layout): string[] {
    const question = this.question;
    if (!question) return [];
    const t = this.theme;
    if (this.edit) return this.renderEditor(layout);
    const answer = getAnswer(this.state, question.id);
    if (question.type === 'text') {
      return answer.customText
        ? wrapTextWithAnsi(
            `${t.fg('success', '✓')} ${answer.customText}`,
            layout.inner,
          )
        : [t.fg('muted', this.labels.noTextYet)];
    }
    const preview = this.focusPreview(question);
    if (layout.wide) {
      const list = this.renderList(question, layout.left, layout.listRows);
      const side = this.renderPreview(
        preview,
        layout.right,
        layout.previewBody,
      );
      return Array.from(
        { length: layout.content },
        (_, i) =>
          `${pad(list[i] ?? '', layout.left)} ${t.fg('borderMuted', '│')} ${side[i] ?? ''}`,
      );
    }
    const [header, ...body] = this.renderPreview(
      preview,
      layout.inner,
      layout.previewBody,
    );
    return [
      ...fixed(
        this.renderList(question, layout.inner, layout.listRows),
        layout.listRows,
      ),
      this.separator(header, layout.inner),
      ...body,
    ];
  }

  /** Rule carrying the preview header; splits the list from the preview below it. */
  private separator(label: string, width: number): string {
    const text = ` ${label} `;
    const rest = Math.max(0, width - 2 - visibleWidth(text));
    return this.theme.fg('borderMuted', `──${text}${'─'.repeat(rest)}`);
  }

  private renderEditor(layout: Layout): string[] {
    const edit = this.edit;
    if (!edit) return [];
    const { target } = edit;
    const question = this.state.questions.find((q) => q.id === target.id);
    let label: string;
    if (target.kind === 'custom') {
      label =
        question?.type === 'text'
          ? this.labels.yourAnswer
          : this.labels.typeSomething;
    } else if (target.kind === 'note') {
      label = this.labels.noteForQuestion;
    } else {
      const option = question?.options?.find((o) => o.value === target.value);
      label = `${this.labels.noteFor} “${option?.label ?? target.value}”`;
    }
    // A long draft keeps its last rows visible inside the reserved area.
    return [
      this.theme.fg('accent', label),
      ...edit.editor.render(layout.inner).slice(-(layout.content - 1)),
    ];
  }

  private renderList(
    question: Question,
    width: number,
    size: number,
  ): string[] {
    const t = this.theme;
    const answer = getAnswer(this.state, question.id);
    const options = question.options ?? [];
    const total = rowCount(question);
    const windowRows = total > size ? size - 1 : size;
    const cursor = this.cursors[this.tab];
    const start = windowStart(total, cursor, windowRows, this.starts[this.tab]);
    this.starts[this.tab] = start;
    const end = Math.min(start + windowRows, total);
    const multi = question.type === 'multi';
    const lines: string[] = [];
    for (let i = start; i < end; i++) {
      const focused = i === cursor;
      const option = options[i];
      const checked = option
        ? answer.values.includes(option.value)
        : Boolean(answer.customText);
      const mark = multi ? (checked ? '☑' : '☐') : checked ? '◉' : '○';
      const number = i < 9 ? `${i + 1}.` : '  ';
      let label = option ? option.label : this.labels.typeSomething;
      if (option?.recommended) {
        label += t.fg('success', ` ★ ${this.labels.recommended}`);
      }
      if (option && getOwn(answer.optionNotes, option.value)) {
        label += t.fg('muted', ' ✎');
      }
      if (!option && answer.customText) {
        label += t.fg('muted', `: ${answer.customText.replace(/\s+/g, ' ')}`);
      }
      const text = `${focused ? '›' : ' '} ${number} ${mark} ${label}`;
      lines.push(focused ? t.fg('accent', text) : text);
    }
    if (total > windowRows) {
      const up = start > 0 ? '↑' : ' ';
      const down = end < total ? '↓' : ' ';
      lines.push(t.fg('muted', `  ${up} ${cursor + 1}/${total} ${down}`));
    }
    return lines.map((line) => truncateToWidth(line, width));
  }

  private previewSource(option: QuestionOption): string {
    return (
      option.preview ?? option.description ?? `*${this.labels.noDescription}*`
    );
  }

  private focusPreview(question: Question): string {
    const answer = getAnswer(this.state, question.id);
    const option = question.options?.[this.cursors[this.tab]];
    if (!option) return answer.customText ?? this.labels.typeOwn;
    const body = this.previewSource(option);
    const note = getOwn(answer.optionNotes, option.value);
    return note ? `${body}\n\n**${this.labels.note}:** ${note}` : body;
  }

  /** Header row followed by exactly `height` rows, scrolled internally. */
  private renderPreview(
    source: string,
    width: number,
    height: number,
  ): string[] {
    const all = this.markdown.render(source, width);
    this.previewScroll = Math.min(
      this.previewScroll,
      Math.max(0, all.length - height),
    );
    const visible = all.slice(this.previewScroll, this.previewScroll + height);
    const header = this.theme.fg(
      'muted',
      all.length > height
        ? `${this.labels.preview} ${this.previewScroll + 1}-${this.previewScroll + visible.length}/${all.length} (PgUp/PgDn)`
        : this.labels.preview,
    );
    return [header, ...fixed(visible, height)].map((line) =>
      truncateToWidth(line, width),
    );
  }

  private renderReview(layout: Layout): string[] {
    const t = this.theme;
    const rows = this.reviewRows();
    const size = Math.max(1, layout.content - 2);
    const start = windowStart(
      rows.length,
      this.reviewCursor,
      size,
      this.reviewStart,
    );
    this.reviewStart = start;
    const actions = {
      submit: this.labels.submit,
      back: this.labels.backToEdit,
      cancel: this.labels.cancel,
    };
    const lines: string[] = [];
    for (const [offset, row] of rows.slice(start, start + size).entries()) {
      const focused = start + offset === this.reviewCursor;
      const prefix = focused ? '›' : ' ';
      let text: string;
      if (row.kind === 'question') {
        const question = this.state.questions[row.index];
        const answer = getAnswer(this.state, question.id);
        let summary: string;
        if (answer.status === 'answered') {
          summary = [...answer.labels, answer.customText]
            .filter(Boolean)
            .join(', ')
            .replace(/\s+/g, ' ');
        } else if (question.required) {
          summary = t.fg(
            'warning',
            `⚠ ${this.labels.required} — ${this.labels.unanswered}`,
          );
        } else {
          summary = t.fg('muted', this.labels.skipped);
        }
        text = `${prefix} ${question.header}: ${summary}`;
      } else {
        text = `${prefix} ▸ ${actions[row.action]}`;
      }
      lines.push(focused ? t.fg('accent', text) : text);
    }
    const missing = this.state.questions.filter(
      (q) => q.required && getAnswer(this.state, q.id).status !== 'answered',
    ).length;
    return [
      ...fixed(lines, size),
      '',
      missing
        ? t.fg('warning', `${missing} ${this.labels.requiredPending}`)
        : '',
    ];
  }

  /** Key hints flowed onto exactly two rows without splitting a hint. */
  private renderHints(width: number): string[] {
    const l = this.labels;
    let items: string[];
    if (this.edit) {
      items = [
        `Enter ${l.save}`,
        `Shift+Enter ${l.newline}`,
        `Tab ${l.switchTab}`,
        `Esc ${l.keepDraft}`,
      ];
    } else if (this.tab === this.reviewIndex) {
      items = [
        `↑↓ ${l.move}`,
        `Enter ${l.select}`,
        `Tab/←→ ${l.switchTab}`,
        `Esc ${l.cancel.toLowerCase()}`,
      ];
    } else {
      items = [
        `↑↓ ${l.move}`,
        `1-9 ${l.pick}`,
        this.question?.type === 'multi'
          ? `Space ${l.toggle} · Enter ${l.next}`
          : `Enter ${l.select}`,
        `n ${l.optionNote}`,
        `N ${l.questionNote}`,
        `x ${l.clear}`,
        `PgUp/PgDn ${l.scrollPreview}`,
        `Tab/←→ ${l.switchTab}`,
        `Esc ${l.cancel.toLowerCase()}`,
      ];
    }
    const lines = ['', ''];
    let row = 0;
    for (const item of items) {
      const joined = lines[row] ? `${lines[row]} · ${item}` : item;
      if (row === 1 || !lines[row] || visibleWidth(joined) <= width) {
        lines[row] = joined;
      } else {
        row = 1;
        lines[row] = item;
      }
    }
    return lines.map((line) =>
      this.theme.fg('dim', truncateToWidth(line, width)),
    );
  }
}

/** Interactive Pi TUI questionnaire; plug into the custom-UI seam. */
export function createQuestionnaireUI(
  session: QuestionUISession,
): QuestionUIFactory {
  return (tui, theme, _keybindings: KeybindingsManager, done) =>
    new QuestionnaireComponent(session, tui, theme, done);
}
