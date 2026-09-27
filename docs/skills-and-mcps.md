# Skills and MCPs

thoth-agents separates compact role prompts from detailed, on-demand
workflow contracts. The thoth-owned work contracts ship inside the plugin
bundle, while mandatory external skills are installed from their canonical
repositories during setup. Work execution itself requires neither the CLI nor a
runtime download.

## Owned workflow skills

| Skill | Contract |
| --- | --- |
| `thoth-init` | Offline, idempotent minimum `.thoth/` governance |
| `thoth-work` | Compact agreement, selective units/context, validation and recovery checkpoints |
| `thoth-constitution` | Explicit versioned project-principle amendments |
| `thoth-archive` | Fresh independent PASS, declared durable updates and dated archive |
| `plan-reviewer` | Optional blocker-focused independent review |

Root loads the current operation only. It owns the agreement and acceptance.
Specialists receive bounded inputs and one mutable surface; independent units
fill native capacity before waiting, with refill and per-consumer release.
Root offers optional Oracle plan review; after [OKAY], it offers implementation
or stopping. Each choice has its own three-unanswered-return default and compact
recovery evidence. Explicit answers win, and unsupported or open questions never
count. Resolved choices persist. A fresh Oracle still verifies all persisted work
before archive. See the [workflow guide](workflow.md) for the scope and exclusions.

## Mandatory execution skills

| Skill | Canonical source | Trigger |
| --- | --- | --- |
| `simplify` | `EremesNG/skills` | After implementation, simplify touched code without behavior changes |
| `tdd` | `mattpocock/skills` | Before implementing behavior changes |
| `progressive-context-router` | `EremesNG/skills` | Repository instruction and context-router work |
| `architectural-grilling` | `EremesNG/skills` | Explicit interview or unresolved material human-owned decision before specification |

Build copies only the five owned skills to the shared `plugin/skills` tree used
by Codex and Claude. The OpenCode CLI copies those packaged skills to its global
discovery root. Pi discovers them directly through the installed
`thoth-agents` package manifest and creates no new global skill copies; only
byte-identical attributable legacy copies may be retired. `/thoth-init`
only initializes or synchronizes the minimum project `.thoth/` structure.
Persisted workflow operations resolve their examples, references, and helpers
from the installed `thoth-work` skill; no project-local template directory is required.

For every harness, the thoth-agents installer invokes `npx skills add` with the
canonical repository, exact skill name, global scope, and concrete harness
selector. There are no vendored copies of these external skills in this
repository or the generated plugin packages. A failed mandatory skill install
fails the overall installation.

After the external skills, the published installation command invokes
thoth-mem's public setup for the selected harness. An explicit local Pi package
install omits that call and requires a separate local thoth-mem installation.
This administrative call is installation orchestration, not a bundled provider
implementation; work execution never invokes either CLI.

## Work contract loading

The installed `thoth-work` skill supplies offline helpers and on-demand
references for planning, execution, resume and verification. Root owns planning,
reconciliation and closeout; root or one bounded specialist owns implementation.
Supporting documents are optional. See [workflow](workflow.md) for the file
contract, stale-evidence rules, native liveness and independent review.

## thoth-agents MCPs

The shared harness bundle may expose the research MCPs used by thoth-agents:

| MCP | Purpose |
| --- | --- |
| `exa` | External research and source discovery. |
| `context7` | Current library documentation. |
| `grep_app` | Public code search. |

Their exact configuration differs by harness. OpenCode composes them at runtime;
Codex reads `plugin/codex.mcp.json`, while Claude reads `plugin/.mcp.json`.
Pi uses a hybrid stack: `@upstash/context7-pi@0.1.2` and
`pi-web-access@0.27.0` are native extensions, while
`pi-mcp-adapter@2.32.1` exposes only the global `https://mcp.grep.app` server.
The managed grep entry uses legacy protocol and lazy lifecycle, omits
`directTools`, and requires no credentials. pi-web-access supports Exa, including
its keyless public MCP path, and other configured providers. Provider settings,
tool aliases, disabled tools, and credentials remain operator-owned;
thoth-agents never copies or rewrites them.

The default pi-web-access tools are `web_search`, `fetch_content`,
`get_search_content`, and `source_check`; only the root and librarian receive
the corresponding guidance/allowlist. Delegated research uses `workflow: "none"`
to avoid the interactive curator. The package does not retain dedicated pi-exa
answer, similarity, or research-planner tools. Package presence is unverified
runtime evidence rather than proof of a successful provider request. Failures
are reported explicitly, and fetched or searched content remains untrusted.
Fetches may create extension-owned caches or clones outside the workspace even
for a read-only role. The separate `rpiv-ask-user-question` package exposes
root-owned interaction. Progress tracking is optional and provider-neutral:
use an available task tool according to its actual name and schema, or lightweight
written progress if none is available. Thoth does not install or require a task
extension, and never treats progress tracking as child coordination state.

## thoth-mem boundary

thoth-mem is not a bundled skill or MCP. It is an independently installed
plugin/provider and owns its hooks, MCP setup, persistence, recovery, capability
evidence, receipts, installed skill, and lifecycle behavior.

Published `npx thoth-agents@latest install` invokes `npx -y thoth-mem@latest
setup <opencode|codex|claude|pi> --json` after thoth-agents-owned setup and
mandatory skills. Dry-run adds thoth-mem's zero-write `--plan`; thoth-agents does
not pass `--force`, edit provider files, or claim success unless status and exit
evidence consistently report `complete`. An explicit local Pi package install
omits provider setup and requires thoth-mem to be installed separately from its
own local checkout.

At runtime, root and children load the installed `thoth-mem` skill only for an
authorized memory outcome. Root owns stable session identity, real-user intent,
and lifecycle. A child receives `none`, `recall`, or `observe` separately from
its workspace permissions; `observe` can authorize a durable provider
observation without allowing file edits or root lifecycle. `.thoth/` remains
canonical, and work contracts or checkpoints are not mirrored into provider memory.

## QA boundary

`playwright-cli`, Playwright, browser drivers, integration runners, and other QA
executables remain project-owned. A workflow may use an already available QA
surface but must not provision one merely because thoth-agents is installed.
