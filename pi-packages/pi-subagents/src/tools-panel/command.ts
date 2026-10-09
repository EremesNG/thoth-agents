import type {
  ExtensionCommandContext,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { openPanelOverlay } from '@thoth-agents/pi-core/panel';
import { readToolsConfig, saveToolsConfig } from './config.js';
import { createToolsPanel, type ToolsPanelResult } from './panel.js';
import { publishToolsPanelCapability } from './registry.js';

interface ToolsCommandApi {
  registerCommand?(
    name: string,
    command: {
      description: string;
      handler(
        args: string,
        ctx: Pick<ExtensionCommandContext, 'cwd' | 'mode' | 'ui'>,
      ): Promise<void>;
    },
  ): void;
  getAllTools?(): Array<{ name: string; description?: string }>;
  getActiveTools?(): string[];
  getCommands?(): Array<{ name: string; source?: string }>;
}

export function registerToolsCommand(
  pi: ToolsCommandApi,
  options: {
    read?: typeof readToolsConfig;
    save?: typeof saveToolsConfig;
  } = {},
): (ctx: Pick<ExtensionContext, 'ui'>) => void {
  if (typeof pi.registerCommand !== 'function') return () => {};
  pi.registerCommand('subagents-tools', {
    description: 'Edit subagent definition tools',
    handler: async (_args, ctx) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify(
          '/subagents-tools requires interactive TUI mode; no files were changed.',
          'error',
        );
        return;
      }
      if (
        typeof pi.getAllTools !== 'function' ||
        typeof pi.getActiveTools !== 'function'
      ) {
        ctx.ui.notify(
          'Tool discovery is unavailable in this Pi environment; no files were changed.',
          'error',
        );
        return;
      }
      try {
        const snapshot = (options.read ?? readToolsConfig)(
          ctx.cwd ?? process.cwd(),
        );
        const active = new Set(pi.getActiveTools());
        const discoveredTools = pi
          .getAllTools()
          .map((tool: { name: string; description?: string }) => ({
            ...tool,
            active: active.has(tool.name),
          }));
        const result = await openPanelOverlay<ToolsPanelResult>(
          ctx,
          (_tui, theme, _keys, done, host) =>
            createToolsPanel({
              snapshot,
              discoveredTools,
              save: options.save ?? saveToolsConfig,
              onDone: done,
              theme,
              ...host,
            }),
        );
        if (result.kind === 'saved') {
          const detail = result.changedRoles.length
            ? ` Updated: ${result.changedRoles.join(', ')}.`
            : ' No file content changed.';
          ctx.ui.notify(
            `Saved subagent definition tools.${detail} Saved settings apply on subsequent specialist discovery; running children and the ambient root are unchanged. Native settings or project definitions may override them.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          `Unable to open subagent tools: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  });
  publishToolsPanelCapability();
  let warned = false;
  // Join the extension's existing session hook without changing lifecycle order.
  return (ctx) => {
    if (warned || typeof pi.getCommands !== 'function') return;
    // Pi 1.0.2 exposes duplicate names as command:1, command:2 (not the raw name).
    const owners = pi
      .getCommands()
      .filter(
        (command: { name: string; source?: string }) =>
          (!command.source || command.source === 'extension') &&
          /^subagents-tools(?::\d+)?$/.test(command.name),
      );
    if (owners.length < 2 || typeof ctx?.ui?.notify !== 'function') return;
    warned = true;
    ctx.ui.notify(
      'Duplicate /subagents-tools owners detected. Upgrade thoth-agents and @thoth-agents/pi-subagents (>=0.3.0) together, then /reload; the command now belongs to pi-subagents.',
      'warning',
    );
  };
}
