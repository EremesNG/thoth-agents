<div align="center">
  <img src="img/thoth-agents-header.webp" alt="Seven human cyber-Egyptian thoth-agents roles, with Thoth as the Orchestrator centered between three read-only specialists and three implementation writers" width="100%">
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

The plugin ships the seven-role contract and thoth-owned SDD
contracts that combine Spec Kit-grade traceability with OpenSpec-style durable
deltas. Accelerated planning fast-forwards without routine pauses; structural
`ready`/`closeout` gates and independent oracle review retain rigor. Root
recommends Direct, Accelerated, or Full and the user selects the route. After
`ready`, artifact-backed routes offer optional Oracle plan review or proceeding
without it; every final verification remains mandatory. During
installation, the CLI obtains four mandatory external skills
from their canonical repositories with `npx skills add` and invokes the official
provider-owned thoth-mem setup for the selected harness. During an SDD, agents
load local contracts and the installed thoth-mem guidance; they never need to
invoke either CLI or download a phase contract.

Delivery is intentionally asymmetric. OpenCode uses the CLI to configure the
npm plugin, external skills, and thoth-mem. Codex needs both a native plugin and a mandatory
CLI-managed global layer because its manifest cannot install custom agents or
global root instructions. Claude needs its two native marketplace commands
before the CLI installs external skills and requests provider-owned thoth-mem
setup.

Runtime guarantees still differ by harness. OpenCode is the default and most
integrated path; Codex and Claude preserve their own trust, policy, plugin-cache,
and permission semantics.

## Install

### OpenCode

Install the plugin configuration, external skills, and thoth-mem companion:

```bash
npx thoth-agents@latest install --agent=opencode --dry-run
npx thoth-agents@latest install --agent=opencode
```

Restart OpenCode and initialize the current repository:

```text
/thoth-init
```

This copies the five thoth-owned workflow skills into `.agents/skills/` and
creates missing `openspec/` governance files. The external skills are already in
one of the OpenCode global discovery roots managed here,
`~/.config/opencode/skills/` or `~/.agents/skills/`, and thoth-mem has completed
its own provider setup from the CLI step. Existing project-owned files are
preserved.

### Codex

Preview, then run the combined native-plugin and global-layer installer:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI first uses Codex's native manager to register `EremesNG/thoth-agents`
and install or enable `thoth-agents@thoth-agents`. It then writes the
orchestrator block to `~/.codex/AGENTS.md`, creates six custom-agent TOMLs under
`~/.codex/agents/`, merges the managed feature into `~/.codex/config.toml`,
installs the external skills, and invokes provider-owned thoth-mem setup.
Restart Codex, then initialize each target repository's SDD governance:

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

Then install the mandatory external skills and invoke provider-owned thoth-mem
setup:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

Restart Claude Code or run `/reload-plugins`, then initialize the repository:

```text
/thoth-agents:thoth-init
```

Claude discovers the packaged orchestrator, six namespaced subagents, and five
thoth-owned skills from the plugin. The CLI installs the external skills into
Claude's global skill root and requires thoth-mem's own setup result to be
complete. Init creates only the missing project governance files; it never edits
Claude's manager-owned plugin cache.

See [Installation](docs/installation.md), [Codex Install](docs/codex-install.md),
and [Claude Code Install](docs/claude-code-install.md) for scopes, verification,
and limitations.

## Seven roles

One adaptive root and six specialists cover repository discovery, authoritative
research, independent verification, UI/UX, narrow implementation, and
correctness-critical work.

### Adaptive root

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/orchestrator.webp" width="240" alt="Human cyber-Egyptian interpretation of Thoth coordinating the team as Orchestrator">
    </td>
    <td width="66%" valign="top">
      <b>Orchestrator</b>
      <br>
      <i>Adaptive root and final synthesis.</i>
      <br><br>
      Keeps task ownership and synthesis, recommends a route for the user's
      selection, coordinates SDD artifacts, and implements bounded work directly.
      <br><br>
      <b>Mode:</b> <code>adaptive-root</code>
    </td>
  </tr>
</table>

