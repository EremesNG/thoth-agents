# Change: explicit-tools-default

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- The archived change of 2026-10-04 on default availability made Thoth
  generate, for all five specialists, a common `disallowed_tools` (interactive
  user-question tool, task-list tool, nine third-party delegation tools), Oracle
  also denying `ask_orchestrator`; runtime natively excludes only `subagent_*`;
  `ask_orchestrator` is injected for every child when enabled.
- `src/harness/writers/pi-agent.ts::getPiSpecialistDefaultTools` already produces
  explicit tool lists per role; `renderPiAgentDefinition` adds the common denylist.
- `src/pi/tools-panel.ts` edits only `tools`, offers a dynamic standalone `*` mode
  with its own exclusion constants and preview, and reads `disallowed_tools` for
  that preview. `src/cli/pi-resources.ts::preserveOverrides` keeps operator `tools`
  and operator `disallowed_tools`.
- Runtime (`pi-packages/pi-subagents/src/runner/sdk-runner.ts::resolveConfiguredTools`,
  `src/tool-patterns.ts::expandToolPatterns`): standalone `*` is a special case
  resolved against root-active tools; patterns expand against the active inventory.
- Installed SDK 1.0.1 and `pi-agent-browser-native`: a tool inactive in the root
  (for example `agent_browser_action`) excluded from the child's SDK allowlist
  cannot be activated by the child's `agent_browser_tools` (`pi.setActiveTools`);
  it reports unavailable without error. An explicitly named tool reaches the child
  registered and active even when inactive in the root
  (`AgentSession._refreshToolRegistry`); lean isolation keeps tool definitions.
- External comparison (pinned): gotgenes, nicobailon, tintinweb and OpenCode give
  read-only bundled agents explicit allowlists; gotgenes expands MCP patterns
  against registered tools; no reference ships a dedicated denylist editor.

## Intent

Explicit exact-name `tools` lists are the default and the only form the tools
panel edits. Standalone `*` loses its special dynamic semantics and becomes an
ordinary glob. Every glob, including `*`, expands against all tools registered in
the root session (active and inactive), minus the native `subagent_*` exclusions
and the definition's `disallowed_tools`, so families such as `agent_browser_*`
include root-inactive tools that children may activate. Thoth generates explicit
lists for all five specialists and only Oracle declares `disallowed_tools`
(`ask_orchestrator`). `disallowed_tools` is documented as manual, for injected
tools absent from the panel and for trimming glob results.

## Non-goals

- Changing `ask_orchestrator` injection, YAML, identity or fallback rules.
- Editing `disallowed_tools` or globs from the panel.
- Migrating operator definitions: synchronization leaves operator `tools` (including `*` and other globs) and operator `disallowed_tools` unchanged.
- Other harnesses; package version bumps.

## Acceptance

