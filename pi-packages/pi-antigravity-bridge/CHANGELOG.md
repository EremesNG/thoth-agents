# Changelog

All notable changes to the Thoth package are documented here in Keep a Changelog style.
Upstream history, including the former mixed local notes, is preserved unchanged in [UPSTREAM-CHANGELOG.md](UPSTREAM-CHANGELOG.md).

## [Unreleased]

## [0.9.0] - 2026-11-15

### Changed

- Default `config.engine` and the first-run engine picker to `acp` (native `agy acp`); unknown engine values fall back to `acp`.
- Price `gemini-4-argon` and its `-low`/`-medium`/`-high` tier variants against the `google/gemini-4-argon` catalog entry.
- Forward enabled non-Pi-bridge MCP servers from the isolated home into ACP sessions (stdio and HTTP). Launch ACP with a home-local minimal carrier to hide native delegation/interaction tools while keeping the Pi system prompt inline. Carrier write failures warn and launch without it; `AGY_AGENTS_ROOT` retains bridge-only forwarding and no carrier.
- Stage stream-json system-prompt carriers from a portable projection: retain custom/appended policy, explicit section overrides, project context and skills, but omit Pi's identity and default harness sections. Capture structured prompt options per agent run, with assembled-prompt derivation when unavailable. ACP delivery is unchanged.
- Retry a fresh automatic-carrier turn once on pre-output RESOURCE_EXHAUSTED/429, using a fresh process without `--agent` and delivering the projection inline. Resumed turns, user-configured agents, disabled delivery and staging failures are excluded; successful retries do not reuse the rejected carrier.

- Use native `agy acp` (agy >=1.5.3) through owned processes / Windows Jobs with shared CLI credentials. Both auth commands print instructions only; never run an installer.
- Retire standalone OAuth/browser capture, `/agy acp-bin`, `acp.bin` and `AGY_ACP_BIN`. Strip the persisted key and warn once for the environment override. Remove only evidence-marked old bridge-managed builds; report credentials for manual removal.
- Isolate both engines' MCP homes around the acquired private identity, preserving unrelated servers and shared CLI state. Private stream-json falls back to additive private config with a warning, legacy-global to global registration; ACP staging failures fail visibly. `AGY_AGENTS_ROOT` keeps legacy behavior. Dispose on process close; retain fenced homes for dead-owner startup sweeping.
- Hand-merge native/isolation/usage changes onto upstream sync base `cdcfc04` (`72d2224`, `32d6d2e`, `e03776a`, `7a4e9b8`, `22364ad`, `e0728f8`, `01e10ff` home hunk), retaining local containment, authorization and round-trip safeguards.

- Expose authorized extension tools to agy through compact `bridge_tool_info` and `bridge_call_tool` proxies; only authorized tools named like Pi's seven defaults retain full schemas. Raw extension-name calls are rejected and live active/hidden/source filters still apply (upstream `fc95fd3`, adapted).
- Declare the carrier agent's native tools as a block YAML list while retaining subagent masking (upstream `8d7c386`, `df83d3c`).

### Fixed

- Guard source and extension switch clauses against unbraced function, class, and let/const declarations in tests to prevent bundle-only initialization crashes.
- Fix ACP edit-tool completion crash (`Cannot access 'acpEditFileArg' before initialization`) caused by a function declared inside a switch case.
- Preserve the human prompt before trailing extension reminders on ACP by sending the complete contiguous user-message suffix.
- Report ACP context occupancy when available; otherwise derive input + output + ceil(cacheRead / (toolBatches + 1)), separate from aggregate billing fields and reset each turn.
- Include exit code or signal and redacted reason in ACP and stream-json failures without changing drain-aware settlement (diagnostics from upstream `6289360`).
- Detect Windows `agy.exe` installs and tolerate empty or BOM-prefixed MCP configuration (upstream `01e10ff`, picker/config portions).
- Isolate provider-streaming tests from operator configuration (upstream `1090801`).

## [0.8.0] - 2026-11-10

### Changed

- `AskAntigravity`, `agy_web_search` and `agy_read_url` use adaptive exposure in the `antigravity` namespace with their usage guidance: deferred when `codemode` or `tool_search` is active, direct otherwise.

## [0.7.0] - 2026-11-03

### Changed

- Require Pi 1.5.0 or newer.
- Animation levels select enabled effects without slowing animations that remain enabled.
- Use Pi's injected expand-key hints, honoring remapped and unbound actions.

