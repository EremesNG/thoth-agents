# @thoth-agents/pi-orca-images

Standalone Pi extension for complete Kitty images in Orca fullscreen mode and
image recovery after minimizing and restoring the window. Requires Pi >= 1.0.1.
It is independent of `pi-thoth-theme`; the theme only styles tool-result frames.

## Install

```sh
pi install npm:@thoth-agents/pi-orca-images
```

For a local checkout, run from the thoth-agents repository root:

```sh
pi install ./pi-packages/pi-orca-images
```

Alternatively add the package path to Pi's `packages` setting. This is an
operator-installed package, not installed by the Thoth CLI. Restart Pi or use
`/reload` after installing it. There is no package configuration file.

## Orca behavior

- Outside tmux, when `TERM_PROGRAM` is Orca (case-insensitive), selects Kitty if
  Pi has no image protocol and `PI_IMAGE_PROTOCOL` is unset. Runs on
  `session_start` and `agent_start` so native `/reload` cannot lose the override.
  Existing protocols, explicit environment choices and other capabilities stay
  Pi-owned.
- In fullscreen, emits Kitty images after row clears and text. Component
  rendering and child processes do not see the temporary WezTerm predicate used
  during terminal output, and the exact environment is restored even on errors.
- Retransmits the Kitty payload on redraw instead of relying on retained image
  IDs that Orca may have discarded. Activating Kitty ordering refreshes cached
  image fallbacks and the current frame once.
- Debounces rapid image redraws during scrolling or changes to image-covered
  rows: the leading frame emits immediately, then images can go blank briefly
  while text keeps updating every frame. One full image redraw follows 150 ms
  of quiet, with a maximum wait of 1000 ms from the first suppressed frame during
  continuous bursts. Activation, focus recovery, resize and other full redraws
  always emit immediately and cancel an obsolete trailing redraw.
- On focus-in (`ESC[I`), requests a full redraw so images recover after window
  restore without scrolling. Pi still consumes focus events and handles its
  mouse/selection state. With Pi mouse support disabled, focus reporting may not
  be enabled and automatic recovery is unavailable.
- Non-Orca terminals and tmux are unaffected. Regular mode needs no ordering or
  focus patch and keeps Pi's native image rendering; fullscreen is supported
  without switching to regular mode.

Pi's `terminal.showImages` must be `true` (the default). Pi intentionally disables
iTerm2 images in fullscreen: remove `terminal.images: "iterm2"` and leave
`PI_IMAGE_PROTOCOL` unset, or explicitly select Kitty in Pi settings. PNG and JPEG
results use Pi's native image pass, including conversion to PNG.

## Off switch

Start Pi with `PI_IMAGE_PROTOCOL=none` (or `0`, case-insensitive), or uninstall the
package. The environment switch bypasses **all** package behavior: the capability
fallback, ordering activation, redraw debounce and focus redraw, even if Pi
settings still select `terminal.images: "kitty"`. It does not override Pi's native
settings behavior; remove that setting as well if you want no images at all.

## Development

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @thoth-agents/pi-orca-images typecheck
pnpm --filter @thoth-agents/pi-orca-images test
```

The compatibility hooks depend on Pi 1.0.1 fullscreen internals. Missing methods
are skipped rather than throwing; a future Pi update may require adapting them.

## License

MIT; see [LICENSE](LICENSE).
