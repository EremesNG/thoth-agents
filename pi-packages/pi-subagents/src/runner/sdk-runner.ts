import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LIFECYCLE_PASSTHROUGH } from '../config.js';
import { SubagentStructuredError } from '../error-metadata.js';
import { resolveSubagentsHistoryHome } from '../history.js';
import { resolveEffectiveSubagentProfile } from '../profile-resolver.js';
import { expandToolPatterns, hasToolGlob } from '../tool-patterns.js';
import type {
  EffectiveSubagentProfile,
  ModelRef,
  SubagentDefinition,
  SubagentErrorMetadata,
  SubagentRunner,
  SubagentsConfig,
  ThinkingEffort,
} from '../types.js';
import {
  promptWithInactivity,
  structuredMetadataFromError,
} from './event-processing.js';
import { getInteractionSessionRegistry } from './interaction-session-registry.js';
import { detectPiRuntimeSupport, loadPiSdkModule } from './pi-sdk-module.js';
import { buildPrompt } from './prompt.js';
import { teardownSubagentSession } from './session-teardown.js';

function modelLabel(model: any): string | undefined {
  if (!model) return undefined;
  return `${model.provider ?? 'unknown'}/${model.id ?? model.name ?? 'unknown'}`;
}

function modelRefLabel(ref: ModelRef | undefined): string | undefined {
  return ref ? `${ref.provider}/${ref.id}` : undefined;
}

function resolveModel(ctx: any, ref?: ModelRef): any | undefined {
  if (!ref) return undefined;
  return (
    ctx?.modelRuntime?.getModel?.(ref.provider, ref.id) ??
    ctx?.modelRegistry?.find?.(ref.provider, ref.id)
  );
}

function namesFromTools(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((tool: unknown) =>
      typeof tool === 'string' ? tool : (tool as { name?: unknown })?.name,
    )
    .filter(
      (name: unknown): name is string =>
        typeof name === 'string' && name.length > 0,
    );
}

function readToolNames(
  context: any,
  methodNames: readonly string[],
): string[] | undefined {
  for (const methodName of methodNames) {
    for (const source of [context?.pi, context]) {
      const getter = source?.[methodName];
      if (typeof getter !== 'function') continue;
      try {
        const names = namesFromTools(getter.call(source));
        if (names) return names;
      } catch {}
    }
  }
  return undefined;
}

function resolveConfiguredTools(
  patterns: readonly string[],
  context: any,
): string[] {
  const selectsActiveTools = patterns.length === 1 && patterns[0] === '*';
  const active = patterns.some(hasToolGlob)
    ? readToolNames(context, ['getActiveTools', 'getTools'])
    : undefined;

  if (selectsActiveTools && !active)
    throw new NonRetryableSubagentError(
      "Cannot resolve the standalone '*' tool selector because the parent Pi session exposes neither getActiveTools() nor legacy getTools().",
    );

  try {
    return expandToolPatterns(patterns, active);
  } catch (error) {
    throw new NonRetryableSubagentError((error as Error).message);
  }
}

function verifyChildToolSelection(
  session: any,
  selectedToolNames: readonly string[],
  allowMissing: boolean,
): string[] {
  const registered = readToolNames(session, ['getAllTools']);
  if (!registered)
    throw new NonRetryableSubagentError(
      'The child Pi session cannot verify selected tools. Upgrade the Pi SDK to expose getAllTools(), then retry.',
    );

  const registeredNames = new Set(registered);
  const selectedNames = new Set(selectedToolNames);
  const missing = selectedToolNames.filter(
    (name) => !registeredNames.has(name),
  );
  const unexpected = registered.filter((name) => !selectedNames.has(name));
  if (
    unexpected.length ||
    (missing.length &&
      (!allowMissing || missing.length === selectedToolNames.length))
  ) {
    const details = [
      missing.length ? `missing implementation: ${missing.join(', ')}` : '',
      unexpected.length
        ? `unexpectedly registered: ${unexpected.join(', ')}`
        : '',
    ].filter(Boolean);
    throw new NonRetryableSubagentError(
      `Selected tools are unavailable in the child session (${details.join('; ')}). Check that their extensions are installed and loadable by the child session.`,
    );
  }
  return missing;
}

