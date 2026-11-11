# Change: subagents-panel-ux-redesign

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- `/subagents` is a full-screen owned overlay (`pi-packages/pi-subagents/src/ui/panel-overlay.ts:215-279,370-376`) whose `SubagentsHistoryPanel` adapter (`src/ui/subagents-history-panel.ts:156-230`) feeds the shared `HistoryPanel<T>` shell in `pi-packages/pi-core/src/history-panel.ts`. The same shell is extended by `TodoPanel` (`pi-packages/pi-todo/todo-panel.ts`) and `BackgroundTasksHistoryPanel` (`pi-packages/pi-background-tasks/src/history-panel.ts`).
- Shell layout: wide (>=90 cols) sidebar 25% clamped 18-30, header badge plus exactly two metadata rows, divider, transcript, footer; narrow layout puts a max four-row execution list at the bottom (`history-panel.ts:473-497,581-730`). Minimum internal size 40x12.
- Current UX defects observed on a real 23-execution session: status appended to the label (`name:completed…`) and truncated; only `○`/`●` glyphs; flat unsorted list; three equal-weight `|`-separated metadata rows truncated at the edge, repeated agent/status/duration and usage (`subagents-history-panel.ts:290-412`); cryptic usage (`↑127k ↓184k R26.1M W352k ctx:383k`); `stall 4m` shown on completed tasks; `ctrl+o expand · ctrl+t thinking` emitted in header and footer (`subagents-history-panel.ts:228-229,353-355`; `history-panel.ts:641-644`); literal Spanish `[X Cerrar]` rendered top and bottom and colliding with header icons (`history-panel.ts:522,592,660-670,717-730`); cryptic `[1159-1209/1209]` position; final result only reachable by scrolling the transcript.
- Input: ←/→ select execution, ↑/↓ scroll, PgUp/PgDn ±12, Home/End (End resumes tail-follow), Ctrl+O, Ctrl+T, Esc/Ctrl+C/Q close, configurable `x` cancel for queued/running (`history-panel.ts:325-354`; `history-panel-input.ts:7-35`; `panel-overlay.ts:239-247,269-271`). No separate sidebar/body focus. Mouse SGR/X10 click/wheel supported (`history-panel.ts:361-418`).
- Data: status enum `queued|running|stopping|completed|failed|cancelled|interrupted` (`pi-subagents/src/types.ts:4-19`); task carries `task`, prompts, `result`, errors, transcript, structured tool calls with start/end and bash-only typed exit codes (`types.ts:300-343,468-528`), usage incl. cost/cache/context percent (`types.ts:132-154`), last activity, timeout deadline and extensions used (`types.ts:485-509`), pending orchestrator questions (`types.ts:438-453,493,525`; live only, not persisted). Live manager memory wins over SQLite history; selected task hydrates lazily (`manager.ts:687-721,1007-1032,2513-2540`).
- Actions: `cancel(id, reason)` wired; `extendDeadline(taskId, extraMs, ownerSession)` exists, uses `config.timeout_ms` when `extraMs` is undefined and enforces owner/running/max-extension (`manager.ts:1308-1344`); `continueTask`, `sendMessage`, `replyToQuestion` exist but are out of scope. No clipboard helper exists.
- Risks: whole overlay re-renders every second and normalizes the full selected transcript before slicing (`panel-overlay.ts:303-310`; `subagents-history-panel.ts:678-689`); synchronous SQLite reads with 2000 ms busy timeout; cache signature ignores some displayed fields (`subagents-history-panel.ts:493-518`).
- Canonical baseline: `.thoth/specs/pi-ecosystem/spec.md` holds `Shared Pi panel shell`, `Subagent viewer tool rendering`, `Subagent stall diagnostics` and `Background task history panel`; no subagents-history-panel UX requirement exists.
- Tests: `pi-subagents/test/ui/panel.test.ts`, `pi-subagents/test/ui/panel-overlay-focus.test.ts`, `pi-core/test/history-panel.test.ts` plus pi-todo and pi-background-tasks panel tests (Vitest).

## Intent

