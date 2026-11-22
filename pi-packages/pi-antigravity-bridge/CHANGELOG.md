# Changelog

All notable changes to the Thoth package are documented here in Keep a Changelog style.
Upstream history, including the former mixed local notes, is preserved unchanged in [UPSTREAM-CHANGELOG.md](UPSTREAM-CHANGELOG.md).

## [Unreleased]

### Added

- Guard native `run_command` in non-interactive sessions (`mode !== "tui"`) via a dedicated `PreToolUse` hook on both engines when `runCommandGuard` (default `true`) is enabled and an active, non-hidden Pi `bash` tool exists, routing shell commands to Pi's bridged `bash` tool (exposed even when built-in-source while guarded). Guard state (hooks, prompt note, and built-in `bash` source admission) is frozen once per Pi session lifecycle; mid-session setting or `bash` activation changes apply on the next session, while hiding or deactivating `bash` still removes it from the live MCP catalog immediately. Explicit `systemPrompt: false` suppresses guard-refresh prompt notes while the `PreToolUse` hook still enforces.

### Changed

- After successful Pi compaction, rotate the Antigravity conversation and send a one-shot summary and retained-context handoff on both engines, independent of the ordinary digest setting. Older turns cannot restore or delete the fresh binding; stranded results from rotated conversations remain pollable without being re-sent.
- Run Pi summary helpers in separate, bounded connections with their own verified gate delivery. Helper bridge tools and approvals are denied without involving the active session.

- Support Pi 1.6 render output in native event cards.

- Suspend the inactivity guard during native tool execution on both carriers, and raise the default headless turn cap to 30 minutes.
- Publish in-flight native tools by Pi session so subagent watchdogs apply tool-aware stall budgets, without duplicating identified Pi-bridge calls. For stream-json frames lacking server identity, a unique matching bridge park is inferred; an unrelated concurrent unidentified MCP call with the same target remains indistinguishable.

### Fixed

- Avoid false Pi context-overflow detection when ACP reports occupancy within the model window but aggregated input and cache reads exceed it. Billing cost and total-token reporting are unchanged.

- **Bridge POSTs preserve UTF-8 across HTTP chunks.** Approval and MCP requests decode the complete byte-limited body once. Malformed UTF-8 is rejected before a tool is dispatched or an approval is parked.
- **Approval gate hardening (convergence round 1).** Windows UNC targets must name a server and a share (`\servershare...`); server-only forms are denied. The Pi approval dialog for an unknown native tool now shows the complete serialized arguments (no silent 1,000-character cutoff). Gated dispatch rechecks the owned hook groups and handlers a second time immediately before the prompt write on both carriers, refreshing the `run_command` guard exemption and refusing visibly if either was lost during async startup.
- **ACP native failure diagnostics cover attested ACP names.** `read_file` joins the native inventory, and an explicit tool name carried on a failed update is used when the start record is missing; MCP-marked failures stay excluded.
- **Quota notice detection matches the whole notice.** The headline must end its sentence and any following sentence must read as notice copy, so ordinary prose beginning "Quota exceeded is an error message..." is no longer reclassified.
- **Approval gate is now allow-by-exception and covers agy 1.5.11+ writes (upstream `62b2a20`, `b5aa839`).** The owned `PreToolUse` group matches every native tool and the generated handler passes only a read-only allowlist (derived from the agy 1.5.13 stream-json `init` tool inventory plus ACP's `read_file`, which ACP exposes in a different inventory; recorded in `src/native-tool-policy.ts`), positively identified MCP calls (`call_mcp_tool` carrying a server argument - the live ACP hook payload uses `ServerName`/`ToolName`/`Arguments`, stream-json records `server_name`/`serverName`/`server` - or this bridge's qualified `mcp_<server>_<tool>` name) and `run_command` only while the separate headless guard is verified-delivered. `write_file`, `sed_file`, `notebook_edit` and every unknown or future native tool require Pi approval. Known write/edit tools map the `Path/Content` and `Path/Target/Replacement` shapes (legacy fields kept) and are approved only against an absolute target path taken verbatim from the arguments; relative, missing, conflicting or unresolvable targets and empty multi-edits are denied, never approved against a guessed path. Unknown tools are presented as unknown-target operations through the new hidden `agy_native_approval` Pi shadow tool, which carries the raw tool name and arguments (no fabricated path or command), and the Pi decision returns to agy. ACP diff handling now covers `write_file`.
- **Gated turns dispatch only with a verified owned hook group on both carriers.** ACP delivers the edit gate (and, with the gate enabled, the `run_command` guard) by merging into the private ACP home's `config/hooks.json`, preserving foreign groups and cleaning up with the home; stream-json keeps the bridge `--add-dir` (live-probed on agy 1.5.13: a hook denial is honored there). Before every dispatch the owned group and its instance-owned handler script are read back and compared with what this instance wrote; staging failure, an unavailable bridge or bridge tools `none`, a missing or malformed group, a missing or mismatched handler, or a gated ACP session under the `AGY_AGENTS_ROOT` legacy override refuse the turn with a visible error before any prompt. Gate-off behavior is unchanged. When the guard is expected but cannot be verified, the edit gate itself denies `run_command` with the Pi bash redirect even under `approvals.mode=allow`; with the guard intentionally inactive, `run_command` requires Pi approval.
- **Hook handler always emits a verdict before agy's hook timeout.** One overall deadline (park budget + 20s, at least 30s below the declared hook `timeout`) covers stdin reading and every bridge wait; a valid Pi allow/deny is forwarded, anything else denies.
- **ACP turns whose native tool failed no longer settle as an empty success (upstream `9ba4314`, `b5aa839`).** A non-aborted OK or unknown-stop-reason turn with no model text and a positively identified native tool failure settles with a visible diagnostic naming the failed tool and pointing to the agy conversation transcript. The diagnostic uses a fixed message and never includes agy's failure text; unknown stop reasons are logged. MCP failures (including metadata-less foreign ones) and failures of unknown provenance are unchanged.
- **Quota-notice-only turns settle as retryable provider errors (upstream `9d20772`).** An OK handle on either transport whose only output is an account-quota notice becomes `agy rate limit (ResourceExhausted): Antigravity quota exhausted; resets in …` at both the main and late-result redelivery settlement, classified before fallback output or any binding/watermark mutation (an existing binding is never deleted or replaced). Wording is accepted by Pi's retry classifier and avoids `quota exceeded`/billing wording.

