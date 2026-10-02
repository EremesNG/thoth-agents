# Agent operating guide

## Repository purpose

**thoth-agents** is an adaptive multi-harness orchestration plugin. It provides
six roles, native OpenCode and Pi delegation, Codex and Claude Code surfaces,
provider-neutral memory boundaries, and proportional AI-first SDD governance.
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

- Root may dispatch unknown local discovery to Explorer without preliminary
  CodeGraph queries, native search, or file reads. This dispatch exemption does
  not permit root discovery.
- When `.codegraph/` exists, the assigned investigator must use CodeGraph before
  source-code discovery through `webstorm-index`, native search, or file reads.
  Prefer the `codegraph_explore` MCP tool; if it is not exposed, use `codegraph
  explore "<question or symbol names>"` from the repository root.
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
- `src/harness/core/sdd.ts`: proportional classification, phases, and record contracts.
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
- Every change completes proportional explore -> specify -> clarify before
  classification; these steps do not force a document, specialist, or interview.
  Investigate repository facts before asking, and leave unresolved material
  human-owned choices blocked. Only then classify by meaningful coordination and
  contract impact, uncertainty, and risk/failure cost. File count alone does not
  increase scope: a clear, low-risk localized mechanical change may touch several
  files and remain small. Increased scope or risk reopens understanding and
  classification.
- Small work uses test-first implementation and focused verification with no
  persistent record. Substantial work plans in the sole
  `.thoth/changes/<id>/<id>.md` record after classification; risk may require
  planning even for a patch-sized change. No alias, duplicate record, report,
  evidence directory, process tool, or execution wrapper is created. See the
  [SDD guide](docs/agent/sdd-and-skills.md).
- At substantial `ready`, always offer `Review plan with Oracle (Recommended)` or
  `Proceed without review`, even when implementation was already authorized.
  Silence is never an explicit skip. After `[OKAY]`, preserve the separate
  `Implement (Recommended)` / `Stop` choice; prior explicit authorization
  remains valid and a later explicit `Stop` supersedes it. Review alone does not
  authorize implementation or replace final verification.
- Every orchestrator choice with a meaningful recommended action must state that
  recommendation. Count confirmed answerless native returns separately for each
  question: after the first and second, repeat the same question and do no
  dependent work; after the third, select the recommendation. Explicit answers
  win and explicit `Stop` always wins. Pending, unavailable, failed, interrupted,
  or host-prohibited question attempts do not count. Report higher-priority host
  limits accurately; never claim three returns or an explicit user choice when
  they did not occur. Never fabricate missing facts or secrets; when the
  unresolved decision is human-owned, recommend a safe deferral that leaves it
  unresolved rather than choosing it for the user.
- At closeout, plan-review provenance distinguishes `EXPLICIT_REVIEW`,
  `EXPLICIT_SKIP`, and `DEFAULT_REVIEW_AFTER_3`. `SKIPPED` requires
  `EXPLICIT_SKIP`; `OKAY` requires `EXPLICIT_REVIEW` or
  `DEFAULT_REVIEW_AFTER_3`. Review approval does not replace final verification.
- Shape each retained or delegated unit across discovery, research, planning,
  implementation and verification around one independently acceptable outcome,
  accepted upstream inputs, output, owned writes/interface, a focused check with
  pass evidence, and a return/stop condition. Split separate outcomes; keep
  cohesive tiny work together. List order is not a dependency. Before retaining or delegating, check
  read assumptions, shared resources and concrete output dependencies. Dispatch all
  independent admitted ready work before waiting within proven native capacity;
  release consumers after their fresh accepted dependencies, with no global wave barrier.
- Specialists perform discovery, external research and substantive implementation by default.
- Use Librarian for external evidence and Oracle for independent judgment; no fixed all-role pipeline.
- Root directs and accepts work and retains known low-risk mechanical work,
  including reviewed commits. Root may answer one bounded question about a known
  source. Unless the user directs root-owned investigation, unknown local source, flow, or responsibility
  goes to Explorer before root code search/read. The experimental direct-source allowance is at most two
  fragments and about 200 code lines per user request, cumulatively across files,
  tools and subtasks; a new discovery path or exhausted allowance sends missing
  evidence to a specialist. Required instructions and pertinent coordination
  artifacts are excluded, never as a source/log dump. This is prompt guidance,
  not runtime enforcement. Full custom `orchestrator.prompt` replacement remains
  supported and may omit bundled defaults. Preserve explicit user ownership and
  do not duplicate delegated discovery. Known bounded implementation goes to
  designer or worker; external evidence to librarian; independent judgment to
  oracle. See [agent and delegation guidance](docs/agent/agents-and-delegation.md).
