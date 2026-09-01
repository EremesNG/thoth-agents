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
- `skills/thoth-init/`: offline, preflighted synchronization of minimum project
  `openspec/` governance only
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
- Every route verifies. Trivial deterministic Direct work uses focused root
  checks; materially risky Direct work and every Accelerated or Full final verify
  use a fresh read-only Oracle. Explorer owns broad or uncertain Full discovery,
  while user-selected plan review remains optional.
- Task shaping precedes implementation: distinguish a concrete artifact/decision
  dependency from mere ordering preference, mark input-ready lanes ready and
  upstream-dependent lanes blocked, and preserve one writer per mutable surface.
  Dispatch all ready conflict-free lanes in a native wave before waiting; join
  only terminal native results, then release dependent lanes.
- Semantic routing keeps the complete roster usable: `librarian` researches
  current or externally sourced facts, `designer` owns material UI/UX,
  interaction, accessibility, or visual quality, and `quick` owns known narrow
  low-risk isolated edits. Escalate coupled or high-risk work to `deep`; stable
  local facts do not trigger `librarian`.
- Specifications record Why/Impact/capabilities, story-to-FR/SC coverage, named
  normative FRs with delta metadata, and buildable/outcome SC types.
- Routine plans read the constitution and record evidence; only explicit
  constitution amendments activate SemVer lifecycle validation.
- Tasks cover FRs and buildable SCs, use honest `[P]` evidence or an explicit
  no-parallel reason, and never manufacture work for outcome SCs.
- SDD parallelism has three coordination levels: a granular `T###` task is one
  independently verifiable unit; an ordered writer-owned lane is a bounded
  sequence of tasks and their exact path union; and an independent parallel
  group is two or more lanes that can fan out before a shared barrier.
- `[P]` marks group/lane eligibility, not a universal concurrency guarantee.
  The root admits lanes only while native capacity and capability permit it,
  dispatches every admitted lane before waiting, refills released capacity
  before another wait, and releases the declared barrier only after terminal,
  validated evidence from every lane.
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
- Owned contracts are bundled. OpenCode's CLI installs them globally; Codex and
  Claude discover them from their plugin bundle. External skills are installed
  by the CLI once. Phase contracts resolve templates and validators relative to
  the installed `thoth-sdd` skill. `thoth-init` manages only the minimum
  `openspec/` governance graph, constitution, and metadata; SDD execution remains
  CLI-, network-, and installer-independent.
- Delegated envelopes carry a MEMORY block with provider/project/session
  identity, `none|recall|observe`, and bounded context. This does not alter
  workspace mode or delegate root lifecycle.

Native harness execution and lifecycle remain authoritative for dispatch,
capacity, status/wait, steering, cancellation, and terminal results. A missing
or unproven native primitive is reported and handled with a truthful sequential
fallback; capacity/capability gaps are reported truthfully. Native handles and
results are retained as provided. There is no Thoth scheduler, queue, database,
universal worktree, synthetic wait API, or portable `wait_all` runtime.

Provider persistence is an overlay only. Follow the installed thoth-mem skill
for durable lessons and continuity, while `openspec/` stays canonical and phase
artifacts are never mirrored.
