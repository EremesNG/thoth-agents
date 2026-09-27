# Agent operating guide

## Repository purpose

**thoth-agents** is an adaptive multi-harness orchestration plugin. It provides
six roles, native OpenCode and Pi delegation, Codex and Claude Code surfaces,
provider-neutral memory boundaries, and AI-first work contracts.
OpenCode is the stable default path; each harness has different guarantees.

For task-specific knowledge, start with [`docs/agent/index.md`](docs/agent/index.md).
Keep `docs/agent/` documents on demand at startup.

## Progressive context protocol

1. Classify the task by behavior and domain.
2. Consult the router before any CodeGraph fallback or before opening broad
   repository areas.
3. Search cited names, paths, symbols, imports, registrations, and tests first.
4. Read the smallest entrypoints and tests that answer the current question.
5. Add another route or overlay only to resolve a concrete question.
6. Do not explore `node_modules/`, `dist/`, coverage, generated fixtures, or
   third-party code unless the task names them or evidence requires it.
7. Subagents must return summarized evidence, not full files or logs.

## Preferred navigation tools

- When `.codegraph/` exists, every agent must use CodeGraph before
  `webstorm-index`, native search or file reads, or delegating source-code
  discovery. Prefer the `codegraph_explore` MCP tool; if it is not exposed, use
  `codegraph explore "<question or symbol names>"` from the repository root.
- Ask CodeGraph about the behavior, flow, file, or symbols in one focused query.
  Treat returned source as already read and current: do not re-read it or verify
  it with grep. If source was deferred, query again with the named file or symbol.
- CodeGraph auto-syncs. Follow any staleness banner after edits; use direct reads
  only for the files it identifies instead of manually re-checking all results.
- Fall back only when CodeGraph is unavailable, errors, lacks the required
  capability or file type, or returns incomplete evidence after a focused retry.
  Before using any fallback, consult [`docs/agent/index.md`](docs/agent/index.md)
  and load the smallest matching route or overlay.
- After routing, use `webstorm-index` when it is available and suitable;
  otherwise use the least invasive native tool such as `rg`, `rg --files`, or a
  targeted file read. Never turn a fallback into broad repository exploration.
- Use `webstorm-index` only for this `thoth-agents` repository. Never use it to
  navigate or modify any other project.

## High-level map

- `src/index.ts`: entrypoint and composition of the OpenCode plugin.
- `src/agents/`: roles, prompts, permissions, and model resolution.
- `src/harness/`: contracts, adapters, and writers for each harness.
- `src/cli/`: parser, commands, installation, configuration, and TUI.
- `src/hooks/`, `src/mcp/`, `src/tools/`: runtime integrations. Provider-owned
  memory setup and lifecycle are external and are not bundled here.
- `src/harness/core/workflow.ts`: work agreement, phase, and delegation contracts.
- `skills/`: canonical thoth-owned workflow skills for every harness.
- `src/cli/skills.ts`: mandatory external-skill installation via `npx skills add`.
- `src/cli/thoth-mem-install.ts`: bounded invocation and evidence parsing for
  provider-owned thoth-mem setup.
- `docs/agent/`: router and on-demand operational context.

## Environment and verified commands

- Runtime: Node `>=22.19`.
- Package manager: `pnpm@11.2.2`.
- Install: `pnpm install`.
- Local development: `pnpm run dev`.
- Build: `pnpm run build`.
- Tests: `pnpm test`.
- Lint: `pnpm run lint`.
- Write-formatting: `pnpm run format`.
- Typecheck: `pnpm run typecheck`.
- Biome check without writing: `pnpm run check:ci`.

`pnpm run build` already generates TypeScript declarations; do not invent a
separate command unless the repository adds one. Vitest uses the Node environment
and discovers `src/**/*.test.ts` and `src/**/*.test.tsx`.

## Global constraints

- Use TypeScript and modern Node patterns consistent with the existing code.
- Keep changes explicit and limited to the requested behavior. Preserve unrelated
  edits; never revert work you did not make. Ignore backward compatibility.
- Small bounded low-risk work can proceed directly to implementation and checks.
  For substantive or resumable work, persist the approved agreement in
  `.thoth/changes/<id>/work.yaml`. Root owns the agreement, units and acceptance;
  optional context, external units and evidence exist only when useful.
- Honor authorization and resolved choices. For a ready persisted plan, offer
  Oracle review (recommended) or direct implementation; after [OKAY], offer
  implementation (recommended) or stopping. Each choice has at most three native
  unanswered returns before its default applies. Explicit answers and Stop win;
  pending/unavailable/failed questions do not count. Preserve choices and budgets
  on resume. See the [workflow route](docs/agent/workflow-and-skills.md).
  Do not ask for a pipeline or apply these defaults to other unresolved decisions,
  secrets or sensitive actions.
