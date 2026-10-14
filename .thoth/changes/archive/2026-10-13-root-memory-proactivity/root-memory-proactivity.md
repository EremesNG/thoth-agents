# Change: root-memory-proactivity

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- Observed failure (Pi session, 2026-10-13): root started non-trivial release discovery without recalling memory, and dispatched an Explorer with `MEMORY: recall` but no verified project identity; the child reported recall unavailable.
- thoth-mem (`C:\DEV\Proyectos\Webstorm\thoth-mem`) ships the same proactive cadence on MCP server instructions (`src/tools/index.ts:29–37`) and, in Pi, on `mem_recall.promptGuidelines` (`src/integration/pi/index.ts:96–107`): recall with task key terms at the start of non-trivial work before exploring, unprompted; save verified knowledge immediately; close recovered handoffs. Pi has no native child-identity contract (`integrations/pi/skills/thoth-mem/references/pi.md:17–21`); project keys must be copied verbatim from verified native identity (`src/tools/index.ts:62`), and prompt-carried identity never grants root authority.
- thoth-agents shared root memory text (`src/agents/prompt-sections.ts:240–244`) triggers only on "Resume/prior work", with no start-of-work recall.
- Root ownership rules (`src/harness/core/agent-pack.ts:281–282`) require dispatch "before the first read/search/shell call of a turn" with no exception for provider memory, competing with recall-before-exploration.
- Dispatch envelope (`src/harness/core/agent-pack.ts:344`) requires MEMORY authorization but not identity; child memory text (`src/agents/prompt-sections.ts:440–446`) does not say to use dispatch-supplied identity verbatim. `agent-delegation` spec already requires project and root session identity or `unavailable` in the envelope; rendered prompts do not implement it. `renderMemoryGovernanceInstructions` (`src/harness/core/memory-governance.ts`) is not wired into role rendering.
- Constraints: provider boundary test (`src/harness/provider-boundary.test.ts:106–109`) forbids provider operation call syntax and lifecycle protocol phrasing in shipped assets; naming thoth-mem and its skill is allowed. Root prompt caps (`src/agents/prompt-rendering.test.ts:855–869`): OpenCode 12,500, Codex 13,800, Claude Code 13,300, Pi 15,600. Canonical prompt hashes pinned from `:874`. Generated `pi/` and `plugin/` assets must be regenerated.

## Intent

The root orchestrator on every harness proactively uses the installed memory provider: it recalls prior project memory with task key terms before exploring, planning, or dispatching non-trivial work; saves verified durable knowledge as soon as it is verified; and passes the verified identity it holds to children granted memory authorization, so delegated recall works.

## Non-goals

- No changes to thoth-mem (its Pi skill wording "Use only the six MCP tools" is reported separately).
- No provider call syntax, lifecycle protocol, or operation sequencing in thoth-agents prompts.
- No change to child lifecycle ownership; children never receive root lifecycle authority.
- No wiring of `renderMemoryGovernanceInstructions` into rendering; no prompt-cap increases unless unavoidable (then return for reassessment).

## Acceptance

- AC-1: Every harness root prompt instructs recall of prior project memory with task key terms before exploring, planning, or dispatching non-trivial work, unprompted, and skipping trivial or conversational turns; the resume-only trigger is gone.
- AC-2: Every harness root prompt states that memory recall is not source discovery and is not blocked by the delegate-before-first-read/search/shell rule.
- AC-3: Every harness root prompt instructs saving durable knowledge as soon as it is verified, unprompted: decisions, discoveries and findings, bugs with their root cause and fix, what worked and what failed, and non-obvious conventions, including those learned from accepted specialist results; it also instructs closing a recovered handoff when its pending action is done, deferring protocol to the installed skill.
- AC-4: The root dispatch envelope requires, with `recall`/`observe` authorization, the verified project identity and root session identity (or `unavailable`) copied verbatim; child prompts use only dispatch-supplied identity verbatim, never derive it, and report memory unavailable when it is missing.
- AC-5: Generated `pi/` and `plugin/` assets are regenerated; tests pin AC-1..AC-4 wording; root prompt caps, provider-boundary tests, `pnpm run check:ci`, and `pnpm run typecheck` pass; `docs/agent/memory-governance.md` reflects the behavior.