const SUBAGENT_ALLOWED_EXTENSION_EVENTS = new Set([
  'tool_call',
  'tool_result',
  'user_bash',
]);

class NonRetryableSubagentError extends SubagentStructuredError {
  readonly nonRetryable = true;

  constructor(message: string) {
    super({
      version: 1,
      category: 'unknown',
      message,
      retryable: false,
      phase: 'runner_session',
      partial_result_available: false,
    });
  }
}

function isNonRetryableSubagentError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { nonRetryable?: unknown }).nonRetryable,
  );
}

const SUBAGENT_OBSERVE_ONLY_EVENTS = new Set([
  'before_agent_start',
  'agent_start',
  'turn_start',
]);

function extensionPackageName(
  resolvedPath: unknown,
  cache: Map<string, string | undefined>,
): string | undefined {
  if (typeof resolvedPath !== 'string') return undefined;
  try {
    // SDK resolvedPath may still be a symlink into another package.
    let dir = path.dirname(fs.realpathSync(resolvedPath));
    const visited: string[] = [];
    let name: string | undefined;
    while (true) {
      if (cache.has(dir)) {
        name = cache.get(dir);
        break;
      }
      visited.push(dir);
      const manifestPath = path.join(dir, 'package.json');
      try {
        // lstat distinguishes an absent entry from a manifest with a broken symlink.
        fs.lstatSync(manifestPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') break;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        continue;
      }
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        name = typeof manifest?.name === 'string' ? manifest.name : undefined;
      } catch {
        // An unreadable, disappeared, or invalid nearest manifest fails closed.
      }
      break; // Never inherit the name of an outer package past a manifest.
    }
    for (const directory of visited) cache.set(directory, name);
    return name;
  } catch {
    return undefined;
  }
}

function isolateSubagentExtensions(
  base: any,
  packages: readonly string[],
): any {
  const listedPackages = new Set(packages);
  const packageNames = new Map<string, string | undefined>();
  // Capture ownership before SDK binding consumes and clears the load-time queues.
  const providerOwners = new Set(
    (base?.runtime?.pendingProviderRegistrations ?? []).map(
      (registration: { extensionPath: string }) => registration.extensionPath,
    ),
  );
  return {
    ...base,
    extensions: (base?.extensions ?? []).map((extension: any) => {
      const name = extensionPackageName(extension.resolvedPath, packageNames);
      const passthrough = name !== undefined && listedPackages.has(name);
      const handlers = new Map<string, unknown[]>();
      for (const [event, callbacks] of (extension.handlers as Map<
        string,
        any[]
      >) ?? new Map()) {
        if (
          SUBAGENT_ALLOWED_EXTENSION_EVENTS.has(event) ||
          (event === 'session_shutdown' && providerOwners.has(extension.path))
        ) {
          handlers.set(event, callbacks);
        } else if (passthrough && SUBAGENT_OBSERVE_ONLY_EVENTS.has(event)) {
          handlers.set(
            event,
            callbacks.map((handler) => async (event: any, ctx: any) => {
              // Context contains functions; only events are cloneable. Discard all returns.
              await handler(structuredClone(event), ctx);
            }),
          );
        }
      }
      return {
        ...extension,
        handlers,
        commands: new Map(),
        flags: new Map(),
        shortcuts: new Map(),
      };
    }),
  };
}

type SubagentInteractionSessionMetadata = {
  origin: 'subagent';
  requester: { subagentName: string; description?: string; taskId?: string };
  parent?: { piSessionId?: string };
};

function registerInteractionSubagentSession(
  session: any,
  definition: SubagentDefinition,
  taskId?: string,
  parentPiSessionId?: string,
): () => void {
  const sessionId =
    session?.sessionManager?.getSessionId?.() ?? session?.sessionId;
  if (typeof sessionId !== 'string' || sessionId.length === 0)
    return () => undefined;
  const registry = getInteractionSessionRegistry() as Map<
    string,
    SubagentInteractionSessionMetadata
  >;
  const previous = registry.get(sessionId);
  registry.set(sessionId, {
    origin: 'subagent',
    requester: {
      subagentName: definition.name,
      description: definition.description,
      taskId,
    },
    parent: parentPiSessionId ? { piSessionId: parentPiSessionId } : undefined,
  });
  return () => {
    if (previous) registry.set(sessionId, previous);
    else registry.delete(sessionId);
  };
}

