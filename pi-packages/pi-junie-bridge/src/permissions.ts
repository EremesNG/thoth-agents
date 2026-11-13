import {
  type NativeToolActivity,
  renderNativeActivity,
} from './native-display.js';

interface PermissionRequest {
  toolCall?: NativeToolActivity;
  options?: { optionId: string; name?: string; kind: string }[];
}
export interface PermissionUI {
  select(
    title: string,
    options: string[],
    settings?: { signal?: AbortSignal },
  ): Promise<string | undefined>;
}
function reject(request: Pick<PermissionRequest, 'options'>) {
  const option = request.options?.find(
    (option) => option.kind === 'reject_once',
  );
  return {
    outcome: option
      ? { outcome: 'selected', optionId: option.optionId }
      : { outcome: 'cancelled' },
  };
}
/** A shared gate prevents overlapping dialogs; every unsuccessful path fails closed. */
export function createPermissionGate(config: { timeoutMs?: number } = {}) {
  const timeoutMs =
    config.timeoutMs ??
    Number(process.env.JUNIE_BRIDGE_PERMISSION_TIMEOUT_MS ?? 120000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
    throw new Error(
      'Junie permission timeout must be positive milliseconds (at most 2147483647).',
    );
  let queue = Promise.resolve();
  return {
    request(
      params: unknown,
      context: { ui?: PermissionUI; signal?: AbortSignal } = {},
    ) {
      const request = (params ?? {}) as PermissionRequest;
      const run = async () => {
        if (!context.ui || context.signal?.aborted) return reject(request);
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancel!: () => void;
        const cancellation = new Promise<undefined>((resolve) => {
          cancel = () => {
            controller.abort();
            resolve(undefined);
          };
        });
        context.signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(cancel, timeoutMs);
        try {
          const options = request.options ?? [];
          const labels = options.map((option) => option.name ?? option.kind);
          const choice = await Promise.race([
            context.ui.select(
              renderNativeActivity(request.toolCall ?? {}).slice(0, 2500),
              labels,
              { signal: controller.signal },
            ),
            cancellation,
          ]);
          if (
            controller.signal.aborted ||
            context.signal?.aborted ||
            choice === undefined
          )
            return reject(request);
          const index = labels.indexOf(choice);
          return index < 0
            ? reject(request)
            : {
                outcome: {
                  outcome: 'selected',
                  optionId: options[index].optionId,
                },
              };
        } catch {
          return reject(request);
        } finally {
          clearTimeout(timer);
          context.signal?.removeEventListener('abort', cancel);
          controller.abort();
        }
      };
      const result = queue.then(run);
      queue = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
}

/** Only our named MCP server bypasses native approval; Pi enforces its tool policy. */
export async function requestPermission(
  params: unknown,
  native?: (params: unknown) => Promise<unknown>,
): Promise<unknown> {
  const request = params as {
    toolCall?: { title?: unknown; _meta?: { is_mcp_tool_call?: boolean } };
    options?: { optionId: string; kind: string }[];
  } | null;
  if (
    request?.toolCall?._meta?.is_mcp_tool_call === true &&
    typeof request.toolCall.title === 'string' &&
    request.toolCall.title.startsWith('pi/')
  ) {
    const once = request.options?.find(
      (option) => option.kind === 'allow_once',
    );
    if (once)
      return { outcome: { outcome: 'selected', optionId: once.optionId } };
  }
  return native ? native(params) : reject(request ?? {});
}
