<div align="center">
  <img src="img/thoth-agents-header.webp" alt="The ten-role cyber-Egyptian pantheon of thoth-agents" width="100%">
  <h1>Thoth-Agents</h1>
  <p><i>Adaptive orchestration for OpenCode, Codex, and Claude Code.</i></p>
  <p><b>Ten roles</b> · <b>Three SDD routes</b> · <b>One shared contract</b></p>
  <p>
    <a href="https://www.npmjs.com/package/thoth-agents"><img src="https://img.shields.io/npm/v/thoth-agents?style=for-the-badge&amp;color=cb9b35&amp;label=npm" alt="npm version"></a>
    <a href="https://github.com/EremesNG/thoth-agents/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/EremesNG/thoth-agents/ci.yml?branch=master&amp;style=for-the-badge&amp;label=CI" alt="CI status"></a>
    <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D22.13-43853d?style=for-the-badge&amp;logo=node.js&amp;logoColor=white" alt="Node 22.13 or newer"></a>
    <a href="package.json"><img src="https://img.shields.io/badge/pnpm-11.2.2-f69220?style=for-the-badge&amp;logo=pnpm&amp;logoColor=white" alt="pnpm 11.2.2"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f6feb?style=for-the-badge" alt="MIT License"></a>
  </p>
  <p>
    <a href="#quick-start">Install</a> ·
    <a href="#the-ten-agents-of-thoth">Agents</a> ·
    <a href="#how-orchestration-works">SDD</a> ·
    <a href="#harness-support">Harnesses</a> ·
    <a href="#documentation">Docs</a>
  </p>
</div>

---

## What is Thoth-Agents?

Thoth-Agents is an adaptive multi-harness orchestration plugin for OpenCode,
Codex, and Claude Code. It carries one canonical ten-role contract across all
three harnesses, then translates that contract into each platform's native
agents, configuration, plugin packaging, and installation surfaces.

The root handles clear, bounded work directly. It delegates only when
specialization, context isolation, independent review, or safe parallelism
creates a net gain. Delegation stays one level deep, and each mutable surface
has one writer.

> [!NOTE]
> The contract is shared, but runtime guarantees are not identical. OpenCode is
> the default and strongest runtime-integrated path; Codex and Claude Code expose
> different native controls and instruction-level fallbacks.

### Highlights

