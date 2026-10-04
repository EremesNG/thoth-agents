import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { renderWorkingIndicator } from './gradient.ts';

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
    get isWorking() {
      return startedAt !== undefined;
    },
    start() {
      if (disposed) return;
      stop();
      startedAt = Date.now();
      ticker = setInterval(requestRender, 50);
      ticker.unref?.();
      requestRender();
    },
    end() {
      if (disposed) return;
      stop();
      requestRender();
    },
    status(
      indicator: unknown,
      width: number,
      styleIdle: (text: string) => string = (text) => text,
    ): string {
      if (
        !indicator ||
        typeof indicator !== 'object' ||
        !('renderInBorder' in indicator) ||
        typeof indicator.renderInBorder !== 'function'
      ) {
        return styleIdle(truncateToWidth('▲ ready', width, ''));
      }
      const working = 'kind' in indicator && indicator.kind === 'working';
      const now = Date.now();
      const elapsed =
        working && startedAt !== undefined
          ? ` · ${Math.max(0, Math.floor((now - startedAt) / 1000))}s`
          : '';
      const nativeWidth = Math.max(1, width - visibleWidth(elapsed));
      const native = indicator.renderInBorder(nativeWidth);
      if (typeof native !== 'string' || visibleWidth(native) === 0) {
        return styleIdle(truncateToWidth('▲ ready', width, ''));
      }
      const fitted = truncateToWidth(native, nativeWidth, '');
      const label =
        working && startedAt !== undefined
          ? renderWorkingIndicator(fitted, now)
          : fitted;
      return truncateToWidth(`${label}${elapsed}`, width, '');
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}

export type WorkingState = ReturnType<typeof createWorkingState>;
