# Change: ask-orchestrator-default-availability

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- The previous `ask_orchestrator` change (archived 2026-10-03) made the child-only
  tool `ask_orchestrator` reach a child only when its resolved selection names it
  explicitly; standalone `*` and globs never match it.
- Runtime (`pi-packages/pi-subagents`):
  - `src/runner/sdk-runner.ts::sdkSubagentRunner` has the full `definition` before
    selection and calls `resolveConfiguredTools(patterns, ctx)`; standalone `*`
    expands from root active inventory, which never contains the child-only tool.
  - `src/tool-patterns.ts`: `STANDALONE_STAR_TOOL_EXCLUSIONS` contains
    `ask_orchestrator`; `matchesToolPattern` refuses it for globs.
  - `createSession` injects the implementation through `customTools` only when
    the selected names include it and `enable_ask_orchestrator` is true;
    `verifyChildToolSelection` compares registered and selected names.
  - `src/types.ts::SubagentDefinition` and `src/config.ts::loadSubagentsFromDir`
    keep only name, description, filePath, instructions, model, effort,
    subagent_mode, tools, scope; no per-agent tool denylist exists.
- Thoth (`src/`):
  - `src/harness/writers/pi-agent.ts::getPiSpecialistDefaultTools` names the tool
    for four roles, not Oracle; `renderPiAgentDefinition` emits no denylist field.
  - `src/cli/pi-resources.ts::syncPiSpecialists` / `preserveOverrides` start from
    the new package definition and replace only model/effort, tools and mode, so a
    new package field survives synchronization even with custom tools.
  - Panel `src/pi/tools-panel.ts::getToolItemsForRole` lists root-registered tools
    as active/inactive and saved-but-missing names as `unavailable`;
    `DYNAMIC_DELEGATION_TOOLS` excludes the tool from the `*` preview. `src/pi.ts`
    does not read `subagents.json`.
- Observed in use: the operator saved `tools: "*"` for all five roles; children
  then lacked the tool, and the panel showed it as `(unavailable)`.
- External comparison (pinned docs): @gotgenes/pi-subagents 23.0.0 and
  @tintinweb/pi-subagents 0.19.0 use an allowlist `tools` plus `disallowed_tools`;
  nicobailon pi-subagents 0.75.0 uses `tools` plus `excludeTools` applied after
  resolution, removing runtime-injected tools only by exact name; gotgenes always
  adds its child-to-parent tool `ask_parent` outside `tools`. None uses a pure
  deny-by-default model.

## Intent

With `enable_ask_orchestrator` true, every Pi child receives `ask_orchestrator`
regardless of its tool selection form. Agent definitions gain a generic
`disallowed_tools` denylist applied after selection resolution, covering injected
tools by exact name; Thoth's Oracle definition denies `ask_orchestrator`. The
hybrid model keeps `tools` (explicit list or `*`) as the allowlist. The runtime
natively excludes only the subagents package's own delegation tools; tools from
other packages are excluded through `disallowed_tools`, which Thoth generates by
default for its specialists. The tools
panel shows the tool as an active, child-provided item so the `*` preview
includes it.

## Non-goals

- Changing the question/reply/progress behavior, timeouts or handoff.
- Per-tool approval rules (allow/confirm/deny prompts, bash or path restrictions); a deny-by-default model; editing `disallowed_tools` from the panel.
- Reading `subagents.json` from the root panel.
- Other harnesses; package version bumps.

## Acceptance

