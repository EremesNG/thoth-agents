# Change: pi-thoth-theme

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Workspace: `pnpm-workspace.yaml:1-2` globs `pi-packages/*`, so a sixth package
  is discovered automatically. CI names packages explicitly:
  `.github/workflows/ci.yml:54-77` (ubuntu) and `:80-131` (windows). Five-package
  wording lives in `AGENTS.md:214` and `docs/agent/testing.md:42-53`.
  `.thoth/specs/project-tooling/spec.md:211` already requires every
  `pi-packages/*` package to be a workspace member from the root lockfile with CI
  typecheck and offline tests; this change complies without amending it.
- Package conventions (`pi-packages/pi-background-tasks/package.json`,
  `tsconfig.json:2-14`, `vitest.config.ts`): MIT, ESM, `pi.extensions` pointing at
  TypeScript source, peer `@earendil-works/*: "*"`, dev `^0.99.1`, `files`
  whitelist excluding tests, `typecheck: tsc --noEmit`, `test: vitest run`, upstream
  copyright retained in `LICENSE`. No package declares `pi.themes` yet;
  `PiManifest.themes?: string[]` exists (`pi-coding-agent/dist/core/pi-manifest.d.ts:1-5`).
- Pi UI API (`pi-coding-agent/dist/core/extensions/types.d.ts`): `setFooter`
  (111-117), `setHeader` (115-117), `setEditorComponent` (67,175), `setWidget`
  with `aboveEditor|belowEditor` (47-51,101-104), tool `renderCall`/`renderResult`
  (489-491). Footer data offers only git branch, extension statuses, branch-change
  events and provider count (`core/footer-data-provider.d.ts:35-63`); context via
  `ctx.getContextUsage()`, model via `ctx.model`, cost/tokens from session entries.
- Ownership conflicts: `pi-subagents` (`src/extension/subagents-extension.ts:139-141`)
  and `pi-background-tasks` (`src/shared-navigator.ts:634`) already own the single
  custom editor slot. No first-party package sets a footer or header.
