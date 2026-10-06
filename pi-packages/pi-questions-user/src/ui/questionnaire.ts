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
import { FREE_TEXT_LABEL } from '../schema.js';
import { isWide, listWindowSize, splitColumns, windowStart } from './layout.js';
import { MarkdownCache } from './markdown-cache.js';

type EditTarget =
  | { kind: 'custom'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'optionNote'; id: string; value: string };

type ReviewRow =
  | { kind: 'question'; index: number }
  | { kind: 'action'; action: 'submit' | 'back' | 'cancel' };

const NARROW_PREVIEW_ROWS = 8;
const REVIEW_ACTIONS = [
  ['submit', 'Submit answers'],
  ['back', 'Back to edit'],
  ['cancel', 'Cancel'],
] as const;

function pad(line: string, width: number): string {
  const clipped = truncateToWidth(line, width);
  return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)));
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

  constructor(
    private readonly session: QuestionUISession,
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: (result: QuestionResult | undefined) => void,
  ) {
    this.state = session.state;
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
        ([action]): ReviewRow => ({ kind: 'action', action }),
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
    this.edit?.editor.invalidate();
  }

  private previewHeight(): number {
    return listWindowSize(this.tui.terminal.rows);
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const lines: string[] = [];
    if (this.state.title) lines.push(this.theme.bold(this.state.title));
    lines.push(this.renderTabs(width), '');
    lines.push(
      ...(this.tab === this.reviewIndex
        ? this.renderReview()
        : this.renderQuestion(width)),
    );
    lines.push('', this.theme.fg('dim', this.hints()));
    return lines.map((line) => truncateToWidth(line, width));
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
          ? t.bold(t.fg('accent', '[Review]'))
          : ' Review ',
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

  private renderQuestion(width: number): string[] {
    const question = this.question;
    if (!question) return [];
    const t = this.theme;
    const lines = wrapTextWithAnsi(
      `${question.prompt}${question.required ? t.fg('warning', ' (required)') : ''}`,
      width,
    );
    lines.push('');
    if (question.type !== 'text') {
      const preview = this.focusPreview(question);
      if (isWide(width)) {
        const { left, right } = splitColumns(width);
        const list = this.renderList(question, left);
        const side = this.renderPreview(preview, right, this.previewHeight());
        const rows = Math.max(list.length, side.length);
        for (let i = 0; i < rows; i++) {
          lines.push(
            `${pad(list[i] ?? '', left)} ${t.fg('borderMuted', '│')} ${side[i] ?? ''}`,
          );
        }
      } else {
        lines.push(
          ...this.renderList(question, width),
          ...this.renderPreview(preview, width, NARROW_PREVIEW_ROWS),
        );
      }
    }
    const answer = getAnswer(this.state, question.id);
    if (answer.note && !this.edit) {
      lines.push('', t.fg('muted', `Note: ${answer.note}`));
    }
    if (this.edit) {
      lines.push(...this.renderEditor(width));
    } else if (question.type === 'text') {
      lines.push(
        answer.customText
          ? `${t.fg('success', '✓')} ${answer.customText}`
          : t.fg('muted', 'No text yet. Press Enter to write an answer.'),
      );
    }
    return lines;
  }

  private renderEditor(width: number): string[] {
    const edit = this.edit;
    if (!edit) return [];
    const { target } = edit;
    const question = this.state.questions.find((q) => q.id === target.id);
    let label: string;
    if (target.kind === 'custom') {
      label = question?.type === 'text' ? 'Your answer' : FREE_TEXT_LABEL;
    } else if (target.kind === 'note') {
      label = 'Note for this question';
    } else {
      const option = question?.options?.find((o) => o.value === target.value);
      label = `Note for “${option?.label ?? target.value}”`;
    }
    return [
      '',
      this.theme.fg('accent', label),
      ...edit.editor.render(width),
      this.theme.fg(
        'dim',
        'Enter save · Shift+Enter newline · Esc keep draft and return',
      ),
    ];
  }

  private renderList(question: Question, width: number): string[] {
    const t = this.theme;
    const answer = getAnswer(this.state, question.id);
    const options = question.options ?? [];
    const total = rowCount(question);
    const size = listWindowSize(this.tui.terminal.rows);
    const cursor = this.cursors[this.tab];
    const start = windowStart(total, cursor, size, this.starts[this.tab]);
    this.starts[this.tab] = start;
    const end = Math.min(start + size, total);
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
      let label = option ? option.label : FREE_TEXT_LABEL;
      if (option?.recommended) label += t.fg('success', ' ★ recommended');
      if (option && getOwn(answer.optionNotes, option.value)) {
        label += t.fg('muted', ' ✎');
      }
      if (!option && answer.customText) {
        label += t.fg('muted', `: ${answer.customText.replace(/\s+/g, ' ')}`);
      }
      const text = `${focused ? '›' : ' '} ${number} ${mark} ${label}`;
      lines.push(focused ? t.fg('accent', text) : text);
    }
    if (total > size) {
      const up = start > 0 ? '↑' : ' ';
      const down = end < total ? '↓' : ' ';
      lines.push(t.fg('muted', `  ${up} ${cursor + 1}/${total} ${down}`));
    }
    return lines.map((line) => truncateToWidth(line, width));
  }

  private focusPreview(question: Question): string {
    const answer = getAnswer(this.state, question.id);
    const option = question.options?.[this.cursors[this.tab]];
    if (!option) {
      return answer.customText ?? 'Press Enter to type your own answer.';
    }
    const body = option.preview ?? option.description ?? '*No description.*';
    const note = getOwn(answer.optionNotes, option.value);
    return note ? `${body}\n\n**Note:** ${note}` : body;
  }

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
        ? `Preview ${this.previewScroll + 1}-${this.previewScroll + visible.length}/${all.length} (PgUp/PgDn)`
        : 'Preview',
    );
    return [header, ...visible].map((line) => truncateToWidth(line, width));
  }

  private renderReview(): string[] {
    const t = this.theme;
    const rows = this.reviewRows();
    const size = listWindowSize(this.tui.terminal.rows);
    const start = windowStart(
      rows.length,
      this.reviewCursor,
      size,
      this.reviewStart,
    );
    this.reviewStart = start;
    const lines = [t.bold('Review your answers'), ''];
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
          summary = t.fg('warning', '⚠ required — unanswered');
        } else {
          summary = t.fg('muted', 'skipped');
        }
        text = `${prefix} ${question.header}: ${summary}`;
      } else {
        const label = REVIEW_ACTIONS.find(([a]) => a === row.action)?.[1];
        text = `${prefix} ▸ ${label}`;
      }
      lines.push(focused ? t.fg('accent', text) : text);
    }
    const missing = this.state.questions.filter(
      (q) => q.required && getAnswer(this.state, q.id).status !== 'answered',
    ).length;
    if (missing) {
      lines.push(
        '',
        t.fg(
          'warning',
          `${missing} required question(s) unanswered; you may still submit.`,
        ),
      );
    }
    return lines;
  }

  private hints(): string {
    if (this.edit) return 'Tab switch question · Esc keep draft';
    if (this.tab === this.reviewIndex) {
      return '↑↓ move · Enter choose · Tab/←→ switch · Esc cancel';
    }
    const choose =
      this.question?.type === 'multi'
        ? 'Space toggle · Enter next'
        : 'Enter select';
    return `↑↓ move · 1-9 pick · ${choose} · n option note · N question note · x clear · PgUp/PgDn preview · Tab/←→ switch · Esc cancel`;
  }
}

/** Interactive Pi TUI questionnaire; plug into the custom-UI seam. */
export function createQuestionnaireUI(
  session: QuestionUISession,
): QuestionUIFactory {
  return (tui, theme, _keybindings: KeybindingsManager, done) =>
    new QuestionnaireComponent(session, tui, theme, done);
}