## Clarifications

- None needed: the user asked to align thoth-agents for orchestrator proactivity with thoth-mem; the identity envelope is already required by the `agent-delegation` spec.

## Decisions

- Proactive recall is placed in the shared root memory section and an explicit memory exception is added to the root ownership rule, so all four harnesses inherit it.
- Children receive identity for attribution and reads only; lifecycle stays root-owned, matching thoth-mem's statement that prompt-carried identity grants no root authority.
- Wording stays provider-neutral in mechanics (no operation names with call syntax) while naming the installed thoth-mem skill, as the boundary test allows.
- Saving is encouraged broadly (user request 2026-10-13): decisions, discoveries, findings, bugs with root cause and fix, what worked, what failed, conventions; root saves lessons from accepted specialist results because children's findings reach memory only through root unless `observe` was granted.
- Net prompt growth is minimized by rewriting the existing memory bullets rather than appending.

## Durable deltas

- `MODIFIED memory-orchestration` **Root memory routing** — The adaptive root MUST recall prior project memory with task key terms before exploring, planning, or dispatching non-trivial work, unprompted, MUST save durable knowledge as soon as it is verified, unprompted, including decisions, discoveries and findings, bugs with root cause and fix, what worked and what failed, and lessons from accepted specialist results, and MUST route recall, durable lessons, verified compaction, and meaningful semantic completion through the installed thoth-mem skill while retaining root-only lifecycle and real-user-intent ownership.
  - GIVEN a non-trivial user task; WHEN the root starts work; THEN it recalls prior project memory before exploration, planning, or dispatch, and skips memory only for trivial or conversational turns .
- `MODIFIED agent-delegation` **Root coordinates and specialists execute by default** — Shipped root instructions on every harness MUST present specialist execution of discovery for unlocated source, external research and substantive implementation as the default, MUST present root direct work only as bounded exceptions, MUST state that project navigation rules govern the assigned investigator rather than making root the investigator, and MUST state that provider memory recall is not source discovery and may precede dispatch.
  - GIVEN a root prompt rendered for any supported harness; WHEN the task needs discovery of unlocated local source; THEN the prompt directs root to dispatch Explorer without preliminary reads, search, shell inspection or CodeGraph queries, while still permitting memory recall before dispatch .

## Plan

Single cohesive prompt-contract change owned by one worker:

1. `src/agents/prompt-sections.ts` root memory block (~240–244): replace the resume trigger with start-of-work recall (task key terms, before exploring/planning/dispatch, unprompted, skip trivial turns), immediate unprompted saves of verified knowledge (decisions, discoveries/findings, bugs with root cause and fix, what worked/failed, conventions, lessons from accepted specialist results), recovered-handoff closure, protocol deferred to installed `thoth-mem` skill; keep root ownership of identity/lifecycle and `.thoth/` canonicality.
2. `src/harness/core/agent-pack.ts` (~281–282): add that memory recall is not source discovery and precedes dispatch; (~344): MEMORY authorization carries verified project and root session identity or `unavailable`, verbatim.
3. `src/agents/prompt-sections.ts` children memory block (~440–446): use dispatch-supplied identity verbatim, never derive; missing identity means report memory unavailable.
4. Update `.thoth/specs` only at archive via deltas; update `docs/agent/memory-governance.md`.
5. Regenerate `pi/` and `plugin/` via the existing build/generator; update pinned tests and hashes in `src/agents/prompt-rendering.test.ts` and related pins.