- AC-1: With the channel enabled, a child whose definition does not deny it receives `ask_orchestrator` for standalone `*`, glob, explicit lists that omit it, and empty/default selections; disabled config still removes it everywhere.
- AC-2: Definition frontmatter `disallowed_tools` (comma string or YAML list of exact names) is parsed into `SubagentDefinition` and removes those names after `tools` resolution for every form (`*`, globs, explicit, defaults) including the injected `ask_orchestrator`; reserved delegation exclusions still always apply; SDK options, injection and verification all use one effective permitted selection, so disabled or denied names never become missing-implementation warnings and never reach the child; launch fails only when the effective permitted selection is empty; a malformed `disallowed_tools` fails the definition load with a diagnostic (fail closed), absence and an explicit empty value both mean no denial; every runtime definition's frontmatter is parsed as strict YAML (no heuristic or legacy line parser), and frontmatter that fails to parse, contains duplicate keys or is not a mapping fails the load with a diagnostic that blocks fallback; frontmatter is restricted to a plain YAML subset (scalars, sequences and mappings without anchors, aliases, merge keys or explicit tags) and any other construct fails the load with a diagnostic that blocks fallback; a definition's identity is its filename, a `name` that differs from the filename (case-insensitive) fails the load with a diagnostic, and every failed load blocks lower-priority definitions with that filename identity.
- AC-3: Child tool verification accepts the always-injected tool; the runtime's native exclusion set (for every selection form) contains only the subagents package's own delegation tools (`subagent_*`), so `ask_orchestrator`, the interactive user-question tool, the task-list tool and third-party delegation tools (`AskClaude`, `AskAntigravity`, `bg_delegate`, `bg_run_pi_attested`, `bg_result`, `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate`) are no longer hardcoded exclusions; denied names that are not installed are ignored silently (no warning, no failure).
- AC-4: Thoth's five generated Pi specialist definitions carry a default `disallowed_tools` with the interactive user-question tool, the task-list tool and the nine third-party delegation tools named in AC-3, and Oracle's additionally carries `ask_orchestrator`; the four other specialists no longer list `ask_orchestrator` in `tools`; synchronization preserves a valid operator-set `disallowed_tools` (including an intentional explicit empty value) and otherwise applies the package value even when operator tools are custom (including `*`), leaves a definition with a malformed operator `disallowed_tools` unchanged with a diagnostic, and generated agents plus provenance are regenerated.
- AC-5: The `/subagents-tools` panel lists `ask_orchestrator` as an active item described as child-provided (never `unavailable`); each role's `*` preview subtracts only the native `subagent_*` exclusions and that role's `disallowed_tools`, so it includes `ask_orchestrator` unless denied; panel/runtime native exclusion parity still holds.
- AC-6: Root guidance, package README/configuration skill and routed docs describe the always-on availability, `disallowed_tools` and the Oracle denial; package `pnpm run check` and root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` pass.

## Clarifications

- User decided the tool is always available to every child except Oracle, including explicit lists that omit it, and that the panel must treat it as active so `*` considers it.
- User chose the hybrid permission model (`tools` allowlist plus generic `disallowed_tools`) over a deny-by-default model, after the external comparison.
- After four independent verification rounds found progressively more adversarial fail-open spellings caused by keeping a legacy line parser beside YAML, the user decided runtime agent frontmatter is always strict YAML; legacy-valid but YAML-invalid forms (unquoted `tools: *`, unquoted descriptions containing `: `) now fail to load with a diagnostic telling the operator to quote them.
- After a fifth verification found a fallback bypass through a definition whose `name` differs from its filename, the user decided a definition's identity is its filename: a mismatching `name` is an error, and failed loads block lower-priority definitions by filename identity.
- After a seventh verification found merge-key and alias-key bypasses, the user decided agent frontmatter is a restricted plain YAML subset: anchors, aliases, merge keys and explicit tags are rejected structurally.
- User decided native exclusions cover only the subagents package's own delegation tools; other packages' tools go in `disallowed_tools`, and Thoth generates that default list for its specialists (names of uninstalled tools are inert).

## Decisions

- Permission model is hybrid: `tools` stays the allowlist (explicit list or `*`); a generic `disallowed_tools` subtracts afterwards by exact name, including injected tools. The runtime stays role-agnostic; Thoth emits `disallowed_tools: ask_orchestrator` for Oracle.
- Effective permitted selection: expand `tools`; append `ask_orchestrator` when enabled, or remove it when disabled; subtract `disallowed_tools` (names absent from the inventory are ignored); apply the native exclusions (`subagent_*` only). This single list feeds SDK `tools`, `customTools` injection and `verifyChildToolSelection`; only names in it that lack an implementation are reported as missing, unexpected registrations are still rejected, and an empty list fails launch. With an empty root inventory under `*`, the injected tool alone keeps the selection non-empty.
- `disallowed_tools` syntax: comma-separated string or YAML list of exact names; absent or explicitly empty means no denial; any other shape (non-string items, nested values, globs) is malformed. Runtime parses all frontmatter as strict YAML and fails the definition load on any parse error, duplicate key, non-mapping document or malformed denial; Thoth sync reads it through `src/cli/pi-tool-config.ts`, keeps valid operator values including explicit empty, otherwise uses the package value, and leaves malformed definitions unchanged with a diagnostic.
- Thoth default denylist for all five specialists: the interactive user-question tool, the task-list tool, and `AskClaude`, `AskAntigravity`, `bg_delegate`, `bg_run_pi_attested`, `bg_result`, `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate` (the exact names currently hardcoded in `pi-packages/pi-subagents/src/tool-patterns.ts` lines 1-12 and 45-47 besides `subagent_*`); Oracle adds `ask_orchestrator`.
- The panel reads each role's `disallowed_tools` from its definition snapshot for the preview; it does not edit it.
- The panel's synthetic active item describes the tool as child-provided and subject to `enable_ask_orchestrator` and `disallowed_tools`; it does not claim confirmed availability.
- The panel/runtime parity test spans both units and is evidence only after both are accepted.
- Thoth specialist default tool lists drop the explicit `ask_orchestrator` entry, since injection no longer depends on selection.
- The panel adds a synthetic active item for `ask_orchestrator` when the root inventory lacks it; it does not read runtime config.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same UI design with safe tool persistence; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST offer one dynamic selection persisted as standalone `*`, meaning the eligible tools currently active in the root session excluding the subagents package's own `subagent_*` tools and the role's `disallowed_tools`; delegation tools from other packages are excluded only through `disallowed_tools`; inactive registered tools MUST NOT be inherited by `*` and `@active` MUST be rejected rather than persisted or treated as a tool name. The panel MUST list the child-provided `ask_orchestrator` as an active item included in the `*` preview. Explicitly selected tools MUST reach the child even when inactive in the root, unless removed by configuration, `disallowed_tools` or reserved exclusions. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve `*` and an operator-set `disallowed_tools`, and child launch MUST resolve its current inventory; for every selection form, selected tools without a child implementation MUST be dropped and reported as a durable warning visible on the running task's widget card and on its status, result and completion, and launch MUST fail with a truthful missing-implementation diagnostic only when no selected tool remains.
  - GIVEN explicit, glob or dynamic operator selections and root tools that are inactive, delegation tools or lack a child implementation; WHEN the panel saves, synchronization runs and a child launches; THEN operator intent persists, `*` yields the child-loadable active eligible tools plus the child-provided `ask_orchestrator` (when enabled) minus native `subagent_*` tools and the role's `disallowed_tools`, explicit names reach the child even when inactive in the root, missing implementations are dropped and reported for every form, the child fails only when nothing remains, and nothing else is silently widened or omitted .
- `MODIFIED multi-harness-agent-pack` **Pi children query the root orchestrator** — When enabled, every Pi child whose definition does not list it in `disallowed_tools` receives `ask_orchestrator` regardless of its tool selection form, may pose to its owning root a blocking question and continue in the same live session with the root's `subagent_reply` answer; non-blocking progress updates do not trigger a root turn. Pi agent definitions MAY declare `disallowed_tools`, exact tool names removed after `tools` resolution for every selection form including injected tools, while the native `subagent_*` exclusions always apply; denied names that are not installed are ignored and malformed values fail closed. Pi agent definition frontmatter MUST parse as strict YAML; a definition that does not fails to load with a diagnostic and does not fall back to a lower-priority definition. Frontmatter is restricted to plain scalars, sequences and mappings; anchors, aliases, merge keys and explicit tags are errors. A definition's identity is its filename; a `name` that differs from it is an error. Selection-dependent wording elsewhere means this effective permitted selection. Thoth's generated specialist definitions deny the interactive user-question tool, the session-local task-list tool and known third-party delegation tools, and Oracle's also denies `ask_orchestrator` to preserve independent judgment; children still never delegate.
  - GIVEN `enable_ask_orchestrator` true, a worker child with `tools: "*"` and an Oracle child whose definition sets `disallowed_tools: ask_orchestrator`; WHEN both launch; THEN only the worker receives `ask_orchestrator`, and its question returns the root's `subagent_reply` answer to that same child tool call .
- `MODIFIED multi-harness-agent-pack` **Keep role permissions explicit** — The Pi extension and specialist definitions MUST apply the strongest native root and child tool controls available while stating that extension execution, root injection, resource materialization, process credentials, filesystem, and network access remain within the invoking user's privileges and are not an OS sandbox. Child tool registration filtered by `tools`, `disallowed_tools`, configuration and native `subagent_*` exclusions MAY be reported as runtime-verified registry filtering; all other role restrictions MUST be reported as instruction-level rather than unverified enforcement. Global @thoth-agents/pi-subagents configuration MUST request lean child resources and disabled continuation, preserving unrelated keys; project overrides can supersede global lean and full child resources are unsupported. Root-only lifecycle injection and synchronization MUST remain absent from lean children, while normal root injection remains singular and package skills remain manifest-discovered. Unowned specialist conflicts MUST be preserved/reported. Packed contents MUST remain thoth-owned without external implementations or provider assets, and non-Pi behavior MUST remain unchanged. Obsolete pi-subagents definition and builtin-disablement settings MUST NOT be presented as active @thoth-agents/pi-subagents controls.
  - GIVEN supported @thoth-agents/pi-subagents configuration and an Oracle definition denying `ask_orchestrator`; WHEN definitions and guidance are generated; THEN the denial is described as registry filtering, behavioral role limits as instruction-level, and no unsupported control is claimed as enforced .
- `MODIFIED multi-harness-agent-pack` **Use Pi interactive questions truthfully** — Pi root instructions MUST use ask_user_question for material user choices, follow its supported question schema, handle unavailable UI and partial/cancelled answers truthfully, and MUST NOT infer approval from cancellation or absent answers. Thoth-generated Pi child definitions MUST deny the interactive question tool through `disallowed_tools`, and children MUST route user-facing questions to the root: through `ask_orchestrator` when it is enabled and not denied, otherwise through their return contract; the root decides whether to escalate to the user with ask_user_question before answering with `subagent_reply`.
  - GIVEN a Thoth-generated worker child with `tools: "*"` and the interactive question tool active in the root; WHEN it needs a user decision; THEN the tool is absent from the child through its generated `disallowed_tools`, and the child routes the question through `ask_orchestrator` .
- `MODIFIED multi-harness-agent-pack` **Keep Pi progress session-owned** — Pi root instructions MUST use the session-local task-list tool for useful multi-step progress, with the extension owning session-local task state. That tool MUST NOT replace Pi-native delegation lifecycle or canonical `.thoth/` project artifacts; child agents MUST report progress to root, and Thoth-generated Pi child definitions MUST deny that tool through `disallowed_tools`. A child MAY report interim progress through `ask_orchestrator` progress updates, which are recorded on its task without triggering a root turn; otherwise it reports through its return contract.
  - GIVEN a Thoth-generated child with `tools: "*"` and the task-list tool active in the root; WHEN it launches and later has progress; THEN the task-list tool is absent from the child, and its progress update is recorded on its task without triggering a root turn .

## Plan

Interface fixed for both units: frontmatter key `disallowed_tools` (comma string
or YAML list of exact names, default empty); native exclusion sets in
`src/tool-patterns.ts` and `src/pi/tools-panel.ts` both reduce to `subagent_*`
(parity test kept); Thoth default denylist as listed in Decisions.

Runtime (`pi-packages/pi-subagents`): add `disallowed_tools?: string[]` to
`SubagentDefinition`, parse it in `loadSubagentsFromDir`; in `sdkSubagentRunner`
(or `resolveConfiguredTools` with the definition) apply the resolution order from
Decisions; reduce `STANDALONE_STAR_TOOL_EXCLUSIONS`, the glob guard and
`sanitizeTools` to the native `subagent_*` exclusions; update real-SDK selector tests and config tests; README and configuration
skill.

Thoth: `renderPiAgentDefinition` emits the common default denylist for all five
specialists plus `ask_orchestrator` for Oracle; update `validatePiSpecialistTools`
and carry parsed denials into role snapshots/drafts; `getPiSpecialistDefaultTools` drops the explicit entry; `preserveOverrides`
keeps an operator-set `disallowed_tools` and otherwise the package value; panel
synthetic active item and removal from `DYNAMIC_DELEGATION_TOOLS`; root
guidance/dialect wording; regenerate `pi/agents` and provenance; update tests and
routed docs.

Risks: an Oracle definition written before this change lacks the denial until
resynchronization writes `disallowed_tools`; operator-set `disallowed_tools` wins
over the package value, so an operator can deliberately re-enable the tool.

## Tasks

- [x] AC-1: Runtime always-on injection, generic `disallowed_tools` and `*` parity
  - Outcome: runtime injects the tool for all selection forms unless disabled or denied, parses and applies generic `disallowed_tools`, removes the `*`/glob exclusion
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/{types.ts,config.ts,tool-patterns.ts,runner/sdk-runner.ts}, test/runner/tool-selectors-real-sdk.test.ts, test/config.test.ts; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md, C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: this record's Exploration, Decisions and Plan
  - Dependencies: none
  - Output: runtime code, tests, README and configuration skill updates
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**, pi-packages/pi-subagents/README.md, pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md
  - Interface boundaries: frontmatter key `disallowed_tools`; no root src/ edits
  - Focused check and PASS evidence: package `pnpm run check` passes with new real-SDK cases for `*`, glob, explicit-omitting, denied and disabled, and a denial of an ordinary tool
  - Return milestone: package check green
  - Stop / reassessment: verification or SDK registry cannot accept unconditional injection
- [x] AC-2: Covered by the runtime unit (`disallowed_tools` parsing and application)
  - Outcome: accepted with the runtime unit
  - Known entrypoints and skill paths: as runtime unit
  - Inputs: as runtime unit
  - Dependencies: runtime unit
  - Output: denylist tests
  - Owner: thoth-worker
  - Writes: as runtime unit
  - Interface boundaries: as runtime unit
  - Focused check and PASS evidence: config and selector tests for `disallowed_tools` as string and list, against `*` and injected tools
  - Return milestone: with runtime unit
  - Stop / reassessment: as runtime unit
- [x] AC-3: Covered by the runtime unit (verification and exclusion set)
  - Outcome: accepted with the runtime unit
  - Known entrypoints and skill paths: as runtime unit
  - Inputs: as runtime unit
  - Dependencies: runtime unit
  - Output: verification tests
  - Owner: thoth-worker
  - Writes: as runtime unit
  - Interface boundaries: as runtime unit
  - Focused check and PASS evidence: real-SDK launch succeeds with injected tool for every form
  - Return milestone: with runtime unit
  - Stop / reassessment: as runtime unit
- [x] AC-4: Thoth Oracle denial, defaults, synchronization and regeneration
  - Outcome: all five generated specialists carry the common default denylist and Oracle also `ask_orchestrator`, other defaults drop the explicit entry, sync preserves operator or package `disallowed_tools` with custom tools, agents and provenance regenerated
  - Known entrypoints and skill paths: src/harness/writers/pi-agent.ts, src/harness/adapters/pi.ts, src/agents/prompt-dialects.ts, src/cli/pi-resources.ts, pi/agents/thoth-*.md, pi/.thoth-agents-assets.json; tdd and simplify skills as above
  - Inputs: this record's fixed interface
  - Dependencies: none
  - Output: code, tests, regenerated assets
  - Owner: thoth-worker
  - Writes: src/harness/**, src/agents/prompt-dialects.ts and test, src/cli/pi-resources.ts and tests, src/cli/pi-tool-config.ts and its test, src/pi/**, pi/agents/thoth-*.md, pi/.thoth-agents-assets.json, docs/agent/agents-and-delegation.md, docs/agent/harness-packaging.md
  - Interface boundaries: no pi-packages/ edits; other harness outputs unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/harness src/cli src/pi src/agents` passes with Oracle denial, sync retention (operator, explicit empty, package, malformed) assertions; the panel/runtime parity test may stay red until the runtime unit is accepted
  - Return milestone: focused tests green
  - Stop / reassessment: sync cannot retain the field without changing override semantics
