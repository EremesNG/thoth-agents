# Change: tolerant-child-tool-selection

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Facts-only Explorer (subtask_thoth-explorer_1790915535327_24acecda): in
  `pi-packages/pi-subagents`, `src/tool-patterns.ts:28–70` resolves selections: standalone
  `*` selects the parent's active inventory minus the nine delegation names
  (`:1–11,51–57`); other globs match active inventory; explicit names are added directly
  without consulting root activity; `subagent_*` and the two root-only interaction controls are always
  removed. Child verification (`src/runner/sdk-runner.ts:97–131`, before
  `emitChildSessionStart` at `:523–556`) compares selections against the child's
  `getAllTools()`; missing implementations fail with "Selected tools are unavailable in the
  child session (missing implementation: …)" (`:126`) unless the selection is exactly
  standalone `*` (`:658–659`) and not every name is missing.
- Dropped names travel as `dropped_tools` (`src/types.ts:161,441,503`), produced at
  `sdk-runner.ts:548–560`, persisted in history column `dropped_tools_json`
  (`src/history.ts:189,510,267,303,353–355,758`) and rendered by
  `src/render/tool-selection-warning.ts:3–7` in status/task text
  (`src/render/tools/formatting.ts:111–119`), result text (`src/tools/subagent-result.ts:29`)
  and completion notification (`src/render/completion-message.ts:87,141`); the background
  widget (`src/ui/background-widget.ts`) has no dropped-tools rendering.
- Root panel `src/pi/tools-panel.ts` labels `(inactive)` and `(unavailable)`, retains
  unavailable explicit names and persists explicit lists or standalone `*`
  (`src/cli/pi-tool-config.ts:203–235`); runtime still accepts globs/mixed selectors from
  hand-edited definitions.
- Tests pinning strict explicit/glob behavior: `test/runner/providers-real-sdk.test.ts:150–186`,
  `test/runner/interaction-bridge.test.ts:1154,1218–1256`; explicit root-inactive deferred
  and codemode fixtures stay selectable (`test/runner/tool-selectors-real-sdk.test.ts:90–97,
  157–191`). Docs: `P/README.md:123,149–155,273`,
  `P/skills/subagents-configuration/SKILL.md:185–191`, `docs/installation.md:389–437`,
  `docs/agent/harness-packaging.md:59–83`.
- Spec `Configure adopted Pi subagents natively` (`.thoth/specs/multi-harness-agent-pack/
  spec.md:471–479`) requires explicit lists and globs to fail on missing implementations.
- Live probes (2026-10-01, Codex-model `thoth-worker`): (B) explicitly assigned
  `agent_browser_electron`, inactive in the root, started and worked in the child (active
  there; `list` succeeded); (A) with only `agent_browser_tools`, enabling `electron` was
  refused as "unavailable in this Pi tool selection" and the tool never appeared. Explicit
  assignment is therefore the only way to give a role a deferred/advanced tool.
- Live probe (2026-10-01, Antigravity-model `thoth-designer` with all eight
  `agent_browser*` tools explicitly assigned): the child started without error; Pi-side
  `agent_browser_tools` reported all five advanced tools active, but agy's MCP server
  `pi-agy-<instance>` exposed only six of them; `agent_browser_electron` and
  `agent_browser_network_source` had descriptor files on disk yet agy reported "tool
  agent_browser_electron is not enabled for server pi-agy-…" when called. The Antigravity
  bridge forwards schemas unchanged (`pi-packages/pi-antigravity-bridge/extensions/
  index.ts:827–837`); `agent_browser_electron` has a top-level `anyOf` schema; the
  network-source schema shape was not inspected.
- Earlier live failures: a Claude-model child with `agent_browser_electron` failed because
  `pi-packages/pi-claude-bridge/src/mcp-server.ts:51–56,63` rejects any tool whose top-level
  schema is not `type: "object"` (the tool is a top-level `anyOf` of object variants), failing
  the whole provider request; a child whose explicit list named tools absent after a package
  swap failed before start.
