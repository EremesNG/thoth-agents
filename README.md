<div align="center">
  <img src="img/thoth-agents-header.webp" alt="The cyber-Egyptian agents of thoth-agents" width="100%">
  <h1>Thoth-Agents</h1>
  <p><i>Adaptive orchestration for OpenCode, Codex, and Claude Code.</i></p>
  <p><b>Seven roles</b> · <b>Three SDD routes</b> · <b>Runtime-autonomous SDD</b></p>
  <p>
    <a href="https://www.npmjs.com/package/thoth-agents"><img src="https://img.shields.io/npm/v/thoth-agents?style=for-the-badge&amp;color=cb9b35&amp;label=npm" alt="npm version"></a>
    <a href="https://github.com/EremesNG/thoth-agents/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/EremesNG/thoth-agents/ci.yml?branch=master&amp;style=for-the-badge&amp;label=CI" alt="CI status"></a>
    <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D22.13-43853d?style=for-the-badge&amp;logo=node.js&amp;logoColor=white" alt="Node 22.13 or newer"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f6feb?style=for-the-badge" alt="MIT License"></a>
  </p>
</div>

---

## What it does

thoth-agents is a multi-harness orchestration plugin for OpenCode, Codex, and
Claude Code. One adaptive root handles clear bounded work directly and delegates
only when specialization, context isolation, independent review, or safe
parallelism creates a net gain.

The 0.3.0 distributions ship the seven-role contract and the thoth-owned Spec
Kit-compatible SDD skills, templates, validator, initialization, and archive
governance. During installation, the CLI obtains four mandatory external skills
from their canonical repositories with `npx skills add`. During an SDD, agents
load local contracts and never need to invoke the thoth-agents CLI or download a
phase contract.

Delivery is intentionally asymmetric. OpenCode uses the CLI to configure the
npm plugin and external skills. Codex needs both a native plugin and a mandatory
CLI-managed global layer because its manifest cannot install custom agents or
global root instructions. Claude needs its two native marketplace commands
before the CLI installs and verifies the external skills.

Runtime guarantees still differ by harness. OpenCode is the default and most
integrated path; Codex and Claude preserve their own trust, policy, plugin-cache,
and permission semantics.

## Install

### OpenCode

Install the plugin configuration and external skills:

```bash
npx thoth-agents@latest install --agent=opencode --dry-run
npx thoth-agents@latest install --agent=opencode
```

Restart OpenCode and initialize the current repository:

```text
/thoth-init
```

This copies the four thoth-owned workflow skills into `.agents/skills/` and
creates missing `openspec/` governance files. The external skills are already in
OpenCode's global skill root from the CLI step. Existing project-owned files are
preserved.

### Codex

Register the repository marketplace from a terminal:

```bash
codex plugin marketplace add EremesNG/thoth-agents
```

Restart Codex, open `/plugins`, and install or enable `thoth-agents`. Then return
to a terminal and apply the mandatory global layer:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI writes the orchestrator block to `~/.codex/AGENTS.md`, creates six
custom-agent TOMLs under `~/.codex/agents/`, and merges the managed feature into
`~/.codex/config.toml`. Restart Codex again, then initialize each target
repository's SDD governance:

```text
$thoth-init
```

The plugin contributes skills and MCP configuration. `$thoth-init` creates only
missing `openspec/` governance files; it does not pretend to install agents.

Review `/plugins` and `/hooks` after installation. Codex trust and
higher-precedence instructions remain in force.

### Claude Code

Claude requires its two native marketplace steps before the plugin can expose
agents or skills:

```bash
claude plugin marketplace add EremesNG/thoth-agents --scope user
claude plugin install thoth-agents@thoth-agents --scope user
```

Then install and verify the mandatory external skills:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

Restart Claude Code or run `/reload-plugins`, then initialize the repository:

```text
/thoth-agents:thoth-init
```

Claude discovers the packaged orchestrator, six namespaced subagents, and four
thoth-owned skills from the plugin. The CLI installs the external skills into
Claude's global skill root. Init creates only the missing project governance
files; it never edits Claude's manager-owned plugin cache.

See [Installation](docs/installation.md), [Codex Install](docs/codex-install.md),
and [Claude Code Install](docs/claude-code-install.md) for scopes, verification,
and limitations.

## Seven roles

| Mode | Roles | Responsibility |
| --- | --- | --- |
| Adaptive root | `orchestrator` | Keep task ownership and synthesis, choose the route, coordinate SDD artifacts, and implement bounded work directly. |
| Read-only | `explorer` | Resolve repository uncertainty and return decision-ready local evidence. |
| Read-only | `librarian` | Gather current authoritative external evidence and label inference. |
| Read-only | `oracle` | Challenge plans, own Full analysis, and independently verify every implementation. |
| Writer | `designer` | Own UI/UX choices, implementation, and visual verification. |
| Writer | `quick` | Make narrow, clear, low-risk edits within an explicit surface. |
| Writer | `deep` | Handle multi-file, edge-case-heavy, or correctness-critical implementation. |

Children do not delegate. Each mutable surface has one writer. Parallel work is
limited to independent surfaces. The implementation writer never reviews or
approves its own result: `oracle` owns every `verify`, including Direct and
Accelerated work.

