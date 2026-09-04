# Research: Native Pi package for thoth-agents

## User correction

The installed unit must be `thoth-agents` itself as a native Pi package. The
command `thoth-agents install --agent=pi` must install and verify that exact
package first through Pi's package manager, then provision delegation,
research, external-skill, and memory-provider dependencies. The previous
CLI/resource-only architecture is insufficient.

## Current repository evidence

- `package.json` publishes `dist`, `skills`, and `plugin`, but declares no `pi`
  manifest and no native Pi extension entrypoint.
- `src/cli/pi-install.ts` currently installs four external Pi packages before
  writing a managed `APPEND_SYSTEM.md` block and six global agent definitions.
- `src/cli/owned-skills.ts` copies the five thoth-owned workflow skills into
  Pi's global skill directory instead of letting Pi discover them from the
  installed npm package.
- `src/cli/operations/pi.ts` reports external package and managed-resource
  state but has no first-party native-package identity to verify.
- The archived `pi-harness-integration` change explicitly left a
  `gentle-pi`-style first-party package out of scope. This correction is new
  intent and must not rewrite that archive.

## gentle-ai comparison

- `gentle-ai/docs/pi.md` installs `npm:gentle-pi` before `gentle-engram`,
  `pi-mcp-adapter`, `pi-subagents-j0k3r`, and other dependencies.
- Its documented ownership boundary assigns persona, SDD/OpenSpec workflow,
  prompts, skills, agents, chains, and session behavior to the first-party Pi
  package; installer wiring provisions external components separately.
- The package implementation is not present in the local `gentle-ai`
  repository, so it is a product/packaging reference rather than reusable
  source code.

## Authoritative Pi contracts

- Pi 0.84.4 recognizes only `extensions`, `skills`, `prompts`, and `themes` in
  `package.json#pi`; it has no manifest field for agents, subagents, or ambient
  system files. Sources: https://pi.dev/docs/latest/packages and
  https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/src/core/pi-manifest.ts
- `pi install npm:<package>@<version>` installs globally by default, while
  `pi list --no-approve` provides package-manager evidence without approving
  project-local resources. Sources: https://pi.dev/docs/latest/packages and
  https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/src/package-manager-cli.ts
- Extensions can register tools and commands and can replace or augment the
  effective system prompt through `before_agent_start`. Source:
  https://pi.dev/docs/latest/extensions
- `pi-subagents-j0k3r` does not discover agent definitions from its npm package;
  it reads global or project `agents/` and `subagents/` directories. Sources:
  https://raw.githubusercontent.com/j0k3r-dev-rgl/pi-subagents-j0k3r/main/package.json
  and https://raw.githubusercontent.com/j0k3r-dev-rgl/pi-subagents-j0k3r/main/README.md
- Pi packages execute extension code with the invoking user's privileges;
  `--no-approve` is not a sandbox. Source:
  https://github.com/earendil-works/pi/security/advisories/GHSA-mqxh-6gq7-558m

## Selected architecture

1. Publish the existing `thoth-agents` npm artifact as the Pi package; do not
   create a second `thoth-agents-pi` package.
2. Declare `keywords: ["pi-package"]`, one compiled native extension
   `./dist/pi.js`, and the packaged `./skills` root in `package.json#pi`.
3. Let the extension inject the ambient adaptive-root contract through
   `before_agent_start`; stop depending on a persistent managed
   `APPEND_SYSTEM.md` block for Pi activation.
4. Ship the six canonical specialist definitions as package-owned resources.
   A shared synchronizer used by setup and the native extension materializes
   them into Pi's documented global `agents/` directory because Pi has no
   manifest field for agents and the delegation extension does not load them
   from package internals.
5. Preserve attributable specialist model/effort state, unrelated files, and
   user-owned conflicts. Native session activation may repair missing or stale
   package-owned resources but must never overwrite an unowned canonical name.
6. Remove only the legacy attributable Pi root block and duplicate copied
   thoth-owned skill directories after the native package is verified. Pi then
   discovers those skills directly from the package manifest.
7. Make the public bootstrap order: preflight; exact first-party package;
   external delegation/research packages; grep.app configuration; specialist
   materialization; four external skills; provider-owned thoth-mem setup; final
   ledger commit.
8. Keep external runtimes externally owned. The native extension supplies
   orchestration policy and assets but does not reimplement delegation,
   research, memory, scheduling, or task/history storage.

## Risks and mitigations

- **Self-install provenance**: resolve the exact executing version and verify
  the installed package manifest, resources, path, and loadability; support an
  explicit absolute local package source only for development/packed tests.
- **Duplicate activation**: migrate the old managed root block and copied
  owned-skill surfaces only after native package verification.
- **Agent discovery gap**: use one package-owned synchronizer for both CLI and
  runtime activation; keep the six files in Pi's documented global directory.
- **Partial dependency setup**: a later external failure leaves visible native
  package state but never advances the last-complete ledger.
- **Extension privilege**: disclose that package pins, role tool allowlists,
  project trust, and `--no-approve` do not provide an OS or credential sandbox.

## Specification anchors

- Native Pi package manifest, entrypoint, root injection, owned resources, and
  packed verification.
- Exact self-package-first install/update ordering and fail-closed provenance.
- Migration from CLI-copied root/skills without changing agent discovery.
- Package-aware status, sync, ledger, documentation, and real Pi smoke.