### Fixed

- Close the engine picker, tasks and artifacts browsers on session shutdown and handle their cancellation without errors.
- Redact AskAntigravity stderr in persisted results and progress, bound retained output with explicit truncation (1,000,000 UTF-16 code units of answer head/tail; 65,536 of line-safe stderr tail), and report pre-spawn refusals as failures.
- Keep legacy-global AskAntigravity MCP suppression owned across runtime reloads so late cleanup cannot reopen another live delegation's entries.
- Resume bound conversations after retry-dropped assistant or tool-result tails without re-sending the context digest.
- Bind first tool parks from their originating turn's live conversation identity, preserving existing bindings and dispatch watermarks.
- Keep working conversation bindings after deadline errors when model output was observed.
- Deliver user and recovered tool-result images on both engines without mixing originating conversations. Stream-json includes the full user suffix and stages private temporary image files with 24-hour cleanup; staging failures dispatch an explicit missing-image notice and warning instead of silently dropping images.
- Pause the stream-json overall turn budget while tool calls are parked, resuming with the remaining budget after all parks resolve.
- Keep update notices on local package versions instead of repeatedly announcing upstream releases.

## [0.6.0] - 2026-10-29

### Added

- Shared selectable animation intensity for AskAntigravity cards.

### Fixed

- Launch agy through a neutral executable name inside Orca to avoid foreground-agent misidentification.

## [0.5.1] - 2026-10-23

### Changed

- Shorten model-facing tool definitions without changing parameters.

## [0.5.0] - 2026-10-23

### Changed

- Port upstream fixes through 1.8.7: refresh Gemini/Claude catalogs and aliases, remove GPT-OSS models, raise the MCP SDK floor, and fold consecutive ACP polling cards.
- Prefer bridged Pi delegation tools, with a longer synchronous window for delegation and configurable long-tool escalation.
- Refuse provider plan turns that agy cannot enforce; AskAntigravity follows the configured mode unless explicitly overridden. Headless reviews disclose command limitations.

### Fixed

- Bound ACP prompt-write acknowledgements; retire expired connections and prevent late writes from publishing expired turns.
- Verify tokenless ACP sign-in with a live probe, persist non-credential verification evidence, and invalidate it on authentication errors without cross-instance callbacks.
- Validate timeout budgets before spawning agy and include matching time-budget instructions.
- Recover completed, unpolled escalated results only for their owning conversation; keep polling and delivery claims safe across failures and shutdown.
- Restrict MCP replay to active tools; explicitly mask native subagents in staged prompts.
- Add a fail-closed read-only switch, strip skip-permission flags on plan runs, and save raw configuration without persisting environment overrides.
- Resolve tiered Claude base IDs, report explicit catalog-based API-equivalent costs, and fix YAML quoting in generated agent templates.

## [0.4.1] - 2026-10-21

### Fixed

- Detach previous render components so AskAntigravity cards no longer retain a growing component chain.

## [0.4.0] - 2026-10-20

### Changed

- Remove the AskAntigravity `effort` alias; use `thinking`. Condense tool guidance.

## [0.3.0] - 2026-10-18

### Fixed

- Contain Windows agy processes and descendants in hidden kill-on-close Job Objects, drain final output before settlement, and isolate the launcher from other packages. The warned fallback terminates only the owned leader.

## [0.2.2] - 2026-10-16

### Fixed

- Avoid detached agy launches on Windows.
- Refresh stale model discovery and resolve Gemini Argon models.

## [0.2.1] - 2026-10-10

### Added

- API-equivalent message cost reporting from explicit model prices.

## [0.2.0] - 2026-10-08

### Changed

- Publish the extension as a built bundle and remove the unused legacy Pi patch-cleanup command and startup notice.

## [0.1.0] - 2026-10-07

### Added

- First published Thoth fork of the Antigravity provider bridge, with opt-in AskAntigravity, private per-instance discovery, lazy model-gated startup, and scoped lifecycle integration.
- Object-union tool-schema support with warnings for unsupported tools, Render KIT cards with native fallback, and standard status/elapsed footers.

### Fixed

- Clean only owned subprocess trees and descriptor caches, hide Windows consoles, bound silent waits, and reliably terminate turns.
- Generate approval hooks as ES modules and sweep only attributable stale gate groups.
- Fit private MCP names within agy's tool-name limit and compute context usage from input/output/cache tokens rather than unreliable totals.
