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
  materializes the five specialists for the separate
  `@thoth-agents/pi-subagents` runtime from
  `npm:@thoth-agents/pi-subagents@>=1.0.0`.
  The delegation fork supports Pi `>=0.99.0`, pins its development SDK/TUI to
  `0.99.1`, and verifies native registry, rendering, and steering on both
  `0.99.0` and `0.99.1`. Selected registered deferred/codemode tools can be
  callable while inactive; excluded tools are absent from the child registry.
  Delegation controls use native `model-only` exposure. Live messaging
  distinguishes queued, extension-handled, rejected, and model-consumed input.
  Its responsibility remains LLM subagent delegation; non-LLM shell jobs belong to
  the vendored `@thoth-agents/pi-background-tasks` (`pi-packages/pi-background-tasks`,
  a trimmed local-jobs fork of pi-better-background-tasks), which the operator adds
  to Pi settings; jobs survive `/reload` of their session and stop on any other
  shutdown, including subagent teardown.
  The workspace `@thoth-agents/pi-openai-fast` (`pi-packages/pi-openai-fast`,
  operator-installed, not in `PI_PACKAGE_SPECS`) adds `<id>-fast` virtual models
  under every provider with `openai-responses`/`openai-codex-responses` models
  (including extension providers such as `openai-codex-2`); agent-loop requests
  routed through them send `service_tier: "priority"`, while compaction and
  other direct requests keep the standard tier.
  Generated definitions use supported `model`, `effort`, and `subagent_mode`
  fields; they do not claim fresh-context or depth enforcement. Omitted run mode
  follows the selected definition and configuration, with background as the
  runtime fallback; an explicit `mode: "task"` continues to wait. The
  `/subagents-model` command edits model profiles for global or project
  definitions in their matching config scope. `model_profiles` takes precedence
  over definition fields, configuration defaults, and the parent model/effort.
  `/subagents-tools` edits per-role global tool selections. The CLI keeps
  using `src/cli/pi-model-config.ts` for Thoth specialist provenance/path checks,
  stale snapshots, and partial-write recovery. `/subagents-tools` discovers
  registered tools and edits either explicit per-role lists or the single
  standalone dynamic selector `*`: tools currently active in the root session
  plus child-provided `ask_orchestrator`, excluding native `subagent_*` tools and
  that role's `disallowed_tools`. Inactive registered tools are not inherited;
  ordinary shell-job tools remain eligible. The panel marks inactive choices,
  retains unavailable explicit names, and supports role-default reset. Its
  synthetic active `ask_orchestrator` item is never unavailable and describes
  the channel as child-provided, subject to `enable_ask_orchestrator` and
  `disallowed_tools`; the panel does not read runtime configuration or edit denials.
  Generated defaults remain explicit tool lists without `ask_orchestrator`.
  Every enabled child receives it regardless of selection form (`*`, globs,
  explicit lists, or defaults) unless denied. All five Thoth definitions deny
  `ask_user_question`, `todo`, `AskClaude`, `AskAntigravity`, `bg_delegate`,
  `bg_run_pi_attested`, `bg_result`, `fusion_reason`, `fusion_investigate`,
  `fusion_research` and `fusion_validate`; Oracle additionally denies
  `ask_orchestrator` for independent judgment. Other harnesses are unchanged.
  `disallowed_tools` is a comma-separated string or YAML list of exact names,
  subtracted after resolution, including injected tools. Absent or explicitly
  empty means no denial; malformed values fail closed and uninstalled denied
  names are inert. Native exclusions cover only `subagent_*` tools.
  `enable_ask_orchestrator` defaults to true and gates both the child tool and
  root's `subagent_reply`; false removes both. `ask_timeout_ms` defaults to
  600000. Questions block for root's reply; optional brief progress updates are
  recorded on the task without triggering a root turn. If the channel is
  unavailable, children use their return contract's `openQuestions`, not a user
  dialog or delegation.
  The `*` exclusions are not a sandbox: shell and MCP tools can still launch
  agents indirectly.
  `src/cli/pi-tool-config.ts` owns validation and safe persistence; synchronization
  preserves valid explicit tools, `*`, modes, model, effort and operator-set
  `disallowed_tools` (including explicit empty). Otherwise package denials apply
  even with custom tools; malformed definitions remain unchanged with diagnostics.
  `@active` is rejected with a diagnostic naming `*` as its replacement, never
  accepted as an alias or explicit name. Unsupported overrides remain untouched
  with diagnostics during synchronization. Empty panel selections and native
  `subagent_*` delegation controls are rejected. `*` resolves at child launch; for
  every selection form (`*`, explicit lists, globs) tools without a child
  implementation are dropped and reported as durable warnings on the running
  widget card and in status/results/completion while the child uses the available
  subset. An empty effective permitted selection or unexpected extra child tools
  still fails; an injected `ask_orchestrator` alone can keep the selection nonempty.
  Explicit names reach the child even when inactive in the root (the way to give
  a role deferred or advanced tools); the panel does not accept globs. Native TUI/AI modules are declared public peers and
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
- Pi subagent children run in-process and expose no `PI_SUBAGENT_CHILD` marker.
  Global `<agent-dir>/subagents.json` therefore requests
  `session_resources: "lean"` and `enable_continue: false`; lean filters
  `before_agent_start` and `session_start`, while full child resources are
  unsupported. Trusted packages in `lifecycle_passthrough` (default: the two
  provider bridges, background tasks and `@thoth-agents/pi-openai-fast`; never
  thoth-agents) are the exception: they keep their full lifecycle in children,
  with prompt-shaping events observe-only as defense in depth except that a
  `before_provider_request` return replaces the provider payload (so `-fast`
  variants send `service_tier: "priority"` in children); that list is a trust
  list, not a sandbox. A project-local `subagents.json` may override global lean
  settings. Child `tools`, `disallowed_tools`, configuration and native
  `subagent_*` exclusions provide runtime-verified registry filtering. Delegation
  depth and behavioral role limits are instruction-level; neither these role
  boundaries nor registry filtering form an OS or process sandbox.
- Pi's Context7 and web-access integrations are native extensions. Only grep.app
  uses `pi-mcp-adapter`, through the exact attributable global server entry.
- Pi safely merges `session_resources: "lean"` and `enable_continue: false`
  into global `subagents.json` without replacing unrelated keys. Detected
  incumbent `pi-subagents` or former `pi-subagents-j0k3r` packages block before
  mutation with manual recovery; setup never removes them or installs both
  delegation runtimes.
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
