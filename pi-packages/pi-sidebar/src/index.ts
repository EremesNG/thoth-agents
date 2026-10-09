import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { SidebarSession } from './session.js';

const WIDGET = 'thoth-sidebar-lifecycle';

export default function sidebar(pi: ExtensionAPI): void {
  let session: SidebarSession | undefined;
  let owner: ExtensionContext | undefined;
  const dispose = () => {
    session?.dispose();
    session = undefined;
    owner?.ui.setWidget(WIDGET, undefined);
    owner = undefined;
  };
  pi.on('session_start', (_event, ctx) => {
    dispose();
    if (ctx.mode !== 'tui' || !ctx.hasUI) return;
    owner = ctx;
    // A zero-row widget gives us Pi's stable renderer reference and a render-time
    // viewport observer without replacing the editor, footer or transcript.
    ctx.ui.setWidget(
      WIDGET,
      (tui, theme) => {
        const active = new SidebarSession(pi, ctx, tui, theme);
        session = active;
        return {
          render: () => {
            active.sync();
            return [];
          },
          invalidate() {},
          dispose: () => active.dispose(),
        };
      },
      { placement: 'belowEditor' },
    );
  });
  pi.on('session_shutdown', dispose);
  pi.on('turn_end', (_event, ctx) => session?.refresh(ctx, true));
  pi.on('tool_result', (event, ctx) => {
    session?.refresh(
      ctx,
      ['write', 'edit', 'bash', 'powershell'].includes(event.toolName),
    );
  });
  pi.on('model_select', (_event, ctx) => session?.refresh(ctx));
  pi.registerCommand('sidebar', {
    description:
      'Toggle sidebar; auto/manual/on/off; panels show/hide/up/down <id>; startup auto/manual/off',
    handler: async (args, ctx) => {
      if (!session) {
        if (ctx.hasUI)
          ctx.ui.notify(
            'Sidebar is available only in an interactive TUI session.',
            'info',
          );
        return;
      }
      session.command(args, ctx);
    },
  });
  pi.registerShortcut('ctrl+shift+r', {
    description: 'Resize sidebar (arrows, Shift 4, Enter confirm, Esc revert)',
    handler: async (ctx) => session?.beginResize(ctx),
  });
}
