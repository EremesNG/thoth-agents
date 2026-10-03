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
  collapses and expands results. Other tools that bring their own renderers
  (subagents, Ask* tools, background-task logs) keep them; tools without one,
  such as MCP tools, get a generic frame with the tool name, a one-line
  argument summary, a collapsed text preview, error styling and a live elapsed
  footer. Images keep Pi's native rendering. Requires Pi >= 1.0.1.
- **Inline images**: image content from `read` is preserved for Pi's native
  inline rendering. In Orca (including Windows), outside tmux and without an
  explicit `PI_IMAGE_PROTOCOL`, the package selects Kitty when Pi has not already
  detected an image protocol. The fallback is applied at session startup and
  before each agent loop, restoring it after `/reload`. Explicit protocols and
  existing capabilities are respected; unsupported terminals keep Pi's native
  text fallback. Pi's image-display settings still apply. Disabling this module
  skips the Orca fallback, not Pi's native image support.
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
  "tools": { "enabled": true },
  "images": { "enabled": true },
  "welcome": { "enabled": true }
}
```

`icons` accepts `"nerd"` (default) or `"ascii"`. Each module's `enabled` key
accepts a boolean and defaults to `true`. Set it to `false` to leave Pi's native
behavior on that surface. `statusLine.subscriptionProviders` accepts an array of
provider identifier strings (defaults to `["claude-bridge"]`) to mark
subscription-backed usage with `(sub)` in the status line cost segment.
Configuration is read at extension load; use `/reload` after edits. Missing,
malformed or invalid values use defaults. Pi settings are never read for
package configuration.

**A Nerd Font is required for the default icons.** Configure your terminal to
use one, or set `"icons": "ascii"` for plain-text alternatives.

### Fullscreen images in Orca

Pi disables iTerm2 images in fullscreen by design. Setting
`terminal.images: "iterm2"` in `~/.pi/agent/settings.json` or setting the
environment variable `PI_IMAGE_PROTOCOL=iterm2` therefore yields no images
in fullscreen. Remove the `terminal.images` entry, leave `PI_IMAGE_PROTOCOL`
unset and restart Pi so this package's Orca Kitty fallback can apply. Keep the
package's `images` module enabled.

Pi's `terminal.showImages` setting must also be `true` (the default). The Orca
fallback deliberately excludes tmux: it does not apply when `TMUX` is set.

To verify, run Pi fullscreen in Orca outside tmux and ask `read` to open a PNG
and a JPEG. Both should appear below the tool's framed text.

## Attribution

MIT; see [LICENSE](LICENSE). Includes code adapted from the primary upstream,
[pi-omp-theme](https://github.com/QuangThai/pi-omp-theme) by QuangThai, and
pi-pretty by huynhgiabuu. pi-atelier by Michael and gentle-shell by Mario Zechner
are references only, not bundled code.
