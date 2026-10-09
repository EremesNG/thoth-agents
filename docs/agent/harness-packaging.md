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
  `npm:@thoth-agents/pi-subagents@>=0.1.0`.
  The root package and all nine `pi-packages/*` members declare Pi SDK peers
  `>=0.99.0`, pin development SDK/TUI dependencies to `1.0.2`, and require Node
  `>=22.19.0`. Features requiring newer Pi APIs are runtime-guarded; the theme's
  tool renderers need Pi `>=1.0.1` and are inert on older supported versions.
  The workspace `@thoth-agents/pi-core` (`pi-packages/pi-core`) is a library of
  typed, versioned `pi.events` channels, session-state publish/request/subscribe
  helpers, the Render KIT contract/registry and pure `formatDuration`, not a
  standalone extension. The first-party `@thoth-agents/pi-todo`
  (`pi-packages/pi-todo`) is a fork of `@juicesharp/rpiv-todo` `2.12.0`, providing
  the `todo` tool, `/todos`, and a current-session widget. It replays branch state,
  publishes full task snapshots through pi-core, and reinjects open tasks before
  agent start, including after compaction. The CLI installs pi-todo as its sixth
  selected Pi package; pi-core is its library dependency. The first-party
  `@thoth-agents/pi-questions-user` (`pi-packages/pi-questions-user`) is the fifth
  selected package, providing root-owned `ask_user_question` with stable ids,
  single/multi/text/confirm types, recommended options, previews and notes,
  no fixed question/option maximum, and structured per-id answers. It falls
  back to sequential select/input without custom UI and reports `no_ui`
  truthfully when UI is unavailable.
  The delegation fork verifies native registry, rendering, and steering.
  Selected registered deferred/codemode tools can be callable while inactive;
  excluded tools are absent from the child registry.
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
  registered tools (active and inactive) and edits exact per-role names only.
  Globs and unrecognized names are shown read-only and retained unchanged on
  save, including through role-default reset and partial-save retry. There is
  no `*` control or dynamic mode. A child-provided `ask_orchestrator` note
  describes the channel as subject to `enable_ask_orchestrator` and
  `disallowed_tools`; it is not a checkbox. The panel does not read runtime
  configuration or edit denials.
  Generated defaults are explicit: `read, bash, grep, find, ls` for Explorer and
  Oracle; Designer and Worker add `edit, write` before the search tools;
  Librarian adds its research tools. All omit `ask_user_question`, `todo` and
  third-party delegation tools. Every enabled child receives `ask_orchestrator`
  regardless of selection form unless denied. Only Oracle's generated definition
  declares `disallowed_tools`, denying `ask_orchestrator` for independent judgment.
  Other harnesses are unchanged. Manual advanced globs, including `*`, expand
  against all registered root tools (active and inactive), minus native
  `subagent_*` exclusions and the definition's `disallowed_tools`.
  `disallowed_tools` is a comma-separated string or YAML list of exact names,
  subtracted after resolution, including injected tools. Edit it manually for
  injected tools absent from the panel and for trimming glob results. Absent or
  explicitly empty means no denial; malformed values fail closed and uninstalled denied
  names are inert. Native exclusions cover only `subagent_*` tools.
  `enable_ask_orchestrator` defaults to true and gates both the child tool and
  root's `subagent_reply`; false removes both. `ask_timeout_ms` defaults to
  600000. Questions block for root's reply; optional brief progress updates are
  recorded on the task without triggering a root turn. If the channel is
  unavailable, children use their return contract's `openQuestions`, not a user
  dialog or delegation.
  Tool filtering is not a sandbox: shell and MCP tools can still launch agents
  indirectly. `src/cli/pi-tool-config.ts` owns validation and safe persistence;
  synchronization preserves operator tools (including `*` and other globs),
  modes, model, effort and operator-set `disallowed_tools` (including explicit
  empty). Otherwise package values apply even with custom tools; malformed
  definitions remain unchanged with diagnostics. `@active` is rejected with a
  diagnostic recommending exact names, never accepted as an alias or explicit
  name. Unsupported overrides remain untouched with diagnostics during
  synchronization. Empty panel selections and exact native `subagent_*`
  delegation names are rejected. Globs resolve at child launch; for every
  selection form (explicit lists or globs, including `*`) tools without a child
  implementation are dropped and reported as durable warnings on the running
  widget card and in status/results/completion while the child uses the available
  subset. An empty effective permitted selection or unexpected extra child tools
  still fails; an injected `ask_orchestrator` alone can keep the selection nonempty.
  Explicit names and tools matched by globs reach the child even when inactive
  in the root, allowing roles to activate deferred or advanced tools. Globs are
  edited manually in definition frontmatter. Native TUI/AI modules are declared public peers and
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
- Pi requires the first-party `@thoth-agents/pi-questions-user` provider of
  `ask_user_question` for root-owned interaction; the CLI also
  installs the first-party `@thoth-agents/pi-todo` task extension. Progress
  instructions use any available task tool through its actual contract, or
  written progress when unavailable; children report to root.
  Only root and librarian receive `web_search`, `fetch_content`,
  `get_search_content`, and `source_check` guidance, and package presence remains
  distinct from live UI/provider availability.

## Pi Render KIT and workspace releases

`@thoth-agents/pi-core` defines `ThothRenderKit` v1 and the process-wide
`registerRenderKit` / `getRenderKit` / `withdrawRenderKit` registry. It has no
runtime UI dependencies. `@thoth-agents/pi-thoth-theme` implements the kit's
cards, collapse hints, per-width caching, working/elapsed indicators, status
glyphs and widget primitives. It registers on `session_start` only for its
interactive UI session while `tools.enabled` is true, and withdraws only its own
registration on `session_shutdown`. Headless children do not replace or withdraw
the parent kit, or stop its indicators.