- AC-1: Generated Pi specialist definitions use explicit role tool lists that add the Pi built-in search tools `grep`, `find` and `ls` to every role (explorer and oracle: `read, bash, grep, find, ls`; librarian: those plus its research tools; worker and designer: `read, bash, edit, write, grep, find, ls`), none lists the interactive user-question tool, the task-list tool or third-party delegation tools, only Oracle's definition carries `disallowed_tools` (exactly `ask_orchestrator`), and generated agents plus provenance are regenerated.
- AC-2: Runtime has no special case for standalone `*`: every glob (including `*`) expands against the root's registered tools (active and inactive) through one code path, minus `subagent_*` and `disallowed_tools`; exact names behave as today; a root-inactive tool matched by a glob reaches the child registered; if the registered inventory is unavailable, globs contribute nothing and the existing missing-selection reporting applies.
- AC-3: The `/subagents-tools` panel no longer offers the dynamic `*` mode or its control; it edits exact names only, lists registered tools (active and inactive) plus the child-provided `ask_orchestrator` note, and preserves any glob entries (including `*`) and unrecognized names on save, showing them read-only.
- AC-4: Synchronization keeps operator `tools` (including `*` and globs) and operator `disallowed_tools` unchanged; a definition without operator `disallowed_tools` receives the package value (none, or `ask_orchestrator` for Oracle).
- AC-5: Package README, configuration skill, root `README.md`, `docs/installation.md`, root guidance and routed docs describe explicit lists as the default, globs (including `*`) as manual advanced selections over all registered tools, and manual `disallowed_tools` for injected tools and trimming globs.
- AC-6: Package `pnpm run check` and root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` pass.

## Clarifications

- User decided explicit `tools` lists are the default; `disallowed_tools` covers injected tools not shown in the panel and is edited manually.
- User decided to keep globs, treat `*` as an ordinary glob, and remove `*` from the panel.
- User decided globs expand against all registered root tools (active and inactive).
- User decided synchronization must not migrate existing `*` selections.
- User decided every generated role gains the Pi built-in search tools `grep`, `find` and `ls`, aligned with the bundled read-only agents of gotgenes, tintinweb and nicobailon; setup-specific tools (codegraph, IDE index, LSP, browser) stay out of package defaults.

## Decisions

- Thoth-generated `disallowed_tools`: Oracle only, value `ask_orchestrator`.
- `getPiSpecialistDefaultTools` returns `read, bash`, then `edit, write` for mutating roles, then `grep, find, ls`, then the librarian research tools.
- One pattern expansion path in `pi-packages/pi-subagents/src/tool-patterns.ts` and `runner/sdk-runner.ts::resolveConfiguredTools`; inventory from the root's registered tools (`getAllTools`), not `getActiveTools`.
- The panel shows glob entries and names it cannot match as a read-only line and writes them back unchanged, including through defaults reset and partial-save retry; checkboxes edit exact names only. Persistence validation accepts retained globs without widening checkbox eligibility. Diagnostics that recommend standalone `*` are reworded to recommend exact names.
- Fallbacks stay as today: omitted `tools` gets runtime built-ins; an empty list uses `default_tools` through the shared resolver. The dynamic `*` control and its preview/exclusion constants are removed.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same UI design with safe tool persistence; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST edit exact tool names only, list the root's registered tools (active and inactive) and the child-provided `ask_orchestrator`, offer no dynamic `*` mode, reject `@active`, and preserve glob entries and unrecognized names unchanged on save. Tool selections MAY contain globs, where `*` is an ordinary glob; every glob expands against the root's registered tools, active and inactive, excluding the native `subagent_*` tools and the definition's `disallowed_tools`. Explicitly selected tools MUST reach the child even when inactive in the root, unless removed by configuration, `disallowed_tools` or native exclusions. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve operator tool selections including globs and an operator-set `disallowed_tools`, and child launch MUST resolve its current inventory; for every selection form, selected tools without a child implementation MUST be dropped and reported as a durable warning visible on the running task's widget card and on its status, result and completion, and launch MUST fail with a truthful missing-implementation diagnostic only when no selected tool remains.
  - GIVEN exact names and globs including `*` and `agent_browser_*`, with root tools that are inactive or lack a child implementation; WHEN the panel saves, synchronization runs and a child launches; THEN exact names and globs persist unchanged, globs include root-inactive registered tools minus `subagent_*` and `disallowed_tools`, missing implementations are dropped and reported, and the child fails only when nothing remains .
- `MODIFIED multi-harness-agent-pack` **Use Pi interactive questions truthfully** — Pi root instructions MUST use ask_user_question for material user choices, follow its supported question schema, handle unavailable UI and partial/cancelled answers truthfully, and MUST NOT infer approval from cancellation or absent answers. Thoth-generated Pi child definitions MUST use explicit tool lists that omit the interactive question tool; operators whose selections use globs deny it through `disallowed_tools`. Children MUST route user-facing questions to the root: through `ask_orchestrator` when it is enabled and not denied, otherwise through their return contract; the root decides whether to escalate to the user with ask_user_question before answering with `subagent_reply`.
  - GIVEN a Thoth-generated worker child with its default explicit tool list and the interactive question tool active in the root; WHEN it needs a user decision; THEN the tool is absent from the child and the child routes the question through `ask_orchestrator` .
- `MODIFIED multi-harness-agent-pack` **Keep Pi progress session-owned** — Pi root instructions MUST use the session-local task-list tool for useful multi-step progress, with the extension owning session-local task state. That tool MUST NOT replace Pi-native delegation lifecycle or canonical `.thoth/` project artifacts; child agents MUST report progress to root, and Thoth-generated Pi child definitions MUST use explicit tool lists that omit that tool, while operators whose selections use globs deny it through `disallowed_tools`. A child MAY report interim progress through `ask_orchestrator` progress updates, which are recorded on its task without triggering a root turn; otherwise it reports through its return contract.
  - GIVEN a Thoth-generated child with its default explicit tool list and the task-list tool active in the root; WHEN it launches and later has progress; THEN the task-list tool is absent from the child, and its progress update is recorded on its task without triggering a root turn .
- `MODIFIED multi-harness-agent-pack` **Pi children query the root orchestrator** — When enabled, every Pi child whose definition does not list it in `disallowed_tools` receives `ask_orchestrator` regardless of its tool selection form, may pose to its owning root a blocking question and continue in the same live session with the root's `subagent_reply` answer; non-blocking progress updates do not trigger a root turn. Pi agent definitions MAY declare `disallowed_tools`, exact tool names removed after `tools` resolution for every selection form including injected tools, while the native `subagent_*` exclusions always apply; denied names that are not installed are ignored and malformed values fail closed. Explicit exact-name `tools` lists are the default; globs, including `*`, are manual selections over all registered root tools, and `disallowed_tools` is edited manually in the definition file for injected tools and glob trimming. Pi agent definition frontmatter MUST parse as strict YAML; a definition that does not fails to load with a diagnostic and does not fall back to a lower-priority definition. Frontmatter is restricted to plain scalars, sequences and mappings; anchors, aliases, merge keys and explicit tags are errors. A definition's identity is its filename; a `name` that differs from it is an error. Selection-dependent wording elsewhere means this effective permitted selection. Thoth's generated specialist definitions use explicit tool lists, and only Oracle's declares `disallowed_tools`, denying `ask_orchestrator` to preserve independent judgment; children still never delegate.
  - GIVEN `enable_ask_orchestrator` true and Thoth-generated worker and Oracle definitions; WHEN both launch; THEN only the worker receives `ask_orchestrator`, Oracle's definition is the only one declaring `disallowed_tools`, and the worker's question returns the root's `subagent_reply` answer to that same child tool call .

## Plan

Two units with disjoint writes. Runtime (`pi-packages/pi-subagents`): remove the
standalone `*` special case and its exclusion constant; expand all patterns
against the registered inventory; keep exact-name, injection and denylist rules;
README and configuration skill. Thoth (`src/`, `pi/`, `docs/`): Oracle-only
generated denylist; remove the panel's dynamic `*` mode, preview and exclusion
constants (including the parity test), list registered tools, preserve glob and
unrecognized entries read-only; sync semantics unchanged except removing any `*`
special handling; guidance and routed docs; regenerate agents and provenance.

## Tasks

- [x] AC-2: Runtime single glob path over registered inventory
  - Outcome: no standalone `*` special case; all globs expand against registered root tools minus `subagent_*` and `disallowed_tools`
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/{tool-patterns.ts,runner/sdk-runner.ts}, test/runner/tool-selectors-real-sdk.test.ts, test/config.test.ts, README.md, skills/subagents-configuration/SKILL.md; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md, C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: this record
  - Dependencies: none
  - Output: runtime code, tests, package docs
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**, pi-packages/pi-subagents/README.md, pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md
  - Interface boundaries: no root src/ edits; injection, denylist, YAML and identity rules unchanged
  - Focused check and PASS evidence: package `pnpm run check` passes with real-SDK cases for `*` and `agent_browser_*`-style globs including root-inactive tools, denylist trimming and unavailable inventory
  - Return milestone: package check green
  - Stop / reassessment: registered inventory not obtainable from the parent context
- [x] AC-1: Thoth defaults, panel, sync, guidance, docs and regeneration
  - Outcome: Oracle-only generated denylist; panel without dynamic `*` preserving globs; sync unchanged for operator values; guidance and docs updated; assets regenerated
  - Known entrypoints and skill paths: src/harness/writers/pi-agent.ts, src/harness/adapters/pi.ts, src/agents/prompt-dialects.ts, src/cli/pi-resources.ts, src/cli/pi-tool-config.ts, src/pi/tools-panel.ts, src/pi.ts, pi/agents/thoth-*.md, pi/.thoth-agents-assets.json, docs/agent/agents-and-delegation.md, docs/agent/harness-packaging.md; tdd and simplify skills as above
  - Inputs: this record
  - Dependencies: none
  - Output: code, tests, regenerated assets, docs
  - Owner: thoth-worker
  - Writes: src/harness/**, src/agents/prompt-dialects.ts and test, src/cli/pi-resources.ts and tests, src/cli/pi-tool-config.ts and tests, src/pi/**, src/pi.ts, pi/agents/thoth-*.md, pi/.thoth-agents-assets.json, docs/agent/agents-and-delegation.md, docs/agent/harness-packaging.md, README.md, docs/installation.md
  - Interface boundaries: no pi-packages/ edits; other harness outputs unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/harness src/cli src/pi src/agents` passes with assertions for the per-role default lists including grep/find/ls, Oracle-only denial, absent common denylist, panel without `*` preserving globs, and sync retention
  - Return milestone: focused tests green and generated diff summarized
  - Stop / reassessment: panel cannot preserve globs without changing the snapshot contract beyond these files
