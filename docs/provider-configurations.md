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

## OpenCode fallback configuration

Set `fallback` in `thoth-agents.json` (not in a profile file):

```json
{
  "fallback": {
    "enabled": true,
    "timeoutMs": 15000,
    "retryDelayMs": 500,
    "chains": { "worker": ["provider/backup"] }
  }
}
```

The defaults are `enabled: true`, `timeoutMs: 15000`, `retryDelayMs: 500`,
and empty per-role `chains`. OpenCode switches models on retryable provider
errors; its retry hook switches immediately (`delay: 0`), rather than using
these timeout/delay settings as a timer.

With fallback enabled, each role's chain is its explicit `agents.<role>.model`
array (or configured/shipped scalar primary), followed by `fallback.chains`
for that role. A named project/global profile prepends its resolved model.
Duplicate model IDs are removed, keeping the profile's variant when present.
With `enabled: false`, profile/scalar roles do not switch models and
`fallback.chains` is ignored. Explicit model arrays still allow retries,
including a named profile's model first when selected. Profile injection itself
is unchanged. The virtual `default` profile leaves the configured chain intact.

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

## Manage tool permissions inside OpenCode

Run **`/subagents-tools`** in OpenCode's interactive TUI, beside
`/subagents-model`. It works on the home route without a session and edits the
five specialists: `explorer`, `librarian`, `oracle`, `designer`, and `worker`.
The orchestrator is not editable. This is an OpenCode permission editor, not
Pi's tool allowlist.

1. Choose a specialist from the overview (`G` global, `P` project, override
   count and effect summary), then choose the scope to edit.
2. Select an action and choose **allow**, **ask**, **deny**, or **Inherit**.
   Markers are `●` exact override, `○` via pattern, `·` default, `🔒` locked.
   Inherit removes exact entries for that action; matching patterns still apply.
3. Use **Add pattern** for an action name or wildcard such as `github_*`.
   Match counts refer to registered actions, not individual tool names; zero
   matches are allowed for tools that may connect later.
4. **Save** to persist the draft. Leaving with edits offers Save, Discard, or
   Keep editing. If another writer changed the file (`TOOLS_CONFLICT`), reload
   before retrying. Saving reloads agents; changes apply from the next context
   selection, not by mutating an in-flight request.

### Tool override files and layering

Tool overrides are independent of model profiles and `thoth-agents.json`:

| Scope | File |
| --- | --- |
| Global | `<opencode-config-dir>/thoth/tools.json` |
| Project | `<project>/.opencode/thoth/tools.json` |

The config directory uses the same resolution as profile files above. Both
files use this schema; omitted roles inherit:

```json
{
  "version": 1,
  "roles": {
    "explorer": {
      "overrides": [
        { "action": "github_*", "effect": "ask" },
        { "action": "webfetch", "effect": "deny" }
      ]
    }
  }
}
```

A project entry **replaces the entire global list for that role**, even when
its `overrides` list is empty. Other roles are unaffected. Within the effective
list, order matters: **last matching rule wins**. Patterns match the whole
action: `*` includes `/`, `?` matches one character, and matching is
case-insensitive on Windows.

With no effective overrides, shipped permissions stay unchanged. Otherwise,
rules are shipped role permissions → ordered overrides with `resource: "*"`
→ final locked `subagent` deny. Specialists cannot delegate, even through an
`*` allow pattern; the permission-evaluation hook also keeps that restriction.
A `deny` at resource `*` hides the tool from the model; `ask` prompts for approval.
These are host permissions, not an OS sandbox.

**Reset to defaults** removes the selected scope's entry for that role and
persists immediately after confirmation. Resetting project scope resumes global
inheritance, so it need not restore shipped defaults. To suppress global
customization for one project, use **Mask global overrides for this project
(save empty list)** in the project scope; **Remove project entry (use global)**
undoes it.

### Permission caveats and inventory limits

- Entries name **permission actions**, not necessarily tool names: `write`,
  `patch`, and `edit` share `edit`; `bash` uses `shell`. The panel groups member
  tools under each action. MCP tools use names such as `server_tool`.
- Overrides always use resource `*`, not argument-level restrictions. A matching
  `external_directory` override supersedes designer/worker's shipped
  resource-specific allow: `ask` prompts, `deny` blocks, and `allow` broadens access.
- Displayed effects are **role-level**. OpenCode session permissions can
  supersede them; the panel is not a session-specific policy editor.
- Disconnected or undiscovered MCP tools are absent from the inventory. Add a
  manual action/pattern for them; a zero match count does not mean invalid.
- **Code Mode catalog tools:** `deny` may not remove them. This is a known,
  version-sensitive limitation to verify in a live smoke on your OpenCode version,
  not a guaranteed tool-removal boundary.
- Invalid files or entries produce warnings; inspect them before saving. Writes
  are atomic and revision-checked to avoid silently overwriting another writer.

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
