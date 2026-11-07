# SDD and bundled skills

This surface owns mandatory proportional understanding, post-understanding
classification, one ID-named record for substantial work, independent judgment,
and transactional `.thoth` deltas. Read the [public pipeline guide](../sdd-pipeline.md)
for the end-to-end lifecycle.

## Entrypoints

- `src/harness/core/sdd.ts`: understanding and phase contracts, semantic scope,
  risk-aware classification, phase prerequisites, and verification decisions.
- `src/agents/prompt-sections.ts`: root SDD and bounded phase-dispatch guidance.
- `skills/thoth-sdd/`: current phase references, ID-named record template, and
  maintained readiness/verify/closeout validator.
- `skills/thoth-archive/`: transactional declared `.thoth/specs` updates and
  stable-filename archive.
- `skills/thoth-constitution/`: explicit versioned governance lifecycle.
- `skills/thoth-init/`: offline, preserving initialization of minimum `.thoth`
  governance.
- `skills/plan-reviewer/`: optional blocker-focused fresh read-only review.
- `src/harness/core/owned-skills.ts`: shared owned-skill inventory consumed by
  OpenCode, Codex, Claude Code, and Pi.
- `.thoth/constitution.md` and `.thoth/specs/`: active project governance and
  durable product contracts; `.thoth/history/openspec/` is historical only.

## Product workflow ownership

The product classifies work after proportional understanding. Before delegating
or implementing small work, root states a brief in-session plan (scope, owner,
focused verification), without a persistent record. For substantial work, root
alone creates, edits, validates, and corrects the ID-named record at every stage.
Record authorship is coordination outside the direct-work allowances, not
permission for source discovery or substantive implementation. During planning,
specialists supply context within their full role scope and never write SDD files.
Worker and Designer refuse `.thoth/changes/` writes and start implementation only
after authorization.

Plan review remains optional. When selected review returns REJECT, root repairs
the same record, reruns affected gates, and requests a fresh Oracle, repeating
until OKAY or a human-owned material blocker stops the round. Review does not
authorize implementation; the separate Implement/Stop decision remains.
Phase contracts also cover independent verification and transactional archive of
declared durable deltas. Initialization preserves existing project governance.
These behaviors are delivered by installed skills, not by this repository's
development documentation.

Owners: `src/harness/core/sdd.ts` (`classifySddChange`,
`SDD_PHASE_PROTOCOLS`, `getSddFinalVerificationDecision`),
`src/agents/prompt-sections.ts`, and `skills/thoth-sdd/` (especially
`templates/change.md` and `scripts/validate.mjs`). Review, archive, init, and
constitution behavior live in their respective skill trees listed above.
Tests: `src/harness/core/sdd.test.ts`, `src/harness/core/sdd-protocol.test.ts`,
and `src/harness/sdd-*.test.ts`.

The change template models independently acceptable outcomes and their input,
write, interface, and verification boundaries. For example, parser and installer
investigations can yield independent evidence, while an investigation connecting
the two consumes both results. A service contract and a UI using it can likewise
form producer/consumer outcomes. Task shaping is owned by
`src/harness/core/agent-pack.ts` and the change template, rather than this guide.

## Verification

For changed SDD contracts or skills, select relevant `src/harness/core/sdd*.test.ts`,
`src/harness/sdd-*.test.ts`, and prompt/adapter/bundle/CLI initialization tests.
Apply the repository-specific [local-closeout gate](testing.md#local-closeout-gate)
for touched-area typechecks/tests, repository checks, and conditional build or
release-tooling tests; the full suite is the post-push/PR CI safety net, not a
local blocker. Tests show rendered guidance and structural behavior, not automatic
model compliance or provenance of claimed independent review.

## REJECT and FAIL repair ownership

Plan review OKAY/REJECT judges the record; root repairs REJECT. Final verification PASS/FAIL judges the implementation.

Root records remaining acceptance-linked work in the substantial record when one exists, otherwise in the brief in-session small plan; the owning Worker or Designer repairs each affected surface; root coordinates and does not repair implementation unless the user explicitly instructs direct work; even then, never self-approve and report unavailable independent review.

Repeat independent verification as the change's verification level requires; substantial or materially risky work uses a fresh Oracle. Material changes in intent, scope or risk reopen understanding and planning before further implementation.
