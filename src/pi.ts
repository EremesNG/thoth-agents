import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from './cli/package-root';
import { syncPiSpecialists } from './cli/pi-resources';
import { createPiToolsPanelAdapter } from './cli/pi-tool-config';
import { renderPiRootInstructions } from './harness/adapters/pi';
import { PI_ROOT_END, PI_ROOT_START } from './harness/writers/pi-agent';
import {
  PiContextGateVerdicts,
  withPiContextGateVerdicts,
  withPiToolGateVerdicts,
} from './pi-gate-verdict';

type PiHandler = (
  event: Record<string, unknown>,
  context?: {
    cwd?: string;
    sessionManager?: {
      getEntries?(): Iterable<unknown>;
      getBranch?(): Iterable<unknown>;
    };
    isIdle?(): boolean;
    ui?: { notify(message: string, type?: 'info' | 'warning' | 'error'): void };
  },
) => unknown;

export interface PiExtensionApi {
  on(
    event:
      | 'input'
      | 'before_agent_start'
      | 'session_start'
      | 'session_tree'
      | 'tool_result'
      | 'context',
    handler: PiHandler,
  ): void;
  registerCommand?(
    name: string,
    command: {
      description: string;
      handler(args: string | undefined, context: unknown): unknown;
    },
  ): void;
  getCommands?(): Array<{ name: string; source?: string }>;
  appendEntry?(customType: string, data: unknown): void;
}
export interface PiExtensionOptions {
  packageRoot?: string;
  piRoot?: string;
}

// pi-subagents owns this structural protocol. Avoid a build-time runtime dependency.
const toolsRegistryKey = Symbol.for('thoth-agents.pi-subagents.tools-panel.v1');
interface ToolsRegistry {
  version: 1;
  adapter?: ReturnType<typeof createPiToolsPanelAdapter>;
  capability?: { version: number; command: string };
}
const shared = globalThis as typeof globalThis & {
  [toolsRegistryKey]?: unknown;
};
function toolsRegistry(): ToolsRegistry | undefined {
  try {
    const registry = shared[toolsRegistryKey] as ToolsRegistry | undefined;
    return registry?.version === 1 ? registry : undefined;
  } catch {
    return undefined;
  }
}

function hasToolsOwnership(pi: PiExtensionApi): boolean {
  const capability = toolsRegistry()?.capability;
  if (capability?.version !== 1 || capability.command !== 'subagents-tools')
    return false;
  // The process-wide marker can outlive an extension reload. When the host
  // exposes commands, verify that an invocation still exists in this session.
  if (typeof pi.getCommands !== 'function') return true;
  try {
    return pi
      .getCommands()
      .some(
        (command) =>
          (!command.source || command.source === 'extension') &&
          /^subagents-tools(?::\d+)?$/.test(command.name),
      );
  } catch {
    return true;
  }
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
  // only registers callbacks; session_resources: "lean" must filter these
  // root lifecycle hooks from Thoth children before their root-only work can run.
  shared[toolsRegistryKey] = {
    ...toolsRegistry(),
    version: 1,
    adapter: createPiToolsPanelAdapter(globalPiRoot(options)),
  };
  let toolsOwnershipWarned = false;
  const frozenGateVerdicts = new PiContextGateVerdicts(
    pi.appendEntry?.bind(pi),
  );
  const restoreGateVerdicts = (
    ctx: Parameters<PiHandler>[1],
    sourceSessionFile?: string,
  ) => {
    frozenGateVerdicts.useSession(ctx?.sessionManager);
    // A verdict belongs to a completion, not the active branch. Tree navigation
    // can put its persistence entry off-branch while retaining the completion.
    frozenGateVerdicts.restore(
      ctx?.sessionManager?.getEntries?.() ??
        ctx?.sessionManager?.getBranch?.() ??
        [],
      sourceSessionFile,
    );
  };
  pi.on('tool_result', (event, ctx) =>
    withPiToolGateVerdicts(event, ctx?.cwd ?? process.cwd()),
  );
  pi.on('context', (event, ctx) => {
    frozenGateVerdicts.useSession(ctx?.sessionManager);
    return withPiContextGateVerdicts(
      event,
      ctx?.cwd ?? process.cwd(),
      frozenGateVerdicts,
      ctx?.sessionManager?.getBranch?.() ??
        ctx?.sessionManager?.getEntries?.() ??
        [],
    );
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
  pi.on('session_start', (event, ctx) => {
    restoreGateVerdicts(
      ctx,
      typeof event.previousSessionFile === 'string'
        ? event.previousSessionFile
        : undefined,
    );
    if (!toolsOwnershipWarned && !hasToolsOwnership(pi) && ctx?.ui?.notify) {
      toolsOwnershipWarned = true;
      ctx.ui.notify(
        '/subagents-tools requires @thoth-agents/pi-subagents >=0.3.0. Upgrade thoth-agents and pi-subagents together, then /reload.',
        'warning',
      );
    }
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
  pi.on('session_tree', (_event, ctx) => restoreGateVerdicts(ctx));
}