### Read-only specialists

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/explorer.webp" width="240" alt="Human cyber-Egyptian interpretation of Anubis tracing repository paths as Explorer">
    </td>
    <td width="66%" valign="top">
      <b>Explorer</b>
      <br>
      <i>Decision-ready local discovery.</i>
      <br><br>
      Resolves repository uncertainty and returns decision-ready local evidence.
      <br><br>
      <b>Mode:</b> <code>read-only</code>
    </td>
  </tr>
</table>

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/librarian.webp" width="240" alt="Human cyber-Egyptian interpretation of Seshat consulting an authoritative scroll as Librarian">
    </td>
    <td width="66%" valign="top">
      <b>Librarian</b>
      <br>
      <i>Authoritative external research.</i>
      <br><br>
      Gathers current authoritative external evidence and labels inference.
      <br><br>
      <b>Mode:</b> <code>read-only</code>
    </td>
  </tr>
</table>

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/oracle.webp" width="240" alt="Human cyber-Egyptian interpretation of Ma'at weighing independent evidence as Oracle">
    </td>
    <td width="66%" valign="top">
      <b>Oracle</b>
      <br>
      <i>Independent analysis and verification.</i>
      <br><br>
      Reviews plans when the user requests it and independently verifies every
      implementation.
      <br><br>
      <b>Mode:</b> <code>read-only</code>
    </td>
  </tr>
</table>

### Implementation writers

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/designer.webp" width="240" alt="Human cyber-Egyptian interpretation of Hathor shaping interface geometry as Designer">
    </td>
    <td width="66%" valign="top">
      <b>Designer</b>
      <br>
      <i>UI/UX ownership and visual quality.</i>
      <br><br>
      Owns UI/UX choices, implementation, and visual verification.
      <br><br>
      <b>Mode:</b> <code>write-capable</code>
    </td>
  </tr>
</table>

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/quick.webp" width="240" alt="Human cyber-Egyptian interpretation of Horus placing a precise component as Quick">
    </td>
    <td width="66%" valign="top">
      <b>Quick</b>
      <br>
      <i>Fast bounded implementation.</i>
      <br><br>
      Makes narrow, clear, low-risk edits within an explicit surface.
      <br><br>
      <b>Mode:</b> <code>write-capable</code>
    </td>
  </tr>
</table>

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/deep.webp" width="240" alt="Human cyber-Egyptian interpretation of Sobek examining a complex mechanism as Deep">
    </td>
    <td width="66%" valign="top">
      <b>Deep</b>
      <br>
      <i>Correctness-critical implementation.</i>
      <br><br>
      Handles multi-file, edge-case-heavy, or correctness-critical
      implementation.
      <br><br>
      <b>Mode:</b> <code>write-capable</code>
    </td>
  </tr>
</table>

Children do not delegate. Each mutable surface has one writer. Parallel work is
limited to independent surfaces. The implementation writer never reviews or
approves its own result: `oracle` owns every `verify`, including Direct and
Accelerated work.

## SDD routes

```text
Direct:      implement -> verify
Accelerated: specify -> plan -> tasks -> implement -> verify -> archive
Full:        explore -> specify -> plan -> tasks -> implement -> verify -> archive
```

| Route | Use when | Artifacts |
| --- | --- | --- |
| Direct | Clear, bounded, low-risk work, including multi-file documentation/mechanical edits | None; oracle returns its verdict in-session. |
| Accelerated | Generic SDD request, partial clarity, moderate risk, multi-surface behavior, or architecture | Canonical artifacts with fast-forward specification/planning/tasks. |
| Full | Material uncertainty, cross-cutting behavior/architecture, high contract risk, or high failure cost | Accelerated artifacts plus exploration and separate planning gates. |

The root loads only the current phase contract from the bundled `thoth-sdd`
skill. It owns specification, clarification, planning, requirements checklists,
task decomposition, convergence, report persistence, and archive. `explorer`
owns Full discovery; `oracle` owns user-selected plan review and every `verify`.

An explicitly named route is the user's selection and wins. Otherwise root
recommends one of all three routes and waits for the user's choice. A generic
request to use SDD sets Accelerated as the minimum recommendation. Accelerated
writes `spec.md -> plan.md -> tasks.md` in one uninterrupted root pass and does
not pause for routine approval between those planning phases.

Conditional phases remain deliberately narrow:

- `clarify` runs only for a material ambiguity and updates canonical `spec.md`;
- `checklist` audits high-risk requirement quality with `CHK###` taxonomy and a
  separate revalidation pass;
