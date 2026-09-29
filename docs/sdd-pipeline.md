# Proportional SDD pipeline

Every change begins with three proportional understanding steps, in order:

1. **Explore** enough repository and user context to establish current behavior,
   constraints, and uncertainty.
2. **Specify** the intended outcome, non-goals, and observable acceptance in
   concise working notes.
3. **Clarify** material uncertainty using evidence or a safe bounded assumption;
   ask only when a human-owned decision cannot safely be inferred.

These steps are mandatory, but they do not force saved documents, specialist
agents, or interviews. Resolve repository facts through inspection before asking.
An unresolved material decision blocks classification and implementation.

Whenever the orchestrator asks a choice question with a meaningful recommended
action, it states that recommendation. Track confirmed answerless native returns
per question: after the first and second, repeat the same question without
starting dependent work; after the third, select the recommendation. Explicit
answers and `Stop` win. Pending, unavailable, failed, interrupted, or
host-prohibited attempts do not count; report higher-priority host limits without
claiming unmade attempts or an explicit user choice. Never fabricate requested
facts or secrets. For unresolved human-owned intent, recommend safe deferral so
the decision remains open.

## Classify after understanding

Only after the three steps are complete does the root orchestrator classify by
meaningful scope and coordination, uncertainty, and risk/failure cost. File count
alone does not increase scope: a clear, low-risk localized mechanical change may
touch several files and remain small. Coordinated multi-area work, cross-cutting
contract changes, material uncertainty, or elevated risk require substantial
planning. A small patch can still be substantial when its risk warrants it. Scope
or risk that grows during implementation reopens understanding and
classification before work expands.

- **Small:** clear, localized, low-risk work. Use test-first implementation and
  focused verification. Create no persistent change record.
- **Substantial:** work with coordinated or cross-cutting impact, material
  uncertainty, or elevated risk. Plan and track it in one record after
  classification.

## One substantial-change record

The sole record is `.thoth/changes/<id>/<id>.md`, with a safe lowercase
kebab-case ID. It contains grounded exploration, intent, non-goals, acceptance,
clarifications, decisions, declared durable deltas, plan, tasks, authorization,
verification, and closeout. Do not create a `change.md` alias, a second planning
narrative, sidecar specifications, reports, evidence directories, worker
packets, scripts, execution wrappers, or evidence generators, even temporarily.

Substantial work uses plan and tasks. Checklist and convergence are conditional
when useful; verification is always required. At ready, always offer
`Review plan with Oracle (Recommended)` or `Proceed without review`, even when
implementation was already authorized. Silence is never an explicit skip; only
a selected review runs. After a selected `[OKAY]`, separately offer
`Implement (Recommended)` / `Stop`; prior explicit authorization remains valid,
while an explicit later `Stop` supersedes it. Record plan-review selection
as `EXPLICIT_REVIEW`, `EXPLICIT_SKIP`, or `DEFAULT_REVIEW_AFTER_3`: `SKIPPED`
requires explicit skip, and `OKAY` requires an explicit review or the third-return
review default; the initial `PENDING` provenance placeholder is valid before
closeout only. A review result never authorizes implementation. Repair
same-intent blockers with a fresh review; material intent changes require new
clarification. A safe deferral recommendation never resolves material
human-owned intent.

## Verification and archive

Small low-risk work receives focused verification. Substantial or materially
risky work requires a fresh independent Oracle judgment against accepted intent,
the actual diff, executed checks, and residual risks; an implementation writer
never approves their own work. Archive only after passing verification and
complete closeout. Transactionally apply only declared exact-title durable
deltas to `.thoth/specs/<capability>/spec.md`, and move the same record to
`.thoth/changes/archive/YYYY-MM-DD-<id>/<id>.md`. The filename remains stable;
the date appears only in the directory. Historical records remain preserved.
Unsafe IDs, collisions, and symlinked ancestors fail closed.

## Ownership and native execution

Root owns user intent, classification, material decisions, semantic acceptance,
and synthesis. Specialists are selected by task shape, never mechanically:
Explorer handles uncertain local discovery, Librarian external evidence,
Designer material UI/UX, Worker bounded nonvisual implementation, and Oracle
independent judgment. Keep one writer per mutable surface. Native harness
lifecycle and terminal evidence remain authoritative; Thoth supplies no
scheduler, lifecycle mirror, or per-change execution tooling.

Root retains known low-risk mechanical work, including reviewed commits, without
restarting discovery. Explicit direct-work or no-delegation instructions win;
another search or file count does not force delegation. Preserve operator-selected
model and effort, including max. If independent review is prohibited, disclose the
limitation and do not claim independent PASS or archive.

Each assignment needs one independently checkable outcome, exact known source and
skill paths, focused checks, and a return/stop condition. Root responds to native
attention or a missed agreed milestone by inspecting progress and steering,
narrowing, or stopping safely. Two consecutive attempts without new evidence or
progress require a partial result, not another loop. A timeout is not a progress
plan. Use native notifications/waits, not polling or custom timers.

Freeze relevant inputs before final validation, reuse fresh checks for unchanged
inputs, and reconcile background commands before returning. Late notifications
must preserve the substantive handoff. See the [implementation phase](../skills/thoth-sdd/references/phases/implement.md)
for the bounded execution procedure. These safeguards are instructions, not a
runtime guarantee of latency or model compliance.

Use the installed bundled skills and existing project commands. Routine work
reads `.thoth/constitution.md`; active durable specifications live under
`.thoth/specs/`. `thoth-init` preserves existing governance and creates only
missing minimum `.thoth/` paths. Historical `.thoth/history/openspec/` content is
not active workflow state. Missing installed contracts are reported as
installation drift; SDD execution does not install skills, invoke the product
CLI, or access the network.