- [x] AC-5: Covered by the Thoth unit (panel active item and preview)
  - Outcome: accepted with the Thoth unit
  - Known entrypoints and skill paths: src/pi/tools-panel.ts, src/pi.ts, src/pi/tools-panel.test.ts
  - Inputs: as Thoth unit
  - Dependencies: Thoth unit
  - Output: panel tests
  - Owner: thoth-worker
  - Writes: as Thoth unit
  - Interface boundaries: as Thoth unit
  - Focused check and PASS evidence: panel test shows the item active, never unavailable, and in the `*` preview; parity test passes
  - Return milestone: with Thoth unit
  - Stop / reassessment: as Thoth unit
- [x] AC-6: Docs, full checks and independent final review
  - Outcome: docs aligned, all checks pass, fresh Oracle PASS
  - Known entrypoints and skill paths: repository root; pi-packages/pi-subagents
  - Inputs: accepted runtime and Thoth units
  - Dependencies: runtime unit and Thoth unit accepted
  - Output: verification recorded here
  - Owner: root and thoth-oracle
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: package check; root check:ci, typecheck, build, pnpm test exit 0 with CODEX_HOME unset and THOTH_PLUGINS_ROOT set; Oracle PASS
  - Return milestone: Oracle verdict
  - Stop / reassessment: failing check returns to its owning unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d3e71853e72d0f60fb05fede1165296717b2798743869eb7379b12333a68b552

