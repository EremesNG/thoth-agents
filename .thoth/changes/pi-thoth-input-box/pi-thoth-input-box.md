# Change: pi-thoth-input-box

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- `pi-packages/pi-thoth-theme` owns only the footer today: `src/status-line/index.ts:30–38,119–137`
  registers `ctx.ui.setFooter`, rendering one row through `renderStatusLine`
  (`src/status-line/layout.ts:57–162`). It never calls `setEditorComponent`
  (asserted at `src/status-line/status-line.test.ts:136–142`, `src/index.test.ts:136–150,204–227`).
- The editor is native Pi (`@earendil-works/pi-coding-agent` 1.0.1 `CustomEditor` extends pi-tui
  `Editor`). Render order is top border → content → bottom border → autocomplete
  (`pi-tui/dist/components/editor.js:385–484`). `renderTopBorder`/`renderBottomBorder` are
  called through `this`, so per-instance overrides take effect. Content uses spaces for padding;
  `CURSOR_MARKER` precedes the reverse-video cursor cell. No editor placeholder API exists.
- `CustomEditor.renderTopBorder` embeds the native status indicator (working, retry, compaction…)
  via `workingStatusIndicator.renderInBorder(n)` (`custom-editor.js:20–61`).
  `setWorkingIndicator({frames,intervalMs})`, `setWorkingMessage`, `setWorkingVisible` are public.
- Editor ownership is shared: `pi-subagents` wraps the factory and returns the same instance; it
  latches "navigation unavailable" if `getEditorComponent()` is no longer its factory
  (`subagents-extension.ts:113–187`). `pi-background-tasks` returns a Proxy forwarding property
  writes to the inner editor (`shared-navigator.ts:620–668`). Extension load order follows the
  package list; `pi-thoth-theme` is listed after both in the user's settings.
- Pi assigns `editor.borderColor` from thinking level / bash mode (`interactive-mode.js:3631–3635`).
- The footer factory receives `tui`; `tui.getFocusedComponent()` returns the active editor (or the
  background-tasks Proxy). A footer component may render zero lines.
- Existing timer pattern: `src/tools/ticker.ts`.

## Intent

Restyle the Pi input area in the Thoth theme as one rounded `accent` box:

```
╭─ ☥ thoth · ready ───────────────────────────────────────╮
│ type or / for commands                                   │
╰──────────────────────────────────────────────────────────╯
● Model · ◐ med │ ⑂ branch │ [██░░] 11% used │ 112.3K/1M │ $1.971 (sub)
```

- Top-left status: idle `☥ thoth · ready`; while the agent works, the native indicator with
  frames `△ ◭ ▲ ◮` and message `working…` plus ` · <elapsed>s`. Other native indicator kinds
  (retry, compaction, extension messages) still render in the same place.
- Side borders `│` around content lines.
- Dim placeholder `type or / for commands` when the editor is empty.
- The existing status line stays as the footer row directly below the box (gentle-shell style);
  the bottom border is a plain rounded rule.

## Non-goals

- No changes to pi-subagents or pi-background-tasks behavior or their editor wrappers.
- No new editor factory registration by the theme (no `setEditorComponent`).
- No glyph size control, images, or hieroglyph ornaments beyond `☥`.
- No changes to tool-call or subagent box rendering.

## Acceptance

- AC-1: When the active editor is decorated, its render output is a rounded box using theme
  `accent`: `╭`/`╮` top, `│ … │` content rows, `╰`/`╯` bottom, every line within the given width,
  cursor marker preserved, autocomplete lines kept below the box.
- AC-2: Top-left status shows `☥ thoth · ready` when idle; when a native status indicator is
  attached it renders that indicator (configured frames `△ ◭ ▲ ◮`, message `working…`) followed by
  ` · <n>s` elapsed since `agent_start` for the working kind; returns to ready on `agent_end`.
  Scroll indicators (`↑/↓ n more`) remain visible.
