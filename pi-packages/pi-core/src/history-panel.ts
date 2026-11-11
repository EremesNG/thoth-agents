import { truncateToWidth } from '@earendil-works/pi-tui';
import { createHistoryPanelKeyMatcher } from './history-panel-input.js';
import { createPanelFrame } from './panel-frame.js';
import {
  type PanelMouseEvent as HistoryPanelMouseEvent,
  panelMouseClick,
  panelMouseWheelDelta,
} from './panel-input.js';
import {
  type PanelTheme,
  padPanelText,
  panelFg,
  panelVisibleWidth,
  truncatePanelText,
} from './panel-primitives.js';
import {
  getRenderKit,
  type RenderKitTheme,
  resolveIcon,
} from './render-kit.js';
import { getToolDefinitionRegistryVersion } from './tool-registry.js';

export {
  createHistoryPanelKeyMatcher,
  type HistoryPanelMouseEvent,
  historyPanelMouseWheelDelta,
} from './history-panel-input.js';

export interface HistoryPanelMouseResult {
  handled: true;
  focus?: boolean;
  render?: boolean;
}

export interface HistoryPanelLine {
  text: string;
  /** Clicking this physical content row selects another item. */
  itemId?: string;
}

export interface HistoryPanelContext {
  index: number;
  count: number;
  selected: boolean;
  layout: 'wide' | 'narrow';
  width: number;
}

export interface HistoryPanelHint {
  key: string;
  label: string;
  group?: 'navigate' | 'views' | 'actions' | 'panel';
  eligible?: boolean;
  /** Help-only aliases may be omitted from the compact footer. */
  footer?: boolean;
  /** Higher priority survives footer compaction longer. Actions and help are retained last. */
  priority?: number;
}

export interface HistoryPanelHeader {
  /** Styled text after the wide header's selection counter. */
  badge?: string;
  /** @deprecated Hints belong in adapter.hints; ignored by the shell. */
  shortcuts?: string;
  /** Metadata rows; legacy panels reserve at least two unless variableRows is set. */
  wideRows?: readonly string[];
  /** Narrow metadata rows. */
  narrowRows?: readonly string[];
  variableRows?: boolean;
}

export interface HistoryPanelGroup {
  id: string;
  label: string;
  order: number;
}

type ListRow<T> =
  | { key: string; item: T; group?: undefined }
  | {
      key: string;
      group: HistoryPanelGroup;
      members: readonly T[];
      item?: undefined;
    };

export interface HistoryPanelView {
  id: string;
  label: string;
  /** Only live-log views follow output and report unseen rows. */
  followTail?: boolean;
}

export interface HistoryPanelNotice {
  text: string;
  role: 'success' | 'warning' | 'error';
}

export interface HistoryPanelAction<T> {
  key: string;
  label: string;
  eligible: boolean;
  confirm?(item: T): string;
  run(item: T): void | HistoryPanelNotice | Promise<void | HistoryPanelNotice>;
}

export interface HistoryPanelAdapter<T> {
  actions?(item: T): readonly HistoryPanelAction<T>[];
  views?(item: T): readonly HistoryPanelView[];
  defaultView?(item: T): string;
  renderView?(
    item: T,
    viewId: string,
    width: number,
  ): readonly (string | HistoryPanelLine)[];
  items(): readonly T[];
  id(item: T): string;
  groupOf?(item: T): HistoryPanelGroup;
  renderGroupOverview?(items: readonly T[]): readonly string[];
  matchesFilter?(item: T, query: string): boolean;
  /** Full label including any selection glyph; shell applies selected/dim tone. */
  renderItemLabel(item: T, context: HistoryPanelContext): string;
  /** Pre-rendered rows; newline/tab normalization and width clipping belong to the shell. */
  renderContent(item: T, width: number): readonly (string | HistoryPanelLine)[];
  renderHeader?(item: T, context: HistoryPanelContext): HistoryPanelHeader;
  hints?(
    item: T | undefined,
    state: HistoryPanelRenderState,
  ): readonly HistoryPanelHint[];
  /** Available content columns, excluding the frame rails and padding. */
  renderListSummary?(width: number): string;
  /** Runs after panel-close keys, before item actions and navigation. Return true to consume. */
  handleInput?(data: string, panel: HistoryPanel<T>): boolean;
  /** Eligibility is checked on both presses, never inferred from item status by the shell. */
  canClose?(item: T): boolean;
  /** Dispatch the item action; asynchronous outcome/error handling stays with the adapter. */
  close?(item: T): void;
  invalidate?(): void;
}

export interface HistoryPanelRenderState {
  itemCount: number;
  selectedIndex: number;
  selectedId?: string;
  scrollOffset: number;
  followTail: boolean;
  viewId?: string;
  configuredMaxLines?: number;
  renderWidth?: number;
  renderedLineCount?: number;
  bodyHeight?: number;
  maxVisibleWidth?: number;
  widthViolationCount?: number;
  clickableRowCount: number;
}

export interface HistoryPanelOptions {
  title: string;
  listLabel?: string;
  emptyText?: string;
  theme?: PanelTheme;
  onClose(): void;
  /** False keeps close callbacks reusable; the embedding owner must call dispose(). */
  disposeOnClose?: boolean;
  maxLines?: number | (() => number);
  initialSelectedId?: string;
  /** Start content at the top on open/selection instead of following log output. */
  contentScroll?: 'tail' | 'top';
  matchesKey?: (data: string, key: string) => boolean;
  visibleWidth?: (text: string) => number;
  truncateToWidth?: (text: string, width: number) => string;
  closeKey?: string;
  /** Injectable clock for transient action notices. */
  now?: () => number;
  noticeMs?: number;
  /** Set false only for adapters retaining an existing one-press action. */
  confirmClose?: boolean;
  closeConfirmationMs?: number;
  closeConfirmationHint?: string;
  /** If supplied, input and a 1-second periodic refresh request host rendering. */
  requestRender?: () => void;
  /** Zero disables the timer when the embedding overlay already owns refresh. */
  refreshMs?: number;
  /** Resolved at render time so render-kit changes are reflected immediately. */
  titleIcon?: () => string;
  /** @deprecated Use adapter.hints. */
  footerActions?: () => string;
}

