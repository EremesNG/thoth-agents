import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { loadConfig } from './shared/config.ts';
import { registerStatusLine } from './status-line/index.ts';
import { applyImageCapability } from './tools/image-capability.ts';
import { registerTools } from './tools/index.ts';
import { registerWelcome } from './welcome/index.ts';

export default function thothTheme(pi: ExtensionAPI): void {
  const config = loadConfig();
  if (config.tools.enabled) registerTools(pi, config);

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

    if (!ctx.hasUI || !ctx.ui) return;
    if (config.statusLine.enabled) registerStatusLine(pi, ctx, config);
    if (config.welcome.enabled) registerWelcome(pi, ctx, config);
  });
}
