import type { Component } from '@earendil-works/pi-tui';
import type { AnimationLevel } from '@thoth-agents/pi-core';
import {
  createListEditor,
  type ListEditorRow,
  normalizePanelKey,
  type PanelTheme,
} from '@thoth-agents/pi-core/panel';
import {
  ANIMATION_LEVELS,
  CACHE_TTL_CHOICES,
  DEFAULT_CACHE_TTL_MINUTES,
  type IconMode,
  type ThemeConfig,
  type ThemeConfigPatch,
  type ToolDensity,
} from '../shared/config.ts';

const ICON_MODES: readonly IconMode[] = ['nerd', 'unicode', 'ascii'];
const DENSITIES: readonly ToolDensity[] = ['frame', 'compact', 'line'];
const TTL_CHOICES: readonly number[] = CACHE_TTL_CHOICES;

const MODULES = [
  ['statusLine', 'Status line'],
  ['inputBox', 'Input box'],
  ['tools', 'Tool cards'],
  ['welcome', 'Welcome'],
] as const;
type ModuleKey = (typeof MODULES)[number][0];

/** Enum rows share one label width so the values line up. */
const LABEL_WIDTH = 'Tool density'.length;

export interface ThemeSettingsDraft {
  icons: IconMode;
  animation: AnimationLevel;
  density: ToolDensity;
  cacheExpiry: { enabled: boolean; ttlMinutes: number };
  modules: Record<ModuleKey, boolean>;
}

export interface ThemeSettingsOptions {
  initial: ThemeSettingsDraft;
  /** Persist and apply the changes; throwing keeps the overlay open with the message. */
  save(patch: ThemeConfigPatch, draft: ThemeSettingsDraft): void;
  onDone(saved: boolean): void;
  theme?: PanelTheme;
  maxHeight?(): number;
  requestRender?(): void;
}

/** The value after `current` in the direction of `delta`, wrapping at the ends. */
const cycle = <T>(values: readonly T[], current: T, delta: number): T =>
  values[
    (values.indexOf(current) + Math.sign(delta) + values.length) % values.length
  ];

/**
 * Steps a numeric choice list. A TTL outside the list (JSON-only value) snaps
 * to the neighbouring choice in the travelled direction.
 */
function cycleTtl(current: number, delta: number): number {
  const index = TTL_CHOICES.indexOf(current);
  if (index >= 0) return cycle(TTL_CHOICES, current, delta);
  const up = TTL_CHOICES.filter((value) => value > current);
  const down = TTL_CHOICES.filter((value) => value < current);
  if (Math.sign(delta) > 0) return up[0] ?? TTL_CHOICES[0];
  return down[down.length - 1] ?? TTL_CHOICES[TTL_CHOICES.length - 1];
}

export function draftFromConfig(config: ThemeConfig): ThemeSettingsDraft {
  return {
    icons: config.icons,
    animation: config.animation ?? 'full',
    density: config.tools.collapsed ?? 'frame',
    cacheExpiry: {
      enabled: config.cacheExpiry?.enabled !== false,
      ttlMinutes: config.cacheExpiry?.ttlMinutes ?? DEFAULT_CACHE_TTL_MINUTES,
    },
    modules: {
      statusLine: config.statusLine.enabled,
      inputBox: config.inputBox?.enabled !== false,
      tools: config.tools.enabled,
      welcome: config.welcome.enabled,
    },
  };
}

/** Only the settings the user changed, so untouched fields are never rewritten. */
export function patchFromDraft(
  initial: ThemeSettingsDraft,
  draft: ThemeSettingsDraft,
): ThemeConfigPatch {
  const patch: ThemeConfigPatch = {};
  if (draft.icons !== initial.icons) patch.icons = draft.icons;
  if (draft.animation !== initial.animation) patch.animation = draft.animation;
  if (draft.density !== initial.density)
    patch.tools = { collapsed: draft.density };
  const cache: { enabled?: boolean; ttlMinutes?: number } = {};
  if (draft.cacheExpiry.enabled !== initial.cacheExpiry.enabled)
    cache.enabled = draft.cacheExpiry.enabled;
  if (draft.cacheExpiry.ttlMinutes !== initial.cacheExpiry.ttlMinutes)
    cache.ttlMinutes = draft.cacheExpiry.ttlMinutes;
  if (Object.keys(cache).length) patch.cacheExpiry = cache;
  for (const [key] of MODULES) {
    if (draft.modules[key] === initial.modules[key]) continue;
    if (key === 'tools')
      patch.tools = { ...patch.tools, enabled: draft.modules[key] };
    else patch[key] = { enabled: draft.modules[key] };
  }
  return patch;
}

