# Skills and MCPs

thoth-agents 0.3.0 does not bundle SDD phase skills. SDD phases are owned by the
`sdd-specify`, `sdd-plan`, and `sdd-tasks` agents, while implementation remains
with the adaptive root or one writer role.

## Required external skills

These skills are mandatory for OpenCode, Codex, and Claude Code:

| Skill | Repository | Intended use |
| --- | --- | --- |
| `simplify` | `https://github.com/brianlovin/claude-config` | Reduce accidental complexity after implementation. |
| `tdd` | `https://github.com/mattpocock/skills` | Test-driven feature and bug-fix workflow. |
| `progressive-context-router` | `https://github.com/EremesNG/skills` | Bootstrap, audit, refactor, or refresh repository instruction routing. |
| `architectural-grilling` | `https://github.com/EremesNG/skills` | Resolve material product, architecture, and delivery branches before specification. |

The installer invokes the Vercel skills CLI with `--global`, a concrete harness
agent, and `--yes`. For example, the TDD dependency is installed as:

```bash
# OpenCode
npx skills add https://github.com/mattpocock/skills --skill tdd --global --agent opencode --yes

# Codex
npx skills add https://github.com/mattpocock/skills --skill tdd --global --agent codex --yes

# Claude Code
npx skills add https://github.com/mattpocock/skills --skill tdd --global --agent claude-code --yes
```

The two EremesNG skills use the same command shape:

```bash
npx skills add https://github.com/EremesNG/skills --skill progressive-context-router --global --agent <opencode|codex|claude-code> --yes
npx skills add https://github.com/EremesNG/skills --skill architectural-grilling --global --agent <opencode|codex|claude-code> --yes
```

`simplify` uses the same flags with its own repository and skill name.

| Harness | Required skill files |
| --- | --- |
| OpenCode | `~/.config/opencode/skills/{simplify,tdd,progressive-context-router,architectural-grilling}/SKILL.md` |
| Codex | `~/.codex/skills/{simplify,tdd,progressive-context-router,architectural-grilling}/SKILL.md` |
| Claude Code | `~/.claude/skills/{simplify,tdd,progressive-context-router,architectural-grilling}/SKILL.md` |

Install, update, sync, and status share this required-skill contract. A missing
skill is drift; a failed required-skill install makes the operation unsuccessful.
Dry-run reports the commands without executing them.

## Why the CLI owns installation

External skills are deliberately not encoded as plugin manifest dependencies or
plugin settings:

- Codex `plugin.json` dependency-like surfaces describe plugin assets, not npm
  lifecycle execution for arbitrary repositories.
- Codex npm marketplace sources are fetched without running lifecycle scripts.
- Claude plugin `dependencies` refers to other plugins, not standalone skills.
- Claude `Setup` hooks run only through explicit initialization flows and are not
  a normal plugin-startup `postinstall`.

The thoth-agents CLI is therefore the deterministic installation and repair
surface. A direct plugin-only installation is incomplete until all four global
skills are present.

## SDD responsibilities

| Phase | Owner | Artifact scope |
| --- | --- | --- |
| Specify and conditional clarification/checklist | `sdd-specify` | `openspec/changes/<feature>/spec.md` and optional `checklists/requirements.md` |
| Plan and optional design-support artifacts | `sdd-plan` | `plan.md`, optional `research.md`, `data-model.md`, `contracts/`, `quickstart.md` |
| Task decomposition | `sdd-tasks` | `tasks.md` |

These are agent roles, not user-invoked phase skills. See
[SDD Pipeline](sdd-pipeline.md).

## Architectural decision gate

`architectural-grilling` is not a required SDD phase and does not replace
ordinary clarification by `sdd-specify`. The adaptive root invokes it before
specification only when the user explicitly asks to be grilled or material
human-owned product/architecture decisions still branch. Merely selecting Full
SDD is not enough.

The interview remains in discovery/decision mode, asks one material question per
turn, and waits for explicit closure. Accepted decisions feed `spec.md` and
`plan.md`; those artifacts remain canonical, so thoth-agents does not create a
second mandatory blueprint artifact.

## User-owned QA

thoth-agents does not install `playwright-cli`, Playwright itself, or another
browser runner. A skill without its corresponding executable cannot guarantee a
working QA surface, while installing a project/global CLI would be invasive.
Each project therefore chooses its browser, visual, integration, and end-to-end
QA tooling. The `designer` and verification roles follow the available project
commands and evidence.

## Handoff assessment

The [Matt Pocock `handoff` skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)
is deliberately user-invoked and writes a compact document to the operating
system temporary directory. thoth-agents does not install or auto-run it.

Its always-needed semantics already belong to the core flow: bounded delegation
prompts, compact child returns, `docs/agent/task-template.md`, and provider-owned
continuity when thoth-mem is installed. The external skill still adds value as
an explicit opt-in when a user wants a portable, redacted cross-session or
cross-harness document. That manual artifact is complementary, not a mandatory
phase or automatic handoff mechanism.

## thoth-agents MCPs

The harness packages may expose the research MCPs used by thoth-agents:

| MCP | Purpose |
| --- | --- |
| `exa` | External research and source discovery. |
| `context7` | Current library documentation. |
| `grep_app` | Public code search. |

Their exact configuration differs by harness. OpenCode composes them at runtime;
Codex and Claude packages render their documented MCP configuration surfaces.

## thoth-mem boundary

thoth-mem is not a bundled skill or MCP of thoth-agents. It is an independently
installed plugin/provider and owns its installation, hooks, MCP server, session
lifecycle, persistence protocol, runtime state, and recovery behavior. Follow the
guidance installed by thoth-mem itself.