- Facts-only Explorer (subtask_thoth-explorer_1790916073433_67d7186d): the MCP SDK requires a
  root `type: "object"` (`@modelcontextprotocol/sdk/dist/esm/types.js:1236–1247`, catchall
  allows extra keywords such as `anyOf`); the Anthropic client declares
  `input_schema.type: 'object'` with arbitrary additional keys
  (`@anthropic-ai/sdk/resources/messages/messages.d.ts:2536–2541`); backend acceptance of
  `{type:"object", anyOf:[...]}` is not established. Upstream elidickinson/pi-claude-bridge
  `9dafd03` keeps the same assertion. Pi core's Anthropic conversion silently turns a root
  union into an empty object (`@earendil-works/pi-ai/dist/api/anthropic-messages.js:1159–1185`);
  the Antigravity bridge forwards schemas unchanged. Pi validates arguments against the
  original `tool.parameters` (`pi-ai/dist/utils/validation.js:280–307`).
- `pi-packages/pi-subagents/src/error-metadata.ts:283–344` classifies thrown and assistant
  errors by regexes over the whole lowercased message; the network rule
  `econnreset|enotfound|network|socket|timeout|timed out|connection` matched `timeoutMs`
  inside the serialized schema, so the deterministic schema error was classified
  `provider_network_error` and retryable (`:20–37`); no network-classification tests found.

## Intent

A subagent never fails because of how its tools are selected: explicitly assigned tools,
including ones inactive in the root, keep reaching the child; selected tools without a child
implementation are dropped with a visible durable warning (failing only when nothing remains);
a tool with a non-object schema no longer breaks a Claude-bridge request nor silently
vanishes from an Antigravity session; deterministic errors
are not misclassified as network errors.

## Non-goals

- No change to standalone `*` semantics or its delegation exclusions.
- No filtering of explicitly selected tools by root activity (inactive explicit tools keep
  reaching the child).
- No change to the root panel's persistence contract (explicit lists or `*`; it keeps
  retaining unavailable names).
- No flattening of union schemas; no change to Pi core's own Anthropic conversion.

## Acceptance

- AC-1: In pi-subagents, explicit lists, globs and mixed selectors drop selected names
  without a child implementation with the same durable `dropped_tools` warning as standalone
  `*`; for missing-implementation handling, the child fails before start only when no
  selected tool remains, with the existing truthful diagnostic (unexpected-registration and
  other startup failures are unchanged). Tolerance is applied after session creation
  (the SDK already ignores names it does not register), keeping the original explicit names. Explicit names inactive in the root still reach the child; reserved
  controls and standalone-`*` delegation exclusions are unchanged. Real-SDK tests replace
  the strict explicit/glob cases (partial drop for explicit, glob and mixed; all-missing
  failure; explicit inactive deferred/codemode still selectable).
- AC-2: The background widget card of a running or queued task shows a compact
  dropped-tools warning when its `dropped_tools` is non-empty (the widget does not render
  terminal tasks; after completion the warning stays on the existing status, result and
  completion surfaces). Metrics, editor-focus guards, idle animation and width limits are
  preserved and `entryRowCount` accounts for the extra row. Tests cover rendering, absence
  when empty, narrow width and the running-to-terminal transition.