/** True when the patch holds a setting that only applies after `/reload`. */
export const needsReload = (patch: ThemeConfigPatch): boolean =>
  patch.statusLine !== undefined ||
  patch.inputBox !== undefined ||
  patch.welcome !== undefined ||
  patch.tools?.enabled !== undefined;

/**
 * List editor for the theme's icons, animation, tool density and module
 * switches. Keys the shell would treat as navigation or filtering are handled
 * here first.
 */
export function createThemeSettingsPanel(
  options: ThemeSettingsOptions,
): Component {
  const { initial } = options;
  const draft: ThemeSettingsDraft = {
    ...initial,
    cacheExpiry: { ...initial.cacheExpiry },
    modules: { ...initial.modules },
  };
  const enumRows = [
    ['icons', 'Icons', ICON_MODES],
    ['animation', 'Animation', ANIMATION_LEVELS],
    ['density', 'Tool density', DENSITIES],
  ] as const;
  const rows = (): ListEditorRow[] => [
    ...enumRows.map(([id, label]) => ({
      id,
      label: `${label.padEnd(LABEL_WIDTH)}  ‹ ${draft[id]} ›`,
      dirty: draft[id] !== initial[id],
    })),
    // Cache expiry applies live, so it sits with the other live rows.
    {
      id: 'cache:enabled',
      label: `${draft.cacheExpiry.enabled ? '[x]' : '[ ]'} Cache expiry`,
      dirty: draft.cacheExpiry.enabled !== initial.cacheExpiry.enabled,
    },
    {
      id: 'cache:ttl',
      label: `${'Cache TTL'.padEnd(LABEL_WIDTH)}  ‹ ${draft.cacheExpiry.ttlMinutes}m ›`,
      dirty: draft.cacheExpiry.ttlMinutes !== initial.cacheExpiry.ttlMinutes,
    },
    ...MODULES.map(([id, label]) => ({
      id: `module:${id}`,
      label: `${draft.modules[id] ? '[x]' : '[ ]'} ${label}  (requires /reload)`,
      dirty: draft.modules[id] !== initial.modules[id],
    })),
  ];
  const editor = createListEditor({
    overview: {
      title: 'Thoth theme settings',
      rows,
      hints: 'Space toggle · ←/→ change · Enter save · Esc cancel',
    },
    theme: options.theme,
    maxHeight: options.maxHeight,
    requestRender: options.requestRender,
    onSave: () => {
      try {
        options.save(patchFromDraft(initial, draft), {
          ...draft,
          modules: { ...draft.modules },
        });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    onSaved: () => options.onDone(true),
    onCancel: () => options.onDone(false),
  });
  const selectedId = () => rows()[editor.getState().selectedIndex]?.id;
  const step = (delta: number) => {
    const id = selectedId();
    if (id === 'icons') draft.icons = cycle(ICON_MODES, draft.icons, delta);
    else if (id === 'animation')
      draft.animation = cycle(ANIMATION_LEVELS, draft.animation, delta);
    else if (id === 'density')
      draft.density = cycle(DENSITIES, draft.density, delta);
    else if (id === 'cache:ttl')
      draft.cacheExpiry.ttlMinutes = cycleTtl(
        draft.cacheExpiry.ttlMinutes,
        delta,
      );
    else return;
    editor.invalidate();
  };
  return {
    render: (width) => editor.render(width),
    invalidate: () => editor.invalidate(),
    handleInput(data) {
      const key = normalizePanelKey(data);
      if (key === 'space') {
        const id = selectedId();
        if (id === 'cache:enabled') {
          draft.cacheExpiry.enabled = !draft.cacheExpiry.enabled;
          editor.invalidate();
          return;
        }
        const module = MODULES.find(([name]) => `module:${name}` === id)?.[0];
        if (module) {
          draft.modules[module] = !draft.modules[module];
          editor.invalidate();
        }
      } else if (key === 'left') step(-1);
      else if (key === 'right') step(1);
      else if (key === 'enter') editor.handleInput('s');
      else if (key === 'escape' || key === 'q') options.onDone(false);
      else editor.handleInput(data);
    },
  };
}
