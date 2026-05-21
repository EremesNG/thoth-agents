import path from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';
import type { Event, Model, Part } from '@opencode-ai/sdk';
import { createAgents } from './agents';
import { loadPluginConfig, type TmuxConfig } from './config';
import { renderOpenCodeAgentConfigs } from './harness/adapters/opencode';
import {
  createAutoUpdateCheckerHook,
  createChatHeadersHook,
  createDelegateTaskRetryHook,
  createJsonErrorRecoveryHook,
  createPhaseReminderHook,
  createPostReadNudgeHook,
  createThothMemHook,
  ForegroundFallbackManager,
  syncSkillsOnStartup,
} from './hooks';
import { createBuiltinMcps } from './mcp';
import {
  ast_grep_replace,
  ast_grep_search,
  lsp_diagnostics,
  lsp_find_references,
  lsp_goto_definition,
  lsp_rename,
  setUserLspConfig,
} from './tools';
import { startTmuxCheck } from './utils';
import { log } from './utils/logger';
import { TmuxSessionManager } from './utils/tmux-session-manager';

type SessionContextModel = { providerID: string; modelID: string };

type SessionContext = {
  model?: SessionContextModel;
  variant?: string;
};

function resolveProjectName(project: object, directory: string): string {
  const runtimeProjectName =
    'name' in project && typeof project.name === 'string'
      ? project.name
      : undefined;

  return runtimeProjectName || path.basename(directory) || 'thoth-agents';
}