const plainTheme: RenderKitTheme = { fg: (_role, text) => text };
const matchesRawKey = createHistoryPanelKeyMatcher();

/** Generic frame and physical-row viewport. Item rendering and hydration stay in the adapter. */
export class HistoryPanel<T> {
  private viewItemId?: string;
  private explicitView?: string;
  private activeView?: HistoryPanelView;
  private tabHits: Array<{
    row: number;
    start: number;
    end: number;
    id: string;
  }> = [];
  private viewScroll = new Map<
    string,
    { scroll: number; followTail: boolean; seenLineCount?: number }
  >();
  private selected = 0;
  private selectedKey?: string;
  private collapsed = new Set<string>();
  private filterQuery = '';
  private filterVisible = false;
  private filtering = false;
  private rowGroupMap = new Map<number, string>();
  private helpOpen = false;
  private helpScroll = 0;
  private scroll = 0;
  private sidebarScroll = 0;
  private followTail = true;
  private lastMaxScroll = 0;
  private seenLineCount?: number;
  private lastSelectedIndex = -1;
  private initialSelectedId?: string;
  private lastContentItemId?: string;
  private rowItemMap = new Map<number, string>();
  private contentRowItemMap = new Map<number, string>();
  private disposed = false;
  private lastIsSplit = true;
  private lastSidebarWidth = 26;
  private lastRenderWidth = 100;
  private lastListStartRow = -1;
  private lastListEndRow = -1;
  private closeArm?: { id: string; expiresAt: number };
  private pendingAction?: { id: string; key: string; prompt: string };
  private actionNotice?: HistoryPanelNotice & { expiresAt: number };
  private refreshTimer?: ReturnType<typeof setInterval>;
  private cachedRenderKit = getRenderKit();
  private cachedToolRegistryVersion = getToolDefinitionRegistryVersion();
  private lastRenderMetrics?: Pick<
    HistoryPanelRenderState,
    | 'configuredMaxLines'
    | 'renderWidth'
    | 'renderedLineCount'
    | 'bodyHeight'
    | 'maxVisibleWidth'
    | 'widthViolationCount'
  >;

  constructor(
    private adapter: HistoryPanelAdapter<T>,
    private options: HistoryPanelOptions,
  ) {
    this.initialSelectedId = options.initialSelectedId;
    this.resetContentScroll();
    const interval = options.refreshMs ?? 1000;
    if (options.requestRender && Number.isFinite(interval) && interval > 0) {
      this.refreshTimer = setInterval(
        () => options.requestRender?.(),
        interval,
      );
      this.refreshTimer.unref?.();
    }
  }

  invalidate(): void {
    this.adapter.invalidate?.();
    this.rowItemMap.clear();
    this.contentRowItemMap.clear();
    this.rowGroupMap.clear();
    this.closeArm = undefined;
  }