Focused checks: `pnpm vitest run src/agents src/harness`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` (regenerates assets; generated-drift test passes). Risk: root caps (OpenCode 12,500 tightest); if exceeded after compact wording, stop and return sizes.

## Tasks

- [x] AC-1: Implement proactive root memory, recall exception, identity envelope, and child identity rules with regenerated assets and pinned tests
  - Outcome: shared prompt sources, generated assets, tests, and docs implement AC-1..AC-5
  - Known entrypoints and skill paths: `src/agents/prompt-sections.ts`, `src/harness/core/agent-pack.ts`, `src/agents/prompt-rendering.test.ts`, `src/harness/provider-boundary.test.ts`, `src/harness/generate-integration-packages.ts`, `docs/agent/memory-governance.md`, `pi/`, `plugin/`
  - Inputs: Exploration and Decisions in this record
  - Dependencies: none
  - Output: diff plus check results and per-harness root prompt sizes
  - Owner: thoth-worker
  - Writes: the files above, generated `pi/**` and `plugin/**`, related test files under `src/`
  - Interface boundaries: provider-boundary rules; root caps; canonical prompt hashes; no thoth-mem repo edits
  - Focused check and PASS evidence: `pnpm vitest run src/agents src/harness`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` all exit 0
  - Return milestone: all checks pass, or a cap/boundary conflict is found
  - Stop / reassessment: any cap exceeded after compact wording, or boundary test rejecting required wording
- [x] AC-2: Covered by the AC-1 task (ownership exception wording and pin)
  - Outcome: recall exception present in all rendered roots and pinned by a test
  - Known entrypoints and skill paths: `src/harness/core/agent-pack.ts`, `src/agents/prompt-rendering.test.ts`
  - Inputs: AC-1 task diff
  - Dependencies: AC-1 task
  - Output: assertion in tests
  - Owner: thoth-worker
  - Writes: same as AC-1 task
  - Interface boundaries: agent-delegation ownership rule
  - Focused check and PASS evidence: prompt-rendering tests pass
  - Return milestone: with AC-1 task
  - Stop / reassessment: same as AC-1 task
- [x] AC-3: Covered by the AC-1 task (save and handoff wording and pin)
  - Outcome: save/handoff guidance present and pinned
  - Known entrypoints and skill paths: `src/agents/prompt-sections.ts`, `src/agents/prompt-rendering.test.ts`
  - Inputs: AC-1 task diff
  - Dependencies: AC-1 task
  - Output: assertion in tests
  - Owner: thoth-worker
  - Writes: same as AC-1 task
  - Interface boundaries: provider boundary
  - Focused check and PASS evidence: prompt-rendering and provider-boundary tests pass
  - Return milestone: with AC-1 task
  - Stop / reassessment: same as AC-1 task
- [x] AC-4: Covered by the AC-1 task (envelope identity and child rules and pin)
  - Outcome: envelope identity and child verbatim-identity rules present and pinned
  - Known entrypoints and skill paths: `src/harness/core/agent-pack.ts`, `src/agents/prompt-sections.ts`, `src/agents/prompt-rendering.test.ts`
  - Inputs: AC-1 task diff
  - Dependencies: AC-1 task
  - Output: assertions in tests
  - Owner: thoth-worker
  - Writes: same as AC-1 task
  - Interface boundaries: agent-delegation memory authorization spec
  - Focused check and PASS evidence: prompt-rendering tests pass
  - Return milestone: with AC-1 task
  - Stop / reassessment: same as AC-1 task
- [x] AC-5: Regenerate assets, update docs and pins, and pass local checks
  - Outcome: `pi/` and `plugin/` regenerated, `docs/agent/memory-governance.md` updated, pins/hashes current, caps met, local checks green apart from pre-existing failures
  - Known entrypoints and skill paths: `src/harness/generate-integration-packages.ts`, `docs/agent/memory-governance.md`, `src/agents/prompt-rendering.test.ts`
  - Inputs: AC-1 task diff
  - Dependencies: AC-1 task
  - Output: regenerated assets, docs, check results, rendered sizes
  - Owner: thoth-worker
  - Writes: `pi/**`, `plugin/**`, docs, tests
  - Interface boundaries: generated-drift test; root/child caps; provider boundary
  - Focused check and PASS evidence: `pnpm run build`, `pnpm run check:ci`, `pnpm run typecheck` exit 0; owned-surface suites (provider boundary, generated drift, prompt rendering) pass; `pnpm vitest run src/agents src/harness` has only 3 failures not caused by this diff (see Verification)
  - Return milestone: worker terminal result
  - Stop / reassessment: any cap or boundary conflict

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Fresh Oracle plan review OKAY (validated, exit 0). Non-blocking risks: Pi root budget only 48 chars spare (15,551/15,600), so compact rather than append; avoid close/recover wording near thoth-mem/provider/session on one line (boundary regex); fix docs/agent/memory-governance.md renderer attribution.
**Implementation**: AUTHORIZED
User selected Implement after plan-review OKAY (2026-10-13).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 8afee1053efa9e80bbd81043e1e4c614e44a7567c88bde46e97afaea266e7cae

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1..AC-5 are satisfied and compaction preserves the reviewed contracts. Required-suite failures reproduce without the diff; release-test stability claims were not confirmed.",
  "evidence": [
    {
      "id": "record",
      "kind": "record-binding",
      "locator": ".thoth/changes/root-memory-proactivity/root-memory-proactivity.md",
      "claim": "Independent exact-byte hashing before ## Authorization matches 8afee1053efa9e80bbd81043e1e4c614e44a7567c88bde46e97afaea266e7cae. The installed verify validator exits 0 with current specification baselines.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "prompts",
      "kind": "rendered-contract-review",
      "locator": "src/agents/prompt-sections.ts; src/harness/core/agent-pack.ts; four harness root renderers",
      "claim": "All rendered roots contain proactive keyed recall, trivial-turn exclusion, immediate verified saves covering the required categories, recovered-handoff outcomes, installed-skill deferral, recall's discovery exemption, and verbatim verified dispatch identity. Child contracts retain dispatch-only identity and root-owned lifecycle.",
      "basis": "observed",
      "uncertainty": "Instruction contracts were verified, not live provider execution."
    },
    {
      "id": "compaction",
      "kind": "before-after-diff-review",
      "locator": "git diff -- src/harness/core/agent-pack.ts src/agents/prompt-sections.ts",
      "claim": "Compaction retains Explorer-before-discovery, investigator navigation, bounded direct-work exceptions and consultation, delegation on new paths, explicit user direction, model/effort including max, no self-approval or dumps or repeated discovery, mandatory verification, delegation-failure limits, and instruction-only enforcement. Child memory permissions, provider deferral, canonical artifacts and failure reporting remain.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "assets",
      "kind": "artifact-verification",
      "locator": "src/harness/generate-integration-packages.test.ts; pi/; plugin/; docs/agent/memory-governance.md",
      "claim": "Shared-plugin generated-drift tests pass. All five current Pi artifacts match adapter output, identity guidance and provenance hashes. Documentation accurately attributes production rendering and the new memory behavior.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "suite",
      "kind": "execution",
      "locator": "pnpm vitest run src/agents src/harness",
      "claim": "Exit 1: 34 files passed, 2 failed; 673 tests passed, 2 failed, 5 skipped. Only the named Pi progress-pin tests failed. Prompt rendering, caps, provider boundary, generated drift and release workflow passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "baseline",
      "kind": "baseline-comparison",
      "locator": "clean HEAD c3fd94fabcc0526e85af917714c0ec7e5aef3b81",
      "claim": "Both Pi progress-pin failures reproduce on clean HEAD with the same missing expected strings. Both tracked-only stashes were fully restored: all 23 modified files byte-identical, index/status unchanged, untracked record intact, owned stashes removed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "release",
      "kind": "execution-and-baseline-comparison",
      "locator": "src/harness/release-workflow.test.ts:96",
      "claim": "Standalone release suite produced 5 Windows EPERM fixture-cleanup failures, including the hung-npm test. That test reproduces the same EPERM on clean HEAD. Release-test and workflow inputs are unchanged; the initial requested area run passed them.",
      "basis": "observed",
      "uncertainty": "The original load-timing failure and stable 10/10 standalone result were not reproduced."
    },
    {
      "id": "checks",
      "kind": "execution",
      "locator": "pnpm run check:ci; pnpm run typecheck; git diff --check; rendered root lengths",
      "claim": "All three checks exit 0. Existing Biome warnings are non-fatal. Unchanged root caps are met: OpenCode 12262/12500, Codex 13548/13800, Claude Code 13015/13300, Pi 15552/15600.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding and verify gate",
      "method": "Independent byte-prefix SHA-256 and installed validator",
      "outcome": "pass",
      "evidenceIds": ["record"],
      "reason": "Assigned digest matches and structural validation succeeds."
    },
    {
      "check": "AC-1 and AC-3",
      "method": "Actual diff, four rendered roots and prompt tests",
      "outcome": "pass",
      "evidenceIds": ["prompts", "suite"],
      "reason": "Proactive recall, comprehensive verified saves and recovered-handoff outcomes are present without a resume-only trigger."
    },
    {
      "check": "AC-2",
      "method": "Rendered ownership-rule inspection",
      "outcome": "pass",
      "evidenceIds": ["prompts"],
      "reason": "Recall is explicitly not source discovery and exempt from the first-tool dispatch rule."
    },
    {
      "check": "AC-4",
      "method": "Root-envelope and child-contract review across harnesses",
      "outcome": "pass",
      "evidenceIds": ["prompts", "suite"],
      "reason": "Verified identities or unavailable travel verbatim; children never derive identity or acquire root lifecycle authority."
    },
    {
      "check": "Compaction preserves prior requirements",
      "method": "Line-by-line comparison against HEAD",
      "outcome": "pass",
      "evidenceIds": ["compaction"],
      "reason": "The listed ownership and child-memory obligations remain intact."
    },
    {
      "check": "AC-5",
      "method": "Generated-drift tests, Pi equality/hash checks, documentation review, caps and required static checks",
      "outcome": "pass",
      "evidenceIds": ["assets", "suite", "checks"],
      "reason": "Generated assets, documentation, caps and provider boundaries agree with current sources."
    },
    {
      "check": "Required agents/harness suite",
      "method": "Execute the assigned command",
      "outcome": "fail",
      "evidenceIds": ["suite", "baseline"],
      "reason": "Two pre-existing stale Pi progress assertions remain red; both reproduce without this diff."
    },
    {
      "check": "Reported failure dispositions",
      "method": "Clean-HEAD reproductions and standalone release execution",
      "outcome": "pass",
      "evidenceIds": ["baseline", "release"],
      "reason": "Non-regression attribution is independently supported. Timing-only and stable standalone claims require qualification because EPERM cleanup failures also reproduce on HEAD."
    }
  ],
  "risks": [
    {
      "description": "The required area suite remains nonzero on baseline Pi progress pins. Closeout evidence must report this accurately, not claim all checks exited 0.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["suite", "baseline"]
    },
    {
      "description": "Windows release-fixture cleanup is unstable outside this diff; standalone 10/10 stability was not confirmed.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["release"]
    },
    {
      "description": "Pi root has only 48 characters of remaining prompt budget.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["checks"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root validates this unchanged envelope, records truthful AC/check evidence and baseline/environment dispositions, then runs closeout.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/root-memory-proactivity/root-memory-proactivity.md",
    "reviewedRecordSha256": "8afee1053efa9e80bbd81043e1e4c614e44a7567c88bde46e97afaea266e7cae"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | rendered roots for OpenCode, Codex, Claude Code, Pi | Oracle evidence prompts; prompt-rendering tests pass
- AC-2: PASS | ownership rule inspection | Oracle evidence prompts
- AC-3: PASS | rendered roots + prompt tests | Oracle evidence prompts, suite
- AC-4: PASS | root envelope + child contracts | Oracle evidence prompts, suite
- AC-5: PASS | build, check:ci, typecheck exit 0; generated drift + provider boundary pass; caps 12262/12500, 13548/13800, 13015/13300, 15552/15600 | Oracle evidence assets, checks
- Known non-regressions: `pnpm vitest run src/agents src/harness` exits 1 only on two stale Pi progress pins (`keeps question dialogs and session progress root-owned`, `uses the Pi question tool without requiring a progress tool`), reproduced on clean HEAD c3fd94f. release-workflow.test.ts shows Windows EPERM fixture-cleanup flakiness that also reproduces on HEAD; inputs unchanged.
- Source: .thoth/specs/memory-orchestration/spec.md | sha256:6096fb5d5feb265ce07fa7af8dd9a291be7bafad8093bb5ca2c0be194c013ce7
- Source: .thoth/specs/agent-delegation/spec.md | sha256:3afa9c4ab9057b9191d9980649513de6535650319d158d1e76a05b8afc79dbf0

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
