# AGENTS.md

## Project Overview

**thoth-agents** is a multi-harness agent orchestration plugin for
delegate-first workflows. It provides a seven-agent roster, OpenCode-native
task delegation, Codex support, thoth-mem integration, bundled SDD skills, and
a requirements-interview skill for clarifying ambiguous work.

## Supported Harnesses

- OpenCode: native plugin/runtime flow with `task`-based delegation.
- Codex: supported agent-pack/plugin path for Codex harnesses, with
  capability and enforcement caveats where the runtime differs from OpenCode.

IMPORTANT: Always use `webstorm-index` and `mcp-steroid` MCP tools for project file navigation, including text search, file search, file reading, and refactoring. This rule applies to the root agent **and to every delegated sub-agent**.

## Environment and Setup

- Runtime: Node `>=22.13`
- Package manager: `pnpm@11.2.2`
- Install dependencies: `pnpm install`

## Development Workflow

- Start local development: `pnpm run dev`
- Build locally: `pnpm run build`
- Generate TypeScript declarations through the normal build pipeline; do not invent a separate declarations command unless the repo adds one later.

## Testing

- Run the full test suite: `pnpm test`
- Vitest runs files matching `src/**/*.test.ts` and `src/**/*.test.tsx` in the Node environment.
- For focused validation, prefer the smallest relevant subset of tests rather than running the full suite repeatedly.

## Code Style

- Use TypeScript and modern Node patterns consistent with the existing codebase.
- Lint: `pnpm run lint`
- Format: `pnpm run format`
- Typecheck: `pnpm run typecheck`
- Full local check: `pnpm run check:ci`
- Keep changes small, explicit, and consistent with existing repository conventions.

## Build and CI

- CI uses `pnpm install --frozen-lockfile`, then `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, and `pnpm test`.
- CI runs on Node `22.13` with `pnpm 11.2.2`.
- Treat the CI command order as the default pre-merge verification order when validating larger changes.

## Agent Workflow and Governance

- Follow the root coordinator flow: requirements interview first, then the relevant SDD path when the task is non-trivial.
- Use the role agents intentionally: explorer for discovery, librarian for docs, oracle for review/diagnosis, designer for UI, quick for narrow mechanical edits, deep for correctness-heavy work.
- Use `thoth-mem` and `openspec/` as governed project memory and coordination surfaces; do not improvise alternate persistence patterns.
- Every `request_user_input` call MUST omit the `autoResolutionMs` parameter entirely; never pass any value (including `null` or `undefined`) so the question never expires and the user may take as long as needed to answer.
- Visual or UX work should be handled through the designer path, not ad hoc editing.
- Preserve unrelated work in the tree; never revert or discard changes you did not make.

## Pull Request Notes

- The PR template expects a clear `Summary` and `Changes` section.
- Before opening a PR, run the relevant checks for the scope of the change, at minimum the most applicable combination of `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, and `pnpm test`.
- Keep PR descriptions focused on what changed, why it changed, and any follow-up risks.

## Gotchas

- The OpenCode plugin entry is not a shell command.
- Codex setup is trust-gated and may require `/plugins` and `/hooks` review.
- Some governance rules are instruction-level and not enforced by tooling; follow them even when no checker exists.
- The repo’s workflow centers on seven role agents, requirements interview, the SDD pipeline, `thoth-mem`, and `openspec` policy.
