# Change: antigravity-upstream-fixes

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: high

## Exploration

- `pi-packages/pi-antigravity-bridge` vendors `packages/pi-antigravity-bridge` of EstebanForge/pi-extensions from upstream `f95def9` (1.7.8), plus fork fixes `a5c3957` and `237a5f1` (EremesNG fork at `64170a1`, which has no newer commits). Upstream HEAD is `8f4cd6c` (1.8.7): 53 package commits, of which 21 are fixes or compatibility changes.
- Local additions that must survive:
  - Instance-scoped teardown and lazy model-gated startup (`00e43d9`; `extensions/index.ts:143–169,237–259,671–711,1059–1110`; `src/provider.ts:395`).
  - Windows process-tree termination and Job Object containment (`1bbf2d3`; `src/driver.ts:27,804`; `src/acp/connection.ts:31,191,537`; `src/ask-tool.ts:31,777`).
  - Instance-local round-trip and render ownership (`extensions/index.ts:424–524`; `src/provider.ts:630,705,803`).
  - Inline Ask watchdog (`src/ask-tool.ts:623,710,830,908`).
  - Portable tests (`vitest.config.ts:6`; `tests/helpers/portable-spawn.ts:5–35`).
  - Stale-cache discovery and Gemini Argon (`5ab0787`), and the Ask effort alias (`9d3020d`).
- Each candidate patch was checked independently with `git diff SHA^ SHA -- packages/pi-antigravity-bridge | git apply --check -p3 --directory=pi-packages/pi-antigravity-bridge`. Only `7103240` applies cleanly; the rest fail on context divergence. None requires adopting shared Ask (`76f1bb5`), shared dialogs (`80e455b`, `b0dade8`) or the ACP default (`673a37a`). `aa1ee31` was written against shared Ask helpers and must be reimplemented locally. `86149be` introduces a module-global auth-invalidation hook that conflicts with instance ownership.
- Dependency groups:
  - Catalog: `7ea090d` → `2c29c61` → `4f58110`.
  - Read-only safety: `62f184d` → `2afd6a0`, with `7103240` independent.
  - Carrier: `d746ccd` → `9eba5d7`.
  - Escalation and replay: `1cfa4ec` → `908c69c`.
  - ACP auth: `86149be` → `d88e793`.
  - Separate: timeout budget, poll folding, SDK floor.
