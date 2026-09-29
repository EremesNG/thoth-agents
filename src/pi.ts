import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { findPackageRoot } from './cli/package-root';
import {
  type PiModelSaveResult,
  type PiModelSnapshot,
  readPiModelConfig,
  savePiModelConfig,
} from './cli/pi-model-config';
import { syncPiSpecialists } from './cli/pi-resources';
import { renderPiRootInstructions } from './harness/adapters/pi';
import { PI_ROOT_END, PI_ROOT_START } from './harness/writers/pi-agent';
import {
  createModelsPanel,
  type ModelsPanelCatalogModel,
  type ModelsPanelTheme,
  type PanelKey,
} from './pi/models-panel';

type PiHandler = (event: Record<string, unknown>, context?: unknown) => unknown;

interface PiModel {
  provider: string;
  id: string;
  name?: string;
}
interface PiModelsCommandContext {
  mode: string;
  ui: {
    notify(message: string, type?: 'info' | 'warning' | 'error'): void;
    custom<T>(
      factory: (
        tui: { requestRender(): void },
        theme: unknown,
        keybindings: unknown,
        done: (result: T) => void,
      ) => {
        render(width: number): string[];
        invalidate(): void;
        handleInput(data: string): void;
      },
    ): Promise<T>;
  };
  modelRegistry: { getAll(): PiModel[] };
}
interface PiNativeModules {
  matchesKey(data: string, key: string): boolean;
  truncateToWidth(text: string, width: number): string;
  visibleWidth(text: string): number;
  keys: Record<PanelKey, string>;
  getSupportedThinkingLevels(model: PiModel): readonly string[];
}

export interface PiExtensionApi {
  on(event: 'before_agent_start' | 'session_start', handler: PiHandler): void;
  registerCommand?(
    name: string,
    command: {
      description: string;
      handler(
        args: string | undefined,
        context: PiModelsCommandContext,
      ): unknown;
    },
  ): void;
}
export interface PiExtensionOptions {
  packageRoot?: string;
  piRoot?: string;
  /** Public seams used by focused tests; production uses the accepted services. */
  readModelConfig?: typeof readPiModelConfig;
  saveModelConfig?: typeof savePiModelConfig;
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
    getSupportedThinkingLevels: (model) =>
      getSupportedThinkingLevels(
        model as Parameters<typeof getSupportedThinkingLevels>[0],
      ),
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
  // j0k3r SDK children run in-process and expose no child marker. Activation
  // only registers callbacks; session_resources: "lean" must filter these two
  // root lifecycle hooks from Thoth children before their root-only work can run.
  pi.registerCommand?.('thoth-agents:models', {
    description: 'Edit global Thoth specialist models',
    handler: async (_args, ctx) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify(
          '/thoth-agents:models requires interactive TUI mode; no files were changed.',
          'error',
        );
        return;
      }
      try {
        const [native, snapshot] = await Promise.all([
          (options.loadNativeModules ?? loadPiNativeModules)(),
          Promise.resolve(
            (options.readModelConfig ?? readPiModelConfig)(
              globalPiRoot(options),
            ),
          ),
        ]);
        const catalog: ModelsPanelCatalogModel[] = ctx.modelRegistry
          .getAll()
          .map((model) => ({
            provider: model.provider,
            id: model.id,
            name: model.name,
            supportedEfforts: [...native.getSupportedThinkingLevels(model)],
          }));
        const result = await ctx.ui.custom<
          { kind: 'cancelled' } | { kind: 'saved'; changedRoles: string[] }
        >((tui, theme, _keybindings, done) =>
          createModelsPanel({
            snapshot,
            catalog,
            save: (current: PiModelSnapshot, draft): PiModelSaveResult =>
              (options.saveModelConfig ?? savePiModelConfig)(current, draft),
            onDone: done,
            requestRender: () => tui.requestRender(),
            matchesKey: (data, key) =>
              native.matchesKey(data, native.keys[key]),
            truncate: native.truncateToWidth,
            visibleWidth: native.visibleWidth,
            theme: theme as ModelsPanelTheme,
          }),
        );
        if (result.kind === 'saved') {
          const detail =
            result.changedRoles.length > 0
              ? ` Updated: ${result.changedRoles.join(', ')}.`
              : ' No file content changed.';
          ctx.ui.notify(
            `Saved global Thoth specialist models.${detail} Saved settings apply on subsequent specialist discovery; running children and the ambient root are unchanged. Native settings or project definitions may override them.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          `Unable to open global specialist models: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  });
  pi.on('before_agent_start', (event) => ({
    systemPrompt: injectPiRoot(
      typeof event.systemPrompt === 'string' ? event.systemPrompt : '',
    ),
  }));
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