- [x] AC-3: Covered by the Thoth unit (panel)
  - Outcome: accepted with the Thoth unit
  - Known entrypoints and skill paths: src/pi/tools-panel.ts
  - Inputs: as Thoth unit
  - Dependencies: Thoth unit
  - Output: panel tests
  - Owner: thoth-worker
  - Writes: as Thoth unit
  - Interface boundaries: as Thoth unit
  - Focused check and PASS evidence: panel tests show no `*` control, inactive tools listed, globs preserved read-only
  - Return milestone: with Thoth unit
  - Stop / reassessment: as Thoth unit
- [x] AC-4: Covered by the Thoth unit (sync)
  - Outcome: accepted with the Thoth unit
  - Known entrypoints and skill paths: src/cli/pi-resources.ts
  - Inputs: as Thoth unit
  - Dependencies: Thoth unit
  - Output: sync tests
  - Owner: thoth-worker
  - Writes: as Thoth unit
  - Interface boundaries: as Thoth unit
  - Focused check and PASS evidence: sync tests for operator `*`, globs, operator denylist and Oracle package value
  - Return milestone: with Thoth unit
  - Stop / reassessment: as Thoth unit
- [x] AC-5: Covered by both units (docs and guidance)
  - Outcome: accepted with both units
  - Known entrypoints and skill paths: docs listed in both units
  - Inputs: as both units
  - Dependencies: both units
  - Output: docs and guidance assertions
  - Owner: thoth-worker
  - Writes: as both units
  - Interface boundaries: as both units
  - Focused check and PASS evidence: guidance tests pass; docs reviewed by Oracle
  - Return milestone: with both units
  - Stop / reassessment: as both units