- Upstream behavior adopted:
  - `62f184d` adds a `readOnly` kill switch (`AGY_READONLY`, `/agy readonly on|off`). It refuses provider turns with `mode: "plan"` or `readOnly` with a visible error, because the agy CLI does not gate writes in plan mode (google-antigravity/antigravity-cli#1181).
  - It also refuses AskAntigravity under `readOnly`, defaults AskAntigravity `mode` to the configured mode, and stops passing `--dangerously-skip-permissions` to plan runs, so analysis commands in plan runs fail visibly (headless auto-deny).
  - `2afd6a0` strips every skip-flag spelling and makes effective-config warnings accurate.
  - `1cfa4ec` re-delivers done-but-unpolled escalated results at turn boundaries.
  - `908c69c` skips `call_mcp_tool` replay, honors the active tool whitelist before emitting a synthetic `antigravity` toolUse, routes delegation through Pi tools, and holds delegation-shaped calls 120s (`escalateLongTools`, `AGY_ESCALATE_LONG_TOOLS`).
- The default engine is stream-json (`src/config.ts:182,249–250`); ACP is opt-in through config, env, `/agy engine acp` or the first-run picker (`extensions/index.ts:680–697,1252–1321`).
- Versions:
  - Pi peer `>=0.99.0` and dev pins `1.0.2`, consistent across all pi-packages.
  - MCP SDK dev range `^1.29.0`, lock-resolved `1.29.0` (`pnpm-lock.yaml:105–118`). Upstream `192f0a5` raises the floor to 1.31.0 for GHSA-6qxp-vccf-f47h; upstream assesses the bridge's server-side usage as not exposed.
  - Root declares `yaml` 2.9.0; upstream carrier tests parse frontmatter with `yaml`.
- Baseline: `pnpm --filter @thoth-agents/pi-antigravity-bridge test --maxWorkers=2` reports 936 passed and 9 skipped (77 files).
- Upstream partial clone: `C:\Users\EremesNG\AppData\Local\Temp\pi-upstream-audit-6d2273f3d3a34da4a935271a5ad254e9` (bash `/tmp/pi-upstream-audit-6d2273f3d3a34da4a935271a5ad254e9`).

## Intent

Port every applicable upstream fix from 1.7.8 through 1.8.7 into the vendored Antigravity bridge, adapted to its local lifecycle, Windows containment and portable tests, without adopting upstream's shared-package refactors or ACP default.

## Non-goals

- Adopting `pi-ask-shared` (`76f1bb5`), shared dialogs (`80e455b`, `b0dade8`), the ACP default for new installs (`673a37a`), or the Ask background parameter and 30-minute timeout default (`9c7afba`, `bb4b586`).
- Raising the Pi peer floor to `^1.0.0` (`aa284df`). It stays `>=0.99.0` per workspace policy.
- A full re-sync to upstream HEAD. Bumping the package version or publishing.
- Live agy runs.

## Acceptance

- AC-1: The generated carrier and web-tool agent frontmatter is valid YAML when descriptions contain `: ` (`d746ccd`). The carrier declares `subagent: false` and `agents: []` (`9eba5d7`). The Ask prompt no longer promises that headless read commands succeed (`7103240`). Each is covered by tests that parse the generated frontmatter.
- AC-2: The model catalog follows upstream's tiered Claude catalog and refreshed aliases and fallback (`7ea090d`), filters the retired GPT-OSS family (`2c29c61`), and resolves bare tiered base IDs with effort instead of failing (`4f58110`). Local discovery, stale-cache, Argon and process-tree handling are kept. Every catalog-priced ID that the migration introduces (the replacement fallback and alias IDs, such as Gemini 3.8 Flash and tiered Claude Sonnet/Opus 5.5) has an explicit `PRICE_MAPPING` entry in `src/pricing.ts` that maps it to its installed Pi catalog price. Message-cost tests prove a nonzero API-equivalent cost for each of them. IDs without a verified catalog equivalent, such as Gemini Argon and unknown discovered IDs, keep the existing zero-cost-with-warning behavior; no price is invented for them.
- AC-3: Read-only safety from `62f184d` and `2afd6a0`, with README and the AskAntigravity tool description corrected to match:
  - `readOnly` (config key, `AGY_READONLY`, `/agy readonly on|off`) refuses every provider turn and every AskAntigravity call with a visible error, without launching agy.
  - Provider turns with mode `plan` are refused visibly.
  - AskAntigravity `mode` defaults to the configured mode, and an explicit `mode` param still wins except under `readOnly`.
  - Plan runs never receive any spelling of the skip-permissions flag; `accept-edits` runs keep it.
- AC-4: Escalated results that completed but were never polled are re-delivered once at the next turn boundary as a late prompt in their stamped conversation, and stay pollable (`1cfa4ec`). `call_mcp_tool` is not replayed, synthetic `antigravity` toolUse is emitted only when that tool is active, delegation goes through Pi tools when available, and delegation-shaped calls hold a 120s synchronous window configurable through `escalateLongTools` and `AGY_ESCALATE_LONG_TOOLS` (`908c69c`). Both are adapted to instance-local round-trip ownership.
- AC-5: AskAntigravity rejects timeout budgets that cannot fit and includes a timeout notice in the delegated prompt (`aa1ee31`, reimplemented locally in `src/ask-tool.ts` without shared Ask).
- AC-6: Consecutive poll calls fold into one counted transcript entry with muted statuses (`c98938c`), wired through the instance-local transcript and render path.
- AC-7: ACP tokenless authentication is verified with a live session probe in the configured cwd, and the auth marker is invalidated on auth errors (`86149be`, `d88e793`). The invalidation is scoped to the owning bridge instance rather than a module global, and ACP Windows termination is unchanged.
- AC-8: `@modelcontextprotocol/sdk` is declared `^1.31.0`, and `yaml` is declared as a dev dependency at the workspace version if tests import it. `pnpm-lock.yaml` is updated through `pnpm install`. The Pi peer stays `>=0.99.0`, Pi dev pins stay `1.0.2`, and the package version is unchanged.
- AC-9: All local additions listed in Exploration still work, and the existing `.thoth/specs/pi-ecosystem/spec.md` requirements for this bridge still hold. Those are: the terminal stream guarantee, Windows job containment, the compact tool-definition size budget, and subscription cost and on-demand quota. Existing tests pass unchanged except where an adopted fix intentionally changes asserted behavior; each such change is listed with its reason. `CHANGELOG.md` records the ported upstream commits.
- AC-10: Package `typecheck`, `test --maxWorkers=2` and `build` pass. Root `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- Scope: the user chose to port all applicable groups (catalog, read-only safety, carrier, escalation/MCP/delegation, timeout budget, poll folding, ACP auth, MCP SDK floor).
- No other material question remains. The peer floor and the engine default follow workspace policy and repository evidence.

## Decisions

- Adapt or reimplement each upstream fix against local code; do not apply upstream refactors to make patches fit.
- Adopt upstream's read-only semantics fully. This has a known effect on Thoth: AskAntigravity `plan` reviews can still read, but command execution is no longer auto-approved and may fail, so command-backed checks are not reliably available and review material should be supplied in the prompt. Provider turns in plan mode are refused. Plan mode is a damper, not a read-only security boundary; only `readOnly` refuses outright. Upstream evidence (antigravity-cli#1181) shows plan mode does not prevent writes.
- Scope ACP auth invalidation to the bridge instance, to preserve instance ownership.
- Keep Pi peer `>=0.99.0` and dev pins `1.0.2`, consistent with the workspace.
- Port units sequentially, because they share `src/ask-tool.ts`, `src/provider.ts`, `src/config.ts` and `extensions/index.ts`.
- `pnpm-lock.yaml` is shared with change `claude-bridge-sync-0-9-3`. This change's dependency unit starts only after that change's AC-3 lockfile unit is accepted.
- Do not auto-increment the package version.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge read-only enforcement** — `@thoth-agents/pi-antigravity-bridge` MUST refuse with a visible error, without launching agy, every provider turn while `readOnly` is on or the provider mode is plan, and every AskAntigravity call while `readOnly` is on, and MUST never pass any spelling of agy's skip-permissions flag to a plan-mode run.
  - GIVEN `readOnly` on or provider mode plan; WHEN a provider turn starts, or an AskAntigravity call starts while `readOnly` is on; THEN it fails with a visible error and no agy process starts; and GIVEN an AskAntigravity plan run; WHEN agy is launched; THEN its arguments contain no skip-permissions flag.
- `ADDED pi-ecosystem` **Antigravity bridge re-delivers unpolled escalated results** — `@thoth-agents/pi-antigravity-bridge` MUST re-deliver, exactly once and at the next turn boundary, each escalated bridge call result that completed but was never returned by a poll, as a late prompt in the conversation it belongs to, keeping it pollable and leaving a result with no known conversation pollable without prompting.
  - GIVEN an escalated bridge call that completes after the model ended its turn without polling; WHEN the next turn boundary is reached; THEN the result is delivered once as a late prompt in its conversation and remains pollable.

## Plan

- Upstream source: the existing partial clone (or a fresh one). Never touch `C:\DEV\Proyectos\Webstorm\pi-extensions-antigravity-bridge`. For each fix, port tests first from the upstream commit, adapted to portable fixtures (`tests/helpers/portable-spawn.ts`), then source adapted to local structure, then a `CHANGELOG.md` entry.
- Unit order:
  1. AC-8 dependency floor (after `claude-bridge-sync-0-9-3` AC-3).
  2. AC-1 carrier and prompt.
  3. AC-2 catalog.
  4. AC-3 read-only safety.
  5. AC-4 escalation and replay.
  6. AC-5 timeout budget.
  7. AC-6 poll folding.
  8. AC-7 ACP auth.
  9. AC-9 regression review (root).
  10. AC-10 closeout checks (root).
- Interfaces to preserve: Pi provider and extension APIs at 1.0.2; pi-core provider-limit, render-kit and work-panel contracts; the Windows job launcher; `.thoth/specs/pi-ecosystem` Antigravity requirements; the tool-definition size-budget test.
- Mutable surfaces: `pi-packages/pi-antigravity-bridge/**` (one writer at a time) and root `pnpm-lock.yaml` (AC-8 only, serialized with the other change).
- Verification seams: `pnpm --filter @thoth-agents/pi-antigravity-bridge run typecheck`, `run test --maxWorkers=2` (baseline 936 pass / 9 skip) and `run build`; root `pnpm run test:pi-extensions`, `pnpm run check:ci`, `pnpm run typecheck`.
- Risks:
  - Lifecycle regressions in provider and round-trip code.
  - Instance-ownership violations from upstream module-global state.
  - Catalog names unverified against the live agy CLI.
  - The tool-definition size budget exceeded by new schema text.
  - Plan-mode behavior changes for Thoth reviews.
- Mitigations: test-first ports, fresh independent Oracle verification of the diff.

## Tasks

- [x] AC-8: MCP SDK floor raised to ^1.31.0 with yaml dev dependency and lockfile updated
  - Outcome: dependency declarations and `pnpm-lock.yaml` are updated, and the current bridge still passes.
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/package.json`, root `pnpm-lock.yaml`, root `package.json:94` (`yaml` 2.9.0).
  - Inputs: the accepted Exploration and Decisions.
  - Dependencies: `claude-bridge-sync-0-9-3` AC-3 accepted by root.
  - Output: dependency diff and install summary.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/package.json` dependency fields, `pnpm-lock.yaml`.
  - Interface boundaries: workspace single lockfile; other packages' resolutions unchanged except the shared MCP SDK dedupe.
  - Focused check and PASS evidence: `pnpm install` succeeds; package `typecheck` exits 0 and `test --maxWorkers=2` reports 936 pass / 9 skip.
  - Return milestone: after install and checks.
  - Stop / reassessment: an MCP SDK 1.31 API break in current code.
- [x] AC-1: Carrier and web-tool frontmatter valid YAML, carrier subagent declarations, and accurate headless prompt
  - Outcome: `d746ccd`, `9eba5d7` and `7103240` are ported with tests.
  - Known entrypoints and skill paths: `src/sysprompt-agent.ts:43–50`, `src/web-tools.ts`, `src/ask-tool.ts:264–273`, `tests/{sysprompt-agent,web-tools,ask-tool}.test.ts`; upstream clone. Skills: `tdd`, then `simplify`.
  - Inputs: accepted AC-8.
  - Dependencies: AC-8 accepted by root.
  - Output: source and tests diff, with a list of adapted upstream tests.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,tests}/**`, `CHANGELOG.md`
  - Interface boundaries: carrier agent file format consumed by agy.
  - Focused check and PASS evidence: new frontmatter-parse tests fail before and pass after; full package tests and typecheck pass.
  - Return milestone: on completion.
  - Stop / reassessment: carrier semantics that differ locally from upstream.
- [x] AC-2: Tiered model catalog, retired-family filter and bare tiered ID resolution
  - Outcome: `7ea090d`, `2c29c61` and `4f58110` are ported with tests; pricing covers every catalog-priced ID the migration introduces, and IDs without a verified catalog equivalent stay unpriced with a warning.
  - Known entrypoints and skill paths: `src/models.ts:102`, `src/ask-tool.ts:63–70,154–175`, `src/pricing.ts` (`PRICE_MAPPING`), `tests/message-cost.test.ts`, model and Ask tests; upstream clone; installed Pi catalog through `@earendil-works/pi-ai` `getModels`. Skills: `tdd`, then `simplify`.
  - Inputs: accepted AC-1.
  - Dependencies: AC-1 accepted by root.
  - Output: source and tests diff, with a note on kept local discovery and Argon behavior.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,tests}/**`, `CHANGELOG.md`
  - Interface boundaries: model IDs exposed to Pi; local discovery process-tree termination; the subscription provider cost requirement in `.thoth/specs/pi-ecosystem/spec.md`.
  - Focused check and PASS evidence: catalog, retired-filter and bare-ID tests pass; new message-cost tests for each catalog-priced migration ID fail before the mapping update and pass after with nonzero cost; existing unpriced-ID tests (Argon, unknown) still pass; full package tests and typecheck pass.
  - Return milestone: on completion.
  - Stop / reassessment: an upstream catalog change that conflicts with local Argon or stale-cache behavior.
- [x] AC-3: Read-only kill switch, plan refusal, config-following Ask mode and skip-flag stripping
  - Outcome: `62f184d` and `2afd6a0` are ported, and README and the AskAntigravity description are corrected.
  - Known entrypoints and skill paths: `src/provider.ts:1605–1612`, `src/ask-tool.ts:630,683–689,706–707`, `src/config.ts`, `src/driver.ts`, `extensions/index.ts`, `README.md`; upstream `tests/readonly.test.ts`. Skills: `tdd`, then `simplify`.
  - Inputs: accepted AC-2.
  - Dependencies: AC-2 accepted by root.
  - Output: source, tests and docs diff.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/**` except `package.json` dependency fields.
  - Interface boundaries: AskAntigravity tool schema and description (size-budget test); `/agy` commands; config file schema.
  - Focused check and PASS evidence: readonly and Ask tests prove refusal without spawning agy and the absence of the skip flag in plan runs; README and the tool description describe plan mode as a damper, not a read-only guarantee; full package tests (including the size budget) and typecheck pass.
  - Return milestone: on completion.
  - Stop / reassessment: the size budget cannot fit the corrected description, or lazy startup conflicts with refusal placement.
- [x] AC-4: Unpolled escalation re-delivery and MCP replay, whitelist and delegation-window fixes
  - Outcome: `1cfa4ec` and `908c69c` are ported onto instance-local round trips.
  - Known entrypoints and skill paths: `src/provider.ts:181–182,496,872–888,1238–1242,1339`, `src/config.ts`, `extensions/index.ts:424–524`, provider escalation, late-result, sysprompt and stream-roundtrip tests. Skills: `tdd`, then `simplify`.
  - Inputs: accepted AC-3.
  - Dependencies: AC-3 accepted by root.
  - Output: source and tests diff.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/**` except `package.json` dependency fields.
  - Interface boundaries: the terminal stream guarantee spec; instance teardown; config keys `escalateLongTools` and `escalateAfterMs`.
  - Focused check and PASS evidence: re-delivery, whitelist, replay and delegation-window tests pass; full package tests and typecheck pass.
  - Return milestone: on completion.
  - Stop / reassessment: re-delivery that requires module-global state across instances.
- [x] AC-5: Impossible AskAntigravity timeout budgets rejected with a prompt timeout notice
  - Outcome: `aa1ee31` behavior is reimplemented in the local Ask tool.
  - Known entrypoints and skill paths: `src/ask-tool.ts:436–437,623,827`, Ask tests. Skills: `tdd`, then `simplify`.
  - Inputs: accepted AC-4.
  - Dependencies: AC-4 accepted by root.
  - Output: source and tests diff.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/**` except `package.json` dependency fields.
  - Interface boundaries: AskAntigravity schema (size budget); the watchdog and Windows termination path.
  - Focused check and PASS evidence: invalid-budget rejection and prompt-notice tests pass; full package tests and typecheck pass.
  - Return milestone: on completion.
  - Stop / reassessment: a budget rule that conflicts with the local watchdog semantics.
- [x] AC-6: Consecutive poll calls folded into one counted transcript entry
  - Outcome: `c98938c` is ported through the instance-local transcript sink.
  - Known entrypoints and skill paths: `extensions/index.ts:440–456`, `src/provider.ts`, new `src/poll-fold.ts` and `tests/poll-fold.test.ts`. Skills: `tdd`, then `simplify`.
  - Inputs: accepted AC-5.
  - Dependencies: AC-5 accepted by root.
  - Output: source and tests diff.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/**` except `package.json` dependency fields.
  - Interface boundaries: render-kit and work-panel contracts.
  - Focused check and PASS evidence: poll-fold tests pass; full package tests and typecheck pass.
  - Return milestone: on completion.
  - Stop / reassessment: folding that conflicts with pi-core render contracts.
- [x] AC-7: ACP tokenless auth verified by a live session probe in the configured cwd, with instance-scoped invalidation
  - Outcome: `86149be` and `d88e793` are ported without module-global hooks.
  - Known entrypoints and skill paths: `src/acp/{auth,connection,setup}.ts`, `src/acp/auth.ts:55–67`, `extensions/index.ts`, ACP auth, connection and setup tests. Skills: `tdd`, then `simplify`.
  - Inputs: accepted AC-6.
  - Dependencies: AC-6 accepted by root.
  - Output: source and tests diff.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/**` except `package.json` dependency fields.
  - Interface boundaries: the ACP Windows Job containment spec; lazy model-gated startup.
  - Focused check and PASS evidence: ACP auth-probe, cwd and invalidation tests pass, including a two-instance isolation test; full package tests and typecheck pass.
  - Return milestone: on completion.
  - Stop / reassessment: a probe that would need a real agy launch in tests.
- [x] AC-9: Regression review confirms local additions and Antigravity spec requirements survive
  - Outcome: root accepts or rejects the cumulative diff's preservation of local behavior.
  - Known entrypoints and skill paths: the cumulative diff of `pi-packages/pi-antigravity-bridge/**`; `.thoth/specs/pi-ecosystem/spec.md`; worker reports on changed existing tests.
  - Inputs: accepted AC-1 through AC-8.
  - Dependencies: AC-7 accepted by root.
  - Output: acceptance decision, or regressions returned to a worker.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: full package tests pass, and every changed existing test traces to an adopted fix.
  - Return milestone: after AC-7.
  - Stop / reassessment: an unexplained change to an existing test.
- [x] AC-10: Package and root closeout checks pass
  - Outcome: build and root gates are green.
  - Known entrypoints and skill paths: package and root `package.json` scripts.
  - Inputs: accepted AC-9.
  - Dependencies: AC-9 accepted by root.
  - Output: check results.
  - Owner: root
  - Writes: none (generated build output only)
  - Interface boundaries: none
  - Focused check and PASS evidence: package `build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` exit 0.
  - Return milestone: after the checks run.
  - Stop / reassessment: failures caused by unrelated workspace changes are reported.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1688132116b0297543cb10cf09c88ce0748634f483a7b2ebc11d2b057f48c86d

Final verification took five fresh Oracle rounds. Each failing round found a new, real defect, and each was fixed through convergence with red → green regressions:
- Round 1: claims were consumed before dispatch, and the `192f0a5` changelog entry was missing.
- Round 2: the Windows stdin facade acknowledged its own buffer instead of the `job.stdin` write.
- Round 3: the ACP dispatch acknowledgement had no deadline; it is now bounded by `startupTimeoutMs`, with 0 still disabling it.
- Round 4: blanket turn-end conversation stamping could route a private result into an unrelated conversation; ownership is now handle-scoped.
- Round 5: PASS.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. Fresh independent review found no blocking violations of AC-1 through AC-10, the Decisions, either ADDED delta, or the existing Antigravity requirements. Round 1–4 fixes remain effective.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/antigravity-upstream-fixes/antigravity-upstream-fixes.md",
      "claim": "Independently hashed exact bytes preceding ## Authorization. The installed verify validator passes; canonical spec SHA-256 matches the recorded baseline.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "ownership-review",
      "locator": "pi-packages/pi-antigravity-bridge/src/provider.ts:530-1063; extensions/index.ts:529-535",
      "claim": "Parks retain their originating driver and handle. Only that handle's outcome supplies conversation ownership. Tombstones preserve ownership; unknown results remain pollable without prompting. Continuations and idle resets check the originating handle, and digests exclude ownership-managed results. Blanket turn-end stamping is absent.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "dispatch-review",
      "locator": "pi-packages/pi-antigravity-bridge/src/{provider,driver,owned-process}.ts; src/acp/{driver,connection,jsonrpc}.ts",
      "claim": "Late-delivery reservations commit only after target-confirmed prompt writes. Setup/write failures release reservations; post-dispatch failures do not retry. Both engines bound dispatch waits, retire expired transports, and preserve disabled startup caps.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "port-review",
      "locator": "pi-packages/pi-antigravity-bridge/{src,extensions,tests,README.md,CHANGELOG.md}; upstream git objects",
      "claim": "Reviewed tracked and untracked changes against the declared upstream fixes. Catalog, pricing, YAML carriers, read-only refusals, timeout notices, poll folding, replay guards and instance-owned auth invalidation are integrated without the excluded refactors or default/version changes. Changelog identifies the ported commits.",
      "basis": "observed",
      "uncertainty": "No live agy execution, as required."
    },
    {
      "id": "E5",
      "kind": "dependency-and-scope",
      "locator": "pi-packages/pi-antigravity-bridge/package.json; pnpm-lock.yaml; excluded Claude surfaces",
      "claim": "MCP SDK ^1.31.0 resolves to 1.32.1; yaml is 2.9.0. Pi pins, peer floor and package version remain unchanged. Other importer changes normalize entirely to MCP peer deduplication. Claude retains its separate SDK resolution. Scoped, excluded-Claude, spec and lockfile byte fingerprints were unchanged throughout review.",
      "basis": "observed",
      "uncertainty": "Historical attribution of the separate uncommitted Claude change relies on the supplied archived-change provenance."
    },
    {
      "id": "E6",
      "kind": "independent-tests",
      "locator": "Antigravity focused Vitest runs, --maxWorkers=2",
      "claim": "35 files passed: 485 tests passed and one skipped. Coverage included ownership isolation, first-turn ownership, tombstones, digests, continuations, delivery retries, blocked dispatch deadlines, Windows target-write acknowledgements, real Job containment, read-only behavior, pricing, auth, folding and tool-size budget.",
      "basis": "observed",
      "uncertainty": "Focused runs, not a repeated full suite."
    },
    {
      "id": "E7",
      "kind": "independent-checks",
      "locator": "package typecheck; scoped git diff --check",
      "claim": "Package typecheck and scoped whitespace checks pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "root-execution-evidence",
      "locator": "Delegated assignment's exact-tree check results",
      "claim": "Root reports 83 package test files with 1099 passed and 9 skipped, package typecheck, root build including Pi bundles, test:pi-extensions 13/13, check:ci, root typecheck and Claude units 537/537 all passing.",
      "basis": "inferred",
      "uncertainty": "Reused supplied fresh exact-tree evidence; broader checks were not independently repeated."
    }
  ],
  "verification": [
    {
      "check": "AC-1: carrier frontmatter and review prompt",
      "method": "Reviewed generated templates and YAML regression tests; reran affected suites.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Carrier declarations and accurate headless-review guidance are present."
    },
    {
      "check": "AC-2: catalog, aliases and pricing",
      "method": "Reviewed mappings and retained discovery behavior; reran model, Ask and message-cost suites.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Tiered IDs resolve correctly; introduced priced IDs have nonzero mapped cost, while Argon and unknown IDs remain unpriced with warnings."
    },
    {
      "check": "AC-3 and read-only durable delta",
      "method": "Reviewed refusal placement, configuration precedence, argv filtering and documentation; reran refusal and lifecycle tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Provider plan/readOnly and Ask readOnly refuse before startup; plan delegations never receive skip-permissions flags."
    },
    {
      "check": "AC-4 and re-delivery durable delta",
      "method": "Traced ownership, recovery, polling, replay and dispatch paths; reran adversarial ownership and transport tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E6"],
      "reason": "Known results route only to their originating conversations; unknown results remain undelivered and pollable. Reservations, retries, whitelist guards and delegation windows satisfy the contract."
    },
    {
      "check": "AC-5: timeout budgets",
      "method": "Reviewed validation and watchdog wiring; reran Ask tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Impossible budgets reject before spawn; valid budgets carry matching notices without moving safety guards."
    },
    {
      "check": "AC-6: poll folding",
      "method": "Reviewed state machine, persistence and renderer wiring; reran unit and extension integration tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Consecutive polls fold once per completion, with muted status and instance-local lifecycle resets."
    },
    {
      "check": "AC-7: ACP authentication",
      "method": "Reviewed probe cwd, marker handling and callback ownership; reran auth, connection, driver, setup and lifecycle tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Tokenless authentication requires a successful session probe; auth errors invalidate through owning callbacks without sibling teardown."
    },
    {
      "check": "AC-8: dependency constraints",
      "method": "Inspected manifest and parsed lockfile; compared importer changes.",
      "outcome": "pass",
      "evidenceIds": ["E5"],
      "reason": "Required dependency floor and yaml importer are present; excluded Claude dependency entries remain separate."
    },
    {
      "check": "AC-9: preserved behavior and canonical requirements",
      "method": "Reviewed changed expectations and preservation seams; reran terminal, ownership, Windows Job, pricing and tool-budget checks.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E6", "E8"],
      "reason": "Terminal guarantees, containment, compact definitions and subscription pricing remain intact. Quota remains command-triggered; local startup, teardown, watchdog and replay behavior is preserved."
    },
    {
      "check": "AC-10: required execution checks",
      "method": "Independently reran focused tests and package typecheck; reused fresh root full-suite, build and workspace evidence.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7", "E8"],
      "reason": "All required checks have passing evidence."
    },
    {
      "check": "Record binding, durable-delta coherence and freshness",
      "method": "Repeated byte fingerprints, canonical baseline hash and installed verify validation after checks.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5"],
      "reason": "Reviewed inputs remained unchanged; both additions are distinct from existing canonical requirements."
    }
  ],
  "risks": [
    {
      "description": "Live catalog availability and real OAuth/server behavior were not exercised; verification used offline fixtures and upstream evidence, consistent with the explicit non-goal.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4", "E6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record acceptance evidence, run closeout, then archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/antigravity-upstream-fixes/antigravity-upstream-fixes.md",
    "reviewedRecordSha256": "1688132116b0297543cb10cf09c88ce0748634f483a7b2ebc11d2b057f48c86d"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | frontmatter YAML-parse and carrier-declaration tests, Ask prompt tests | red → green; package suite green
- AC-2: PASS | catalog, retired-filter, bare-ID and message-cost tests | 12 catalog-priced IDs mapped nonzero from Pi 1.0.2 catalog; Argon and unknown IDs zero with warning; thinking-only kept
- AC-3: PASS | readonly suite (13 upstream tests), Ask/driver argv tests, tool-budget test | refusals before agy spawn; no skip flag in plan runs; definitions 2,178 of 2,246 chars
- AC-4: PASS | provider-escalation, late-result, dispatch, dispatch-timeout and ownership regressions | exactly-once re-delivery in the owning conversation only; unknown owner stays pollable; MCP replay skip, whitelist guard, 120s delegation window
- AC-5: PASS | Ask timeout-budget tests | non-finite, non-positive and over-35,791-minute budgets rejected before spawn; [TIME BUDGET] notice in prompt
- AC-6: PASS | poll-fold unit and extension integration tests | consecutive polls fold into one counted entry
- AC-7: PASS | ACP auth, connection, driver, setup and lifecycle tests, including two-instance isolation | session/new probe in configured cwd; shared marker; instance-owned invalidation
- AC-8: PASS | pnpm install; manifest and lockfile inspection | MCP SDK ^1.31.0 resolved 1.32.1; yaml 2.9.0; Pi pins and version unchanged
- AC-9: PASS | root regression review; full package suite; Oracle contract review | terminal stream, Windows Job containment, size budget and subscription pricing preserved; changed existing tests traced to adopted fixes
- AC-10: PASS | package test, typecheck, build; root build, test:pi-extensions, check:ci, typecheck | 1099 passed / 9 skipped; exit 0; exit 0; 13/13; exit 0; exit 0
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:91d5136a1018a02d8cff61723d1f5c137d6088625a780a96072d5869f2bb5ad6

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
