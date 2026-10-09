import { matchesKey } from '@earendil-works/pi-tui';
import { sidebarWidth } from './layout/adapter.js';

export type Startup = 'auto' | 'manual' | 'off';

/** Session-only controls. Persistence is deliberately owned by the command layer. */
export class SidebarControls {
  width = 44;
  mode: 'auto' | 'manual';
  enabled: boolean;
  visible = false;
  private collapsed = false;
  private resizeStart: number | undefined;
  private dragging = false;

  constructor(startup: Startup = 'auto') {
    this.mode = startup === 'manual' ? 'manual' : 'auto';
    this.enabled = startup !== 'off';
  }
  get resizing(): boolean {
    return this.resizeStart !== undefined;
  }
  command(command: string): boolean {
    const wasEnabled = this.enabled;
    switch (command) {
      case '':
        this.enabled = !this.enabled;
        break;
      case 'auto':
      case 'manual':
        this.mode = command;
        this.enabled = true;
        this.collapsed = false;
        break;
      case 'on':
        this.enabled = true;
        break;
      case 'off':
        this.enabled = false;
        this.cancelResize();
        break;
      default:
        return false;
    }
    if (!wasEnabled && this.enabled) this.collapsed = false;
    return true;
  }
  sync(columns: number): boolean {
    if (!Number.isFinite(columns) || columns < 1) {
      this.visible = false;
      this.cancelResize();
      return false;
    }
    if (this.mode === 'auto') {
      const threshold = 80 + this.width;
      if (columns < threshold) this.collapsed = true;
      else if (columns >= threshold + 8) this.collapsed = false;
      this.visible = this.enabled && !this.collapsed && columns >= threshold;
    } else {
      this.visible = this.enabled && columns >= 92;
    }
    if (!this.visible) {
      this.cancelResize();
      this.dragging = false;
    }
    return this.visible;
  }
  effectiveWidth(columns: number): number {
    return Math.min(this.width, Math.max(28, columns - 64));
  }
  setWidth(width: number): void {
    this.width = sidebarWidth(width);
  }
  beginResize(): boolean {
    if (!this.visible) return false;
    this.resizeStart ??= this.width;
    return true;
  }
  cancelResize(): void {
    if (this.resizeStart !== undefined) this.width = this.resizeStart;
    this.resizeStart = undefined;
    this.dragging = false;
  }
  key(data: string, columns = Infinity): boolean {
    if (!this.resizing) return false;
    if (matchesKey(data, 'escape')) this.cancelResize();
    else if (matchesKey(data, 'enter')) this.resizeStart = undefined;
    else if (matchesKey(data, 'shift+left'))
      this.setWidth(Math.min(columns - 64, this.effectiveWidth(columns) + 4));
    else if (matchesKey(data, 'shift+right'))
      this.setWidth(this.effectiveWidth(columns) - 4);
    else if (matchesKey(data, 'left'))
      this.setWidth(Math.min(columns - 64, this.effectiveWidth(columns) + 1));
    else if (matchesKey(data, 'right'))
      this.setWidth(this.effectiveWidth(columns) - 1);
    else return false;
    return true;
  }
  /** Absolute, zero-based terminal column; only fullscreen calls this seam. */
  mouse(
    type: 'press' | 'drag' | 'release',
    column: number,
    columns: number,
  ): boolean {
    if (!this.visible) return false;
    if (type === 'press') {
      this.dragging =
        Math.abs(column - (columns - this.effectiveWidth(columns))) <= 1;
      return this.dragging;
    }
    if (!this.dragging) return false;
    if (type === 'drag')
      this.setWidth(Math.min(columns - 64, columns - column));
    else this.dragging = false;
    return true;
  }
}
