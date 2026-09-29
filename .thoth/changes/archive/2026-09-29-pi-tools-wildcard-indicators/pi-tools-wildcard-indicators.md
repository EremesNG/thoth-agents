# Change: pi-tools-wildcard-indicators

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- User tested the adopted runtime and requests an additional all-tools choice alongside all active, correct wildcard support, and simpler animated subagent indicators. Current clean worktree is migration/pi-j0k3r at 0923570, already merged into 0.5.0 at 8822db7. This follow-up changes the existing reviewed implementation, not the archived adoption record.
- Terminal Explorer explore_tool_wildcard confirms root src/pi.ts supplies both getAllTools and getActiveTools to src/pi/tools-panel.ts. Existing active-all is additive and explicit; src/cli/pi-tool-config.ts rejects wildcard values and its parser is reused by synchronization. Safe stale/partial-save handling already exists.
- Fork src/tool-patterns.ts supports patterns, but src/runner/sdk-runner.ts expands them from active-parent getTools rather than the full registered inventory. Lean child resources reload extension implementations. Cached root tool definitions in thread-view.ts are rendering data, not an executor bridge. Correct execution needs a child-session availability check, not only expanded names.
- Terminal Explorer explore_pi_indicators locates decorative ARCH_ICON prefixes, static widget running markers and the active-only one-second redraw timer. Existing render/tools/progress.ts already contains the ten-frame braille cycle. Selection bullets in history are unrelated to execution status.
- Terminal Explorer explore_widget_metrics_visibility traces the screenshot gap to layout: buildClaudeBackgroundWidgetEntries appends all metrics after the full task description and the renderer truncates the whole row. Existing narrow tests cover only queued rows. Manager started_at and activity metric propagation exist; a dedicated metrics row must protect them. Optional SDK methods can still leave genuinely unavailable fields, which must remain explicit rather than invented.
- User's gotgenes README reference was inspected at https://github.com/gotgenes/pi-packages/blob/main/packages/pi-subagents/README.md after the raw endpoint failed. It documents animated running glyphs and simple completed/stopped/error indicators. No external runtime is imported.

## Intent

Make all an opt-in dynamic wildcard selection including inactive and future tools, make all active a compact dynamic active-tools selector, replace decorative subagent status indicators with a consistent animated braille spinner and simple terminal-state symbols, and keep requested runtime metrics visible in the widget.

## Non-goals

- No change to role defaults, automatic wildcard migration, root active tools, model selection, concurrency, task lifetime, telemetry accounting, credentials, or unrelated harnesses.
- No global installation, publication, push, automatic commit/merge, or edits to the archived adoption record.
- No synthetic executors, copied root-only lifecycle hooks, or claims that a registered name proves executable child support.

## Acceptance