function resolveNestedSessionsHome(): string {
  const home = path.join(resolveSubagentsHistoryHome(), 'sessions');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(home, 0o700);
  } catch {}
  return home;
}

function sessionPathFromManager(
  sessionManager: any,
  fallback?: string,
): string | undefined {
  const direct =
    sessionManager?.getSessionFile?.() ??
    sessionManager?.path ??
    sessionManager?.sessionPath ??
    fallback;
  return typeof direct === 'string' && direct.length > 0 ? direct : undefined;
}

function secureSessionPath(sessionPath: string | undefined): void {
  if (!sessionPath) return;
  try {
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(sessionPath), 0o700);
  } catch {}
  try {
    fs.chmodSync(sessionPath, 0o600);
  } catch {}
}

async function secureSessionPathWhenReady(
  sessionPath: string | undefined,
  attempts = 10,
  delayMs = 10,
): Promise<void> {
  if (!sessionPath) return;
  secureSessionPath(sessionPath);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (fs.existsSync(sessionPath)) {
        fs.chmodSync(sessionPath, 0o600);
        return;
      }
    } catch {}
    if (attempt < attempts - 1)
      await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function versionFromPiSdk(piSdk: any): unknown {
  try {
    return piSdk?.VERSION;
  } catch {
    return undefined;
  }
}

async function createSession(
  model: any,
  cwd: string,
  tools: string[],
  effort: ThinkingEffort | undefined,
  config: SubagentsConfig,
  ctx: any,
  systemPrompt: string,
  nestedSessionPath?: string,
  allowMissing = false,
) {
  const piSdk = await loadPiSdkModule();
  const { createAgentSession, SessionManager } = piSdk;
  const sessionDir = resolveNestedSessionsHome();
  const sessionManager = nestedSessionPath
    ? await SessionManager.open(nestedSessionPath, sessionDir, cwd)
    : typeof SessionManager.create === 'function'
      ? await SessionManager.create(cwd, sessionDir, { cwd })
      : SessionManager.inMemory(cwd);
  const resolvedSessionPath = sessionPathFromManager(
    sessionManager,
    nestedSessionPath,
  );
  await secureSessionPathWhenReady(resolvedSessionPath);
  const options: Record<string, unknown> = {
    cwd,
    model,
    thinkingLevel: effort,
    tools,
    sessionManager,
  };
  const modelRuntime =
    ctx?.modelRuntime ??
    (await piSdk.ModelRuntime.create({ allowModelNetwork: false }));
  options.modelRuntime = modelRuntime;
  if (ctx?.settingsManager) options.settingsManager = ctx.settingsManager;
  if (config.session_resources === 'lean') {
    const DefaultResourceLoader = piSdk.DefaultResourceLoader;
    const agentDir =
      typeof piSdk.getAgentDir === 'function' ? piSdk.getAgentDir() : undefined;
    if (typeof DefaultResourceLoader !== 'function')
      throw new Error(
        'Subagent lean session resources require DefaultResourceLoader from Pi SDK.',
      );
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: ctx?.settingsManager,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => systemPrompt,
      extensionsOverride: (base: any) =>
        isolateSubagentExtensions(
          base,
          config.lifecycle_passthrough ?? DEFAULT_LIFECYCLE_PASSTHROUGH,
        ),
    });
    await resourceLoader.reload();
    options.agentDir = agentDir;
    options.resourceLoader = resourceLoader;
  }
  const created = await createAgentSession(options);
  let droppedTools: string[];
  try {
    if (!ctx?.modelRuntime) {
      // SDK binding has flushed the child's queued registrations into this runtime.
      // Replay only missing IDs so child-owned providers keep their own closures.
      const childProviders = new Set(modelRuntime.getRegisteredProviderIds());
      for (const providerId of ctx?.modelRegistry?.getRegisteredProviderIds?.() ??
        []) {
        if (childProviders.has(providerId)) continue;
        const providerConfig =
          ctx.modelRegistry.getRegisteredProviderConfig(providerId);
        const nativeProvider =
          ctx.modelRegistry.getRegisteredNativeProvider(providerId);
        if (providerConfig)
          modelRuntime.registerProvider(providerId, providerConfig);
        else if (nativeProvider)
          modelRuntime.registerNativeProvider(nativeProvider);
        else
          throw new NonRetryableSubagentError(
            `Cannot replay parent provider ${providerId} through public registry APIs.`,
          );
      }
      await modelRuntime.refresh({ allowNetwork: false });
    }
    droppedTools = verifyChildToolSelection(
      created.session,
      tools,
      allowMissing,
    );
  } catch (error) {
    await teardownSubagentSession(created.session);
    throw error;
  }
  return {
    ...created,
    dropped_tools: droppedTools,
    nested_session_path: resolvedSessionPath,
    pi_version: versionFromPiSdk(piSdk),
  };
}