Redesign `/subagents` into a scannable, self-explaining monitoring panel: status-first grouped list, a two-line header with details on demand, purpose-specific views (Result, Transcript, Prompt, Tools, Metrics), consistent English key hints with a help overlay, and safe in-panel operational actions (cancel, extend, copy result). Shell-level fixes improve `/todos` and `/bg` too; richer features are opt-in adapter capabilities activated only by `/subagents`. Delivered in three stages: (1) quick wins, (2) structure, (3) actions.

## Non-goals

- No in-panel text entry: replying to questions, sending messages and continuing tasks stay in the main chat with root; the panel only shows a pending question read-only with that guidance.
- No translation framework; all panel strings are English.
- No redesign of `/todos` or `/bg` beyond shared shell chrome fixes; they do not opt in to groups, filter, views or actions.
- No changes to the work panel, sidebar, history DB schema, retention, or manager lifecycle semantics.
- No common-prefix stripping of execution names; no persisted per-user panel preferences; no sort-mode switching.

## Acceptance

- AC-1: Shared shell chrome (all three panels): one footer hint row listing only keys valid for the current focus and selection, with no hint duplicated between header and footer; the Spanish `[X Cerrar]` is replaced by a clickable `✕ Close` that never overlaps other header content and Esc remains the keyboard close; `?` toggles a help overlay listing every binding; the position indicator reads `line A/B` plus `● live` while tail-following or `↓ N new` when new content arrived while scrolled up; hints and help come from adapter-provided metadata so `/bg` keeps its `x` stop and bracket paging bindings and `/todos` its bindings; the shell offers an opt-in list-summary slot and variable-height header rows.
- AC-2: Subagents list rows show a distinct glyph and theme color per status (not color alone), the execution name without a status suffix, and right-aligned compact duration and cost; a summary row above the list shows counts per status group and total cost; narrow layout uses the same row format.
- AC-3: Subagents header is a two-line card: line 1 status glyph, name, agent, human status with relative end time, duration, cost; line 2 model, effort, turns, context-usage bar with percent; `i` toggles a details block with labeled usage (input, output, cache read, cache write), timeout and extensions used, session and full task; stall/last-activity warnings appear only for running tasks; nothing truncates mid-token without an ellipsis.
- AC-4: The shell supports opt-in item groups and a `/` filter; `/subagents` groups executions as Needs attention (pending orchestrator question, `stopping`, or running within the last 20% of its deadline), Running (running/queued), Completed, and Failed (failed/cancelled/interrupted), newest first within each group, with collapsible group headers and empty groups hidden; `/` filters by name, agent or status and Esc clears the filter before closing.
- AC-5: The shell supports opt-in views selected with keys `1`-`5` and shown as a tab row; `/subagents` offers Result (default for terminal tasks: final result or error, plus any pending question with "answer from the main chat"), Transcript (default for queued/running tasks; existing rendering, Ctrl+O/Ctrl+T, tail-follow), Prompt (full original task), Tools (one row per retained structured tool call: name, status, duration or `—` when timestamps are missing, bash exit code, failures first) and Metrics; when execution detail was pruned by history retention or never recorded, Transcript and Tools show an explicit "execution detail no longer retained" state instead of an empty or misleading view, and Result/Prompt fall back to retained result and metadata; `g`/`G` jump to top/bottom in every view.
- AC-6: Actions in `/subagents`, shown in the footer only when eligible: `x` cancel for queued/running with a confirmation; `e` extend for running tasks of the current session with a confirmation naming the default increment and remaining extensions, calling `extendDeadline` with no explicit amount; `y` copies the Result view text through OSC 52 and shows a transient confirmation (or a not-supported notice); action failures surface as an inline transient message, never crash the panel.
- AC-7: Existing behaviors are preserved: native/kit tool rendering in the transcript, mouse selection and wheel, hydration and caching, focus restoration with the question tool, `/todos` and `/bg` interaction models; the 1-second refresh adds no full-transcript work for non-Transcript views.

## Clarifications

