# Change: pi-deferred-tool-exposure

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

Measured on Pi 1.5.0 (`/context` view): a bare "hola" spends 11.2k tokens on 37 custom tool declarations. First-party contributors: pi-background-tasks about 2.7k (`bg_task_watch` 988, `bg_task_spawn` 555), AskAntigravity 402, AskCodex 328, plus Context7 (`@upstash/context7-pi`) about 1.1k installed by this product.

Pi 1.5 tool registration supports `exposure: direct | model-only | codemode | deferred | hidden` plus `namespace {name, aliases, description, instructions}`. `deferred` tools are not declared to the model, are found and activated by the built-in `tool_search` (enabled with `+tool_search` in `defaultTools`), and remain callable from `codemode` scripts through `searchTools()`/`describeTool()`. Non-declared tools lose their prompt snippet and guidelines in the default system prompt.

Explorer evidence (accepted):
- `pi-packages/pi-background-tasks/src/tools.ts:161-244` registers seven direct tools; spawn carries `BACKGROUND_ORCHESTRATION_GUIDELINES` (`:111`, `:166`). Budget tests: `src/tool-budget.test.ts`, `src/tools.test.ts`, `src/tool-publication.test.ts`.
- `pi-packages/pi-askcodex/src/ask-tool.ts:88-94` registers `AskCodex` as `model-only`; test asserts it at `tests/ask-tool.test.ts:465`.
- `pi-packages/pi-antigravity-bridge/src/ask-tool.ts:452-456` (`AskAntigravity`, direct) and `src/web-tools.ts:271-301` (`agy_web_search`, `agy_read_url`), gated by config at `extensions/index.ts:631-634`.
- Product: specialist allowlists `src/harness/writers/pi-agent.ts:17-40` name `resolve-library-id`/`query-docs` for the librarian and never `tool_search`; installer `src/cli/pi-install.ts:67-68` installs `npm:@upstash/context7-pi`, `mergePiCodemodeSettings` (`:859-890`) adds only `+codemode`, and the global MCP merge (`:905-921`) writes only the grep entry. Tests: `src/harness/writers/pi-agent.test.ts:45-46,113`, `src/cli/pi-tool-config.test.ts:96-97`. Docs: `docs/installation.md:278`, `docs/skills-and-mcps.md:48`, `docs/agent/cli-installation.md:113`.
- Product prompts never name `bg_task_*`, `AskCodex` or `AskAntigravity`; `subagent_*`, `todo` and `ask_user_question` must stay direct (`src/harness/adapters/pi.ts:44-49`).
- Child sessions reported `tool_search` as unavailable; codemode still reaches deferred tools.
- `pnpm run build` regenerates tracked Pi specialist definitions (`pi/agents/thoth-*.md`) and their provenance file `pi/.thoth-agents-assets.json` via `src/harness/generate-integration-packages.ts:160-234`; the tracked librarian still names the native Context7 tools.
- Precedent: the canonical requirement "Install selected Pi interaction and web extensions" already removes a user-scope replaced package (juicesharp rpiv question) natively and blocks on a project-scope one with manual guidance. Existing complete installs carry `@upstash/context7-pi`.
- Plan review 1 (fresh Oracle): REJECT, recordSha256 94a38ddc53eeef110769844323c98c9f50900e068707666fc25168688adf20ec. Findings repaired in this revision: missing exact-title delta for the extension-install requirement and dropped safeguards; generated `pi/**` outputs had no owner; no existing-install transition policy.
- Plan review 2 (fresh Oracle): REJECT, recordSha256 a07905b5a8eb8f463460e8570918bd705b831853cd20e8dd217a0149d04a03a4. Finding: `pnpm run build` runs `build:pi-extensions` (`scripts/build-pi-extensions.mjs:40-70`), which recreates every extension `dist/` inside U1/U2 ownership. Repaired: U3 regenerates tracked Pi assets with `pnpm run integration:sync` and verifies with `pnpm run integration:verify`; the full build runs only in the post-join root step after U1-U3 are accepted.
- Plan review 3 (fresh Oracle): REJECT, recordSha256 865f30637bf9b6988dabf66bd4af1276fedf9710090de507497b7129b161eaeb. Finding: `integration:sync` runs the unscoped generator, which removes and recreates `plugin/`, `pi/`, `integrations/codex` and `integrations/claude-code`, beyond U3's write set. Repaired: no worker runs any generator or build; generation (`integration:sync`, `integration:verify`) and the full build both move to the serialized root join step, which exclusively owns every generator target.

