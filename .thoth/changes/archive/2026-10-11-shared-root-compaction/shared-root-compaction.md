# Change: shared-root-compaction

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

The adaptive-root sections shared by OpenCode, Codex, Claude Code and Pi are
rendered by `createOrchestratorPromptSections()` in
`src/agents/prompt-sections.ts` from policy text in
`src/harness/core/agent-pack.ts` (`IMPLEMENTATION_OWNERSHIP_POLICY`,
`ORCHESTRATION_POLICY.taskShaping`, `AGENT_ROLES`). After `bc14951` the Pi root
is 16,607 characters: `sdd-workflow` 3,585, `implementation-ownership` 2,898,
`task-shaping` ~2,480, `routing` 1,473, `delegation-lifecycle` 918.

Observed redundancy (same rule stated more than once in one root):
- `implementation-ownership` repeats `<role>` in its first bullet; says
  "prompt guidance, not runtime enforcement" twice; spreads "unlocated source
  goes to Explorer, root does not pre-read" over five bullets and the direct
  source allowance over four.
- `task-shaping` opens with an unexplained `select-specialists ->
  admit-ready-units` line; its last four bullets restate native waiting, no
  polling and no invented scheduler, which `readyDispatch` and the dialect
  wait instruction already state.
- `delegation-lifecycle` states the fresh-session rule twice (first bullet and
  "Independent context").
- `sdd-workflow` carries closeout-recording detail (provenance codes) that the
  installed `thoth-sdd` skill already owns; `questions` repeats the host-limit
  clause of the three-return rule.
- OpenCode root headroom against its 13,500 cap is ~5 characters.

`.thoth/constitution.md` and `.thoth/specs/multi-harness-agent-pack/spec.md`
mandate behaviors (ownership, three-return budget, plan-review provenance,
fresh Oracle), not wording.

External evidence (librarian, 2026-10-11): Anthropic context engineering
("smallest possible set of high-signal tokens", avoid laundry lists), OpenAI
GPT-5.x guides (contradictory or redundant lines cost reasoning; keep
when/how-to-use-tools policy in the prompt), Claude Code memory docs (longer
instructions reduce adherence; procedures belong in skills).

## Intent

Shorten the shared adaptive-root sections for every harness by removing
duplicated statements and recording-time detail, while every root behavior
required by the constitution, specs and current tests remains stated once.

## Non-goals

- No behavior or policy change: no rule is weakened, added or reinterpreted.
- No change to child specialist prompts, Pi `<pi-runtime>` or harness-specific
  dialect wording beyond what shared templates render.
- `routing` is out of scope: its `AGENT_ROLES` strings are canonical and also
  feed specialist prompt bodies and routing descriptions in every adapter.
- No restructuring of policy types or renderer architecture.
- No change to skills, constitution or specs.

## Acceptance

- AC-1: `implementation-ownership`, `delegation-lifecycle`, `sdd-workflow`,
  `questions` and the combined `task-shaping` + `delegation` sections (D6
  moves the assignment envelope between those two) are each shorter, with an
  inventory showing every removed sentence is either a duplicate of a retained
  sentence or owned by the installed `thoth-sdd` skill.
- AC-2: Required behaviors remain present in all four roots: Explorer-first
  for unlocated source without root pre-reading; the bounded direct-source
  allowance (two fragments, ~200 lines); direct-work exceptions; user
  direct-work precedence and model/effort preservation; ready plan summary
  with `Review plan with Oracle (Recommended)` / `Proceed without review`;
  silence never skips; three-return budget per question; language rule;
  mandatory independent final verification; Oracle gate validation.
- AC-3: Combined root size drops by at least 1,350 characters for each
  harness (baselines: OpenCode 13,495, Codex 14,781, Claude 14,248, Pi 16,607); compact-root caps are tightened accordingly and focused tests,
  typecheck, check:ci and build pass.

## Clarifications

- Scope chosen by the user on 2026-10-11: phase 1 (Pi-only, `bc14951`) then
  this phase 2 across harnesses.

## Decisions

- D1: Compress by deduplication and merging, not by moving root rules to
  skills, except recording-time provenance codes already owned by `thoth-sdd`.
- D5: AC-3 lowered from 2,000 to 1,350 during implementation. Reaching
  2,000 would require removing unique rules; focused tests already caught four
  semantic losses in a tighter draft (questions/research/changes
  classification, material reclassification, delegation unit count, small
  direct-work wording), which were restored.
- D6: `<phase-dispatch>` (PHASE / OBJECTIVE / INPUT ARTIFACTS ... headings)
  and the `task-shaping` envelope described the same assignment twice; they
  are unified into the task-shaping envelope, which names the phase, the
  change record, applicable requirements and scoped MEMORY authorization.
  `task-shaping` therefore grows while `delegation` shrinks; AC-1 measures
  them together.