- Shell strategy (user, 2026-11-10): improve pi-core shell generically; groups, views and actions are opt-in and activated only by `/subagents`.
- Language (user): English everywhere; `Cerrar` becomes `Close`.
- Copy (user): OSC 52 with on-screen confirmation.
- Text input (user): the panel must not reply or continue; those happen through the main chat with root. Other operational actions (cancel, extend, copy) are available.

## Decisions

- Extend uses the manager default increment (`config.timeout_ms`) because no text entry is allowed; the owner session is the panel's current session and tasks from other sessions show no extend action.
- "Needs attention" is derived, not a new status: pending question, `stopping`, or running with less than 20% of its deadline remaining.
- Pending questions are live-only data; historical tasks show none.
- Tools view shows exit codes only where typed (bash); other tools show status only.
- Views are bounded to retained detail (Oracle plan-review open question, recommended default adopted by root): history retention stays unchanged and pruned/legacy executions show an explicit unavailable state; no reconstruction from nested session files.
- Shell preparation (list-summary slot, variable-height header rows, adapter-provided hint/binding metadata consumed by footer and `?` help) is delivered upstream with the chrome unit, including the background-tasks and todo adapter changes needed to move their own hints/bindings into that metadata.
- A designer produces the visual spec (glyphs, theme roles, column widths, mockups at 90/120/160 cols and narrow) before implementation; root accepts it into the worker assignments without changing this record's acceptance.
- No package version bumps.
- Implementation-time root decisions (within accepted intent): `renderListSummary` receives the available width so the summary can apply its drop order; the effective minimum sidebar width is 22, so list tests cover 22/30 instead of 18; group headers are selectable rows toggled with Enter/Space/click; in narrow layout the filter row is reserved inside the metadata budget (max 3 header rows while filtering); the `i` details block renders at the top of the scrollable body so the full task is never capped; Transcript keeps rendering retained textual transcripts/execution flow and shows the unavailable state only when nothing execution-related is retained; `toolArgumentSummary` in thread-view.ts was exported (no behavior change); manager gained a read-only `getDeadlineExtension()` accessor; `/bg` keeps its existing confirmed-stop path; the subagents cancel now confirms with Enter instead of a second `x`; OSC 52 copy is best-effort without tmux/screen passthrough; the fictitious `UsageStats.contextPercent` was replaced by real runtime context metrics. After round-1 final verification: the footer is modal-aware while `?` help is open; status glyphs are pairwise distinct in nerd/unicode/ascii using existing icons (stopping uses `ready`, interrupted uses `elapsed`; no theme contract change); `i` details works from every view without transcript processing; activity/stall diagnostics show only for `running`.

## Durable deltas

- `ADDED pi-ecosystem` **Subagents history panel UX** — The `/subagents` history panel MUST group executions as Needs attention, Running, Completed and Failed with a distinct status glyph and theme color per status, MUST render a two-line header card with labeled usage details on demand, MUST offer Result, Transcript, Prompt, Tools and Metrics views with Result as the default for terminal tasks and Transcript for active ones, MUST filter executions with `/`, MUST offer cancel, extend (default increment, current-session owner only) and OSC 52 copy actions only when eligible, and MUST NOT accept replies, messages or continuations, which stay in the main chat.
  - GIVEN a session with one running task near its deadline, one completed and one failed task; WHEN the user opens `/subagents`; THEN the running task appears under Needs attention with extend and cancel hints, selecting the completed task shows its Result view first, and `y` copies that result through OSC 52 with a confirmation.
- `MODIFIED pi-ecosystem` **Shared Pi panel shell** — pi-core MUST export panel primitives (titled frame, cell-width truncation, keyboard plus SGR/urxvt/X10 mouse and wheel parsing, cursor-centered viewport, selectedBg row, hint rows, dirty-discard confirmation, owned-overlay host) and a list-editor shell; Pi list editors MUST render through the shell, and history panels and the work-panel detail card MUST use the primitives; the history panel shell MUST render one English footer hint row built from adapter-provided hint metadata for the current selection without duplicating hints in the header, an English clickable `✕ Close` that never overlaps header content, a `?` help overlay of all bindings and a position indicator showing tail-follow or unseen new lines, and MUST offer a list-summary slot, variable-height header rows, item groups, a `/` filter, numbered views and item actions as adapter opt-ins; apart from that shared chrome, history panels that do not opt in MUST keep their interaction model, and every panel overlay MUST open through `openOwnedOverlay`.
  - GIVEN the todo, background-task and subagents history panels; WHEN each opens and receives keyboard or wheel input; THEN all share the primitives, the English footer, `✕ Close` and `?` help and open through `openOwnedOverlay`, the background panel keeps its stop and paging bindings, and only the subagents panel shows groups, filter, views and actions.