- AC-3: Empty editor shows dim `type or / for commands` after the cursor; any text hides it.
- AC-4: The status line stays the existing one-row footer below the box, always rendered
  (never suppressed); the box's bottom border is a plain rounded rule `╰─…─╯` (keeping native
  scroll indicators). No footer suppression or render acknowledgement logic remains.
- AC-5: Composition: decoration never calls `setEditorComponent`, works through the
  background-tasks Proxy, keeps the focused instance identity, is idempotent per instance, and
  re-decorates a replaced editor instance. Original methods are captured without recursion
  through the background-tasks Proxy, whose render interception keeps working. Existing
  pi-thoth-theme, pi-subagents and pi-background-tasks suites pass.
- AC-6: Mouse clicks inside the decorated box (text and autocomplete) land on the same column as
  the native undecorated editor (clicking the first displayed character selects column 0);
  undecorated fallback forwards events unchanged.

## Clarifications

- Visual design, placeholder text, idle text, animation frames, bottom-border status line and
  `│` separators were chosen explicitly by the user in conversation (mockup variant 1, status
  moved to top-left, animation option A, `☥ thoth · ready`).
- Glyph sizing was explicitly dropped by the user.
- After verification found zero-status cases under Pi layout clipping, the user explicitly chose
  "Simplificar": no dependence on Pi's private layout-node protocol, footer fallback when the
  status does not fit, and accept clipping under extreme vertical pressure.
- After comparing with gentle-shell, the user explicitly chose to keep the status line as a
  separate footer row below the box instead of embedding it in the bottom border.

## Decisions

- Decorate the editor instance instead of registering a factory, to avoid breaking
  pi-subagents' factory-identity check and background-tasks' Proxy chain. The instance is
  discovered from the footer factory's `tui.getFocusedComponent()` during footer render, when it
  exposes editor methods (`getText`, `renderTopBorder`, `renderBottomBorder`, `render`); patched
  instances are tracked in a `WeakSet`, and a render is requested after first decoration.
- Capture original methods without going through intercepting getters: resolve `render`,
  `renderTopBorder`, `renderBottomBorder` and the mouse handler from the underlying target's own
  property descriptor or prototype chain via reflection through the focused object (no target
  unwrapping; the background-tasks Proxy getter returns a closure that
  dynamically calls `target.render`, so a naive capture recurses —
  `pi-background-tasks/src/shared-navigator.ts:650–661`). Unsupported shapes are left undecorated.
- Translate mouse input to the decorated geometry: the native editor's mouse hit-testing and
  autocomplete geometry use the supplied event column/width (`pi-tui/dist/components/editor.js:487–501,521–523`);
  `handleMouse(event)` is wrapped to shift local `x` by the left border and reduce local `width`
  by 2, preserving `y`, screen coordinates, other fields and the handler result,
  and leaves events untouched when rendering undecorated (narrow fallback).
- Editor discovery is retried on each footer render (before cache early-returns) and handles
  non-editor focus, overlays, replacement and restoration; the footer itself always renders.
- Override per instance: `render(width)` calls the original with `width - 2` and wraps rows;
  `renderTopBorder`/`renderBottomBorder` build the rounded borders at the outer width. The top
  border reads the native `workingStatusIndicator` (runtime field, not a public type) and calls
  its `renderInBorder(n)`; if absent, renders ready text. This is the one runtime-private access,
  guarded by feature checks with a ready-text fallback.
- Working animation uses the public `setWorkingIndicator({ frames: ['△','◭','▲','◮'], intervalMs })`
  and `setWorkingMessage('working…')`; elapsed time comes from `agent_start`/`agent_end`
  with a 1s render tick following `src/tools/ticker.ts`.
- Do not use Pi's private layout protocol (`layout-node`, `getMountedRoots`, container patches,
  footer allocation changes). The only runtime-private access remains `workingStatusIndicator`.
