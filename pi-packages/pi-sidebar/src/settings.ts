import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { type Component, matchesKey } from '@earendil-works/pi-tui';
import {
  createListEditor,
  type ListEditorRow,
  normalizePanelKey,
  openPanelOverlay,
  type PanelTheme,
} from '@thoth-agents/pi-core/panel';
import type { PanelPreference } from './config.js';
import type { Startup } from './controls.js';
import { sidebarWidth } from './layout/adapter.js';

const NAMES: Record<string, string> = {
  session: 'Session',
  workspace: 'Workspace',
  subagents: 'Agents',
  todos: 'Todos',
  'background-tasks': 'Background',
  cost: 'Cost',
};
const STARTUPS: readonly Startup[] = ['auto', 'manual', 'off'];
const MIN_WIDTH = 28;
const MAX_WIDTH = 72;

export interface SettingsDraft {
  panels: PanelPreference[];
  startup: Startup;
  width: number;
}

export interface SettingsOptions {
  panels: readonly PanelPreference[];
  startup: Startup;
  width: number;
  /** Panels whose source is not registered right now. */
  unavailable?(id: string): boolean;
  /** Persist the draft; throwing keeps the overlay open with the message. */
  save(draft: SettingsDraft): void;
  onDone(saved: boolean): void;
  theme?: PanelTheme;
  maxHeight?(): number;
  requestRender?(): void;
}

export function panelName(id: string): string {
  return NAMES[id] ?? id;
}

/**
 * List editor for panel visibility/order, startup and width. Keys the shell
 * would treat as navigation or filtering are handled here first.
 */
export function createSettingsPanel(options: SettingsOptions): Component {
  const original = options.panels.map((panel) => panel.id);
  const draft: SettingsDraft = {
    panels: options.panels.map((panel) => ({ ...panel })),
    startup: options.startup,
    width: sidebarWidth(options.width),
  };
  const visible = new Map(options.panels.map((p) => [p.id, p.visible]));
  const row = (id: string, label: string, dirty: boolean): ListEditorRow => ({
    id,
    label,
    dirty,
  });
  const rows = (): ListEditorRow[] => [
    ...draft.panels.map((panel, index) =>
      row(
        `panel:${panel.id}`,
        `${panel.visible ? '[x]' : '[ ]'} ${panelName(panel.id)}${options.unavailable?.(panel.id) ? ' (unavailable)' : ''}`,
        original[index] !== panel.id || visible.get(panel.id) !== panel.visible,
      ),
    ),
    row(
      'startup',
      `Startup  ‹ ${draft.startup} ›`,
      draft.startup !== options.startup,
    ),
    row(
      'width',
      `Width    ‹ ${draft.width} ›`,
      draft.width !== sidebarWidth(options.width),
    ),
  ];
  const editor = createListEditor({
    overview: {
      title: 'Sidebar settings',
      rows,
      hints:
        'Space toggle · Shift+↑/↓ move · ←/→ change · Enter save · Esc cancel',
    },
    theme: options.theme,
    maxHeight: options.maxHeight,
    requestRender: options.requestRender,
    onSave: () => {
      try {
        options.save({
          panels: draft.panels.map((panel) => ({ ...panel })),
          startup: draft.startup,
          width: draft.width,
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
  const move = (delta: -1 | 1) => {
    const index = editor.getState().selectedIndex;
    const target = index + delta;
    if (
      index >= draft.panels.length ||
      target < 0 ||
      target >= draft.panels.length
    )
      return;
    [draft.panels[index], draft.panels[target]] = [
      draft.panels[target],
      draft.panels[index],
    ];
    // The cursor follows the moved row through the shell's own navigation.
    editor.handleInput(delta < 0 ? '\u001b[A' : '\u001b[B');
  };
  const step = (delta: number) => {
    const id = rows()[editor.getState().selectedIndex]?.id;
    if (id === 'startup') {
      const at = STARTUPS.indexOf(draft.startup);
      draft.startup =
        STARTUPS[(at + Math.sign(delta) + STARTUPS.length) % STARTUPS.length];
    } else if (id === 'width') {
      draft.width = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, draft.width + delta),
      );
    } else return;
    editor.invalidate();
  };
  return {
    render: (width) => editor.render(width),
    invalidate: () => editor.invalidate(),
    handleInput(data) {
      if (matchesKey(data, 'shift+up')) return move(-1);
      if (matchesKey(data, 'shift+down')) return move(1);
      if (matchesKey(data, 'shift+left')) return step(-4);
      if (matchesKey(data, 'shift+right')) return step(4);
      const key = normalizePanelKey(data);
      if (key === 'space') {
        const panel = draft.panels[editor.getState().selectedIndex];
        if (panel) panel.visible = !panel.visible;
        editor.invalidate();
      } else if (key === 'left') step(-1);
      else if (key === 'right') step(1);
      else if (key === 'enter') editor.handleInput('s');
      else if (key === 'escape' || key === 'q') {
        options.onDone(false);
      } else editor.handleInput(data);
    },
  };
}

export function openSettings(
  ctx: Pick<ExtensionContext, 'ui'>,
  options: Omit<
    SettingsOptions,
    'onDone' | 'theme' | 'maxHeight' | 'requestRender'
  >,
): Promise<boolean> {
  return openPanelOverlay<boolean>(ctx, (_tui, theme, _keys, close, host) =>
    createSettingsPanel({
      ...options,
      theme,
      maxHeight: host.maxHeight,
      requestRender: host.requestRender,
      onDone: close,
    }),
  );
}
