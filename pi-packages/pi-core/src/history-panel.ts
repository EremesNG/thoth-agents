import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import {
  createHistoryPanelKeyMatcher,
  type HistoryPanelMouseEvent,
  historyPanelMouseClick,
  historyPanelMouseWheelDelta,
} from './history-panel-input.js';
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

export interface HistoryPanelHeader {
  /** Styled text after the wide header's selection counter. */
  badge?: string;
  /** Styled action hints before the wide header's close button. */
  shortcuts?: string;
  /** Wide mode always reserves two metadata rows, as the subagents panel does. */
  wideRows?: readonly string[];
  /** Up to two narrow metadata rows precede the content divider. */
  narrowRows?: readonly string[];
}

export interface HistoryPanelAdapter<T> {
  items(): readonly T[];
  id(item: T): string;
  /** Full label including any selection glyph; shell applies selected/dim tone. */
  renderItemLabel(item: T, context: HistoryPanelContext): string;
  /** Pre-rendered rows; newline/tab normalization and width clipping belong to the shell. */
  renderContent(item: T, width: number): readonly (string | HistoryPanelLine)[];
  renderHeader?(item: T, context: HistoryPanelContext): HistoryPanelHeader;
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
  theme?: RenderKitTheme;
  onClose(): void;
  /** False keeps close callbacks reusable; the embedding owner must call dispose(). */
  disposeOnClose?: boolean;
  maxLines?: number | (() => number);
  initialSelectedId?: string;
  matchesKey?: (data: string, key: string) => boolean;
  visibleWidth?: (text: string) => number;
  truncateToWidth?: (text: string, width: number) => string;
  closeKey?: string;
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
  /** Extra wide-footer actions, e.g. ctrl+o expand / ctrl+t thinking. */
  footerActions?: () => string;
}

const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  tDown: '┬',
  tUp: '┴',
  tRight: '├',
  tLeft: '┤',
  cross: '┼',
} as const;
const plainTheme: RenderKitTheme = { fg: (_role, text) => text };
const matchesRawKey = createHistoryPanelKeyMatcher();