- AC-1: /subagents-tools provides distinct all and all active actions. All saves exactly the canonical wildcard * and visibly means current and future eligible tools including inactive root tools. All active saves the compact selector @active rather than enumerating names and resolves current eligible active root tools at launch. Switching either selector to individual editing materializes its current explicit checklist so dynamic inclusion is no longer implicit. Save/cancel/defaults, dirty protection, unavailable explicit selections, stale/partial-write recovery and unrelated fields retain their existing contracts.
- AC-2: The root backend accepts standalone * and standalone @active selections, preserves either through save/reload and specialist synchronization, and continues rejecting empty lists, mixed selectors, unsupported patterns and reserved explicit tools. Existing explicit configurations and defaults are not widened or automatically migrated.
- AC-3: At each child launch, * expansion uses the full currently registered tool inventory, including inactive and newly registered tools, while @active uses the current active root inventory; neither expands permanently during save. Compatibility fallback uses the older inventory API only when needed. Recursive subagent controls and root-only question/planning controls remain excluded. Child-loadable inactive tools actually execute under *; missing implementations produce an actionable launch diagnostic instead of silent omission, invented executors or fallback widening. Explicit-tool behavior remains unchanged except preserving the established reserved-tool restrictions.
- AC-4: Active subagent indicators use the shared ten-frame braille cycle, animated approximately every 100 ms in the active widget; completion uses a check, cancellation/stopping a square, failure a cross and queue a simple hollow dot where a status glyph is shown. Status text/colors, selection/navigation bullets, layout, clipping and metrics remain meaningful. No timer runs while idle or queue-only; completion, replacement and shutdown clear timers/listeners without blocking root input.
- AC-5: Focused behavior-first tests cover panel persistence, wildcard sync/resolution and executable inactive-tool behavior, status/frame changes and timer cleanup. Applicable root/fork checks and an independent Oracle review pass; visual evidence distinguishes component rendering from actual live Pi observation.
- AC-6: The active widget visibly reports turns, tool uses, lifetime tokens, child-context percentage when available and active elapsed time. Long task descriptions or model labels MUST NOT displace all metrics off the row; compact or separate metric rows preserve readability across normal and narrow widths. Values come from actual child execution, with absent values visibly unavailable rather than fabricated. Initial absence of metric values does not hide elapsed time or later live updates.

## Clarifications

- RESOLVED: User explicitly chose to save * for all current and future tools, including inactive tools, rather than a fixed list.
- RESOLVED: User expanded the request after the first ready draft: all active must also use a wildcard-like compact dynamic selection, and widget metrics must be visible. Use @active as the distinct reserved selector; this supersedes the earlier explicit-snapshot all-active decision. Defaults and existing explicit lists remain unchanged. Existing reserved recursive/root-control exclusions remain because no override was requested.
- RESOLVED: Child availability is a bounded technical question. Use the installed SDK public loader/session APIs, prove an inactive tool invocation, and report absent implementations clearly. Do not silently reduce the user's selection or import root closures as substitute executors.
- RESOLVED: Use conventional braille/check/square/cross status glyphs; retain unrelated history selection markers and branding not serving as a task status.

## Decisions

- Substantial classification follows the coordinated persistence/runtime capability contract across two packages, not file count. Root owns the record and accepted interfaces; backend, runtime, tools UI and widget/rendering units have non-overlapping owned surfaces. Native capacity admits three children at once and downstream UI waits for accepted backend output.
- Canonical persisted selectors are single-element lists containing * or @active. They cannot be mixed with names or each other in the root editor. Other wildcard patterns remain unsupported by the root editor. The standalone runtime retains existing pattern support without widening existing explicit defaults.
- Public verification seams are the existing tools panel and configuration/synchronization APIs, child session creation and tool invocation, rendered status output, and widget timer lifecycle. The user's implementation request authorizes these necessary focused checks.
- Missing child implementations fail clearly rather than claiming all tools were enabled. Investigate installed APIs within the runtime unit; return any missing API or unbounded executor problem before expanding scope.
- The native session limit prevents fresh agent dispatch. The user explicitly selected reuse of existing sessions for this task while retaining an independent Oracle. This task-specific exception permits sequentially reassigning the terminal widget Designer to the tools panel and reusing the read-only plan Oracle for final verification; it does not permit an implementation writer to approve its own work. Other ownership and verification requirements remain unchanged.
- A subsequent fresh dispatch succeeded for verify_tool_selectors_final. Final verification will therefore use that new read-only Oracle; the authorized reuse was needed only for the sequential Designer assignment. Standalone * alone uses full inventory; legacy partial patterns and mixed wildcard lists keep active-only matching.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same UI design with safe tool persistence; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST distinguish all-active selection persisted as standalone @active from opt-in all selection persisted as standalone *, covering respectively eligible currently active tools or all current and future registered tools including inactive root tools. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve either selector and child launch MUST resolve its current inventory and report missing child implementations truthfully.
  - GIVEN explicit or wildcard operator selections and inactive registered tools; WHEN the panel saves, synchronization runs and a child launches; THEN operator intent persists, eligible child-loadable tools are available and missing implementations are diagnosed without silent widening or omission.