pi-questions-user, pi-todo, pi-background-tasks, pi-subagents, pi-claude-bridge and
pi-antigravity-bridge discover `getRenderKit()` inside each render of their tool
calls/results, custom messages and above-editor widgets where provided, never
at extension load or component creation. A missing or incompatible kit means
native Pi rendering. These producers depend on pi-core, not pi-thoth-theme;
extension load order does not matter.

Every migrated tool declares a stable `renderShell: 'self'`: the SDK fixes the
shell when constructing the tool component, so kit availability must not choose
it. Each render draws either the KIT frame or native output equivalent to the
SDK's default pi-tui `Box(1, 1, bg)`, with `toolPendingBg`, `toolSuccessBg` or
`toolErrorBg`, without nested frames. Message/widget fallbacks retain native
presentation. See [pi-core's KIT contract](../../pi-packages/pi-core/README.md#render-kit-v1).

Pi packages are versioned and published independently of the root package.
Use `pnpm pack` / `pnpm publish` to convert `workspace:^` dependencies to semver
ranges.

### Release flow

`release.yml` runs on the root `v*.*.*` tag, after CI, build and the runtime test:

1. **Publish Pi packages** in dependency order (pi-core first), only versions not
   yet on npm, via trusted publishing.
2. **Reconcile Pi releases**: create the per-package tag `<name>@<version>` and a
   GitHub release for each published version, with notes from commits touching
   that package directory. Reconciliation is idempotent; rerunning the workflow
   fills in whatever is missing. After a successful Pi publish, reconciliation
   waits up to five shared minutes for npm propagation and fails if any expected
   version remains missing.
3. **Root notes** exclude Pi-only commits and list the released Pi versions
   (`scripts/generate-release-notes.ts` flags `--tag-prefix`, `--path`,
   `--exclude-path`, `--package-tags`).
4. Root `npm publish`, GitHub release, then marketplace publication.

A Pi publish failure blocks the root publish.

### Bumping

```
pnpm release:pi pi-subagents patch   # dir or name; patch|minor|major
git commit -am "chore(pi-subagents): release x.y.z"
pnpm release:patch                   # or release:minor / release:major
```

`release:pi` runs `npm version --no-git-tag-version`. The root release needs a
clean tree, and a Pi-only fix still bumps the root, since Pi packages ship only
from a root tag. In 0.x, a caret range does not cross a minor: a pi-core bump
0.1 → 0.2 falls outside consumers' published `^0.1.0` until the consumers are
bumped and republished.

PRs get a non-blocking "Pi version bump" warning (`scripts/check-pi-version-bumps.mjs`)
when a Pi package changed without a version bump; when skipped it emits a
`::notice`.

### One-time bootstrap

Trusted publishing can only be configured for packages that already exist on npm,
so the first versions (0.1.0) are published manually.

Prerequisites: npm >= 11.15.0 (`npm i -g npm@latest`), `npm login`, account 2FA
enabled, ownership of the `@thoth-agents` npm organization (a scope must be a
user or an organization; without it `PUT` returns `E404`; create it at
npmjs.com/org/create), a fresh `pnpm login` after creating it (older tokens may
lack write access to the new scope and also yield `E404`), and a clean checkout of the merged commit with
`pnpm install --frozen-lockfile`.

Publish in dependency order, each from its own directory (pnpm rewrites
`workspace:^`; it prompts for an OTP, or pass `--otp <code>`):

```
cd pi-packages/<pkg>
pnpm publish --access public --no-git-checks
npm view @thoth-agents/<pkg> version
```

Order: pi-core, pi-subagents, pi-questions-user, pi-todo, pi-antigravity-bridge,
pi-background-tasks, pi-claude-bridge, pi-openai-fast, pi-thoth-theme.

New packages can take a few minutes to appear in public registry reads
(`npm view` returns `E404` meanwhile; `npm access list packages @thoth-agents`
already lists them). Wait until all versions are visible before cutting the root
release: the release decides what to publish from registry reads, and republishing
an existing version fails the run before the root is published.

Then, per package:

```
npm trust github @thoth-agents/<pkg> --file release.yml --repository EremesNG/thoth-agents --yes --allow-publish
```

Verify flag names with `npm trust --help` (syntax: `npm trust github [package]
--file [--repo|--repository] [--env|--environment] [--allow-publish]
[--allow-stage-publish] [-y|--yes]`). Configurations created after 2026-09-03
default to stage-publish only, so `--allow-publish` is needed for direct
`npm publish` from CI. Confirm on npmjs.com → package → Settings → Trusted
publishing. The root `thoth-agents` trusted publisher must also reference
`release.yml` (already in use).

Finally run `pnpm release:minor` (0.5.0). It tags and triggers `release.yml`; the
reconcile step creates the tags and releases for the bootstrap 0.1.0 versions.

## Verification

Select focused adapter/generator tests for the touched output. When generated
integration artifacts change, run `pnpm run integration:sync` and
`pnpm run integration:verify`. Packaging changes require `pnpm run build`; add
`pnpm run verify:pi-package` when the packed Pi manifest, inventory, or
unrelated-directory extension-load contract is affected. Apply the
[local-closeout gate](testing.md#local-closeout-gate) for repository checks and
release-tooling input triggers; unrelated tooling suites do not block local
product-change closeout.
