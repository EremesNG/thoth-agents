# Bridge discovery and lifecycle

`bridgeDiscovery` defaults to `"private"`. Set it in `~/.pi/agent/antigravity-bridge/config.json`, or override it with `AGY_BRIDGE_DISCOVERY=private|legacy-global`. Restart after changing discovery mode.

## Private discovery

Every extension factory (root or child) acquires a unique `pi-agy-<8 hex>` name, derived from its instance UUID. Collisions are checked against all live PID-owned `agy-mcp-*/.agents/mcp_config.json` keys and process-wide reservations shared by separately loaded package copies. A collision gets a fresh eight-hex suffix; reservations cover the gap before config writing. The localhost MCP server, discovery directory, and approval hook remain instance-owned; directories and hooks still use the full UUID. The stream-json engine receives the private `.agents/mcp_config.json` via its existing extra `--add-dir`; ACP receives the owned name and endpoint in `session/new` and `session/load`'s `mcpServers`.

Private mode never registers, suppresses, or heals global bridge entries. Startup still sweeps dead-process `pi-bridge-*` entries from the global config while preserving live and foreign entries. A live legacy-global bridge produces a diagnostic once per instance. Do not mix discovery modes: agy's private config is additive, so live global bridges remain visible.

`legacy-global` retains upstream global registration for stream-json and the reference-counted AskAntigravity suppression/marker-aware healing behavior. This is a compatibility option, not cross-session isolation.

## Qualified tool-name limit

agy uses `mcp_<server>_<tool>` names with a 64-character limit. The advertised catalog enforces `4 + serverName.length + 1 + toolName.length <= 64` using private `pi-agy-<8 hex>`, legacy stream-json `pi-bridge-<pid>-<UUID>`, or legacy ACP `pi-bridge`, as applicable. The private prefix leaves 44 characters for a tool name, so the 22-/28-character browser tool names fit. Tools above the limit are omitted with the same warning as unsupported schemas, once per tool per MCP session (TUI toast or headless stderr). Legacy stream-json's full UUID discovery name can exclude bridge-local tools too; prefer private mode.

## Lazy start

Loading the extension never spawns agy. The registered model catalog comes only from `models-cache.json` (fresh or stale) or the built-in fallback. First Antigravity use refreshes a missing/stale cache for the next load; provider model lists remain fixed until `/reload`.

Bridge startup is model-gated for every instance: `session_start` with an Antigravity model, `model_select` to Antigravity, or the first provider stream if lifecycle events have not reached the instance. Startup is single-flight, awaited before engine launch, and fenced against concurrent shutdown. MCP configuration and approval hooks are ready before agy launches or ACP opens a session. The stream-json version check is also deferred until first use. Non-Antigravity sessions do not start bridges or spawn agy; explicit commands/tools and existing interactive onboarding remain separately user-initiated operations.

## Owned shutdown

Shutdown invalidates pending startup, closes the MCP endpoint, terminates both drivers, and removes the private discovery directory and approval hook. After driver termination it removes only descriptor-cache keys this instance actually acquired under `~/.gemini/antigravity-cli/mcp/`:

- Private discovery: its exact acquired `pi-agy-<8 hex>` key after bridge startup, including a collision fallback (never the rejected candidate).
- Legacy-global stream-json: its unique `pi-bridge-<pid>-<instance>` key only after successful global registration.

Shared names (`pi-antigravity-bridge` and legacy ACP's `pi-bridge`) are never removed. An instance that never started its bridge, or failed to acquire a unique discovery key, removes no descriptor cache. Shutdown releases the name reservation only after driver termination and exact-key cache cleanup; another cleanup requires fresh acquisition on startup. Resume prefers the prior short name but rechecks collisions before acquiring it again. Sibling and old descriptor directories are not swept. `/new` or resume reopens the same extension instance and its recyclable drivers without reusing an invalidated turn.