function createSessionAbortBridge(session: any, signal: AbortSignal) {
  let abortPromise: Promise<void> | undefined;
  const abortSession = async (): Promise<void> => {
    if (!abortPromise) {
      abortPromise = Promise.resolve(session?.abort?.()).then(
        () => undefined,
        () => undefined,
      );
    }
    await abortPromise;
  };
  const onAbort = () => {
    void abortSession();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    abortSession,
    dispose() {
      signal.removeEventListener('abort', onAbort);
    },
  };
}

function selectedModel(input: {
  ctx: any;
  definition: SubagentDefinition;
  profile: EffectiveSubagentProfile;
}): any | undefined {
  const ref = input.profile.model.value;
  if (!ref) return input.ctx?.model;
  if (input.profile.model.source === 'orchestrator')
    return input.ctx?.model ?? resolveModel(input.ctx, ref);
  const resolved = resolveModel(input.ctx, ref);
  if (!resolved)
    throw new Error(
      `Subagent ${input.definition.name} could not resolve selected model ${modelRefLabel(ref)} (${input.profile.model.source}).`,
    );
  return resolved;
}

function providerFromModel(model: any): string | undefined {
  return typeof model?.provider === 'string' ? model.provider : undefined;
}

function createLiveSteeringBridge(session: any, piVersion: unknown) {
  const runtime = detectPiRuntimeSupport(piVersion);
  const canSteer = typeof session?.steer === 'function';
  return {
    detected_pi_version: runtime.detected_pi_version,
    supported: runtime.supported && canSteer,
    async steer(message: string): Promise<'queued' | 'handled'> {
      if (!canSteer)
        throw new Error(
          'Live steering is unavailable for this nested session.',
        );
      return await session.steer(message);
    },
  };
}