- `MODIFIED multi-harness-agent-pack` **Run visible background Pi specialists** — Omitted mode MUST run specialists in background while respecting explicit modes, and the runtime MUST display truthful live execution metrics in a tree above input. Turns, tool uses, lifetime tokens, available child-context percentage and active elapsed time MUST remain readable even with long task/model text, using compact or separate metric rows as needed and marking absent values without fabrication. Running status MUST use an animated braille indicator and terminal statuses MUST use simple distinguishable completion, cancellation and failure glyphs. Animation MUST remain inactive when no child runs and MUST clean up on task termination or session teardown without blocking root input.
  - GIVEN a child running or queued and later completing or stopping; WHEN the UI renders and the session tears down; THEN metrics and status symbols remain truthful, root stays interactive and no idle animation timer remains.

## Plan

1. Backend worker changes validation to accept canonical standalone * and @active, proving correct scalar serialization, persistence and sync preservation. Existing explicit lists and role defaults remain intact; arbitrary/mixed selector patterns remain invalid in the root editor.
2. Runtime worker resolves * against the full inventory and @active against the active inventory at each spawn. Verify installed child tool APIs and prove an inactive child-loadable extension tool executes; fail diagnostically for missing implementations. Preserve reserved exclusions and existing explicit semantics. This fork runtime contract is independent of the root editor implementation.
3. Tools Designer, after accepted backend output, adds both compact selector modes with safe transitions to explicit lists and retains safe editor behavior. Update direct root guidance.
4. Widget Designer uses the accepted visible-metrics diagnosis and shared braille/status mapping in widget and task renderers. Reserve readable metric space, advance frames on an active-only timer, preserve clipping/input handling and update fork guidance. Actual runtime metrics absent after a proven child event escalate to the runtime owner before any overlapping write.
5. Root integrates terminal outputs, runs focused/root/fork verification, records actual visual evidence and freezes the diff. A fresh read-only Oracle verifies all outcomes before closeout and archival.

## Tasks

- [x] AC-2: Canonical wildcard persistence.
  - Outcome: opt-in * and @active survive editing, persistence and synchronization.
  - Known entrypoints and skill paths: src/cli/pi-tool-config.ts, src/cli/pi-resources.ts and tests; installed C:/Users/EremesNG/.agents/skills/tdd/SKILL.md and simplify/SKILL.md.
  - Inputs: accepted Explorer wildcard discovery and explicit user dynamic-all decision.
  - Dependencies: none; canonical standalone selector interface fixed in this record.
  - Output: backend patch and red-green persistence checks.
  - Owner: worker.
  - Writes: named root backend sources and corresponding tests only.
  - Interface boundaries: no root tools-panel or fork widget/theme/extension/rendering writes; preserve reserved controls and safe persistence.
  - Focused check and PASS evidence: existing public config/sync tests prove wildcard round trip, stale/partial recovery and unchanged explicit selection.
  - Return milestone: terminal patch with focused tests, typecheck, simplify and exact downstream contract.
  - Stop / reassessment: persistence contract ambiguity or shared-file conflict returns evidence before expansion.
- [x] AC-3: Executable full-inventory wildcard resolution.
  - Outcome: dynamic all/all-active selectors select actual child-loadable tools and diagnose missing implementations.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tool-patterns.ts, src/config.ts, src/runner/sdk-runner.ts and test/config.test.ts, test/runner/interaction-bridge.test.ts; installed tdd and simplify skills under C:/Users/EremesNG/.agents/skills/.
  - Inputs: accepted runtime discovery and settled dynamic-all contract.
  - Dependencies: none; fork already accepts wildcard definitions independently of the root editor.
  - Output: runtime patch with executable inactive-tool and newly registered-tool evidence.
  - Owner: worker.
  - Writes: named fork runtime/config/pattern sources and corresponding tests only; public SDK seam additions require bounded root reassessment.
  - Interface boundaries: no extension/rendering/panel writes; preserve reserved controls and explicit semantics.
  - Focused check and PASS evidence: runner/config tests exercise wildcard, actual inactive-tool execution, future inventory refresh and missing-tool diagnostics.
  - Return milestone: terminal patch, focused tests/typecheck and simplification evidence.
  - Stop / reassessment: unavailable SDK API or root-only executor problem returns evidence before expanding.
