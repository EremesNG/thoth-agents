# Agents and delegation

## Responsibility

This route owns the seven roles, their prompts, permissions, models, variants,
and dispatch/return contract. It does not own harness-specific serialization or
the installer's interactive flow.

## Signals and entrypoints

- Signals: `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`, `quick`,
  `deep`, prompt, permission, model fallback, delegation.
- `src/agents/index.ts:createAgents` builds definitions and applies overrides.
- `src/agents/prompt-dialects.ts` models invocation differences by harness.
- `src/config/loader.ts` and `src/config/schema.ts` own config loading and shape.
- Search `src/delegation/` before citing symbols: the router does not assume one.

## Invariants and risks

- The canonical roster has seven roles; renaming one affects prompts, config,
  adapters, writers, docs, and tests.
- Read-only/write-capable modes and permissions are part of the contract; do not
  assume every harness enforces them at runtime.
- `orchestrator` coordinates; UI/UX belongs to `designer`; mechanical changes to
  `quick`; logic with correctness risk to `deep`.
- Plugin defaults must let user overrides win wherever the contract permits.
- Provider-dependent continuity is an outcome-level handoff (resumable summary
  or checkpoint), never permanent session closure or a consumer lifecycle
  protocol.
- A wording change requires reviewing prompt snapshots or rendering tests, not
  only the role source file.

## Dependencies and overlays

- Load [`harness-packaging.md`](harness-packaging.md) if how the contract is
  emitted for Codex, Claude Code, or OpenCode changes.
- Load [`memory-governance.md`](memory-governance.md) if which memory operation a
  role can execute changes.
- Load [`sdd-and-skills.md`](sdd-and-skills.md) if the phase ownership matrix
  changes.

## Tests and verification

- Primary tests: `src/agents/index.test.ts`,
  `src/agents/prompt-dialects.test.ts`, `src/agents/prompt-rendering.test.ts`,
  and `src/config/**/*.test.ts`.
- Add `src/harness/` tests when generated output changes.
- Consult [`testing.md`](testing.md) for commands and proportional scope.

## Common mistakes

- Updating a role list without checking registries and writers causes drift.
- Treating permission guidance as guaranteed enforcement hides limitations.
- Duplicating prompts per harness breaks the canonical source; use dialects/adapters.

## Evidence and uncertainty

- Verified in `src/agents/index.ts`, `src/config/`, and the cited tests.
- The concrete responsibility of any file in `src/delegation/` must be confirmed
  by search before editing it.
