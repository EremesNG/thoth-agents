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
  materializes the five specialists for `npm:pi-subagents-j0k3r@>=1.6.1`.
  Generated definitions use supported `model`, `effort`, and `subagent_mode`
  fields; they do not claim fresh-context or depth enforcement. The librarian
  defaults to background mode. `/thoth-agents:models` exposes global specialist
  configuration through a native TUI draft/save panel. CLI and extension share
  `src/cli/pi-model-config.ts` for provenance/path checks, stale snapshots, and
  partial-write recovery. `/thoth-agents:tools` discovers current registered tools,
  edits explicit per-role global tool lists and supports active-only select-all,
  marked inactive choices, retained unavailable names and role-default reset.
  `src/cli/pi-tool-config.ts` owns validation and safe persistence; synchronization
  preserves valid explicit tools/modes as well as model/effort. Malformed or legacy
  wildcard overrides remain untouched with diagnostics. Empty selections and
  delegation/root-only controls are rejected; no automatic future-tool inheritance
  or guaranteed child extension availability is claimed. Native TUI/AI modules are declared public peers and
  kept external in the build; static imports let Pi's loader resolve its native
  aliases for compiled JS. Lazy imports from a natively loaded compiled extension
  bypass those aliases. Root model and external override precedence remain
  Pi-owned.
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
- Pi j0k3r children run in-process and expose no `PI_SUBAGENT_CHILD` marker.
  Global `<agent-dir>/subagents.json` therefore requests
  `session_resources: "lean"` and `enable_continue: false`; lean filters
  `before_agent_start` and `session_start`, while full child resources are
  unsupported. A project-local `subagents.json` may override global lean
  settings. The runtime provides no
  enforced depth or tool allowlist, and these role boundaries do not form an OS
  or process sandbox.
- Pi's Context7 and web-access integrations are native extensions. Only grep.app
  uses `pi-mcp-adapter`, through the exact attributable global server entry.
- Pi safely merges `session_resources: "lean"` and `enable_continue: false`
  into global `subagents.json` without replacing unrelated keys. A detected
  incumbent `pi-subagents` package blocks before mutation with manual recovery;
  setup never removes it or installs both delegation runtimes.
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
