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
   eight selected packages, including
   `npm:@thoth-agents/pi-subagents@>=0.3.0`,
   `npm:@thoth-agents/pi-todo@>=0.1.0`,
   `npm:@thoth-agents/pi-thoth-theme@>=0.3.0` and
   `npm:@thoth-agents/pi-background-tasks@>=0.3.0`, plus four external skills.
   Published installs also invoke provider-owned thoth-mem; an
   explicit local Pi package install leaves thoth-mem to its separate local
   installer. Pi and the separate `@thoth-agents/pi-subagents` runtime retain
   delegation execution and task lifecycle ownership. pi-subagents registers
   `/subagents-model` and `/subagents-tools` on pi-core's shared list-editor
   shell; thoth-agents registers only the optional managed-specialist tools
   adapter, not the tools command. Compatible user copies of theme and background
   tasks from any source are preserved and verified; older or ambiguous copies
   block completion rather than being replaced.

Pi task state crosses package boundaries only as summary snapshots on pi-core's
v1 `thoth:subagents:state` and `thoth:background:state` envelope channels, each
with a `:request` channel. They cover the active subagent session or current
cwd/session background origin, not task detail or history. The theme consumes
cumulative cost/run count on `thoth:subagents:usage` and requests it through
`thoth:subagents:usage:request`. The raw `thoth:subagent-usage` bus event is removed
(the checkpoint type stays); upgrade pi-subagents and pi-thoth-theme to `>=0.3.0`
together. See [channel contracts and request semantics](harness-packaging.md#pi-task-channels).

## Pi editor-area UI

pi-core's shared `registerEditorSlot` owner (exported from `./panel`) composes
work-panel rows, editor replacements and terminal-input routing without chaining
SDK editor factories. It preserves the retained editor's callbacks and app
actions. pi-questions-user replaces the editor while expanded, without a chat
overlay, and collapses with `Ctrl+]` to a one-line dock above the restored editor.
Collapsed input, including `Enter` and `Esc`, belongs to the editor or focused
overlay; `Enter` during an active run steers the agent without resolving the
question. `Ctrl+]` re-expands while open and shadows editor `jumpForward` only
for that lifetime; the open tool-call card indicates collapsed state.

Owned history/detail overlays close only their own handles. Focus repair returns
to the expanded questionnaire or otherwise the mounted root editor. Acquisition
uses owned-overlay handles to prevent focus recapture; collapse and teardown do
not steal focus from a still-visible foreign overlay. See
[the dock and focus contract](harness-packaging.md#pi-question-dock-and-editor-slot).

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
