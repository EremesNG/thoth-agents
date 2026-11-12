# Changelog

All notable changes to the Thoth package are documented here in Keep a Changelog style.
Upstream history, including the former mixed local notes, is preserved unchanged in [UPSTREAM-CHANGELOG.md](UPSTREAM-CHANGELOG.md).

## [Unreleased]

## [0.14.0] - 2026-11-11

### Added

- Project tool overlay: `agents.<name>.tools.{add,remove}` in `<project>/.pi/subagents.json` grants or withholds tools for one project without copying agent definitions. `add` joins before glob expansion, `remove` subtracts after it; `ask_orchestrator`/`notify_orchestrator` are unaffected.
- `/subagents-tools` Global/Project scope (Tab). Project scope edits the overlay (`a` add, `x` remove, `d` delete, `r` clear) and glob rows show their match count; Global always edits the global definition and warns when a project copy shadows it.
- `c` converts a shadowing project copy into an equivalent overlay, with a colored summary of added/removed tools and lost differences; the copy is kept as `.bak`. Conversion is refused when the tool selection would change.

### Fixed

- Holding arrow keys in `/subagents-tools` no longer lags.

## [0.13.0] - 2026-11-11

### Added

- Redesigned `/subagents` panel: executions grouped as Needs attention, Running, Completed and Failed with distinct status glyphs, compact duration/cost and a summary row; `/` filter by name, agent or status.
- Two-line header card (status, agent, duration with effective timeout, cost, model, effort, turns, context bar) and an `i` details block available in every view.
- Views `1`-`5`: Result, Transcript, Prompt, Tools and Metrics, with an explicit state when execution detail is no longer retained; theme tool density keeps applying in Transcript.
- Actions `x` cancel and `e` extend with Enter confirmation, and `y` copy of the result through OSC 52. Replies and continuations stay in the main chat.

### Fixed

- Cancelling from the panel no longer crashes Pi with "Unknown theme color: undefined".
- The displayed timeout reflects deadline extensions.

## [0.12.1] - 2026-11-10

### Fixed

- Child sessions load the selected `codemode` and `tool_search` built-ins in both lean and full modes.

## [0.12.0] - 2026-11-08

### Added

- Subagent tool cards opt into the theme's collapsed tool row density, with task summary, model, effort and the first error line on failure; message cards stay framed.

## [0.11.0] - 2026-11-03

### Added

- Subagent lifecycle events for Orca, with duplicate-event suppression.

### Changed

- Require Pi 1.5.0 or newer.
- Animation levels select enabled effects without slowing animations that remain enabled.
- Use Pi's injected expand-key hints, honoring remapped and unbound actions; omit key instructions from model-facing summaries.
- Use shared compact Work panel counts.

### Fixed

- Keep `/subagents-model` and `/subagents-tools` usable after a question closes, and return cleanly when `/reload` closes them instead of blocking later commands.
- Keep update notices on local package versions instead of repeatedly announcing upstream releases.

## [0.10.1] - 2026-10-30

### Changed

- Refresh the coordinated Pi package release; no runtime behavior change. Stabilize deferred history-pruning test teardown.

## [0.10.0] - 2026-10-29

### Added

- Manual tool-entry editing in `/subagents-tools` and shared selectable animation intensity.

### Fixed

- Keep typing responsive with indexed session-history reads, coalesced activity publication, cached debug configuration, and fewer redundant renders.
- Skip unnecessary OpenAI-fast startup in physical-model children.
- Prune history only while no subagent is active, index retention candidates, and persist history at turn/tool boundaries rather than every event.

## [0.9.0] - 2026-10-23

### Changed

- Run launches and continuations in background unless task mode is explicitly requested.
- Shorten model-facing tool definitions without changing parameters.

## [0.8.2] - 2026-10-21

### Fixed

- Skip Orca-managed extension factories in lean and full in-process children, preventing root callbacks from retaining completed sessions.
- Release tool definitions when their extension instance shuts down.

