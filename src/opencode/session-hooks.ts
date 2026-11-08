import type { Plugin } from '@opencode/plugin';
import { ForegroundFallbackManager } from '../hooks/foreground-fallback';
import { log } from '../utils/logger';
import type { OpenCodeDependencies } from './context';
import { SessionState } from './session-state';

export async function registerSessionHooks(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  const names = new Set(deps.agentDefs.map((agent) => agent.name));
  // Keep the mutable map: profile refresh replaces its per-role chains.
  const fallback = new ForegroundFallbackManager(
    ctx.session,
    deps.runtimeChains,
    deps.effectiveModelArrays,
  );
  const state = new SessionState(deps.directory, ctx.session.instructions);
  await ctx.session.hook('retry', (input) => {
    if (names.has(input.agent)) return fallback.retry(input);
  });
  await ctx.session.hook('prompt', async (input) => {
    await state.refresh(input.sessionID);
  });
  await ctx.session.hook('compaction', async (input) => {
    const value = await state.refresh(input.sessionID);
    if (input.result) {
      input.result.summary += `\n\n${value}`;
      return;
    }
    // Keyed entries survive compaction in the host's new instruction epoch
    // (projector.ts -> InstructionState.advanceEpoch). Keep the host summary;
    // append only to this compaction request, never to its system or history.
    input.messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Preserve this current Thoth state in the compaction summary:\n${value}`,
        },
      ],
    });
  });

  // The v2 promise adapter owns/auto-closes these iterators on plugin unload.
  // No detached timers, watchers, or process-level listeners are installed.
  const signal = new AbortController();
  const events = ctx.event.subscribe({
    types: ['session.created', 'session.status', 'session.deleted'],
    signal: signal.signal,
  });
  void (async () => {
    try {
      for await (const event of events) {
        if (event.type === 'session.deleted')
          fallback.forget(event.data.sessionID);
        try {
          await state.event(event);
        } catch (error) {
          log('[session-state] update failed', { error: String(error) });
        }
      }
    } catch (error) {
      log('[session-state] subscription ended', { error: String(error) });
    } finally {
      signal.abort();
    }
  })();
}
