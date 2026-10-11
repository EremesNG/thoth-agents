# Agent operating guide

## Repository purpose

**thoth-agents** is an adaptive multi-harness orchestration plugin with six roles,
native delegation, provider-neutral memory boundaries, and AI-first SDD governance.

This repository is developed with thoth-agents installed: its workflow (SDD,
delegation, verification) comes from the installed product, not this file. Product
policy lives in `src/harness/core/agent-pack.ts`, `src/agents/prompt-sections.ts`,
`src/agents/prompt-dialects.ts`, `src/harness/core/sdd.ts`,
`src/harness/core/memory-governance.ts`, and `skills/**`; `.thoth/` is this
repository's own governance, managed through the product skills.

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

## Preferred navigation tools

- When `.codegraph/` exists, use CodeGraph before
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

## Change and verification flow

1. Use the router to identify the relevant project entrypoints and tests.
2. Implement the requested behavior within scope and update routed documentation
   for durable project facts.
3. Apply the local-closeout gate below.
4. Review the diff for unrelated changes, generated drift, and accidental secrets.

To close locally, run touched-package/area typechecks and focused tests, plus
`pnpm run check:ci` and `pnpm run typecheck`. Add `pnpm run build` for built/runtime
output or packaging changes. Release/packaging tooling tests are required only
when their inputs change; see the [verification guide](docs/agent/testing.md#local-closeout-gate)
for triggers and CI/release details. Full `pnpm test` is the post-push/PR CI safety
net (Linux CI plus `pi-packages-windows`), not a local closeout blocker. Report
unrelated environment failures, such as Windows timing, rather than treating them
as change failures.

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

## Definition of done

- The requested result is complete and in scope.
- The proportional local-closeout gate passes; unrelated environment failures
  are reported with evidence, not treated as change failures.
- Public contracts, work/memory governance, and harness differences are preserved.
- The diff contains no unrelated, generated, or secret changes.
- Any unrun validation and remaining uncertainty are declared.