## [0.8.1] - 2026-10-21

### Fixed

- Prune large legacy histories in small background slices after a startup delay, reducing terminal lag; document fractional retention days and `0` to disable pruning.

## [0.8.0] - 2026-10-21

### Added

- `/subagents-history-compact` for exclusive history pruning and VACUUM, with size reporting and refusal while other sessions/viewers hold the database.

### Changed

- Retain execution detail only for the latest attempt and stop persisting task events; preserve metadata, results, usage, cost, and session paths.
- Prune terminal execution detail in bounded deferred batches after 14 days by default, configurable through `history_detail_retention_days`.
- Release terminal transcripts, snapshots, and system prompts after settlement, result delivery, and durable persistence; load detail on demand and retain memory on persistence failure.
- Bound model-facing tool details with one allowlist and limited previews; include results only in final payloads.

### Fixed

- Detach previous render components and transcript snapshots so progress cards no longer retain growing chains.

## [0.7.0] - 2026-10-20

### Changed

- Default to native Pi tools plus memory reads and state tool guidance once.

### Fixed

- Make omitted definition `tools` inherit cascaded `default_tools`, matching `tools: []` across runtime and panels.

## [0.6.1] - 2026-10-18

### Fixed

- Prevent Shift+S from freezing `/subagents-model` and recover Windows launcher startup failures on later launches.

## [0.6.0] - 2026-10-18

### Changed

- Publish launch-ordered Work panel discovery with clearer terminal states, completion-ranked candidates, compact agent names, and calmer two-line metrics.

## [0.5.0] - 2026-10-16

### Added

- Tool-aware stall budgets that account for declared tool timeouts.

## [0.4.0] - 2026-10-13

### Added

- Trusted project skill catalogs in lean specialists and native codemode loading when selected.
- Named model/effort profiles with session, project-pin, and global selection, optional orchestrator model, and editable profile-name input.
- Timeout warnings, bounded extensions, foreground-to-background handoff, and separate questions-only `ask_orchestrator` and nonblocking `notify_orchestrator`.

### Fixed

- Return only the final non-empty assistant answer while preserving narration in history; keep validated finalized answers when later nested prompts fail.
- Hold completion/question notifications during active parent runs, discard answered or consumed notifications, and continue flushing after delivery failures.
- Hand off same-session foreground calls when a child asks the orchestrator and show resumed task identity on continuation cards.

## [0.3.0] - 2026-10-10

### Added

- Shared list-editor `/subagents-model` and owned `/subagents-tools` persistence with a Thoth adapter.
- Task-state and usage publication on pi-core channels, data-only Work panel v2 rows, provider-limit warnings, task-cost metrics, and cost-ranked history.

### Fixed

- Restore resumed history and retain consistent task labels, metric packing, and cost ranking.

## [0.2.0] - 2026-10-08

### Added

- Dismiss finished Work panel rows and resolve panel glyphs semantically.

### Changed

- Publish the extension as a built bundle.

### Fixed

- Load the host YAML parser without requiring a sibling SDK install and preserve question focus over overlays.

## [0.1.0] - 2026-10-07

### Added

- First published Thoth fork of pi-subagents, with native in-process delegation, tool filtering, background execution, live steering, opt-in continuation, and history.
- Explicit tool/glob selection, disallowed tools, supported model efforts, compact task cards, detailed thread/history views, and cumulative parent-session usage.
- Child-to-orchestrator questions, provider lifecycle passthrough, bounded child shutdown, Render KIT cards, standard status/elapsed footers, and a prompt-retained Agents Work panel section with history on the shared core shell.

### Fixed

- Inherit parent providers, drop unavailable selected tools with warnings, exclude recursive delegation controls, and dispose child extensions and background jobs.
- Require explicit context-overflow evidence, explain stalls without false success, suspend stall detection during compaction/retry, and bound history-view rows.
- Hide empty Work panel sections and restore resumed usage totals.
