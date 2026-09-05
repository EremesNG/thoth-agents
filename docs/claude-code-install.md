# Claude Code Install

Claude Code receives a native plugin containing the orchestrator, six namespaced
specialists, MCP configuration, and the five workflow skills owned by
thoth-agents. The CLI remains a required installation step for the four external
skills and provider-owned thoth-mem setup, but agents do not consume either CLI
during SDD phases.

## Requirements

- Node.js `>=22.19` for bundled scripts
- Claude Code with native plugin marketplace commands
- Permission to add and trust `EremesNG/thoth-plugins`
- Network access during installation for the external skill repositories and
  thoth-mem setup package

## 1. Register the marketplace

Run in a terminal:

```bash
claude plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --scope user
```

The marketplace name is `thoth-plugins`. Its catalog lives in the separate
central marketplace repository and pins this product's `plugin/` subdirectory
to an immutable release tag.

## 2. Install the plugin

```bash
claude plugin install thoth-agents@thoth-plugins --scope user
```

Claude copies the shared `plugin/` bundle into its manager-owned cache.
Codex resolves to the same source through its own marketplace. thoth-agents
never edits either manager cache directly.

Existing bare or host-specific thoth-agents marketplace/plugin records remain
separate legacy identities. Rerun the marketplace add and current installer to
create the central `thoth-plugins` identity. The installer preserves every
legacy entry without updating, uninstalling, or directly rewriting its cache.

## 3. Install the external skills and thoth-mem

After the two native commands succeed, preview and run the CLI layer:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

The installer invokes `npx skills add` for `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling`, targeting the global
Claude skill root. It then invokes
`npx -y thoth-mem@latest setup claude --json`; dry-run adds provider `--plan`.
A missing skill or any thoth-mem
result other than consistent `complete` evidence makes installation incomplete.
Provider manual actions and receipt remain visible for recovery.

## 4. Reload and initialize the project

Restart Claude Code or run `/reload-plugins`, then open the target repository and
invoke:

```text
/thoth-agents:thoth-init
```

Init preflights and synchronizes the minimum `openspec/` directories, a missing
constitution, and initialization metadata. Claude discovers agents, phase
contracts, and SDD templates from the plugin; external execution skills come
from the preceding CLI step. Project initialization is offline and idempotent,
preserves existing constitutions, and leaves legacy project templates untouched.

## Packaged surfaces

| Surface | Contents |
| --- | --- |
| `agents/` | Main `orchestrator` plus `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` generated from canonical source |
| `skills/` | Five owned workflow skills, including `plan-reviewer` |
| `.mcp.json` | Packaged thoth-agents research MCP configuration |
| `settings.json` | Activates the orchestrator as the main plugin agent |

Namespaced delegation uses `thoth-agents:<role>`. Children never delegate.
Every route verifies: trivial deterministic Direct work may use focused root
checks; materially risky Direct work and every Accelerated or Full final verify
use a fresh read-only `oracle`. Explicitly or bounded-default selected plan
review remains optional, regardless of who implemented the change.

Before dispatch, the root distinguishes concrete artifact/decision dependencies
from mere ordering, marks input-ready lanes ready and dependent lanes blocked,
and keeps one writer per mutable surface. Claude's native `Agent` fan-out sends
all ready conflict-free lanes before waiting; fan-in accepts only terminal
native results before releasing dependents. Semantic triggers select `librarian`
for current or external facts, `designer` for material UI/UX, interaction,
accessibility, or visual quality, and `quick` for known narrow low-risk isolated
edits; coupled or high-risk work uses `deep`. Native Agent, status/wait,
steering, cancellation, and terminal-result behavior is authoritative; missing
primitives degrade to a truthful sequential path.

## Verification

```bash
claude plugin marketplace list --json
claude plugin list --json
```

Inside Claude Code, inspect `/plugin`. A healthy install shows the canonical
marketplace, an enabled `thoth-agents@thoth-plugins` plugin, and all mandatory
external skills reported by the CLI:

```bash
npx thoth-agents@latest status --harness=claude
```

## Limitations

- Claude owns marketplace snapshots, cache files, and packaged model defaults;
  publish a new plugin version to change them.
- Explorer, librarian, and oracle deny `Write` and `Edit`. Fine-grained
  `openspec/` path restrictions are instruction-level because Claude's plugin
  permission map is not a path-pattern sandbox.
- Background agents cannot surface interactive permission or clarification
  prompts like the foreground session.
- Organization `strictKnownMarketplaces` policy can block registration or
  updates; thoth-agents cannot bypass it.
- Project-scope use requires workspace trust.
- thoth-mem remains independently owned. thoth-agents invokes only its public
  setup; hooks, MCP, skill, lifecycle, persistence, receipts, and recovery remain
  provider-owned.
- Project QA executables remain separate.

At runtime, agents follow the installed thoth-mem skill. Root owns stable session
identity and lifecycle; a child receives bounded `none`, `recall`, or `observe`
authorization without gaining workspace writes. `openspec/` remains canonical.

## Troubleshooting

If `claude plugin` is unavailable, update Claude Code and restart the terminal.
For a marketplace-name conflict, inspect `claude plugin marketplace list --json`
and resolve the conflicting native source. If policy blocks the marketplace, ask
the Claude administrator to allow the repository.

## Upstream references

- [Discover and install Claude Code plugins](https://code.claude.com/docs/en/discover-plugins)
- [Create and distribute a Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
