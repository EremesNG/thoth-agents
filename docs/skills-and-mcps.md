# Skills and MCPs

thoth-agents 0.3.0 separates compact role prompts from detailed, on-demand
workflow contracts. The thoth-owned phase contracts ship inside the plugin
bundle, while mandatory external skills are installed from their canonical
repositories during setup. SDD execution itself requires neither the CLI nor a
runtime download.

## Owned workflow skills

| Skill | Contract |
| --- | --- |
| `thoth-init` | Offline, idempotent project initialization and harness-specific project surfaces |
| `thoth-sdd` | Route selection, progressive phase references, templates, and structural validation |
| `thoth-constitution` | Constitution creation, amendment, and pre/post planning gates |
| `thoth-archive` | Passing verification gate, audit report, and dated archive move |

The adaptive root loads only the current contract. It owns specify, clarify,
plan, checklist, tasks, converge, report persistence, and archive. Explorer owns
Full discovery. Oracle is always read-only and owns Full analysis plus every
verification.

## Mandatory execution skills

| Skill | Canonical source | Trigger |
| --- | --- | --- |
| `simplify` | `EremesNG/skills` | After implementation, simplify touched code without behavior changes |
| `tdd` | `mattpocock/skills` | Before implementing behavior changes |
| `progressive-context-router` | `EremesNG/skills` | Repository instruction and context-router work |
| `architectural-grilling` | `EremesNG/skills` | Explicit interview or unresolved material human-owned decision before specification |

Build copies only the four owned skills to the shared `plugin/skills` tree used
by Codex and Claude. OpenCode `/thoth-init` copies those same owned skills to
project `.agents/skills/` without overwriting existing files.

For every harness, the thoth-agents installer invokes `npx skills add` with the
canonical repository, exact skill name, global scope, and concrete harness
selector. There are no vendored copies of these external skills in this
repository or the generated plugin packages. A failed mandatory skill install
fails the overall installation.

## SDD contract loading

`thoth-sdd` contains one reference per phase. Detailed contracts are absent from
the static agent prompts and loaded only after a route reaches that phase.

| Phase | Owner |
| --- | --- |
| `explore` | read-only `explorer` |
| `specify`, `clarify`, `plan`, `checklist`, `tasks` | root |
| `analyze` | read-only `oracle` |
| `implement` | root or one bounded writer |
| `verify` | read-only `oracle` for every route |
| `converge`, report persistence, `archive` | root |

Artifact-backed phases use canonical templates, FR/SC and US identifiers,
Constitution checks, exact task grammar, checklist taxonomy/revalidation, and an
offline structural validator. Oracle semantic review remains a separate gate.

## thoth-agents MCPs

The shared harness bundle may expose the research MCPs used by thoth-agents:

| MCP | Purpose |
| --- | --- |
| `exa` | External research and source discovery. |
| `context7` | Current library documentation. |
| `grep_app` | Public code search. |

Their exact configuration differs by harness. OpenCode composes them at runtime;
Codex reads `plugin/codex.mcp.json`, while Claude reads `plugin/.mcp.json`.

## thoth-mem boundary

thoth-mem is not a bundled skill or MCP. It is an independently installed
plugin/provider and owns its hooks, MCP setup, persistence, recovery, capability
evidence, and lifecycle behavior.

## QA boundary

`playwright-cli`, Playwright, browser drivers, integration runners, and other QA
executables remain project-owned. A workflow may use an already available QA
surface but must not provision one merely because thoth-agents is installed.
