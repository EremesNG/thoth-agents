# Implementation Plan: Integrate thoth-mem into the thoth-agents workflow

## Technical context

The current CLI completes each harness installation after thoth-agents-owned setup and mandatory external skills, but never invokes thoth-mem's public setup command. Existing prompts state only that provider guidance is external, couple durable-observation authority to workspace write capability, and omit memory identity and authorization from the canonical dispatch envelope. The change spans `src/cli/`, shared prompt and SDD contracts, generated plugin assets, provider-boundary tests, and public/routed documentation. thoth-mem remains the sole owner of setup mutations, hooks, MCP, skill, lifecycle, receipts, persistence, and recovery.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The root is implementing a clear cross-cutting contract directly; independent oracle verification remains required after implementation and no parallel writer is introduced.
- **Explicit role boundaries**: PASS — Workspace read-only roles remain unable to mutate files; a separate dispatch-scoped provider observation authorization does not grant workspace writes or root lifecycle ownership.
- **Proportional Spec Kit-compatible SDD**: PASS — This multi-surface, moderate-risk behavior change uses Accelerated fast-forward artifacts and will archive only after oracle PASS.
- **Truthful multi-harness contracts**: PASS — Installation may use `npx`; SDD runtime stays CLI/network independent, and all three harnesses share one provider-setup and memory-dispatch contract while retaining truthful enforcement diagnostics.
- **Independent provider ownership**: PASS — thoth-agents invokes only the documented thoth-mem administrative surface and parses its evidence; it neither writes provider targets nor embeds provider lifecycle protocol.
- **Evidence-led completion**: PASS — Unit/contract tests cover commands, statuses, prompts, dispatch, boundaries, generated output, and docs before full validation and independent oracle review.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add a shared setup adapter that builds and executes the official global `npx -y thoth-mem@latest setup` command, maps Claude to `claude`, appends `--plan` for dry-run, and is called last by every harness installation. | `src/cli/thoth-mem-install.ts`, `src/cli/install.ts` | Command-construction tests and branch-level install orchestration tests. |
| FR-002 | Validate the complete JSON envelope and exit/status agreement; return a typed result that preserves bounded diagnostics, manual actions, receipt, and process evidence. Only `complete` is successful. | `src/cli/thoth-mem-install.ts` | Complete, failed, partial, requires-action, malformed, spawn-error, and contradictory-evidence tests. |
| FR-003 | Keep setup as an external command with no force/reset propagation; extend closed provider-boundary coverage to include the setup adapter while continuing to reject provider assets and `mem_*` protocols. | `src/harness/provider-boundary.test.ts`, provider setup module | Boundary test plus exact absence of `--force`, rollback, and provider file mutation. |
| FR-004 | Add a compact root memory section naming the installed thoth-mem skill and bounded triggers for recall, durable lessons, verified compaction, semantic summary, and truthful degradation. | `src/agents/prompt-sections.ts`, generated `plugin/agents/` and Codex root artifacts | Prompt rendering and generated-package tests; no `mem_*` sequences. |
| FR-005 | Define `none | recall | observe` dispatch authorization independently of workspace role mode; render provider, project, stable root session ID or unavailable, and bounded context in every canonical envelope. Children never own root lifecycle. | `src/harness/core/memory-governance.ts`, `src/harness/core/sdd.ts`, `src/agents/prompt-sections.ts`, adapters | Governance, SDD envelope, and cross-harness prompt tests. |
| FR-006 | Replace provider-backed SDD namespace/mirroring language with explicit `openspec/` canonicality and provider use only for durable lessons and continuity under installed guidance. | memory governance, prompts, SDD and memory docs | Contract assertions and provider-boundary scan. |
| FR-007 | Document the mandatory combined install flow, dry-run plan, non-complete statuses, receipt/manual action output, and ownership/runtime limitations. | `README.md`, `docs/installation.md`, `docs/skills-and-mcps.md`, `docs/quick-reference.md`, harness docs, routed agent docs | Documentation assertions and closed provider-boundary manifest. |

### Installation interface

The setup adapter accepts only a supported harness, dry-run flag, and injected command executor. It executes from the current process without inheriting stdio so JSON remains parseable. The result exposes the authoritative provider status, changed flag, steps, diagnostics, manual actions, receipt, and a success boolean derived from consistent status/exit evidence. thoth-agents prints this evidence and stops with a nonzero code for every non-complete or unparseable result. `--reset` is never translated to provider `--force`.

### Runtime memory interface

The orchestration contract names thoth-mem but contains no provider tool sequence. Root decides when the installed skill is needed and owns root session lifecycle and real-user-intent capture. A dispatch MEMORY block carries `provider`, `project`, `root_session_id`, `authorization`, and bounded `context`. `none` forbids provider work, `recall` allows bounded reads, and `observe` additionally permits a durable observation under the delegated scope. None of these grants workspace mutation or root lifecycle. Missing stable identity is rendered as `unavailable`, never synthesized.

### SDD persistence boundary

`openspec/` remains the sole canonical store for SDD artifacts and durable specification deltas. thoth-mem may preserve durable decisions, root causes, conventions, discoveries, and semantic continuity under its installed skill, but routine phase artifacts are not mirrored into provider memory.

## Optional support artifacts

- `research.md`: Not needed; the local thoth-mem README and exported setup types define the complete command and result contract.
- `data-model.md`: Not needed; the small setup and dispatch types are defined alongside their owning code.
- `contracts/`: Not needed; no network service or new external schema is owned by thoth-agents.
- `quickstart.md`: Not needed; existing installation and quick-reference guides are the public operator surfaces.

## Risks and migrations

- `npx` warnings could contaminate output: parse only stdout as the promised JSON channel and bound stderr in failures; reject ambiguous evidence rather than guessing.
- An exit code/status mismatch could create false success: require the documented mapping in both directions.
- Provider setup may require manual action: retain receipt and every bounded manual action, return nonzero, and avoid automatic force or rollback.
- Root prompt growth could undermine the agile goal: add one compact memory section, remove obsolete generic/mirroring wording, and preserve the existing prompt-size budget.
- Static role permissions could accidentally block oracle/explorer observations or grant file writes: model memory authorization only in dispatch and assert workspace mode remains unchanged.
- Generated plugin assets can drift: regenerate through the canonical build generator and verify the shared bundle rather than editing generated files manually.
- Rollback consists of reverting thoth-agents code/docs; independently installed thoth-mem state is not removed or rolled back by this project.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — One root writer owns all overlapping surfaces, with the established oracle-only verification gate retained.
- **Explicit role boundaries**: PASS — Memory authorization is explicitly orthogonal to workspace mutation and cannot transfer root lifecycle ownership.
- **Proportional Spec Kit-compatible SDD**: PASS — The design uses the Accelerated minimum artifacts, no optional ceremony, structural ready/closeout gates, and archive after independent PASS.
- **Truthful multi-harness contracts**: PASS — One shared setup adapter and dispatch contract cover OpenCode, Codex, and Claude while installation/runtime boundaries remain explicit.
- **Independent provider ownership**: PASS — All provider mutation and recovery remain behind thoth-mem's documented CLI and installed skill; thoth-agents consumes only confirmed outcomes.
- **Evidence-led completion**: PASS — Every functional requirement maps to executable tests or closed documentation/boundary assertions before full repository checks.
