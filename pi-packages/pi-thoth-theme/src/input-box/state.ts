import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import {
  isAnimationEffectEnabled,
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
  let offGlyph: (() => void) | undefined;
  let offAmbient: (() => void) | undefined;
  let disposed = false;
  let effectStep = 0;
  let glyphStep = 0;

  const offLevel = subscribeAnimationLevel(() => {
    stop();
    syncAnimation();
  });

  function breathingFrame(): BreathingFrame {
    return createBreathingFrame(effectStep);
  }

  function workingGlyph(mode: IconMode): string {
    const glyphs = frames('workingFrames', mode);
    return isAnimationEffectEnabled('primary')
      ? glyphs[glyphStep % glyphs.length]
      : statusIcon('running', mode);
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
      original === undefined || isAnimationEffectEnabled('primary')
        ? native
        : workingGlyph(mode) + plain.slice(original.length);
    return renderWorkingIndicator(label, frame, styleMuted, glyphs);
  }

  function stop() {
    offGlyph?.();
    offGlyph = undefined;
    offAmbient?.();
    offAmbient = undefined;
  }

  function syncAnimation() {
    const primary = isAnimationEffectEnabled('primary');
    const ambient = isAnimationEffectEnabled('ambient');
    if (startedAt === undefined && (pendingBackground === 0 || !primary)) {
      stop();
    } else {
      // Root work still displays elapsed text; background-only labels do not.
      offGlyph ??= subscribeAnimationSteps({
        kind: 'primary',
        intendedMs: 200,
        onStep({ static: staticMode }) {
          if (!staticMode) glyphStep++;
          // Ambient renders after the glyph update on their shared clock tick.
          if (!isAnimationEffectEnabled('ambient')) requestRender();
        },
      });
      if (ambient) {
        offAmbient ??= subscribeAnimationSteps({
          kind: 'ambient',
          intendedMs: 100,
          onStep() {
            effectStep++;
            requestRender();
          },
        });
      }
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
