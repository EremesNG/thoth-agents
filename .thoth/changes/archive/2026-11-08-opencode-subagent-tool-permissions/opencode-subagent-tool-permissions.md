# Change: opencode-subagent-tool-permissions

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi reference: `/subagents-tools` lives in `pi-packages/pi-subagents/src/tools-panel/` (~1.1k LOC: panel, command, config, frontmatter, registry, writer). It edits only the `tools` allowlist of managed specialist markdown definitions, with exact names plus `*`-only case-sensitive globs (`pi-packages/pi-subagents/src/tool-patterns.ts:1-43`), a manual-entries section with match counts, adapter-supplied defaults (`src/cli/pi-tool-config.ts:441-479`) and missing-implementation warnings. Its canonical contract (`.thoth/specs/multi-harness-agent-pack/spec.md:426`) is Pi-only and is not changed by this change.
- OpenCode v2.2.5 tool model (pinned upstream commit 9bbb8ce): agents have no `tools` map; access is ordered permission rules `{action, resource, effect: allow|ask|deny}` where the last matching rule wins and no match means `ask` (`packages/core/src/permission.ts:86-201`). Wildcards match the whole string, `*` includes `/`, `?` matches one character, matching is case-insensitive on Windows (`packages/core/src/util/wildcard.ts:3-13`). A last action-matching rule with `resource:"*"` and `deny` hides the tool from the model; resource-specific rules are enforced at call time (`packages/core/src/tool.ts:264-384`). Actions are not tool names (`write`/`patch`/`edit` → `edit`, `bash` → `shell`, `task` → `subagent`); MCP tools use action `server_tool` with resource `*` (`packages/core/src/tool/mcp.ts:19-64`). Rule layering is global → agent → session (`packages/core/src/config/plugin/agent.ts:82-122`, `session/context.ts:126-144`); native subagent children copy parent session permissions but not parent agent rules (`tool/plugin/subagent.ts:190-199`). `ctx.tool.list()` returns the registered inventory, including tools denied for an agent, but not disconnected or undiscovered MCP tools (`packages/plugin/src/promise/tool.ts:66-71`, `core/src/mcp/index.ts:515-818`). `agent.transform` + `ctx.agent.reload()` re-run transforms; changes apply on the next context selection (`core/src/agent.ts:72-109`). Code Mode catalog tools: pinned source and website docs disagree on whether `deny` removes them.
- thoth-agents today (master 5fa318d8): six roles get `translatePermissionRules(config.permission)` in `src/opencode/agents.ts:19-36`; defaults live in `src/agents/index.ts:54-154`; translation starts with an unmatched-action `ask` rule and maps legacy names (`src/opencode/permission-rules.ts:14-70`), so agent rules always match and global OpenCode rules never decide for thoth agents. `src/opencode/permissions.ts:8-22` hard-denies `subagent` for specialists in `permission.evaluate`. `thoth-agents.json` exposes no per-role tools/permission field (`src/config/schema.ts:73-95`). Permissions are materialized once at setup; models already use a mutable state + refresh + reload pattern (`src/opencode/context.ts:80-138`, `src/opencode/profile-rpc-handlers.ts:235-236`).
- Reusable seams from the shipped model-profiles feature: host-neutral store with validation/conflict detection (`src/opencode/profiles/store.ts`), portable Zod RPC contract (`src/opencode/profile-rpc.ts`), serialized RPC handlers, TUI plumbing in `src/tui/index.ts:14-44` (RPC client, session lookup, dialog adapters, reentrancy guard) and draft helpers in `src/tui/model.ts`. Lesson: OpenCode RPC outputs must not contain explicit `undefined` (HTTP JSON encoder rejects them).

## Intent

Let OpenCode users of thoth-agents adjust which tools each of the five specialists can use, from an interactive `/subagents-tools` TUI panel, by layering per-role allow/ask/deny overrides (tool action names or wildcard patterns) over the shipped role permissions, stored globally and per project and applied to every specialist session.

## Non-goals

- No allowlist mode; no orchestrator tool editing; no changes to Pi `/subagents-tools`, pi-subagents, Codex, Claude Code or Pi harness behavior.
- No per-session tool overrides and no per-request tool mutation (`session.context`/`session.generate` tool dictionaries stay untouched).
- No resource-specific (argument-level) rules in the panel; overrides always use `resource: "*"`.
- No editing of the specialists' `subagent` restriction; no thoth-agents.json schema additions; no package version bumps.

