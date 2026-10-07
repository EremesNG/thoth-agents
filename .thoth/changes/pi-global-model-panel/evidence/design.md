# Native global model panel design

User requested implementation of `/thoth-agents:models`, explicitly global only, without profiles or project-scoped configuration. Native designer run b31a51ad-9886-409a-8f12-0c6952e11fc7 completed read-only; root accepted the following bounded design.

## UI and public test seams

Use Pi `ctx.ui.custom()` with native TUI primitives, not Ink or another renderer. Overview lists six specialist roles, global directory, unchanged ambient root, draft markers and Save/Cancel. Model selection uses the current `ctx.modelRegistry.getAll()` snapshot with provider/name search and explicit inheritance. Thinking uses the installed public supported-level capability, including `max` when supported; align shared Pi persistence validation rather than silently omitting supported levels. Do not refresh provider catalogs or install dependencies at runtime.

Keep draft state separate from persisted values. Role editor back navigation retains draft. Cancel/discard performs no writes. Escape from a dirty overview offers discard/keep editing. Saving failure retains the draft with an actionable error and truthful changed-file information if only part of a batch succeeded. Validate all targets/values and stale snapshots before beginning writes, but do not claim cross-file atomicity. Use current managed atomic-per-file writer and provenance checks. No development tests mutate actual user settings.

Test seams to confirm with the implementation choice: registered command handler (including child and non-TUI guards); panel public render/handleInput callbacks and injected save boundary; shared configuration read/save public API plus existing CLI operation API. Cover six-role/global banner, capability-based choices, search, narrow rendering, save once, cancellation zero writes, ownership/path/stale-draft rejection and failure visibility. Preserve existing CLI/sync regression coverage.

Non-TUI invocation reports unavailable interactive UI and makes no writes. Keyboard controls and width-safe rendering use Pi helpers. Do not change root model or thinking. No profiles or project writes.

## Runtime findings and remaining verification

Root inspected installed pi-subagents `src/agents/agents.js`: discoverAgents uses getAgentDiscoverySources; cache compares discoveryFingerprint over watched paths; file signatures include size and mtimeMs. Definitions are therefore rediscovered after file changes, without owning or restarting children. Confirm public next-discovery behavior with an isolated fixture before promising next-launch application. Already-running children are unaffected.

The same discovery pipeline applies subagents defaults, agentOverrides, provider-specific overrides, and project definitions. Saved global file values are not necessarily effective runtime values. UI/docs must communicate that boundary and warn about external overriding configuration without editing it. Thinking omission is unpinned and may use native defaultThinking, not an unconditional guarantee of inheriting the parent's effort.

Designer inspected installed Pi 0.87.1 docs/extensions.md, docs/tui.md, public model registry and Pi AI declarations, and examples/extensions/preset.ts and tools.ts. These confirm native command/custom UI, getAll/getAvailable registry surfaces and getSupportedThinkingLevels. Installed pi-subagents parser explicitly accepts max. Keep external Pi modules host-provided rather than bundle a second runtime; verify packed extension loading after any imports/build adjustments.

## Ownership and specialist evaluation

Root owns storage extraction, CLI integration, contract and final acceptance. Designer owns the panel only after the storage interface is accepted; integration/docs follow. One source writer at a time in this worktree. Designer provides material UI benefit and its discovery is complete. Explorer adds no value to this already-bounded local seam; librarian adds no value because installed authoritative API evidence is available; quick is not fitting for coupled storage/UI behavior. Deep remains available if persistence complexity warrants delegation, but root currently owns that bounded service. Fresh Oracle is optional for plan review by user choice, mandatory for final verification. No live installation/configuration changes, commits or publishing are authorized.
