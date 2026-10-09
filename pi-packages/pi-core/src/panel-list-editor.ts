import { PanelDiscardConfirmation } from './panel-discard.js';
import {
  normalizePanelKey,
  type PanelKey,
  panelMouseWheelDelta,
} from './panel-input.js';
import {
  type PanelRowInput,
  type PanelTheme,
  panelHintRow,
  panelViewport,
  renderPanelFrame,
} from './panel-primitives.js';
import { resolveIcon } from './render-kit.js';

export interface ListEditorContext {
  layout: 'wide' | 'compact';
  /** Content cells available to a row label, excluding selection/dirty markers. */
  width: number;
  index: number;
  selected: boolean;
  filter: string;
}

export interface ListEditorRow {
  /** Adapter-owned stable identity; domain data and persistence stay outside the shell. */
  id: string;
  label: string | ((context: ListEditorContext) => string);
  dirty?: boolean;
}

export interface ListEditorView {
  title: string | (() => string);
  rows(): readonly ListEditorRow[];
  hints?: string | (() => string);
  header?(context: ListEditorContext): readonly PanelRowInput[];
  footer?(context: ListEditorContext): readonly PanelRowInput[];
  maxVisibleRows?: number;
  navigation?: 'clamp' | 'wrap';
  filter?: {
    text?(row: ListEditorRow): string;
    matches?(row: ListEditorRow, query: string): boolean;
    placeholder?: string;
  };
  /** Runs after navigation/filter keys, before enter/back/save/cancel defaults. */
  onAction?(
    key: string,
    row: ListEditorRow | undefined,
    editor: ListEditor,
  ): boolean | undefined;
}

export interface ListEditorSaveResult {
  success: boolean;
  error?: string;
  /** E.g. a partial save's already-persisted rows. */
  warning?: string;
}

export interface ListEditorOptions {
  overview: ListEditorView;
  wideBreakpoint?: number;
  maxHeight?(): number;
  theme?: PanelTheme;
  matchesKey?: (data: string, key: PanelKey) => boolean;
  pendingCount?(): number;
  onSave():
    | ListEditorSaveResult
    | undefined
    | Promise<ListEditorSaveResult | undefined>;
  onSaved?(): void;
  onCancel(): void;
  requestRender?(): void;
}

export interface ListEditorState {
  view: 'overview' | 'picker' | 'discard';
  selectedIndex: number;
  filter: string;
  pendingCount: number;
  completed: boolean;
  saving: boolean;
  error?: string;
  warning?: string;
}

const value = (text: string | (() => string)): string =>
  typeof text === 'function' ? text() : text;

/** List selection and presentation only; adapters own drafts and persistence. */
export class ListEditor {
  private selected = 0;
  private overviewIndex = 0;
  private picker?: ListEditorView;
  private filter = '';
  private confirmation = new PanelDiscardConfirmation();
  private completed = false;
  private saving = false;
  private failedSave = false;
  private error?: string;
  private warning?: string;

  constructor(private options: ListEditorOptions) {}

  private pending(): number {
    return (
      this.options.pendingCount?.() ??
      this.options.overview.rows().filter((row) => row.dirty).length
    );
  }

  private view(): ListEditorView {
    return this.picker ?? this.options.overview;
  }

  private rows(): readonly ListEditorRow[] {
    const view = this.view();
    const rows = view.rows();
    const query = this.filter.trim().toLowerCase();
    const filter = view.filter;
    if (!filter || !query) return rows;
    return rows.filter((row) => {
      if (filter.matches) return filter.matches(row, query);
      const text =
        filter.text?.(row) ??
        (typeof row.label === 'string' ? row.label : row.id);
      return text.toLowerCase().includes(query);
    });
  }

  openPicker(view: ListEditorView, initialIndex = 0): void {
    if (!this.picker) this.overviewIndex = this.selected;
    this.picker = view;
    this.selected = initialIndex;
    this.filter = '';
    this.invalidate();
  }

  showOverview(): void {
    if (!this.picker) return;
    this.picker = undefined;
    this.selected = this.overviewIndex;
    this.filter = '';
    this.invalidate();
  }

  getState(): ListEditorState {
    return {
      view: this.confirmation.active
        ? 'discard'
        : this.picker
          ? 'picker'
          : 'overview',
      selectedIndex: this.selected,
      filter: this.filter,
      pendingCount: this.pending(),
      completed: this.completed,
      saving: this.saving,
      error: this.error,
      warning: this.warning,
    };
  }

  private move(delta: number, wrap = true): void {
    const length = this.rows().length;
    const next = this.selected + delta;
    this.selected =
      length && wrap && this.view().navigation === 'wrap'
        ? ((next % length) + length) % length
        : Math.max(0, Math.min(next, length - 1));
  }

  private updateFilter(next: string): void {
    this.filter = next;
    this.selected = 0;
  }

  private cancel(): void {
    this.completed = true;
    this.options.onCancel();
  }

