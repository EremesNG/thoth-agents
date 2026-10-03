import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { loadConfig } from './shared/config.ts';
import { registerStatusLine } from './status-line/index.ts';
import { registerTools } from './tools/index.ts';
import { registerWelcome } from './welcome/index.ts';

export default function thothTheme(pi: ExtensionAPI): void {
  const config = loadConfig();
  if (config.tools.enabled) registerTools(pi, config);

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI || !ctx.ui) return;
    if (config.statusLine.enabled) registerStatusLine(pi, ctx, config);
    if (config.welcome.enabled) registerWelcome(pi, ctx, config);
  });
}