const ThothAgents: Plugin = async (ctx, _options?: Record<string, unknown>) => {
  const { client, directory, project, $: shell } = ctx;
  const projectName = resolveProjectName(project, directory);
  const sessionContext = new Map<string, SessionContext>();

  const config = loadPluginConfig(directory);
  const agentDefs = createAgents(config);
  const agents = renderOpenCodeAgentConfigs(config);

  // Build a map of agent name → priority model array for runtime fallback.
  // Populated when the user configures model as an array in their plugin config.
  const modelArrayMap: Record<
    string,
    Array<{ id: string; variant?: string }>
  > = {};
  for (const agentDef of agentDefs) {
    if (agentDef._modelArray && agentDef._modelArray.length > 0) {
      modelArrayMap[agentDef.name] = agentDef._modelArray;
    }
  }
  // Build runtime fallback chains for all foreground agents.
  // Each chain is an ordered list of model strings to try when the current
  // model is rate-limited. Seeds from _modelArray entries (when the user
  // configures model as an array), then appends fallback.chains entries.
  const runtimeChains: Record<string, string[]> = {};
  for (const agentDef of agentDefs) {
    if (agentDef._modelArray?.length) {
      runtimeChains[agentDef.name] = agentDef._modelArray.map((m) => m.id);
    }
  }
  if (config.fallback?.enabled !== false) {
    const chains =
      (config.fallback?.chains as Record<string, string[] | undefined>) ?? {};
    for (const [agentName, chainModels] of Object.entries(chains)) {
      if (!chainModels?.length) continue;
      const existing = runtimeChains[agentName] ?? [];
      const seen = new Set(existing);
      for (const m of chainModels) {
        if (!seen.has(m)) {
          seen.add(m);
          existing.push(m);
        }
      }
      runtimeChains[agentName] = existing;
    }
  }

  // Parse tmux config with defaults
  const tmuxConfig: TmuxConfig = {
    enabled: config.tmux?.enabled ?? false,
    layout: config.tmux?.layout ?? 'main-vertical',
    main_pane_size: config.tmux?.main_pane_size ?? 60,
  };

  log('[plugin] initialized with tmux config', {
    tmuxConfig,
    rawTmuxConfig: config.tmux,
    directory,
  });

  try {
    syncSkillsOnStartup();
  } catch (error) {
    console.error('[plugin] Failed to sync bundled skills on startup');
    log('[plugin] Skill sync failed during initialization', error);
  }

  // Start tmux availability check if enabled.
  if (tmuxConfig.enabled) {
    startTmuxCheck();
  }

  // Register built-in MCPs, including thoth_mem.
  const mcps = createBuiltinMcps(config.disabled_mcps, config.thoth);

  // Initialize TmuxSessionManager to handle OpenCode's built-in Task tool sessions
  const tmuxSessionManager = new TmuxSessionManager(ctx, tmuxConfig);

  // Initialize auto-update checker hook
  const autoUpdateChecker = createAutoUpdateCheckerHook(
    ctx,
    {
      showStartupToast: true,
      autoUpdate: true,
    },
    shell,
  );

  // Initialize phase reminder hook for workflow compliance
  const phaseReminderHook = createPhaseReminderHook();

  // Initialize post-read nudge hook
  const postReadNudgeHook = createPostReadNudgeHook();

  const thothMemHook = createThothMemHook({
    project: projectName,
    directory,
    thoth: config.thoth,
    enabled: true,
  });

  const chatHeadersHook = createChatHeadersHook(ctx);

  // Initialize delegate-task retry guidance hook
  const delegateTaskRetryHook = createDelegateTaskRetryHook(ctx);

  // Initialize JSON parse error recovery hook
  const jsonErrorRecoveryHook = createJsonErrorRecoveryHook(ctx);

  // Initialize foreground fallback manager for runtime model switching
  const foregroundFallback = new ForegroundFallbackManager(
    client,
    runtimeChains,
    config.fallback?.enabled !== false && Object.keys(runtimeChains).length > 0,
  );

  // Hook input/output types for thoth-mem integration
  type ThothChatMessageInput = { sessionID: string };
  type ThothChatMessageOutput = {
    parts: Part[];
    message: { summary?: { title?: string; body?: string } };
  };
  type ThothSystemTransformInput = { sessionID?: string; model: Model };
  type ThothSystemTransformOutput = { system: string[] };
  type ThothCompactingInput = { sessionID: string };
  type ThothCompactingOutput = { context: string[]; prompt?: string };
  type ThothToolAfterInput = {
    tool: string;
    sessionID: string;
    callID: string;
    args: unknown;
  };
  type ThothToolAfterOutput = {
    title: string;
    output: string;
    metadata: unknown;
  };

  return {
    name: 'thoth-agents',

    agent: agents,

    tool: {
      lsp_goto_definition,
      lsp_find_references,
      lsp_diagnostics,
      lsp_rename,
      ast_grep_search,
      ast_grep_replace,
    },

    mcp: mcps,

    config: async (opencodeConfig: Record<string, unknown>) => {
      // Set user's lsp config from opencode.json for LSP tools
      const lspConfig = opencodeConfig.lsp as
        | Record<string, unknown>
        | undefined;
      setUserLspConfig(lspConfig);

      // Only set default_agent if not already configured by the user
      // and the plugin config doesn't explicitly disable this behavior
      if (
        config.setDefaultAgent !== false &&
        !(opencodeConfig as { default_agent?: string }).default_agent
      ) {
        (opencodeConfig as { default_agent?: string }).default_agent =
          'orchestrator';
      }

      // Merge Agent configs — per-agent shallow merge to preserve
      // user-supplied fields (e.g. tools, permission) from opencode.json
      if (!opencodeConfig.agent) {
        opencodeConfig.agent = { ...agents };
      } else {
        for (const [name, pluginAgent] of Object.entries(agents)) {
          const existing = (opencodeConfig.agent as Record<string, unknown>)[
            name
          ] as Record<string, unknown> | undefined;
          if (existing) {
            // Shallow merge: plugin defaults first, user overrides win
            (opencodeConfig.agent as Record<string, unknown>)[name] = {
              ...pluginAgent,
              ...existing,
            };
          } else {
            (opencodeConfig.agent as Record<string, unknown>)[name] = {
              ...pluginAgent,
            };
          }
        }
      }
      const configAgent = opencodeConfig.agent as Record<string, unknown>;

      // Model resolution for foreground agents: combine _modelArray entries
      // with fallback.chains config, then pick the first model in the
      // effective array for startup-time selection.
      //
      // Runtime failover on API errors (e.g. rate limits mid-conversation)
      // is handled separately by ForegroundFallbackManager via the event hook.
      const fallbackChainsEnabled = config.fallback?.enabled !== false;
      const fallbackChains = fallbackChainsEnabled
        ? ((config.fallback?.chains as Record<string, string[] | undefined>) ??
          {})
        : {};

      // Build effective model arrays: seed from _modelArray, then append
      // fallback.chains entries so the resolver considers the full chain
      // when picking the best available provider at startup.
      const effectiveArrays: Record<
        string,
        Array<{ id: string; variant?: string }>
      > = {};

      for (const [agentName, models] of Object.entries(modelArrayMap)) {
        effectiveArrays[agentName] = [...models];
      }

      for (const [agentName, chainModels] of Object.entries(fallbackChains)) {
        if (!chainModels || chainModels.length === 0) continue;

        if (!effectiveArrays[agentName]) {
          // Agent has no _modelArray — seed from its current string model so
          // the fallback chain appends after it rather than replacing it.
          const entry = configAgent[agentName] as
            | Record<string, unknown>
            | undefined;
          const currentModel =
            typeof entry?.model === 'string' ? entry.model : undefined;
          effectiveArrays[agentName] = currentModel
            ? [{ id: currentModel }]
            : [];
        }

        const seen = new Set(effectiveArrays[agentName].map((m) => m.id));
        for (const chainModel of chainModels) {
          if (!seen.has(chainModel)) {
            seen.add(chainModel);
            effectiveArrays[agentName].push({ id: chainModel });
          }
        }
      }

      if (Object.keys(effectiveArrays).length > 0) {
        for (const [agentName, modelArray] of Object.entries(effectiveArrays)) {
          if (modelArray.length === 0) continue;

          // Use the first model in the effective array.
          // Not all providers require entries in opencodeConfig.provider —
          // some are loaded automatically by opencode (e.g. github-copilot,
          // openrouter). We cannot distinguish these from truly unconfigured
          // providers at config-hook time, so we cannot gate on the provider
          // config keys. Runtime failover is handled separately by
          // ForegroundFallbackManager.
          const chosen = modelArray[0];
          const entry = configAgent[agentName] as
            | Record<string, unknown>
            | undefined;
          if (entry) {
            entry.model = chosen.id;
            if (chosen.variant) {
              entry.variant = chosen.variant;
            }
          }
          log('[plugin] resolved model from array', {
            agent: agentName,
            model: chosen.id,
            variant: chosen.variant,
          });
        }
      }

      // Merge MCP configs
      const configMcp = opencodeConfig.mcp as
        | Record<string, unknown>
        | undefined;
      if (!configMcp) {
        opencodeConfig.mcp = { ...mcps };
      } else {
        Object.assign(configMcp, mcps);
      }
    },

    event: async (input) => {
      if (input.event.type === 'session.deleted') {
        const deletedEvent = input.event as {
          properties?: { info?: { id?: string }; sessionID?: string };
        };
        const deletedSessionId =
          deletedEvent.properties?.info?.id ??
          deletedEvent.properties?.sessionID;
        if (deletedSessionId) {
          sessionContext.delete(deletedSessionId);
        }
      }

      // Runtime model fallback for foreground agents (rate-limit detection)
      await foregroundFallback.handleEvent(input.event);

      // Handle auto-update checking
      await autoUpdateChecker.event(input);

      await thothMemHook.event(input as { event: Event });

      // Handle tmux pane spawning for OpenCode's Task tool sessions
      await tmuxSessionManager.onSessionCreated(
        input.event as {
          type: string;
          properties?: {
            info?: { id?: string; parentID?: string; title?: string };
          };
        },
      );

      // Handle session.status events for TmuxSessionManager pane cleanup.
      await tmuxSessionManager.onSessionStatus(
        input.event as {
          type: string;
          properties?: { sessionID?: string; status?: { type: string } };
        },
      );

      // Handle session.deleted events for TmuxSessionManager pane cleanup.
      await tmuxSessionManager.onSessionDeleted(
        input.event as {
          type: string;
          properties?: { sessionID?: string };
        },
      );
    },

    'chat.headers': chatHeadersHook['chat.headers'],

    'chat.message': async (input, output) => {
      const chatInput = input as {
        sessionID: string;
        model?: { providerID?: string; modelID?: string };
        variant?: string;
      };

      if (chatInput.sessionID) {
        const previous = sessionContext.get(chatInput.sessionID);
        const context: SessionContext = {
          model: previous?.model,
          variant: previous?.variant,
        };

        if (
          typeof chatInput.model?.providerID === 'string' &&
          typeof chatInput.model?.modelID === 'string'
        ) {
          context.model = {
            providerID: chatInput.model.providerID,
            modelID: chatInput.model.modelID,
          };
        }

        if (typeof chatInput.variant === 'string') {
          context.variant = chatInput.variant;
        }

        sessionContext.set(chatInput.sessionID, context);
      }

      if (thothMemHook['chat.message']) {
        await thothMemHook['chat.message'](
          input as ThothChatMessageInput,
          output as ThothChatMessageOutput,
        );
      }
    },

    'experimental.chat.system.transform': async (input, output) => {
      if (thothMemHook['experimental.chat.system.transform']) {
        await thothMemHook['experimental.chat.system.transform'](
          input as ThothSystemTransformInput,
          output as ThothSystemTransformOutput,
        );
      }
    },

    'experimental.chat.messages.transform': async (input, output) => {
      await phaseReminderHook['experimental.chat.messages.transform'](
        input as Record<string, never>,
        output as {
          messages: Array<{
            info: { role: string; agent?: string; sessionID?: string };
            parts: Array<{
              type: string;
              text?: string;
              [key: string]: unknown;
            }>;
          }>;
        },
      );
    },

    'experimental.session.compacting': async (input, output) => {
      if (thothMemHook['experimental.session.compacting']) {
        await thothMemHook['experimental.session.compacting'](
          input as ThothCompactingInput,
          output as ThothCompactingOutput,
        );
      }
    },

    // Post-tool hooks: retry guidance for delegation errors + post-read nudge
    'tool.execute.after': async (input, output) => {
      await delegateTaskRetryHook['tool.execute.after'](
        input as { tool: string },
        output as { output: unknown },
      );

      await jsonErrorRecoveryHook['tool.execute.after'](
        input as {
          tool: string;
          sessionID: string;
          callID: string;
        },
        output as {
          title: string;
          output: unknown;
          metadata: unknown;
        },
      );

      if (thothMemHook['tool.execute.after']) {
        await thothMemHook['tool.execute.after'](
          input as ThothToolAfterInput,
          output as ThothToolAfterOutput,
        );
      }

      await postReadNudgeHook['tool.execute.after'](
        input as {
          tool: string;
          sessionID?: string;
          callID?: string;
        },
        output as {
          title: string;
          output: string;
          metadata: Record<string, unknown>;
        },
      );
    },
  };
};

export default ThothAgents;

export type {
  AgentName,
  AgentOverrideConfig,
  McpName,
  PluginConfig,
  TmuxConfig,
  TmuxLayout,
} from './config';
export type { RemoteMcpConfig } from './mcp';