  private save(): void {
    this.saving = true;
    this.error = undefined;
    this.warning = undefined;
    const apply = (result: ListEditorSaveResult | undefined) => {
      this.saving = false;
      this.failedSave = result?.success === false;
      if (this.failedSave) {
        this.error = result?.error ?? 'Saving changes failed.';
        this.warning = result?.warning;
      } else {
        this.completed = true;
        this.options.onSaved?.();
      }
      this.invalidate();
    };
    const fail = (error: unknown) =>
      apply({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    let result: ReturnType<ListEditorOptions['onSave']>;
    try {
      result = this.options.onSave();
    } catch (error) {
      fail(error);
      return;
    }
    if (result && 'then' in result) void result.then(apply, fail);
    else apply(result);
  }

  handleInput(data: string): void {
    if (this.completed || this.saving) return;
    const key = normalizePanelKey(data, this.options.matchesKey);
    if (this.confirmation.active) {
      if (this.confirmation.handleInput(key) === 'discard') this.cancel();
      this.invalidate();
      return;
    }
    const view = this.view();
    const wheel = panelMouseWheelDelta(data);
    const printable =
      data.length > 0 &&
      [...data].every((char) => char >= ' ' && char !== '\u007f');
    if (wheel) this.move(wheel, false);
    else if (key === 'up' || key === 'k') this.move(-1);
    else if (key === 'down' || key === 'j') this.move(1);
    else if (view.filter && key === 'backspace')
      this.updateFilter([...this.filter].slice(0, -1).join(''));
    else if (view.filter && key === 'ctrl+u') this.updateFilter('');
    else if (key === 'home' || (key === 'g' && !this.filter)) this.selected = 0;
    else if (key === 'end' || (key === 'G' && !this.filter))
      this.selected = Math.max(0, this.rows().length - 1);
    else if (view.filter && printable) this.updateFilter(this.filter + data);
    else if (view.onAction?.(key, this.rows()[this.selected], this) !== true) {
      if (this.picker && (key === 'enter' || key === 'escape' || key === 'q'))
        this.showOverview();
      else if (!this.picker && (key === 'escape' || key === 'q')) {
        if (
          this.confirmation.request(this.pending() > 0 || this.failedSave) ===
          'cancel'
        )
          this.cancel();
      } else if (!this.picker && key.toLowerCase() === 's') this.save();
    }
    this.options.requestRender?.();
  }

  render(width: number): string[] {
    const view = this.view();
    const rows = this.rows();
    if (this.confirmation.active)
      return renderPanelFrame({
        title: 'Discard unsaved draft?',
        rows: this.confirmation.rows(),
        width,
        maxHeight: this.options.maxHeight?.(),
        theme: this.options.theme,
      });
    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));
    const height = Math.max(
      1,
      Math.floor(this.options.maxHeight?.() ?? Infinity),
    );
    const budget = Math.max(0, height - 2);
    const context: ListEditorContext = {
      layout: width >= (this.options.wideBreakpoint ?? 84) ? 'wide' : 'compact',
      width: Math.max(0, width - 8),
      index: this.selected,
      selected: true,
      filter: this.filter,
    };
    const count = this.pending();
    const messages: PanelRowInput[] = [
      ...(this.saving ? [panelHintRow('Saving…')] : []),
      ...(this.error
        ? [{ text: `Save failed: ${this.error}`, tone: 'error' as const }]
        : []),
      ...(this.warning
        ? [{ text: this.warning, tone: 'warning' as const }]
        : []),
    ];
    const header: PanelRowInput[] = [
      ...(!this.picker
        ? [
            panelHintRow(
              `pending: ${count ? `${count} change${count === 1 ? '' : 's'}` : 'none'}`,
            ),
          ]
        : []),
      panelHintRow(
        value(
          view.hints ??
            (this.picker
              ? '↑/↓/j/k move · enter select · esc/q back'
              : '↑/↓/j/k move · enter edit · s save · esc/q cancel'),
        ),
      ),
      ...(view.filter
        ? [
            panelHintRow(
              `search: ${this.filter || view.filter.placeholder || '(type to filter)'}`,
            ),
          ]
        : []),
      ...(view.header?.(context) ?? []),
    ];
    // Leave at least one row for the cursor; hints take priority over metadata.
    const keptMessages = messages.slice(0, Math.max(0, budget - 1));
    const headerBudget = Math.max(0, budget - keptMessages.length - 1);
    const hintIndex = this.picker ? 0 : 1;
    const keptHeader =
      header.length <= headerBudget
        ? header
        : header.slice(hintIndex, hintIndex + headerBudget);
    const available = Math.max(
      0,
      budget - keptMessages.length - keptHeader.length,
    );
    const viewport = panelViewport(
      rows.length,
      this.selected,
      available,
      view.maxVisibleRows,
    );
    const choices: PanelRowInput[] = rows
      .slice(viewport.start, viewport.end)
      .map((row, offset) => {
        const index = viewport.start + offset;
        const selected = index === this.selected;
        const label =
          typeof row.label === 'function'
            ? row.label({ ...context, index, selected })
            : row.label;
        return {
          text: `${selected ? resolveIcon('selection', '›') : ' '} ${row.dirty ? '*' : ' '} ${label}`,
          selected,
        };
      });
    if (!rows.length && available > 0) {
      choices.push(
        panelHintRow(this.filter ? 'No matching rows' : 'No rows available'),
      );
    }
    const body: PanelRowInput[] = [
      ...keptHeader,
      ...keptMessages,
      ...choices,
      ...(viewport.notice ? [panelHintRow(viewport.notice)] : []),
    ];
    body.push(
      ...(view.footer?.(context) ?? []).slice(
        0,
        Math.max(0, budget - body.length),
      ),
    );
    return renderPanelFrame({
      title: value(view.title),
      rows: body,
      width,
      maxHeight: height,
      theme: this.options.theme,
    });
  }

  invalidate(): void {
    this.options.requestRender?.();
  }
}

export function createListEditor(options: ListEditorOptions): ListEditor {
  return new ListEditor(options);
}