- Images: `@earendil-works/pi-tui` exports `Image` and
  `ImageProtocol = "kitty" | "iterm2" | null` with env detection and overrides
  (`PI_IMAGE_PROTOCOL`); no Sixel and no Orca branch. Orca sets
  `TERM_PROGRAM=Orca` (stablyai/orca#6880) and its xterm supports Kitty/iTerm2/Sixel
  (stablyai/orca#7775). pi-pretty's current `read` delegates image display to Pi's
  ToolExecution image pass (`src/tools/read.ts:84-96,135-142`).
- References (all MIT): pi-omp-theme (claude preset `domain/config-presets.ts:9-23`;
  session-cumulative cost `pi/session-usage.ts:21-61`; boxed tools via
  `ToolExecutionComponent.prototype` patches `pi/compatibility-probe.ts:741-750`;
  startup/welcome `features/startup/*` via `setHeader`), pi-pretty (Nerd Font map
  `src/config.ts:292-372`; same-name `registerTool` overrides), gentle-shell and
  pi-atelier (sidebars patch TUI render/layout root; out of scope).

## Intent

Ship `@thoth-agents/pi-thoth-theme`, one Pi package with independently toggleable
modules: an Egyptian dark theme (gold dominant, black background), a single status
row below the input in the omp `claude` style showing session total cost and no
path, styled built-in tool calls with Nerd Font icons and ASCII fallback, inline
images in `read` that work in Orca on Windows, and a welcome header modeled on
pi-omp-theme.

## Non-goals

- Sidebar (deferred to a separate change by user decision).
- Patching Pi internals or prototypes; styling non-built-in tools (subagents,
  background tasks, bridges keep their own renderers).
- Claiming the custom editor slot, presets catalog, doctor command, config
  migrations, FFF search, notifications, model/tool pickers, Sixel encoding.
- Publishing or version bumps.

## Acceptance

- AC-1: `pi-packages/pi-thoth-theme` exists as a workspace package following
  sibling conventions, registers a `thoth` dark theme via `pi.themes`, carries MIT
  attribution for adapted code, and is typechecked and tested by both CI jobs, with
  package-count docs updated.
- AC-2: A footer status row renders `model·effort`, git branch, context usage and
  cumulative session cost (no path), degrades responsively by width, and never
  calls `setEditorComponent`.
- AC-3: `read`, `bash`, `ls`, `grep`, `find`, `edit` and `write` are re-registered
  with unchanged execution and parameters and boxed renderers using Nerd Font icons
  with ASCII fallback; results collapse and expand with Pi's native toggle.
- AC-4: `read` of an image returns image content that Pi renders inline; with
  `TERM_PROGRAM=Orca`, outside tmux, and no explicit `PI_IMAGE_PROTOCOL`, the
  package selects a supported protocol; otherwise text fallback.
- AC-5: A welcome header via `setHeader` shows logo, loaded resources/tool
  providers and recent sessions, styled with the thoth palette.
- AC-6: Each module can be disabled in `~/.pi/agent/pi-thoth-theme.json` and then
  leaves Pi native behavior for its surface; no Pi settings access occurs during
  extension load.

## Clarifications

- RESOLVED: One package `@thoth-agents/pi-thoth-theme` (user, this session).
- RESOLVED: Single status row below the input, omp `claude` style (user).
- RESOLVED: Nerd Font icons with ASCII fallback only (user).
- RESOLVED: Own Egyptian palette, gold dominant, dark, black background (user).
- RESOLVED: Inline images in scope; terminal is Orca on Windows (user).
- RESOLVED: Tool styling through public `registerTool` overrides, not prototype
  patches (user, recommended option).
- RESOLVED: Sidebar deferred to another change (user).

## Decisions

- Status row uses `ctx.ui.setFooter`, avoiding the editor slot owned by
  pi-subagents and pi-background-tasks.
- Cost is the sum of `usage.cost.total` across all session entries, including
  compaction and branch summaries (pi-omp-theme semantics); no local pricing.
- Tool execution delegates to the SDK built-in tool definitions; only rendering
  changes. If a built-in factory is not exported, the task stops and returns.
- Configuration lives in the package-owned file `~/.pi/agent/pi-thoth-theme.json`
  (`icons: "nerd" | "ascii"`, per-module `enabled` flags; defaults all on, `nerd`),
  read with `fs` at extension load. Pi `getSettings()` is not used because it
  throws during extension loading (`core/extensions/loader.js:106-129`, bound only
  later in `runner.js:208-220`). Tool overrides register at load from that file;
  footer and header compose on `session_start`, where `ctx.ui` is available.
- Image capability (AC-4 finding): Pi reapplies capability overrides after
  extension load (`main.js:699`, `interactive-mode.js:338`), erasing a load-only
  fallback. The Orca Kitty fallback is therefore applied from `src/index.ts` on
  `session_start`, gated only by `images.enabled` (independent of `tools.enabled`).
  Final-verification repair: native `/reload` resets overrides after emitting
  `session_start` (`agent-session.js:2887`, then `interactive-mode.js:5230`), so the
  fallback is also reapplied idempotently on the public `agent_start` event, which
  precedes every agent loop's messages and tool results.
- Tool result fidelity (final-verification repairs): notices are recognized only
  as the SDK's metadata-backed trailing `\n\n[...]` appendix; the ls empty sentinel
  only as the entire output. The SDK grep returns formatted text only
  (`grep.js:93,152-169,217-236`), so grouping is used only for untruncated output
  (`matchLimitReached`, `truncation.truncated`, `linesTruncated` all false) in
  which every line, including orphan-context readings, has exactly one
  interpretation and grouped rows round-trip to the SDK lines in order; otherwise
  the whole result renders as raw boxed SDK text, never mixed. Control characters
  inside ls/find/grep data and call arguments (C0 except tab, DEL, C1) are
  rendered as visible escapes (control pictures for C0/DEL, `\xNN` for C1) rather
  than deleted or emitted raw to the terminal, and take part in grouping as data. Displayed output must never differ from what the SDK returned.
- Visual units (theme, status row, tool renderers, welcome) are owned by
  thoth-designer per constitution Principle 3; nonvisual scaffold, CI, image
  capability detection and composition tests by thoth-worker.
- Palette `thoth` (provisional, adjustable during AC-1 review): background
  `#000000`, gold `#D4AF37` (accent/borders/headings), bright gold `#F2C94C`,
  papyrus `#E8DCB5` (text), sand `#A89A78` (muted), lapis `#2E5EAA`/`#5B8DEF`
  (links, info), turquoise faience `#3FB8AF` (success, diff added), carnelian
  `#C0503A` (error, diff removed), ochre `#D98E04` (warning).
- Adapted code keeps upstream MIT copyright lines in `LICENSE` and an `upstream`
  block naming pi-omp-theme as the primary source.

## Durable deltas

- None.

## Plan

Package layout `pi-packages/pi-thoth-theme/`: `package.json`, `LICENSE`,
`README.md`, `tsconfig.json`, `vitest.config.ts`, `themes/thoth.json`,
`src/index.ts` (composition only), `src/shared/` (config, icons, ansi/box,
palette access), `src/status-line/`, `src/tools/`, `src/welcome/`.

1. Scaffold (AC-1, AC-6): manifest, file-based config loader, icon resolver,
   `src/index.ts` registering `registerTools` at load and `registerStatusLine` /
   `registerWelcome` on `session_start`, behind enable flags (modules start as
   no-op stubs owned by later units). Root lockfile, CI lists, `AGENTS.md`,
   `docs/agent/testing.md`. In parallel, the designer authors `themes/thoth.json`
   with every required color key.
2. Status line (AC-2): pure segment renderer and session-usage aggregator with
   unit tests; footer component wiring.
3. Tools (AC-3): per-tool renderers on public API, shared box/icon helpers,
   tests for call/result render output in nerd and ascii modes and unchanged
   execution delegation.
4. Images (AC-4): preserve image content in `read`; capability override on Orca
   detection; tests for detection matrix.
5. Welcome (AC-5): header component; tests for render output.

Risks: built-in tool factory exports and session-entry usage typing are
unverified (stop conditions below); image display inside Orca requires a manual
check in a real session; terminal font must be a Nerd Font for icons.

Verification seams: `pnpm --filter @thoth-agents/pi-thoth-theme run typecheck`,
`... run test`, root `pnpm run check:ci`, manual `pi -e` session in Orca.

## Tasks

- [x] AC-1: Package scaffold, file config/icons, CI and docs registration
  - Outcome: installable package skeleton with module toggles, covered by CI
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/{package.json,tsconfig.json,vitest.config.ts,LICENSE}`, `.github/workflows/ci.yml`, `AGENTS.md`, `docs/agent/testing.md`; skills tdd, simplify
  - Inputs: Exploration and Decisions of this record
  - Dependencies: none
  - Output: scaffold with stub `register*` modules, `pi.themes: ["./themes"]` manifest entry, updated lockfile/CI/docs
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/{package.json,LICENSE,README.md,tsconfig.json,vitest.config.ts,src/index.ts,src/shared/**}`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `AGENTS.md`, `docs/agent/testing.md`
  - Interface boundaries: `register*(pi, config)` signatures consumed by AC-2/3/5; Pi manifest `pi.themes`
  - Focused check and PASS evidence: package typecheck and tests pass; config loader test proves defaults, file override and no Pi settings access at load
  - Return milestone: scaffold green and stub signatures published
  - Stop / reassessment: lockfile cannot be updated offline
- [x] AC-1: Thoth Egyptian dark theme JSON
  - Outcome: `thoth` theme, gold dominant on black, valid against Pi's theme schema
  - Known entrypoints and skill paths: `pi-coding-agent/dist/modes/interactive/theme/theme-json.d.ts`; reference pi-omp-theme `themes/titanium.json`
  - Inputs: palette in Decisions; AC-1 scaffold `vitest.config.ts` including `test/**/*.test.ts`
  - Dependencies: AC-1 package scaffold (test runner only; JSON authoring may start in parallel)
  - Output: `themes/thoth.json` and its schema test
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/themes/**`, `pi-packages/pi-thoth-theme/test/theme.test.ts`
  - Interface boundaries: Pi theme JSON schema (required color keys)
  - Focused check and PASS evidence: test asserts every required color key is present and valid
  - Return milestone: theme test green after AC-1 scaffold exists
  - Stop / reassessment: schema differs from declarations
- [x] AC-2: Footer status row with cumulative session cost
  - Outcome: status row matching the omp `claude` look without path, plus cost
  - Known entrypoints and skill paths: `src/status-line/**`, footer-data-provider and extension types declarations; reference pi-omp-theme `domain/status.ts`, `pi/session-usage.ts`
  - Inputs: AC-1 scaffold
  - Dependencies: AC-1
  - Output: `registerStatusLine` implementation with tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/status-line/**`
  - Interface boundaries: `ctx.ui.setFooter`; no `setEditorComponent`
  - Focused check and PASS evidence: tests for cost aggregation, segment order, narrow-width degradation pass
  - Return milestone: tests green
  - Stop / reassessment: session entry usage shape unavailable in typings
- [x] AC-3: Built-in tool renderers with Nerd Font/ASCII icons
  - Outcome: boxed styled calls/results for seven built-in tools, execution unchanged
  - Known entrypoints and skill paths: `src/tools/**`; references pi-omp-theme `features/tools/boxed/*`, pi-pretty `src/tools/*`, `src/config.ts:292-372`
  - Inputs: AC-1 scaffold and icon resolver
  - Dependencies: AC-1
  - Output: `registerTools` implementation with tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`
  - Interface boundaries: `pi.registerTool` same names, SDK built-in tool definitions, `ToolRenderResultOptions.expanded`
  - Focused check and PASS evidence: render snapshot tests in both icon modes; delegation test proves identical execute/params
  - Return milestone: tests green
  - Stop / reassessment: SDK does not export built-in tool definitions
- [x] AC-4: Inline images in read and Orca detection
  - Outcome: images display inline in Orca, text fallback elsewhere
  - Known entrypoints and skill paths: `src/tools/read.ts`, `pi-tui/dist/terminal-image.d.ts`
  - Inputs: AC-3 read renderer
  - Dependencies: AC-3
  - Output: image-preserving read and capability override with tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/tools/read.ts`, `src/tools/image-capability.ts`
  - Interface boundaries: pi-tui capability setters; `PI_IMAGE_PROTOCOL` precedence
  - Focused check and PASS evidence: detection matrix tests (Orca, tmux, explicit env, unrecognized terminal) pass
  - Return milestone: tests green; manual Orca check listed for user
  - Stop / reassessment: no public capability override exported
- [x] AC-5: Welcome header
  - Outcome: thoth-styled welcome with logo, resources/providers, recent sessions
  - Known entrypoints and skill paths: `src/welcome/**`; reference pi-omp-theme `features/startup/{index,logo,welcome}.ts`
  - Inputs: AC-1 scaffold
  - Dependencies: AC-1
  - Output: `registerWelcome` implementation with tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/welcome/**`
  - Interface boundaries: `ctx.ui.setHeader`
  - Focused check and PASS evidence: render tests at several widths pass
  - Return milestone: tests green
  - Stop / reassessment: recent sessions need non-public APIs
- [x] AC-6: Module toggles restore native surfaces
  - Outcome: disabling each module skips its registration
  - Known entrypoints and skill paths: `src/index.ts`, `src/shared/config.ts`
  - Inputs: AC-2, AC-3, AC-4, AC-5 outputs
  - Dependencies: AC-2, AC-3, AC-4, AC-5
  - Output: composition test
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/index.test.ts`
  - Interface boundaries: `~/.pi/agent/pi-thoth-theme.json`; `session_start` composition
  - Focused check and PASS evidence: test asserts no footer/header/tool registration (and image override) when each module is disabled, and no Pi settings access at load
  - Return milestone: full package tests and root `check:ci` green
  - Stop / reassessment: config file location conflicts with Pi conventions

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS

- Provenance: plan review round 1 REJECT (config lifecycle, visual ownership) repaired, round 2 fresh Oracle OKAY; ready gate later passed in the restarted session. Implementation explicitly authorized by the user (`Implement`) after plan OKAY on 2026-10-02. Final verification by fresh read-only thoth-oracle sessions: rounds 1-6 FAIL, each repaired in same intent; round 7 PASS (task subtask_thoth-oracle_1790969348976_e1acb51f); round 8 confirmed the authorization-line normalization.
**Reviewed record SHA-256**: c220dbc4216b5d03e43dab244b5469f00dd42220d452c176445d8a4b0623fca4

- AC-1: PASS | package/theme/workspace/CI audit, SDK theme validation, typecheck | MIT attribution, lockfile importer, both CI jobs and six-package docs match; frozen install exit 0
- AC-2: PASS | footer, cost, responsiveness, editor ownership probes | cumulative session cost, no cwd segment, 129 width checks, no setEditorComponent
- AC-3: PASS | delegation, control escaping, expansion, fidelity probes | seven SDK execute/params preserved; C0/DEL/C1 escapes across all paths; 13,300 width checks; grep grouping round-trips and truncation raw fallback
- AC-4: PASS | image preservation, capability guards, reload lifecycle | image content unchanged; Orca/tmux/explicit-protocol guards; session_start plus agent_start reapply independent of tools
- AC-5: PASS | header, live resources, providers, recent sessions | public APIs only; 644 width checks; disposed guard
- AC-6: PASS | configuration and independent toggles | file config, no Pi settings access at load, disabled surfaces stay native
- Root fresh frozen-input checks: `pnpm run check:ci` exit 0 (baseline warnings); package typecheck exit 0; package tests 14 files / 218 pass; `pnpm install --frozen-lockfile` exit 0; `git diff --check` exit 0
- Source: pi-packages/pi-thoth-theme/package.json | sha256:8659e85f58cf925ee44dd6db0d9dd3d9ead6e8ded2d852cc121bd73bedf83e92
- Source: pi-packages/pi-thoth-theme/LICENSE | sha256:0c2e4fae4548016b511462ea326270e9dd9edc98faedc52d2d4694c7e030c978
- Source: pi-packages/pi-thoth-theme/themes/thoth.json | sha256:e024f4e16badcabb97ca1a295b39ab132d390b809868ee755e05ae9d1e236d14
- Source: pi-packages/pi-thoth-theme/src/index.ts | sha256:78c1b9f1388f9071ba093e2ab3702286d7ff188631825717f03746b8ff8062a3
- Source: pi-packages/pi-thoth-theme/src/shared/config.ts | sha256:82292dcc9b62de78ea436e6ba38911ce6a901a58d5f89aa661bc48f140ab83b5
- Source: pi-packages/pi-thoth-theme/src/status-line/index.ts | sha256:13535ed55aa9ab28e3faf4cf808f79072a2499afbc74f67a952b915b48237427
- Source: pi-packages/pi-thoth-theme/src/status-line/cost.ts | sha256:cb4a733ec38e2ef77fbb6b85bc1d4937ffa34430a64797a93c5e0c5a563c16bd
- Source: pi-packages/pi-thoth-theme/src/tools/index.ts | sha256:7847d593ffcbb2ec28ce62acbed94ce592016ce5c2010cc18609f213cb4ae20b
- Source: pi-packages/pi-thoth-theme/src/tools/box.ts | sha256:a85ceae751e8f969ac2eee011b5a4d49bca48bc2ddd774ed7b1d29f4291c86d1
- Source: pi-packages/pi-thoth-theme/src/tools/grep.ts | sha256:7d65971749815177740c1fc29b3d47b781d13f91b3121fe84cf39dcedc58b02b
- Source: pi-packages/pi-thoth-theme/src/tools/image-capability.ts | sha256:6fa5067ed817f4c780b4b4751b4df4aa6ab402b9e04763512543d7ed60a40793
- Source: pi-packages/pi-thoth-theme/src/welcome/index.ts | sha256:0d221f09f9d0d295dbceeec4a767849f593100319e6151fcef225d9ab00e15e5
- Source: pi-packages/pi-thoth-theme/src/welcome/resources.ts | sha256:be57f016d5db7170e00f8d2acc07a844e6a5c9a9381117ba3565a32e04ec2a71
- Source: .github/workflows/ci.yml | sha256:a887788e7c99fd10c595c1e8fe3acd7e0986e1fd6b74f1118acea85941af3680
- Source: pnpm-lock.yaml | sha256:ea0aef25e176ee7b060d150e7f076d60251f6dfff4fb07c42d2dd3d9b466bf51
- Residual manual checks (user): Orca/Windows inline images before and after `/reload`, Ctrl+O expansion, Nerd Font and palette appearance, terminal resizing

## Closeout

**Archive**: READY