- Preserve operator-selected model and effort, including max. Fix scope and
  supervision, not the operator's settings. Delegation failure is not permission
  for unrestricted fallback. If independent review is prohibited, disclose that
  limitation; do not claim independent PASS or archive.
- Each assignment needs one independently checkable outcome, exact known source
  and skill paths, owned writes, focused checks, and a return/stop condition.
  Split broad integration by accepted outcomes, not one agent per file. On native
  attention or a missed agreed milestone, inspect progress and steer, narrow,
  or stop safely; timeout is a safety ceiling, not a progress plan. After two
  consecutive attempts without new evidence or progress, return the smallest
  blocker instead of looping. Long productive work is not failure by duration.
- Use native notifications/waits without polling or custom timers. If native
  attention is unavailable, use assignments that return at an agreed milestone.
  Freeze relevant inputs before final validation; reuse fresh checks and rerun
  only those invalidated by edits. Reconcile background commands before returning;
  late notifications must preserve the substantive handoff. See the
  [execution guidance](skills/thoth-sdd/references/phases/implement.md).
- Do not duplicate delegated discovery. Request conclusions, localized evidence
  and uncertainty (plus next action from Oracle, Worker and Designer only); target
  missing support instead of rereading every file. Bounded evidence inspection for root decisions/recovery and mandatory
  independent verification remain valid. Coordination artifacts must not hide
  source or log dumps.
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
- `.thoth/constitution.md` contains active project principles and
  `.thoth/specs/` durable product contracts. Preserve historical material under
  `.thoth/history/`; it is not active SDD context. No default evidence directory
  or per-change process tools/scripts, wrappers, report files or evidence generators.
- thoth-mem independently owns provider persistence, hooks, MCP and lifecycle.
  Follow its installed guidance; never mirror project work records. Root
  owns verified identity, lifecycle and real-user intent. Delegated authorization
  is none, recall or observe, independent of workspace permission.
- Published installs require consistent provider complete evidence. Never turn
  reset into provider force/rollback. Local Pi installation leaves thoth-mem to
  its separate installer. Preserve unrelated provider assets.
- Omit autoResolutionMs entirely from request_user_input. Some harness controls
  are instruction-only; do not claim enforcement or ignore those boundaries.

## Change and verification flow

1. Explore, specify, and clarify proportionally; then classify by coordination,
   uncertainty, and risk, reusing authorization already given.
2. For substantial work, plan in the one ID-named record and shape units. Small
   work stays artifact-free; delegation alone does not require persistence.
3. Resolve the two applicable planning choices, then implement within ownership,
   keeping useful checkpoints for recovery.
4. Run focused checks, then verification proportional to risk.
5. Review the diff for unrelated changes, generated drift and accidental secrets.
6. Update routed documentation for durable facts and independently verify.

The current `.github/workflows/ci.yml` installs with
`pnpm install --frozen-lockfile` and runs `pnpm run check:ci`,
`pnpm run typecheck`, and `pnpm test` on Node `22.19`/pnpm `11.2.2`; it does not
run the build. A separate `windows-latest` job runs only the five `pi-packages/*`
typechecks and offline tests (`test:unit` for the Claude bridge). The release workflow waits for that CI and then runs
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
open questions, and risks. Do not return full logs, whole files, or unfiltered
search transcripts.

- Explorer and Librarian report facts only: no recommended fixes, designs,
  defaults or next actions. An open question they cannot settle is returned as the
  question, its possible options and the facts for each option, without choosing
  one; root decides or asks Oracle.
- Oracle adds its independent judgment and recommendations; Worker and Designer
  add the next implementation action.

## Definition of done

- The requested result is complete and in scope.
- Relevant checks pass or their failures are reported with evidence.
- Public contracts, work/memory governance, and harness differences are preserved.
- The diff contains no unrelated, generated, or secret changes.
- Any unrun validation and remaining uncertainty are declared.