## Plan

Stage 1 (quick wins) → stage 2 (structure) → stage 3 (actions). One writer per surface: the pi-core shell (`pi-packages/pi-core/src/history-panel.ts`, `history-panel-input.ts`, panel primitives) and the subagents adapter (`pi-packages/pi-subagents/src/ui/**`) are owned by sequential worker units so they never write concurrently.

- Visual spec first (designer, read-only output) fixes glyphs, theme roles, column widths, tab row and help overlay layout, and mockups per width.
- Shell additions are optional members on `HistoryPanelAdapter<T>`: `groupOf?(item)`/group metadata, `matchesFilter?(item, query)`, `views?()`/`renderView?(item, view, width)`, `actions?(item)` returning eligible `{key, label, confirm?, run}`, and `hints?(item, focus)`. Absent members keep current behavior; chrome fixes (close, single hint row, `?` help, position indicator) apply to every panel.
- OSC 52 helper lives with the pi-core panel primitives and writes through the TUI terminal; unsupported/oversized payloads return a notice.
- Non-Transcript views must not normalize the full transcript; cache keys include the active view and every displayed field.
- Focused verification: Vitest in `pi-packages/pi-core`, `pi-subagents`, `pi-todo`, `pi-background-tasks`; `pnpm run typecheck`; `pnpm run check:ci`; `pnpm run build`. Each unit is test-first.

## Tasks

- [x] AC-2: Visual spec for the redesigned panel
  - Outcome: accepted visual spec covering list rows, group headers, summary row, header card, details block, tab row, help overlay, footer hints and mockups at 90/120/160 cols and narrow
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts`, `pi-packages/pi-core/src/history-panel.ts`, render-kit icons/theme roles in pi-core
  - Inputs: this record's Acceptance and Decisions
  - Dependencies: none
  - Output: spec returned to root (glyph per status with fallback, theme role per element, column widths and truncation rules)
  - Owner: thoth-designer
  - Writes: none
  - Interface boundaries: existing theme roles and render-kit icon modes only
  - Focused check and PASS evidence: root confirms every AC-1..AC-6 element has a defined rendering at each width
  - Return milestone: spec delivered
  - Stop / reassessment: a required visual needs a new theme role or icon contract
- [x] AC-1: Shell chrome and shell slots for all history panels
  - Outcome: single English footer hint row from adapter hint/binding metadata, `✕ Close`, `?` help overlay, `line A/B` with `● live`/`↓ N new`, no header/footer hint duplication; plus opt-in list-summary slot and variable-height header rows; todo and background adapters migrated to the hint metadata keeping their bindings (background `x` stop and bracket paging)
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/history-panel.ts`, `pi-packages/pi-core/src/history-panel-input.ts`, `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:228-229,353-355`; skill `tdd`
  - Inputs: accepted visual spec
  - Dependencies: visual spec unit
  - Output: updated shell plus tests in `pi-packages/pi-core/test/history-panel.test.ts`; subagents adapter drops its duplicated hints
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, the hint lines of `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts`, `pi-packages/pi-background-tasks/src/history-panel.ts`, `pi-packages/pi-todo/todo-panel.ts`, and their tests in pi-subagents, pi-todo and pi-background-tasks
  - Interface boundaries: `HistoryPanelAdapter<T>` new members optional; mouse close area remains clickable; `openOwnedOverlay` unchanged
  - Focused check and PASS evidence: new boundary tests for summary slot, variable header rows, hint metadata in footer and `?` help, background `x` stop and paging still working; Vitest for pi-core, pi-subagents, pi-todo and pi-background-tasks green; typecheck green
  - Return milestone: shell chrome and slots merged with all four packages' tests passing
  - Stop / reassessment: a non-subagents panel needs an interaction change beyond the shared chrome
