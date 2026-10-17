import type { Component, TuiMouseEvent } from '@earendil-works/pi-tui';

export interface LayoutAdapter {
  /** Mount once. False means no sidebar was installed; one diagnostic is emitted. */
  mount(component: Component, width: number): boolean;
  /** effectiveWidth preserves the main pane on terminals narrower than the preference. */
  setWidth(width: number, effectiveWidth?: number): void;
  setVisible(visible: boolean): void;
  /** Recheck ownership and visibility; notify the session when display changes. */
  isDisplayed(): boolean;
  dispose(): void;
}
export type LayoutDiagnostic = (message: string) => void;

export function observeDisplay(
  read: () => boolean,
  onChange: () => void,
): () => boolean {
  let previous = false;
  return () => {
    const displayed = read();
    if (displayed !== previous) {
      previous = displayed;
      onChange();
    }
    return displayed;
  };
}

export const DEFAULT_SIDEBAR_WIDTH = 50;
export const MIN_SIDEBAR_WIDTH = 36;
export const MAX_SIDEBAR_WIDTH = 72;

export function sidebarWidth(width: number, effectiveWidth?: number): number {
  const preferred = Number.isFinite(width)
    ? Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)),
      )
    : DEFAULT_SIDEBAR_WIDTH;
  return effectiveWidth !== undefined && Number.isFinite(effectiveWidth)
    ? Math.min(preferred, Math.max(0, Math.round(effectiveWidth)))
    : preferred;
}

export function diagnosticOnce(report: LayoutDiagnostic): LayoutDiagnostic {
  let reported = false;
  return (message) => {
    if (reported) return;
    reported = true;
    report(message);
  };
}

/** Do not let sidebar rows capture focus or wheel-scroll the transcript. */
export function readOnlySidebar(component: Component): Component {
  return {
    render: (width) => component.render(width),
    invalidate: () => component.invalidate(),
    handleMouse: (event: TuiMouseEvent) => {
      const result = component.handleMouse?.(event);
      return { ...result, handled: true, focus: false };
    },
  };
}

/** Minimal component for adapter probes; real panels use the same Component seam. */
export class PlaceholderSidebar implements Component {
  readonly widths: number[] = [];
  readonly mouseEvents: TuiMouseEvent[] = [];
  render(width: number): string[] {
    this.widths.push(width);
    return ['Sidebar'];
  }
  invalidate(): void {}
  handleMouse(event: TuiMouseEvent) {
    this.mouseEvents.push(event);
    return { handled: true };
  }
}
