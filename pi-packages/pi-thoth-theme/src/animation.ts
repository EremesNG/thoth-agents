import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { getAnimationLevel, setAnimationLevel } from '@thoth-agents/pi-core';
import {
  ANIMATION_LEVELS,
  isAnimationLevel,
  saveAnimationLevel,
  type ThemeConfig,
} from './shared/config.ts';
import { frames, statusIcon } from './shared/icons.ts';

const EFFECT_DESCRIPTIONS = {
  full: 'everything',
  reduced: 'spinners and working indicator; no border breathing/shimmer',
  minimal: 'only the working indicator',
  off: 'nothing',
};
const ARGUMENT_HELP = ANIMATION_LEVELS.map(
  (level) => `${level}: ${EFFECT_DESCRIPTIONS[level]}`,
).join('; ');

export function registerAnimation(pi: ExtensionAPI, config: ThemeConfig): void {
  setAnimationLevel(config.animation ?? 'full');

  function applyNative(ctx: ExtensionContext): void {
    if (
      !ctx.hasUI ||
      !config.statusLine.enabled ||
      config.inputBox?.enabled === false
    )
      return;
    const level = getAnimationLevel();
    ctx.ui.setWorkingIndicator?.({
      frames:
        level === 'off'
          ? [statusIcon('running', config.icons)]
          : [...frames('workingFrames', config.icons)],
      intervalMs: level === 'off' ? 500 : 200,
    });
  }

  pi.on('session_start', (_event, ctx) => {
    setAnimationLevel(config.animation ?? 'full');
    applyNative(ctx);
  });

  pi.registerCommand('thoth-animation', {
    description: `Set animation effects — ${ARGUMENT_HELP}`,
    async handler(args, ctx) {
      let choice: unknown = args.trim();
      if (!choice) {
        if (!ctx.hasUI) {
          ctx.ui.notify(
            `Specify an animation level: full, reduced, minimal, off. ${ARGUMENT_HELP}`,
            'error',
          );
          return;
        }
        const options = ANIMATION_LEVELS.map(
          (level) =>
            `${level}${level === getAnimationLevel() ? ' (current)' : ''} — ${EFFECT_DESCRIPTIONS[level]}`,
        );
        const selected = await ctx.ui.select('Thoth animation', options);
        if (selected === undefined) return;
        choice = ANIMATION_LEVELS[options.indexOf(selected)];
      }
      if (!isAnimationLevel(choice)) {
        ctx.ui.notify(
          `Invalid animation level. Choose full, reduced, minimal, off. ${ARGUMENT_HELP}`,
          'error',
        );
        return;
      }
      try {
        saveAnimationLevel(choice);
      } catch (error) {
        ctx.ui.notify(
          `Could not save animation: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
        return;
      }
      config.animation = choice;
      setAnimationLevel(choice);
      applyNative(ctx);
      ctx.ui.notify(`Thoth animation: ${choice}`, 'info');
    },
  });
}