## SDD routes

```text
Direct:      implement -> verify
Accelerated: specify -> plan -> tasks -> implement -> verify -> archive
Full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive
```

| Route | Use when | Artifacts |
| --- | --- | --- |
| Direct | Clear, local, low-risk work | None; oracle returns its verdict in-session. |
| Accelerated | Bounded multi-file or moderate-risk work | Canonical spec, plan, tasks, verification, and archive reports. |
| Full | Explicit SDD, material uncertainty, cross-cutting contracts, or high failure cost | Accelerated artifacts plus exploration and independent pre-implementation analysis. |

The root loads only the current phase contract from the bundled `thoth-sdd`
skill. It owns specification, clarification, planning, requirements checklists,
task decomposition, convergence, report persistence, and archive. `explorer`
owns Full discovery; `oracle` always owns `analyze` and `verify`.

Conditional phases remain deliberately narrow:

- `clarify` runs only for a material ambiguity and updates canonical `spec.md`;
- `checklist` audits high-risk requirement quality with `CHK###` taxonomy and a
  separate revalidation pass;
- `converge` appends tasks only after failed artifact-backed verification; and
- `architectural-grilling` runs before specification only when explicitly
  requested or a material human-owned decision remains unresolved.

Accelerated and Full use Spec Kit-grade formats: independent prioritized `US#`
stories, Given/When/Then scenarios, `FR-###` and `SC-###` identifiers,
Constitution checks, `T### [P?] [US#?]` task grammar, MVP and dependency
guidance, per-task verification outcomes, parallel examples, progressive
phase-aware validation, compliance reports, and a guarded dated archive. See
[SDD Pipeline](docs/sdd-pipeline.md).

## Skills

Every harness package includes the workflow contracts owned by thoth-agents:

| Skill | Purpose |
| --- | --- |
| `thoth-init` | Offline, idempotent project initialization. |
| `thoth-sdd` | Route rules, phase contracts, templates, and structural validator. |
| `thoth-constitution` | Project constitution lifecycle and pre/post design gates. |
| `thoth-archive` | Passing closeout, audit report, and guarded archive move. |

The installer obtains these mandatory external skills from their single source
of truth:

| Skill | Canonical repository |
| --- | --- |
| `simplify` | `https://github.com/EremesNG/skills` |
| `tdd` | `https://github.com/mattpocock/skills` |
| `progressive-context-router` | `https://github.com/EremesNG/skills` |
| `architectural-grilling` | `https://github.com/EremesNG/skills` |

It invokes `npx skills add <repository> --skill <name> --global --agent
<harness> --yes`; missing external skills make installation unhealthy. Project
QA executables such as Playwright remain project-owned.

## Harness limitations

| Harness | Important limitation |
| --- | --- |
| OpenCode | Strongest integrated path. The CLI installs the npm plugin configuration and external skills; `/thoth-init` materializes thoth-owned project skills/governance. Only the OpenAI built-in preset ships. |
| Codex | Native plugin installation is incomplete without the CLI. The CLI manages global `AGENTS.md`, six agent TOMLs, and config; `$thoth-init` only initializes per-repository SDD governance. Runtime role matching and some permissions remain instruction-level. |
| Claude Code | Run both native marketplace commands before the CLI installs external skills. The native manager owns cache files; fine-grained path restrictions remain instruction-level. |

Codex and Claude marketplace manifests are versioned in
`.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`. The
generated integration packages live under `integrations/` and are synchronized
by build and npm version lifecycle commands.

## Models and provider boundaries

OpenCode ships only an `openai` preset. Kimi, GitHub Copilot, ZAI/GLM, and
mixed-provider mappings are not built in. Explicit per-role model overrides
remain available.

thoth-mem is an independent plugin/provider. It owns memory installation, hooks,
MCP lifecycle, persistence, and recovery. thoth-agents neither installs nor
emulates those mechanics.

## CLI operations

The npm CLI is part of installation for every harness and remains available for
status, repair, and model/configuration operations:

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
npx thoth-agents@latest install --agent=opencode
npx thoth-agents@latest install --agent=codex
npx thoth-agents@latest install --agent=claude
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

It does not replace native marketplace trust or mutate manager-owned caches.

## Documentation

- [Installation](docs/installation.md)
- [Quick Reference](docs/quick-reference.md)
- [SDD Pipeline](docs/sdd-pipeline.md)
- [Skills and MCPs](docs/skills-and-mcps.md)
- [Codex Install](docs/codex-install.md)
- [Claude Code Install](docs/claude-code-install.md)
- [Codex Plugin Packaging](docs/codex-plugin-packaging.md)
- [Claude Code Plugin Packaging](docs/claude-code-plugin-packaging.md)
- [Provider Configuration](docs/provider-configurations.md)

## Development

```bash
pnpm install
pnpm run check:ci
pnpm run typecheck
pnpm run build
pnpm test
```

Node.js `>=22.13` and `pnpm@11.2.2` are required. `pnpm run build` regenerates
both integration packages, compiles the runtime and declarations, and refreshes
the JSON schema.

## License

[MIT](LICENSE)
