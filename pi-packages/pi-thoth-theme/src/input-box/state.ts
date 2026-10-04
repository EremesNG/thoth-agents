import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

export function createWorkingState(requestRender: () => void) {
  let startedAt: number | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  function stop() {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
    startedAt = undefined;
  }

  return {
    start() {
      if (disposed) return;
      stop();
      startedAt = Date.now();
      ticker = setInterval(requestRender, 1000);
      ticker.unref?.();
      requestRender();
    },
    end() {
      if (disposed) return;
      stop();
      requestRender();
    },
    status(indicator: unknown, width: number): string {
      if (
        !indicator ||
        typeof indicator !== 'object' ||
        !('renderInBorder' in indicator) ||
        typeof indicator.renderInBorder !== 'function'
      ) {
        return truncateToWidth('☥ thoth · ready', width, '');
      }
      const working = 'kind' in indicator && indicator.kind === 'working';
      const elapsed =
        working && startedAt !== undefined
          ? ` · ${Math.max(0, Math.floor((Date.now() - startedAt) / 1000))}s`
          : '';
      const nativeWidth = Math.max(1, width - visibleWidth(elapsed));
      const native = indicator.renderInBorder(nativeWidth);
      if (typeof native !== 'string' || visibleWidth(native) === 0) {
        return truncateToWidth('☥ thoth · ready', width, '');
      }
      return truncateToWidth(
        `${truncateToWidth(native, nativeWidth, '')}${elapsed}`,
        width,
        '',
      );
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}

export type WorkingState = ReturnType<typeof createWorkingState>;