- D7: The fresh-session sentence names phases explicitly
  (`New objectives, phases, work units, ...`), restoring the phase-change
  trigger Pi previously carried in its dialect and stating it for every
  harness, consistent with the multi-harness freshness contract.
- D4: Keep the authorization wording matched by `evals/contracts.json`
  (`[OKAY] alone never authorizes implementation`; `After [OKAY], keep
  Implement ... Stop separate`). The `task-shaping` header label is removed and
  `agent-routing.test.ts` asserts the retained readiness semantics instead.
- D2: Tests pin each required behavior with one short anchor per rule instead
  of long verbatim sentences; hash snapshots of non-Pi prompts are updated
  intentionally.
- D3: The user directed root-owned analysis and authoring for this prompt
  work; independent final verification stays with a fresh Oracle.

## Durable deltas

- None.

## Plan

Edit policy strings in `src/harness/core/agent-pack.ts` and templates in
`src/agents/prompt-sections.ts`: merge the ownership bullets into about ten,
drop the `task-shaping` header line and merge its four trailing bullets into
two, merge the two fresh-session bullets, shorten the plan-review bullet to
the behavior (offer, recommendation, silence, separate authorization) and
point recording codes to `thoth-sdd`, and remove the duplicated host-limit
clause from `questions`. Render all four roots before/after and diff the
behavior inventory. Update anchors in `prompt-rendering`, `opencode`, `codex`,
`claude-code`, `pi`, agent-pack and agent-routing tests. Verification seams:
those test files, `src/agents/index.test.ts`, `evals/contracts.test.ts`,
typecheck, check:ci, build; before/after render shows specialist artifacts
(prompt bodies and descriptions) byte-identical in all four harnesses.

## Tasks

- [x] AC-1: Compacted shared root sections with removal inventory
  - Outcome: shorter shared sections, each removal mapped to a retained sentence or `thoth-sdd`
  - Known entrypoints and skill paths: src/harness/core/agent-pack.ts; src/agents/prompt-sections.ts; skills/thoth-sdd/SKILL.md
  - Inputs: Exploration redundancy list; constitution and multi-harness-agent-pack spec
  - Dependencies: none
  - Output: edited policy strings/templates and an inventory in Verification
  - Owner: root (user-directed)
  - Writes: src/harness/core/agent-pack.ts, src/agents/prompt-sections.ts
  - Interface boundaries: rendered roots for opencode, codex, claude, pi; child prompts unchanged
  - Focused check and PASS evidence: before/after render shows specialist artifacts (bodies and descriptions) byte-identical in all four harnesses and the five sections reduced
  - Return milestone: renders and inventory complete
  - Stop / reassessment: any required behavior that cannot be kept without growth
- [x] AC-2: Behavior anchors pinned in all four roots
  - Outcome: tests assert each AC-2 behavior once per harness
  - Known entrypoints and skill paths: src/agents/prompt-rendering.test.ts; src/harness/adapters/{opencode,codex,claude-code,pi}.test.ts; src/harness/core/agent-pack.test.ts; src/harness/core/agent-routing.test.ts; evals/contracts.test.ts
  - Inputs: AC-1 edits
  - Dependencies: AC-1
  - Output: updated tests
  - Owner: root (user-directed)
  - Writes: the listed src test files (evals/contracts.json only if a pattern names removed duplicate wording)
  - Interface boundaries: none
  - Focused check and PASS evidence: listed test files and evals/contracts.test.ts pass
  - Return milestone: focused tests green
  - Stop / reassessment: a pinned behavior absent from a harness root