- `plan-review` is offered after `ready` on Accelerated and Full; the user chooses
  `Review plan with Oracle (Recommended)` or `Proceed without review`;
- `converge` appends tasks only after failed artifact-backed verification; and
- `architectural-grilling` runs before specification only when explicitly
  requested or a material human-owned decision remains unresolved.

Accelerated and Full use Spec Kit-grade formats: independent prioritized `US#`
stories with explicit FR/SC coverage, Given/When/Then scenarios, named normative
FRs with durable/internal delta metadata, buildable/outcome SC types,
Constitution checks, `T### [P?] [US#?]` task grammar, honest parallel-or-none
evidence, risk-driven checklist lenses, `ready`/`closeout` validation, compliance
reports, and transactional synchronization of declared durable deltas at archive.
Handled failures roll back within the active process; forced process or OS
termination is not crash-atomic. See
[SDD Pipeline](docs/sdd-pipeline.md).

## Skills

Every harness package includes the workflow contracts owned by thoth-agents:

| Skill | Purpose |
| --- | --- |
| `thoth-init` | Offline, idempotent project initialization. |
| `thoth-sdd` | Route rules, phase contracts, templates, and structural validator. |
| `thoth-constitution` | Explicit governance SemVer lifecycle; routine plans only read principles. |
| `thoth-archive` | Passing closeout, transactional durable-spec sync, audit report, and dated move. |
| `plan-reviewer` | Optional read-only Oracle plan review with exact `[OKAY]`/`[REJECT]` results and freshness evidence. |

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

The same CLI installation then invokes `npx -y thoth-mem@latest setup
<opencode|codex|claude> --scope global --json`; dry-run adds `--plan`. Only a
consistent provider `complete` result completes installation. Provider
diagnostics, manual actions, and receipt paths remain visible for recovery.

## Harness limitations

| Harness | Important limitation |
| --- | --- |
| OpenCode | Strongest integrated path. The CLI installs the npm plugin configuration, external skills, and provider-owned thoth-mem setup; `/thoth-init` materializes thoth-owned project skills/governance. Only the OpenAI built-in preset ships. |
| Codex | The CLI installs the native plugin and manages global `AGENTS.md`, six agent TOMLs, config, external skills, and thoth-mem setup; `$thoth-init` only initializes per-repository SDD governance. Runtime role matching and some permissions remain instruction-level. |
| Claude Code | Run both native marketplace commands before the CLI installs external skills and requests thoth-mem setup. The native manager owns cache files; fine-grained path restrictions remain instruction-level. |

Codex and Claude marketplace manifests are versioned in
`.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`. The
two catalogs resolve to the same generated `plugin/` bundle. Build and npm
version lifecycle commands keep that shared bundle synchronized.

## Models and provider boundaries

OpenCode install and sync ship and select only the `openai` preset. Kimi,
GitHub Copilot, ZAI/GLM, and mixed-provider mappings are not built in. Explicit
per-role model overrides remain available. Applying model configuration creates
a complete seven-role `agents` preset from the effective values and activates
it with `preset: agents`; unrelated presets and configuration remain intact.

thoth-mem is an independent plugin/provider. `thoth-agents install` orchestrates
its public setup command, but thoth-mem owns the resulting hooks, MCP, skill,
session lifecycle, persistence, receipts, and recovery. thoth-agents does not
copy, edit, force, roll back, or emulate those mechanics.

At runtime the root loads the installed `thoth-mem` skill for prior-work recall,
durable decisions/root causes/conventions/discoveries, verified compaction, and
meaningful semantic completion. Delegates receive bounded `none`, `recall`, or
`observe` authorization separately from workspace write permission; root
lifecycle never transfers. `openspec/` remains canonical, so SDD phase artifacts
are not mirrored into memory.

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

In the interactive `Configure models` flow, `Apply` is always available. When
no role is dirty, it reapplies every currently displayed role value; after an
edit, preview and apply remain limited to the dirty roles. In OpenCode, both
`Apply` and `Apply changes` materialize the complete effective roster and
activate the named `agents` preset.

It does not bypass native marketplace trust or edit manager-owned caches
directly; Codex and Claude own their native manager mutations.

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
