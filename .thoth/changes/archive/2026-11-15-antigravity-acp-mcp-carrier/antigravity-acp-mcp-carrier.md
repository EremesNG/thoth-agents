# Change: antigravity-acp-mcp-carrier

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Live smoke 2026-11-15 (agy 1.5.9, subagents explorer/worker on hydrogen/argon): on the ACP engine, sessions saw only the bridge MCP server and `codegraph`, while stream-json sessions saw every server of `~/.gemini/config/mcp_config.json`; ACP sessions also exposed agy's native delegation/interaction tools (`invoke_subagent`, `define_subagent`, `manage_subagents`, `swarm`, `run_workflow`, `schedule`, `send_message`, `ask_question`) that the stream-json carrier suppresses.
- Gap 1 (`pi-packages/pi-antigravity-bridge/`): `extensions/index.ts:382–395` returns only the bridge HTTP entry from the ACP driver's `mcpServers()`; `src/acp/connection.ts:22–27` types `AcpMcpServer` as `http | sse` only; `session/new` and `session/load` pass `mcpServers: this.#mcpServers()` (`connection.ts:263,283`). `src/acp/home.ts:51–79` (`stageAgyHome`) copies non-Pi-bridge entries (`isPiBridgeName`) of the global `mcp_config.json` into the staged home, but `agy acp` does not load that file into an ACP session when `mcpServers` is supplied. User entries are stdio `{ command, args, env? }` (env is an object; ACP stdio expects `env` as `[{ name, value }]`).
- Gap 3: `agy acp` advertises only `model`, `thought_level`, `mode` config options, but `agy acp --help` supports `--agent <name>`; a non-inference handshake `agy acp --gemini-dir <tmpHome> --agent probe-carrier` with a staged `config/agents/<name>/agent.md` returned initialize + `session/new` OK. `AcpConnection.start()` currently spawns `["acp", "--gemini-dir", home]` (`connection.ts:173–175`). Carrier frontmatter (`src/sysprompt-agent.ts:46–67`: `mainAgent: true`, `subagent: false`, `agents: []`, `tools:` allowlist) is what suppresses native delegation on stream-json. ACP already delivers the Pi system prompt inline, so the ACP carrier body need not carry it; a neutral short body avoids the agy content-429 seen with Pi-owned text in carriers.
- `--agent` is a process-level flag: changing it requires respawning the ACP connection. A user-configured agent (`/agy agent <name>`) already exists and must keep precedence.
- Tests: `tests/acp-driver.test.ts:161–175` (mcpServers arrays on load/new), `tests/acp-connection.test.ts`, `tests/agy-home.test.ts`, `tests/extension-lifecycle.test.ts`, `tests/isolated-home-lifecycle.test.ts`, `tests/native-acp.test.ts`, `tests/sysprompt-agent.test.ts`.
- Spec `.thoth/specs/pi-ecosystem/spec.md` "Antigravity bridge uses the native agy CLI" requires an isolated home that preserves unrelated MCP servers and exposes only this instance's bridge entry.
- User pruned `~/.gemini/config/mcp_config.json` to `codegraph` (backup `mcp_config.json.bak-2026-11-15`); not part of this change.

## Intent

Make ACP Antigravity sessions behave like stream-json for tool surface: forward the user's agy MCP servers (except other Pi bridge instances) into the ACP session, and suppress agy's native delegation/interaction tools by launching `agy acp` with a minimal bridge carrier agent.

## Non-goals

- Read-only enforcement per subagent role.
- Changing stream-json behavior or the stream-json carrier projection.
- Changing pricing, model catalog or default engine.
- Version bumps or commits.

## Acceptance

