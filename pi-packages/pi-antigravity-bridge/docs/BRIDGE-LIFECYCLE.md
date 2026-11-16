# Bridge discovery and lifecycle

`bridgeDiscovery` defaults to `"private"`. Set it in `~/.pi/agent/antigravity-bridge/config.json`, or override it with `AGY_BRIDGE_DISCOVERY=private|legacy-global`. Restart after changing discovery mode.

## Private discovery

Every extension factory (root or child) acquires a unique `pi-agy-<8 hex>` name, derived from its instance UUID. Collisions are checked against all live PID-owned `agy-mcp-*/.agents/mcp_config.json` keys and process-wide reservations shared by separately loaded package copies. A collision gets a fresh eight-hex suffix; reservations cover the gap before config writing. The localhost MCP server, discovery directory, and approval hook remain instance-owned; directories and hooks still use the full UUID. The stream-json engine receives the private `.agents/mcp_config.json` via its existing extra `--add-dir`; ACP receives the owned name and endpoint in `session/new` and `session/load`'s `mcpServers`.

Private mode never registers, suppresses, or heals global bridge entries. Unless `AGY_AGENTS_ROOT` selects legacy behavior, both engines stage an isolated MCP home: preserve unrelated servers, remove other `pi-agy-<8 hex>` and legacy `pi-bridge[-<pid>[-<uuid>]]` entries, and enable only the acquired own entry. CLI app data, credentials and conversations are shared. Stream-json passes `--gemini_dir`, ACP `--gemini-dir`. Own-entry refresh uses atomic rename.

Startup still sweeps dead-process legacy entries while preserving live and foreign entries. Stream-json probe or staging failure warns and keeps today's additive private config (never global registration); a live legacy-global bridge then produces a mixed-mode diagnostic once. ACP staging failure fails the turn visibly. `AGY_AGENTS_ROOT` bypasses isolation and the stream capability probe. Avoid mixing modes on a non-isolated fallback.

`legacy-global` retains upstream global-registration fallback when stream-json isolation is unavailable, plus the reference-counted AskAntigravity suppression/marker-aware healing behavior. This compatibility fallback is not cross-session isolation.

## Qualified tool-name limit

agy uses `mcp_<server>_<tool>` names with a 64-character limit. The advertised catalog enforces `4 + serverName.length + 1 + toolName.length <= 64` using private `pi-agy-<8 hex>`, legacy stream-json `pi-bridge-<pid>-<UUID>`, or legacy ACP `pi-bridge`, as applicable. The private prefix leaves 44 characters for a tool name, so both compact proxy names fit; extension names travel inside proxy arguments. Tools above the limit are omitted with the same warning as unsupported schemas, once per tool per MCP session (TUI toast or headless stderr). Legacy-global stream-json's full UUID discovery name omits both `bridge_tool_info` and `bridge_call_tool` (as well as `bridge_poll_result`); prefer private mode.

## Lazy start

Loading the extension reads a fresh `models-cache.json` without spawning agy. Missing/stale caches await `agy models` (eight-second timeout, capped stdout) before provider and AskAntigravity registration, so new models are available in this session. Failed discovery retains stale data, then the built-in fallback. Concurrent loads sharing the binary/cache coalesce discovery; cache-write failures do not discard discovered models.

Bridge startup is model-gated for every instance: `session_start` with an Antigravity model, `model_select` to Antigravity, or the first provider stream if lifecycle events have not reached the instance. Startup is single-flight, awaited before engine launch, and fenced against concurrent shutdown. MCP configuration and approval hooks are ready before agy launches or ACP opens a session. The stream-json version check is also deferred until first use. Non-Antigravity sessions do not start bridges; load-time catalog discovery may still spawn agy when the cache is missing/stale; explicit commands/tools and existing interactive onboarding remain separately user-initiated operations.

## Owned shutdown

Shutdown invalidates pending startup, closes the MCP endpoint, terminates both drivers, and removes the private discovery directory and approval hook. Each owned process disposes its isolated home only after **close**, never leader exit or the bounded termination promise. A timeout/fence retains the home; the startup sweep removes only dead-process owners and preserves live processes and current-PID siblings. This deliberately adapts upstream group/PID cleanup to local owned-process settlement. After driver termination it removes only descriptor-cache keys this instance actually acquired under `~/.gemini/antigravity-cli/mcp/`:

- Private discovery: its exact acquired `pi-agy-<8 hex>` key after bridge startup, including a collision fallback (never the rejected candidate).
- Legacy-global stream-json: its unique `pi-bridge-<pid>-<instance>` key only after successful global registration.

Shared names (`pi-antigravity-bridge` and legacy ACP's `pi-bridge`) are never removed. An instance that never started its bridge, or failed to acquire a unique discovery key, removes no descriptor cache. Shutdown releases the name reservation only after driver termination and exact-key cache cleanup; another cleanup requires fresh acquisition on startup. Resume prefers the prior short name but rechecks collisions before acquiring it again. Sibling and old descriptor directories are not swept. `/new` or resume reopens the same extension instance and its recyclable drivers without reusing an invalidated turn.