- AC-1: PASS | real-SDK selection tests | enabled injection covers explicit, wildcard, glob and empty/default selections; disabled channel removes it
- AC-2: PASS | parser/fallback regressions and independent differential checks | 349 focused runtime tests passed; 478 SDK/runtime/sync comparisons found zero fail-open cases covering B1-B6 (round 9, after rounds 1-8 closed B1-B5 via strict YAML, filename identity, plain-record, restricted subset)
- AC-3: PASS | exclusion and registry verification | only native subagent_* exclusions remain; denied uninstalled names produce no missing-implementation warnings
- AC-4: PASS | generation and synchronization tests | operator denials, explicit empty values and malformed preservation verified; all five generated provenance hashes match
- AC-5: PASS | panel tests and exclusion parity | child-provided item is active, never unavailable; previews subtract role denials
- AC-6: PASS | docs and full checks | package check 983 passed/1 skipped; root check:ci no errors, typecheck and build exit 0, pnpm test 1274/1274 with CODEX_HOME unset and THOTH_PLUGINS_ROOT set; git diff --check clean
- Note: residual nonblocking risks: the runtime resolves yaml through the SDK's transitive dependency (createRequire on the SDK entry), which may fail at import in unusual install layouts; runtime and sync accept slightly different BOM/newline/delimiter variants without any observed denial bypass; intentional compatibility breaks (strict YAML, name must equal filename, restricted subset) require operators to quote values and rename mismatched files.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:ffa09a951c9fea05a3fdc75604967af4e75bb8284332888c5d27cf4d0563715b

## Closeout

**Archive**: READY