- Border color is always theme `accent` while decorated, overriding Pi's thinking-level color.
- Feature gated by the theme's existing configuration (new `inputBox` flag, default enabled);
  disabled restores the current footer-only behavior.
- Narrow widths: the top-border status truncates to fit;
  below a minimum width the original render is returned undecorated.

## Durable deltas

- None.

## Plan

New module `pi-packages/pi-thoth-theme/src/input-box/`:
- `frame.ts`: pure functions `renderInputTop(width, theme, status)`,
  `renderInputBottom(width, theme)` (plain rule + scroll indicator), `wrapContentRow(line, width, theme)`,
  `renderPlaceholder(...)` — unit-tested with fake theme.
- `decorate.ts`: `decorateEditor(editor, deps)` patching instance methods (WeakSet idempotence,
  originals preserved), `isEditorLike` guard.
- `state.ts`: working-state tracking (`agent_start`/`agent_end`, elapsed, ticker).
- Wire in `src/status-line/index.ts` footer: discover/decorate focused editor on each render and
  always render the one-row status line; register indicator frames/message in `src/index.ts` `session_start`.
- Tests: frame geometry/width/cursor-marker, placeholder, decoration through a Proxy, idempotence,
  footer always one row, state transitions. Update the "never calls setEditorComponent" tests to keep
  asserting no factory registration.

Verification: `pnpm run typecheck` and `pnpm test` in pi-thoth-theme, pi-subagents and
pi-background-tasks; `pnpm run check:ci` at root; manual check in a restarted Pi session.

## Tasks

- [x] AC-1: Pure input-box frame rendering
  - Outcome: rounded box top/bottom/content/placeholder render helpers with tests
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/status-line/layout.ts`, `src/tools/frame.ts`; skills `tdd`, `simplify`
  - Inputs: this record's Intent, Decisions and Exploration
  - Dependencies: none
  - Output: `src/input-box/frame.ts` + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/input-box/**`
  - Interface boundaries: pi-tui `visibleWidth`/`truncateToWidth`, `CURSOR_MARKER`, theme `fg`
  - Focused check and PASS evidence: `vitest run src/input-box` passes
  - Return milestone: helpers + tests green
  - Stop / reassessment: width/cursor semantics contradict native editor output