- **Approval display, startup consistency and ACP diagnostics.** Unknown-tool approvals hard-wrap reversible escaped JSON without dropping whitespace. Gate staging, verification and approval wiring use one startup mode.
- **Convergence round 3.** The unknown-tool approval view unlocks Yes only after every body row has actually been rendered in view at the current width (End skipping the middle, key input without render, or a resize re-wrap no longer grant coverage). A guard-only staging failure is tolerated only when the edit gate is enabled; with the gate off it fails startup visibly as before. A non-aborted `max_tokens` turn with a native failure and no model text now surfaces the native-failure diagnostic. `_meta.mcp.tool` without a server still marks MCP provenance (never native), even when the tool name collides with a native name. Quota detection enumerates the attested account-quota headlines (Individual quota reached, Daily quota reached, Quota exhausted) with no generic prefix, so "Storage quota limit reached." or "Disk quota exceeded." stay ordinary text.
- **Convergence round 2.** The unknown-tool approval view is scrollable and bounded to the viewport (80x24 verified): Yes/No stay visible, the full raw arguments are reachable, Yes is locked until the tail has been in view, and Enter on the default No denies. A guard-only staging failure at startup no longer aborts bridge startup: the edit gate is still wired with the guard unverified, so `run_command` is denied with the Pi bash redirect. An explicit failed-update tool name now wins over a generic start name (`read` vs `read_file`) for the native failure diagnostic; MCP exclusions are unchanged. Quota detection matches only whole attested notice forms (the "Individual quota reached ..." notice, "Daily quota reached for this model. Try again tomorrow.", "Quota exhausted. Resets in ..."); keyword prose is ordinary text.

### Known limitations

- The hook handler can only guarantee a verdict while it runs: if agy's hook process crashes or is killed before it writes a verdict, agy may soft-pass that call. This residual is accepted and documented, not covered.
- The read-only allowlist can lag new agy tools; drift fails safe (an extra approval). MCP identification relies on the `call_mcp_tool` server argument (confirmed against a live ACP hook payload) or the bridge's qualified name; a payload shape that differs costs extra approvals, never a bypass.
- Gate enabled with `bridgeTools: "none"` now refuses Antigravity turns visibly instead of running ungated.

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
