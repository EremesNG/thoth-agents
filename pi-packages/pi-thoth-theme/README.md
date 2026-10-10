# @thoth-agents/pi-thoth-theme

Modular Thoth styling for Pi, with a gold-on-black Egyptian dark theme.

Requires Pi `>=0.99.0` and Node `>=22.19.0`. Development Pi SDK/TUI
dependencies are pinned to `1.0.2` in the root workspace lockfile.

## Install

Thoth's complete Pi Install and applied Update install and individually verify
`npm:@thoth-agents/pi-thoth-theme@>=0.3.0`. An existing copy from any source at or
above that floor is preserved without reinstalling; an older copy remains
untouched and blocks completion with manual upgrade guidance. Ambiguous identity
fails closed. Upgrade a local/Git checkout in place, or review ownership before
switching its configured source with Pi's native remove/install commands; verify
the installed manifest and rerun setup. Dry-run performs no mutation.

For a standalone install:

```sh
pi install 'npm:@thoth-agents/pi-thoth-theme@>=0.3.0'
```

For workspace development, build first and run `pi install ./pi-packages/pi-thoth-theme`
from the repository root. Restart Pi after installation.

Select the `thoth` theme in Pi's theme settings. Theme selection is independent
of the module toggles below.

## Modules

- **Status line**: a responsive footer below the input showing cumulative
  session cost (including subagents), main-session input/output totals, cache hit
  percentage and output speed in `tok/s`. Input includes uncached, cache-read and
  cache-write tokens; the hit percentage is cache-read divided by total input
  (`—` when total input is zero). Subagent tokens are excluded. Narrow widths
  drop speed, then cache, then tokens before truncating cost. Editor-border
  metadata is decorated in place without claiming the custom editor slot.
- **Tools**: boxed calls and results for `read`, `bash`, `powershell`, `ls`,
  `grep`, `find`, `edit` and `write`, with Nerd Font icons, native Unicode
  glyphs or ASCII alternatives. `bash` and `powershell` show a live elapsed time
  while running. Execution and parameters delegate to Pi's built-in tools;
  Pi's native output toggle still
  collapses and expands results. Registered non-built-in tools keep their own
  renderers when their package matches `tools.respectPackages` (including
  thoth-agents and thoth-mem by default). Other tools get a generic frame with
  the tool name, a one-line argument summary, a collapsed text preview, error
  styling and a live elapsed footer. Images keep Pi's native rendering.
  Tool renderers require Pi `>=1.0.1`; they are runtime-guarded and inert on
  older supported Pi versions.
- **Welcome**: a header with the Thoth logo, Pi version, loaded resources and
  tool providers, and recent sessions. Resource and session details load
  best-effort through public APIs.

## Subagent usage channel

The status line subscribes to pi-core's v1 `thoth:subagents:usage` channel and
requests a snapshot on `thoth:subagents:usage:request` at session start, after
subscribing, using `data: {}`. The producer is `@thoth-agents/pi-subagents`;
envelopes are `{ v, source, sessionId, at, data }`, with the parent session ID
in the envelope, Unix-millisecond `at`, and only cumulative `totalCost` and
`runCount` in data. Pre-readiness requests are answered once after usage restore.
Invalid, unsupported-version and foreign-session envelopes are ignored; no task
prompts, results, transcripts or logs are consumed.

The raw `thoth:subagent-usage` bus event/request is removed with no fallback or
dual publication. Upgrade pi-subagents and pi-thoth-theme to `>=0.3.0` together
and `/reload`; mixed old/new versions lose subagent cost display. The persisted
usage checkpoint custom-entry type remains `thoth:subagent-usage`, so checkpoint
restore and replay-duplicate suppression are unchanged. See
[pi-core's exact contract](../pi-core/README.md#task-summary-and-usage-channels).

## Render KIT

Provides the Render KIT v1 contract defined by `@thoth-agents/pi-core` for
first-party tools, custom messages and above-editor widgets. The kit shares this
package's frames, theme roles, collapse hints and working/elapsed indicators.
The Render KIT v1 semantic icon table includes `elapsed` for work-panel metrics,
with nerd-clock, Unicode and ASCII alternatives.
Producers discover it at render time, so extension load order does not matter;
they do not depend on this package and keep native Pi rendering when it is absent.

The theme registers the kit on `session_start` only in interactive UI sessions
with `tools.enabled: true`, and withdraws only its own registration on
`session_shutdown`. Headless children neither replace nor withdraw the parent
kit, and their lifecycle does not stop the parent's indicators. Theme selection
alone does not enable the kit when tool styling is disabled.

## Configuration

Edit `~/.pi/agent/pi-thoth-theme.json` (or
`$PI_CODING_AGENT_DIR/pi-thoth-theme.json` when that environment variable is set):

```json
{
  "icons": "nerd",
  "statusLine": {
    "enabled": true,
    "subscriptionProviders": ["claude-bridge", "antigravity"]
  },
  "inputBox": { "enabled": true },
  "tools": {
    "enabled": true,
    "respectPackages": ["thoth-agents", "@thoth-agents/*", "thoth-mem"]
  },
  "welcome": { "enabled": true }
}
```

`icons` accepts `"nerd"` (default), `"unicode"` (native Render KIT glyphs,
status symbols and animation frames, with Unicode substitutes for Nerd glyphs),
or `"ascii"` (plain-text alternatives).
Missing or malformed icon values use `"nerd"`. Each module's `enabled` key
accepts a boolean and defaults to `true`. Set it to `false` to leave Pi's native
behavior on that surface. `statusLine.subscriptionProviders` accepts an array of
provider identifier strings (defaults to `["claude-bridge", "antigravity"]`) to mark
subscription-backed usage with `(sub)` in the status line cost segment.
Classification uses the current provider for the displayed total, not a
per-message billing split; explicit user lists are preserved. Antigravity costs
are API-equivalent catalog estimates, not subscription charges.

`inputBox.enabled` defaults to `true` and requires `statusLine.enabled` to be
`true`. It frames the native editor in a rounded `muted` (sand) box with side borders,
a dim `type or / for commands` placeholder, and top-left ready or native working
status (including elapsed seconds). Git branch and working directory appear on
the top border, using pi-core's root-exported `formatCwd` for home abbreviation
(shared with the sidebar); model, thinking effort and context usage appear on the bottom.
Native scroll indicators are preserved. The status line always stays in its
separate footer row below the box. Narrow widths use the native editor geometry.
Disable `inputBox` to keep the native editor and the same footer.

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
use one, set `"icons": "unicode"` for native glyphs, or use `"icons": "ascii"`
for plain-text alternatives. Unicode mode substitutes a Unicode glyph where
the native fallback is a Nerd glyph (agent `⚙`).

## Attribution

MIT; see [LICENSE](LICENSE). Includes code adapted from the primary upstream,
[pi-omp-theme](https://github.com/QuangThai/pi-omp-theme) by QuangThai, and
pi-pretty by huynhgiabuu. pi-atelier by Michael and gentle-shell by Mario Zechner
are references only, not bundled code.