## Intent

Lower the fixed per-turn tool-declaration cost of first-party Pi packages and the installed research stack without losing capability: occasional tools become `deferred`, oversized descriptions shrink, and Context7 moves from a native extension to a lazy pi-mcp-adapter MCP server.

## Non-goals

- No change to `subagent_*`, `todo`, `ask_user_question`, `codemode` or child coordination exposure.
- No change to pi-web-access (stays a native extension) or to thoth-mem (separate repository, separate change).
- No configurable exposure settings; no package version bumps.
- No change to OpenCode, Codex or Claude harness surfaces.

## Acceptance

- AC-1: pi-background-tasks registers `bg_task_spawn`, `bg_task_watch` and `bg_task_status` as direct and `bg_task_list`, `bg_task_log`, `bg_task_stop`, `bg_task_clear` as `deferred` in one background-tasks namespace whose instructions name them; direct descriptions of `bg_task_watch` and `bg_task_spawn` are reduced by at least 30% each with an enforced tighter budget test, keeping their behavioral contract.
- AC-2: `AskCodex`, `AskAntigravity`, `agy_web_search` and `agy_read_url` register as `deferred`, each package in its own namespace with description/instructions sufficient for discovery; tests assert the exposure.
- AC-3: The Pi installer adds `+tool_search` alongside `+codemode` (preserving explicit `-tool_search`), no longer installs or verifies `@upstash/context7-pi`, and writes a managed global MCP entry `context7` (`url` `https://mcp.context7.com/mcp`, `protocolVersion` `auto`, `lifecycle` `lazy`, header `CONTEXT7_API_KEY: ${CONTEXT7_API_KEY:-}`) next to grep while leaving unrelated servers untouched; status reports Context7 MCP evidence independently without inferring live provider success.
- AC-4: On Install or applied Update of an existing profile, a user-scope `@upstash/context7-pi` is removed natively before completion, a project-scope one blocks completion with explicit manual removal guidance, and dry-run reports the planned removal without mutation; tests cover all three.
- AC-5: Generated specialist allowlists replace `resolve-library-id`/`query-docs` with `mcp__context7`; the regenerated tracked `pi/agents/thoth-*.md` and `pi/.thoth-agents-assets.json` match `pnpm run integration:sync` output (and remain unchanged by the join-step `pnpm run build`) with other harness outputs unchanged; docs and tests reflect the new research stack.

## Clarifications

- Resolved (user): include U1, U2 and U3; keep pi-web-access as an extension; Context7 key via optional env header.
- Resolved (user): thoth-mem handled separately through an Orca worktree.

## Decisions