- AC-1: `AcpMcpServer` supports stdio entries `{ name, command, args, env: [{ name, value }] }` alongside http/sse; the ACP driver's `mcpServers()` returns this instance's bridge entry plus every enabled entry of the staged (isolated) `mcp_config.json` that is not a Pi bridge entry (`isPiBridgeName`), converting env objects to name/value arrays and http entries to the http shape; disabled entries and malformed entries are skipped (malformed with a debug log), never crashing the session. Applies to `session/new` and `session/load`, in both bridge discovery modes (private and legacy-global) whenever an ACP home was staged. When `AGY_AGENTS_ROOT` bypasses home staging, ACP keeps its current forwarding (bridge entry only) and launches without the carrier. A failure to stage the ACP home stays a hard turn failure, as today.
- AC-2: When an ACP home is staged, the minimal carrier (frontmatter as the stream-json carrier: `mainAgent: true`, `model: inherit`, `subagent: false`, `agents: []`, same `tools:` allowlist; short neutral body, no Pi system prompt) is written inside that staged home's own `config/agents/<name>/agent.md` before `agy acp` starts, and `agy acp` is spawned with `--agent <name>`, so native delegation/interaction tools are not offered. The carrier is constant for the connection's lifetime (no agent drift, no respawn logic). `/agy agent` keeps refusing ACP as today (user agents remain stream-json only). Carrier write failure is soft: launch without `--agent` and log a warning; the turn proceeds. Tests cover the carrier being visible from the effective launched home whether the agents directory was absent or linked.
- AC-3: Carrier presence does not change ACP prompt delivery (system prompt still inline), connection reuse, or home disposal (the carrier is disposed with its home).
- AC-4: Live check on agy 1.5.9, using the fresh package build produced by the AC-3 row: an ACP session lists user MCP servers from the staged config and does not offer `invoke_subagent`/`swarm`/`ask_question`; one trivial `session/prompt` answers without 429 (≤4 inferences).
- AC-5: README/docs (ACP engine/tool surface) and CHANGELOG Unreleased updated; spec gains the ADDED requirement below.
- AC-6: Gates: package typecheck, `vitest run --maxWorkers=2`, package build; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build:pi-extensions`.

## Clarifications

- 2026-11-15: after the engine comparison the user selected gap 1 (forward agy MCP servers on ACP) and gap 3 (hide native delegation tools on ACP); read-only enforcement (gap 2) not selected.

## Decisions

- D1: Forward from the staged isolated config (same isolation rule as `stageAgyHome`), not the raw global file.
- D2: ACP carrier body is neutral and short; the Pi system prompt stays inline in the ACP prompt (avoids duplicate instructions and the carrier content-429).
- D4: AGY_AGENTS_ROOT bypass keeps current ACP behavior (no forwarding of extra servers, no carrier); user-configured agents stay unsupported on ACP.
- D3: Reuse `syspromptAgentMd`'s frontmatter contract (shared helper) so both engines expose the same native tool allowlist.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity ACP sessions mirror the stream-json tool surface** — `@thoth-agents/pi-antigravity-bridge` MUST pass to every ACP `session/new` and `session/load` this instance's bridge MCP server plus every enabled, non-Pi-bridge MCP server of the isolated agy configuration (stdio and http), whenever it staged an ACP home, and in that case MUST launch `agy acp` with a minimal bridge carrier agent written inside that home whose frontmatter disables agy's native subagent and delegation tools, falling back to launching without the carrier (with a warning) only when the carrier cannot be written; the Pi system prompt remains delivered inline, and when `AGY_AGENTS_ROOT` bypasses home staging the previous ACP behavior is kept.
  - GIVEN an isolated agy configuration with a stdio server `codegraph` and another Pi bridge entry; WHEN an ACP session is created or loaded; THEN `mcpServers` contains this bridge entry and `codegraph` (with env as name/value pairs) but not the other bridge entry, and `agy acp` was started with `--agent` naming the minimal carrier staged inside that home.

## Plan

One writer (thoth-worker) in `pi-packages/pi-antigravity-bridge`, test-first (skill `tdd`): (1) stdio/http `AcpMcpServer` and conversion from the staged config into `mcpServers()`; (2) minimal ACP carrier written inside the staged home and `--agent` in `AcpConnection.start()` with soft fallback; (3) tests and package build; (4) bounded live check on that build; (5) docs/CHANGELOG via a standalone `agy acp` JSON-RPC session (≤4 inferences). Root runs gates; fresh Oracle verifies.

## Tasks

- [x] AC-1: Forward isolated agy MCP servers into ACP sessions
  - Outcome: per AC-1, D1
  - Known entrypoints and skill paths: `extensions/index.ts:382–395`, `src/acp/connection.ts:22–27,263,283`, `src/acp/home.ts:51–79`, `src/mcp-registration.ts` (`readGlobalMcpConfig`); skill `tdd`
  - Inputs: Exploration
  - Dependencies: none
  - Output: code, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{extensions,src,tests}/**`
  - Interface boundaries: stream-json staging, isolation rule, legacy-global mode
  - Focused check and PASS evidence: new tests red→green for stdio/http/env/disabled/bridge-excluded/malformed on new and load
  - Return milestone: final report
  - Stop / reassessment: agy acp rejects stdio entries
