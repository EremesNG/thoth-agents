# Architecture context

## System shape

`src/index.ts` composes the OpenCode plugin. `src/harness/` owns the canonical
six-role and SDD contracts plus OpenCode, Codex, Claude, and Pi adapters. `skills/`
is the canonical thoth-owned workflow bundle. `src/cli/` owns installation plus
status, repair, model, and TUI operations.

thoth-mem is a separate provider/plugin. thoth-agents invokes its public setup
during installation, while provider mutations, hooks, MCP lifecycle, skill,
persistence, receipts, state, and recovery remain outside this package.

## Runtime and delivery flows

1. OpenCode CLI installation configures the plugin, materializes the five
   thoth-owned skills under `~/.config/opencode/skills/`, installs external
   skills, and registers `/thoth-init`; init itself only synchronizes project
   minimum `.thoth/` governance.
2. Integration generation renders Claude agents from canonical prompt source and
   assembles one shared `plugin/` bundle with a single copy of the five
   thoth-owned skills.
3. Codex CLI setup invokes the native manager to install the plugin, then
   materializes global custom-agent TOMLs, `~/.codex/AGENTS.md`, and config
   because the manifest cannot install them, installs external skills, and
   invokes provider-owned thoth-mem setup. `$thoth-init` creates project
   governance only.
4. Claude marketplace installation exposes its generated agents and owned
   skills; mandatory CLI setup installs external skills and invokes thoth-mem
   setup, while namespaced init creates project governance only.
5. Pi CLI setup first installs the exact executing `thoth-agents` package. Its
   `before_agent_start` hook contributes the bounded ambient root and
   `session_start` safely synchronizes five package-owned specialists. Pi loads
   the five owned skills from the package manifest. The CLI then installs the
   six external packages and four external skills. Published installs also
   invoke provider-owned thoth-mem; an explicit local Pi package install leaves
   thoth-mem to its separate local installer. Pi and `pi-subagents@0.71.0` retain
   execution and lifecycle ownership.

## Boundaries

| Boundary | Owner |
| --- | --- |
| OpenCode runtime | `src/index.ts`, hooks, MCPs, tools |
| Pi delegation runtime | Pi plus the selected external delegation package; thoth-agents supplies only policy, prompts, managed resources, installation, and diagnostics |
| Roles/prompts | `src/agents/`, `src/config/`, `src/harness/core/agent-pack.ts` |
| Adaptive SDD route and phase policy | `src/harness/core/sdd.ts` |
| Detailed work/init/archive contracts | `skills/` |
| Generated shared plugin | `src/harness/generate-integration-packages.ts`, `plugin/` |
| Installation and operations CLI | `src/cli/` |
| Memory setup/runtime mechanics | installed thoth-mem; thoth-agents only invokes its public setup and supplies bounded authorization |

## Invariants

- OpenCode is default; OpenCode, Codex, Claude, and Pi guarantees differ.
- Every change completes proportional understanding before classification.
  Small clear low-risk work is artifact-free; substantial work uses one
  `.thoth/changes/<id>/<id>.md` record and loads only the current phase.
- Native ready work fills capacity before waiting; freed slots are refilled and
  each consumer starts only after its own accepted fresh dependencies.
- Recovery reconciles the single record, owned code and native liveness;
  a file is not an execution lifecycle or proof of acceptance.
- Persisted work and material risk require fresh independent Oracle verification
  before closeout. Optional plan review does not replace final verification.
- Semantic role selection is route-independent: `librarian` handles current or
  external facts, `designer` material user-facing UI/UX and accessibility,
  `worker` known bounded non-visual implementation regardless of complexity, and
  `explorer` unknown local source, flow, or responsibility. Specialists execute
  by default; root direct work is limited to the documented known-source bounded
  exception. Native harness execution and lifecycle are the sole authority for
  fan-out/fan-in, status/wait, steering, cancellation, and terminal results.
- Delegation depth is one; one writer owns each mutable surface.
- OpenCode ships only the OpenAI preset.
- Owned workflow contracts are bundled; external skills come from canonical
  repositories during installation and are never fetched during execution.
  OpenCode's CLI materializes the packaged owned contracts in its global native
  skill root because npm plugins do not expose package-relative skill roots.
- Every published harness install requires consistent thoth-mem `complete`
  evidence. An explicit local Pi package install records thoth-agents without
  provider setup; provider assets and recovery remain independently owned.
- Dispatch memory authorization is `none`, `recall`, or `observe`, independent
  of workspace mode; root lifecycle never transfers. `.thoth/` is active project
  governance; historical material remains preserved.
- Both marketplaces resolve to the shared `plugin/` bundle; harness-specific
  manifests and MCP surfaces coexist without duplicating canonical skills.
- Build synchronizes the shared plugin before compilation and schema generation.
