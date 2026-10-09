import type { Component, TuiMouseEvent } from '@earendil-works/pi-tui';

export interface LayoutAdapter {
  /** Mount once. False means no sidebar was installed; one diagnostic is emitted. */
  mount(component: Component, width: number): boolean;
  setWidth(width: number): void;
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

export function sidebarWidth(width: number): number {
  return Number.isFinite(width)
    ? Math.max(28, Math.min(72, Math.round(width)))
    : 44;
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
