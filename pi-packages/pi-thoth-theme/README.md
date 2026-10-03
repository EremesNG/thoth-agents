# @thoth-agents/pi-thoth-theme

Modular Thoth styling for Pi, with a gold-on-black Egyptian dark theme.

## Install

From the thoth-agents repository root:

```sh
pi install ./pi-packages/pi-thoth-theme
```

Select the `thoth` theme in Pi's theme settings. Theme selection is independent
of the module toggles below.

## Modules

- **Status line**: a responsive footer row below the input showing model and
  thinking effort, git branch, context usage, cumulative session cost and compact
  extension statuses. It omits the working-directory path and does not claim the
  custom editor slot.
- **Tools**: boxed calls and results for `read`, `bash`, `powershell`, `ls`,
  `grep`, `find`, `edit` and `write`, with Nerd Font icons or ASCII
  alternatives. `bash` and `powershell` show a live elapsed time while running. Execution and
  parameters delegate to Pi's built-in tools; Pi's native output toggle still
  collapses and expands results. Registered non-built-in tools keep their own
  renderers when their package matches `tools.respectPackages` (including
  thoth-agents and thoth-mem by default). Other tools get a generic frame with
  the tool name, a one-line argument summary, a collapsed text preview, error
  styling and a live elapsed footer. Images keep Pi's native rendering.
  Requires Pi >= 1.0.1.
- **Welcome**: a header with the Thoth logo, Pi version, loaded resources and
  tool providers, and recent sessions. Resource and session details load
  best-effort through public APIs.

## Configuration

Edit `~/.pi/agent/pi-thoth-theme.json` (or
`$PI_CODING_AGENT_DIR/pi-thoth-theme.json` when that environment variable is set):

```json
{
  "icons": "nerd",
  "statusLine": {
    "enabled": true,
    "subscriptionProviders": ["claude-bridge"]
  },
  "tools": {
    "enabled": true,
    "respectPackages": ["thoth-agents", "@thoth-agents/*", "thoth-mem"]
  },
  "welcome": { "enabled": true }
}
```

`icons` accepts `"nerd"` (default) or `"ascii"`. Each module's `enabled` key
accepts a boolean and defaults to `true`. Set it to `false` to leave Pi's native
behavior on that surface. `statusLine.subscriptionProviders` accepts an array of
provider identifier strings (defaults to `["claude-bridge"]`) to mark
subscription-backed usage with `(sub)` in the status line cost segment.

`tools.respectPackages` accepts an array of non-empty package-name strings.
The default is `["thoth-agents", "@thoth-agents/*", "thoth-mem"]`. Entries match
exact package names or a trailing `/*` scope wildcard: `@scope/*` matches
`@scope/anything`, but not `@scopex/anything`. No other globs are supported.
A user list **fully replaces** the default; `[]` gives every registered
non-built-in tool a generic frame, even if it supplies its own renderers.
Invalid values (including any empty, whitespace-only or non-string entry) use
the full default list. Package names come from the nearest `package.json`
walking upward from the tool's source directory. Built-ins always use the
themed frames; tools absent from Pi's registry keep their own renderers.

Configuration is read at extension load; use `/reload` after edits. Missing,
malformed or invalid values use defaults. Pi settings are never read for
package configuration.

**A Nerd Font is required for the default icons.** Configure your terminal to
use one, or set `"icons": "ascii"` for plain-text alternatives.

## Attribution

MIT; see [LICENSE](LICENSE). Includes code adapted from the primary upstream,
[pi-omp-theme](https://github.com/QuangThai/pi-omp-theme) by QuangThai, and
pi-pretty by huynhgiabuu. pi-atelier by Michael and gentle-shell by Mario Zechner
are references only, not bundled code.
