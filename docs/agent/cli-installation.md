# CLI and installation

## Responsibility

This route owns parsing, help, TUI, install, status, update, sync, model
configuration, managed I/O, and required external skills.

## Entrypoints

- `src/cli/index.ts` and `parser.ts`
- `src/cli/commands.ts`
- `src/cli/install.ts`
- `src/cli/operations/`
- `src/cli/skills.ts`
- `src/cli/tui/`

## Invariants

- The OpenCode plugin entry is not a shell command; use the published CLI through
  an install, `npx`, or `pnpm dlx`.
- OpenCode is the default harness.
- `simplify`, `tdd`, `progressive-context-router`, and
  `architectural-grilling` are mandatory for all three harnesses.
- Browser and QA executables are project-owned; the CLI does not install
  `playwright-cli` or Playwright.
- There is no required-skill opt-out. A failed install makes the operation fail.
- Dry-run writes nothing and prints required-skill commands.
- Reset touches only thoth-agents-managed targets.
- Codex marketplace registration is an explicit interactive manager step;
  trust review remains explicit through `/plugins` and `/hooks`.
- The documented Claude first-install path runs `claude plugin marketplace add`
  and `claude plugin install` before the thoth-agents CLI. The CLI reconciles
  native state and installs the required global skills; it never copies files
  into the Claude plugin-manager cache.
- Native plugin installation never makes the CLI optional. Codex needs its root
  instructions, custom agents, feature merge, model state, and skills; Claude
  needs its standalone required skills and complete-state verification.
- Claude per-role model rewrites are unsupported after installation because the
  native manager owns the cached package.
- CLI changes require parser/help/tests and public documentation in the same
  change.

## Verification

- parser/help/runtime: `parser.test.ts`, `commands.test.ts`, `index.test.ts`
- install/config: `install.test.ts`, `codex-install.test.ts`,
  `claude-code-install.test.ts`, path/config tests
- required skills: `skills.test.ts` and all three operation tests
- TUI: `src/cli/tui/**/*.test.tsx`

See [`../installation.md`](../installation.md),
[`../codex-install.md`](../codex-install.md), and
[`../claude-code-install.md`](../claude-code-install.md).
