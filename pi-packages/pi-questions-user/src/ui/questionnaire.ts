import type {
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { getSelectListTheme } from '@earendil-works/pi-coding-agent';
import {
  type Component,
  CURSOR_MARKER,
  Editor,
  isKeyRelease,
  isKeyRepeat,
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
import {
  LABEL_KEYS,
  type Labels,
  type QuestionOption,
  resolveLabels,
} from '../schema.js';
import { pad, renderFrame } from './frame.js';
import { adaptiveHeight, isWide, splitColumns, windowStart } from './layout.js';
import { MarkdownCache } from './markdown-cache.js';

type EditTarget =
  | { kind: 'custom'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'optionNote'; id: string; value: string };

type ReviewRow =
  | { kind: 'question'; index: number }
  | { kind: 'action'; action: 'submit' | 'back' | 'cancel' };

const MIN_PREVIEW_BODY_ROWS = 2;
const MAX_PROMPT_ROWS = 3;
const MAX_CONTEXT_ROWS = 6;
/** Label, native editor borders and cursor row, even before an editor opens. */
const EDITOR_ROWS = 4;
const REVIEW_ACTIONS = ['submit', 'back', 'cancel'] as const;

/** Cached questionnaire-wide height; active sections divide its available rows. */
interface Geometry {
  inner: number;
  wide: boolean;
  left: number;
  right: number;
  available: number;
}

interface Layout extends Geometry {
  promptRows: number;
  content: number;
  contextRows: number;
  contextOverflow: boolean;
  listRows: number;
  previewBody: number;
}

/** User text in fixed-row chrome must be flattened before measuring or clipping. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** Exactly `rows` lines: clipped, or padded with blanks. */
function fixed(lines: string[], rows: number): string[] {
  return Array.from({ length: rows }, (_, i) => lines[i] ?? '');
}

/** Free-text row index for questions that accept typed answers; absent for confirm. */
function hasFreeText(question: Question): boolean {
  return question.type !== 'confirm' && question.allowCustom !== false;
}

function rowCount(question: Question): number {
  return (question.options?.length ?? 0) + (hasFreeText(question) ? 1 : 0);
}

function listHeight(items: string[][]): number {
  return items.reduce((sum, item) => sum + item.length, 0);
}

/** Window whole items; the overflow counter yields to the selected label. */
function listWindow(
  items: string[][],
  cursor: number,
  size: number,
  previous: number,
) {
  const overflow = listHeight(items) > size;
  const counter = overflow && (items[cursor]?.length ?? 1) < size;
  const body = Math.max(1, size - (counter ? 1 : 0));
  let start = overflow ? Math.min(previous, cursor) : 0;
  let selectedRows = listHeight(items.slice(start, cursor + 1));
  while (start < cursor && selectedRows > body) {
    selectedRows -= items[start].length;
    start++;
  }
  let end = start;
  let used = 0;
  while (end < items.length) {
    if (used + items[end].length > body && end > start) break;
    used += items[end].length;
    end++;
  }
  return {
    start,
    end,
    counter,
    body,
    rows: Math.min(used, body) + (counter ? 1 : 0),
  };
}

export class QuestionnaireComponent implements Component {
  private state: AnswerState;
  private tab = 0;
  private readonly cursors: number[];
  private readonly starts: number[];
  private reviewCursor = 0;
  private reviewStart = 0;
  private previewScroll = 0;
  private previewExpanded = false;
  private contextScroll = 0;
  private edit?: { target: EditTarget; editor: Editor };
  private finished = false;
  private collapsed = false;
  private readonly onAbort = () => this.finish(true, 'aborted');
  private readonly markdown = new MarkdownCache();
  private readonly layouts = new Map<string, Geometry>();
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
    // UI phrases are single-line chrome; leave the session's raw overrides intact.
    for (const key of LABEL_KEYS)
      this.labels[key] = singleLine(this.labels[key]);
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

  private get chromeRows(): number {
    // Title, note, footer divider, hint and bottom; multi adds tabs + progress.
    return 5 + (this.reviewIndex === undefined ? 0 : 2);
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
    this.contextScroll = 0;
    this.enterTab();
  }

  /** Unanswered text questions open straight into the editor. */
  private enterTab(): void {
    const question = this.question;
    if (
      question?.type === 'text' &&
      hasFreeText(question) &&
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
    if (matchesKey(data, 'ctrl+]')) {
      if (isKeyRelease(data) || isKeyRepeat(data)) return;
      this.collapsed = !this.collapsed;
      this.session.onCollapseChange?.(this.collapsed);
      this.tui.requestRender();
      return;
    }
    if (this.collapsed) return;
    if (matchesKey(data, 'alt+up') || matchesKey(data, 'alt+down')) {
      if (this.scrollContext(matchesKey(data, 'alt+up') ? -1 : 1)) return;
    }
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
    if (data === 'p' && !isWide(this.lastWidth)) {
      this.previewExpanded = !this.previewExpanded;
      this.previewScroll = 0;
      this.tui.requestRender();
      return;
    }
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
    // Fullscreen hosts consume PgUp/PgDn/Home/End/Ctrl+arrows and the wheel
    // before the component; Shift+arrows and brackets always reach it.
    if (matchesKey(data, 'shift+up')) {
      this.scrollPreview(-1, 1);
      return;
    }
    if (matchesKey(data, 'shift+down')) {
      this.scrollPreview(1, 1);
      return;
    }
    if (matchesKey(data, 'pageUp') || data === '[') {
      this.scrollPreview(-1);
      return;
    }
    if (matchesKey(data, 'pageDown') || data === ']') {
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

  private scrollPreview(direction: number, step?: number): void {
    if (!isWide(this.lastWidth) && !this.previewExpanded) return;
    this.previewScroll = Math.max(
      0,
      this.previewScroll +
        direction * (step ?? Math.max(1, this.previewHeight() >> 1)),
    );
  }

  private scrollContext(direction: number): boolean {
    const question = this.question;
    if (!question) return false;
    const layout = this.currentLayout(this.lastWidth);
    const total = this.contextLines(question, layout.inner).length;
    if (total <= layout.contextRows) return false;
    const body = Math.max(1, layout.contextRows - 1);
    this.contextScroll = Math.min(
      Math.max(0, this.contextScroll + direction),
      Math.max(0, total - body),
    );
    this.tui.requestRender();
    return true;
  }

  // --- rendering -----------------------------------------------------------

  invalidate(): void {
    this.markdown.clear();
    this.layouts.clear();
    this.edit?.editor.invalidate();
  }

  /**
   * Static geometry for a width/terminal height. It depends only on the
   * questionnaire content and explicit preview expansion, never on cursor, tab
   * or answers, so the component keeps one height while the user navigates.
   */
  private layout(width: number): Geometry {
    const rows = this.tui.terminal.rows;
    const key = `${width}x${rows}x${this.previewExpanded}`;
    let layout = this.layouts.get(key);
    if (layout) return layout;
    const inner = Math.max(1, width - 4);
    const wide = isWide(width);
    const { left, right } = splitColumns(inner);
    const questions = this.state.questions;
    const promptNeed = Math.max(
      1,
      ...questions.map((q) =>
        Math.min(MAX_PROMPT_ROWS, this.promptLines(q, inner).length),
      ),
    );
    const contextNeed = Math.max(
      0,
      ...questions.map((q) =>
        Math.min(MAX_CONTEXT_ROWS, this.contextLines(q, inner).length),
      ),
    );
    const interactive = questions.filter((q) => q.type !== 'text');
    const lists = interactive.map((q) =>
      this.listLabels(q, wide ? left : inner),
    );
    const listNeed = Math.max(0, ...lists.map(listHeight));
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
    const review =
      this.reviewIndex === undefined ? 0 : questions.length + 3 + 2;
    const compactPreview = interactive.some((q) =>
      q.options?.some(
        (option) => option.preview?.trim() || option.description?.trim(),
      ),
    )
      ? 1
      : 0;
    const contentNeed = Math.max(
      EDITOR_ROWS,
      review,
      wide
        ? Math.max(listNeed, previewNeed + 1)
        : listNeed + (this.previewExpanded ? 1 + previewNeed : compactPreview),
    );
    const height = adaptiveHeight(
      rows,
      this.chromeRows + contextNeed + promptNeed + contentNeed,
    );
    layout = {
      inner,
      wide,
      left,
      right,
      available: height - this.chromeRows,
    };
    this.layouts.set(key, layout);
    return layout;
  }

  /** Pin the prompt, fit options first, then give context its bounded viewport. */
  private currentLayout(width: number): Layout {
    const reserved = this.layout(width);
    const question = this.question;
    const promptNeed = question
      ? this.promptLines(question, reserved.inner).length
      : 1;
    const contextNeed = question
      ? this.contextLines(question, reserved.inner).length
      : 0;
    const items =
      question && question.type !== 'text'
        ? this.listLabels(
            question,
            reserved.wide ? reserved.left : reserved.inner,
            true,
          )
        : [];
    const cursor = this.cursors[this.tab] ?? 0;
    const listNeed = listHeight(items);
    const selectedMinimum = Math.min(
      listNeed,
      (items[cursor]?.length ?? 1) + 1,
    );
    const showPreview = reserved.wide || this.previewExpanded;
    const previewHeader =
      showPreview || (question && this.hasFocusedPreview(question)) ? 1 : 0;
    const previewMinimum =
      showPreview && question && question.type !== 'text'
        ? Math.min(
            MIN_PREVIEW_BODY_ROWS,
            this.markdown.render(
              this.focusPreview(question),
              reserved.wide ? reserved.right : reserved.inner,
            ).length,
          )
        : 0;
    // On extremely small terminals, the editor borders/cursor and selected label
    // still take priority over a complete prompt or the context's usual floor.
    const promptRows = Math.min(
      MAX_PROMPT_ROWS,
      promptNeed,
      Math.max(
        0,
        reserved.available - (this.edit ? 3 : 1) - (contextNeed ? 1 : 0),
      ),
    );
    const remaining = Math.max(0, reserved.available - promptRows);
    const minimumContent = this.edit ? 3 : Math.max(1, selectedMinimum);
    const contextMinimum = Math.min(contextNeed, 3) + (contextNeed > 3 ? 1 : 0);
    const contextCounter =
      contextNeed && remaining > (this.edit ? 3 : 1) ? 1 : 0;
    // After the pinned prompt, the full context floor needs one label row (or
    // three native editor rows) beside it. Only below that capacity may it yield
    // to the selected label; otherwise oversized labels clip, not the context.
    const contextFloor =
      remaining >= contextMinimum + (this.edit ? 3 : 1)
        ? contextMinimum
        : Math.min(
            contextMinimum,
            Math.max(contextCounter, remaining - minimumContent),
          );
    let contentNeed = EDITOR_ROWS;
    if (!question) contentNeed = this.reviewRows().length + 2;
    else if (!this.edit && question.type !== 'text') {
      contentNeed = reserved.wide
        ? Math.max(listNeed, previewMinimum + 1)
        : listNeed + previewHeader + previewMinimum;
    }
    const contextRows = Math.min(
      contextNeed,
      MAX_CONTEXT_ROWS,
      Math.max(contextFloor, remaining - contentNeed),
    );
    const content = remaining - contextRows;
    const listRows = reserved.wide
      ? content
      : listWindow(
          items,
          cursor,
          Math.min(
            content,
            Math.max(selectedMinimum, content - previewHeader - previewMinimum),
          ),
          this.starts[this.tab] ?? 0,
        ).rows;
    const previewBody = reserved.wide
      ? Math.max(0, content - 1)
      : showPreview
        ? Math.max(0, content - 1 - listRows)
        : 0;
    return {
      ...reserved,
      promptRows,
      contextRows,
      contextOverflow: contextNeed > contextRows,
      content,
      listRows,
      previewBody,
    };
  }

  private previewHeight(): number {
    return this.currentLayout(this.lastWidth).previewBody;
  }

  /** The question stays directly above the options, independent of context scroll. */
  private promptLines(question: Question, width: number): string[] {
    return wrapTextWithAnsi(
      `${question.prompt}${question.required ? this.theme.fg('warning', ` (${this.labels.required})`) : ''}`,
      width,
    );
  }

  private contextLines(question: Question, width: number): string[] {
    return question.context?.trim()
      ? this.markdown.render(question.context, width)
      : [];
  }

  render(width: number): string[] {
    if (width <= 0 || this.tui.terminal.rows <= 0) return [];
    this.lastWidth = width;
    const title = singleLine(this.state.title ?? this.labels.askUser);
    if (this.collapsed) {
      return [
        this.theme.fg(
          'dim',
          truncateToWidth(` ${title} · Ctrl+] ${this.labels.expand}`, width),
        ),
      ];
    }
    const layout = this.currentLayout(width);
    const t = this.theme;
    const onReview = this.tab === this.reviewIndex;
    const answered = this.state.questions.filter(
      (q) => getAnswer(this.state, q.id).status === 'answered',
    ).length;
    const body = [
      ...this.renderContext(layout),
      ...this.renderPrompt(layout),
      ...fixed(
        onReview ? this.renderReview(layout) : this.renderQuestion(layout),
        layout.content,
      ),
      this.noteRow(),
    ];
    const multi = this.reviewIndex !== undefined;
    const frame = renderFrame(
      t,
      {
        title,
        head: multi ? [this.renderTabs(layout.inner)] : body,
        sections: [
          ...(multi
            ? [
                {
                  title: `${answered}/${this.state.questions.length} ${this.labels.answered}`,
                  rows: body,
                },
              ]
            : []),
          { title: '', rows: this.renderHints(layout) },
        ],
      },
      width,
    );
    return frame
      .slice(0, this.tui.terminal.rows)
      .map((line) => truncateToWidth(line, width));
  }

  private renderPrompt(layout: Layout): string[] {
    const lines = this.question
      ? this.promptLines(this.question, layout.inner)
      : [this.theme.bold(this.labels.reviewHeading)];
    const visible = lines.slice(0, layout.promptRows);
    if (lines.length > layout.promptRows && visible.length) {
      visible[visible.length - 1] =
        `${truncateToWidth(visible[visible.length - 1], Math.max(0, layout.inner - 1), '')}…`;
    }
    return fixed(visible, layout.promptRows);
  }

  private renderContext(layout: Layout): string[] {
    const lines = this.question
      ? this.contextLines(this.question, layout.inner)
      : [];
    if (!layout.contextRows) return [];
    if (!layout.contextOverflow) return lines;
    const body = Math.max(0, layout.contextRows - 1);
    this.contextScroll = Math.min(
      this.contextScroll,
      Math.max(0, lines.length - Math.max(1, body)),
    );
    const visible = lines.slice(this.contextScroll, this.contextScroll + body);
    const below = lines.length - this.contextScroll - visible.length;
    const indicators = [
      this.contextScroll > 0
        ? `↑ ${this.contextScroll} ${this.labels.more}`
        : '',
      below > 0 ? `↓ ${below} ${this.labels.more}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return [...visible, this.theme.fg('muted', indicators)];
  }

  private noteRow(): string {
    const question = this.question;
    const note = question ? getAnswer(this.state, question.id).note : undefined;
    return note && !this.edit
      ? this.theme.fg('muted', `✎ ${this.labels.note}: ${singleLine(note)}`)
      : '';
  }

  private renderTabs(width: number): string {
    const t = this.theme;
    const labels = this.state.questions.map((question, index) => {
      const answered = getAnswer(this.state, question.id).status === 'answered';
      const text = `${answered ? '✓' : '○'} ${singleLine(question.header)}`;
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
        this.previewTitle(question),
      );
      return Array.from(
        { length: layout.content },
        (_, i) =>
          `${pad(list[i] ?? '', layout.left)} ${t.fg('borderMuted', '│')} ${side[i] ?? ''}`,
      );
    }
    if (!this.previewExpanded) {
      const list = this.renderList(question, layout.inner, layout.listRows);
      if (
        this.hasFocusedPreview(question) &&
        layout.listRows < layout.content
      ) {
        list.push(t.fg('muted', `▸ ${this.labels.preview} · p`));
      }
      return list;
    }
    if (layout.listRows === layout.content) {
      return this.renderList(question, layout.inner, layout.listRows);
    }
    const [header, ...body] = this.renderPreview(
      preview,
      layout.inner,
      layout.previewBody,
      this.previewTitle(question),
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
    const lines = edit.editor.render(layout.inner);
    // In tiny terminals the label yields to the native borders and cursor row.
    const heading =
      layout.content > Math.min(3, lines.length)
        ? [
            this.theme.fg(
              'accent',
              truncateToWidth(singleLine(label), layout.inner),
            ),
          ]
        : [];
    const rows = layout.content - heading.length;
    if (lines.length <= rows) return [...heading, ...lines];
    const body = lines.slice(1, -1);
    const size = Math.max(1, rows - 2);
    const cursor = Math.max(
      0,
      body.findIndex((line) => line.includes(CURSOR_MARKER)),
    );
    const start = windowStart(
      body.length,
      cursor,
      size,
      Math.max(0, cursor - Math.floor(size / 2)),
    );
    return [
      ...heading,
      lines[0],
      ...body.slice(start, start + size),
      lines[lines.length - 1],
    ];
  }

  /** Prefix includes an aligned star gutter only when this question needs it. */
  private listIndent(question: Question): number {
    return question.options?.some((option) => option.recommended) ? 9 : 7;
  }

  private listLabels(
    question: Question,
    width: number,
    withDrafts = false,
  ): string[][] {
    const answer = withDrafts ? getAnswer(this.state, question.id) : undefined;
    const labelWidth = Math.max(1, width - this.listIndent(question));
    return Array.from({ length: rowCount(question) }, (_, i) => {
      const option = question.options?.[i];
      let label = option?.label ?? this.labels.typeSomething;
      if (option && getOwn(answer?.optionNotes, option.value)) {
        label += this.theme.fg('muted', ' ✎');
      }
      if (!option && answer?.customText) {
        label += this.theme.fg('muted', `: ${singleLine(answer.customText)}`);
      }
      return wrapTextWithAnsi(label, labelWidth);
    });
  }

  private renderList(
    question: Question,
    width: number,
    size: number,
  ): string[] {
    const t = this.theme;
    const answer = getAnswer(this.state, question.id);
    const items = this.listLabels(question, width, true);
    const total = items.length;
    const cursor = this.cursors[this.tab];
    const { start, end, counter, body } = listWindow(
      items,
      cursor,
      size,
      this.starts[this.tab],
    );
    this.starts[this.tab] = start;
    const multi = question.type === 'multi';
    const indent = this.listIndent(question);
    const lines: string[] = [];
    for (let i = start; i < end; i++) {
      const item = items[i];
      const focused = i === cursor;
      const option = question.options?.[i];
      const checked = option
        ? answer.values.includes(option.value)
        : Boolean(answer.customText);
      const mark = multi ? (checked ? '☑' : '☐') : checked ? '◉' : '○';
      const number = i < 9 ? `${i + 1}.` : '  ';
      const star =
        indent === 9
          ? `${option?.recommended ? t.fg('success', '★') : ' '} `
          : '';
      const prefix = `${focused ? '›' : ' '} ${number} ${mark} `;
      const color = (text: string) => (focused ? t.fg('accent', text) : text);
      for (const [row, label] of item.entries()) {
        // Color the label after the star so its reset cannot clear selection.
        const leading =
          row === 0 ? `${color(prefix)}${star}` : ' '.repeat(indent);
        lines.push(`${leading}${color(label)}`);
      }
    }
    if (lines.length > body) {
      lines.splice(body);
      lines[body - 1] = t.fg(
        'accent',
        `${truncateToWidth(lines[body - 1], width - 1, '')}…`,
      );
    }
    if (counter) {
      const up = start > 0 ? '↑' : ' ';
      const down = end < total ? '↓' : ' ';
      lines.push(t.fg('muted', `  ${up} ${cursor + 1}/${total} ${down}`));
    }
    return lines.map((line) => truncateToWidth(line, width));
  }

  private previewTitle(question: Question): string {
    const option = question.options?.[this.cursors[this.tab]];
    const recommended = this.labels.recommended;
    return option?.recommended
      ? `${this.labels.preview} · ${this.theme.fg('success', `★ ${recommended.charAt(0).toUpperCase()}${recommended.slice(1)}`)}`
      : this.labels.preview;
  }

  private previewSource(option: QuestionOption): string {
    return (
      option.preview ?? option.description ?? `*${this.labels.noDescription}*`
    );
  }

  private hasFocusedPreview(question: Question): boolean {
    const option = question.options?.[this.cursors[this.tab]];
    return Boolean(
      option &&
        (option.preview?.trim() ||
          option.description?.trim() ||
          getOwn(
            getAnswer(this.state, question.id).optionNotes,
            option.value,
          )?.trim()),
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
    title: string,
  ): string[] {
    const all = this.markdown.render(source, width);
    this.previewScroll = Math.min(
      this.previewScroll,
      Math.max(0, all.length - height),
    );
    const visible = all.slice(this.previewScroll, this.previewScroll + height);
    const above = this.previewScroll;
    const below = all.length - above - visible.length;
    const header = this.theme.fg(
      'muted',
      all.length > height
        ? `${title} ${above + 1}-${above + visible.length}/${all.length}${above > 0 ? ` · ↑ ${above} ${this.labels.more}` : ''}${below > 0 ? ` · ↓ ${below} ${this.labels.more}` : ''}`
        : title,
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
        text = `${prefix} ${singleLine(question.header)}: ${summary}`;
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

  /** One clipped row; action, navigation and cancellation survive narrow widths. */
  private renderHints(layout: Layout): string[] {
    const width = layout.inner;
    const l = this.labels;
    const contextHint = layout.contextOverflow
      ? [`Alt+↑↓ ${l.scrollContext}`]
      : [];
    let items: string[];
    if (this.edit) {
      items = [
        `Enter ${l.save}`,
        `Esc ${l.keepDraft}`,
        ...contextHint,
        `Ctrl+] ${l.collapse}`,
        `Shift+Enter ${l.newline}`,
        `Tab ${l.switchTab}`,
      ];
    } else if (this.tab === this.reviewIndex) {
      items = [
        `Enter ${l.select}`,
        `↑↓ ${l.move}`,
        `Esc ${l.cancel.toLowerCase()}`,
        `Tab/←→ ${l.switchTab}`,
        `Ctrl+] ${l.collapse}`,
        ...contextHint,
      ];
    } else {
      items = [
        this.question?.type === 'multi'
          ? `Enter ${l.next}`
          : `Enter ${l.select}`,
        `↑↓ ${l.move}`,
        `Esc ${l.cancel.toLowerCase()}`,
        `1-9 ${l.pick}`,
        ...(!layout.wide &&
        this.question &&
        (this.previewExpanded || this.hasFocusedPreview(this.question))
          ? [`p ${l.preview.toLowerCase()}`]
          : []),
        ...contextHint,
        `Ctrl+] ${l.collapse}`,
        ...(this.question?.type === 'multi' ? [`Space ${l.toggle}`] : []),
        `n/N ${l.note.toLowerCase()}`,
        `x ${l.clear}`,
        ...(layout.wide || this.previewExpanded
          ? [`⇧↑↓/[ ] ${l.scrollPreview}`]
          : []),
        `Tab/←→ ${l.switchTab}`,
      ];
    }
    return [this.theme.fg('dim', truncateToWidth(items.join(' · '), width))];
  }
}

/** Interactive Pi TUI questionnaire; plug into the custom-UI seam. */
export function createQuestionnaireUI(
  session: QuestionUISession,
): QuestionUIFactory {
  return (tui, theme, _keybindings: KeybindingsManager, done) =>
    new QuestionnaireComponent(session, tui, theme, done);
}