- **[Ten canonical roles](#the-ten-agents-of-thoth)** — one adaptive root, three
  evidence specialists, three governed SDD coordinators, and three
  implementation writers.
- **[Direct, accelerated, and full SDD](#how-orchestration-works)** — scale the
  workflow to task clarity, scope, contract risk, and failure cost.
- **[Three supported harnesses](#harness-support)** — OpenCode, Codex, and Claude
  Code share intent without pretending their enforcement is equivalent.
- **Adaptive delegation** — maximum depth one, children never delegate, and
  overlapping writes are never parallelized.
- **[Mandatory external skills](#required-external-skills)** — `simplify`,
  `tdd`, `progressive-context-router`, and `architectural-grilling`.
- **[Provider-neutral memory boundary](#memory-provider-boundary)** — thoth-mem
  remains an independent provider with its own lifecycle.
- **[OpenAI-only built-in preset](#model-policy)** — explicit role overrides
  remain available without shipping unverified provider presets.

## Quick start

Node.js `>=22.13` is required.

> [!IMPORTANT]
> A complete installation includes the harness-native plugin layer and the
> thoth-agents CLI-owned layer. The CLI remains required because plugin packages
> cannot materialize every user-level orchestration surface or install the four
> external skills.

### OpenCode

```bash
npx thoth-agents@latest install --agent=opencode
```

The CLI adds the npm plugin entry, writes the OpenAI-only ten-role
configuration, and installs the required skills.

### Codex

```bash
# 1. Register the native repository marketplace.
codex plugin marketplace add EremesNG/thoth-agents

# 2. Restart Codex, open /plugins, and install/enable thoth-agents.

# 3. Preview and apply the CLI-managed surfaces.
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The native plugin provides packaged research MCP configuration. The CLI installs
`~/.codex/AGENTS.md`, nine specialist TOMLs, managed feature configuration,
model ownership state, and the required global skills.

### Claude Code

Run the native plugin commands before the thoth-agents CLI:

```bash
# 1. Register the marketplace.
claude plugin marketplace add EremesNG/thoth-agents --scope user

# 2. Install the plugin.
claude plugin install thoth-agents@thoth-agents --scope user

# 3. Preview and apply the CLI-managed dependencies.
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

Restart Claude Code or run `/reload-plugins`, then inspect `/plugin`. The plugin
provides the root, nine subagents, settings, and research MCPs; the CLI installs
and verifies the required global skills.

### Verify the installation

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
```

- **OpenCode:** confirm the generated ten-role configuration and required skills
  are healthy.
- **Codex:** review `/plugins` and `/hooks` after trust approval.
- **Claude Code:** reload the plugin and confirm it under `/plugin`.

See [Installation](docs/installation.md), [Codex Install](docs/codex-install.md),
and [Claude Code Install](docs/claude-code-install.md) for repair,
troubleshooting, scopes, and limitations.

---

## The ten agents of Thoth

One adaptive root and nine specialists are organized around evidence, governed
SDD coordination, and implementation. The portraits use a shared cyber-Egyptian
mythology theme; the descriptions remain grounded in the canonical runtime
contract.

| Role group | Roles | Responsibility |
| --- | --- | --- |
| Root | `orchestrator` | Work directly when bounded, route specialist work, and synthesize results. |
| Read-only evidence | `explorer`, `librarian`, `oracle` | Repository discovery, authoritative research, diagnosis, architecture, and independent review. |
| SDD coordination | `sdd-specify`, `sdd-plan`, `sdd-tasks` | Write governed artifacts and append convergence tasks under `openspec/`; never implement product code. |
| Writers | `designer`, `quick`, `deep` | UI/UX work, narrow changes, correctness-critical implementation, and verified mechanical archive closeout. |

### Adaptive root

<table width="100%">
  <tr>
    <td width="34%" align="center" valign="top">
      <img src="img/agents/orchestrator.webp" width="320" alt="Cyber-Egyptian Orchestrator">
    </td>
    <td width="66%" valign="top">
      <b>Orchestrator</b>
      <br>
      <i>Adaptive root and final synthesis.</i>
      <br><br>
      Keeps the task coherent, works directly when scope is clear and bounded,
      and delegates only when specialization or parallelism creates a net gain.
      <br><br>
      <b>Mode:</b> <code>adaptive-root</code>
    </td>
  </tr>
</table>

### Read-only evidence

<table width="100%">
  <tr>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/explorer.webp" width="100%" alt="Cyber-Egyptian Explorer">
      <br>
      <b>Explorer</b>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/librarian.webp" width="100%" alt="Cyber-Egyptian Librarian">
      <br>
      <b>Librarian</b>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/oracle.webp" width="100%" alt="Cyber-Egyptian Oracle">
      <br>
      <b>Oracle</b>
    </td>
  </tr>
</table>

- **Explorer** — *Fast local discovery.* Resolves broad or uncertain repository
  questions and returns distilled local evidence. **Mode:** `read-only`.
- **Librarian** — *Authoritative external research.* Gathers current
  authoritative sources and separates documented facts from inference.
  **Mode:** `read-only`.
- **Oracle** — *Diagnosis and independent judgment.* Reviews architecture and
  correctness risk, then independently judges whether the result satisfies its
  contracts. **Mode:** `read-only`.

### Governed SDD coordination

<table width="100%">
  <tr>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/sdd-specify.webp" width="100%" alt="Cyber-Egyptian SDD Specify">
      <br>
      <b>SDD Specify</b>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/sdd-plan.webp" width="100%" alt="Cyber-Egyptian SDD Plan">
      <br>
      <b>SDD Plan</b>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/sdd-tasks.webp" width="100%" alt="Cyber-Egyptian SDD Tasks">
      <br>
      <b>SDD Tasks</b>
    </td>
  </tr>
</table>

- **SDD Specify** — *Testable requirements contract.* Produces or refines a
  Spec Kit-compatible feature specification without implementing product code.
  **Mode:** `coordination-write` under `openspec/`.
- **SDD Plan** — *Executable technical design.* Turns an accepted specification
  into an executable technical plan and design-support artifacts. **Mode:**
  `coordination-write` under `openspec/`.
- **SDD Tasks** — *Ordered implementation and convergence.* Converts the
  specification and plan into dependency-ordered work, then appends traceable
  convergence tasks. **Mode:** `coordination-write` under `openspec/`.

### Implementation writers

<table width="100%">
  <tr>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/designer.webp" width="100%" alt="Cyber-Egyptian Designer">
      <br>
      <b>Designer</b>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/quick.webp" width="100%" alt="Cyber-Egyptian Quick">
      <br>
      <b>Quick</b>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="img/agents/deep.webp" width="100%" alt="Cyber-Egyptian Deep">
      <br>
      <b>Deep</b>
    </td>
  </tr>
</table>

- **Designer** — *UI/UX implementation and visual quality.* Owns user-facing
  implementation decisions, screenshots, and visual verification. **Mode:**
  `write-capable`.
- **Quick** — *Fast bounded implementation.* Implements narrow changes and
  performs mechanical archive closeout only from a passing verification report.
  **Mode:** `write-capable`.
- **Deep** — *Correctness-critical implementation.* Handles multi-file,
  edge-case-heavy, or high-risk implementation with full local context.
  **Mode:** `write-capable`.

Children do not delegate. Parallel work is reserved for independent surfaces,
and overlapping writes are never parallelized.

---

## How orchestration works

The root classifies each request by intent, scope, clarity, contract risk, and
failure cost.

```text
direct:      implement -> verify
accelerated: specify -> plan -> tasks -> implement -> verify -> archive
full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive
```

| Route | Use when | Governance |
| --- | --- | --- |
| **Direct** | Clear, local, low-risk work | No SDD artifacts or archive; finish after focused verification. |
| **Accelerated** | Bounded multi-file or moderate-risk work | Persist `spec.md`, `plan.md`, `tasks.md`, `verify-report.md`, and `archive-report.md`. |
| **Full** | Explicit SDD, material uncertainty, cross-cutting scope, or high risk | Add exploration and analysis to the same governed artifact lifecycle. |

- Clarification and requirements checklists are conditional on artifact-backed
  routes.
- Failed accelerated or full verification appends traceable convergence tasks,
  then returns to implementation and verification.
- `architectural-grilling` runs before specification only when explicitly
  requested or material human-owned decisions remain unresolved. Full SDD alone
  does not activate it.
- User input is requested only when an unresolved material choice would change
  the result.
- SDD phases are owned by `sdd-specify`, `sdd-plan`, and `sdd-tasks`; they are
  not bundled phase skills.
- Passing artifact-backed work archives under
  `openspec/changes/archive/YYYY-MM-DD-<feature>/`.

See [SDD Pipeline](docs/sdd-pipeline.md) for the artifact graph, phase envelope,
convergence rules, and ownership boundaries.

## Harness support

| Harness | Native/plugin layer | CLI-owned layer | Important limitation |
| --- | --- | --- | --- |
| **OpenCode** | npm plugin entry, runtime delegation, tools, MCPs, and hooks | Ten-role configuration, optional tmux setup, and required skills | Default and strongest integrated path; OpenAI is the only built-in preset. |
| **Codex** | Repository marketplace plugin and packaged research MCPs | Root `AGENTS.md`, nine specialist TOMLs, feature configuration, model state, and required skills | The ambient session is the root; some role selection and enforcement remain instruction-level. |
| **Claude Code** | Marketplace plugin with the root, nine subagents, settings, and research MCPs | Required global skills plus native-state verification and repair | Add and install the plugin before the CLI; cache and role-model defaults are manager-owned. |

Native plugin installation never makes the CLI optional. Plugin marketplaces do
not provide a reliable general-purpose `postinstall` for standalone skill
repositories, and user-level surfaces remain CLI-owned.

The generated contract is shared, but capability gaps stay explicit. See
[Installation](docs/installation.md), [Codex Plugin Packaging](docs/codex-plugin-packaging.md),
and [Claude Code Plugin Packaging](docs/claude-code-plugin-packaging.md).

## Dependencies and boundaries

### Required external skills

Every install, update, and sync path requires:

| Skill | Source | Purpose |
| --- | --- | --- |
| `simplify` | [`brianlovin/claude-config`](https://github.com/brianlovin/claude-config) | Keep implementation lean and remove accidental complexity. |
| `tdd` | [`mattpocock/skills`](https://github.com/mattpocock/skills) | Test-driven feature and bug-fix workflow. |
| `progressive-context-router` | [`EremesNG/skills`](https://github.com/EremesNG/skills) | Maintain small repository instructions and verified on-demand context. |
| `architectural-grilling` | [`EremesNG/skills`](https://github.com/EremesNG/skills) | Resolve high-impact product, architecture, and delivery decisions before specification. |

A missing skill is an unhealthy installation and causes the CLI operation to
fail. thoth-agents does not install `playwright-cli`, Playwright, or another
project QA executable.

For exact commands and per-harness locations, see
[Skills and MCPs](docs/skills-and-mcps.md).

### Model policy

The generated OpenCode configuration contains only the `openai` preset. Kimi,
GitHub Copilot, ZAI/GLM, and mixed-provider mappings are not shipped as built-in
presets. Explicit role-level model overrides remain available.

See [Provider Configuration](docs/provider-configurations.md) and
[Codex Model Customization](docs/codex-model-customization.md).

### Memory provider boundary

thoth-mem is an independent plugin/provider. It owns its installation, hooks,
MCP configuration, lifecycle, persistence, and recovery behavior. thoth-agents
coordinates only provider-neutral outcomes such as truthful capability
reporting, role authorization, and resumable handoffs; it does not install or
emulate thoth-mem.

## Operations and customization

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
npx thoth-agents@latest update --harness=codex
npx thoth-agents@latest sync --harness=claude
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

Mutating operations preserve unrelated user content and use managed ownership
markers or state files. `--reset` repairs only thoth-agents-managed targets; it
is not a broad force option.

See [Quick Reference](docs/quick-reference.md) and
[Provider Configuration](docs/provider-configurations.md).

## Documentation

### Getting started

- [Installation](docs/installation.md)
- [Quick Reference](docs/quick-reference.md)

### How-to guides

- [Codex Install](docs/codex-install.md)
- [Claude Code Install](docs/claude-code-install.md)
- [Codex Model Customization](docs/codex-model-customization.md)

### Reference

- [Skills and MCPs](docs/skills-and-mcps.md)
- [Provider Configuration](docs/provider-configurations.md)
- [Codex Plugin Packaging](docs/codex-plugin-packaging.md)
- [Claude Code Plugin Packaging](docs/claude-code-plugin-packaging.md)

### Explanation

- [SDD Pipeline](docs/sdd-pipeline.md)

## Development

```bash
pnpm install
pnpm run check:ci
pnpm run typecheck
pnpm run build
pnpm test
```

The repository requires Node.js `>=22.13` and `pnpm@11.2.2`.
`pnpm run build` regenerates integration packages, compiles the runtime, and
generates TypeScript declarations and the JSON schema.

## License

[MIT](LICENSE)
