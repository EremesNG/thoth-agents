# OpenCode multi-codex

Use multiple ChatGPT accounts concurrently in OpenCode. Account 1 uses native
`openai`; additional accounts become `openai-codex-2`, `openai-codex-3`, and so on.
Pin different agents to different accounts, inspect quota, and automatically
route around accounts that hit a usage limit without changing OpenCode's globally
active credential. Native OpenCode owns login, token refresh and credentials.

## Requirements

- OpenCode **>=2.2.6** (v2 only) and Node.js **>=22.19.0**.
- ChatGPT accounts connected to OpenCode's native **OpenAI** integration using
  the **legacy ChatGPT/Codex OAuth login**. API keys and the newer ChatGPT
  token-sharing flow (`api.openai.com/v1`, `chatgpt.tokens.use.direct`) are not
  supported by this plugin.

## Install

Add the package to v2 `plugins` in your project or global `opencode.json(c)`;
preserve any existing entries:

```json
{
  "plugins": [
    {
      "package": "@thoth-agents/opencode-multi-codex@0.1.1",
      "options": { "autoSwitchOn429": true }
    }
  ]
}
```

The package exports both the server entry (`.`) and terminal entry (`./tui`).
OpenCode's TUI discovers the latter from the active server plugin inventory;
do not add a `/tui` package specifier to the server's list. To configure the TUI
explicitly (including when connecting to a remote server), use the same package
in your terminal's `cli.json`:

```json
{
  "plugins": ["@thoth-agents/opencode-multi-codex@0.1.1"]
}
```

The server entry is still required: TUI commands call its RPC. Restart OpenCode
after installation. This package is a manual install, not part of the
thoth-agents CLI installer, and can run without thoth-agents. For a local build,
replace the package specifier with the absolute **package directory**, not a
single dist file.

## Set up accounts and model pins

1. Connect your first legacy ChatGPT/Codex account through OpenCode's native
   connect dialog (**OpenAI**). On first initialization, the plugin records the
   active credential as account **1**, provider `openai`.
2. Add another account through the same connect dialog, then run `/codex-add`.
   Choose an unmapped credential if prompted. It receives the lowest free number
   starting at **2**, exposed as `openai-codex-2`.
3. Repeat for further accounts. Run `/codex-status` to inspect mappings and quota.
4. Select a numbered provider/model in OpenCode's model picker or your agent's
   model configuration. With thoth-agents installed, `/subagents-model` can pin,
   for example, explorer to `openai/gpt-6.1-sol` and worker to
   `openai-codex-2/gpt-6.1-sol`. Choose a model available in your Codex catalog.

Numbers persist across restarts. Changing the native globally active credential
does not change existing pins. Missing numbered credentials are reported, never
silently reassigned. If account 1's recorded credential disappears, the plugin
rebinds it to the currently active OpenAI credential and reports the change.

## Commands

| Command | Effect |
| --- | --- |
| `/codex-add` | Map an existing unmapped OpenAI credential; if none exists, show native connect-dialog guidance. |
| `/codex-remove` | Confirm and unmap an account numbered 2 or higher. Does **not** delete its OpenCode credential. |
| `/codex-switch` | Override the current session's Codex account. Choose **Pinned/default** to clear the override; child sessions keep their own pins. Requires an open session. |
| `/codex-status` | Show number, label, provider, credential state, primary/secondary remaining quota and reset times, freshness, blocks and current session override. Refresh non-fresh quota on demand. |

Quota comes from `wham/usage`, HTTP `x-codex-*` response headers and attributed
WebSocket rate-limit events. The cache freshness window is five minutes; unknown
or failed observations are marked unavailable/stale, not shown as known capacity.
Usage fetches time out after ten seconds. No periodic quota polling is installed.

## Configuration and rotation

`options.autoSwitchOn429` is the only supported option, defaulting to `true`.
Set it to `false` in the **server** plugins entry to disable automatic routing
and retry. Unknown keys, non-boolean values or malformed options disable switching
and produce a warning in `/codex-status`; they do not silently enable it.

An observed **usage-limit** 429 blocks the account that actually received it,
shared across sessions in that plugin process. Unrelated 429s do not trigger
rotation. Requests pinned to an unblocked account always stay pinned; there is
no quota-based initial selection. Newly built requests pinned to a blocked
account use the eligible unblocked account with the most fresh remaining quota
(the minimum across known windows). Unknown/stale quota ranks last, then lower
account number breaks ties. Session overrides follow the same block rules.

Blocks expire at the observed reset. If no reset is known, the account is blocked
for five minutes and quota is refreshed before re-eligibility. A primary turn
that hits a usage limit requests an immediate retry, bounded by OpenCode's host
retry budget. If all accounts are blocked, the plugin defers to the host and the
original error surfaces. Account block state and session overrides are in-memory;
only account mappings persist in plugin storage (IDs and labels, not tokens).

## Limitations

- Compaction, generate and title requests are **not re-routed mid-retry**:
  compaction reuses its prepared request, generate retries outside the plugin
  callback, and title does not invoke it. Newly built requests use the current
  block state, but already prepared work can surface a 429 under host behavior.
- **Cross-account encrypted reasoning/continuation replay is unverified live.**
  The plugin currently preserves that state; it does not claim to strip it or
  guarantee a rotated continuation succeeds. Two-account live validation is
  still required.
- Alias Codex rules mirror **OpenCode v2.2.6** (transport, headers, model filtering,
  costs, reasoning variants and context caps). Future host changes can drift.
- Backend usage endpoints and `x-codex-*` headers are **unofficial** and may
  change or be unavailable. Quota display is not a billing guarantee.
- Removing a numbered account only unmaps it; its native credential remains.
  The free number can be reused, so update agent pins before assigning it to a
  different account. Account 1 cannot be removed with `/codex-remove`.
- WebSocket attribution relies on v2.2.6's per-session serialized handshake and
  exchange behavior; switching headers can reopen the socket. Blocks are not
  synchronized across separate OpenCode server processes.
