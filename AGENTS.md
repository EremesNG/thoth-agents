# Agent operating guide

## Repository purpose

**thoth-agents** is an adaptive multi-harness orchestration plugin. It provides
seven roles, native OpenCode and Pi delegation, Codex and Claude Code surfaces,
provider-neutral memory boundaries, and direct/accelerated/full SDD routing.
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
- `src/harness/core/sdd.ts`: SDD route, phase, and artifact governance.
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
- Keep changes small, explicit, and limited to the requested behavior.
- Preserve others' work: never revert or discard changes you did not make.
- Run the nearest focused validation first; expand only according to risk.
- The adaptive root handles clear bounded work directly, assesses scope,
  clarity, and risk, and recommends direct, accelerated, or full SDD. Before
  asking, it summarizes the relevant request context and why the recommendation
  fits. Any explicit route answer wins. If the native question returns without
  an answer, ask at most three total times; after the third answerless result,
  the recommended route counts as selected.
- SDD routes govern artifacts/gates, not implementation ownership; root or a
  writer may implement in any route. Delegate only for net gain.
- Before retaining or delegating work, root identifies bounded outputs, records
  information dependencies and mutable ownership, separates ready lanes from
  blocked synthesis, and evaluates every specialist semantically. It dispatches
  all valuable conflict-free ready lanes through the active harness's native
  primitives before waiting, respects the proven native width, accepts only
  terminal native results, and fans them in against intent, dependencies,
  ownership, conflicts, and verification. Mere list order is not a dependency.
- Keep delegation depth 1, one writer per mutable surface, and serialize
  overlapping ownership. The specialist directory has equal routing salience:
  `explorer` for broad uncertain local discovery; `librarian` for current
  authoritative external evidence; `oracle` for independent read-only judgment;
  `designer` for material UI/UX, interaction, accessibility, or visual quality;
  `quick` for exact bounded low-risk implementation; and `deep` for coupled,
  edge-case-heavy, migration, concurrency, or high-risk implementation.
- Harness-native dispatch, status, wait, steering, cancellation, and terminal
  results are authoritative. thoth-agents supplies decision policy and prompts,
  never an executor, scheduler, job board, lifecycle shadow, or tracing runtime;
  unavailable native capabilities must be reported as degraded.
- `simplify`, `tdd`, `progressive-context-router`, and
  `architectural-grilling` are mandatory external skills for OpenCode, Codex,
  and Claude. The installer obtains them from their canonical repositories with
  `npx skills add`; SDD phases never invoke the CLI or download contracts. QA
  executables remain project-owned.
- Use `architectural-grilling` before specification only on explicit request or
  unresolved material human-owned product/architecture decisions. Full SDD
  alone does not activate it.
- After `ready` on Accelerated or Full, recommend the optional read-only Oracle
  plan review and let the user choose review or proceeding without it. Any
  explicit answer wins. Ask at most three total times after answerless native
  results; after the third, `Review plan with Oracle (Recommended)` counts as
  selected. Repair actionable same-intent `[REJECT]` findings, revalidate
  affected gates, and use a fresh Oracle approval round until `[OKAY]` or a
  material human-owned blocker. After `[OKAY]`, summarize the approved plan
  before asking `Implement (Recommended)` or `Stop`; any explicit answer wins,
  while the third answerless result selects implementation. Plan approval never
  replaces mandatory final verification. Trivial deterministic Direct work may
  be root-verified without implementer self-approval; materially risky Direct
  work and every Accelerated or Full final verification use a fresh read-only
  Oracle.
- `plan-reviewer` is a thoth-owned bundled skill; its OpenSpec artifact remains
  root-written and is never mirrored into provider memory.
- `openspec/` is the Spec Kit-compatible governed coordination surface. thoth-mem
  is an independent provider; follow its installed guidance for memory and
  persistence mechanics.
- Published harness installs invoke thoth-mem's public global setup after
  thoth-agents-owned setup and mandatory skills. Only consistent `complete`
  evidence succeeds; never translate reset into provider force, rollback, or
  asset mutation. An explicit local Pi package install omits provider setup,
  records only thoth-agents completion, and requires thoth-mem to be installed
  separately from its own local checkout.
- Runtime memory authorization is `none`, `recall`, or `observe`, independent of
  workspace mode. Root owns session lifecycle and real-user intent; `openspec/`
  stays canonical and phase artifacts are not mirrored into thoth-mem.
- Every `request_user_input` call MUST omit `autoResolutionMs` entirely, including
  `null` or `undefined`, so the question does not expire.
- The bounded SDD fallbacks apply only to route, plan-review, and implementation
  questions; never apply them to secrets, destructive or security-sensitive
  actions, or material human-owned decisions.
- Some governance rules are instruction-only when a harness lacks enforcement;
  that limitation does not authorize ignoring them.
- Do not consider backward compatibility. Ignore legacy code/ libraries.

## Change and verification flow

1. Confirm scope, summarize context, recommend a primary route, and resolve the
   selection through an explicit answer or the bounded recommended fallback.
2. Review public contracts and existing tests before editing.
3. Implement without silently expanding scope.
4. Run focused tests, then checks proportional to risk.
5. Review the diff for others' changes, generated output, and accidental secrets.
6. Update routed documentation only when a durable, non-obvious fact changed.

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
  manifest cannot install those surfaces. `$thoth-init` initializes project SDD
  governance only.
- Do not assume capability or enforcement equivalence across harnesses.

## Subagent return contract

Return the conclusion, inspected paths and symbols, relevant tests or commands,
open questions, risks, and the recommended next action. Do not return full logs,
whole files, or unfiltered search transcripts.

## Definition of done

- The requested result is complete and in scope.
- Relevant checks pass or their failures are reported with evidence.
- Public contracts, SDD/memory governance, and harness differences are preserved.
- The diff contains no unrelated, generated, or secret changes.
- Any unrun validation and remaining uncertainty are declared.
