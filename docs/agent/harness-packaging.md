# Harness packaging and compatibility

## Entrypoints

- `src/harness/registry.ts`: supported/default harnesses
- `src/harness/core/agent-pack.ts`: six-role contract
- `src/harness/core/sdd.ts`: route, phase and artifact contract
- `src/harness/adapters/`: native translation
- `src/harness/generate-integration-packages.ts`: shared Codex/Claude plugin
- `plugin/`: generated shared distribution bundle
- `skills/`: canonical thoth-owned workflow bundle
- `EremesNG/thoth-plugins`: separately versioned central Codex and Claude Code
  marketplace catalogs

## Invariants

- OpenCode remains default.
- OpenCode npm plugin loading does not expose package-relative native skills;
  the CLI synchronizes the five canonical owned skill trees into
  `~/.config/opencode/skills/`. Init never creates project-local skill copies.
- Codex uses ambient root plus five global TOMLs created by the mandatory CLI.
  Its plugin manifest carries skills/MCP but cannot install custom agents or
  `~/.codex/AGENTS.md`; `$thoth-init` creates project governance only.
- Claude packages root plus five generated namespaced subagents.
- Pi is published from the same `thoth-agents` npm artifact with exactly
  `./dist/pi.js` and `./skills` in `package.json#pi`. Generation writes five
  package-owned `pi/agents/*.md` assets plus `.thoth-agents-assets.json`; no
  orchestrator child or external implementation tree is packaged. Pi discovers
  the five owned skills from the manifest, while the shared synchronizer
  materializes the five specialists globally for `pi-subagents@0.71.0`.
  The generated definitions use native `model`/`thinking`, fresh context,
  depth one, and a background librarian; no builtin pi-subagents agents are used.
  `/thoth-agents:models` exposes global specialist configuration through a native
  TUI draft/save panel. CLI and extension share `src/cli/pi-model-config.ts` for
  provenance/path checks, stale snapshots, and partial-write recovery. Native
  TUI/AI modules are declared public peers and kept external in the build;
  static imports let Pi's loader resolve its native aliases for compiled JS.
  Lazy imports from a natively loaded compiled extension bypass those aliases.
  Root model and external override precedence remain Pi-owned.
- Both central catalog entries resolve to one `plugin/` bundle containing one copy of the
  five canonical thoth-owned skills, including `thoth-sdd` and `plan-reviewer`.
  Harness-specific manifests and MCP files
  coexist in that bundle. External skills are installed from their source
  repositories by the mandatory CLI flow; published installs then invoke
  thoth-mem's public setup without copying provider assets into the bundle.
  Explicit local Pi package installs leave thoth-mem to its separate local
  installer.
- Native managers own marketplace snapshots, normal cache lifecycle,
  enablement, and trust. The Codex CLI migration has one bounded exception: only
  fixed product-owned legacy roots may be removed after central verification and
  two fail-closed path/provenance checks.
- Generated files are outputs; edit canonical adapters, prompts, or skills.
- Capability gaps remain explicit and deduplicated. Only unrecoverable required
  generation errors exit nonzero.
- Build and npm version lifecycle synchronize both plugin manifests and the
  generated shared bundle; release then publishes only this product's central
  catalog pin and required owned-skill inventory. The publisher reads the built
  `plugin/skills/` inventory; the central validator verifies every required
  skill against the release tag before any push.
- No adapter bundles thoth-mem hooks, MCP, skill, lifecycle behavior, or project
  QA executables.
- Pi background children load ambient extensions. The Thoth extension stays
  inert when native `PI_SUBAGENT_CHILD=1` is present: no adaptive-root injection
  and no global specialist synchronization. Automatic missions and scheduled
  runs are disabled so Thoth retains work/acceptance ownership.
- Pi's Context7 and web-access integrations are native extensions. Only grep.app
  uses `pi-mcp-adapter`, through the exact attributable global server entry.
- Pi safely merges `subagents.disableBuiltins: true` into user settings and
  writes fresh/depth-one extension configuration without replacing unrelated
  keys. A detected legacy `pi-subagents-j0k3r` package blocks before mutation
  with manual recovery instead of creating a dual runtime.
- Pi requires RPIV `ask_user_question` for root-owned interaction, but no task
  extension. Progress instructions use any available task tool through its actual
  contract, or written progress when unavailable; children report to root.
  Only root and librarian receive `web_search`, `fetch_content`,
  `get_search_content`, and `source_check` guidance, and package presence remains
  distinct from live UI/provider availability.

## Verification

Run focused adapter/generator tests, `pnpm run integration:sync`, and
`pnpm run integration:verify`. Use `pnpm run build` followed by
`pnpm run verify:pi-package` for the packed manifest, inventory, and
unrelated-directory extension-load contract.
