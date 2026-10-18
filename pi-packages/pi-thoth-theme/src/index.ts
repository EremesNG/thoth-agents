import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import {
  type RenderKitToken,
  registerRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createRenderKit } from './render-kit/index.ts';
import { loadConfig } from './shared/config.ts';
import { frames, icon } from './shared/icons.ts';
import { registerStatusLine } from './status-line/index.ts';
import { createToolRendererResolver, registerTools } from './tools/index.ts';
import { registerWelcome } from './welcome/index.ts';

export default function thothTheme(pi: ExtensionAPI): void {
  const config = loadConfig();
  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType !== 'user' || !markdown.trim()) return markdown;
    if (
      /^╭── [\uF007●@] user ─+╮\r?\n\r?\n[\s\S]*\r?\n\r?\n╰─+╯$/.test(markdown)
    )
      return markdown;
    const width = context.availableWidth;
    const title = `╭── ${icon('user', config.icons)} user `;
    const titleWidth = visibleWidth(title);
    // Pi supplies content width after horizontal padding. Skip unknown/narrow
    // widths rather than wrapping the title; require one fill cell and a corner.
    if (!Number.isInteger(width) || width < titleWidth + 2) return markdown;
    // Box-drawing characters are plain Markdown text, not rules or list markers.
    const top = `${title}${'─'.repeat(width - titleWidth - 1)}╮`;
    const bottom = `╰${'─'.repeat(width - 2)}╯`;
    return `${top}\n\n${markdown}\n\n${bottom}`;
  });
  const owner = {};
  const cwd = process.cwd();
  const resolveToolRenderers = config.tools.enabled
    ? createToolRendererResolver(pi, config, cwd)
    : undefined;
  let kitToken: RenderKitToken | undefined;
  if (resolveToolRenderers) {
    registerTools(pi, config, cwd, owner, resolveToolRenderers);
  }

  pi.on('session_shutdown', (_event, ctx) => {
    if (!ctx.hasUI || kitToken === undefined) return;
    withdrawRenderKit(kitToken);
    kitToken = undefined;
  });

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (config.tools.enabled) {
      kitToken = registerRenderKit(
        createRenderKit(owner, resolveToolRenderers, config.icons),
        owner,
      );
    }
    if (!ctx.ui) return;
    if (config.statusLine.enabled) {
      if (config.inputBox?.enabled !== false) {
        ctx.ui.setWorkingIndicator?.({
          frames: [...frames('workingFrames', config.icons)],
          intervalMs: 200,
        });
        ctx.ui.setWorkingMessage?.(`working${icon('ellipsis', config.icons)}`);
      }
      registerStatusLine(pi, ctx, config);
    }
    if (config.welcome.enabled) registerWelcome(pi, ctx, config);
  });
}