- [x] AC-1: Distinct all-tools control.
  - Outcome: visible editable all (*) and all-active (@active) modes, distinct from explicit tool lists.
  - Known entrypoints and skill paths: src/pi/tools-panel.ts and tests; installed tdd, simplify and progressive-context-router skills under C:/Users/EremesNG/.agents/skills/.
  - Inputs: accepted tool-panel discovery, canonical standalone selector interface, and user screenshots.
  - Dependencies: accepted AC-2 backend output to exercise real validation and persistence.
  - Output: all/all-active UI with meaningful render verification.
  - Owner: designer.
  - Writes: named root panel and corresponding tests plus root README/docs direct guidance only.
  - Interface boundaries: no backend validator/synchronizer or fork runtime edits; preserve model UI and safe state handling.
  - Focused check and PASS evidence: panel all/save/cancel/explicit-edit tests and accurately identified render or live evidence.
  - Return milestone: terminal coherent UI patch with scoped tests and visual observations.
  - Stop / reassessment: shared backend interface mismatch or unrelated renderer expansion returns bounded evidence to root.
- [x] AC-4: Simple animated subagent status indicators.
  - Outcome: consistent braille/check/square/cross task-state rendering and active-only animation.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/background-widget.ts, src/ui/theme.ts, src/extension/subagents-extension.ts, src/render/tools/progress.ts, src/render/tools/subagent-run.ts, src/render/tools/subagent-continue.ts, src/render/completion-message.ts and focused tests; installed tdd and simplify skills under C:/Users/EremesNG/.agents/skills/.
  - Inputs: terminal indicator discovery, user screenshots and gotgenes reference.
  - Dependencies: none; rendering/timer surfaces are disjoint from wildcard runtime/backend work.
  - Output: shared status animation and visual checks.
  - Owner: designer.
  - Writes: named fork widget/theme/extension/rendering sources and tests, fork README guidance only.
  - Interface boundaries: preserve task/telemetry semantics, input handling and history selection bullets; no runner/config/root panel edits.
  - Focused check and PASS evidence: frame/state render tests and active-only timer lifecycle checks including completion/replacement/shutdown and narrow width.
  - Return milestone: terminal focused patch and accurately identified visual evidence.
  - Stop / reassessment: overlapping production ownership or unrelated indicator expansion returns to root.
- [x] AC-6: Readable actual metrics in the active widget.
  - Outcome: required runtime metrics remain visible with long agent/model/task descriptions.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/background-widget.ts and test/ui/widget.test.ts; read src/types.ts, src/runner/snapshot-builder.ts and src/manager.ts if needed; installed tdd and simplify skills under C:/Users/EremesNG/.agents/skills/.
  - Inputs: terminal accepted explore_widget_metrics_visibility diagnosis and user evidence of absent metrics.
  - Dependencies: accepted metrics diagnosis; same widget owner as AC-4 to prevent concurrent writes.
  - Output: compact/reserved metric row layout and tests with realistic long task text.
  - Owner: widget designer in the cohesive AC-4 widget assignment.
  - Writes: widget renderer and tests only unless diagnosis requires root-approved runtime reassessment.
  - Interface boundaries: use existing runtime metrics/usage fields; distinguish absent values and zero values; preserve lifetime token definition and child-only context attribution.
  - Focused check and PASS evidence: renderer at narrow and normal widths visibly contains turns/tools/tokens/context/elapsed for known values, honest absent placeholders and live updates; visual inspection accurately identified.
  - Return milestone: combined widget patch terminal with metrics and animation evidence.
  - Stop / reassessment: missing child metric delivery after actual runtime events routes a bounded runtime change before overlap.