- [x] AC-2: Status-first list rows and summary row
  - Outcome: glyph+color per status, name without status suffix, right-aligned duration/cost, summary row, same format in narrow layout
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts` (`renderItemLabel`), `pi-packages/pi-subagents/test/ui/panel.test.ts`; skill `tdd`
  - Inputs: visual spec; accepted shell chrome unit
  - Dependencies: shell chrome unit
  - Output: updated adapter and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/ui/**`, `pi-packages/pi-subagents/test/ui/**`
  - Interface boundaries: shell `renderItemLabel` contract and the list-summary slot from the chrome unit
  - Focused check and PASS evidence: pi-subagents panel tests cover each status glyph, truncation at 18 and 30 sidebar widths, summary row, narrow layout
  - Return milestone: tests green
  - Stop / reassessment: the accepted summary slot cannot express the specified summary
- [x] AC-3: Two-line header card and `i` details block
  - Outcome: header card, labeled usage details toggle, context bar, stall warnings only while running
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:290-412`; skill `tdd`
  - Inputs: visual spec; accepted list-row unit
  - Dependencies: list-row unit
  - Output: updated `renderHeader` and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/ui/**`, `pi-packages/pi-subagents/test/ui/**`
  - Interface boundaries: `HistoryPanelHeader` variable-height rows from the chrome unit
  - Focused check and PASS evidence: tests for completed task without stall text, running task with stall warning, details toggle, widths 90/160
  - Return milestone: tests green
  - Stop / reassessment: the accepted header rows cannot express the details block
- [x] AC-4: Opt-in groups and `/` filter in the shell, adopted by subagents
  - Outcome: shell grouping/filter opt-ins; subagents Needs attention/Running/Completed/Failed groups, collapsible headers, filter by name/agent/status, Esc clears filter first
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/history-panel.ts`, `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts`, `pi-packages/pi-subagents/src/types.ts:438-509`; skill `tdd`
  - Inputs: accepted header unit
  - Dependencies: header unit
  - Output: shell opt-ins plus subagents adoption and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-subagents/src/ui/**`, `pi-packages/pi-subagents/test/ui/**`
  - Interface boundaries: optional adapter members; todo/bg unchanged
  - Focused check and PASS evidence: tests for attention derivation (pending question, stopping, last 20% deadline), selection across collapsed groups, filter + Esc; pi-todo and pi-background-tasks tests still green
  - Return milestone: tests green
  - Stop / reassessment: grouping conflicts with mouse hit-testing or narrow list limits
- [x] AC-5: Opt-in views with subagents Result/Transcript/Prompt/Tools/Metrics
  - Outcome: tab row and `1`-`5` selection; default view by status; `g`/`G`; Tools table failures-first; pending question read-only in Result; non-Transcript views avoid full-transcript normalization
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/history-panel.ts`, `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:415-425,493-518,678-750`, `pi-packages/pi-subagents/src/thread-view.ts`; skill `tdd`
  - Inputs: accepted groups/filter unit
  - Dependencies: groups/filter unit
  - Output: shell views opt-in, subagents views, cache keys including view, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-subagents/src/ui/**`, `pi-packages/pi-subagents/test/ui/**`
  - Interface boundaries: transcript rendering and tool-kit resolution unchanged (Subagent viewer tool rendering requirement)
  - Focused check and PASS evidence: tests for default view per status, each view's content, bash exit code shown, missing timestamps rendered as `—`, Result for failed task shows error, pruned/legacy history row shows the unavailable state in Transcript and Tools with Result/Prompt from retained data, Transcript tail-follow preserved, no transcript render call when Result is active
  - Return milestone: tests green
  - Stop / reassessment: retained metadata lacks result or task text needed by Result/Prompt (no retention or DB change in scope)
