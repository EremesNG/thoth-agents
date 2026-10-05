import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  type RenderKitToken,
  registerRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createRenderKit } from './render-kit/index.ts';
import { loadConfig } from './shared/config.ts';
import { registerStatusLine } from './status-line/index.ts';
import { applyImageCapability } from './tools/image-capability.ts';
import { createToolRendererResolver, registerTools } from './tools/index.ts';
import { registerWelcome } from './welcome/index.ts';

export default function thothTheme(pi: ExtensionAPI): void {
  const config = loadConfig();
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

  if (config.images.enabled) {
    // Native /reload resets overrides after session_start. agent_start is
    // awaited before messages/tools, once per loop (including continuations).
    pi.on('agent_start', () => {
      applyImageCapability();
    });
  }

  pi.on('session_start', (_event, ctx) => {
    // Pi replaces capability overrides after loading extensions.
    if (config.images.enabled) applyImageCapability();

    if (!ctx.hasUI) return;
    if (config.tools.enabled) {
      kitToken = registerRenderKit(
        createRenderKit(owner, resolveToolRenderers),
        owner,
      );
    }
    if (!ctx.ui) return;
    if (config.statusLine.enabled) {
      if (config.inputBox?.enabled !== false) {
        ctx.ui.setWorkingIndicator?.({
          frames: ['△', '◭', '▲', '◮'],
          intervalMs: 200,
        });
        ctx.ui.setWorkingMessage?.('working…');
      }
      registerStatusLine(pi, ctx, config);
    }
    if (config.welcome.enabled) registerWelcome(pi, ctx, config);
  });
}