- [x] AC-3: Size reduction and caps
  - Outcome: each root at least 1,350 characters shorter; caps tightened
  - Known entrypoints and skill paths: src/agents/prompt-rendering.test.ts; src/agents/index.test.ts
  - Inputs: AC-1 and AC-2
  - Dependencies: AC-1, AC-2
  - Output: tightened caps; typecheck, check:ci, build evidence
  - Owner: root (user-directed)
  - Writes: src/agents/prompt-rendering.test.ts, src/agents/index.test.ts
  - Interface boundaries: none
  - Focused check and PASS evidence: caps pass; typecheck, check:ci, build exit 0
  - Return milestone: closeout gate green
  - Stop / reassessment: a harness falls short of the reduction target

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED
Plan review: first REJECT (routing scope, missing seams) repaired; fresh Oracle OKAY on e02f9747. Implementation authorized by the user's 2026-10-11 scope choice "Fase 1 y luego fase 2".

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 394b4dc41576463efdddec0ff32676cf6f6a41505d3e4eb5c415aac9a26d9d70

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "AC-1–AC-3 pass. The two trims preserve actionable meaning; recorded measurements, source digests, specialist identity and generated Claude parity remain correct.",
  "evidence": [
    {
      "id": "E1",
      "kind": "integrity",
      "locator": ".thoth/changes/shared-root-compaction/shared-root-compaction.md",
      "claim": "Independently calculated prefix SHA-256 matches the assignment. All 13 Source digests match and cover exactly the tracked diff; final recheck found unchanged inputs.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "measurement",
      "locator": "Independent temporary HEAD/current source renders against bc149510da18990c63c19018e22aac25c9d2997e",
      "claim": "OpenCode 13,495→12,127; Codex 14,781→13,413; Claude 14,248→12,880; Pi 16,607→15,200. Reductions are 1,368/1,368/1,368/1,407, matching the record and exceeding 1,350.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "section-measurement",
      "locator": "Four independently rendered root prompts",
      "claim": "Every AC-1 measured section shrinks: ownership −860, lifecycle −27 (Pi −66), SDD −188, questions −109, combined task-shaping/delegation −138. All recorded section sizes match. Routing and Pi runtime remain unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "semantic-review",
      "locator": "src/harness/core/agent-pack.ts; src/agents/prompt-sections.ts; src/agents/prompt-dialects.ts",
      "claim": "Removal inventory maps to retained obligations or bundled thoth-sdd recording guidance. 'Otherwise dispatch' retains specialist selection through the unchanged role directory. 'Existing ones' refers to Oracle instances; same-assignment continuation and mandatory fresh judgments still prohibit new approval through reuse. Phase, requirements and scoped MEMORY obligations remain explicit.",
      "basis": "inferred",
      "uncertainty": "Prompt-contract judgment, not a claim of live model adherence."
    },
    {
      "id": "E5",
      "kind": "artifact-comparison",
      "locator": "Four adapter outputs; plugin/agents/orchestrator.md; plugin/.claude-plugin/.thoth-agents-plugin-assets.json",
      "claim": "All five specialist configurations/definitions, including bodies and descriptions, are byte-identical before/after in every harness. Generated Claude orchestrator equals the current canonical adapter output; all Claude manifest asset hashes match.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "executed-checks",
      "locator": "Focused Vitest command; bundled thoth-sdd verify validator; git diff --check",
      "claim": "Independent focused run passed 400/400 tests across 17 files. The verify gate passed without warnings; git diff --check passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "governance-and-check-provenance",
      "locator": ".thoth/constitution.md; .thoth/specs/multi-harness-agent-pack/spec.md; skills/thoth-sdd/SKILL.md; assignment and record Verification",
      "claim": "Relevant ownership, native lifecycle, bounded consultation, choice handling, language and independent-verification contracts remain represented. Constitution, specifications and skills are unchanged. Root reports successful typecheck, check:ci and build.",
      "basis": "observed",
      "uncertainty": "Root-reported typecheck, check:ci and build evidence was reused rather than independently rerun."
    }
  ],
  "verification": [
    {
      "check": "AC-1: section compaction and removal inventory",
      "method": "Render HEAD/current sources outside the repository; compare section sizes and inspect semantic mappings.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "All five measurement groups shrink without removing an actionable obligation."
    },
    {
      "check": "AC-2: required behaviors and governance conformance",
      "method": "Inspect actual policy/template diff against constitution, specification and bundled skill; independently run focused behavior tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6", "E7"],
      "reason": "Required behaviors remain in all four roots, including repaired phase/requirements and freshness obligations."
    },
    {
      "check": "AC-3: reduction, tightened caps and checks",
      "method": "Independently measure rendered roots and execute focused tests; reuse reported root closeout checks.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6", "E7"],
      "reason": "Every reduction exceeds 1,350; tightened caps pass. Focused tests independently pass; remaining closeout checks have reported passing evidence."
    },
    {
      "check": "Specialist identity and generated parity",
      "method": "Compare complete specialist outputs and canonical Claude artifact bytes; recompute asset hashes.",
      "outcome": "pass",
      "evidenceIds": ["E5"],
      "reason": "No specialist drift or generated Claude mismatch."
    },
    {
      "check": "Record binding, source coverage and input freshness",
      "method": "Hash exact pre-Authorization bytes and all Source files before and after checks; run bundled verify validator.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "Assigned digest, source coverage and stable reviewed inputs are confirmed."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root validates this unchanged envelope, records PASS evidence, then runs closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/shared-root-compaction/shared-root-compaction.md",
    "reviewedRecordSha256": "394b4dc41576463efdddec0ff32676cf6f6a41505d3e4eb5c415aac9a26d9d70"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

Removal inventory (each removed sentence is a duplicate of retained text or
owned by installed `thoth-sdd`):
- implementation-ownership: default-rule bullet duplicated `<role>`; five
  discovery bullets merged into two (pre-reading ban, navigation, investigator
  fallback kept); two "prompt guidance, not runtime enforcement" notes merged
  into one; consultation (4), exceptions (2), writer routing (2) and evidence
  handling (3) each merged into one bullet; the "Experimental" label dropped.
- task-shaping: unexplained `select-specialists -> admit-ready-units` label
  removed; four trailing bullets (native authority, waits/no polling, no
  invented executor, attention/milestones) merged into two.
- delegation-lifecycle: "Independent context" merged into the fresh-session
  bullet; Pi `independentContext` reworded to avoid repeating it.
- sdd-workflow: provenance codes now referenced to installed `thoth-sdd`;
  final verification and closeout bullets merged; host-limit clause kept once.
- questions: host-limit clause removed (kept in the three-return bullet).
- delegation: `<phase-dispatch>` unified with the task-shaping envelope (D6).
- external-skills: "Keep decisions in the ID-named record only" duplicated the
  single-record rule.

First final verification FAILED (lost phase/requirements envelope
obligations, lost Pi phase-change freshness, task-shaping grew); repaired by
D6/D7 wording and the AC-1 combined measurement.

Second final verification FAILED only on AC-3 (1,329 < 1,350); two wording
trims ("otherwise dispatch", "Existing ones only clarify their findings")
closed the gap without changing meaning.

Renders (before -> after): OpenCode 13,495 -> 12,127; Codex 14,781 -> 13,413;
Claude 14,248 -> 12,880; Pi 16,607 -> 15,200. Section sizes before -> after
(OpenCode; other harnesses differ only in dialect text): ownership
2,898 -> 2,038; lifecycle 718 -> 691; sdd-workflow 3,542 -> 3,354; questions
269 -> 160; task-shaping + delegation 2,891 -> 2,753 (Codex 2,939 -> 2,801,
Claude 2,896 -> 2,758, Pi 3,250 -> 3,112). Specialist artifacts (OpenCode
configs, Codex/Claude/Pi agent definitions, bodies and descriptions) are
byte-identical before and after. Caps: OpenCode 12,500, Codex 13,800,
Claude 13,300, Pi 15,600.
Checks: 400/400 focused tests (src/agents, src/harness/adapters,
src/harness/core, src/pi.test.ts, evals/contracts.test.ts); typecheck;
check:ci; build (regenerated plugin/agents/orchestrator.md and Claude plugin
asset hashes); git diff --check.

- AC-1: PASS | before/after render and removal inventory | five sections shorter; specialist hash unchanged
- AC-2: PASS | focused behavior anchors in four harness roots | 400/400 tests incl. evals/contracts
- AC-3: PASS | size caps | each root shorter by 1,368 to 1,407 characters
- Source: plugin/.claude-plugin/.thoth-agents-plugin-assets.json | sha256:883c29987e3363985d3ff0536e046a76761f975685b668aeb4068daee247edcf
- Source: plugin/agents/orchestrator.md | sha256:c4522013d9f7fd22dbf12fa0827eb92d1453301b8939eb45f5c1a207b45d2fd4
- Source: src/agents/index.test.ts | sha256:9757af039c58ce506478d45a95b7b5820557ed16a184ccdc6631666e384c2803
- Source: src/agents/prompt-dialects.ts | sha256:3a055061ea0b4618510c5efa6e0e2c94161257db8d0b5a00f559ec7876aa5410
- Source: src/agents/prompt-rendering.test.ts | sha256:9c7baa198a0a536226ae35dcdf0c0cd57e70bf5ec5cc28ba72d0fd15f4943d26
- Source: src/agents/prompt-sections.ts | sha256:3c177ddd46bbdef47c3a24ebdc03a36eda40a73ea3935fa37d47f81816067791
- Source: src/harness/adapters/claude-code.test.ts | sha256:d78de69c6cb24eb8c66216553b055f4be4a41d5f9a7d56f5c9f6610028eb5a5b
- Source: src/harness/adapters/codex.test.ts | sha256:ac51cb5d6db9db34524e008db22ce2b2076e56561c7a1595af741da4fa2afb75
- Source: src/harness/adapters/opencode.test.ts | sha256:e7178373e884cad0c005b62aa5395748e982744cfe01430f179b884f0c3e6fa1
- Source: src/harness/adapters/pi.test.ts | sha256:47f54076af6bfd017ecf82557de6bc3f2065969e384192e4c9024f4541af7e4b
- Source: src/harness/core/agent-pack.test.ts | sha256:a2af24db6b5f5a2e40252ac92d287a10c63d4aa13146342d253b2ec3a1dc00eb
- Source: src/harness/core/agent-pack.ts | sha256:132b2de48608568283dfdd4f66e63b1ce1b9c57bc27cec1337de2aeac35a2c56
- Source: src/harness/core/agent-routing.test.ts | sha256:70ebf43f2edc9aedab8d7f3685b41c6acf1adbd109ef9f1736a58f3eab606581

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