- [x] AC-6: Cancel, extend and OSC 52 copy actions
  - Outcome: eligible-only action hints; confirmations for cancel and extend; `extendDeadline(taskId, undefined, currentSession)`; OSC 52 copy with transient confirmation or notice; inline transient error messages
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/panel-overlay.ts:239-279`, `pi-packages/pi-subagents/src/manager.ts:1308-1344,1822`, `pi-packages/pi-core/src/history-panel.ts`; skill `tdd`
  - Inputs: accepted views unit
  - Dependencies: views unit
  - Output: shell actions opt-in, OSC 52 helper in pi-core primitives, subagents wiring and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-subagents/src/ui/**`, `pi-packages/pi-subagents/test/ui/**`
  - Interface boundaries: manager APIs unchanged; no reply/continue/sendMessage wiring
  - Focused check and PASS evidence: tests for extend eligibility (other session, not running, exhausted), confirmation flow, OSC 52 sequence bytes, failure message rendering
  - Return milestone: tests green
  - Stop / reassessment: no TUI path to write raw OSC sequences
- [x] AC-7: Regression and closeout checks
  - Outcome: full focused regression across touched packages plus repo gates; durable README/keybinding docs updated where pi-subagents documents the panel
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md` (if it documents keys), `pi-packages/pi-subagents/test/ui/panel-overlay-focus.test.ts`; skill `simplify`
  - Inputs: accepted actions unit
  - Dependencies: actions unit
  - Output: simplify pass, docs, green checks
  - Owner: thoth-worker
  - Writes: touched package sources/tests/docs only
  - Interface boundaries: behavior-preserving cleanup only
  - Focused check and PASS evidence: Vitest for pi-core, pi-subagents, pi-todo, pi-background-tasks; `pnpm run typecheck`; `pnpm run check:ci`; `pnpm run build` all exit 0
  - Return milestone: all checks green
  - Stop / reassessment: an unrelated environment failure (report with evidence)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: first fresh Oracle REJECT (sha256 2f82671e068c276b5b0f5f5bf8ddf4ea10e7da1fc66c4e6b50b36e20fbae2a30) repaired; second fresh Oracle OKAY, valid delivered verdict, recordSha256 1a75f96a03928650f612d2feb288e97a843528444145d50b89c6aad77aa2df5a (recordDigest match).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: dc5532cf421dc9e685ad552238971795b5ff3aa5cd4085bddc1ecfa54505ec99

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-7 are satisfied. Both previous rounds’ findings are repaired, Transcript preserves thoth-theme density, and all required checks passed.",
  "evidence": [
    {
      "id": "E1",
      "kind": "integrity",
      "locator": ".thoth/changes/subagents-panel-ux-redesign/subagents-panel-ux-redesign.md; git status/diff and untracked files",
      "claim": "Exact record-prefix SHA-256 is dc5532cf421dc9e685ad552238971795b5ff3aa5cd4085bddc1ecfa54505ec99. Before/after hashes of all 32 changed/untracked files matched; review made no workspace changes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "contract",
      "locator": ".thoth/specs/pi-ecosystem/spec.md; change record Durable deltas, Decisions and Non-goals",
      "claim": "Canonical SHA-256 matches the declared ac291c6b96d554df0c174fb17b2a09156a15e55f30ff159d50a27b80485f1717. The added UX requirement is absent from the baseline; the modified shell requirement retains existing primitives and overlay ownership. Diff respects non-goals and settled decisions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-core/src/history-panel.ts:519-644,858-1410; pi-core/test/history-panel.test.ts; todo-panel.test.ts; pi-background-tasks/src/history-panel.test.ts",
      "claim": "Shared chrome has adapter-driven eligible hints/help, reserved English Close, modal-aware help footer, live/unseen positions, summary/header slots and opt-in groups/filter/views/actions. Todo navigation and background confirmed-stop/bracket paging tests pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:370-700; test/ui/panel-list.test.ts; test/ui/panel-header.test.ts",
      "claim": "Status rows, compact aligned metrics, summary, attention derivation, ordered groups, filtering and two-line header are implemented. Tests cover distinct glyphs in nerd/unicode/ascii, layout widths, details and running-only activity/stall diagnostics.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:804-1008,1509-1511; test/ui/panel-views.test.ts; panel-view-selection.test.ts; panel-wrapping.test.ts",
      "claim": "Five views, status defaults, retained-detail fallbacks, read-only questions, Tools ordering/exit codes, g/G and per-view scrolling are covered. ANSI-aware wrapping preserves initial/mid-line over-width tokens and wide graphemes in Result, Prompt, Metrics, details and pending questions. Details work in every view, including unavailable Transcript.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:733-801; src/ui/panel-overlay.ts:269-278; src/manager.ts:1309-1323; test/ui/panel-actions.test.ts; panel-overlay-focus.test.ts; pi-core/test/panel-clipboard.test.ts",
      "claim": "Cancel/extend eligibility and Enter confirmation are tested; extend passes undefined amount and current session. OSC 52 bytes, unsupported/oversized notices, transient outcomes and synchronous/asynchronous failures are tested.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "regression",
      "locator": "pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:1079-1109,1293-1427; src/thread-view.ts:1065-1147; test/thread-view-tool-resolution.test.ts; test/ui/panel.test.ts; panel-overlay-focus.test.ts",
      "claim": "Hydration/caching and native/kit rendering paths remain intact. The real thoth-theme frame/compact/line Transcript integration test passes. Mouse, wheel and questionnaire focus regressions pass. Non-Transcript dispatch avoids transcript body rendering/cache serialization.",
      "basis": "observed",
      "uncertainty": "No separate interactive terminal session was exercised."
    },
    {
      "id": "E8",
      "kind": "documentation",
      "locator": "pi-packages/{pi-core,pi-subagents,pi-todo,pi-background-tasks}/README.md; docs/agent/harness-packaging.md",
      "claim": "Documentation matches current controls, including i details in every view, Enter confirmations, shared versus opt-in features, and best-effort OSC 52 limitations.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "test-execution",
      "locator": "Sequential pnpm --filter @thoth-agents/<package> exec vitest run --maxWorkers=2",
      "claim": "pi-core: 58 files/1300 tests passed; pi-subagents: 116 files/2601 passed, 1 skipped; pi-todo: 33 files/562 passed; pi-background-tasks: 53 files/809 passed, 4 skipped. No isolated Windows rerun was needed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E10",
      "kind": "gate-execution",
      "locator": "Root and four touched-package typechecks; pnpm run check:ci; skills/thoth-sdd/scripts/validate.mjs --through verify --json; git diff --check",
      "claim": "All exited 0. SDD validation returned valid:true with no errors. Biome reported warnings/information only; the SDD added-requirement overlap warning was reviewed against the canonical baseline.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect shared shell and adapter migrations; execute chrome, help, position and adapter regression tests.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E9"],
      "reason": "Shared English chrome, modal-aware hints, help, positions and extension slots satisfy the contract."
    },
    {
      "check": "AC-2",
      "method": "Inspect row/summary formatting and execute width, glyph-mode and status tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E9"],
      "reason": "Distinct non-color status glyphs, semantic colors, names without suffixes and aligned compact metrics are covered in both layouts."
    },
    {
      "check": "AC-3",
      "method": "Inspect header/details and execute header, every-view details and wrapping regressions.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E9"],
      "reason": "Two-line card and labeled details work; stopping/terminal tasks suppress activity/stall diagnostics, and clipping uses ellipses."
    },
    {
      "check": "AC-4",
      "method": "Inspect grouping/filter state and execute attention-boundary, collapse, refresh, mouse and Escape tests.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E9"],
      "reason": "Required group ordering, newest-first members, hidden empty groups and name/agent/status filtering are implemented."
    },
    {
      "check": "AC-5",
      "method": "Inspect all views and execute selection, retention, Tools, scrolling and over-width-content tests.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E9"],
      "reason": "Views/defaults and unavailable states behave correctly. Round-2 content loss is repaired across every identified text surface."
    },
    {
      "check": "AC-6",
      "method": "Inspect manager/TUI wiring and execute action, confirmation, clipboard and error-path tests.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E9"],
      "reason": "Eligible-only actions, safe confirmations, manager-default extension and transient copy/failure notices are verified."
    },
    {
      "check": "AC-7",
      "method": "Review regression paths and execute all four package suites.",
      "outcome": "pass",
      "evidenceIds": ["E7", "E8", "E9"],
      "reason": "Native/kit rendering, thoth-theme tools.collapsed density, hydration/cache behavior, mouse/wheel, focus and other panels are preserved; non-Transcript refresh avoids transcript processing."
    },
    {
      "check": "Durable deltas, decisions and non-goals",
      "method": "Compare actual diff and declared deltas with the hashed canonical specification.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E8"],
      "reason": "Baseline is current, declarations are coherent and no out-of-scope lifecycle/schema/preferences changes were introduced."
    },
    {
      "check": "Required execution gates",
      "method": "Run sequential bounded package Vitest suites, root/touched-package typechecks, check:ci and SDD verify validation.",
      "outcome": "pass",
      "evidenceIds": ["E9", "E10"],
      "reason": "All required commands completed successfully."
    },
    {
      "check": "Input freshness and whitespace",
      "method": "Compare before/after record, specification and working-tree content hashes; run git diff --check.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E10"],
      "reason": "Reviewed inputs remained unchanged."
    },
    {
      "check": "Build",
      "method": "Not rerun.",
      "outcome": "not-run",
      "evidenceIds": [],
      "reason": "Explicitly excluded from this assignment; implementer reported exit 0."
    }
  ],
  "risks": [
    {
      "description": "OSC 52 remains best-effort: terminals may silently reject clipboard writes, and tmux passthrough is intentionally unsupported.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6", "E8"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate the delivered verdict, record this unchanged PASS envelope and digest, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/subagents-panel-ux-redesign/subagents-panel-ux-redesign.md",
    "reviewedRecordSha256": "dc5532cf421dc9e685ad552238971795b5ff3aa5cd4085bddc1ecfa54505ec99"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

Round 1 final verification: fresh Oracle FAIL (recordSha256 e7026f544e9b16abff51dabea6165fa7468637c3e5eeadce0468fa15b4c6c2b8, valid delivered verdict). Gates all green; acceptance-linked repairs routed to a Worker: (AC-1) footer hints must be modal-aware while the `?` help overlay is open; (AC-2) `stopping` and `cancelled` must render distinct non-color glyphs; (AC-3) `i` details must work from the default Result view and the unavailable-detail Transcript without transcript processing; (AC-3) activity/stall diagnostics only for `running`, not `stopping`.

Round 2 final verification: fresh Oracle FAIL (recordSha256 dc5532cf421dc9e685ad552238971795b5ff3aa5cd4085bddc1ecfa54505ec99, valid delivered verdict). Round-1 findings verified repaired; new AC-5 blocker: `wrap()` in subagents-history-panel.ts does not split an over-width first token, so Result/Prompt clip retained content. Non-blocking: docs still describe `i` as Transcript-only. Both routed to a Worker.

Round 3 final verification: fresh Oracle PASS, valid delivered verdict (mode record, recordDigest match).

- AC-1: PASS | pi-core history-panel chrome/help/position/slot tests + todo/bg adapter regressions | Oracle E3, E9
- AC-2: PASS | panel-list.test.ts glyph-mode/width/summary tests | Oracle E4, E9
- AC-3: PASS | panel-header.test.ts + every-view details and wrapping tests | Oracle E4, E5, E9
- AC-4: PASS | grouping/filter/attention/collapse/mouse/Escape tests | Oracle E3, E4, E9
- AC-5: PASS | panel-views, panel-view-selection, panel-wrapping tests | Oracle E5, E9
- AC-6: PASS | panel-actions, panel-overlay-focus, panel-clipboard tests | Oracle E6, E9
- AC-7: PASS | four package suites, thoth-theme density integration test, typechecks, check:ci, build (implementer) | Oracle E7, E8, E9, E10
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:ac291c6b96d554df0c174fb17b2a09156a15e55f30ff159d50a27b80485f1717

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