- Before retaining or delegating work, map concrete output dependencies, owned
  writes, read assumptions, shared resources and verification. List order is not
  a dependency. Dispatch all independent admitted ready work before waiting,
  refill native capacity and release each consumer after its own fresh accepted
  dependencies; avoid global wave barriers.
- Delegate only for net gain. Root, designer or worker may implement.
  Prefer root continuity for short work or one ordered reasoning chain with
  accumulated context. Choose explorer for uncertain local discovery, librarian
  for authoritative external facts, oracle for independent judgment, designer
  for material UI/UX, and worker for implementation, including coupled/high-risk
  work. Route name and file count do not determine ownership.
- Keep delegation depth one, one writer per mutable surface, and fresh specialist
  sessions at work boundaries. Children never delegate. New Oracle judgments
  always use a fresh read-only reviewer. A writer never approves its own work.
- Native harness tools own dispatch, status, wait, cancellation, terminal results
  and capacity. Thoth supplies policies and bounded evidence, never a scheduler,
  job database, lifecycle mirror or tracing runtime. Report unavailable native
  capabilities truthfully. Worktree automation remains outside this workflow.
- For resume, load the contract and relevant checkpoint, inspect current owned
  files and changed dependencies, and reconcile native liveness before another
  writer starts. Preserve useful partial/preexisting edits. A checkpoint, timeout
  or silence never proves termination. Unknown liveness blocks only conflicts.
- Use installed TDD for behavior changes and simplify after implementation. Use
  progressive-context-router for repository instruction work; architectural-
  grilling only for explicit interviews or unresolved material human decisions.
  Workflow execution uses local installed contracts, never CLI installation or
  downloads. QA executables remain project-owned.
- Final verification is mandatory. Persisted or materially risky work needs a
  fresh read-only Oracle against agreement, actual diff and evidence. Optional
  plan review never substitutes for final verification. Root records results and
  archives only fresh passing work and explicitly declared durable updates.
- `.thoth/constitution.md` contains project principles; `.thoth/specs/` contains
  durable product contracts. Historical OpenSpec records are not active context.
- thoth-mem independently owns provider persistence, hooks, MCP and lifecycle.
  Follow its installed guidance; never mirror work contracts/checkpoints. Root
  owns verified identity, lifecycle and real-user intent. Delegated authorization
  is none, recall or observe, independent of workspace permission.
- Published installs require consistent provider complete evidence. Never turn
  reset into provider force/rollback. Local Pi installation leaves thoth-mem to
  its separate installer. Preserve unrelated provider assets.
- Omit autoResolutionMs entirely from request_user_input. Some harness controls
  are instruction-only; do not claim enforcement or ignore those boundaries.

## Change and verification flow

1. Confirm the agreement and reuse existing authorization.
2. Read public contracts and relevant tests before editing; select bounded units.
3. Resolve the two applicable planning choices, then implement within ownership,
   keeping useful checkpoints for recovery.
4. Run focused checks, then verification proportional to risk.
5. Review the diff for unrelated changes, generated drift and accidental secrets.
6. Update routed documentation for durable facts and independently verify.

The current `.github/workflows/ci.yml` installs with
`pnpm install --frozen-lockfile` and runs `pnpm run check:ci`,
`pnpm run typecheck`, and `pnpm test` on Node `22.19`/pnpm `11.2.2`; it does not
run the build. The release workflow waits for that CI and then runs
`pnpm run build` and the focused test for the built runtime. For large changes
and before a PR, keep this applicable local pre-merge order:
`pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`.

## Pull requests and sharp edges

- The PR template expects clear `Summary` and `Changes` sections.
- Explain what changed, why, and any risks or follow-up.
- The OpenCode plugin entrypoint is not a shell command.
- Codex installation remains subject to native trust and policy. The CLI invokes
  the official marketplace/plugin manager commands, then manages
  `~/.codex/agents/`, `~/.codex/AGENTS.md`, and global config because the plugin
  manifest cannot install those surfaces. `$thoth-init` initializes project work
  governance only.
- Do not assume capability or enforcement equivalence across harnesses.

## Subagent return contract

Return the conclusion, inspected paths and symbols, relevant tests or commands,
open questions, risks, and the recommended next action. Do not return full logs,
whole files, or unfiltered search transcripts.

## Definition of done

- The requested result is complete and in scope.
- Relevant checks pass or their failures are reported with evidence.
- Public contracts, work/memory governance, and harness differences are preserved.
- The diff contains no unrelated, generated, or secret changes.
- Any unrun validation and remaining uncertainty are declared.
