# Verification Report: Redesign README and Docs for Multi-Harness Positioning

## Completeness

The documentation artifacts for this accelerated proposal are complete.
`README.md`, `docs/installation.md`, `docs/quick-reference.md`,
`docs/skills-and-mcps.md`, `docs/provider-configurations.md`, and
`docs/tmux-integration.md` now present thoth-agents as multi-harness while
scoping OpenCode as the stable/default baseline and Codex as an explicit
supported setup with caveats.

Dirty-worktree policy: unrelated pre-existing worktree changes do not block this
SDD verification unless there is evidence they were introduced or required by
this documentation execution. Source diffs under `src/harness/adapters/` are
therefore treated as residual worktree risk, not as a failure for this
docs-only change. This verification did not revert or modify those source files.

## Build and Test Evidence

- `bun run check:ci` passed: Biome checked 175 files with no fixes applied.
- README roster/image check passed:
  `rg -n "img/(team|orchestrator|explorer|librarian|oracle|designer|quick|deep)\.png|\b(orchestrator|explorer|librarian|oracle|designer|quick|deep)\b" README.md`
  found `img/team.png`, all seven role images, and all seven canonical role
  names.
- Harness/caveat checks passed:
  `rg -n "install --agent=opencode|install --agent=codex|opencode auth login|/plugins|/hooks|instruction-level|trust review|capability|caveat" ...`
  found OpenCode install/auth commands, Codex install commands, `/plugins`,
  `/hooks`, trust-review language, and instruction-level caveats across README
  and docs.
- Tmux scoping check passed:
  `rg -n "OpenCode|opencode --port|OPENCODE_PORT|Codex|scope|task|tmux" docs/tmux-integration.md docs/quick-reference.md docs/installation.md`
  found explicit OpenCode-scoped tmux wording and no Codex tmux parity claim.
- Markdown link check passed for the 10 touched README/docs files; relative
  `.md` links resolve.
- `cmd /c git diff --check` passed with no whitespace errors.
- `git diff --name-only -- img dist package.json thoth-agents.schema.json`
  returned no changed image, generated distribution, package, or schema files.
- `git diff --name-only -- README.md docs/installation.md docs/quick-reference.md docs/skills-and-mcps.md docs/provider-configurations.md docs/tmux-integration.md docs/codex-install.md docs/codex-plugin-packaging.md docs/codex-surface-validation.md docs/codex-model-customization.md openspec/changes/redesign-readme-docs-multiharness`
  is limited to the expected documentation and OpenSpec verification artifacts
  for this change.
- Residual dirty-worktree check: `git diff --name-only` still lists source diffs
  under `src/harness/adapters/`. They are outside this SDD scope and were not
  modified by this verification retry.

## Compliance Matrix

| Proposal success criterion | Status | Evidence |
| --- | --- | --- |
| README presents thoth-agents as multi-harness with OpenCode and Codex clearly supported and scoped. | Pass | README lines found by `rg` include multi-harness positioning, OpenCode stable default language, Codex explicit path language, `What It Is`, `What It Is Not`, support matrix, and quick starts. |
| Existing OpenCode install and run commands remain discoverable and accurate. | Pass | README and `docs/installation.md` include `bunx thoth-agents@latest install`, `install --agent=opencode`, `opencode auth login`, `opencode`, and `--no-tui` examples. |
| Codex docs remain dedicated and linked, with capability caveats visible. | Pass | `docs/codex-install.md`, `docs/codex-plugin-packaging.md`, `docs/codex-surface-validation.md`, and `docs/codex-model-customization.md` link back to README/install/shared references and preserve trust-review, feature-gate, unsupported, unknown, and instruction-level caveats. |
| High-priority docs no longer describe shared skills, agents, or config as OpenCode-only unless explicitly scoped to OpenCode. | Pass | Shared docs now separate shared concepts from harness bindings. Remaining OpenCode-only wording in README and docs is scoped to OpenCode plugin config, OpenCode skills directory, provider presets, prompt overrides, native `task`, or tmux behavior. |
| Seven-agent roster names and images remain present in the README. | Pass | README contains `img/team.png`, all seven role images, and the canonical `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` names. |
| Out of scope: no runtime, installer, CLI, generated artifact, or agent behavior changes introduced by this SDD docs execution. | Pass with warning | The verified SDD artifact set is limited to README/docs/OpenSpec files. Existing dirty source diffs under `src/harness/adapters/` remain out of scope and are reported as residual worktree risk, not evidence that this docs execution changed runtime behavior. |

## Issues Found

- Warning: the repository remains dirty outside this SDD docs change. Current
  residual source diffs exist in `src/harness/adapters/`, but no evidence in
  this retry ties them to the documentation execution, and they were not
  modified or reverted during verification.

## Verdict

Pass with warning.

The SDD documentation change satisfies the proposal and completed tasks under
the clarified dirty-worktree policy. The only remaining risk is unrelated dirty
worktree state outside the docs/OpenSpec scope.
