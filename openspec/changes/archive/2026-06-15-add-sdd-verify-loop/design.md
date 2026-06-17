# Design: Codify the SDD Verify Phase as an Autonomous Verify-Loop

## Technical Approach

The verify-loop is encoded entirely in the **unified prompt/contract/skill
source** so every harness (OpenCode, Claude Code, Codex) inherits identical
behavior with no per-harness variant. There is no runtime state machine to
build: the SDD pipeline today is driven by orchestrator prose
(`src/agents/prompt-sections.ts`) plus a declarative, machine-readable phase
contract (`src/harness/core/sdd.ts`), and skill instructions
(`src/skills/**/SKILL.md`). The loop is added in the same three layers:

1. **Phase contract** — make the `verify` phase carry a new iterative-verify
   gate kind and a machine-readable round bound, additively, so the loop and
   its bound are an invariant rather than prose-only.
2. **Orchestrator prose** — replace the single linear post-execution line with
   the three-verdict branch set, the bounded fix loop, and escalation via the
   already-portable `{{userQuestionTool}}` blocking-input surface.
3. **Skills** — `sdd-verify` emits actionable remediation anchors plus a
   `round N` marker (the round-counter source of truth); `executing-plans`
   describes the verify-loop as the post-apply phase.

The round bound lives in **one canonical constant** in `sdd.ts`, and the
orchestrator prose references "3 rounds" against that same value to prevent
prose/contract drift.

## Architecture Decisions

### Decision: Gate kind name and round-bound representation in `SddPhaseContract`

**Choice**:
- Add a new gate kind `'iterative-verify'` to the `gate` union:
  `gate?: 'oracle-review' | 'user-confirmation' | 'iterative-verify';`
- Add a new **additive optional** field to carry the bound:
  `maxRounds?: number;` on `SddPhaseContract`.
- Set on the `verify` phase: `gate: 'iterative-verify'`, `maxRounds: 3`.
- Introduce a single canonical exported constant
  `export const SDD_VERIFY_MAX_ROUNDS = 3;` and reference it
  (`maxRounds: SDD_VERIFY_MAX_ROUNDS`) so the contract value and any prose/test
  reference resolve to one source of truth.

**Alternatives considered**:
- *Encode the bound inside the gate string* (e.g. `'iterative-verify:3'`):
  rejected — it overloads a discriminant with data, breaks the closed-union
  ergonomics, and forces every consumer to parse the string.
- *A separate `iteration?: { gate: ...; maxRounds: number }` sub-object*:
  rejected — heavier than needed, and `gate` is already the established
  discriminator; a flat optional `maxRounds` is the minimal additive change.
- *Reuse `'user-confirmation'` for the warnings escalation*: rejected at the
  contract level — the spec requires the `verify` phase to carry gate semantics
  *distinct* from plan-review and user-confirmation. The warnings escalation is
  a sub-state of the iterative-verify gate handled in orchestrator prose, not a
  separate phase/gate.

**Rationale**: Adding a union member and an optional field is strictly
additive — existing `gate` values (`'oracle-review'`, `'user-confirmation'`)
and existing phases are untouched, and `maxRounds` defaults to `undefined` for
every non-verify phase (its absence means "not an iterative phase"). The
TypeScript union widening is backward compatible because no consumer exhausts
the union or relies on it being closed to exactly two members (audit below).

**Audit of every `.gate` consumer across `src/`** (authoritative — the type and
the `verify` phase are the only structural changes):

