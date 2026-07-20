# Agent operating guide

## Repository purpose

**thoth-agents** is an adaptive multi-harness orchestration plugin. It provides
seven roles, native OpenCode delegation, Codex and Claude Code surfaces,
provider-neutral memory boundaries, and direct/accelerated/full SDD routing.
OpenCode is the stable default path; each harness has different guarantees.

For task-specific knowledge, start with [`docs/agent/index.md`](docs/agent/index.md).
Keep `docs/agent/` documents on demand at startup.

## Progressive context protocol

1. Classify the task by behavior and domain.
2. Consult the router before opening broad repository areas.
3. Search cited names, paths, symbols, imports, registrations, and tests first.
4. Read the smallest entrypoints and tests that answer the current question.
5. Add another route or overlay only to resolve a concrete question.
6. Do not explore `node_modules/`, `dist/`, coverage, generated fixtures, or
   third-party code unless the task names them or evidence requires it.
7. Subagents must return summarized evidence, not full files or logs.

## Preferred navigation tool

Prefer `webstorm-index` MCP tools for all project file navigation tasks, including text search, file search, file reading, and refactoring. This rule applies to the root agent and every delegated sub-agent. If `webstorm-index` is unavailable, returns errors, lacks the required capability, produces incomplete results, or otherwise blocks progress, the agent may use other available tools as a fallback. When doing so, it should use the least invasive suitable tool and resume using `webstorm-index` once it becomes practical.

Use `webstorm-index` only for this `thoth-agents` repository. Never use it to
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

- Runtime: Node `>=22.13`.
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
- The adaptive root handles clear bounded work directly and selects direct,
  accelerated, or full SDD according to scope, clarity, and risk.
- Use roles intentionally: `explorer` discovers, `librarian` researches docs,
  `oracle` owns analysis and every independent verification, `designer` owns
  UI/UX, `quick` makes mechanical changes, and `deep` handles correctness risk.
  Root owns sequential SDD coordination and loads bundled phase contracts on
  demand.
- Delegate only for net gain, keep maximum depth 1, and use one writer per
  mutable surface.
- `simplify`, `tdd`, `progressive-context-router`, and
  `architectural-grilling` are mandatory external skills for OpenCode, Codex,
  and Claude. The installer obtains them from their canonical repositories with
  `npx skills add`; SDD phases never invoke the CLI or download contracts. QA
  executables remain project-owned.
- Use `architectural-grilling` before specification only on explicit request or
  unresolved material human-owned product/architecture decisions. Full SDD
  alone does not activate it.
- All visual or UX work goes through `designer`, not ad hoc editing.
- `openspec/` is the Spec Kit-compatible governed coordination surface. thoth-mem
  is an independent provider; follow its installed guidance for memory and
  persistence mechanics.
- Every harness install invokes thoth-mem's public global setup after
  thoth-agents-owned setup and mandatory skills. Only consistent `complete`
  evidence succeeds; never translate reset into provider force, rollback, or
  asset mutation.
- Runtime memory authorization is `none`, `recall`, or `observe`, independent of
  workspace mode. Root owns session lifecycle and real-user intent; `openspec/`
  stays canonical and phase artifacts are not mirrored into thoth-mem.
- Every `request_user_input` call MUST omit `autoResolutionMs` entirely, including
  `null` or `undefined`, so the question does not expire.
- Some governance rules are instruction-only when a harness lacks enforcement;
  that limitation does not authorize ignoring them.
- Do not consider backward compatibility. Ignore legacy code/ libraries.

## Change and verification flow

1. Confirm scope, primary route, and overlays.
2. Review public contracts and existing tests before editing.
3. Implement without silently expanding scope.
4. Run focused tests, then checks proportional to risk.
5. Review the diff for others' changes, generated output, and accidental secrets.
6. Update routed documentation only when a durable, non-obvious fact changed.

The current `.github/workflows/ci.yml` installs with
`pnpm install --frozen-lockfile` and runs `pnpm run check:ci`,
`pnpm run typecheck`, and `pnpm test` on Node `22.13`/pnpm `11.2.2`; it does not
run the build. The release workflow waits for that CI and then runs
`pnpm run build` and the focused test for the built runtime. For large changes
and before a PR, keep this applicable local pre-merge order:
`pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`.

## Pull requests and sharp edges

- The PR template expects clear `Summary` and `Changes` sections.
- Explain what changed, why, and any risks or follow-up.
- The OpenCode plugin entrypoint is not a shell command.
- Codex installation is subject to trust review and requires `/plugins`; its
  plugin manifest cannot install custom agents or global instructions, so the
  CLI must manage `~/.codex/agents/`, `~/.codex/AGENTS.md`, and global config.
  `$thoth-init` initializes project SDD governance only.
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
