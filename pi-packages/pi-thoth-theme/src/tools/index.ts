import type {
  ExtensionAPI,
  ToolRenderers,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { createCustomBashTool } from './bash.ts';
import { createCustomEditTool } from './edit.ts';
import { createCustomFindTool } from './find.ts';
import { createGenericTool } from './generic.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';
import { createOwnershipResolver } from './ownership.ts';
import { createCustomPowerShellTool } from './powershell.ts';
import { createCustomReadTool } from './read.ts';
import { stopAllElapsedTickers } from './ticker.ts';
import { createCustomWriteTool } from './write.ts';

/** Register themed renderers and return an idempotent ticker/subscription disposer. */
export function registerTools(
  pi: ExtensionAPI,
  config: ThemeConfig,
  cwd = process.cwd(),
): () => void {
  if (!config.tools.enabled || typeof pi?.registerToolRenderer !== 'function') {
    return () => {};
  }

  const renderers = new Map<string, ToolRenderers>([
    ['read', createCustomReadTool(cwd, config)],
    ['bash', createCustomBashTool(cwd, config)],
    ['powershell', createCustomPowerShellTool(cwd, config)],
    ['ls', createCustomLsTool(cwd, config)],
    ['grep', createCustomGrepTool(cwd, config)],
    ['find', createCustomFindTool(cwd, config)],
    ['edit', createCustomEditTool(cwd, config)],
    ['write', createCustomWriteTool(cwd, config)],
  ]);

  const genericRenderers = new Map<string, ToolRenderers>();
  const isOwnedBaseDir = createOwnershipResolver();

  // Tools absent from the registry cannot be attributed and keep respecting
  // their downstream renderers; registered tools are respected only when a
  // thoth-agents package owns them. Read at each resolution so replacements
  // by another package are honored.
  const canRespectDownstream = (toolName: string): boolean => {
    const tool =
      typeof pi.getAllTools === 'function'
        ? pi.getAllTools().find((t) => t.name === toolName)
        : undefined;
    if (!tool) return true;
    const baseDir = tool.sourceInfo?.baseDir;
    return baseDir ? isOwnedBaseDir(baseDir) : false;
  };

  pi.registerToolRenderer((toolName, next) => {
    // Built-ins take precedence over Pi 1.0.1's native callbacks.
    const builtIn = renderers.get(toolName);
    if (builtIn) return builtIn;

    // Respect thoth-owned tools (subagents, task logs) that bring their own renderers.
    const downstream = next();
    if (
      (downstream?.renderCall || downstream?.renderResult) &&
      canRespectDownstream(toolName)
    ) {
      return downstream;
    }

    let generic = genericRenderers.get(toolName);
    if (!generic) {
      generic = createGenericTool(toolName, config);
      genericRenderers.set(toolName, generic);
    }
    return generic;
  });

  const unsubs: Array<() => void> = [];
  if (typeof pi?.on === 'function') {
    unsubs.push(pi.on('agent_end', stopAllElapsedTickers));
    unsubs.push(pi.on('session_shutdown', stopAllElapsedTickers));
    unsubs.push(pi.on('session_start', stopAllElapsedTickers));
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    stopAllElapsedTickers();
    for (const unsub of unsubs) unsub();
    unsubs.length = 0;
  };
}
export type { ToolRenderResultOptions };