- [x] AC-2: Minimal ACP carrier via --agent
  - Outcome: per AC-2, D2, D3
  - Known entrypoints and skill paths: `src/acp/connection.ts:173–175`, `src/sysprompt-agent.ts:46–67`, `extensions/index.ts` (agent config, stageEngineHome); skill `tdd`
  - Inputs: AC-1 row
  - Dependencies: AC-1 row
  - Output: code, tests
  - Owner: thoth-worker
  - Writes: same package
  - Interface boundaries: user `/agy agent`, stream-json carrier
  - Focused check and PASS evidence: tests for `--agent` argv, carrier inside the launched home (agents dir absent vs linked), soft write-failure fallback, AGY_AGENTS_ROOT bypass unchanged, `/agy agent` still refused on ACP
  - Return milestone: final report
  - Stop / reassessment: carrier makes agy acp fail to start
- [x] AC-3: Prompt delivery, reuse and disposal unchanged; fresh build
  - Outcome: per AC-3; produces the fresh package build consumed by AC-4
  - Known entrypoints and skill paths: `src/acp/driver.ts`, `src/acp/home.ts`, existing ACP suites
  - Inputs: AC-2 row
  - Dependencies: AC-2 row
  - Output: passing suites and `pnpm --filter @thoth-agents/pi-antigravity-bridge run build` output
  - Owner: thoth-worker
  - Writes: tests; build artifacts
  - Interface boundaries: none
  - Focused check and PASS evidence: package vitest passes; package build exit 0
  - Return milestone: final report
  - Stop / reassessment: none
- [x] AC-4: Live check
  - Outcome: per AC-4
  - Known entrypoints and skill paths: built bundle, `agy acp`
  - Inputs: AC-3 row fresh build
  - Dependencies: AC-3 row
  - Output: probe evidence
  - Owner: thoth-worker
  - Writes: none in repo
  - Interface boundaries: ≤4 inferences, scratch outside repo
  - Focused check and PASS evidence: tool listing shows MCP servers and no native delegation tools; prompt answers without 429
  - Return milestone: final report
  - Stop / reassessment: carrier triggers 429
- [x] AC-5: Docs, changelog, spec delta
  - Outcome: per AC-5
  - Known entrypoints and skill paths: package README, CHANGELOG
  - Inputs: implementation
  - Dependencies: AC-3 row
  - Output: docs diff
  - Owner: thoth-worker (docs), root (spec via archive)
  - Writes: package README/CHANGELOG
  - Interface boundaries: none
  - Focused check and PASS evidence: docs describe ACP MCP forwarding and carrier
  - Return milestone: final report
  - Stop / reassessment: none
- [x] AC-6: Gates
  - Outcome: per AC-6
  - Known entrypoints and skill paths: package and root scripts
  - Inputs: all rows
  - Dependencies: AC-5 row
  - Output: command results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: all exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failure (report)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
