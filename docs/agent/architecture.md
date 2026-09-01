# Architecture context

## System shape

`src/index.ts` composes the OpenCode plugin. `src/harness/` owns the canonical
seven-role and SDD contracts plus OpenCode, Codex, and Claude adapters. `skills/`
is the canonical thoth-owned workflow bundle. `src/cli/` owns installation plus
status, repair, model, and TUI operations.

thoth-mem is a separate provider/plugin. thoth-agents invokes its public setup
during installation, while provider mutations, hooks, MCP lifecycle, skill,
persistence, receipts, state, and recovery remain outside this package.

## Runtime and delivery flows

1. OpenCode CLI installation configures the plugin, materializes the five
   thoth-owned skills under `~/.config/opencode/skills/`, installs external
   skills, and registers `/thoth-init`; init itself only synchronizes project
   `openspec/` governance.
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

## Boundaries

| Boundary | Owner |
| --- | --- |
| OpenCode runtime | `src/index.ts`, hooks, MCPs, tools |
| Roles/prompts | `src/agents/`, `src/config/`, `src/harness/core/agent-pack.ts` |
| SDD ownership | `src/harness/core/sdd.ts` |
| Detailed SDD/init/archive contracts | `skills/` |
| Generated shared plugin | `src/harness/generate-integration-packages.ts`, `plugin/` |
| Installation and operations CLI | `src/cli/` |
| Memory setup/runtime mechanics | installed thoth-mem; thoth-agents only invokes its public setup and supplies bounded authorization |

## Invariants

- OpenCode is default; harness guarantees differ.
- Root recommends an SDD route; the user selects it. Root then coordinates SDD
  and loads only the current contract.
- The root shapes substantive work as dependency-aware bounded lanes: concrete
  artifact/decision dependencies block a lane, while mere ordering preference
  does not. Input-ready, conflict-free lanes form a native wave; root fans in
  only terminal native results before releasing dependents.
- After `ready`, Accelerated and Full offer optional Oracle plan review or
  proceeding without it. Every route verifies: trivial deterministic Direct work
  may use focused root checks, while materially risky Direct work and every
  Accelerated or Full final verify use a fresh read-only Oracle. Review approval
  never substitutes for verify.
- Semantic role selection is route-independent: `librarian` handles current or
  external facts, `designer` material user-facing UI/UX and accessibility,
  `quick` known narrow low-risk isolated edits, `deep` coupled/high-risk work,
  and `explorer` broad local uncertainty. Native harness execution and
  lifecycle are the sole authority for fan-out/fan-in, status/wait, steering,
  cancellation, and terminal results.
- Delegation depth is one; one writer owns each mutable surface.
- OpenCode ships only the OpenAI preset.
- Owned SDD contracts are bundled; external skills come from canonical
  repositories during installation and are never fetched during an SDD.
  OpenCode's CLI materializes the packaged owned contracts in its global native
  skill root because npm plugins do not expose package-relative skill roots.
- Every harness install requires consistent thoth-mem `complete` evidence;
  provider assets and recovery remain independently owned.
- Dispatch memory authorization is `none`, `recall`, or `observe`, independent
  of workspace mode; root lifecycle never transfers and `openspec/` remains canonical.
- Both marketplaces resolve to the shared `plugin/` bundle; harness-specific
  manifests and MCP surfaces coexist without duplicating canonical skills.
- Build synchronizes the shared plugin before compilation and schema generation.
