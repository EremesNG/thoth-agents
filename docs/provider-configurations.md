# Provider Configuration

The OpenCode >=2.2.6 integration ships one built-in model profile: `openai`.
Kimi, GitHub Copilot, ZAI/GLM, and mixed-provider mappings are not generated;
you can create your own profiles using models available to your account.

## Default OpenAI mapping

| Role | Model | Effort/variant |
| --- | --- | --- |
| `orchestrator` | `openai/gpt-6.1-sol` | `high` |
| `explorer` | `openai/gpt-6-luna` | `max` |
| `librarian` | `openai/gpt-6-luna` | `max` |
| `oracle` | `openai/gpt-6.1-sol` | `xhigh` |
| `designer` | `openai/gpt-6-luna` | `max` |
| `worker` | `openai/gpt-6-luna` | `max` |

Model IDs and supported variants depend on the active harness catalog.
These are reasoning-effort defaults, not measured task price, latency, token,
or quality guarantees. `quick` and `deep` are not accepted effort aliases.
Other harnesses retain their native model configuration: valid explicit role
variants win, and model-only Codex overrides do not invent effort for an unknown
custom model.

## OpenCode profile files and selection

Profiles store only model and variant assignments for the six roles, including
`orchestrator`. They do not contain prompts, tools, or permissions.

| Scope | File |
| --- | --- |
| Global | `<opencode-config-dir>/thoth/profiles.json` |
| Project | `<project>/.opencode/thoth/profiles.json` |

The OpenCode config directory resolves from `OPENCODE_CONFIG_DIR`, then
`$XDG_CONFIG_HOME/opencode`, then `~/.config/opencode`.
Both files use this schema (assignments may be partial):

```json
{
  "version": 1,
  "active": "focused",
  "profiles": {
    "focused": {
      "agents": {
        "orchestrator": { "model": "openai/gpt-6.1-sol", "variant": "high" },
        "worker": { "model": "openai/gpt-6-luna", "variant": "max" }
      }
    }
  }
}
```

A project profile shadows a global profile with the same name. Effective
selection is **session → project pin → global active → `default`**. The project
file's `active` field is the project pin; the global file's `active` field is the
global selection. Missing selections warn and fall through. Session selections
are stored per session in OpenCode plugin storage, not in these files.

`default` is a reserved, virtual, read-only profile representing the effective
`thoth-agents.json` roster. For each role, resolution is profile assignment →
`thoth-agents.json` role configuration → shipped defaults. Profile values win
over root model settings; other role configuration remains unchanged.

**Model and variant form a pair.** An entry containing `model` owns its variant:
omitting `variant` means no variant, not the inherited model's variant. A
variant-only entry applies to the inherited model. An absent role inherits its
base model and variant together.

The effective profile sets role defaults at plugin setup, including the first
cold session's orchestrator. Native `subagent` calls without an explicit model
receive the parent session's effective role model as `provider/id#variant`
(without the suffix when there is no variant). Explicit call models are untouched.
Activation switches the current session's orchestrator; project/global changes
also reload agent defaults. An unavailable model leaves activation state
unchanged and produces a warning.

## Manage profiles inside OpenCode

Run **`/subagents-model`** in OpenCode's interactive TUI. The package's `./tui`
entry loads automatically; this is not a headless/server command.

- Overview markers: `●` effective, `S` session selection, `P` project pin,
  `G` global active, `~` shadowed global profile.
- Open a profile to inspect all six role rows and edit models (provider → model)
  and variants. Create from `default`, clone, rename, or delete saved profiles.
  Clone `default` to customize it; it cannot be edited directly.
- Capture the current session model into the orchestrator row when needed.
- Edits remain drafts until **Save**; discarding changes requires confirmation.
  If another writer changes the file, reload on conflict before retrying.
- Use the action rows to activate for the session, pin the project, activate
  globally, or clear those selections. There are no single-letter action hotkeys.
- On the home route without a session, profile management and project/global
  actions remain available; session-only actions are disabled.

## CLI customization

```bash
npx thoth-agents@latest model --harness=opencode --role=worker --model=openai/gpt-6-luna --effort=max
npx thoth-agents@latest model --harness=codex --role=worker --model=gpt-6-luna --effort=max
```

The OpenCode CLI manages **global profiles only**; use `/subagents-model` for
project pins and session selection. Install/sync write the built-in `openai`
profile and activate it only when there is no valid global selection. Applying
from the CLI's Ink model editor materializes a complete six-role `agents`
profile and activates it globally, even if no role is dirty. Status and readback
recognize that managed profile; update and shipped-default restore operate on
profiles and preserve valid operator overrides during update. A project pin or
session selection still takes precedence over a CLI global activation.

## Policy

- Root routing behavior is invariant across model overrides.
- `oracle` remains read-only and owns every verification.
- Model choice does not create permission or capability equivalence between
  harnesses.
- Provider-owned memory is external and is never inferred from a model mapping.