First Oracle review REJECTED (discovery/fallback contracts, agent respawn ownership, stale bundle for live check); repaired; fresh Oracle subtask_thoth-oracle_1794784073151_80038d21 OKAY, recordSha256 57c7d3036a0f03073ef90b98f1cc4df1bb61031fa56bc4054b6529756ee5376c (digest match).
**Implementation**: AUTHORIZED
User selected Implement on 2026-11-15 after plan OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: ff89c4fe5f5b9eacbabfe1fe8adc3aaaa185fd9316341f1a0c9ed06ff4c87e4f
Prior final verification subtask_thoth-oracle_1794785342619_1c628082 FAILed (AC-4 probe imported source; tasks unchecked); repaired by dist-based live smoke and task reconciliation.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. Both prior blockers are repaired; focused inspection and fresh checks found no acceptance violations.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-validation",
      "locator": ".thoth/changes/antigravity-acp-mcp-carrier/antigravity-acp-mcp-carrier.md",
      "claim": "All six tasks checked; validate.mjs --through verify returned valid:true. Record-prefix and canonical spec hashes independently confirmed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "build-provenance",
      "locator": "C:/Users/EremesNG/AppData/Local/Temp/acp-carrier-live/probe-dist.mts:10-16; pi-packages/pi-antigravity-bridge/dist/index.ts",
      "claim": "Probe imports dist/index.ts, not source. Bundle embeds the ACP forwarding/carrier/launch path without source imports. Current SHA-256 matches evidence: 55605810fca0185391cc2d55d9c43b9cb8e0c42a18e485c819933d8446bed614; mtime lies within recorded build window.",
      "basis": "observed",
      "uncertainty": "Build execution was reported, not rerun."
    },
    {
      "id": "E3",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-antigravity-bridge/{src/acp,src/sysprompt-agent.ts,extensions/index.ts,tests}",
      "claim": "Focused inspection confirms forwarding, isolated carrier, fallback, bypass and lifecycle contracts. Fresh eight-suite run passed 153 tests with required environment variables unset; package typecheck exited 0. Eleven source/test/bundle hashes remained unchanged during review.",
      "basis": "observed",
      "uncertainty": "No prior-review source snapshot was supplied; current implementation was independently inspected."
    },
    {
      "id": "E4",
      "kind": "live-artifact",
      "locator": "C:/Users/EremesNG/AppData/Local/Temp/acp-carrier-live/evidence-dist.json",
      "claim": "Recorded one answered prompt, codegraph plus owning bridge, all eight forbidden names absent, no errors/429, and disposed home. Artifact assertions independently recomputed; agy --version independently returned 1.5.9.",
      "basis": "observed",
      "uncertainty": "Tool listing is model-reported, not protocol enumeration. No inference replayed."
    },
    {
      "id": "E5",
      "kind": "documentation",
      "locator": "pi-packages/pi-antigravity-bridge/README.md:65; CHANGELOG.md:10; docs/ENGINES.md:33-35; record Durable deltas",
      "claim": "Docs and Unreleased changelog describe the accepted behavior; ADDED delta is consistent with implementation and existing canonical requirements.",
      "basis": "observed",
      "uncertainty": "Canonical delta application remains archive work."
    }
  ],
  "verification": [
    {
      "check": "AC-1–AC-3, D1–D4",
      "method": "Focused source inspection, fresh tests/typecheck and frozen-input checks",
      "outcome": "pass",
      "evidenceIds": ["E3"],
      "reason": "Forwarding, carrier isolation/fallback, prompt/lifecycle preservation and bypass behavior covered."
    },
    {
      "check": "AC-4",
      "method": "Trace built imports and inspect/recompute live evidence",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Fresh-built code path established; recorded smoke satisfies bounded live acceptance."
    },
    {
      "check": "AC-5 and record readiness",
      "method": "Review documentation/delta and rerun verify validator",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5"],
      "reason": "Task completion repaired; baseline and documentation consistent."
    },
    {
      "check": "AC-6 remaining gates",
      "method": "Reuse supplied same-session root/full-package results",
      "outcome": "not-run",
      "evidenceIds": ["E2", "E3"],
      "reason": "Root reports build:pi-extensions, typecheck, check:ci and package build exit 0; package suite 1350 passed/5 skipped. Those checks were not repeated."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "root / gate validation and closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/antigravity-acp-mcp-carrier/antigravity-acp-mcp-carrier.md",
    "reviewedRecordSha256": "ff89c4fe5f5b9eacbabfe1fe8adc3aaaa185fd9316341f1a0c9ed06ff4c87e4f"
  }
}
```

- AC-1: PASS | staged-config stdio/http forwarding on new/load, bridge entries excluded, disabled/malformed skipped; focused suites passed | Oracle E3
- AC-2: PASS | carrier inside staged home, linked agents junction replaced locally, --agent argv, soft fallback; acp-carrier tests | Oracle E3
- AC-3: PASS | inline prompt, reuse, disposal, AGY_AGENTS_ROOT bypass, /agy agent ACP refusal preserved; extension-lifecycle tests | Oracle E3
- AC-4: PASS | dist/index.ts live smoke agy 1.5.9, 1 inference, codegraph+bridge visible, 8 delegation names absent, no 429 | Oracle E2/E4
- AC-5: PASS | README, docs/ENGINES.md, CHANGELOG Unreleased, ADDED delta consistent | Oracle E5
- AC-6: PASS | root build:pi-extensions, typecheck, check:ci exit 0; package vitest 1350 passed/5 skipped; package typecheck exit 0 | Oracle E3, root gates
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:801c75dd67f6e49ccc92456a1b65477f4572d6eb5824866e794f0565b2ea7d0e

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
