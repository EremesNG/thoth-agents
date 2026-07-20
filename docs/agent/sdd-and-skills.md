# SDD and bundled skills

## Responsibility

This route owns adaptive route classification, phase ownership, progressive
contracts, Spec Kit-grade artifacts, OpenSpec-style durable deltas, validation,
and the thoth-owned workflow bundle.

## Entrypoints

- `src/harness/core/sdd.ts`: route policies, protocols, artifact graph, and
  dispatch envelopes
- `skills/thoth-sdd/`: lazy phase references, templates, structural validator
- `skills/thoth-constitution/`: explicit governance lifecycle and validator
- `skills/thoth-archive/`: transactional durable-delta closeout
- `skills/thoth-init/`: offline, non-overwriting project bootstrap
- `skills/plan-reviewer/`: optional blocker-focused Oracle review and freshness
  template
- `src/cli/skills.ts`: canonical repositories for mandatory external skills
- [`../sdd-pipeline.md`](../sdd-pipeline.md): public workflow contract

## Invariants

- An explicit route request is the user's selection and wins. Otherwise root
  recommends Direct, Accelerated, or Full and waits for the user's choice;
  generic SDD makes Accelerated the minimum recommendation.
- Clear low-risk documentation/mechanical work may stay Direct across files.
- Accelerated fast-forwards specify/plan/tasks without routine pauses; Full uses
  phase gates for material uncertainty/risk.
- Root owns sequential coordination and loads only the current phase reference.
- Explorer owns Full discovery; oracle owns user-selected plan review and every
  final verify.
- Specifications record Why/Impact/capabilities, story-to-FR/SC coverage, named
  normative FRs with delta metadata, and buildable/outcome SC types.
- Routine plans read the constitution and record evidence; only explicit
  constitution amendments activate SemVer lifecycle validation.
- Tasks cover FRs and buildable SCs, use honest `[P]` evidence or an explicit
  no-parallel reason, and never manufacture work for outcome SCs.
- Conditional checklists record activation, the five base quality dimensions,
  applicable domain lenses, coverage, and checked or evidence-backed no-op
  revalidation.
- `ready` is the pre-implementation gate; `closeout` requires complete tasks,
  independent oracle PASS, FR/buildable-SC evidence, explicit outcome-SC
  disposition, and archive readiness.
- After `ready`, both artifact-backed routes offer `Review plan with Oracle
  (Recommended)` or `Proceed without review`. Review is optional; final verify
  remains mandatory.
- Same-intent corrections revalidate only affected downstream artifacts. New
  intent starts a new change.
- Converge is append-only and uses the missing/partial/contradicts/unrequested
  taxonomy; a no-gap result leaves tasks byte-for-byte unchanged.
- Archive transactionally syncs only declared ADDED/MODIFIED/REMOVED/RENAMED durable
  requirements after PASS. INTERNAL requirements and undeclared prose never
  update `openspec/specs/`. Handled failures roll back within the active process;
  forced process or OS termination is not crash-atomic.
- Owned contracts are bundled. External skills are installed by the CLI once;
  SDD execution remains CLI-, network-, and installer-independent.
- Delegated envelopes carry a MEMORY block with provider/project/session
  identity, `none|recall|observe`, and bounded context. This does not alter
  workspace mode or delegate root lifecycle.

Provider persistence is an overlay only. Follow the installed thoth-mem skill
for durable lessons and continuity, while `openspec/` stays canonical and phase
artifacts are never mirrored.