  private listRows(): ListRow<T>[] {
    const all = this.adapter.items();
    const items =
      this.filterVisible && this.adapter.matchesFilter
        ? all.filter((item) =>
            this.adapter.matchesFilter?.(item, this.filterQuery),
          )
        : all;
    let rows: ListRow<T>[];
    if (this.adapter.groupOf) {
      const groups = new Map<
        string,
        { group: HistoryPanelGroup; members: T[] }
      >();
      for (const item of items) {
        const group = this.adapter.groupOf(item);
        // A selected item may move into a previously collapsed group on refresh.
        if (`item:${this.adapter.id(item)}` === this.selectedKey)
          this.collapsed.delete(group.id);
        const bucket = groups.get(group.id) ?? { group, members: [] };
        bucket.members.push(item);
        groups.set(group.id, bucket);
      }
      rows = [...groups.values()]
        .sort((a, b) => a.group.order - b.group.order)
        .flatMap(({ group, members }): ListRow<T>[] => [
          { key: `group:${group.id}`, group, members },
          ...(this.collapsed.has(group.id)
            ? []
            : members.map((item) => ({
                key: `item:${this.adapter.id(item)}`,
                item,
              }))),
        ]);
    } else
      rows = items.map((item) => ({
        key: `item:${this.adapter.id(item)}`,
        item,
      }));
    if (this.initialSelectedId) {
      this.selectedKey = `item:${this.initialSelectedId}`;
      const index = rows.findIndex((row) => row.key === this.selectedKey);
      if (index >= 0) this.selected = index;
      this.initialSelectedId = undefined;
    }
    if (this.selectedKey === undefined) {
      this.selected = Math.max(
        0,
        rows.findIndex((row) => row.item !== undefined),
      );
    } else if (this.adapter.groupOf || this.adapter.matchesFilter) {
      const index = rows.findIndex((row) => row.key === this.selectedKey);
      if (index >= 0) this.selected = index;
    }
    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));
    this.selectedKey = rows[this.selected]?.key;
    return rows;
  }

  private moveSelection(delta: number): void {
    const rows = this.listRows();
    this.selected = Math.max(
      0,
      Math.min(rows.length - 1, this.selected + delta),
    );
    this.selectedKey = rows[this.selected]?.key;
    this.resetContentScroll();
  }

  private toggleGroup(id: string): void {
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
    this.closeArm = undefined;
    this.resetContentScroll();
  }

  private fg(role: Parameters<RenderKitTheme['fg']>[0], text: string): string {
    return panelFg(this.options.theme ?? plainTheme, role, text);
  }
  private measure(text: string): number {
    try {
      const measured = this.options.visibleWidth?.(text);
      if (measured !== undefined && Number.isFinite(measured) && measured >= 0)
        return measured;
    } catch {}
    return panelVisibleWidth(text);
  }
  private clip(text: string, width: number): string {
    if (width <= 0) return '';
    const normalized = text.replace(/\r?\n|\r/g, ' ').replace(/\t/g, '  ');
    if (this.measure(normalized) <= width) return normalized;
    const clipped =
      !getRenderKit()?.icon && this.options.truncateToWidth
        ? this.options.truncateToWidth(normalized, width)
        : truncatePanelText(normalized, width);
    return this.measure(clipped) <= width
      ? clipped
      : truncateToWidth(clipped, width, resolveIcon('ellipsis', '…'));
  }
  private pad(text: string, width: number): string {
    // Embedding helpers may measure non-ANSI styling or retain legacy clipping.
    if (!this.options.visibleWidth && !this.options.truncateToWidth)
      return padPanelText(text, width);
    const clipped = this.clip(text, width);
    return clipped + ' '.repeat(Math.max(0, width - this.measure(clipped)));
  }
  private context(
    width: number,
    split: boolean,
    count: number,
    index = this.selected,
  ): HistoryPanelContext {
    return {
      width,
      index,
      count,
      selected: index === this.selected,
      layout: split ? 'wide' : 'narrow',
    };
  }
  private keepSelectionVisible(count: number, height: number): void {
    if (this.selected !== this.lastSelectedIndex) {
      if (this.selected < this.sidebarScroll)
        this.sidebarScroll = this.selected;
      if (this.selected >= this.sidebarScroll + height)
        this.sidebarScroll = this.selected - height + 1;
      this.lastSelectedIndex = this.selected;
    }
    this.sidebarScroll = Math.max(
      0,
      Math.min(Math.max(0, count - height), this.sidebarScroll),
    );
  }
  private currentView(item: T): HistoryPanelView | undefined {
    const id = this.adapter.id(item);
    if (id !== this.viewItemId) {
      this.viewItemId = id;
      this.explicitView = undefined;
      this.activeView = undefined;
      this.viewScroll.clear();
    }
    const views = this.adapter.views?.(item) ?? [];
    const next =
      views.find(
        (view) =>
          view.id === (this.explicitView ?? this.adapter.defaultView?.(item)),
      ) ?? views[0];
    if (next?.id !== this.activeView?.id) {
      if (this.activeView)
        this.viewScroll.set(this.activeView.id, {
          scroll: this.scroll,
          followTail: this.followTail,
          seenLineCount: this.seenLineCount,
        });
      this.activeView = next;
      const saved = next && this.viewScroll.get(next.id);
      this.scroll = saved ? saved.scroll : 0;
      this.followTail = saved ? saved.followTail : next?.followTail === true;
      this.seenLineCount = saved ? saved.seenLineCount : undefined;
    }
    return next;
  }

  private selectView(id: string): void {
    const item = this.selectedItem();
    if (!item) return;
    this.currentView(item);
    this.explicitView = id;
    this.currentView(item);
  }

  private content(
    item: T,
    width: number,
    height: number,
  ): { rows: HistoryPanelLine[]; total: number } {
    const view = this.currentView(item);
    const rendered =
      view && this.adapter.renderView
        ? this.adapter.renderView(item, view.id, width)
        : this.adapter.renderContent(item, width);
    const rows = rendered.flatMap((line) => {
      const entry = typeof line === 'string' ? { text: line } : line;
      return entry.text.split(/\r?\n|\r/).map((text) => ({
        ...entry,
        text: this.clip(text, width),
      }));
    });
    if (this.followTail || this.seenLineCount === undefined)
      this.seenLineCount = rows.length;
    this.seenLineCount = Math.min(
      this.seenLineCount ?? rows.length,
      rows.length,
    );
    this.lastMaxScroll = Math.max(0, rows.length - height);
    this.scroll = this.followTail
      ? this.lastMaxScroll
      : Math.min(this.scroll, this.lastMaxScroll);
    return {
      rows: rows.slice(this.scroll, this.scroll + height),
      total: rows.length,
    };
  }
  private itemCell(
    items: readonly ListRow<T>[],
    index: number,
    width: number,
    split: boolean,
    row: number,
  ): string {
    const entry = items[index];
    if (!entry) return '';
    if (entry.group) {
      this.rowGroupMap.set(row, entry.group.id);
      const count = String(entry.members.length);
      const labelWidth = Math.max(0, width - this.measure(count) - 1);
      const disclosure = resolveIcon(
        this.collapsed.has(entry.group.id) ? 'arrowRight' : 'arrowDown',
      );
      const label = `${index === this.selected ? this.fg('warning', disclosure) : disclosure} ${entry.group.label}`;
      return `${this.fg('mdHeading', this.pad(label, labelWidth))} ${this.fg('dim', count)}`;
    }
    const item = entry.item;
    this.rowItemMap.set(row, this.adapter.id(item));
    const label = this.clip(
      this.adapter.renderItemLabel(
        item,
        this.context(width, split, items.length, index),
      ),
      width,
    );
    return this.fg(index === this.selected ? 'warning' : 'dim', label);
  }

  private matches(data: string, key: string): boolean {
    return (
      this.options.matchesKey?.(data, key) === true || matchesRawKey(data, key)
    );
  }

  handleInput(data: string): void {
    if (this.disposed) return;
    this.applyInput(data);
    if (!this.disposed) this.options.requestRender?.();
  }

  private applyInput(data: string): void {
    if (this.pendingAction) {
      const pending = this.pendingAction;
      if (this.matches(data, 'escape')) this.pendingAction = undefined;
      else if (this.matches(data, 'enter')) {
        this.pendingAction = undefined;
        const item = this.selectedItem();
        const action =
          item && this.adapter.id(item) === pending.id
            ? this.adapter
                .actions?.(item)
                .find((action) => action.key === pending.key && action.eligible)
            : undefined;
        if (item && action) this.runAction(item, action);
      }
      return;
    }
    if (this.filtering) {
      if (this.matches(data, 'escape')) {
        this.filtering = false;
        this.filterVisible = false;
        this.filterQuery = '';
      } else if (this.matches(data, 'enter')) this.filtering = false;
      else if (this.matches(data, 'backspace') || data === '' || data === '')
        this.filterQuery = [...this.filterQuery].slice(0, -1).join('');
      else if (this.matches(data, 'down')) this.moveSelection(1);
      else if (this.matches(data, 'up')) this.moveSelection(-1);
      else if (data && [...data].every((char) => char >= ' ' && char !== ''))
        this.filterQuery += data;
      this.closeArm = undefined;
      return;
    }
    if (!this.helpOpen && data === '/' && this.adapter.matchesFilter) {
      this.filterVisible = true;
      this.filtering = true;
      this.closeArm = undefined;
      return;
    }
    if (!this.helpOpen && this.filterVisible && this.matches(data, 'escape')) {
      this.filterVisible = false;
      this.filterQuery = '';
      return;
    }
    if (data === '?' || (this.helpOpen && this.matches(data, 'escape'))) {
      this.helpOpen = !this.helpOpen;
      this.helpScroll = 0;
      return;
    }
    if (this.helpOpen) {
      if (this.matches(data, 'down') || this.matches(data, 'pageDown'))
        this.helpScroll++;
      if (this.matches(data, 'up') || this.matches(data, 'pageUp'))
        this.helpScroll = Math.max(0, this.helpScroll - 1);
      return;
    }
    if (
      this.matches(data, 'escape') ||
      this.matches(data, 'ctrl+c') ||
      this.matches(data, 'q')
    ) {
      this.dismiss();
      return;
    }
    const selectedRow = this.listRows()[this.selected];
    if (selectedRow?.item !== undefined && /^[1-5]$/.test(data)) {
      const view = this.adapter.views?.(selectedRow.item)?.[Number(data) - 1];
      if (view) {
        this.selectView(view.id);
        return;
      }
    }
    if (selectedRow?.group && (this.matches(data, 'enter') || data === ' ')) {
      this.toggleGroup(selectedRow.group.id);
      return;
    }
    if (this.adapter.handleInput?.(data, this)) {
      this.closeArm = undefined;
      return;
    }
    const actionItem = this.selectedItem();
    const action =
      actionItem &&
      this.adapter
        .actions?.(actionItem)
        .find((action) => action.eligible && this.matches(data, action.key));
    if (actionItem && action) {
      this.startAction(actionItem, action);
      return;
    }
    if (this.matches(data, this.options.closeKey ?? 'x')) {
      this.closeSelectedItem();
      return;
    }
    this.closeArm = undefined;
    const wheel = panelMouseWheelDelta(data);
    if (wheel !== undefined) {
      this.scrollBy(wheel);
      return;
    }
    const click = panelMouseClick(data);
    if (click) {
      this.applyMouse(click);
      return;
    }
    if (this.matches(data, 'right') || this.matches(data, 'left')) {
      const delta = this.matches(data, 'right') ? 1 : -1;
      this.moveSelection(delta);
      return;
    }
    if (this.matches(data, 'down')) this.scrollBy(1);
    else if (this.matches(data, 'up')) this.scrollBy(-1);
    else if (this.matches(data, 'pageDown')) this.scrollBy(12);
    else if (this.matches(data, 'pageUp')) this.scrollBy(-12);
    else if (
      this.matches(data, 'home') ||
      (this.adapter.views && data === 'g')
    ) {
      this.scroll = 0;
      this.followTail = false;
    } else if (
      this.matches(data, 'end') ||
      (this.adapter.views && data === 'G')
    ) {
      this.scroll = Number.MAX_SAFE_INTEGER;
      this.followTail = true;
    }
  }

  private scrollBy(delta: number): void {
    this.scroll = Math.max(0, this.scroll + delta);
    this.followTail = delta < 0 ? false : this.scroll >= this.lastMaxScroll;
  }

  handleMouse(
    event: HistoryPanelMouseEvent,
  ): HistoryPanelMouseResult | undefined {
    if (this.disposed) return undefined;
    const result = this.applyMouse(event);
    if (!this.disposed && result && result.render !== false)
      this.options.requestRender?.();
    return result;
  }

  private applyMouse(
    event: HistoryPanelMouseEvent,
  ): HistoryPanelMouseResult | undefined {
    if (this.helpOpen || this.pendingAction)
      return { handled: true, render: false };
    this.closeArm = undefined;
    const col = event.col ?? event.x ?? 0;
    const row = event.row ?? event.y ?? 0;
    if (event.type === 'wheel') {
      const delta = Number(event.wheelDelta ?? 0);
      if (!Number.isFinite(delta) || delta === 0) return undefined;
      const sidebar = this.lastIsSplit
        ? col <= this.lastSidebarWidth + 2 && event.col !== undefined
        : this.lastListStartRow >= 0 &&
          row >= this.lastListStartRow &&
          row <= this.lastListEndRow;
      if (sidebar)
        this.sidebarScroll = Math.max(
          0,
          Math.min(this.listRows().length - 1, this.sidebarScroll + delta),
        );
      else this.scrollBy(delta);
      return { handled: true, render: true };
    }
    if (
      event.type !== 'click' &&
      (event.type || (event.button !== 'left' && event.button !== undefined))
    )
      return undefined;
    if (row === 0 && col >= Math.max(0, this.lastRenderWidth - 16)) {
      this.dismiss();
      return { handled: true, render: true };
    }
    const tab = this.tabHits.find(
      (hit) => hit.row === row && col >= hit.start && col < hit.end,
    );
    if (tab) {
      this.selectView(tab.id);
      return { handled: true, focus: true, render: true };
    }
    const groupId = this.rowGroupMap.get(row);
    const inList = this.lastIsSplit
      ? (event.col !== undefined || event.x !== undefined) &&
        col <= this.lastSidebarWidth + 2
      : row >= this.lastListStartRow && row <= this.lastListEndRow;
    if (groupId && inList) {
      const rows = this.listRows();
      this.selected = rows.findIndex((entry) => entry.group?.id === groupId);
      this.selectedKey = rows[this.selected]?.key;
      this.toggleGroup(groupId);
      return { handled: true, focus: true, render: true };
    }
    const id = (inList ? this.rowItemMap : this.contentRowItemMap).get(row);
    if (id) {
      const previous = this.selected;
      if (this.selectItem(id))
        return {
          handled: true,
          focus: true,
          render: previous !== this.selected,
        };
    }
    return { handled: true, focus: true };
  }

  private startAction(item: T, action: HistoryPanelAction<T>): void {
    try {
      const prompt = action.confirm?.(item);
      if (prompt)
        this.pendingAction = {
          id: this.adapter.id(item),
          key: action.key,
          prompt,
        };
      else this.runAction(item, action);
    } catch (error) {
      this.actionFailed(action.label, error);
    }
  }

  private showNotice(notice: unknown): void {
    // Command callbacks typed void can still return domain objects at runtime.
    if (
      this.disposed ||
      !notice ||
      typeof notice !== 'object' ||
      !('text' in notice) ||
      typeof notice.text !== 'string'
    )
      return;
    const role = 'role' in notice ? notice.role : undefined;
    this.actionNotice = {
      text: notice.text,
      role:
        role === 'success' || role === 'warning' || role === 'error'
          ? role
          : 'warning',
      expiresAt:
        (this.options.now ?? Date.now)() + (this.options.noticeMs ?? 3000),
    };
    this.options.requestRender?.();
  }

  private actionFailed(label: string, error: unknown): void {
    this.showNotice({
      text: `✗ ${label[0].toUpperCase() + label.slice(1)} failed: ${error instanceof Error ? error.message : String(error)}`,
      role: 'error',
    });
  }

  private runAction(item: T, action: HistoryPanelAction<T>): void {
    try {
      const outcome = action.run(item);
      if (outcome && typeof outcome === 'object' && 'then' in outcome) {
        void Promise.resolve(outcome).then(
          (notice) => {
            if (notice) this.showNotice(notice);
            if (!this.disposed) this.options.requestRender?.();
          },
          (error) => this.actionFailed(action.label, error),
        );
      } else if (outcome) this.showNotice(outcome);
    } catch (error) {
      this.actionFailed(action.label, error);
    }
  }

  /** May also be called by an extension-owned shortcut. */
  closeSelectedItem(): void {
    if (this.disposed || this.filtering) return;
    const item = this.selectedItem();
    if (this.pendingAction) return;
    const action =
      item &&
      this.adapter
        .actions?.(item)
        .find(
          (action) =>
            action.key === (this.options.closeKey ?? 'x') && action.eligible,
        );
    if (item && action) {
      this.startAction(item, action);
      this.options.requestRender?.();
      return;
    }
    if (
      !item ||
      !this.adapter.close ||
      this.adapter.canClose?.(item) === false
    ) {
      this.closeArm = undefined;
      return;
    }
    const id = this.adapter.id(item);
    if (
      this.options.confirmClose !== false &&
      (this.closeArm?.id !== id || this.closeArm.expiresAt < Date.now())
    ) {
      this.closeArm = {
        id,
        expiresAt: Date.now() + (this.options.closeConfirmationMs ?? 1500),
      };
      return;
    }
    this.closeArm = undefined;
    this.adapter.close(item);
  }

  private confirmationHint(): string | undefined {
    const item = this.selectedItem();
    if (
      !this.closeArm ||
      !item ||
      this.closeArm.id !== this.adapter.id(item) ||
      this.closeArm.expiresAt < Date.now() ||
      this.adapter.canClose?.(item) === false
    ) {
      this.closeArm = undefined;
      return undefined;
    }
    return (
      this.options.closeConfirmationHint ??
      `${this.options.closeKey ?? 'x'} again to close`
    );
  }

  selectItem(id: string): boolean {
    const item = this.adapter
      .items()
      .find((item) => this.adapter.id(item) === id);
    if (item === undefined) return false;
    if (this.adapter.groupOf)
      this.collapsed.delete(this.adapter.groupOf(item).id);
    const key = `item:${id}`;
    const rows = this.listRows();
    const index = rows.findIndex((row) => row.key === key);
    if (index < 0) return false;
    this.selected = index;
    this.selectedKey = key;
    this.closeArm = undefined;
    this.resetContentScroll();
    return true;
  }

  private resetContentScroll(): void {
    this.seenLineCount = undefined;
    this.scroll = 0;
    this.followTail = this.options.contentScroll !== 'top';
  }

  render(width: number): string[] {
    const kit = getRenderKit();
    const version = getToolDefinitionRegistryVersion();
    if (
      kit !== this.cachedRenderKit ||
      version !== this.cachedToolRegistryVersion
    ) {
      this.cachedRenderKit = kit;
      this.cachedToolRegistryVersion = version;
      this.invalidate();
    }
    const outputWidth = Number.isFinite(width)
      ? Math.max(0, Math.floor(width))
      : 40;
    const w = Math.max(40, outputWidth);
    const configured =
      typeof this.options.maxLines === 'function'
        ? this.options.maxLines()
        : (this.options.maxLines ?? 42);
    const maxLines = Math.max(
      12,
      Math.floor(Number.isFinite(configured) ? configured : 42),
    );
    const split = w >= 90;
    const sidebarWidth = split
      ? Math.max(18, Math.min(30, Math.floor(w * 0.25)))
      : 0;
    this.lastIsSplit = split;
    this.lastSidebarWidth = sidebarWidth;
    this.lastRenderWidth = outputWidth;
    this.lastListStartRow = -1;
    this.lastListEndRow = -1;
    const rightWidth = split
      ? Math.max(16, w - sidebarWidth - 7)
      : Math.max(16, w - 4);
    const items = this.listRows();
    this.rowItemMap.clear();
    this.contentRowItemMap.clear();
    this.rowGroupMap.clear();
    this.tabHits = [];
    const b = (text: string) => this.fg('accent', text);
    const dim = (text: string) => this.fg('dim', text);
    const title = this.fg(
      'toolTitle',
      this.options.theme?.bold?.(this.options.title) ?? this.options.title,
    );
    const leftTitle = `${b(this.options.titleIcon?.() ?? resolveIcon('agent', '󰣇'))} ${title}`;
    const close = this.fg(
      'dim',
      `${resolveIcon('close')}${outputWidth < 30 ? '' : ' Close'}`,
    );
    const frame = createPanelFrame({
      theme: this.options.theme ?? plainTheme,
      borderTone: 'accent',
      text: {
        clip: (text, width) => this.clip(text, width),
        pad: (text, width) => this.pad(text, width),
        measure: (text) => this.measure(text),
      },
    });
    const closeWidth = this.measure(close);
    const rows: string[] = [];
    const top = () => {
      const topWidth = Math.max(6, outputWidth);
      const label = this.clip(
        leftTitle,
        Math.max(0, topWidth - closeWidth - 9),
      );
      return frame.line(
        ['topLeft', 'horizontal'],
        ` ${label} `,
        [
          {
            horizontal: Math.max(
              0,
              topWidth - this.measure(label) - closeWidth - 8,
            ),
          },
        ],
        ` ${close} `,
        ['horizontal', 'topRight'],
      );
    };
    const cell = (text: string) => frame.cells([{ text, width: rightWidth }]);
    const selectedRow = items[this.selected];
    const item = selectedRow?.item;
    const itemId = selectedRow?.key;
    const activeView = item === undefined ? undefined : this.currentView(item);
    if (item === undefined) this.activeView = undefined;
    const tabs = (row: number, start: number) => {
      let text = '';
      for (const [index, view] of (item === undefined
        ? []
        : (this.adapter.views?.(item) ?? [])
      )
        .slice(0, 5)
        .entries()) {
        const active = view.id === activeView?.id;
        const label = active
          ? `[${index + 1} ${view.label}]`
          : w < 62
            ? ` ${index + 1} `
            : ` ${index + 1} ${view.label} `;
        const from = start + this.measure(text);
        const accent = this.fg(
          'accent',
          this.options.theme?.bold?.(label) ?? label,
        );
        const styled = active
          ? (this.options.theme?.bg?.('selectedBg', accent) ?? accent)
          : dim(label);
        text += styled;
        this.tabHits.push({
          row,
          start: from,
          end: Math.min(start + rightWidth, from + this.measure(label)),
          id: view.id,
        });
      }
      return text;
    };
    if (
      this.options.contentScroll === 'top' &&
      itemId !== this.lastContentItemId
    )
      this.resetContentScroll();
    if (itemId !== this.lastContentItemId) this.seenLineCount = undefined;
    this.lastContentItemId = itemId;
    if (selectedRow === undefined && !this.filterVisible) {
      rows.push(
        top(),
        frame.cells([
          {
            text: dim(
              this.options.emptyText ??
                'No items recorded in this session yet.',
            ),
            width: w - 4,
          },
        ]),
      );
      while (rows.length < maxLines - 1)
        rows.push(frame.cells([{ text: '', width: w - 4 }]));
      rows.push(this.footer(frame, outputWidth, 0, maxLines - 2));
      return this.finishRender(rows, outputWidth, maxLines, maxLines - 2);
    }
    const header =
      (item === undefined
        ? { variableRows: true }
        : this.adapter.renderHeader?.(
            item,
            this.context(rightWidth, split, items.length),
          )) ?? {};
    const listLabel = this.options.listLabel ?? 'items';
    const summary =
      maxLines >= 16
        ? this.adapter.renderListSummary?.(split ? sidebarWidth : rightWidth)
        : undefined;
    const filterRow = this.filterVisible
      ? this.filterRow(split ? sidebarWidth : rightWidth)
      : undefined;
    const contentForSelection = (height: number) => {
      if (item !== undefined) return this.content(item, rightWidth, height);
      const lines = selectedRow?.group
        ? [
            selectedRow.group.label,
            `Total: ${selectedRow.members.length}`,
            ...(this.adapter.renderGroupOverview?.(selectedRow.members) ?? []),
          ]
        : [this.fg('dim', 'No matches')];
      return {
        rows: lines
          .slice(0, height)
          .map((text) => ({ text }) as HistoryPanelLine),
        total: lines.length,
      };
    };
    let bodyHeight: number;
    if (split) {
      const sidebarTitle = this.clip(leftTitle, Math.max(0, sidebarWidth - 3));
      const fillLeft = Math.max(
        0,
        sidebarWidth + 2 - this.measure(sidebarTitle) - 3,
      );
      const leftTop = frame.line(
        ['topLeft', 'horizontal'],
        ` ${sidebarTitle} `,
        [{ horizontal: fillLeft }],
        ['tDown'],
      );
      const selectedItemIndex =
        item === undefined
          ? -1
          : this.adapter
              .items()
              .findIndex(
                (entry) => this.adapter.id(entry) === this.adapter.id(item),
              );
      const badge = `${b(item === undefined ? (selectedRow?.group?.label ?? 'No matches') : `${selectedItemIndex + 1}/${this.adapter.items().length}`)}${header.badge ? ` ${header.badge}` : ''}`;
      const clippedBadge = this.clip(
        badge,
        Math.max(0, rightWidth - closeWidth - 5),
      );
      const fill = Math.max(
        0,
        rightWidth - 4 - this.measure(clippedBadge) - closeWidth,
      );
      rows.push(
        frame.line(
          leftTop,
          ['horizontal'],
          ` ${clippedBadge} `,
          [{ horizontal: fill }],
          ` ${close} `,
          ['horizontal', 'topRight'],
        ),
      );
      const splitCell = (left: string, right: string) =>
        frame.cells([
          { text: left, width: sidebarWidth },
          { text: right, width: rightWidth },
        ]);
      const metadata = header.variableRows
        ? (header.wideRows ?? [])
        : Array.from({ length: 2 }, (_, i) => header.wideRows?.[i] ?? '');
      const headerRows = metadata.slice(0, Math.max(0, maxLines - 8));
      // The label and summary retain their legacy sidebar position independently of header height.
      const headerHeight = Math.max(
        headerRows.length,
        filterRow !== undefined ? 3 : summary !== undefined ? 2 : 1,
      );
      for (let i = 0; i < headerHeight; i++) {
        rows.push(
          splitCell(
            i === 0
              ? `${b(`${listLabel} 1-${items.length}/${items.length}`)} `
              : i === 1
                ? (summary ?? '')
                : i === 2
                  ? (filterRow ?? '')
                  : '',
            headerRows[i] ?? '',
          ),
        );
      }
      if (activeView)
        rows.push(splitCell('', tabs(rows.length, sidebarWidth + 5)));
      rows.push(frame.rule([sidebarWidth, rightWidth]));
      const height = Math.max(5, maxLines - rows.length - 1);
      bodyHeight = height;
      this.keepSelectionVisible(items.length, height);
      const content = contentForSelection(height);
      for (let i = 0; i < height; i++) {
        const row = rows.length;
        const left = this.itemCell(
          items,
          this.sidebarScroll + i,
          sidebarWidth,
          true,
          row,
        );
        const entry = content.rows[i];
        if (entry?.itemId) this.contentRowItemMap.set(row, entry.itemId);
        rows.push(splitCell(left, entry?.text ?? ''));
      }
      rows.push(this.footer(frame, outputWidth, content.total, height));
    } else {
      rows.push(top());
      for (const metadata of (header.narrowRows ?? []).slice(
        0,
        header.variableRows
          ? Math.max(0, maxLines - 8 - (filterRow !== undefined ? 1 : 0))
          : 2,
      ))
        rows.push(cell(metadata));
      if (activeView) rows.push(cell(tabs(rows.length, 2)));
      rows.push(frame.rule([rightWidth]));
      const available = Math.max(
        4,
        maxLines -
          rows.length -
          2 -
          (summary !== undefined ? 1 : 0) -
          (filterRow !== undefined ? 1 : 0),
      );
      const listHeight = Math.min(
        items.length,
        Math.max(1, Math.min(4, Math.floor(available * 0.35))),
      );
      const height = Math.max(2, available - listHeight);
      bodyHeight = height;
      this.keepSelectionVisible(items.length, listHeight);
      const content = contentForSelection(height);
      for (let i = 0; i < height; i++) {
        const entry = content.rows[i];
        if (entry?.itemId)
          this.contentRowItemMap.set(rows.length, entry.itemId);
        rows.push(cell(entry?.text ?? ''));
      }
      const listPosition = `[${this.sidebarScroll + 1}-${Math.min(items.length, this.sidebarScroll + listHeight)}/${items.length}] `;
      const arrows =
        items.length > listHeight
          ? `${resolveIcon('scrollUp', '▲')}/${resolveIcon('scrollDown', '▼')} `
          : '';
      const label = `${listLabel} ${listPosition}${arrows}`;
      rows.push(
        frame.line(['tRight', 'horizontal'], ` ${dim(label)} `, [
          { horizontal: Math.max(0, w - this.measure(label) - 5) },
          'tLeft',
        ]),
      );
      if (summary !== undefined) rows.push(cell(summary));
      if (filterRow !== undefined) rows.push(cell(filterRow));
      this.lastListStartRow = rows.length;
      for (let i = 0; i < listHeight; i++)
        rows.push(
          cell(
            this.itemCell(
              items,
              this.sidebarScroll + i,
              rightWidth,
              false,
              rows.length,
            ),
          ),
        );
      this.lastListEndRow = rows.length - 1;
      rows.push(this.footer(frame, outputWidth, content.total, height));
    }
    return this.finishRender(rows, outputWidth, maxLines, bodyHeight);
  }

  private filterRow(width: number): string {
    const total = this.adapter.items().length;
    const count = this.adapter
      .items()
      .filter((item) =>
        this.adapter.matchesFilter?.(item, this.filterQuery),
      ).length;
    const suffix = `${count}/${total}`;
    const label = `${this.fg('accent', '/')} ${this.filterQuery}${this.filtering ? '█' : ''}`;
    const room = Math.max(0, width - this.measure(suffix) - 1);
    return `${this.pad(label, room)} ${this.fg('dim', suffix)}`;
  }

  private bindings(): HistoryPanelHint[] {
    if (this.filtering)
      return [
        { key: 'Enter', label: 'keep', group: 'panel' },
        { key: 'Esc', label: 'clear', group: 'panel' },
        {
          key: `${resolveIcon('arrowUp')}/${resolveIcon('arrowDown')}`,
          label: 'results',
          group: 'navigate',
        },
      ];
    const item = this.selectedItem();
    const hints: HistoryPanelHint[] = [
      {
        key: `${resolveIcon('arrowLeft', '←')}/${resolveIcon('arrowRight', '→')}`,
        label: 'select',
        group: 'navigate',
      },
      {
        key: `${resolveIcon('arrowUp', '↑')}/${resolveIcon('arrowDown', '↓')}`,
        label: 'scroll',
        group: 'navigate',
      },
      { key: 'PgUp/PgDn', label: 'page', group: 'navigate', priority: 10 },
      { key: 'Home/End', label: 'top/bottom', group: 'navigate', priority: 0 },
      ...(this.adapter.views
        ? [
            { key: '1-5', label: 'view', group: 'views' as const },
            { key: 'g/G', label: 'top/bottom', group: 'navigate' as const },
          ]
        : []),
      ...(this.adapter.hints?.(item, this.getRenderDebugState()) ?? []),
      ...(item
        ? (this.adapter.actions?.(item).map((action) => ({
            key: action.key,
            label: action.label,
            eligible: action.eligible,
            group: 'actions' as const,
          })) ?? [])
        : []),
      ...(this.adapter.matchesFilter
        ? [{ key: '/', label: 'filter', group: 'panel' as const }]
        : []),
      ...(this.listRows()[this.selected]?.group
        ? [{ key: 'Enter/Space', label: 'collapse', group: 'panel' as const }]
        : []),
      {
        key: 'Esc',
        label: this.filterVisible ? 'clear' : 'close',
        group: 'panel',
        priority: 20,
      },
      { key: 'ctrl+c', label: 'close', group: 'panel', footer: false },
      { key: 'q', label: 'close', group: 'panel', footer: false },
      { key: '?', label: 'help', group: 'panel' },
    ];
    return hints.filter(
      (hint) =>
        item !== undefined ||
        hint.group === 'panel' ||
        (this.listRows().length > 0 && hint.group === 'navigate'),
    );
  }

  private footer(
    frame: ReturnType<typeof createPanelFrame>,
    width: number,
    total: number,
    height: number,
  ): string {
    const unseen = Math.max(0, total - (this.seenLineCount ?? total));
    const position =
      total > height || this.activeView !== undefined
        ? `${this.fg('dim', `line ${this.followTail ? total : this.scroll + 1}/${total}`)}${
            (!this.activeView || this.activeView.followTail) && this.followTail
              ? ` ${this.fg('success', `${resolveIcon('selectionSelected')} live`)}`
              : (!this.activeView || this.activeView.followTail) && unseen
                ? ` ${this.fg('accent', `${resolveIcon('arrowDown', '↓')} ${unseen} new`)}`
                : ''
          }`
        : '';
    const available = Math.max(
      0,
      width - 6 - (position ? this.measure(position) + 2 : 0),
    );
    const hints: HistoryPanelHint[] = this.helpOpen
      ? [
          { key: 'Esc', label: 'close help', group: 'panel' },
          { key: '?', label: 'close help', group: 'panel' },
          {
            key: `${resolveIcon('arrowUp', '↑')}/${resolveIcon('arrowDown', '↓')}`,
            label: 'scroll help',
            group: 'navigate',
          },
          { key: 'PgUp/PgDn', label: 'scroll help', group: 'navigate' },
        ]
      : this.bindings().filter(
          (hint) => hint.eligible !== false && hint.footer !== false,
        );
    const join = () =>
      hints
        .map(
          (hint) =>
            `${this.fg('accent', hint.key)} ${this.fg('dim', hint.label)}`,
        )
        .join(this.fg('dim', ` ${resolveIcon('separator', '·')} `));
    if (
      this.actionNotice &&
      this.actionNotice.expiresAt <= (this.options.now ?? Date.now)()
    )
      this.actionNotice = undefined;
    const confirmation = this.helpOpen
      ? undefined
      : this.pendingAction
        ? this.fg('warning', this.pendingAction.prompt)
        : this.actionNotice
          ? this.fg(this.actionNotice.role, this.actionNotice.text)
          : this.confirmationHint();
    const priority = (hint: HistoryPanelHint) =>
      hint.key === '?'
        ? 1000
        : hint.group === 'actions'
          ? 900
          : (hint.priority ?? 50);
    let text = confirmation ?? join();
    while (this.measure(text) > available && hints.length) {
      const lowest = Math.min(...hints.map(priority));
      hints.splice(
        hints.findIndex((hint) => priority(hint) === lowest),
        1,
      );
      text = confirmation ?? join();
      if (confirmation) break;
    }
    return frame.line(
      ['bottomLeft', 'horizontal'],
      ` ${this.clip(text, available)} `,
      [{ horizontal: Math.max(0, available - this.measure(text)) }],
      position ? ` ${position} ` : '',
      ['horizontal', 'bottomRight'],
    );
  }

  private finishRender(
    rows: string[],
    width: number,
    maxLines: number,
    bodyHeight: number,
  ): string[] {
    if (this.helpOpen) {
      const boxWidth = Math.min(width, 56);
      const frame = createPanelFrame({
        theme: this.options.theme ?? plainTheme,
        borderTone: 'accent',
        text: {
          clip: (text, w) => this.clip(text, w),
          pad: (text, w) => this.pad(text, w),
          measure: (text) => this.measure(text),
        },
      });
      const body: string[] = [];
      const bindings = this.bindings();
      for (const [group, label] of [
        ['navigate', 'Navigate'],
        ['views', 'Views'],
        ['actions', 'Actions'],
        ['panel', 'Panel'],
      ] as const) {
        const entries = bindings.filter(
          (hint) => (hint.group ?? 'actions') === group,
        );
        if (!entries.length) continue;
        body.push(this.fg('toolTitle', label));
        for (const hint of entries) {
          body.push(
            `${this.fg(hint.eligible === false ? 'dim' : 'accent', this.pad(hint.key, 12))}${this.fg('dim', hint.label)}`,
          );
        }
      }
      const capacity = Math.max(1, rows.length - 4);
      this.helpScroll = Math.min(
        this.helpScroll,
        Math.max(0, body.length - capacity),
      );
      const box = [
        frame.titled('Keyboard shortcuts', boxWidth, 1),
        ...body
          .slice(this.helpScroll, this.helpScroll + capacity)
          .map((text) => frame.cells([{ text, width: boxWidth - 4 }])),
        frame.rule([boxWidth - 4], 'bottom'),
      ];
      const top = Math.max(0, Math.floor((rows.length - box.length) / 2));
      const left = ' '.repeat(Math.max(0, Math.floor((width - boxWidth) / 2)));
      box.forEach((line, i) => {
        rows[top + i] = left + line;
      });
    }
    const lines = rows.map((row) => this.clip(row, width));
    const widths = lines.map((line) => this.measure(line));
    this.lastRenderMetrics = {
      configuredMaxLines: maxLines,
      renderWidth: width,
      renderedLineCount: lines.length,
      bodyHeight,
      maxVisibleWidth: Math.max(0, ...widths),
      widthViolationCount: widths.filter((value) => value > width).length,
    };
    return lines;
  }

  getRenderDebugState(): HistoryPanelRenderState {
    const item = this.selectedItem();
    return {
      itemCount: this.adapter.items().length,
      selectedIndex: item
        ? this.adapter
            .items()
            .findIndex(
              (entry) => this.adapter.id(entry) === this.adapter.id(item),
            )
        : -1,
      selectedId: item ? this.adapter.id(item) : undefined,
      scrollOffset: this.scroll,
      followTail: this.followTail,
      viewId: this.activeView?.id,
      clickableRowCount:
        this.rowItemMap.size +
        this.contentRowItemMap.size +
        this.rowGroupMap.size,
      ...this.lastRenderMetrics,
    };
  }

  selectedItem(): T | undefined {
    return this.listRows()[this.selected]?.item;
  }

  dismiss(): void {
    if (this.disposed) return;
    if (this.options.disposeOnClose !== false) this.dispose();
    this.options.onClose();
  }

  dispose(): void {
    this.disposed = true;
    this.closeArm = undefined;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }
}
