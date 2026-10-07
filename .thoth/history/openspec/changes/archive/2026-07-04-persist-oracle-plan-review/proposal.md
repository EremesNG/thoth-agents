# Proposal: Persist Oracle Plan Review Results

## Intent

Make Oracle plan-review outcomes durable so SDD resumptions can reliably know whether the planning gate has already passed, especially when the active persistence mode is OpenSpec-only.

Today, `plan-review` is a required Oracle gate, but it does not produce a canonical artifact. In thoth-mem or hybrid runs, some context may survive in memory, but OpenSpec-only resumptions cannot discover from repo artifacts that Oracle already returned `[OKAY]`. This causes unnecessary re-review and weakens the SDD pipeline's recovery guarantees.

## Scope

### In Scope

- Define a canonical plan-review artifact for each change, written under the change's OpenSpec directory when the selected persistence mode includes OpenSpec.
- Define the matching deterministic thoth-mem artifact for modes that include memory persistence, preserving hybrid convergence behavior.
- Preserve the Oracle status token, including `[OKAY]` approvals and blocking/rejection statuses, in a durable and recoverable form.
- Preserve Oracle comments, non-blocking notes, blockers, and any explicit user override context that is needed to understand why advancement was allowed or blocked.
- Record reviewed planning-artifact references or freshness markers so resumptions can decide whether a prior approval still applies.
- Record review timestamp, pipeline type, persistence mode, and recovery behavior expectations.
- Require stale approval detection: a prior `[OKAY]` MUST NOT be reused after reviewed planning artifacts change.
- Keep behavior harness-agnostic across OpenCode, Codex, and other supported adapters, with any harness capability gap reported explicitly rather than silently changing gate semantics.

### Deferred / Needs Discovery

- Exact freshness-marker mechanism, such as content hashes, mtimes, artifact revision IDs, or a normalized reviewed-artifacts manifest.
- Exact artifact schema and whether it should be Markdown with structured front matter, Markdown sections, YAML, or another existing repo convention.
- Exact updates to phase contracts, validators, skills, tests, and prompt sections required to wire the artifact through the pipeline.
- Whether existing ad hoc thoth-mem `sdd/{change}/plan-review` records need migration or only future canonical writes.

### Out of Scope

- Changing Oracle's review criteria or replacing the plan-review gate.
- Changing the existing user-confirmation gate after plan-review approval.
- Archiving or rewriting historical OpenSpec changes solely to add missing plan-review artifacts.
- Detailed implementation file planning; that belongs in `design.md`.

## Approach

Introduce a canonical persisted representation of the plan-review result and make SDD recovery consume it before deciding whether to rerun Oracle.

Material behavior change:

- From: `plan-review` can return `[OKAY]`, but the SDD artifact model does not preserve that result as a canonical durable artifact.
- To: `plan-review` writes a canonical result artifact containing the status token, review notes, blockers, reviewed-artifact freshness data, timestamp, pipeline, persistence mode, and recovery semantics.
- Reason: OpenSpec-only and hybrid resumptions need an evidence-backed way to know whether the plan-review gate is complete and still fresh.
- Impact: Resumed SDD runs can skip redundant Oracle review only when the saved approval matches unchanged planning artifacts; otherwise they must treat the approval as stale and rerun plan-review.

The canonical artifact should preserve enough structured data for recovery logic while remaining reviewable by humans. It should be treated like other SDD artifacts: OpenSpec copy for OpenSpec/hybrid modes, deterministic thoth-mem copy for thoth-mem/hybrid modes, and no silent persistence in modes that forbid it.

## Affected Areas

- SDD phase contract metadata for `plan-review`, including whether the phase produces a durable artifact.
- Shared OpenSpec artifact conventions and thoth-mem deterministic topic-key conventions.
- `plan-reviewer` skill instructions and output/persistence expectations.
- Root/orchestrator recovery behavior when resuming a change after tasks and before apply.
- Prompt sections or harness guidance that describe the plan-review gate and user-confirmation sequence.
- Tests for SDD phase contracts, artifact persistence, stale approval handling, and recovery behavior.

## Risks

- A stale `[OKAY]` could be incorrectly reused if freshness markers are too weak or omit a reviewed artifact.
- Overly strict freshness checks could rerun Oracle too often, reducing the value of persistence.
- Divergence between OpenSpec and thoth-mem copies in hybrid mode could confuse recovery unless convergence rules are explicit.
- Adding a new canonical artifact may require updating multiple shared conventions and harness prompt surfaces consistently.
- Existing in-flight changes without the new artifact must remain recoverable without being treated as approved by default.

## Rollback Plan

If the persisted plan-review artifact causes incorrect recovery behavior, revert the phase to rerun Oracle when no fresh approval can be proven. Existing saved plan-review artifacts can remain inert historical records until the recovery logic is corrected, because the safe fallback is to require a new Oracle review rather than reuse uncertain approval.

## Success Criteria

- The SDD artifact model includes a canonical plan-review artifact and deterministic thoth-mem topic key for supported persistence modes.
- A saved `[OKAY]` can be recovered after compaction or a new session when the reviewed planning artifacts are unchanged.
- A saved approval is considered stale and is not reused after any reviewed planning artifact changes.
- Blocking statuses, blockers, comments, and non-blocking notes remain visible after recovery.
- OpenSpec-only mode has a repo-visible record of the Oracle result without relying on thoth-mem.
- Hybrid mode writes matching OpenSpec and thoth-mem content, and recovery handles divergence according to the shared persistence contract.
- Harness guidance remains consistent: capability gaps are disclosed rather than changing plan-review semantics.
