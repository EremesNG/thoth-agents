# Skills and MCPs

thoth-agents 0.3.0 separates compact role prompts from detailed, on-demand
workflow contracts. The thoth-owned phase contracts ship inside the plugin
bundle, while mandatory external skills are installed from their canonical
repositories during setup. SDD execution itself requires neither the CLI nor a
runtime download.

## Owned workflow skills

| Skill | Contract |
| --- | --- |
| `thoth-init` | Offline, idempotent initialization and synchronization of minimum `openspec/` governance only |
| `thoth-sdd` | Contextual route recommendation, explicit-or-bounded-default selection, progressive phase references, templates, and structural validation |
| `thoth-constitution` | Constitution creation, amendment, and pre/post planning gates |
| `thoth-archive` | Passing verification gate, audit report, and dated archive move |
| `plan-reviewer` | Explicit-or-bounded-default, blocker-focused Oracle plan review with convergence and SHA-256 freshness evidence |

The adaptive root loads only the current contract. It owns specify, clarify,
plan, checklist, tasks, converge, report persistence, and archive. Explorer owns
Full discovery. Every route verifies: trivial deterministic Direct work may use
focused root checks; materially risky Direct work and every Accelerated or Full
final verify use a fresh read-only Oracle. Offered plan review remains read-only.

After `ready` on Accelerated or Full, root offers `Review plan with Oracle
(Recommended)` or `Proceed without review`. Any explicit answer wins; after
three total answerless native results, review counts as selected. `plan-reviewer`
returns exactly `[OKAY]` or `[REJECT]` and no more than three actionable
blockers. Root repairs same-intent blockers, revalidates affected gates, and
uses a fresh Oracle round until `[OKAY]` or a material human-owned blocker. Root
alone persists `plan-review.md` with reviewed-source SHA-256 digests; it is never
mirrored into provider memory. After `[OKAY]`, root summarizes the approved plan
before asking `Implement (Recommended)` or `Stop`. Any explicit answer wins;
after three total answerless results, implementation counts as selected.
Approval alone never authorizes implementation or replaces mandatory final
Oracle verification.

Before implementation, root records concrete artifact/decision dependencies,
ownership, specialist fit, and verification inputs. Input-complete lanes are
ready; lanes waiting on upstream artifacts are blocked. All ready conflict-free
lanes are dispatched in a native wave before waiting, and fan-in accepts only
terminal native results. Semantic triggers route current or external facts to
`librarian`, material user-facing UI/UX or accessibility to `designer`, and
known narrow low-risk isolated edits to `quick`; coupled or high-risk work uses
`deep`. Native harness execution and lifecycle remain authoritative, with
truthful sequential fallback when a primitive is unavailable.

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
only initializes or synchronizes the minimum project `openspec/` structure.
Every SDD phase anchors its contract, template, and validator paths to the
installed `thoth-sdd` skill; no project-local template directory is required.

For every harness, the thoth-agents installer invokes `npx skills add` with the
canonical repository, exact skill name, global scope, and concrete harness
selector. There are no vendored copies of these external skills in this
repository or the generated plugin packages. A failed mandatory skill install
fails the overall installation.

After the external skills, the same installation command invokes thoth-mem's
public setup for the selected harness. This administrative call is installation
orchestration, not a bundled provider implementation; SDD phases never invoke
either CLI.

## SDD contract loading

`thoth-sdd` contains one reference per phase. Detailed contracts are absent from
the static agent prompts and loaded only after a route reaches that phase.

| Phase | Owner |
| --- | --- |
| `explore` | read-only `explorer` |
| `specify`, `clarify`, `plan`, `checklist`, `tasks` | root |
| `plan-review` | optional read-only `oracle`, after explicit or bounded-default review selection |
| `implement` | root or one bounded writer |
| `verify` | root for trivial deterministic Direct; fresh read-only `oracle` for materially risky Direct and every Accelerated/Full final verify |
| `converge`, report persistence, `archive` | root |

Artifact-backed phases use canonical templates, FR/SC and US identifiers,
Constitution checks, exact task grammar, checklist taxonomy/revalidation, and an
offline structural validator. Plans reuse the same exact active Constitution
principle names before and after design. Task IDs start at `T001`, remain global
and sequential, and each task carries exactly one literal repository-relative
path before its verification outcome. Oracle semantic review remains a separate
gate.

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
`@feniix/pi-exa@5.1.1` are native extensions, while
`pi-mcp-adapter@2.32.1` exposes only the global `https://mcp.grep.app` server.
The managed grep entry uses legacy protocol and lazy lifecycle, omits
`directTools`, and requires no credentials. Exa reads the operator-owned
`EXA_API_KEY`; thoth-agents never copies it. The alternative
`@benvargas/pi-exa-mcp` is not installed alongside the selected Exa extension
and remains only an operator-managed fallback.

## thoth-mem boundary

thoth-mem is not a bundled skill or MCP. It is an independently installed
plugin/provider and owns its hooks, MCP setup, persistence, recovery, capability
evidence, receipts, installed skill, and lifecycle behavior.

`npx thoth-agents@latest install` invokes `npx -y thoth-mem@latest setup
<opencode|codex|claude|pi> --scope global --json` after thoth-agents-owned setup and
mandatory skills. Dry-run adds thoth-mem's zero-write `--plan`; thoth-agents does
not pass `--force`, edit provider files, or claim success unless status and exit
evidence consistently report `complete`.

At runtime, root and children load the installed `thoth-mem` skill only for an
authorized memory outcome. Root owns stable session identity, real-user intent,
and lifecycle. A child receives `none`, `recall`, or `observe` separately from
its workspace permissions; `observe` can authorize a durable provider
observation without allowing file edits or root lifecycle. `openspec/` remains
canonical, and phase artifacts are not mirrored into provider memory.

## QA boundary

`playwright-cli`, Playwright, browser drivers, integration runners, and other QA
executables remain project-owned. A workflow may use an already available QA
surface but must not provision one merely because thoth-agents is installed.