- [x] AC-5: Integrated behavior and independent acceptance.
  - Outcome: all acceptance criteria verified on the frozen combined patch.
  - Known entrypoints and skill paths: this record, existing root/fork check commands and installed thoth-sdd verification/archival contracts.
  - Inputs: accepted terminal backend, runtime, tools UI and widget patches.
  - Dependencies: all implementation units terminal and fresh.
  - Output: integrated checks, independent Oracle verdict and canonical durable updates.
  - Owner: root plus fresh read-only oracle.
  - Writes: sole record and declared specs through archive only.
  - Interface boundaries: no implementation changes during review; converge any concrete blocker with its owner.
  - Focused check and PASS evidence: root check:ci/typecheck/build/tests, fork typecheck/tests and scoped visual/runtime checks; independent actual-diff review.
  - Return milestone: independent PASS and valid closeout.
  - Stop / reassessment: any acceptance gap remains incomplete, not waived by green narrow checks.

## Authorization

**Plan review**: OKAY
**Implementation**: AUTHORIZED

The user requests implementation of these adjustments and explicitly chooses dynamic all through *. This authorization covers the described code/tests and bounded isolated verification; it does not authorize global installation or publication.

The optional native plan-review choice initially returned no answer and root admitted two implementation units using existing authorization. The user subsequently explicitly requested Oracle plan review; root interrupted both native agents and confirmed interrupted status. Git status contains only this new record, with no implementation edits. The explicit review request supersedes the skipped-review disposition. A fresh Oracle now reviews the updated plan before implementation resumes; final independent verification remains separately required.

Fresh read-only review_tool_selectors_plan returned [OKAY] without execution blockers after checking the record, constitution, canonical requirements, persistence/parser/runner/timer sources and independently passing ready validation. The stale task wording describing all active as explicit is corrected to dynamic @active. Real SDK invocation evidence remains required. Plan judgment does not authorize implementation: the separately recorded user implementation request and selector decision above remain the authorization; the added review prerequisite is now satisfied without inventing a new approval.

## Verification

Final frozen implementation evidence: after updating only the two obsolete completed-status expectations, all 365 fork tests in 32 files pass. The focused correction also passed all three tests, scoped Biome and diff checks. All implementation writers are terminal. Root checks (1143 tests, typecheck, build, package checks) remain fresh because only fork code/tests and documentation changed afterward. Final Oracle verify_tool_selectors_final receives the frozen actual diff, this record and the real SDK execution evidence. Visual verification remains component rendering, not a live Pi session.

Accepted terminal runtime_tool_selectors: standalone * resolves fresh full inventory; @active resolves active inventory including an empty set; legacy patterns remain active-only and reserved controls are excluded. Missing child implementations retain the tool name in the public structured error. All 51 focused tests in three files pass, including actual execution of an inactive root extension tool in a real SDK child session; fork typecheck, scoped Biome and diff check pass. The real fixture originally used tools: [] on the root, which SDK 0.85.1 treats as an empty registry allowlist. Independent Explorer diagnosis identified this fixture error; the corrected test registers normally then calls setActiveToolsByName([]), preserving registration while deactivating the root tool. No production loader workaround was needed. Final combined check:ci now passes. Initial full fork suite passed 364 tests with one obsolete decorative-glyph expectation; the widget owner is correcting that test before integrated acceptance.