## Acceptance

- AC-1: A host-neutral tools-override core reads/writes `<opencode-config-dir>/thoth/tools.json` and `<project>/.opencode/thoth/tools.json` with schema `{version:1, roles:{<specialist>:{overrides:[{action, effect}]}}}` (specialists: explorer, librarian, oracle, designer, worker; `action` = exact action name or OpenCode wildcard pattern; `effect` = allow|ask|deny; order preserved), atomic writes with conflict detection, tolerant invalid-file loading with warnings, and per-role layering where a project entry for a role replaces the global entry for that role; it also provides an OpenCode-compatible wildcard matcher and an evaluator that computes each action's effective effect and origin (thoth default, global override, project override).
- AC-2: At plugin setup a specialist with no effective overrides keeps exactly today's registered permission array; a specialist with effective overrides gets the shipped role rules followed by its overrides as `{action, resource:"*", effect}` rules, followed by a final non-editable `{action:"subagent", resource:"*", effect:"deny"}`; overrides naming or matching `subagent` never re-enable it; the orchestrator is unaffected.
- AC-3: A server RPC contract exposes state (specialists, inventory from `ctx.tool.list()` grouped by action with each role's effective effect and origin, current overrides per scope, revisions, warnings), save of a role's overrides per scope with base-revision conflict detection, and reset of a role per scope; saves refresh the override state and call `ctx.agent.reload()` so new context selections use them; every output is JSON-encodable (no explicit `undefined`) and schema-valid in tests; it works without a session.
- AC-4: The `./tui` entry registers `/subagents-tools` built only from native dialogs: overview of the five specialists with override counts and scope markers; per-role view listing inventory actions with effective effect and origin, setting allow/ask/deny/inherit; manual pattern entries with validation and live match counts (including patterns matching no registered tool, e.g. disconnected MCP servers); reset to defaults; global or project scope selection; draft-until-save with save/discard/keep on leave and conflict reload; `subagent` shown as locked for specialists; available on the home route.
- AC-5: User and agent documentation describe `/subagents-tools`, the override model, file locations, layering, the locked `subagent` rule and known limits (Code Mode catalog tools, disconnected MCP tools).
- AC-6: A live smoke on local OpenCode 2.2.x shows the panel registered, a `deny` override hiding a tool from a spawned specialist (proved from OpenCode session/tool data), an `allow` override taking effect, and the result for a Code Mode catalog tool recorded as observed behavior.

## Clarifications

- Control model: per-role allow/ask/deny overrides on top of thoth defaults, not a Pi-style allowlist (user, 2026-11-08).
- Storage: separate `thoth/tools.json`, global + project, project replaces global per role; independent of model profiles (user).
- Roles: the five specialists only (user).

## Decisions

- Overrides are rules with `resource: "*"`, appended after the role's shipped rules (last match wins), so `deny` hides tools and `ask` prompts.
- A final `subagent` deny rule is appended after overrides only when a specialist has effective overrides (without overrides the shipped array is preserved byte-for-byte; it already denies `subagent` through role rules and the existing `permission.evaluate` hook).
- Project overrides for a role replace the global overrides for that role (no merge), mirroring "project wins per role".
- Mutable override state lives on the setup context next to `profileState`; saves refresh it and reload agents.
- New modules mirror the profiles layout: `src/opencode/tool-overrides/` (core; renamed during implementation from the planned `src/opencode/tools/` to avoid colliding with the existing `src/opencode/tools.ts` registrar), `src/opencode/tool-rpc.ts` + `tool-rpc-handlers.ts`, `src/tui/tools/` (flow/model), reusing shared TUI plumbing in `src/tui/index.ts`.
- RPC outputs omit absent fields; tests JSON-validate every output.
- Each evaluated action row also carries `baseEffect` (shipped rules alone) so the TUI draft preview shows concrete effects when an override is removed (added during implementation).
- Editor helpers: setting an action removes every exact entry for that action and appends the new one last; inherit removes exact entries; the store saves overrides losslessly.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Manage OpenCode subagent tool permissions** — The OpenCode plugin MUST expose `/subagents-tools` from its `./tui` entry using native dialogs to manage, for each of the five specialists, ordered overrides mapping an action name or OpenCode wildcard pattern to allow, ask or deny, stored in `<opencode-config-dir>/thoth/tools.json` and `<project>/.opencode/thoth/tools.json` where a project entry for a role replaces the global entry. When a role has effective overrides they MUST be applied as `resource:"*"` permission rules after the role's shipped rules and before a final non-editable `subagent` deny; without overrides the registered permissions MUST equal the shipped ones exactly; saving MUST reload agents; the orchestrator MUST NOT be affected.
  - GIVEN a global override denying `webfetch` for explorer; WHEN the orchestrator spawns explorer; THEN the explorer session is not offered `webfetch` and other roles keep their shipped access .

## Plan

Approach — mirror the model-profiles architecture:

1. **Core** (`src/opencode/tools/`): store (paths like `src/cli/paths.ts`, injected env/home for tests, atomic write + revision conflict, tolerant reads), schema validation (specialist roles, non-empty patterns, effects), wildcard matcher replicating OpenCode semantics (whole string, `*`, `?`, case-insensitive on win32), layering (project replaces global per role) and an evaluator producing effective effect + origin for a given action against role default rules plus overrides.
2. **Runtime + RPC**: `src/opencode/context.ts` gains mutable `toolState` (effective overrides per role, `refresh()`); `src/opencode/agents.ts` appends override rules plus the final `subagent` deny only for specialists with effective overrides (empty overrides leave the shipped array untouched); `src/opencode/tool-rpc.ts` (portable Zod contract, `events:{}`) and `tool-rpc-handlers.ts` (state/save/reset, serialized, inventory via `ctx.tool.list()`, reload after save), wired in `src/index.ts`.
3. **TUI**: `src/tui/tools/{model,flow}.ts` with fake-port tests; `src/tui/index.ts` registers `/subagents-tools` alongside `/subagents-model`, reusing the RPC client, dialog adapters and reentrancy guard.
4. **Docs**: `docs/provider-configurations.md` (or a sibling user doc), `docs/agent/{runtime-integrations,architecture,testing}.md`, README pointer.
5. **Live smoke** in an isolated OpenCode 2.2.x scratch project.

Verification seams: vitest for core/matcher/evaluator, agents registration (default parity, override order, locked subagent), RPC handlers with mocked ctx and JSON-encodability, TUI flow with fake ports; `pnpm run build`, `typecheck`, `check:ci`, `src/plugin-node-runtime.test.ts` (registration mocks must include the new registrar).

Risks: Code Mode catalog tools may stay callable despite `deny` (record observed behavior in smoke and document); disconnected MCP tools are absent from inventory (manual patterns cover them); action vs tool-name mismatch confuses users (panel groups by action and shows member tools); reload timing applies on next context selection only.

## Tasks

- [x] AC-1: Host-neutral tools-override core (store, validation, wildcard matcher, evaluator) with unit tests
  - Outcome: `src/opencode/tools/` satisfies AC-1 semantics
  - Known entrypoints and skill paths: `src/opencode/profiles/store.ts` (pattern reference), `src/cli/paths.ts:5-32`, `src/opencode/permission-rules.ts:14-70`, `pi-packages/pi-subagents/src/tool-patterns.ts` (reference only); skills `tdd`, `simplify`
  - Inputs: Exploration, Decisions
  - Dependencies: none
  - Output: core module + tests
  - Owner: thoth-worker
  - Writes: `src/opencode/tools/**`
  - Interface boundaries: no imports from `pi-packages/**`; consumed by runtime, RPC and TUI units
  - Focused check and PASS evidence: `pnpm vitest run src/opencode/tools` green covering layering, matcher semantics (`*` across `/`, `?`, win32 case-insensitivity), evaluator origins, invalid files, conflict
  - Return milestone: core API and tests green
  - Stop / reassessment: evaluator needs host state not injectable
- [x] AC-2: Apply overrides to specialist agent permissions at setup with locked subagent deny
  - Outcome: specialists register shipped rules + overrides + final subagent deny; mutable `toolState` with refresh
  - Known entrypoints and skill paths: `src/opencode/context.ts:80-138`, `src/opencode/agents.ts:19-52`, `src/opencode/permissions.ts:8-22`, `src/opencode/agents.test.ts`; skill `tdd`
  - Inputs: AC-1 core
  - Dependencies: AC-1 unit
  - Output: runtime integration + tests
  - Owner: thoth-worker
  - Writes: `src/opencode/context.ts`, `src/opencode/agents.ts`, related tests
  - Interface boundaries: profile state untouched; orchestrator untouched
  - Focused check and PASS evidence: vitest: no overrides → registered arrays deep-equal today's for all six roles; with overrides → shipped rules, overrides in order, final `subagent` deny; `subagent` stays denied even with `* → allow`; orchestrator unchanged; refresh re-reads
  - Return milestone: tests green
  - Stop / reassessment: permission rule order conflicts with existing translation
- [x] AC-3: Tool-permission RPC contract and handlers
  - Outcome: portable contract + handlers (state/save/reset) with reload and JSON-safe outputs
  - Known entrypoints and skill paths: `src/opencode/profile-rpc.ts`, `src/opencode/profile-rpc-handlers.ts` (patterns), `src/index.ts`, `src/plugin-node-runtime.test.ts`; skill `tdd`
  - Inputs: AC-1 core, AC-2 runtime state
  - Dependencies: AC-2 unit
  - Output: `src/opencode/tool-rpc.ts`, `src/opencode/tool-rpc-handlers.ts`, tests, wiring
  - Owner: thoth-worker
  - Writes: `src/opencode/tool-rpc.ts`, `src/opencode/tool-rpc-handlers.ts`, their tests, `src/index.ts`, `src/plugin-node-runtime.test.ts`, `src/opencode/cache-stability.test.ts` (registration expectations only)
  - Interface boundaries: frozen contract consumed by TUI unit
  - Focused check and PASS evidence: vitest with mocked ctx: inventory grouping, effective/origin, save conflict, reset, reload called, every output schema-valid and JSON-encodable; `src/plugin-node-runtime.test.ts` green after build
  - Return milestone: contract frozen and tests green
  - Stop / reassessment: `ctx.tool.list()` shape lacks action identity
- [x] AC-4: TUI `/subagents-tools` panel
  - Outcome: native-dialog panel satisfying AC-4 using the frozen contract
  - Known entrypoints and skill paths: `src/tui/index.ts`, `src/tui/{model,flow}.ts` (patterns), `pi-packages/pi-subagents/src/tools-panel/panel.ts` (behavior reference), `@opencode/plugin` `dist/tui/context.d.ts`
  - Inputs: AC-3 frozen contract
  - Dependencies: AC-3 unit
  - Output: `src/tui/tools/**` + registration
  - Owner: thoth-designer
  - Writes: `src/tui/**`
  - Interface boundaries: RPC contract only
  - Focused check and PASS evidence: vitest with fake dialog/RPC ports (effective display, inherit/allow/ask/deny, manual patterns with match counts, locked subagent, reset, drafts/conflict, home route); `pnpm run build` emits TUI with both commands
  - Return milestone: tests and build green
  - Stop / reassessment: a required interaction impossible with native dialogs
- [x] AC-5: Documentation
  - Outcome: docs describe the feature, model, files, layering, locked subagent and limits
  - Known entrypoints and skill paths: `docs/provider-configurations.md`, `README.md`, `docs/agent/{runtime-integrations,architecture,testing,index}.md`
  - Inputs: accepted AC-1..AC-4 outputs
  - Dependencies: AC-4 unit
  - Output: doc edits
  - Owner: thoth-worker
  - Writes: `README.md`, `docs/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` green; docs match code paths
  - Return milestone: docs updated
  - Stop / reassessment: docs reveal behavior gap
- [x] AC-6: Live OpenCode 2.2.x smoke
  - Outcome: evidence for registration, deny hiding, allow effect, Code Mode observation
  - Known entrypoints and skill paths: built `dist/`, local OpenCode 2.2.6, isolated scratch outside the repo
  - Inputs: AC-2..AC-4 accepted, build output
  - Dependencies: AC-4 unit
  - Output: smoke verdicts in the task result (no repo evidence files) + manual panel steps
  - Owner: thoth-worker
  - Writes: none in repo
  - Interface boundaries: must not modify user OpenCode config/auth
  - Focused check and PASS evidence: OpenCode session/tool data proves the denied tool absent for the specialist and the allowed one usable
  - Return milestone: verdicts reported
  - Stop / reassessment: runtime contradicts unit behavior
- [x] AC-4: Repair cross-scope effective display and direct empty-project masking in the TUI (final verification round 1)
  - Outcome: role views show the true effective effect and origin for the role after layering (project replaces global), recomputed for the draft as it would apply after save; when the edited scope does not control the role (global edited while a project entry exists) the view clearly labels the rows as an inactive scope preview and shows which scope is effective; an absent project entry can be saved directly as an explicit empty list to mask global overrides
  - Known entrypoints and skill paths: `src/tui/tools/model.ts:60-172`, `src/tui/tools/flow.ts:278-337`, `src/opencode/tool-rpc.ts` (state fields: effectiveScope, global/project present+overrides, actions effect/origin/baseEffect); skill `tdd`
  - Inputs: Oracle final-verification round 1 evidence E3 and E4
  - Dependencies: none
  - Output: model/flow fix + regressions (absent project over global customization, project-shadowed global, explicit empty project mask)
  - Owner: thoth-designer
  - Writes: `src/tui/tools/**`, and docs wording in `docs/provider-configurations.md` only if the masking action label changes
  - Interface boundaries: frozen RPC contract unchanged
  - Focused check and PASS evidence: new regressions red then green; `pnpm vitest run src/tui` green
  - Return milestone: regressions green
  - Stop / reassessment: correct display needs RPC contract changes

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Round 1 REJECT (sha c8be84472267edad04c774e45893ec28ad2cdd71ff858f21016552c2dee514e9): AC-2 parity contradiction; repaired. Round 2 fresh Oracle OKAY on sha 6b8fe1b4a8500fdd48c1fba0cd72733f7f5ed7587d80833954c4b2f42cb34e4f (task subtask_thoth-oracle_1794169662293_9ddde5a8). Nonblocking: matching overrides supersede designer/worker resource-specific external_directory allow (cover in AC-2 tests and AC-5 docs); displayed effects are role-level, session permissions can supersede.
**Implementation**: AUTHORIZED
User selected Implement (Recommended) via ask_user_question on 2026-11-08 after plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 4a507ec7ba01fcbef0e9bbfbf02f5c8abcc2f1a0769a53921bb752d04e70c2d4
Fresh Oracle round 2 (task subtask_thoth-oracle_1794172675372_a567abed); delivered gate verdict valid, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The full working-tree implementation satisfies AC-1..AC-6, Decisions, Non-goals and the ADDED durable delta. Both round-1 layering defects are repaired.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/opencode-subagent-tool-permissions/opencode-subagent-tool-permissions.md",
      "claim": "Record-prefix SHA-256 matches the assignment. Canonical source digest matches; --through verify passes. The ADDED requirement is distinct from existing Pi controls and OpenCode model profiles.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "implementation",
      "locator": "src/opencode/tool-overrides/",
      "claim": "Core preserves ordered overrides, project-presence replacement including empty lists, tolerant reads, revision conflicts, atomic replacement, wildcard semantics and evaluated origins.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "implementation",
      "locator": "src/opencode/{agents.ts,context.ts,tool-rpc.ts,tool-rpc-handlers.ts}",
      "claim": "Default permission arrays remain unchanged; effective overrides precede the final subagent deny. Orchestrator remains unchanged. RPC groups inventory, validates JSON-safe outputs, serializes mutations, refreshes state and reloads agents.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "behavioral-execution",
      "locator": "src/tui/tools/model.ts:73-277; src/tui/tools/flow.ts:97-156,329-344",
      "claim": "Independent execution confirmed explorer PROJECT shows webfetch deny/global and designer GLOBAL shows bash allow/project with inactive-preview hints. Additional in-memory flows verified overrides:[] RPC save, clean post-save drafts, Remove-entry reset with updated revision, discard, conflict reload, conflict keep-editing and no-op inherit without saves.",
      "basis": "observed",
      "uncertainty": "Historical red-phase execution was not captured; current behavior was independently exercised."
    },
    {
      "id": "E5",
      "kind": "checks",
      "locator": "Independent focused Vitest run; typecheck; check:ci; git diff --check",
      "claim": "123 tests passed across 11 files, including core, agents, RPC, all TUI tests and built-plugin runtime checks. Typecheck, check:ci and whitespace checks passed. Biome reported unrelated warnings without errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "documentation-and-scope",
      "locator": "README.md; docs/provider-configurations.md; docs/agent/",
      "claim": "Documentation matches storage, layering, masking/reset behavior, locking, reload timing and inventory limits. The complete diff contains no changes to excluded harness behavior, config schema, package version or request-local tool dictionaries.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "live-artifacts",
      "locator": "%TEMP%/thoth-tools-smoke/{child-requests.jsonl,resmoke-observations.jsonl,*-sessions.json,tui-prefix.stdout}",
      "claim": "OpenCode 2.2.6 artifacts show both slash commands registered; spawned explorer requests omit read under deny while orchestrator retains it. Edit allow adds edit/write versus parity and the child completes CHILD_OK. Denied opencode_models is absent from the system Code Mode catalog and present in parity.",
      "basis": "observed",
      "uncertainty": "Existing artifacts were inspected, not regenerated. Direct denied Code Mode invocation was not tested; read-deny requests received provider quota 429 responses."
    },
    {
      "id": "E8",
      "kind": "reused-checks-and-freshness",
      "locator": "Delegated root check results; current HEAD-to-working-tree snapshot",
      "claim": "Reused root's fresh build, 1812-test reruns and 13 integration passes. The reviewed 30 implementation/documentation files remained unchanged at final fingerprint 1925f55118bd1596a0752feea50ecd913c3c6fa60bcd6503ab80eb606cacbbfc; HEAD remains 5fa318d8.",
      "basis": "inferred",
      "uncertainty": "Build and broader suites were root-reported, not independently rerun; snapshot stability was independently observed."
    },
    {
      "id": "M1",
      "kind": "memory",
      "locator": "thoth-mem:20b4cd27-a3a8-4640-8132-387dd7870ceb",
      "claim": "Relevant context was recalled and expanded for project git:3726a62c-51e1-43ba-a466-57d41c5b7048. Memory was recall-only; no session-attributed writes or lifecycle operations occurred.",
      "basis": "observed",
      "uncertainty": "Recalled context was treated as background, not approval evidence."
    }
  ],
  "verification": [
    {
      "check": "Record binding and durable baseline",
      "method": "Independent byte-prefix/source hashing, validator execution and baseline comparison",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Expected hashes match and verify gate passes."
    },
    {
      "check": "AC-1",
      "method": "Core source review and focused tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E5"],
      "reason": "Storage, layering, matcher and evaluator contracts are satisfied."
    },
    {
      "check": "AC-2 and durable runtime delta",
      "method": "Full runtime diff review, registration tests and live artifact comparison",
      "outcome": "pass",
      "evidenceIds": ["E3", "E5", "E7"],
      "reason": "Default parity, ordered overrides, locked delegation and unchanged orchestrator are supported."
    },
    {
      "check": "AC-3",
      "method": "RPC source review and schema/JSON-validating tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E5"],
      "reason": "Sessionless state/save/reset, conflicts and reload behavior pass."
    },
    {
      "check": "AC-4 and round-1 repair",
      "method": "TUI tests, direct reproduction assertions and five additional in-memory flow scenarios",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Effective layers and origins are correct; presence-only drafts persist and survive conflict handling without unintended saves."
    },
    {
      "check": "AC-5 and Non-goals",
      "method": "Complete tracked/untracked diff and documentation review",
      "outcome": "pass",
      "evidenceIds": ["E6"],
      "reason": "Required guidance is present and scope boundaries are preserved."
    },
    {
      "check": "AC-6",
      "method": "Independent inspection of existing live request, session, catalog and TUI artifacts",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "Artifacts establish registration, specialist deny/allow effects and observed Code Mode behavior."
    },
    {
      "check": "Model-panel/runtime regression and freshness",
      "method": "Focused tests, static checks, reused broad checks and final snapshot fingerprint",
      "outcome": "pass",
      "evidenceIds": ["E3", "E5", "E8"],
      "reason": "No regression found in /subagents-model plumbing or runtime; reviewed inputs remained stable."
    }
  ],
  "risks": [
    {
      "description": "Remove-project-entry lacks a committed flow-level regression, although its complete save/reset/revision path passed independent execution.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4"]
    },
    {
      "description": "Live evidence establishes Code Mode catalog filtering, not direct denied-call enforcement. This version-sensitive limitation is documented.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Record this PASS and matching digest, complete acceptance evidence and closeout, then archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/opencode-subagent-tool-permissions/opencode-subagent-tool-permissions.md",
    "reviewedRecordSha256": "4a507ec7ba01fcbef0e9bbfbf02f5c8abcc2f1a0769a53921bb752d04e70c2d4"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `pnpm vitest run src/opencode/tool-overrides` | worker: 37 tests (layering incl. empty project list, matcher mirroring upstream wildcard.ts incl. win32/`?`/trailing ` *`, evaluator origins, invalid files, TOOLS_CONFLICT, atomic writes, editor helpers with interleaved wildcards)
- AC-2: PASS | `pnpm vitest run src/opencode` | worker: no-override arrays deep-equal shipped for all six roles; overrides appended in order then locked subagent deny; `* → allow` keeps subagent denied; external_directory precedence; orchestrator unchanged; refresh
- AC-3: PASS | `pnpm vitest run src/opencode`; build + `src/plugin-node-runtime.test.ts` | worker: state/save/reset, inventory grouped by action, effect/origin/baseEffect/locked, conflict, subagent rejection, reload after save, every output schema- and z.json()-valid
- AC-4: PASS | `pnpm vitest run src/tui`; `pnpm run build` | designer: 52+ flow/model tests with fake ports (overview, scope, set/inherit, locked row, patterns with counts, reset, drafts/leave, conflict, home route) plus baseEffect preview regression; built TUI registers both commands
- AC-5: PASS | `pnpm run check:ci`; cited paths exist | worker: README, provider-configurations, docs/agent runtime-integrations/architecture/testing/index
- AC-6: PASS | live OpenCode 2.2.6 isolated smoke (%TEMP%/thoth-tools-smoke) | worker: `/subagents-tools` in autocomplete beside `/subagents-model`; explorer outbound tool definitions omit `read` under `read → deny` while orchestrator keeps it; `edit → allow` offers edit/write and child completed CHILD_OK; no-override parity offers read and completes; Code Mode: denying `opencode_models` removed it from the execute catalog (direct denied execution not tested). Read-deny child requests hit provider `FreeUsageLimitError` 429 on the free tier with otherwise identical request bodies (provider quota, not a schema defect); earlier model switch traced to pre-existing fallback chain (profile model then shipped model).
- Root closeout checks: `pnpm run build` PASS; `pnpm run typecheck` PASS; `pnpm run check:ci` PASS; `pnpm vitest run src/opencode src/tui src/config src/agents src/cli src/plugin-node-runtime.test.ts` 1805 passed (87 files); `pnpm run integration:verify` 13 passed.
- Final verification round 1: FAIL on sha 2f17f32d6034e6f39b9c45e4a7de65c434e34beba503828fb4a4a1b73442d9d3 (task subtask_thoth-oracle_1794172084447_fa444835): TUI role views ignore effective layering across scopes; nonblocking: empty-project mask has no direct save path. Repair recorded as a task.
- Round 1 repair (designer): `effectiveLayer`/`applyOverrides` compute rows from the post-save effective layer (present project entry, even empty, replaces global); inactive-scope preview title when global is edited while project controls the role, with "global alone would …" hints; draft tracks presence separately; "Mask global overrides for this project (save empty list)" on absent project and "Remove project entry (use global)" on present-empty project; docs wording updated. `pnpm vitest run src/tui` 62 passed; root reran build, typecheck, check:ci PASS; focused suite 1812 passed on two consecutive reruns (one earlier run had a single non-reproducing failure, treated as Windows timing flake); integration:verify 13 passed.
- Out-of-scope follow-up noted: profile model is prepended to the fallback chain even with fallback disabled (from opencode-subagent-model-profiles); not changed here.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:dd4b9282ea29083fd800df0f4daecc764ff2ebe253a231d492a2d46ab6d64ad1

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
Nonblocking residual risks: Remove-project-entry has no flow-level regression (path exercised by Oracle); Code Mode direct denied-call enforcement untested (documented as version-sensitive).