| Site | File:line | Reads/writes `.gate`? | Required change |
| --- | --- | --- | --- |
| Type definition | `src/harness/core/sdd.ts:25` | declares union | **Change**: widen union with `'iterative-verify'`; add `maxRounds?: number` to interface |
| `plan-review` phase literal | `src/harness/core/sdd.ts:160` | writes `gate: 'oracle-review'` | None (unchanged) |
| `implementation-confirmation` phase literal | `src/harness/core/sdd.ts:172` | writes `gate: 'user-confirmation'` | None (unchanged) |
| `verify` phase literal | `src/harness/core/sdd.ts:190-201` | (currently no gate) | **Change**: add `gate: 'iterative-verify'`, `maxRounds: SDD_VERIFY_MAX_ROUNDS` |
| Contract test (plan/user gates) | `src/harness/core/sdd.test.ts:48-56` | reads via `toMatchObject` | None required (asserts a subset; still passes). **Add** a new assertion for the verify gate + bound (see Testing Strategy) |
| `getSddWorkflowContract` clone | `src/harness/core/sdd.ts:242-259` | spreads `...phase` | None — spread copies `gate`/`maxRounds` automatically (both are primitives) |
| `prompt-sections.ts` SDD helpers | `src/agents/prompt-sections.ts:147-192` | imports `SddPhaseContract` + `getSddWorkflowContract`; reads only role fields (`defaultAgentRole`, `alternateAgentRoles`, `supportingAgentRoles`, `persistenceAgentRole`) | None — never reads `.gate` or `.maxRounds` |

No `switch (phase.gate)` or exhaustive narrowing over the union exists anywhere
in `src/`; the only structural reads of `gate` are the two test assertions and
the literal assignments. The change is therefore non-breaking. The
`getSddWorkflowContract` deep-clone does **not** need updating for `maxRounds`
because it is a primitive and already copied by the `...phase` spread (only
array fields get explicit copies there).

### Decision: Round-counter source of truth

**Choice**: The `round N` marker emitted in each `sdd-verify` report is the
**single source of truth** for the round counter. The orchestrator reads the
round number from the most recent verify report (artifact/return envelope), not
from any internal counter it maintains independently.

- Round 1 = the first `sdd-verify` after the initial `sdd-apply`.
- Each fix→re-verify cycle increments the round; the new verify report stamps
  `round N+1`.
- The orchestrator dispatches `sdd-verify` with the **expected round number**
  in the dispatch envelope (derived as `lastReportedRound + 1`, starting at 1),
  and `sdd-verify` stamps that number into the report's `## Round` field and the
  `Round` return field. This keeps the counter traceable across iterations and
  resilient to session resume (recovered from the artifact, not volatile state).
- Bound enforcement: before dispatching a fix→re-verify cycle the orchestrator
  checks `currentRound < SDD_VERIFY_MAX_ROUNDS (3)`. When a `fail` verdict
  arrives stamped `round 3`, the bound is exhausted and the escalation branch
  fires.

**Alternatives considered**:
- *Orchestrator-only in-memory counter*: rejected — not durable across
  resume/compaction and not visible in the artifact, violating the spec
  requirement that the round counter be surfaced in the report and progress
  tracking.
- *Count verify-report files*: rejected — brittle in `thoth-mem`-only mode
  where there is no file to count; the in-report marker works across all
  persistence modes.

**Rationale**: The spec mandates the `round N` marker be the source of truth and
visible in both the report and progress tracking. Reading the number back from
the artifact makes it survive session boundaries and aligns with the existing
"recover state from the artifact" pattern in `executing-plans` Recovery
Protocol.

### Decision: `sdd-verify` remediation output shape

**Choice**: Each Critical Issue in the `## Issues Found` section and the
`Critical Issues` return field becomes a **structured remediation target**, not
a prose bullet. Concrete shape:

```md
## Issues Found

### Critical
- **[C1]** {one-line problem statement}
  - file: `path/to/file.ts:LINE` (or `path/to/file.ts` when line is N/A)
  - scenario: `{Requirement title} › {Scenario name}` (full pipeline) OR
    criterion: `{proposal success-criterion id/text}` (accelerated pipeline)
  - fix: {imperative remediation instruction}

### Warnings
- **[W1]** {one-line problem statement}
  - file: `path/to/file.ts:LINE`
  - scenario / criterion: {anchor}
  - fix: {imperative remediation instruction}
```

Required fields per Critical Issue (and per Warning): a stable **id**
(`C1`,`C2`,… / `W1`,`W2`,…), at least one **anchor** (`file:` and/or
`scenario:`/`criterion:`), and a **fix:** instruction. A Critical Issue with no
anchor is invalid output. The report also gains a `## Round` field with the
`round N` marker.

The return-envelope `Critical Issues` field mirrors these as compact lines, each
carrying its id and primary anchor, e.g.
`C1 — src/foo.ts:42 — {scenario} — {fix}`.