- [x] AC-6: Full checks and independent final review
  - Outcome: all checks pass and fresh Oracle PASS
  - Known entrypoints and skill paths: repository root; pi-packages/pi-subagents
  - Inputs: accepted units
  - Dependencies: both units accepted
  - Output: verification recorded here
  - Owner: root and thoth-oracle
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: package check; root check:ci, typecheck, build, pnpm test exit 0 with CODEX_HOME unset and THOTH_PLUGINS_ROOT set; Oracle PASS
  - Return milestone: Oracle verdict
  - Stop / reassessment: failing check returns to its unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 5cdb712a80c839fb5b038fdc3b949f63c8c3489d586bbe2340655413e52e0f7e

- AC-1: PASS | writer/adapter tests and generated-asset inspection | exact role lists include grep/find/ls; prohibited default selections absent; only Oracle declares disallowed_tools ask_orchestrator; provenance matches
- AC-2: PASS | package config and real-SDK selector tests (165 passed) | one registered-inventory glob path; no standalone-star special case; inactive matched tool activates and executes; exclusions, denials, unavailable inventory and missing-tool reporting verified
- AC-3: PASS | tools-panel, tools-command and persistence tests | no star control; inactive tools listed; ask_orchestrator informational; globs and unrecognized names survive editing, defaults reset and partial-save retry; @active rejected
- AC-4: PASS | pi-resources and pi-tool-config tests | operator tools/globs and explicit denials including empty persist; absent denials acquire package values
- AC-5: PASS | package README, configuration skill, root README, installation guide, guidance and routed docs review | explicit defaults, registered-inventory globs and manual denials agree; diagnostics recommend exact names
- AC-6: PASS | package check and root gates | package 994 passed/1 skipped; root check:ci no errors, typecheck and build exit 0, pnpm test 1262/1262 with CODEX_HOME unset and THOTH_PLUGINS_ROOT set; git diff --check clean
- Note: intentional compatibility change: existing globs, including operator `*`, now include inactive registered tools and are not migrated; registry filtering is not a sandbox.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:3c43352229056db5eb574ef7c75f2a3267a2816df85af0ef4e2179bf64016625

## Closeout

**Archive**: READY
