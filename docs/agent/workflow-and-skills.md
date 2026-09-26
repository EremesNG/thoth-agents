# Work contracts and bundled skills

This route owns the AI-first persisted agreement, selective context, recovery
and independently verified closeout. Read only the reference for the current
operation, not every workflow document.

## Entrypoints

- `src/harness/core/workflow.ts`: direct/persisted policy and dispatch envelopes
- `skills/thoth-work/`: schema, offline validation, fingerprints, context and checkpoints
- `skills/thoth-init/`: offline initialization of minimum `.thoth/` governance
- `skills/thoth-archive/`: declared durable updates and verified archive
- `skills/thoth-constitution/`: explicit versioned governance amendments
- `skills/plan-reviewer/`: optional blocker-focused independent review
- [Public workflow guide](../workflow.md): lifecycle and limits

## Invariants

- `.thoth/changes/<id>/work.yaml` is canonical. Supporting context, external
  unit definitions and evidence are conditional; do not duplicate requirements.
- Human agreement settles product scope, acceptance and autonomy. Existing
  authorization persists once the applicable planning choices are resolved;
  routine technical replanning within it does not need repeated approval.
- For a ready plan, offer Oracle review (recommended) or direct implementation.
  After [OKAY], offer implementation (recommended) or stopping. Each question
  defaults only after three confirmed unanswered native returns. Explicit answers
  win; pending dialogs, unavailable tools/UI, failures and interruption never count.
  Follow [planning choices and recovery](../../skills/thoth-work/references/planning.md)
  for native restrictions, compact evidence and exclusions. These defaults never
  select a pipeline or resolve other material decisions or sensitive permissions.
- Root owns contract and accepted state. Specialists own one assigned mutable
  product surface and their own per-unit checkpoint; read-only roles never write.
- Validate concrete dependencies and acceptance coverage before dispatch.
  Dispatch all admitted independent ready work before waiting, refill capacity,
  and release each consumer after its own fresh accepted prerequisites.
- Native status, wait, cancellation and terminal results remain authoritative.
  No checkpoint, timeout or silence demonstrates a native writer has stopped.
- Recovery loads the agreement, relevant checkpoint, owned changes and changed
  dependency inputs. Preserve partial/preexisting work; reject stale evidence.
  Unknown liveness blocks only conflicting surfaces, never unrelated ready work.
- Independent final Oracle review examines actual agreement, diff and evidence.
  Root records acceptance and closes only after fresh PASS and no unresolved
  blocking finding. Structural validation is not semantic approval.
- Archive preflights explicit durable updates under `.thoth/specs/`. Unrelated
  specifications and historical records are preserved.
- Bundled tools run offline without CLI installation or external downloads.
  Provider memory remains independently owned; never mirror work artifacts.

## Verification

Start with `src/harness/work-contract.test.ts`, `work-context.test.ts`,
`work-recovery.test.ts`, and `work-archive.test.ts`; add workflow/prompt and
bundle tests for corresponding contract changes. Check the public guide's limits
before claiming native behavior, crash durability or efficiency improvements.