- AC-3: In pi-claude-bridge, tool schemas whose root is not a plain object never fail the
  request nor vanish silently: a root `anyOf`/`oneOf` whose variants are all objects
  (whether or not the root also declares `type: "object"`) is advertised to Claude as
  `{type:"object", properties:{input:{anyOf|oneOf:[...]}}, required:["input"]}` with the
  original variants under `input` and root keywords (`$defs`/`definitions`, `title`,
  `description`) kept at the root, and the bridge unwraps `input` before handing the
  arguments to Pi, which validates against the original schema; any other non-object root schema is omitted from the advertised tools
  with one warning per tool per session through the bridge's existing warning channel,
  observable in headless child sessions. Unit tests cover wrapped unions, omitted schemas,
  and a mixed catalog where valid tools still load. Applies to root and child sessions.
  Shared eligibility rule (identical fixtures in AC-3 and AC-7): a root `anyOf`/`oneOf`
  is wrapped only when every variant is an object schema (`type: "object"`, or an `allOf`
  of object schemas, or a local `$ref` resolving to one); empty unions, dangling or
  cyclic references and any other variant cause omission; wrapping preserves root
  keywords such as `$defs`/`definitions`, `title` and `description`. Backend rule: a
  wrapped union PASSES live only by a successful call; if the live check shows the backend
  rejecting or hiding the wrapped form, the bridge switches that union to omission with the
  warning and the live evidence must show the omission, the warning and a working child.
- AC-7: In pi-antigravity-bridge, the same eligibility rule as AC-3 applies to the tools it
  advertises to agy (both private and legacy discovery, stream-json and ACP): object unions
  are advertised as `{type:"object", anyOf|oneOf:[...]}` (agy accepts root unions; live
  `agent_browser_action`/`_qa` appeared), other non-object root schemas are omitted with
  one warning per tool per session; object schemas are unchanged. The private MCP server
  name is shortened from `pi-agy-<32 hex>` to `pi-agy-<8 hex>` (still unique per instance,
  collision-checked against live entries), so every advertised tool's qualified name
  `mcp_<server>_<tool>` stays within 64 characters; any tool whose qualified name would
  still exceed 64 characters is omitted with the same warning instead of vanishing. The
  first worker checkpoint confirms the 64-character cause live (long vs short server name)
  before relying on it. Unit tests cover wrapping, omission, name length and a mixed
  catalog. Live (AC-6): an Antigravity-model
  child with `agent_browser_electron` and `agent_browser_network_source` assigned sees and
  calls `agent_browser_electron` `action: "list"`, under AC-3's shared eligibility and
  backend rules (silent disappearance is never PASS). Antigravity's `mcpLog` must surface
  the omission warning instead of suppressing the event.
