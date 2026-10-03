import type {
  ExtensionAPI,
  ToolDefinition,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createPowerShellToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { createCustomBashTool } from './bash.ts';
import { createCustomEditTool } from './edit.ts';
import { createCustomFindTool } from './find.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';
import { createCustomPowerShellTool } from './powershell.ts';
import { createCustomReadTool } from './read.ts';
import { stopAllElapsedTickers } from './ticker.ts';
import { createCustomWriteTool } from './write.ts';

// biome-ignore lint/suspicious/noExplicitAny: generic register helper
function register<T extends ToolDefinition<any, any, any>>(
  pi: ExtensionAPI,
  def: T,
): void {
  if (typeof pi?.registerTool === 'function') {
    (pi.registerTool as unknown as (tool: T) => void)(def);
  }
}

export interface ToolFactories {
  createReadToolDefinition: typeof createReadToolDefinition;
  createBashToolDefinition: typeof createBashToolDefinition;
  createPowerShellToolDefinition?: typeof createPowerShellToolDefinition;
  createLsToolDefinition: typeof createLsToolDefinition;
  createGrepToolDefinition: typeof createGrepToolDefinition;
  createFindToolDefinition: typeof createFindToolDefinition;
  createEditToolDefinition: typeof createEditToolDefinition;
  createWriteToolDefinition: typeof createWriteToolDefinition;
}

/** Register themed tools and return an idempotent ticker/subscription disposer. */
export function registerTools(
  pi: ExtensionAPI,
  config: ThemeConfig,
  cwd = process.cwd(),
  factories: ToolFactories = {
    createReadToolDefinition,
    createBashToolDefinition,
    createPowerShellToolDefinition,
    createLsToolDefinition,
    createGrepToolDefinition,
    createFindToolDefinition,
    createEditToolDefinition,
    createWriteToolDefinition,
  },
): () => void {
  const unsubs: Array<() => void> = [];
  if (typeof pi?.on === 'function') {
    unsubs.push(pi.on('agent_end', stopAllElapsedTickers));
    unsubs.push(pi.on('session_shutdown', stopAllElapsedTickers));
    unsubs.push(pi.on('session_start', stopAllElapsedTickers));
  }

  register(
    pi,
    createCustomReadTool(cwd, config, factories.createReadToolDefinition(cwd)),
  );
  register(
    pi,
    createCustomBashTool(cwd, config, factories.createBashToolDefinition(cwd)),
  );
  if (typeof factories.createPowerShellToolDefinition === 'function') {
    register(
      pi,
      createCustomPowerShellTool(
        cwd,
        config,
        factories.createPowerShellToolDefinition(cwd),
      ),
    );
  }
  register(
    pi,
    createCustomLsTool(cwd, config, factories.createLsToolDefinition(cwd)),
  );
  register(
    pi,
    createCustomGrepTool(cwd, config, factories.createGrepToolDefinition(cwd)),
  );
  register(
    pi,
    createCustomFindTool(cwd, config, factories.createFindToolDefinition(cwd)),
  );
  register(
    pi,
    createCustomEditTool(cwd, config, factories.createEditToolDefinition(cwd)),
  );
  register(
    pi,
    createCustomWriteTool(
      cwd,
      config,
      factories.createWriteToolDefinition(cwd),
    ),
  );

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