- `deferred` over `codemode` exposure for occasional tools: zero declaration cost, still reachable from codemode and `tool_search`.
- AskCodex moving from `model-only` to `deferred` makes it script-callable; accepted because it is an ordinary delegation tool, not a thoth delegation control.
- `bg_task_status` stays direct because the terminal callback instructs calling it first.
- Context7 key header uses `${CONTEXT7_API_KEY:-}` so a missing key degrades to the public rate limit.
- Existing-install transition follows the rpiv precedent: native user-scope removal, project-scope block with manual guidance (Oracle's alternative of preserving the package was rejected because it leaves the ~1.1k declaration cost the change targets).

## Durable deltas

- `MODIFIED cli-installation` **Provide a bounded hybrid research stack** — Complete Pi setup MUST install and verify pinned pi-web-access and pi-mcp-adapter. Web research MUST remain a native extension; the managed global grep entry MUST retain https://mcp.grep.app, legacy protocol, lazy lifecycle, and proxy-only tools, and the managed global context7 entry MUST use https://mcp.context7.com/mcp, auto protocol, lazy lifecycle, proxy-only tools and an optional `CONTEXT7_API_KEY` header read from the environment. Unrelated MCP configuration and operator credentials MUST remain untouched. Status MUST distinguish Context7, web access, and grep evidence independently, MUST NOT require EXA_API_KEY merely for web package availability, and MUST NOT infer live provider success from package or entry presence.
  - GIVEN a global MCP config with an unrelated server; WHEN complete Pi setup runs; THEN context7 and grep entries are written, the unrelated server is unchanged and no Context7 extension package is requested.
- `MODIFIED cli-installation` **Install selected Pi interaction and web extensions** — Complete Pi installation and applied Update MUST install and individually verify the selected Pi-native delegation, web-access and grep-adapter packages after first-party verification, using their configured minimum versions; the interactive question tool MUST come from the first-party `@thoth-agents/pi-questions-user` package, which MUST likewise be installed and individually verified at its configured minimum version after root-package verification. The juicesharp rpiv task-list, web-tools and question packages, `@feniix/pi-exa` and `@upstash/context7-pi` MUST NOT be required or installed by the selected inventory, and a user-scope installed juicesharp rpiv question package or `@upstash/context7-pi` MUST be removed natively before installation, while a project-scope one MUST block completion with explicit manual removal guidance instead of granting project trust. Dry-run MUST remain mutation-free; required dependency failure MUST prevent completion recording; external implementations MUST NOT be vendored.
  - GIVEN an existing complete install with user-scope `@upstash/context7-pi`; WHEN applied Update runs; THEN the package is removed natively, context7 is reachable as a managed MCP entry and dry-run only reports the planned removal.
- `MODIFIED pi-ecosystem` **Codemode delegation boundary** — Thoth delegation controls, the child `ask_orchestrator` and `notify_orchestrator` tools and `ask_user_question` are `model-only` direct calls that codemode scripts cannot invoke, and root guidance directs batching only of script-callable work. Occasional first-party tools (`bg_task_list`, `bg_task_log`, `bg_task_stop`, `bg_task_clear`, `AskCodex`, `AskAntigravity`, `agy_web_search`, `agy_read_url`) MUST register with `deferred` exposure in a package namespace, and the installer MUST enable `tool_search` next to `codemode` unless the operator explicitly disabled it.
  - GIVEN a Pi session with the first-party packages; WHEN tools are registered; THEN delegation and question tools are declared model-only and the occasional tools are absent from declarations but discoverable by `tool_search` and callable from codemode.

## Plan

Three disjoint worker units, run in parallel (no shared files; no worker runs any generator, `pnpm run build` or `build:pi-extensions`), then one serialized root join step:

1. U1 `pi-packages/pi-background-tasks/**`: set exposure/namespace per AC-1, move guidance needed by deferred tools into namespace instructions, trim watch/spawn descriptions, tighten `tool-budget.test.ts`.
2. U2 `pi-packages/pi-askcodex/**` and `pi-packages/pi-antigravity-bridge/**`: deferred exposure + namespaces; update model-only assertion and budget/publication tests.
3. U3 `src/cli/**`, `src/harness/writers/pi-agent*.ts`, `docs/**`: installer settings merge (`+tool_search`), Context7 inventory removal and native user-scope removal/project-scope block, managed MCP entry, status evidence, allowlists (source only), docs. U3 does not run generators or builds. `.thoth/specs` untouched (deltas sync at archive).

4. Join (root, after U1-U3 are terminal and accepted, inputs frozen; exclusive owner of all generator and build targets: `plugin/`, `pi/`, `integrations/codex`, `integrations/claude-code`, package `dist/`): `pnpm run integration:sync`, `pnpm run integration:verify`, `pnpm run build`; then confirm `git status` shows generated changes only in `pi/agents/thoth-librarian.md` (and any other agent whose allowlist changed) plus `pi/.thoth-agents-assets.json`, with non-Pi outputs unchanged; any unexpected drift returns to the owning unit.

Verification: each package's own tests and typecheck; root `pnpm run typecheck`, `pnpm run check:ci`, focused vitest for touched `src/` tests, `pnpm run integration:verify`, and the join-step build.

## Tasks

- [x] AC-1: Background tasks deferred exposure and trimmed descriptions
  - Outcome: four occasional bg tools deferred in a namespace, watch/spawn descriptions at least 30% shorter, tests updated
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/tools.ts, src/tool-budget.test.ts, src/tools.test.ts, src/tool-publication.test.ts; skills tdd, simplify
  - Inputs: Exploration evidence and Pi docs on Tool Exposure
  - Dependencies: none
  - Output: code and test diff in pi-background-tasks
  - Owner: thoth-worker
  - Writes: pi-packages/pi-background-tasks/**
  - Interface boundaries: tool names, parameters and results unchanged; work-panel provider untouched
  - Focused check and PASS evidence: package tests and typecheck pass; budget test shows reduced limits
  - Return milestone: tests green with before/after token estimates
  - Stop / reassessment: Pi API lacks `exposure`/`namespace` in the installed types, or callers outside the package depend on these declarations
- [x] AC-2: AskCodex and Antigravity tools deferred
  - Outcome: AskCodex, AskAntigravity, agy_web_search, agy_read_url register deferred with namespaces
  - Known entrypoints and skill paths: pi-packages/pi-askcodex/src/ask-tool.ts, tests/ask-tool.test.ts, tests/tool-budget.test.ts; pi-packages/pi-antigravity-bridge/src/ask-tool.ts, src/web-tools.ts, src/tool-publication.ts, extensions/index.ts, tests/*.test.ts; skill tdd
  - Inputs: Exploration evidence
  - Dependencies: none
  - Output: code and test diff in both packages
  - Owner: thoth-worker
  - Writes: pi-packages/pi-askcodex/**, pi-packages/pi-antigravity-bridge/**
  - Interface boundaries: tool parameters/results unchanged; config gates unchanged
  - Focused check and PASS evidence: both packages' tests and typecheck pass with exposure assertions
  - Return milestone: tests green
  - Stop / reassessment: deferred exposure breaks an existing runtime path (for example display-only registration)
- [x] AC-3: Installer enables tool_search and manages Context7 MCP
  - Outcome: settings merge adds +tool_search, Context7 package removed from inventory, managed context7 MCP entry, status evidence
  - Known entrypoints and skill paths: src/cli/pi-install.ts (:67-68, :859-921, :1229), related tests in src/cli; skill tdd
  - Inputs: Exploration evidence; AC-3 entry shape
  - Dependencies: none
  - Output: installer code and test diff
  - Owner: thoth-worker
  - Writes: src/cli/**
  - Interface boundaries: unrelated MCP servers and credentials untouched; dry-run stays mutation-free
  - Focused check and PASS evidence: focused vitest for touched src/cli tests, pnpm run typecheck
  - Return milestone: tests green
  - Stop / reassessment: status/verification contracts require a provider-live check
- [x] AC-4: Existing installs transition off the Context7 extension
  - Outcome: user-scope context7-pi removed natively, project-scope blocks with guidance, dry-run mutation-free
  - Known entrypoints and skill paths: src/cli/pi-install.ts (existing rpiv question package removal path), its tests; skill tdd
  - Inputs: rpiv removal precedent
  - Dependencies: none (same worker as AC-3)
  - Output: installer code and tests
  - Owner: thoth-worker
  - Writes: src/cli/**
  - Interface boundaries: project trust never granted; unrelated packages untouched
  - Focused check and PASS evidence: focused vitest covering user-scope, project-scope and dry-run cases
  - Return milestone: tests green
  - Stop / reassessment: rpiv removal path cannot be generalized without changing its contract
- [x] AC-5: Allowlists, generated Pi assets and docs reflect Context7 MCP
  - Outcome: librarian allowlist source uses mcp__context7; docs updated (tracked pi/agents and provenance are regenerated by the root join step)
  - Known entrypoints and skill paths: src/harness/writers/pi-agent.ts, src/harness/writers/pi-agent.test.ts, src/cli/pi-tool-config.test.ts, src/harness/generate-integration-packages.ts, pi/agents/thoth-librarian.md, pi/.thoth-agents-assets.json, docs/installation.md, docs/skills-and-mcps.md, docs/agent/cli-installation.md
  - Inputs: AC-3 decisions
  - Dependencies: none (same worker as AC-3)
  - Output: code, generated asset, test and doc diff
  - Owner: thoth-worker
  - Writes: src/harness/writers/pi-agent*.ts, src/cli/pi-tool-config*.ts, docs/**
  - Interface boundaries: other harness allowlists and generated outputs unchanged
  - Focused check and PASS evidence: focused vitest for pi-agent writer and pi-tool-config, pnpm run check:ci; no generator or build (root join regenerates and verifies)
  - Return milestone: tests and build green
  - Stop / reassessment: allowlist shape cannot express MCP namespace tools

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review 4 (fresh Oracle, task subtask_thoth-oracle_1794197851989_59d6e05b): OKAY, recordSha256 fa2ab1558574c1789c435e623f2a100a064fc33f7e54c4396c4f171aeb655820, recordDigest match. Reviews 1-3 REJECT, repaired in the same record.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 3a12e54871007b1949bcf8b00988f1a074b72fb7335090ff36795c6b4caa6b36

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-5 and the durable deltas are satisfied. All requested checks passed; the previous verification findings are repaired.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/pi-deferred-tool-exposure/pi-deferred-tool-exposure.md",
      "claim": "Verify gate passed. Exact-byte record-prefix SHA-256 and both canonical-source digests match. The 33-file working-tree input snapshot remained unchanged throughout validation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "implementation",
      "locator": "pi-packages/pi-background-tasks/src/tools.ts; src/tool-budget.test.ts; src/tool-publication.test.ts",
      "claim": "Spawn/watch/status remain direct; list/log/stop/clear are deferred in bg_tasks with discovery instructions. Description fields measure spawn 468→268 (-42.7%) and watch 829→543 (-34.5%). Serialized definitions use 10,187 characters against a 10,300 cap.",
      "basis": "observed",
      "uncertainty": "Measurements use the tests' frozen shell-detection fixture."
    },
    {
      "id": "E3",
      "kind": "implementation",
      "locator": "pi-packages/pi-askcodex/src/ask-tool.ts; pi-packages/pi-antigravity-bridge/src/{ask-tool,web-tools,tool-namespace}.ts",
      "claim": "All four accepted tools register deferred with package namespaces, discovery guidance and retained safety/quota disclosures. The untracked tool-namespace.ts was included in review.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "implementation",
      "locator": "src/cli/pi-install.ts; src/cli/operations/pi.ts",
      "claim": "Installer preserves explicit tool_search disables, removes Context7 from package inventory, merges the required lazy proxy-only MCP entry without overwriting conflicts, and reports independent provider evidence as unverified without live observations. Context7 migration includes configured and unmapped project-install detection before mutation.",
      "basis": "observed",
      "uncertainty": "Live provider availability was not exercised or inferred."
    },
    {
      "id": "E5",
      "kind": "diff-review",
      "locator": "git status/diff; src/harness/writers/pi-agent.ts; pi/; docs/",
      "claim": "Reviewed the full current diff. Librarian source/generated allowlists use mcp__context7. Generated drift is limited to the librarian definition and provenance; other harness outputs are unchanged. Documentation describes the new research stack.",
      "basis": "observed",
      "uncertainty": "Post-build stability is reported by the record's serialized join execution; build was not repeated."
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "Requested root verification commands",
      "claim": "Six focused files: 405 tests passed. integration:verify: 13 tests passed. Root typecheck and check:ci exited successfully. git diff --check passed.",
      "basis": "observed",
      "uncertainty": "check:ci emitted 764 warnings and six informational diagnostics, but no errors."
    },
    {
      "id": "E7",
      "kind": "execution",
      "locator": "Package test/typecheck scripts",
      "claim": "With maxWorkers=1: background tasks 805 passed/4 skipped; AskCodex 315 passed/4 skipped; Antigravity 1,245 passed/12 skipped. All three package typechecks passed.",
      "basis": "observed",
      "uncertainty": "Initial background suite exceeded 240 seconds; its owned processes were stopped. One bounded rerun passed in 282 seconds; no invocation remains."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Exposure, namespace and behavioral diff review; package suite and enforced per-description budgets.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E7"],
      "reason": "Required exposure split and both 30% reductions are enforced."
    },
    {
      "check": "AC-2",
      "method": "Registration/publication review and both package suites.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E7"],
      "reason": "Deferred exposure and discovery metadata are asserted."
    },
    {
      "check": "AC-3",
      "method": "Installer/status diff review and focused root tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Settings, inventory, managed entry, preservation and truthful status satisfy the contract."
    },
    {
      "check": "AC-4",
      "method": "Review configured-source and installed-manifest paths; rerun migration, preview, dry-run and apply-recheck regressions.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "User removal is native and verified; project conflicts block without granting trust, including unmapped installs."
    },
    {
      "check": "AC-5",
      "method": "Source/generated diff review, allowlist tests and integration:verify.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "Expected generated changes and research-stack documentation are present without other-harness drift."
    },
    {
      "check": "Durable deltas and freshness",
      "method": "Canonical baseline review, verify validator, record-prefix hashing and pre/post input snapshot comparison.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E4", "E5"],
      "reason": "Implementation matches declared changes and retained safeguards."
    },
    {
      "check": "Supplemental render-only byte comparison",
      "method": "Two inline read-only command attempts.",
      "outcome": "not-run",
      "evidenceIds": ["E5", "E6"],
      "reason": "Shell escaping prevented execution; no further retry. Existing tests and source/generated diff review supplied acceptance evidence."
    }
  ],
  "risks": [
    {
      "description": "No live-provider probe or new build was performed. Build/integration:sync were explicitly prohibited; recorded join evidence was reviewed instead.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4", "E5"]
    },
    {
      "description": "Supplemental exact render comparison was unavailable because of command quoting; required verification commands all passed.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E5", "E6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, record the PASS evidence and digest, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-deferred-tool-exposure/pi-deferred-tool-exposure.md",
    "reviewedRecordSha256": "3a12e54871007b1949bcf8b00988f1a074b72fb7335090ff36795c6b4caa6b36"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

Final verification 1 (fresh Oracle, task subtask_thoth-oracle_1794199049129_1c4c5787): FAIL, recordSha256 3a12e54871007b1949bcf8b00988f1a074b72fb7335090ff36795c6b4caa6b36. AC-1: description fields shrank only 20.3% (spawn) and 21.8% (watch); tests measured combined prose. AC-3: grep status reported runtime ready from package+entry presence. AC-2, AC-4, AC-5 PASS. Repairs routed to the U1 and U3 owners; join step and fresh verification to follow.
Repairs accepted: U1 description fields spawn 468→268 (42.7%), watch 829→543 (34.5%) with per-field assertions (805 package tests pass, maxWorkers=1); U3 grep/web/Context7 runtime status is `unverified` without observations (308 focused tests pass). Join rerun: integration:sync, integration:verify, build, typecheck and check:ci pass; generated drift still limited to `pi/agents/thoth-librarian.md` and `pi/.thoth-agents-assets.json`.

Final verification 2 (fresh Oracle, task subtask_thoth-oracle_1794200028473_a5f2ff9c): FAIL, recordSha256 3a12e54871007b1949bcf8b00988f1a074b72fb7335090ff36795c6b4caa6b36. AC-1, AC-2, AC-3, AC-5 PASS. AC-4: the project installed-manifest scanner (`src/cli/pi-install.ts:816-872`) ignores an unmapped project-installed `@upstash/context7-pi`. Repair routed to the U3 owner.
Repair accepted: project scanning now uses the shared replaced-package inventory including Context7; preview, dry-run and apply-time recheck regression tests (311 focused tests pass). Join rerun passed with the same limited generated drift.

Final verification 3 (fresh Oracle, task subtask_thoth-oracle_1794200770697_349b6a3d): PASS, thoth-gate-verdict valid, recordDigest match. Non-blocking risks: no live-provider probe; Windows full-suite timing flakes pass with maxWorkers=1.

Join step (root): `pnpm run integration:sync`, `pnpm run integration:verify` (13 passed), `pnpm run build` (exit 0); generated drift limited to `pi/agents/thoth-librarian.md` and `pi/.thoth-agents-assets.json`. `pnpm run typecheck` and `pnpm run check:ci` pass. Root mechanical edits: `biome format` on `pi-packages/pi-askcodex/tests/ask-tool.test.ts` (U2 formatting), and the stale `pi.mcp.adapter-backed` diagnostic text in `src/harness/adapters/pi.ts:155` now states grep.app and Context7 go through pi-mcp-adapter (`src/harness/adapters/pi.test.ts` 29 passed).

- AC-1: PASS | pi-background-tasks tests + per-field budget assertions | spawn 468→268 (-42.7%), watch 829→543 (-34.5%); 805 passed
- AC-2: PASS | askcodex and antigravity package tests | deferred exposure + namespaces asserted; 315 and 1245 passed
- AC-3: PASS | focused src/cli vitest | tool_search merge, context7 MCP entry, unverified-without-observation status; 405 passed
- AC-4: PASS | focused src/cli vitest | user-scope native removal, configured and unmapped project block, dry-run mutation-free
- AC-5: PASS | integration:verify + join build | librarian uses mcp__context7; drift limited to pi/agents/thoth-librarian.md and pi/.thoth-agents-assets.json
- Source: .thoth/specs/cli-installation/spec.md | sha256:9ef061b0cf415145c0d6265ee0ab68fbd6797068039dad349641179a5d0c51df
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:d205dd53e06119ebd98ee2b811425bdfe279db2df43a68c334ad3faec7ad51d4

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
