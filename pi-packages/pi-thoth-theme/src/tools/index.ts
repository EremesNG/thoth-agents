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
  createReadToolDefinition,
  createWriteToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { createCustomBashTool } from './bash.ts';
import { createCustomEditTool } from './edit.ts';
import { createCustomFindTool } from './find.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';
import { createCustomReadTool } from './read.ts';
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
  createLsToolDefinition: typeof createLsToolDefinition;
  createGrepToolDefinition: typeof createGrepToolDefinition;
  createFindToolDefinition: typeof createFindToolDefinition;
  createEditToolDefinition: typeof createEditToolDefinition;
  createWriteToolDefinition: typeof createWriteToolDefinition;
}

export function registerTools(
  pi: ExtensionAPI,
  config: ThemeConfig,
  cwd = process.cwd(),
  factories: ToolFactories = {
    createReadToolDefinition,
    createBashToolDefinition,
    createLsToolDefinition,
    createGrepToolDefinition,
    createFindToolDefinition,
    createEditToolDefinition,
    createWriteToolDefinition,
  },
): void {
  register(
    pi,
    createCustomReadTool(cwd, config, factories.createReadToolDefinition(cwd)),
  );
  register(
    pi,
    createCustomBashTool(cwd, config, factories.createBashToolDefinition(cwd)),
  );
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
}
export type { ToolRenderResultOptions };
