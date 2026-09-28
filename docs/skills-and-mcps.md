# Skills and MCPs

Thoth-owned workflow skills ship with the product; mandatory external skills
are installed from their canonical repositories during setup. SDD execution
uses already installed local contracts and never invokes the CLI or a download.

| Owned skill | Contract |
| --- | --- |
| `thoth-init` | Offline idempotent minimum `.thoth/` governance at `.thoth/constitution.md`, preserving existing project governance and history. |
| `thoth-sdd` | Proportional explore/specify/clarify phases, post-understanding classification, one ID-named substantial-change record, and structural readiness/closeout validation. |
| `thoth-constitution` | Explicit versioned amendments and governance validator. |
| `thoth-archive` | Fresh independent PASS, transactional declared durable updates and dated archive. |
| `plan-reviewer` | Optional blocker-focused read-only plan review. |

Root loads only the current phase. Every change completes proportional
explore/specify/clarify before classification; no phase forces a document,
specialist, or interview. Small clear low-risk work is test-first and artifact-
free. Substantial work uses one `.thoth/changes/<id>/<id>.md`, without aliases,
sidecars, reports, or a default evidence directory. Optional selected Oracle plan
review stays separate from the post-review Implement-or-Stop choice. Fresh Oracle
judgment remains mandatory for substantial or materially risky work. See [the
SDD guide](sdd-pipeline.md).

| External skill | Canonical source | Trigger |
| --- | --- | --- |
| `simplify` | `EremesNG/skills` | Review the implementation diff without changing behavior. |
| `tdd` | `mattpocock/skills` | Test-first behavior changes. |
| `progressive-context-router` | `EremesNG/skills` | Repository instruction and context-router work. |
| `architectural-grilling` | `EremesNG/skills` | Explicit interview or unresolved material human-owned decision. |

Build copies the five owned skills to shared `plugin/skills` for Codex and
Claude. OpenCode synchronizes them into its global discovery root. Pi discovers
them via the package manifest, preserving unrelated provider and Pi assets.
`/thoth-init` creates only missing minimum `.thoth/` paths. Phase references,
templates and maintained validators resolve relative to the installed
`thoth-sdd` skill, never to a project-local template directory. Missing assets
are installation drift, not permission to provision mid-workflow. The installer
uses `npx skills add` for external skills during setup; a failed mandatory
install fails setup.

## thoth-agents MCPs

The shared harness bundle may expose `exa`, `context7` and `grep_app` research
MCPs. OpenCode composes them at runtime; Codex reads `plugin/codex.mcp.json`
and Claude `plugin/.mcp.json`. Pi uses native
`@upstash/context7-pi@0.1.2` and `pi-web-access@0.27.0` extensions, while
`pi-mcp-adapter@2.32.1` exposes only the global grep.app server. Provider
settings, tool aliases, disabled tools and credentials are operator-owned;
installation does not prove live provider availability.

Pi's default web tools are `web_search`, `fetch_content`,
`get_search_content` and `source_check`; only root and librarian receive their
guidance. Delegated research uses `workflow: "none"` to avoid the interactive
curator. Fetched content is untrusted and may create extension-owned caches
outside the workspace. Pi's `rpiv-ask-user-question` handles root interaction.
Progress tools are optional and provider-neutral; use an available tool according
to its exposed contract or lightweight written progress. Thoth supplies no task
scheduler or child-coordination state. Capability gaps are reported truthfully.

## thoth-mem boundary

thoth-mem is not a bundled skill or MCP: it is an independently installed
plugin/provider. Published installs invoke its public setup; explicit local Pi
package installs leave it to a separate installer. It owns hooks, MCP, lifecycle,
persistence and recovery; project work artifacts are never mirrored there.