- AC-4: pi-subagents error classification no longer treats substrings inside identifiers or
  serialized payloads as network errors: network rules match whole words or known codes
  (`ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, "network", "socket", "connection", "timeout",
  "timed out"); the deterministic schema-rejection signature ("MCP tool parameters must
  be an object schema") is recognized before payload-sensitive rules and classified as a
  non-retryable API error (the generic API default is retryable). Tests cover the
  observed message (`timeoutMs` in schema) and genuine network errors.
- AC-5: Docs: pi-subagents README and `skills/subagents-configuration/SKILL.md`,
  `docs/installation.md`, `docs/agent/harness-packaging.md` describe tolerant explicit/glob
  selection, the widget warning and inactive-explicit behavior; claude-bridge README notes
  non-object schema handling. Durable delta below applied at archive.
- AC-6: Checks and live: package typechecks/tests (pi-subagents, claude-bridge `test:unit`),
  root `check:ci`, `typecheck`, `build`, `pnpm test` (only the four known missing-sibling
  failures); after merge and restart, live: a Claude-model subagent with
  `agent_browser_electron` assigned starts and calls `action: "list"` successfully, and the
  AC-7 Antigravity check passes, both under AC-3's backend rule; a subagent whose explicit
  list names `read` plus a tool absent in the child starts, shows the warning on its
  running widget card and in its result, and uses `read`.

## Clarifications

- Explicit tools inactive in the root keep reaching the child (user, 2026-10-01, after live
  probes A/B).
- Explicit/glob missing implementations: drop with warning, fail only if none remain (user).
- Globs follow the same rule (user).
- Show the dropped-tools warning on the widget card (user).
- Claude-bridge: wrap object unions, omit other non-object schemas with a warning (user).
- Include the network misclassification fix (user).
- Claude: wrap root unions under a required `input` property and unwrap in the bridge;
  omit with a visible warning only if that form is also rejected (user, after live AC-6).
- Antigravity: shorten the private MCP server name so qualified tool names stay within 64
  characters, and warn on any name still too long (user, after live AC-6).
- Extend the schema rule to the Antigravity bridge in this change (user, after the
  Antigravity probe).

## Decisions

- Reuse the existing `dropped_tools` field, persistence and warning formatter; tolerance
  becomes the rule for every selection form instead of a standalone-`*` special case.
- Plan review round 1 (fresh Oracle subtask_thoth-oracle_1790916545355_5bcca9f1): REJECT
  — AC-2 promised terminal cards the widget never renders; the backend fallback contradicted
  AC-3/AC-6. Repaired: warning on running/queued cards only (terminal surfaces unchanged);
  one backend rule for both bridges (live success, or verified rejection followed by
  omission with warning and a working child). Cautions adopted: shared object-only
  eligibility fixtures, `$defs` preservation, session-scoped warning dedup observable in
  headless children, Antigravity `mcpLog` surfacing, deterministic schema error
  non-retryable, live fixture keeps `read` plus an absent name, tolerance limited to
  missing implementations.
- Implementation checkpoint (root, 2026-10-01): `4208aec` (worker A: tolerance for every
  selection form after session creation, unexpected registrations still fail, inactive
  explicit deferred/codemode kept; running/queued card warning with row targeting;
  deterministic schema rejection non-retryable and whole-word network rules; package
  docs), `770c340` (worker B: claude-bridge per-tool normalization, warning on stderr and
  diag log once per tool/session), `b656265` (worker C: same normalizer, byte-identical
  module sha256 44e701d7…, served catalog for both engines/discovery modes, stderr
  warning), `1aa947f` (root docs). Frozen checks: frozen install 0; pi-subagents 0 / 555
  passed, 1 skipped; claude-bridge 0 / unit 305; antigravity 0 / 587 passed, 9 skipped
  (one run hit the pre-existing SessionStore multi-process flake, untouched since
  adoption, 5/5 isolated and next full run green); background-tasks 0 / 258 passed,
  4 skipped; openai-fast typecheck 0; root check:ci, typecheck, build 0 (no generated
  drift); root test 1208 passed / 4 missing-sibling failures. Live AC-6 follows.
- Live AC-6, first pass (2026-10-01, main 0.5.0 at 80cd7fa after full restart): (3)
  explicit `read` + `probe_missing_tool` on thoth-explorer: started, used `read`, completion
  carried "Dropped tools unavailable in the child session (missing implementation:
  probe_missing_tool)" and history `dropped_tools_json` = ["probe_missing_tool"] (a first
  attempt was invalid: root launched the child in parallel with the definition edit, so
  the child read the old definition). (1) Claude-model designer with all eight
  `agent_browser*` tools: child started and worked, but `agent_browser_action`, `_qa` and
  `_electron` were absent with no warning; their exported schemas are already
  `{type:"object", anyOf:[2|2|4 objects]}` (pi-agent-browser-native params.js), so AC-3
  wrapping left them unchanged; public Claude Code issues #40075/#44788 report the API
  rejecting top-level anyOf/oneOf/allOf; the exact Claude Code filtering path was not
  located. (2) Antigravity-model designer: child started, `_action` and `_qa` (root anyOf)
  were present, but `_electron` and `_network_source` (plain object) were absent; the
  pattern matches agy's 64-character limit on `mcp_<server>_<tool>` with the 39-character
  private server name introduced by bridge-child-lifecycle (a first attempt was invalid:
  launched in parallel with restoring subagents.json, so it ran on Claude). Operator
  configs restored by hash. Result: AC-6 FAIL for (1) and (2); AC-3 and AC-7 amended.
- Amended implementation checkpoint (root, 2026-10-02): `1ac2d60` (worker B: eligible
  root unions, typed or not, advertised under required `input`; unwrap on streamed and
  completed tool_use, re-wrap in history, ordinary `input` fields untouched; unit 315),
  `ff2b78d` (worker C: milestone 1 live with isolated real agy confirmed the cause — agy
  logged "tool name mcp_pi-agy-<32hex>_agent_browser_electron violates
  ^[a-zA-Z0-9_-]{1,64}$"; both 22/28-char tools appeared under `pi-agy-<8hex>`; private
  name shortened with live-config and process-wide collision checks and exact acquired-key
  cleanup; qualified-name length enforced per discovery mode with omission warning).
  Frozen checks: frozen install 0; antigravity 0 / two runs 592 passed, 9 skipped;
  claude-bridge 0 / unit 315; pi-subagents 0 / 555 passed, 1 skipped; background-tasks 0 /
  258 passed, 4 skipped; root check:ci, typecheck, build 0 (no generated drift); root test
  1208 passed / 4 missing-sibling failures. Live AC-6 repeat follows.
- Live AC-6 repeat (2026-10-02, main 0.5.0 at c4f1243 after full restart; every config
  change applied and verified before launching the child; operator configs restored by
  hash: subagents.json cfd3ec3e…, thoth-explorer.md 780eb33b…). (1) Claude-model designer
  (claude-sonnet-5-5) with all eight `agent_browser*`: saw `_action`, `_qa`, `_electron`
  and `_network_source`; `agent_browser_electron` required `input`; call
  `{"input":{"action":"list","maxResults":5}}` returned "Electron apps (0 found)" with
  success observation (Pi validated the unwrapped original arguments). (2)
  Antigravity-model designer (Gemini 3.8 Flash) via server `pi-agy-7f71e568`: saw all four;
  call `{"action":"list","maxResults":5}` succeeded the same way. (3) thoth-explorer with
  `read` + `probe_missing_tool`: started, used `read`; the operator confirmed seeing the
  dropped-tools warning on the running widget card; completion carried "Dropped tools
  unavailable in the child session (missing implementation: probe_missing_tool)" and
  history `dropped_tools_json` = ["probe_missing_tool"].
- Final verification round 1 (fresh Oracle subtask_thoth-oracle_1790922137713_03e3ed45):
  FAIL on AC-3/AC-5/AC-7 — Antigravity's `tool-schema.ts` early return for typed object
  roots bypassed union eligibility (empty, mixed, dangling and cyclic unions advertised)
  and one eligible union masked an ineligible sibling union; both bridges rejected local
  `$ref` pointers traversing array indices (e.g. `#/$defs/shape/allOf/0`). AC-1, AC-2,
  AC-4, AC-6 PASS; baseline and delta confirmed. Repair assigned to one worker owning both
  bridges' `tool-schema` modules and tests so the rule stays identical.
- Repair after final round 1 (`f9a1959`, one worker owning both bridges' `tool-schema`
  modules, test-first): every present root union is validated before the object-root
  shortcut; one eligible union no longer masks an ineligible sibling; local JSON pointers
  traverse array indices with `~0`/`~1` unescaping, cycles still detected; nine identical
  regression fixtures in both suites. Root check: eligibility lines 1–47 byte-identical
  (sha256 7e884617… in both); claude-bridge typecheck 0, unit 324; antigravity typecheck
  0, 601 passed / 9 skipped; `git diff --check` clean. Live agent_browser behavior is
  unaffected (their unions are eligible under both versions).
- Backend rule (AC-3): a wrapped union that a backend rejects in the live check is
  switched to omission with a warning in that bridge; the request never fails.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same UI design with safe tool persistence; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST offer one dynamic selection persisted as standalone `*`, meaning the eligible tools currently active in the root session excluding subagent and delegation tools (`AskClaude`, `AskAntigravity`, `bg_delegate`, `bg_run_pi_attested`, `bg_result` and the `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate` tools); inactive registered tools MUST NOT be inherited by `*` and `@active` MUST be rejected rather than persisted or treated as a tool name. Explicitly selected tools MUST reach the child even when inactive in the root. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve `*` and child launch MUST resolve its current inventory; for every selection form, selected tools without a child implementation MUST be dropped and reported as a durable warning visible on the running task's widget card and on its status, result and completion, and launch MUST fail with a truthful missing-implementation diagnostic only when no selected tool remains.
  - GIVEN explicit, glob or dynamic operator selections and root tools that are inactive, delegation tools or lack a child implementation; WHEN the panel saves, synchronization runs and a child launches; THEN operator intent persists, `*` yields the child-loadable active eligible tools without delegation tools, explicit names reach the child even when inactive in the root, missing implementations are dropped and reported for every form, the child fails only when nothing remains, and nothing is silently widened or omitted.

## Plan

1. Worker A (sole writer of `pi-packages/pi-subagents/**`): AC-1, AC-2, AC-4 and its AC-5
   package docs, test-first.
2. Worker B (sole writer of `pi-packages/pi-claude-bridge/**`): AC-3 and its README note,
   test-first, unit tests only (never the live `test` script).
3. Worker C (sole writer of `pi-packages/pi-antigravity-bridge/**`): AC-7 and its README
   note, test-first.
4. Root (parallel, disjoint): `docs/installation.md`, `docs/agent/harness-packaging.md`.
5. Root: frozen checks, commits, merge, restart, AC-6 live, fresh Oracle, archive.

## Tasks

- [x] AC-1: tolerant explicit and glob selection
  - Outcome: missing implementations dropped with warning for every form; fail only when none remain
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts:97–131,548–560,654–659`, `src/tool-patterns.ts`, `test/runner/providers-real-sdk.test.ts:150–186`, `test/runner/interaction-bridge.test.ts:1154,1218–1256`, tdd skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Exploration, Clarifications
  - Dependencies: none
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: `*` semantics, reserved controls and delegation exclusions unchanged
  - Focused check and PASS evidence: real-SDK partial drop for explicit/glob/mixed, all-missing failure, inactive explicit still selectable; suite green
  - Return milestone: tests green
  - Stop / reassessment: unexpected-registered-tool verification conflicts with dropping
- [x] AC-2: widget card warning
  - Outcome: dropped tools visible on the widget card
  - Known entrypoints and skill paths: `src/ui/background-widget.ts`, `src/render/tool-selection-warning.ts`, tdd skill
  - Inputs: AC-1
  - Dependencies: AC-1 (same writer)
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: existing card metrics/layout unchanged when no warning
  - Focused check and PASS evidence: render tests with and without dropped tools, narrow width
  - Return milestone: tests green
  - Stop / reassessment: card layout cannot fit the warning without dropping metrics
- [x] AC-3: claude-bridge non-object schemas
  - Outcome: one non-object tool never fails the request
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/mcp-server.ts:51–70`, `src/index.ts:1093–1098,1932`, `tests/unit-*.mjs`, tdd skill
  - Inputs: Exploration, Clarifications
  - Dependencies: none
  - Output: code + unit tests + README note
  - Owner: worker B
  - Writes: `pi-packages/pi-claude-bridge/**`
  - Interface boundaries: object schemas served unchanged; Pi-side validation unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-claude-bridge run test:unit`
  - Return milestone: unit tests green
  - Stop / reassessment: the in-process SDK server rejects `anyOf` alongside `type: object`
- [x] AC-7: Antigravity bridge non-object schemas
  - Outcome: agy receives wrapped object unions; other non-object schemas omitted with warning
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/extensions/index.ts:827–837`, `src/mcp-server.ts:304–307`, tdd skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Exploration, Clarifications
  - Dependencies: none
  - Output: code + tests + README note
  - Owner: worker C
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: object schemas unchanged; bridge lifecycle unchanged
  - Focused check and PASS evidence: package typecheck/test
  - Return milestone: tests green
  - Stop / reassessment: agy rejects the wrapped union (apply AC-3's backend rule)
- [x] AC-4: error classification
  - Outcome: no network misclassification from payload substrings
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/error-metadata.ts:20–37,283–363`, tdd skill
  - Inputs: Exploration
  - Dependencies: none
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: other categories unchanged
  - Focused check and PASS evidence: tests for the observed message and genuine network errors
  - Return milestone: tests green
  - Stop / reassessment: none
- [x] AC-5: docs
  - Outcome: docs describe tolerant selection, widget warning, inactive explicit behavior, schema handling
  - Known entrypoints and skill paths: package README/SKILL (worker A), claude-bridge README (worker B), `docs/installation.md:389–437`, `docs/agent/harness-packaging.md:59–83` (root)
  - Inputs: Clarifications
  - Dependencies: none for root parts
  - Output: docs
  - Owner: workers for package docs; root for root docs
  - Writes: listed docs
  - Interface boundaries: unrelated docs unchanged
  - Focused check and PASS evidence: text review; `pnpm run check:ci`
  - Return milestone: committed
  - Stop / reassessment: none
- [x] AC-6: checks and live
  - Outcome: checks pass; live behavior confirmed
  - Known entrypoints and skill paths: thoth-archive skill
  - Inputs: AC-1..AC-5, AC-7
  - Dependencies: AC-1..AC-5, AC-7
  - Output: evidence
  - Owner: root
  - Writes: operator agent tool lists only through the operator's `/subagents-tools`
  - Interface boundaries: operator config otherwise preserved
  - Focused check and PASS evidence: live Claude child with electron; explicit missing tool warning on card
  - Return milestone: fresh Oracle PASS
  - Stop / reassessment: a backend rejects wrapped unions (apply AC-3's backend rule)

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Scope amended after live AC-6 (AC-3 Claude `input` wrapping, AC-7 short server name and
name-length warning); plan review and implementation authorization reset. The user
explicitly selected Review plan with Oracle; fresh Oracle
subtask_thoth-oracle_1790920495772_88b41398 returned [OKAY] on the amended plan. Cautions:
unwrap `input` at both Claude argument seams (`src/index.ts:1346` streamed and `:1454`
completed `tool_use`) and in replay/history conversion (`src/convert.ts`), only for
advertised wrapped tools; recognize root unions before the `type:"object"` early return;
fixtures diverge only in advertised shape; 8-hex collision check against live
`agy-mcp-*/.agents/mcp_config.json` keys plus in-process reservations, exact
acquired-key cleanup preserved; enforce `4 + server + 1 + tool <= 64` with the actual
discovery names (legacy `pi-bridge-<pid>-<UUID>`, legacy ACP `pi-bridge`); keep the
long-vs-short checkpoint; AC-6 must show the running-widget warning. Earlier: the
user explicitly selected Review plan with Oracle, round 2 returned [OKAY] and the user
chose Implement; that authorization covered the pre-amendment scope.

The user explicitly selected Review plan with Oracle. Round 1 returned [REJECT]
(terminal widget cards, contradictory backend fallback), repaired here; round 2 fresh
Oracle subtask_thoth-oracle_1790916773082_1168a320 returned [OKAY]. Cautions: backend
acceptance stays unproven until the live checks; headless warning evidence must show real
visible output; workers B and C use identical eligibility fixtures.

## Verification

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence
- AC-6: PENDING | check | evidence
- AC-7: PENDING | check | evidence
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:0fc837a611cc7040c4fe060bd15201b129a93836fabbe0f5ce88262b366bf4f7

## Closeout

**Archive**: PENDING
