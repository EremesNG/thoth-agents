import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import {
  getAnimationLevel,
  getAnimationPeriodMs,
  subscribeAnimationClock,
  subscribeAnimationLevel,
  subscribeAnimationSteps,
} from '@thoth-agents/pi-core';
import type { IconMode } from '../shared/config.ts';
import { formatDuration } from '../shared/duration.ts';
import { frames, icon, statusIcon } from '../shared/icons.ts';
import {
  type BreathingFrame,
  createBreathingFrame,
  renderWorkingIndicator,
} from './gradient.ts';

export function createWorkingState(requestRender: () => void) {
  let startedAt: number | undefined;
  let pendingBackground = 0;
  let offRefresh: (() => void) | undefined;
  let disposed = false;
  let effectStep = 0;
  let glyphStep = 0;
  let glyphTicks = 0;

  const offLevel = subscribeAnimationLevel(() => {
    glyphTicks = 0;
    stop();
    syncAnimation();
  });

  function breathingFrame(): BreathingFrame {
    return createBreathingFrame(effectStep);
  }

  function workingGlyph(mode: IconMode): string {
    const glyphs = frames('workingFrames', mode);
    return getAnimationLevel() === 'off'
      ? statusIcon('running', mode)
      : glyphs[glyphStep % glyphs.length];
  }

  function workingLabel(
    native: string,
    frame: BreathingFrame,
    mode: IconMode,
    styleMuted: (text: string) => string,
  ): string {
    const glyphs = [
      ...frames('workingFrames', mode),
      statusIcon('running', mode),
    ];
    const plain = stripTerminalSequences(native);
    const original = glyphs.find(
      (glyph) =>
        plain.startsWith(glyph) && /^\s|^$/u.test(plain.slice(glyph.length)),
    );
    const label =
      original === undefined || getAnimationLevel() !== 'off'
        ? native
        : workingGlyph(mode) + plain.slice(original.length);
    return renderWorkingIndicator(label, frame, styleMuted, glyphs);
  }

  function stop() {
    offRefresh?.();
    offRefresh = undefined;
  }

  function syncAnimation() {
    const staticMode = getAnimationLevel() === 'off';
    if (startedAt === undefined && (pendingBackground === 0 || staticMode)) {
      stop();
    } else if (offRefresh === undefined && staticMode) {
      // Root work still displays elapsed text; background-only labels do not.
      offRefresh = subscribeAnimationSteps({
        intendedMs: 1000,
        onStep: () => requestRender(),
      });
    } else if (offRefresh === undefined) {
      const ticksPerGlyph = Math.max(
        1,
        Math.round(200 / (getAnimationPeriodMs() ?? 100)),
      );
      offRefresh = subscribeAnimationClock(() => {
        effectStep++;
        if (++glyphTicks >= ticksPerGlyph) {
          glyphTicks = 0;
          glyphStep++;
        }
        requestRender();
      });
    }
    requestRender();
  }

  return {
    breathingFrame,
    get isWorking() {
      return startedAt !== undefined || pendingBackground > 0;
    },
    start() {
      if (disposed) return;
      startedAt = Date.now();
      syncAnimation();
    },
    end() {
      if (disposed) return;
      startedAt = undefined;
      syncAnimation();
    },
    setPendingBackground(count: number) {
      if (disposed || pendingBackground === count) return;
      pendingBackground = count;
      syncAnimation();
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
        const label = workingLabel(
          `${workingGlyph(mode)} working${icon('ellipsis', mode)}`,
          frame ?? breathingFrame(),
          mode,
          styleMuted,
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
          ? workingLabel(fitted, frame ?? breathingFrame(), mode, styleMuted)
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
      offLevel();
      stop();
    },
  };
}

export type WorkingState = ReturnType<typeof createWorkingState>;
