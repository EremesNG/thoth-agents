# Persistent memory governance

## Responsibility

This route owns the `thoth-mem` client, MCP, and hook, session lifecycle,
recovery, scopes, topic keys, and separation of root-owned operations from
delegated permissions.

## Signals and entrypoints

- Signals: `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`,
  `mem_session`, session summary, prompt ownership, `sdd/*`.
- `src/harness/core/memory-governance.ts` defines tools, operations, and rules.
- `src/mcp/thoth.ts` registers the server; `src/thoth/client.ts` is the client.
- `src/hooks/thoth-mem/` integrates host events and lifecycle.

## Invariants and risks

- `mem_session(start|checkpoint|summary)` and
  `mem_save(prompt|session_summary)` are root/orchestrator-owned operations.
- A subagent needs `session_id`, `project`, and explicit permission before
  reading project memory.
- The recovery funnel is `mem_recall(mode="compact")` ->
  `mem_recall(mode="context")` -> `mem_get(...)`.
- A read-only subagent does not write durable memory; a write-capable subagent
  only saves observations within delegated permission.
- The `sdd/*` namespace is protected and uses deterministic topic keys when the
  selected persistence includes `thoth-mem`.
- When a harness cannot enforce a rule, report `instruction-only`; do not hide
  the gap or invent a guarantee.
- Never save generated subagent prompts as user intent.

## Dependencies and overlays

- Load [`sdd-and-skills.md`](sdd-and-skills.md) for SDD artifacts/topic keys.
- Load [`runtime-integrations.md`](runtime-integrations.md) for OpenCode hook
  events or MCP registration.
- Load [`harness-packaging.md`](harness-packaging.md) for capabilities by harness.

## Tests and verification

- `src/harness/core/memory-governance.test.ts` fixes ownership and diagnostics.
- `src/hooks/thoth-mem/index.test.ts` fixes hook integration.
- `src/thoth/client.test.ts` fixes the client.
- `src/mcp/index.test.ts` covers MCP registration/disablement.
- Generated wording changes may require adapter/writer tests.

## Common mistakes

- Using `turn_id` as a stable session identity breaks continuity.
- Jumping directly to `mem_get` removes progressive evidence filtering.
- Treating silence, timeout, or an indeterminate call as success advances the
  lifecycle without confirmation.
- Mixing memory ownership with SDD progress ownership creates duplicate sources.

## Evidence and uncertainty

- Verified in `src/harness/core/memory-governance.ts`, the client, MCP, hook, and
  tests.
- Enforcement strength depends on the harness; retain diagnostics until a
  capability is proven `supported`.