Integrated root evidence: pnpm run typecheck and pnpm run build pass; pnpm test passes all 1143 tests in 100 files using the established isolated CODEX_HOME removal and THOTH_PLUGINS_ROOT fixture location. node scripts/verify-pi-package.mjs passes isolated installation/session-start checks; fork verify-package-files.mjs passes all 18 resources. Build introduced no generated-file drift. git diff --check passes. These checks do not constitute live UI evidence or independent acceptance.

Accepted terminal tools-panel assignment: all stores * and all active stores @active; editing a checkbox materializes the current eligible selection. Thirty panel/command tests, root typecheck, scoped Biome and diff checks pass. Component summaries remain readable at 40 columns. Root refreshed only the stale fork selector documentation after the runtime owner confirmed standalone selectors versus legacy active-only patterns. Root integrated typecheck and build pass; full root tests are running. Initial combined Biome check identified formatting in the still-active runtime assignment, forwarded to its owner for closure.

Accepted terminal refine_widget_status_metrics AC-4/AC-6: ten-frame braille animation and simple completion/cancellation/error/queue glyphs, with responsive dedicated metrics preserving actual turns/tools/lifetime tokens/context/elapsed at 100/80/50 columns. Unknown values are marked and actual zero remains visible. Two-agent narrow rendering preserves click ownership. Fifty-four focused tests, scoped Biome and diff check pass. Evidence is rendered components, not live Pi. Intermediate fork typecheck reports three concurrent runtime-worker test signature errors; final integrated check waits for that writer. User explicitly authorized session reuse after the native thread limit; the terminal Designer now has a separately bounded tools-panel assignment and no longer writes the widget surface.

Accepted terminal persist_tool_selectors: validator accepts exactly standalone * and @active, rejects mixed/repeated selectors and unsupported patterns, and preserves reserved explicit controls. Existing quoted YAML serialization is unchanged and proven through save/reload and sync idempotence. Focused config/sync checks pass 61 tests, root typecheck, scoped Biome and diff check. No source change to pi-resources.ts was necessary; exported consumer interfaces are unchanged string-array contracts. A fresh Tools Designer dispatch then failed with native agent thread limit reached. No UI writer was created. Existing runtime and widget writers remain active; root requested an explicit operating choice about the fresh-session constraint rather than pretending delegation succeeded or doing unrestricted fallback work.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 78a59348a487a725a9c43b555f47edd68d129105ac075f037e415a9a9e309e67

- AC-1: PASS | 30 panel/command tests, root typecheck, scoped Biome and component rendering | all stores *, all active stores @active; checkbox edits materialize explicit selections; dynamic summaries remain readable at 40 columns. No live Pi session was opened.
- AC-2: PASS | 61 config/sync tests, typecheck and scoped lint | standalone selectors round-trip as quoted values and survive synchronization without changing defaults or safe persistence behavior.
- AC-3: PASS | 51 runtime/config tests and fork typecheck | real SDK child executes an inactive-root extension tool selected through *; next-launch inventory refresh, empty active selection, reserved controls and named missing-implementation errors verified.
- AC-4: PASS | focused renderer/lifecycle tests and component inspection | braille frames and simple distinct status symbols verified; active-only timer cleanup covered.
- AC-5: PASS | fresh independent verify_tool_selectors_final and full integration checks | Oracle reviewed actual diff and all acceptance criteria, independently passed 24 real-SDK/interaction tests and verified record/spec digests. Root 1143 tests, fork 365 tests, root/fork typechecks, build, lint and packaging pass. No blockers. UI evidence is component-only; real SDK evidence proves loaded child extension execution, with production runner wiring supported by mocked tests and source review. Extensions dependent on excluded root hooks may fail with actionable launch diagnostics.
- AC-6: PASS | long-task component checks at 100/80/50 columns | actual metrics and elapsed remain readable; unavailable and zero values distinguished; two-agent wrapped navigation verified.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:90d514a43cdbda8704b887ecc327d73adc64a03e949cf20bcd277ba6482d41d7

## Closeout

**Archive**: READY
