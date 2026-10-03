import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Key,
  matchesKey,
  type OverlayOptions,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { findPackageRoot } from './cli/package-root';
import { syncPiSpecialists } from './cli/pi-resources';
import {
  type PiToolConfigSnapshot,
  type PiToolSaveResult,
  readPiToolConfig,
  savePiToolConfig,
} from './cli/pi-tool-config';
import { renderPiRootInstructions } from './harness/adapters/pi';
import { PI_ROOT_END, PI_ROOT_START } from './harness/writers/pi-agent';
import {
  createToolsPanel,
  type ToolsPanelDiscoveredTool,
  type ToolsPanelKey,
  type ToolsPanelTheme,
} from './pi/tools-panel';

type PiHandler = (event: Record<string, unknown>, context?: unknown) => unknown;

interface PiCommandContext {
  mode: string;
  ui: {
    notify(message: string, type?: 'info' | 'warning' | 'error'): void;
    custom<T>(
      factory: (
        tui: { requestRender(): void; terminal: { rows: number } },
        theme: unknown,
        keybindings: unknown,
        done: (result: T) => void,
      ) => {
        render(width: number): string[];
        invalidate(): void;
        handleInput(data: string): void;
      },
      options?: { overlay?: boolean; overlayOptions?: OverlayOptions },
    ): Promise<T>;
  };
}
interface PiNativeModules {
  matchesKey(data: string, key: string): boolean;
  truncateToWidth(text: string, width: number): string;
  visibleWidth(text: string): number;
  keys: Record<ToolsPanelKey, string>;
}

export interface PiExtensionApi {
  on(event: 'before_agent_start' | 'session_start', handler: PiHandler): void;
  registerCommand?(
    name: string,
    command: {
      description: string;
      handler(args: string | undefined, context: PiCommandContext): unknown;
    },
  ): void;
  getAllTools?(): Array<{ name: string; description?: string }>;
  getActiveTools?(): string[];
}
export interface PiExtensionOptions {
  packageRoot?: string;
  piRoot?: string;
  readToolConfig?: typeof readPiToolConfig;
  saveToolConfig?: typeof savePiToolConfig;
  loadNativeModules?: () => Promise<PiNativeModules>;
}

function withoutRootBlock(prompt: string): string {
  const start = prompt.indexOf(PI_ROOT_START);
  const end = prompt.indexOf(PI_ROOT_END, start + PI_ROOT_START.length);
  if (start < 0 || end < 0) return prompt.trimEnd();
  return `${prompt.slice(0, start)}${prompt.slice(end + PI_ROOT_END.length)}`.trimEnd();
}

export function injectPiRoot(systemPrompt: string): string {
  const hostPrompt = withoutRootBlock(systemPrompt);
  return [hostPrompt, renderPiRootInstructions()].filter(Boolean).join('\n\n');
}

async function loadPiNativeModules(): Promise<PiNativeModules> {
  // Static peer imports allow Pi's loader to resolve its native aliases even
  // for the compiled JavaScript entrypoint. These modules stay external.
  return {
    matchesKey: (data, key) =>
      matchesKey(data, key as Parameters<typeof matchesKey>[1]),
    truncateToWidth,
    visibleWidth,
    keys: Key,
  };
}

function globalPiRoot(options: PiExtensionOptions): string {
  return (
    options.piRoot ??
    process.env.PI_CODING_AGENT_DIR?.trim() ??
    join(homedir(), '.pi', 'agent')
  );
}

export default function thothAgentsPiExtension(
  pi: PiExtensionApi,
  options: PiExtensionOptions = {},
): void {
  // @thoth-agents/pi-subagents SDK children run in-process and expose no child marker. Activation
  // only registers callbacks; session_resources: "lean" must filter these two
  // root lifecycle hooks from Thoth children before their root-only work can run.
  pi.registerCommand?.('subagents-tools', {
    description: 'Edit global Thoth specialist tools',
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
        const [native, snapshot] = await Promise.all([
          (options.loadNativeModules ?? loadPiNativeModules)(),
          Promise.resolve(
            (options.readToolConfig ?? readPiToolConfig)(globalPiRoot(options)),
          ),
        ]);
        const allTools = pi.getAllTools();
        const activeTools = new Set(pi.getActiveTools());
        const discoveredTools: ToolsPanelDiscoveredTool[] = allTools.map(
          (tool) => ({
            name: tool.name,
            description: tool.description,
            active: activeTools.has(tool.name),
          }),
        );
        const result = await ctx.ui.custom<
          { kind: 'cancelled' } | { kind: 'saved'; changedRoles: string[] }
        >(
          (tui, theme, _keybindings, done) =>
            createToolsPanel({
              snapshot,
              discoveredTools,
              save: (current: PiToolConfigSnapshot, draft): PiToolSaveResult =>
                (options.saveToolConfig ?? savePiToolConfig)(current, draft),
              onDone: done,
              requestRender: () => tui.requestRender(),
              // Match the overlay's 90% cap on every render, including resize.
              maxHeight: () =>
                Math.max(1, Math.floor((tui.terminal.rows * 90) / 100)),
              matchesKey: (data, key) =>
                native.matchesKey(data, native.keys[key]),
              truncate: native.truncateToWidth,
              visibleWidth: native.visibleWidth,
              theme: theme as ToolsPanelTheme,
            }),
          {
            overlay: true,
            overlayOptions: {
              anchor: 'center',
              width: '96%',
              maxHeight: '90%',
              minWidth: 96,
            },
          },
        );
        if (result.kind === 'saved') {
          const detail =
            result.changedRoles.length > 0
              ? ` Updated: ${result.changedRoles.join(', ')}.`
              : ' No file content changed.';
          ctx.ui.notify(
            `Saved global Thoth specialist tools.${detail} Saved settings apply on subsequent specialist discovery; running children and the ambient root are unchanged. Native settings or project definitions may override them.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          `Unable to open global specialist tools: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  });
  pi.on('before_agent_start', (event) => {
    if (
      event.systemPromptOptions &&
      typeof event.systemPromptOptions === 'object'
    ) {
      const promptOptions = event.systemPromptOptions as {
        appendSystemPrompt?: string;
      };
      const rootBlock = renderPiRootInstructions();
      const append = promptOptions.appendSystemPrompt ?? '';
      if (!append.includes(rootBlock)) {
        promptOptions.appendSystemPrompt = [append, rootBlock]
          .filter(Boolean)
          .join('\n\n');
      }
      return;
    }
    // Older Pi versions lack mutable prompt options, so retain forced-prompt injection.
    return {
      systemPrompt: injectPiRoot(
        typeof event.systemPrompt === 'string' ? event.systemPrompt : '',
      ),
    };
  });
  pi.on('session_start', () => {
    try {
      const packageRoot =
        options.packageRoot ??
        findPackageRoot(dirname(fileURLToPath(import.meta.url)));
      if (!packageRoot) return;
      syncPiSpecialists({
        packageRoot,
        piRoot: globalPiRoot(options),
      });
    } catch {
      // A direct package install may be degraded; never reject a valid Pi session.
    }
  });
}