/** Generic frame and physical-row viewport. Item rendering and hydration stay in the adapter. */
export class HistoryPanel<T> {
  private selected = 0;
  private scroll = 0;
  private sidebarScroll = 0;
  private followTail = true;
  private lastMaxScroll = 0;
  private lastSelectedIndex = -1;
  private initialSelectedId?: string;
  private rowItemMap = new Map<number, string>();
  private disposed = false;
  private lastIsSplit = true;
  private lastSidebarWidth = 26;
  private lastRenderWidth = 100;
  private lastRenderedLineCount = 0;
  private lastListStartRow = -1;
  private lastListEndRow = -1;
  private closeArm?: { id: string; expiresAt: number };
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
    this.closeArm = undefined;
  }

  private fg(role: Parameters<RenderKitTheme['fg']>[0], text: string): string {
    const theme = this.options.theme ?? plainTheme;
    return getRenderKit()?.fg(theme, role, text) ?? theme.fg(role, text);
  }
  private measure(text: string): number {
    try {
      const measured = this.options.visibleWidth?.(text);
      if (measured !== undefined && Number.isFinite(measured) && measured >= 0)
        return measured;
    } catch {}
    return visibleWidth(text);
  }
  private clip(text: string, width: number): string {
    if (width <= 0) return '';
    const normalized = text.replace(/\r?\n|\r/g, ' ').replace(/\t/g, '  ');
    if (this.measure(normalized) <= width) return normalized;
    const ellipsis = resolveIcon('ellipsis', '…');
    const clipped =
      !getRenderKit()?.icon && this.options.truncateToWidth
        ? this.options.truncateToWidth(normalized, width)
        : truncateToWidth(normalized, width, ellipsis);
    return this.measure(clipped) <= width
      ? clipped
      : truncateToWidth(clipped, width, ellipsis);
  }
  private pad(text: string, width: number): string {
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
  private content(
    item: T,
    width: number,
    height: number,
  ): { rows: HistoryPanelLine[]; total: number } {
    const rows = this.adapter.renderContent(item, width).flatMap((line) => {
      const entry = typeof line === 'string' ? { text: line } : line;
      return entry.text.split(/\r?\n|\r/).map((text) => ({
        ...entry,
        text: this.clip(text, width),
      }));
    });
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
    items: readonly T[],
    index: number,
    width: number,
    split: boolean,
    row: number,
  ): string {
    const item = items[index];
    if (!item) return '';
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
    if (
      this.matches(data, 'escape') ||
      this.matches(data, 'ctrl+c') ||
      this.matches(data, 'q')
    ) {
      this.dismiss();
      return;
    }
    if (this.adapter.handleInput?.(data, this)) {
      this.closeArm = undefined;
      return;
    }
    if (this.matches(data, this.options.closeKey ?? 'x')) {
      this.closeSelectedItem();
      return;
    }
    this.closeArm = undefined;
    const wheel = historyPanelMouseWheelDelta(data);
    if (wheel !== undefined) {
      this.scrollBy(wheel);
      return;
    }
    const click = historyPanelMouseClick(data);
    if (click) {
      this.applyMouse(click);
      return;
    }
    if (this.matches(data, 'right') || this.matches(data, 'left')) {
      const delta = this.matches(data, 'right') ? 1 : -1;
      this.selected = Math.max(
        0,
        Math.min(this.adapter.items().length - 1, this.selected + delta),
      );
      this.scroll = 0;
      this.followTail = true;
      return;
    }
    if (this.matches(data, 'down')) this.scrollBy(1);
    else if (this.matches(data, 'up')) this.scrollBy(-1);
    else if (this.matches(data, 'pageDown')) this.scrollBy(12);
    else if (this.matches(data, 'pageUp')) this.scrollBy(-12);
    else if (this.matches(data, 'home')) {
      this.scroll = 0;
      this.followTail = false;
    } else if (this.matches(data, 'end')) {
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
          Math.min(this.adapter.items().length - 1, this.sidebarScroll + delta),
        );
      else this.scrollBy(delta);
      return { handled: true, render: true };
    }
    if (
      event.type !== 'click' &&
      (event.type || (event.button !== 'left' && event.button !== undefined))
    )
      return undefined;
    if (
      (row === 0 || row === this.lastRenderedLineCount - 1) &&
      col >= Math.max(0, this.lastRenderWidth - 16)
    ) {
      this.dismiss();
      return { handled: true, render: true };
    }
    const id = this.rowItemMap.get(row);
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

  /** May also be called by an extension-owned shortcut. */
  closeSelectedItem(): void {
    if (this.disposed) return;
    const item = this.selectedItem();
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
    const index = this.adapter
      .items()
      .findIndex((item) => this.adapter.id(item) === id);
    if (index < 0) return false;
    this.selected = index;
    this.closeArm = undefined;
    this.scroll = 0;
    this.followTail = true;
    return true;
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
    const items = this.adapter.items();
    if (this.initialSelectedId) {
      const index = items.findIndex(
        (item) => this.adapter.id(item) === this.initialSelectedId,
      );
      if (index >= 0) this.selected = index;
      this.initialSelectedId = undefined;
    }
    this.selected = Math.max(0, Math.min(this.selected, items.length - 1));
    this.rowItemMap.clear();
    const b = (text: string) => this.fg('accent', text);
    const dim = (text: string) => this.fg('dim', text);
    const title = this.fg(
      'toolTitle',
      this.options.theme?.bold?.(this.options.title) ?? this.options.title,
    );
    const leftTitle = `${b(this.options.titleIcon?.() ?? resolveIcon('agent', '󰣇'))} ${title}`;
    const close = this.fg('error', '[✕ Cerrar]');
    const closeWidth = this.measure(close);
    const rows: string[] = [];
    const top = () => {
      const label = this.clip(leftTitle, Math.max(4, w - closeWidth - 8));
      return `${b(BOX.topLeft + BOX.horizontal)} ${label} ${b(BOX.horizontal.repeat(Math.max(0, w - this.measure(label) - closeWidth - 8)))} ${close} ${b(BOX.horizontal + BOX.topRight)}`;
    };
    const cell = (text: string) =>
      `${b(BOX.vertical)} ${this.pad(text, rightWidth)} ${b(BOX.vertical)}`;
    const item = items[this.selected];
    if (item === undefined) {
      rows.push(
        top(),
        `${b(BOX.vertical)} ${this.pad(dim(this.options.emptyText ?? 'No items recorded in this session yet.'), w - 4)} ${b(BOX.vertical)}`,
      );
      while (rows.length < maxLines - 1)
        rows.push(`${b(BOX.vertical)}${' '.repeat(w - 2)}${b(BOX.vertical)}`);
      rows.push(
        `${b(BOX.bottomLeft + BOX.horizontal.repeat(Math.max(0, w - closeWidth - 5)))} ${close} ${b(BOX.horizontal + BOX.bottomRight)}`,
      );
      return this.finishRender(rows, outputWidth, maxLines, maxLines - 2);
    }
    const header =
      this.adapter.renderHeader?.(
        item,
        this.context(rightWidth, split, items.length),
      ) ?? {};
    const listLabel = this.options.listLabel ?? 'items';
    let bodyHeight: number;
    if (split) {
      const fillLeft = Math.max(
        0,
        sidebarWidth + 2 - this.measure(leftTitle) - 3,
      );
      const leftTop = `${b(BOX.topLeft + BOX.horizontal)} ${leftTitle} ${b(BOX.horizontal.repeat(fillLeft))}${b(BOX.tDown)}`;
      const badge = `${b(`${this.selected + 1}/${items.length}`)}${header.badge ? ` ${header.badge}` : ''}`;
      const headerItems = `${header.shortcuts ?? ''}${close}`;
      const clippedBadge = this.clip(
        badge,
        Math.max(10, rightWidth - this.measure(headerItems) - 4),
      );
      const fill = Math.max(
        0,
        rightWidth - 4 - this.measure(clippedBadge) - this.measure(headerItems),
      );
      rows.push(
        `${leftTop}${b(BOX.horizontal)} ${clippedBadge} ${b(BOX.horizontal.repeat(fill))} ${headerItems} ${b(BOX.horizontal + BOX.topRight)}`,
      );
      const splitCell = (left: string, right: string) =>
        `${b(BOX.vertical)} ${this.pad(left, sidebarWidth)} ${b(BOX.vertical)} ${this.pad(right, rightWidth)} ${b(BOX.vertical)}`;
      rows.push(
        splitCell(
          `${b(`${listLabel} 1-${items.length}/${items.length}`)} `,
          header.wideRows?.[0] ?? '',
        ),
      );
      rows.push(splitCell('', header.wideRows?.[1] ?? ''));
      rows.push(
        b(
          BOX.tRight +
            BOX.horizontal.repeat(sidebarWidth + 2) +
            BOX.cross +
            BOX.horizontal.repeat(rightWidth + 2) +
            BOX.tLeft,
        ),
      );
      const height = Math.max(5, maxLines - rows.length - 1);
      bodyHeight = height;
      this.keepSelectionVisible(items.length, height);
      const content = this.content(item, rightWidth, height);
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
        if (entry?.itemId) this.rowItemMap.set(row, entry.itemId);
        rows.push(splitCell(left, entry?.text ?? ''));
      }
      const scrollPos =
        content.total > height
          ? `[${this.scroll + 1}-${Math.min(content.total, this.scroll + height)}/${content.total}] `
          : '';
      const shortcuts =
        this.confirmationHint() ??
        `${resolveIcon('arrowLeft', '←')}/${resolveIcon('arrowRight', '→')} exec ${resolveIcon('separator', '·')} ${resolveIcon('arrowUp', '↑')}/${resolveIcon('arrowDown', '↓')} scroll${this.options.footerActions ? ` ${resolveIcon('separator', '·')} ${this.options.footerActions()}` : ''}`;
      const bottomItems = this.clip(
        dim(scrollPos + shortcuts),
        Math.max(4, rightWidth - closeWidth - 4),
      );
      const bottomFill = Math.max(
        0,
        rightWidth - 4 - this.measure(bottomItems) - closeWidth,
      );
      rows.push(
        `${b(BOX.bottomLeft + BOX.horizontal.repeat(sidebarWidth + 2) + BOX.tUp)}${b(BOX.horizontal.repeat(bottomFill))} ${bottomItems} ${b(BOX.horizontal)} ${close} ${b(BOX.horizontal + BOX.bottomRight)}`,
      );
    } else {
      rows.push(top());
      for (const metadata of (header.narrowRows ?? []).slice(0, 2))
        rows.push(cell(metadata));
      rows.push(
        b(BOX.tRight + BOX.horizontal.repeat(rightWidth + 2) + BOX.tLeft),
      );
      const available = Math.max(4, maxLines - rows.length - 2);
      const listHeight = Math.min(
        items.length,
        Math.max(1, Math.min(4, Math.floor(available * 0.35))),
      );
      const height = Math.max(2, available - listHeight);
      bodyHeight = height;
      this.keepSelectionVisible(items.length, listHeight);
      const content = this.content(item, rightWidth, height);
      for (let i = 0; i < height; i++) {
        const entry = content.rows[i];
        if (entry?.itemId) this.rowItemMap.set(rows.length, entry.itemId);
        rows.push(cell(entry?.text ?? ''));
      }
      const listPosition = `[${this.sidebarScroll + 1}-${Math.min(items.length, this.sidebarScroll + listHeight)}/${items.length}] `;
      const arrows =
        items.length > listHeight
          ? `${resolveIcon('scrollUp', '▲')}/${resolveIcon('scrollDown', '▼')} `
          : '';
      const label = `${listLabel} ${listPosition}${arrows}`;
      rows.push(
        `${b(BOX.tRight + BOX.horizontal)} ${dim(label)} ${b(BOX.horizontal.repeat(Math.max(0, w - this.measure(label) - 5)) + BOX.tLeft)}`,
      );
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
      const arrowsHint = `${resolveIcon('arrowLeft', '←')}/${resolveIcon('arrowRight', '→')} select`;
      const shortcuts = this.clip(
        this.confirmationHint() ??
          (w >= 55
            ? `${arrowsHint} ${resolveIcon('separator', '·')} ${resolveIcon('arrowUp', '↑')}/${resolveIcon('arrowDown', '↓')} scroll`
            : arrowsHint),
        Math.max(4, w - closeWidth - 8),
      );
      const fill = Math.max(0, w - this.measure(shortcuts) - closeWidth - 8);
      rows.push(
        `${b(BOX.bottomLeft + BOX.horizontal)} ${dim(shortcuts)} ${b(BOX.horizontal.repeat(fill))} ${close} ${b(BOX.horizontal + BOX.bottomRight)}`,
      );
    }
    return this.finishRender(rows, outputWidth, maxLines, bodyHeight);
  }

  private finishRender(
    rows: string[],
    width: number,
    maxLines: number,
    bodyHeight: number,
  ): string[] {
    const lines = rows.map((row) => this.clip(row, width));
    const widths = lines.map((line) => this.measure(line));
    this.lastRenderedLineCount = lines.length;
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
      selectedIndex: item ? this.selected : -1,
      selectedId: item ? this.adapter.id(item) : undefined,
      scrollOffset: this.scroll,
      followTail: this.followTail,
      clickableRowCount: this.rowItemMap.size,
      ...this.lastRenderMetrics,
    };
  }

  selectedItem(): T | undefined {
    const items = this.adapter.items();
    this.selected = Math.max(0, Math.min(this.selected, items.length - 1));
    return items[this.selected];
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