**How the targeted fix re-dispatch consumes them**: on `fail`, the orchestrator
builds the `sdd-apply` dispatch `BOUNDARIES`/`REQUIREMENTS` from the issue
**anchors** — the `file:` anchors become the scoped file list and the
`scenario:`/`criterion:` anchors become the acceptance targets the fix must
satisfy. The fix is scoped to those anchors and MUST NOT silently expand to a
full unscoped re-apply when anchors are present (spec: "Targeted fix is scoped
by remediation anchors"). The same shape feeds the warnings re-iterate branch.

**Alternatives considered**:
- *Keep prose bullets, parse heuristically*: rejected — the proposal's
  "over-broad refixes" risk is precisely caused by unparseable prose; structured
  anchors are the in-scope mitigation.
- *Machine JSON block*: rejected — these are skill-authored Markdown reports
  read by an LLM orchestrator; structured Markdown sub-bullets are both
  human-readable and reliably consumable, consistent with existing SKILL output
  formats.

**Rationale**: Anchors give the fix dispatch sharp, bounded scope and satisfy
the spec requirement that issues are never prose-only.

### Decision: Orchestrator three-branch verdict flow wording

**Choice**: Replace `prompt-sections.ts` line 377
(`Post-execution: delegate sdd-verify, then sdd-archive when verification
passes.`) with an explicit verify-loop narrative (exact text in File Changes
below) covering: dispatch `sdd-verify` as an iterative gate (round 1); branch on
`fail` / `pass with warnings` / clean `pass`; the 3-round bound; the
targeted-fix re-dispatch scoped by remediation anchors; the
escalation-on-exhaustion path; and the warnings advance-vs-iterate escalation —
all through `{{userQuestionTool}}`.

**Rationale**: This mirrors the existing plan-review loop pattern already in the
`<sdd>` section ("the review loop is complete only after [OKAY]"), keeping the
two control loops stylistically consistent. The clean-pass branch explicitly
routes through the **existing** pre-archive user gate (lines 375-376) — that
gate is unchanged.

### Decision: Harness portability of the escalation surface

**Choice**: Escalation uses the existing `{{userQuestionTool}}` template token,
which the renderer already substitutes per harness
(`prompt-sections.ts:684` → `dialect.tools.userQuestionTool`): OpenCode
`question`, Codex `request_user_input`, Claude Code `AskUserQuestion`
(`prompt-dialects.ts:101,128,171`). Because every supported dialect defines a
`userQuestionTool`, no harness currently lacks the primitive, so **no new code
field is required**. The fallback is a **prose instruction** in the verify-loop
wording: if a harness has no blocking user-input primitive, the orchestrator
MUST report the escalation as an unsupported-capability limitation and MUST NOT
silently auto-advance or loop — consistent with the established
capability-disclosure pattern (`prompt-dialects.ts:79-93`, the
`renderCapabilityDisclosure` mechanism that surfaces "instruction-only/unknown"
gaps rather than claiming parity).

**Alternatives considered**:
- *Add a `HarnessCapabilities` member (e.g. `blockingUserInput`)*: rejected as
  out of scope and unnecessary — `userQuestionTool` already encodes presence,
  and the spec only requires the orchestrator to *report* unsupported-capability
  in prose, not a new typed capability gate. (Flag for follow-up only if a
  future harness ships without a blocking primitive.)

**Rationale**: Reuses the existing portability seam, keeps the source unified,
and degrades to reporting (never silent looping) exactly as the spec's
"Blocking input surface is unavailable" scenario requires.

## Data Flow

```
sdd-apply (round baseline)
   │
   ▼
sdd-verify  ──emit──►  verify report { ## Round: N, structured Critical Issues w/ anchors, Verdict }
   │
   ▼  orchestrator reads Verdict + Round N from report
   ├── clean pass ─────► existing pre-archive user gate (unchanged) ─► sdd-archive
   ├── pass w/ warnings ─► {{userQuestionTool}}: advance vs re-iterate
   │        ├─ advance ─► existing user gate ─► sdd-archive
   │        └─ re-iterate ─► [if N < 3] targeted sdd-apply (scoped by warning anchors) ─► sdd-verify (round N+1)
   └── fail
           ├─ [N < 3] targeted sdd-apply (scoped by Critical Issue anchors) ─► sdd-verify (round N+1)
           └─ [N == 3] {{userQuestionTool}} escalate unresolved failure
                         (if no blocking primitive: report unsupported-capability; never silent-advance/loop)
```

Round counter: `N` is always read from the latest verify report's `## Round`
marker; the orchestrator dispatches the next `sdd-verify` requesting round
`N+1`; the bound check is `N < SDD_VERIFY_MAX_ROUNDS`.

## File Changes

### Modified

**`src/harness/core/sdd.ts`**
1. Add canonical constant near the top of the module exports:
   `export const SDD_VERIFY_MAX_ROUNDS = 3;`
2. Widen the gate union (line 25):
   `gate?: 'oracle-review' | 'user-confirmation' | 'iterative-verify';`
3. Add optional field to `SddPhaseContract` interface:
   `maxRounds?: number;` (additive, documents the iterative bound).
4. Update the `verify` phase literal (lines 190-201) to add
   `gate: 'iterative-verify',` and `maxRounds: SDD_VERIFY_MAX_ROUNDS,`.
5. (Optional, recommended) add a `verificationRules` entry to
   `SDD_WORKFLOW_CONTRACT` describing the bounded verify-loop so the rule set
   stays in sync, e.g. "Verify runs as a bounded iterative gate of at most
   SDD_VERIFY_MAX_ROUNDS rounds; on exhausted failure escalate to the user."
   No clone-function change is needed (`maxRounds` is a primitive copied by the
   existing `...phase` spread).

**`src/agents/prompt-sections.ts`** (`<sdd>` section, replace line 377)
Replace the single linear line with:

```
Post-execution verify-loop (mirrors the plan-review loop's discipline; bounded to 3 rounds = initial apply->verify plus up to 2 fix->re-verify):
- Dispatch \`sdd-verify\` as an iterative gate, not a single shot; round 1 is the first verify after apply. Treat the \`round N\` marker in the verify report as the source of truth for the round counter and surface it in {{progressTool}}.
- On clean \`pass\`: proceed through the existing pre-archive user gate above, then delegate \`sdd-archive\`. Do not auto-advance to archive merely because a verify report exists.
- On \`fail\` with rounds remaining (round < 3): dispatch a TARGETED \`sdd-apply\` re-run scoped by the verify report's Critical Issue remediation anchors (file and/or scenario), then re-dispatch \`sdd-verify\` as round N+1. Do not expand a scoped fix into a full unscoped re-apply when anchors are present, and do not advance to archive while the verdict is \`fail\`.
- On \`fail\` at the bound (round 3 still failing): escalate the unresolved failure to the user with \`{{userQuestionTool}}\`. Do not run another apply/verify round and do not silently abandon or auto-archive. If the harness lacks a blocking user-input primitive, report this as an unsupported-capability limitation instead of auto-advancing or looping.
- On \`pass with warnings\`: escalate with \`{{userQuestionTool}}\` an advance-vs-iterate choice (advance to \`sdd-archive\` vs re-iterate to clear warnings). Never auto-advance and never auto-loop. If the user chooses re-iterate, dispatch a targeted \`sdd-apply\` scoped by the warning remediation anchors and re-verify, subject to the 3-round bound.
```

(Authoring note: keep the literal "3 rounds" consistent with
`SDD_VERIFY_MAX_ROUNDS`; this is the one prose↔contract cross-reference called
out in the proposal's drift risk. The clean-pass branch must not restate or
alter the existing user gate on lines 375-376.)

**`src/skills/sdd-verify/SKILL.md`**
1. Report template (`## Issues Found`): replace the prose `## Issues Found` with
   the structured Critical/Warnings shape (ids, `file:`/`scenario:`/`criterion:`
   anchors, `fix:`) from the remediation decision above.
2. Add a `## Round` field to the report template carrying the `round N` marker.
3. Output Format: change `Critical Issues` from "bullets or `None`" to the
   anchored line format (`id — file:line — scenario/criterion — fix`), and add a
   `Round` return field (`round N`).
4. Prerequisites/Workflow: accept an expected `round N` from the dispatch
   envelope and stamp it into the report; document that the round number is the
   loop's source of truth.
5. Rules: add "Every Critical Issue MUST carry at least one remediation anchor
   (file and/or scenario/criterion); prose-only Critical Issues are invalid." and
   "Stamp the `round N` marker from the dispatch envelope."

**`src/skills/executing-plans/SKILL.md`** (Phase 5: Completion, lines 183-191)
Replace the single-shot "suggest `sdd-verify` as the next step" (line 191) with
verify-loop wording: after final verification, hand off to the **bounded
verify-loop** (dispatch `sdd-verify` as an iterative gate; branch on
`fail`/`pass with warnings`/clean `pass`; targeted fix scoped by remediation
anchors; 3-round bound; escalate to the user on exhaustion or on warnings).
Keep this consistent with the orchestrator `<sdd>` wording — describe the phase,
do not duplicate the canonical number divergently (reference "the 3-round bound
in the orchestrator SDD wording").

### Modified (tests)

**`src/harness/core/sdd.test.ts`**
- Extend the existing gate test (or add a sibling test) asserting
  `getSddPhase('verify')` matches `{ gate: 'iterative-verify', maxRounds: 3 }`
  and that `plan-review`/`implementation-confirmation` gates are unchanged
  (regression guard for the additive-non-breaking requirement).

**`src/agents/prompt-rendering.test.ts`** (and/or `prompt-sections` snapshot
assertions)
- Add assertions that the rendered orchestrator prompt contains the three
  verify branches and the 3-round bound, and that the linear
  "then sdd-archive when verification passes" line is gone. Mirror the existing
  "Plan gate" assertion style (line 274).

### Created / Deleted

- None. All changes are edits to existing unified source files. No data
  migration, no archived-artifact changes.

## Interfaces / Contracts

- `SddPhaseContract.gate: 'oracle-review' | 'user-confirmation' | 'iterative-verify'`
  (widened, additive).
- `SddPhaseContract.maxRounds?: number` (new optional; set only on `verify`).
- `SDD_VERIFY_MAX_ROUNDS = 3` (new exported canonical constant; single source of
  truth for the bound).
- `sdd-verify` report contract gains `## Round` and structured `## Issues Found`
  (ids + anchors + fix); return envelope gains `Round` and anchored
  `Critical Issues`.
- Orchestrator dispatch envelope to `sdd-verify` carries the expected round
  number; dispatch envelope to the targeted `sdd-apply` carries the remediation
  anchors as scope.

## Testing Strategy

- **Contract unit tests** (`sdd.test.ts`): verify the new gate kind + bound on
  `verify`; assert prior gates unchanged (non-breaking). `pnpm test` against the
  `src/harness/core/sdd.test.ts` subset.
- **Prompt rendering tests** (`prompt-rendering.test.ts`): assert all three
  branches, the bound, and the escalation language render; assert the old linear
  line is absent; assert `{{userQuestionTool}}` substitution still resolves per
  harness.
- **Typecheck** (`pnpm run typecheck`): confirms the additive union widening
  compiles with no exhaustiveness breakage at any consumer.
- **Full gate** before PR: `pnpm run lint`, `pnpm run typecheck`,
  `pnpm run build`, `pnpm test` (CI order from AGENTS.md).
- Skill `.md` changes are documentation/instruction; covered by any existing
  skill-content snapshot tests if present, otherwise by lint/build packaging.

## Migration / Rollout

No migration. All changes are edits to unified prompt/contract/skill source
with no runtime/persisted state. Rollback = revert the four source files
(`prompt-sections.ts`, `sdd.ts`, `sdd-verify/SKILL.md`,
`executing-plans/SKILL.md`) plus the two test files, restoring the prior linear
wording and two-member gate union.

## Open Questions

- **Warnings escalation as its own gate value?** The proposal's "Deferred"
  list raises whether `pass with warnings` should be a distinct gate. This
  design keeps it as a sub-branch of `iterative-verify` handled in orchestrator
  prose (no new gate), because the spec only requires the *verify phase* to
  carry distinct gate semantics, not each verdict. Confirm during tasks/apply.
- **Future harness without a blocking primitive**: handled by prose fallback
  (report unsupported-capability). If such a harness is added, consider
  promoting this to a typed `HarnessCapabilities` member — flagged, not in
  scope now.
