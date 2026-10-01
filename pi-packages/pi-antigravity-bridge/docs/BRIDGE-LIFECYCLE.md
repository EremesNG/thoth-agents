# Bridge discovery and lifecycle

`bridgeDiscovery` defaults to `"private"`. Set it in `~/.pi/agent/antigravity-bridge/config.json`, or override it with `AGY_BRIDGE_DISCOVERY=private|legacy-global`. Restart after changing discovery mode.

## Private discovery

Every extension factory (root or child) owns a unique `pi-agy-<instance-id>` name, localhost MCP server, discovery directory, and approval hook. The stream-json engine receives the private `.agents/mcp_config.json` via its existing extra `--add-dir`; ACP receives the owned name and endpoint in `session/new` and `session/load`'s `mcpServers`.

Private mode never registers, suppresses, or heals global bridge entries. Startup still sweeps dead-process `pi-bridge-*` entries from the global config while preserving live and foreign entries. A live legacy-global bridge produces a diagnostic once per instance. Do not mix discovery modes: agy's private config is additive, so live global bridges remain visible.

`legacy-global` retains upstream global registration for stream-json and the reference-counted AskAntigravity suppression/marker-aware healing behavior. This is a compatibility option, not cross-session isolation.

## Lazy start

Loading the extension never spawns agy. The registered model catalog comes only from `models-cache.json` (fresh or stale) or the built-in fallback. First Antigravity use refreshes a missing/stale cache for the next load; provider model lists remain fixed until `/reload`.

Bridge startup is model-gated for every instance: `session_start` with an Antigravity model, `model_select` to Antigravity, or the first provider stream if lifecycle events have not reached the instance. Startup is single-flight, awaited before engine launch, and fenced against concurrent shutdown. MCP configuration and approval hooks are ready before agy launches or ACP opens a session. The stream-json version check is also deferred until first use. Non-Antigravity sessions do not start bridges or spawn agy; explicit commands/tools and existing interactive onboarding remain separately user-initiated operations.

## Owned shutdown

Shutdown invalidates pending startup, closes the MCP endpoint, terminates both drivers, and removes the private discovery directory and approval hook. After driver termination it removes only descriptor-cache keys this instance actually acquired under `~/.gemini/antigravity-cli/mcp/`:

- Private discovery: its unique `pi-agy-<instance-id>` key after bridge startup.
- Legacy-global stream-json: its unique `pi-bridge-<pid>-<instance>` key only after successful global registration.

Shared names (`pi-antigravity-bridge` and legacy ACP's `pi-bridge`) are never removed. An instance that never started its bridge, or failed to acquire a unique discovery key, removes no descriptor cache. Shutdown releases the acquired key; another cleanup requires fresh acquisition on startup. Sibling and old descriptor directories are not swept. `/new` or resume reopens the same extension instance and its recyclable drivers without reusing an invalidated turn.