- [x] AC-2: Working status and elapsed tracking
  - Outcome: top-left status uses native indicator or ready text plus elapsed, with frames/message configured
  - Known entrypoints and skill paths: `src/index.ts`, `src/tools/ticker.ts`; skill `tdd`
  - Inputs: AC-1 helpers
  - Dependencies: AC-1 accepted
  - Output: `src/input-box/state.ts`, session_start wiring, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/input-box/**`, `src/index.ts`, `src/index.test.ts`
  - Interface boundaries: `setWorkingIndicator`, `setWorkingMessage`, `agent_start`/`agent_end`
  - Focused check and PASS evidence: state and index tests pass
  - Return milestone: tests green
  - Stop / reassessment: indicator API differs from installed types
- [x] AC-3: Empty-editor placeholder
  - Outcome: dim `type or / for commands` after the cursor when `getText()` is empty, hidden otherwise
  - Known entrypoints and skill paths: `src/input-box/frame.ts`; skill `tdd`
  - Inputs: AC-1 helpers
  - Dependencies: AC-1 accepted
  - Output: placeholder helper + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/input-box/**`
  - Interface boundaries: `CURSOR_MARKER`, reverse-video cursor cell
  - Focused check and PASS evidence: placeholder tests pass
  - Return milestone: tests green
  - Stop / reassessment: cursor cell cannot be located reliably
- [x] AC-4: Status line as separate footer row; plain bottom border
  - Outcome: footer always renders the one-row status line; bottom border is a plain rounded rule with native scroll indicators
  - Known entrypoints and skill paths: `src/status-line/index.ts`, `src/status-line/layout.ts`; skill `tdd`
  - Inputs: AC-1 helpers
  - Dependencies: AC-1 accepted
  - Output: footer wiring + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/status-line/**`, `src/input-box/**`
  - Interface boundaries: footer factory `(tui, theme, data)`
  - Focused check and PASS evidence: status-line tests pass
  - Return milestone: tests green
  - Stop / reassessment: footer cannot discover the focused editor
- [x] AC-5: Editor instance decoration
  - Outcome: focused editor decorated in place via footer `tui`, composing with pi-subagents and background-tasks
  - Known entrypoints and skill paths: `src/status-line/index.ts`, `pi-packages/pi-background-tasks/src/shared-navigator.ts:620–668`, `pi-packages/pi-subagents/src/extension/subagents-extension.ts:113–187`; skills `tdd`, `simplify`
  - Inputs: AC-1, AC-2 outputs
  - Dependencies: AC-1, AC-2 accepted
  - Output: `src/input-box/decorate.ts`, footer wiring, config flag, tests incl. a real-semantics Proxy (getter closure + set forwarding) without recursion, initially non-editor focus, instance replacement, padding change, narrow width, disposal
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/**` (not other packages)
  - Interface boundaries: footer factory `(tui, theme, data)`, editor instance methods, `borderColor`
  - Focused check and PASS evidence: pi-thoth-theme typecheck + full tests; pi-subagents and pi-background-tasks tests unchanged and passing
  - Return milestone: all suites green
  - Stop / reassessment: decoration requires editing other packages or factory registration
- [x] AC-6: Mouse coordinate translation
  - Outcome: decorated editor translates mouse column/width so caret placement and autocomplete clicks match native behavior
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/node_modules/@earendil-works/pi-tui/dist/components/editor.js:487–523`, `src/input-box/decorate.ts`; skill `tdd`
  - Inputs: AC-5 decoration
  - Dependencies: AC-5 accepted
  - Output: mouse translation in `decorate.ts` + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/input-box/**`
  - Interface boundaries: native editor mouse handler signature
  - Focused check and PASS evidence: test clicking first displayed char selects column 0; autocomplete click selects the clicked item; fallback unchanged
  - Return milestone: tests green
  - Stop / reassessment: mouse handler not reachable on the instance
- [x] AC-5: Independent final verification
  - Outcome: fresh Oracle verdict against this record, diff and checks
  - Known entrypoints and skill paths: this record; diff of `pi-packages/pi-thoth-theme`
  - Inputs: accepted implementation units
  - Dependencies: all implementation units accepted
  - Output: PASS/FAIL with evidence
  - Owner: thoth-oracle
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: Oracle PASS
  - Return milestone: verdict returned
  - Stop / reassessment: FAIL findings return to worker

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 7a9ea02e29835b16817bdb8fc99d4e0b63013f634ec122d3e839ff4577598e47

- Provenance (root summary of session history): plan review EXPLICIT_REVIEW, fresh Oracle round 1 REJECT then round 2 OKAY; implementation explicitly authorized by the user; final verification by fresh read-only thoth-oracle instances: rounds 1-4 FAIL (B1 padding crash, B2 stale render ack, B3 clipping, private layout protocol) converged via user decisions "Simplificar" and gentle-shell-style separate footer; round 5 PASS on AC-1..AC-6 with record-only inconsistencies fixed and re-reviewed PASS; closeout confirmations PASS (LF prefix 7a9ea02e… independently confirmed identical to reviewed CRLF prefix c945a6a6… apart from line endings; 13 source digests confirmed).
- Root checks: pi-thoth-theme typecheck PASS, 427 tests/23 files; pi-subagents 588 passed/1 skipped; pi-background-tasks 323 passed/4 skipped; root check:ci 0 errors.
- Residual manual check (user): real-terminal appearance after restarting Pi. Accepted: native one-column wide-grapheme RangeError is pre-existing upstream behavior.
- AC-1: PASS | Rounded geometry, cursor/autocomplete preservation; 17,717-case sweep | pi-packages/pi-thoth-theme/src/input-box/decorate.ts:130–166; pi-packages/pi-thoth-theme/src/input-box/frame.ts:43–71
- AC-2: PASS | Ready/native status, elapsed lifecycle, configured frames/message | pi-packages/pi-thoth-theme/src/input-box/state.ts:15–55; pi-packages/pi-thoth-theme/src/index.ts:26–33
- AC-3: PASS | Dim placeholder appears only for empty input | pi-packages/pi-thoth-theme/src/input-box/frame.ts:74–88
- AC-4: PASS | Separate footer and plain bottom border; 20 layout scenarios + 640 footer checks | pi-packages/pi-thoth-theme/src/status-line/index.ts:130–165; pi-packages/pi-thoth-theme/src/input-box/frame.ts:53–60
- AC-5: PASS | Proxy-safe capture, identity/idempotence, replacement and disposal | pi-packages/pi-thoth-theme/src/input-box/decorate.ts:53–106,222–239; pi-packages/pi-thoth-theme/src/status-line/index.ts:171–184
- AC-6: PASS | Mouse translation and unchanged fallback; 2,911 click checks | pi-packages/pi-thoth-theme/src/input-box/decorate.ts:200–211
- Source: pi-packages/pi-thoth-theme/README.md | sha256:9a8337c1e48d7df24148fa1e81451d970435dc0b9a6c4369822527cb882c196b
- Source: pi-packages/pi-thoth-theme/src/index.test.ts | sha256:a33055ef9cf5abd6f5396b3df2a7bc8078563f9e5cd1b17b01341a12fbbb6092
- Source: pi-packages/pi-thoth-theme/src/index.ts | sha256:5ab23009997351478c34d5f71a5b2d49f9b6d71fc7aa5404ebb6ddd5a72b18cd
- Source: pi-packages/pi-thoth-theme/src/input-box/decorate.test.ts | sha256:d2de121d4158d6a61496e653af398f77d6119c52cda179dcbc5286286363b6e3
- Source: pi-packages/pi-thoth-theme/src/input-box/decorate.ts | sha256:8b00f5d0feabe44f09b4a6bfcf4a18e8ff93fb97c39aabad739fcc03e76c5341
- Source: pi-packages/pi-thoth-theme/src/input-box/frame.test.ts | sha256:8f9f73e21195f4ce148375858041c5ab0956eb680f4ce1055604d9a6a6a224c1
- Source: pi-packages/pi-thoth-theme/src/input-box/frame.ts | sha256:02954b154e7606d0317ac5ea4bebeae05838bbc997c709a6f96f13de6eb7e409
- Source: pi-packages/pi-thoth-theme/src/input-box/state.test.ts | sha256:1e970432245dc13a7887caf1258e494687062fa3bfa9d26f60eef5ac2c40249f
- Source: pi-packages/pi-thoth-theme/src/input-box/state.ts | sha256:04b3b1acb2abc99ad1724af3da80baf1cb954c2fabeae828ccc2e9a9297723d3
- Source: pi-packages/pi-thoth-theme/src/shared/config.test.ts | sha256:3689faec2a6f005139d9b6166f85530347ffae9764c1f9cd226995a535dcba0a
- Source: pi-packages/pi-thoth-theme/src/shared/config.ts | sha256:581973426e45be6784c02db0d28f56c04ca1ad206ea58d91a25d734c0b1f6dda
- Source: pi-packages/pi-thoth-theme/src/status-line/index.ts | sha256:22ec4413d52411f5f40f02b61dd496d5e24e08790397ac032de58121b56acef2
- Source: pi-packages/pi-thoth-theme/src/status-line/status-line.test.ts | sha256:fd6d190e1f103ae6249b64303b1587f44655c768f968638631fa47b0f3a3c6d8

## Closeout

**Archive**: READY
