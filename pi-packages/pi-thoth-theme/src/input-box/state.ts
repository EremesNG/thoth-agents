import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { IconMode } from '../shared/config.ts';
import { formatDuration } from '../shared/duration.ts';
import { frames, icon } from '../shared/icons.ts';
import {
  type BreathingFrame,
  createBreathingFrame,
  renderWorkingIndicator,
} from './gradient.ts';

export function createWorkingState(requestRender: () => void) {
  let startedAt: number | undefined;
  let pendingBackground = 0;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  function stop() {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
  }

  function syncTicker() {
    if (startedAt === undefined && pendingBackground === 0) {
      stop();
    } else if (ticker === undefined) {
      ticker = setInterval(requestRender, 50);
      ticker.unref?.();
    }
    requestRender();
  }

  return {
    get isWorking() {
      return startedAt !== undefined || pendingBackground > 0;
    },
    start() {
      if (disposed) return;
      startedAt = Date.now();
      syncTicker();
    },
    end() {
      if (disposed) return;
      startedAt = undefined;
      syncTicker();
    },
    setPendingBackground(count: number) {
      if (disposed || pendingBackground === count) return;
      pendingBackground = count;
      syncTicker();
    },
    status(
      indicator: unknown,
      width: number,
      styleMuted: (text: string) => string = (text) => text,
      frame?: BreathingFrame,
      mode: IconMode = 'nerd',
    ): string {
      const ready = `${icon('ready', mode)} ready`;
      const separator = icon('separator', mode);
      const now = frame?.now ?? Date.now();
      const fallback = () => {
        if (pendingBackground === 0)
          return styleMuted(truncateToWidth(ready, width, ''));
        const glyphs = frames('workingFrames', mode);
        const glyph = glyphs[Math.floor(now / 200) % glyphs.length];
        const label = renderWorkingIndicator(
          `${glyph} working${icon('ellipsis', mode)}`,
          frame ?? createBreathingFrame(now),
          styleMuted,
          glyphs,
        );
        return truncateToWidth(
          `${label}${styleMuted(` ${separator} ${pendingBackground} bg`)}`,
          width,
          '',
        );
      };
      if (
        !indicator ||
        typeof indicator !== 'object' ||
        !('renderInBorder' in indicator) ||
        typeof indicator.renderInBorder !== 'function'
      ) {
        return fallback();
      }
      const working = 'kind' in indicator && indicator.kind === 'working';
      const elapsed =
        working && startedAt !== undefined
          ? ` ${separator} ${formatDuration(Math.floor((now - startedAt) / 1000) * 1000)}`
          : '';
      const nativeWidth = Math.max(1, width - visibleWidth(elapsed));
      const native = indicator.renderInBorder(nativeWidth);
      if (typeof native !== 'string' || visibleWidth(native) === 0) {
        return fallback();
      }
      const fitted = truncateToWidth(native, nativeWidth, '');
      const label =
        working && startedAt !== undefined
          ? renderWorkingIndicator(
              fitted,
              frame ?? createBreathingFrame(now),
              styleMuted,
              frames('workingFrames', mode),
            )
          : fitted;
      return truncateToWidth(
        `${label}${elapsed ? styleMuted(elapsed) : ''}`,
        width,
        '',
      );
    },
    dispose() {
      disposed = true;
      startedAt = undefined;
      pendingBackground = 0;
      stop();
    },
  };
}

export type WorkingState = ReturnType<typeof createWorkingState>;