export const sdkSubagentRunner: SubagentRunner = async ({
  definition,
  task,
  taskId,
  parentPiSessionId,
  context,
  cwd,
  ctx,
  config,
  signal,
  effectiveProfile,
  nested_session_path,
  continuation,
  registerLiveBridge,
  clearLiveBridge,
  onQueuedMessageStart,
  onActivity,
}) => {
  const profile =
    effectiveProfile ??
    resolveEffectiveSubagentProfile({
      agentName: definition.name,
      definition,
      config,
      ctx,
    });
  const preferred = selectedModel({ ctx, definition, profile });
  const effort = profile.effort.value;
  const configuredTools = definition.tools?.length
    ? definition.tools
    : config.default_tools;
  const tools = resolveConfiguredTools(configuredTools, ctx);
  const allowMissing =
    configuredTools.length === 1 && configuredTools[0] === '*';
  const systemPrompt = definition.instructions;
  const prompt =
    continuation?.prompt ?? buildPrompt(definition, task, context, tools);
  onActivity?.({
    message: continuation
      ? 'continuation prompt prepared'
      : 'orchestrator prompt prepared',
    prompt,
    system_prompt: systemPrompt,
    transcript: `# system prompt\n\n${systemPrompt}\n\n# ${continuation ? 'continuation prompt' : 'delegated prompt'}\n\n${prompt}\n`,
    effort,
  });

  async function attempt(model: any) {
    onActivity?.({
      message: `starting ${definition.name} with model ${modelLabel(model) ?? 'unknown'}${effort ? ` effort ${effort}` : ''}`,
      prompt,
      system_prompt: systemPrompt,
      effort,
    });
    const {
      session,
      nested_session_path: resolvedNestedSessionPath,
      pi_version: piVersion,
      dropped_tools,
    } = await createSession(
      model,
      cwd,
      tools,
      effort,
      config,
      ctx,
      systemPrompt,
      nested_session_path,
      allowMissing,
    );
    const abortBridge = createSessionAbortBridge(session, signal);
    let unregisterInteractionSession = () => {};
    try {
      registerLiveBridge?.(createLiveSteeringBridge(session, piVersion));
      onActivity?.({
        message: 'nested session ready',
        dropped_tools,
        nested_session_path: resolvedNestedSessionPath,
      });
      unregisterInteractionSession = registerInteractionSubagentSession(
        session,
        definition,
        taskId,
        parentPiSessionId ?? ctx?.sessionManager?.getSessionId?.(),
      );
      if (signal.aborted) {
        await abortBridge.abortSession();
        throw new Error('Subagent was aborted');
      }
      const effectiveSystemPrompt =
        typeof session.systemPrompt === 'string'
          ? session.systemPrompt
          : systemPrompt;
      const {
        result,
        usage,
        runtime_metrics,
        thread_snapshot,
        interaction_request,
      } = await promptWithInactivity(
        session,
        prompt,
        config.stall_timeout_ms,
        signal,
        onActivity,
        context,
        cwd,
        effectiveSystemPrompt,
        taskId,
        continuation ? 'continuation' : 'delegated_task',
        continuation?.prompt ?? task,
        continuation?.attempt ?? 1,
        onQueuedMessageStart,
        continuation?.previous_snapshot,
      );
      if (signal.aborted) {
        await abortBridge.abortSession();
        throw new Error('Subagent was aborted');
      }
      await secureSessionPathWhenReady(resolvedNestedSessionPath);
      return {
        result,
        dropped_tools,
        usage,
        runtime_metrics,
        thread_snapshot,
        interaction_request,
        system_prompt: effectiveSystemPrompt,
        nested_session_path: resolvedNestedSessionPath,
      };
    } catch (error) {
      if (signal.aborted) await abortBridge.abortSession();
      await secureSessionPathWhenReady(resolvedNestedSessionPath);
      throw error instanceof SubagentStructuredError
        ? error
        : new SubagentStructuredError(
            structuredMetadataFromError(error, {
              phase: 'runner_invoke',
              provider: providerFromModel(model),
              model: modelLabel(model),
              operation: 'session.prompt',
            }),
          );
    } finally {
      try {
        clearLiveBridge?.();
        abortBridge.dispose();
        unregisterInteractionSession();
      } finally {
        await teardownSubagentSession(session);
      }
    }
  }

  try {
    const {
      result,
      dropped_tools,
      usage,
      runtime_metrics,
      thread_snapshot,
      interaction_request,
      system_prompt,
      nested_session_path: resolvedNestedSessionPath,
    } = await attempt(preferred);
    return {
      result,
      dropped_tools,
      usage,
      runtime_metrics,
      thread_snapshot,
      interaction_request,
      system_prompt,
      nested_session_path: resolvedNestedSessionPath,
      model: modelLabel(preferred) ?? modelRefLabel(profile.model.value),
      effort,
      fallback_used: false,
    };
  } catch (error) {
    if (signal.aborted) throw new Error('Subagent was aborted');
    const preferredLabel =
      modelLabel(preferred) ?? modelRefLabel(profile.model.value) ?? 'unknown';
    const primaryFailure = structuredMetadataFromError(error, {
      phase: isNonRetryableSubagentError(error)
        ? 'runner_session'
        : 'runner_invoke',
      provider: providerFromModel(preferred),
      model: preferredLabel,
      operation: 'session.prompt',
    });
    throw new SubagentStructuredError(primaryFailure);
  }
};
