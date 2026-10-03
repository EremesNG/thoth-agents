# Change: pi-thoth-theme-messages

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

After the archived `2026-10-03-pi-thoth-theme-polish`, user testing asked for
styled user/assistant messages, an animated thinking label, a live elapsed time
for running tools, and API-equivalent session cost including subagents. Evidence
(prefix `SDK` = installed `pi-coding-agent/dist`; `OMP` = pi-omp-theme
`extension-src/omp-theme`; `Pretty` = pi-pretty; both MIT, already attributed):

- Messages: user messages render natively in a padded `Box` with `userMessageBg`
  and Markdown in `userMessageText` (`SDK/modes/interactive/components/user-message.js:10-36`);
  assistant text is unpadded Markdown (`assistant-message.js:74-87`). The public
  `pi.registerMarkdownTransformer` (`SDK/core/extensions/types.d.ts:1113-1117,1203-1204`)
  rewrites Markdown for `user`, `assistant` and `assistant-thinking` contexts;
  ordinary message components cannot be replaced without internal patches.
  Pretty prefixes `❯` through this transformer (`Pretty/src/index.ts:59,79-82`).
- Thinking: hidden thinking shows italic `thinkingText` "Thinking..."; clicking
  reveals the content (`assistant-message.js:21,110-126`). Public
  `ctx.ui.setHiddenThinkingLabel` updates every assistant component, completed
  and streaming (`interactive-mode.js:1763-1773`). Pretty animates it with
  precomputed cosine-band frames every 33 ms (`Pretty/src/working-indicator.ts:22-30,205-215,273-364,714-731`),
  started on hidden active-thinking `message_update` and stopped at
  `message_end`/agent end (`Pretty/src/index.ts:415-487`). Per-row frozen
  labels require a prototype patch (`working-indicator.ts:519-567`), excluded.
- Running elapsed: our bash captures elapsed once per `renderResult` and the
  width cache freezes it (`src/tools/bash.ts:162-206`, `src/shared/cache.ts:7-18`);
  Pi has no autonomous tick (`tool-execution.js:115-134,168-182`). OMP keeps one
  1000 ms interval per tool state that calls the public `context.invalidate()`
  while `executionStarted && isPartial`, freezes and clears it on the terminal
  result, and clears all at `agent_end` and session boundaries
  (`OMP/features/tools/boxed/session-config.ts:63-155`, `shared.ts:104-135`,
  `OMP/pi/index.ts:123-128`; `context.invalidate` public at `types.d.ts:347-353`).
- Cost: pi-claude-bridge copies Anthropic model metadata but zeroes prices
  (`pi-packages/pi-claude-bridge/src/models.ts:32-55`) and knows a configured
  Pro/Max plan (`models.ts:58-63`, `index.ts:2430`), so usage cost is 0.
  pi-subagents sums child `usage.cost.total` (`src/runner/event-processing.ts:46-54,533-540`)
  and writes `message_end` records to `events.jsonl` (`src/atelier-metadata.ts:250-280`);
  it publishes no event-bus usage signal.
- Palette: `themes/thoth.json` maps `success`, `toolDiffAdded`, `mdCode` and
  `syntaxString` to turquoise `#3FB8AF`, which reads as blue; the user asked to keep
  the conventional color code (added/success green, removed/error red) instead
  of reinventing it (screenshot of an edit diff, this session).
- PowerShell: Pi ships a built-in `powershell` tool with an exported
  `createPowerShellToolDefinition` (installed SDK `index.d.ts`,
  `core/tools/powershell.js`); the theme does not re-register it, so it renders
  natively (`PS>` prompt, `Took 0.5s`) unlike bash (user screenshot, this session).
- Minor: the `edit` header icon touches the path (`TSpi-packages/...`); README
  documents `terminal.images` but not `PI_IMAGE_PROTOCOL=iterm2`, which the user
  had set and which also disables images in fullscreen.

## Intent

Apply design B: user messages framed by gold horizontal rules with a `❯ you`
label on the dark maroon block, assistant replies opening with a gold `◆`, an
English `Thinking…` label with an animated shimmer, live elapsed time in
running tool blocks using OMP's ticker approach, and a status cost showing the
API-equivalent session total plus subagents with a `(sub)` marker for
subscription providers.

## Non-goals

- Full side borders around user messages, hanging indents, per-row frozen
  thinking durations, or any prototype/internal patch.
- Changing tool execution, provider authentication, or billing.
- Sidebar; orchestrator language rules; the queued-message bug.
- Publishing or version bumps.

## Acceptance

- AC-1: No message-decoration module ships: user messages keep the native
  `userMessageBg` block and assistant replies stay native (user decision after
  three final-verification rounds showed Markdown decorations cannot be added
  without altering content, and Pi exposes no public assistant background:
  `assistant-message.js:82-85`, theme schema has only `userMessageBg` and
  `customMessageBg`); README documents `PI_IMAGE_PROTOCOL` and the remaining
  options.
- AC-2: No thinking-label module ships; Pi's native `Thinking...` label stays
  unchanged (user decision after final verification measured that the public
  global label setter rebuilds every assistant component, ~96 ms per frame over
  500 messages, against a 33 ms animation interval).
- AC-3: Running tool blocks update their elapsed time once per second without
  user input, using a per-tool 1000 ms interval that calls `context.invalidate()`
  only while `executionStarted && isPartial`; the interval clears on the
  terminal result, dispose, `agent_end` and session shutdown; completed elapsed
  stays frozen.
- AC-4: pi-claude-bridge models carry Anthropic's published per-token prices so
  assistant `usage.cost` reports the API-equivalent cost; plan gating is unchanged.
- AC-5: pi-subagents publishes per-parent-session cumulative subagent cost on the
  `thoth:subagent-usage` event channel after each child assistant message and in
  reply to `thoth:subagent-usage:request`; the snapshot persists in the parent
  session and is restored after restart, resume and `/reload`.
- AC-8: The built-in `powershell` tool renders with the same framed block as
  bash (`PS>` prompt, `Output` divider, exit footer, live elapsed), delegating
  execution and parameters unchanged to `createPowerShellToolDefinition`.
- AC-7: `themes/thoth.json` follows the conventional semantic color code within
  the Egyptian palette: `success` and `toolDiffAdded` green, `error` and
  `toolDiffRemoved` red, `warning` amber, links/info blue; gold stays the brand
  accent; the theme passes Pi's validator.
- AC-6: The status cost segment shows the parent session cost plus subagent cost,
  with ` (sub)` appended when `ctx.model.provider` is listed in the theme's
  `statusLine.subscriptionProviders` (default `["claude-bridge"]`); it refreshes
  on usage events without per-frame work.

## Clarifications

- RESOLVED: Design B selected over A (user, after two image mockups);
  superseded after final verification round 3: no message decoration, native
  rendering, since the agent background is not publicly available (user).
- RESOLVED: Thinking shows text only, English `Thinking…`, animated (user);
  superseded after final verification: keep the native label, no animation (user).
- RESOLVED: Subagent totals persist in the session and survive restart and
  `/reload` (user, after final verification).
- RESOLVED: Elapsed ticker adopts pi-omp-theme's mechanism (user).
- RESOLVED: Cost is API-equivalent with `(sub)` and includes subagents (user).
- RESOLVED: The user removed `PI_IMAGE_PROTOCOL`; images await a manual check.

## Decisions

- Message fidelity gate (after final verification rounds 1-2): decorations never
  depend on parsing Markdown structure. The top user rule is always prepended
  as its own block, which cannot be swallowed. The bottom user rule is appended
  only when no line opens a fence (three backticks or tildes at any indentation)
  or starts an HTML block (a line beginning with `<`); otherwise it is omitted.
  The assistant `◆` is inline only when the first character of the first line
  is a Unicode letter (digits can open ordered lists; Pi trims assistant text,
  `assistant-message.js:82-85`) and the second line is neither a setext
  underline nor a table delimiter row; otherwise `◆` sits on its own line before the content. No
  closing fences are ever synthesized.
- Labels are English to match `Thinking…`: `❯ you` for user messages.
- Assistant `◆` applies to every assistant text block: the Markdown
  transformer context exposes no message identity or block position (plan
  review evidence). Rules are ANSI-colored gold text inside Markdown, inset by
  the native user block padding.
- The thinking shimmer was removed: the public label setter is global and
  rebuilds the transcript on every frame (final verification benchmark).
- Ticker: port OMP's per-state interval semantics using only `context.invalidate`
  and `context.state`; OMP's off-screen viewport freeze relies on renderer
  internals and is not ported.
- Usage event contract: channel `thoth:subagent-usage`, payload
  `{ parentSessionId: string, totalCost: number, runCount: number }`; request
  channel `thoth:subagent-usage:request`, payload `{ parentSessionId: string }`,
  answered with the same usage event. Payloads are plain JSON numbers/strings.
  `totalCost` is a cumulative snapshot: consumers replace, never add; the
  publisher deduplicates continued or replayed child messages. The per-parent
  snapshot persists as a custom session entry so restart, resume and `/reload`
  restore it before the first request is answered.
- Semantic colors: malachite green `#6CBF5A` for success/added (an Egyptian
  pigment), red `#E05A4F` for error/removed, amber `#E0A030` for warning; diff
  context stays sand. Turquoise remains only where it carries no status meaning
  (for example inline code), and the status row bar/branch follow `success`.
- Subscription marking is theme configuration, not a provider flag.
- Owners: thoth-designer for visual units (messages, thinking); thoth-worker for
  ticker, provider pricing, subagent usage and status wiring.

## Durable deltas

- None.

## Plan

Root first creates no-op stubs `src/messages/index.ts` (`registerMessages(pi,
config)`) and `src/thinking/index.ts` (`registerThinkingShimmer(pi, config)`) so
the messages unit can wire both from `src/index.ts`. The task rows define the
dependency graph: messages, thinking, ticker, bridge pricing and subagent usage
start in parallel; status wiring waits for messages (config key), bridge pricing and subagent usage.
Verification: package typecheck/tests for pi-thoth-theme, pi-claude-bridge
(`test:unit`) and pi-subagents, root `check:ci`, frozen install, manual Pi session.

## Tasks

- [x] AC-1: Styled user and assistant messages
  - Outcome: superseded by user decision; root removed `src/messages/**`, its wiring, config key, tests and README text, keeping config `statusLine.subscriptionProviders` and the README image note
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/index.ts`, `src/shared/config.ts`, `README.md`; design B image `.pi/generated-images/01a0fcfb-95ad-76f2-8d22-b6384e2a286d/ig_057de2591b3ddec7016ac052b91f4c87d185aecb19843aed92.png`; skills tdd, simplify
  - Inputs: Exploration and Decisions of this record; root stubs
  - Dependencies: none
  - Output: `registerMessages` implementation, config keys `messages.enabled`, `thinking.enabled` and `statusLine.subscriptionProviders` (default `["claude-bridge"]`), wiring of both modules
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/messages/**`, `src/index.ts`, `src/index.test.ts`, `src/shared/config.ts`, `test/config.test.ts`, `README.md`
  - Interface boundaries: `pi.registerMarkdownTransformer`; `registerThinkingShimmer(pi, config)` signature
  - Focused check and PASS evidence: transformer tests for user and assistant output, disabled toggles, composition test
  - Return milestone: tests green
  - Stop / reassessment: rules cannot be colored through Markdown or theme tokens
- [x] AC-2: Remove the thinking-label module
  - Outcome: no thinking module; native label unchanged (root removed `src/thinking/**`, its wiring, config key, tests and README text)
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/thinking/**`; reference `Pretty/src/working-indicator.ts:22-30,205-364,683-731`, `Pretty/src/index.ts:415-500`
  - Inputs: Exploration evidence
  - Dependencies: none
  - Output: `registerThinkingShimmer` implementation with tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/thinking/**`
  - Interface boundaries: `ctx.ui.setHiddenThinkingLabel`; events `message_update`, `message_end`, `agent_end`, `session_shutdown`
  - Focused check and PASS evidence: frame generation tests, start/stop lifecycle with fake timers, no timer after dispose
  - Return milestone: tests green
  - Stop / reassessment: label updates cause measurable input lag in tests
- [x] AC-3: Live elapsed for running tools
  - Outcome: elapsed advances every second while running, frozen after (the edit header already has its separator space at `src/tools/edit.ts:104`)
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/{bash,edit,frame}.ts`; reference `OMP/features/tools/boxed/session-config.ts:63-155`, `shared.ts:104-135`
  - Inputs: Exploration evidence
  - Dependencies: none
  - Output: `src/tools/ticker.ts` and wiring, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`
  - Interface boundaries: renderer `context.invalidate`, `context.state`, `isPartial`, `executionStarted`; existing fidelity and frame tests
  - Focused check and PASS evidence: fake-timer tests show invalidate once per second while partial, none after final result, dispose or agent end; elapsed frozen on re-render
  - Return milestone: tests green
  - Stop / reassessment: invalidate does not reach the cached component
- [x] AC-4: API-equivalent prices in pi-claude-bridge
  - Outcome: bridge models keep Anthropic prices
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/models.ts:32-63`, `src/usage.ts:39-48`
  - Inputs: Exploration evidence
  - Dependencies: none
  - Output: pricing change with tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/src/models.ts` and its unit test file
  - Interface boundaries: `buildModels`, `calculateCost`; plan gating unchanged
  - Focused check and PASS evidence: unit test shows nonzero cost for a sample usage; `test:unit` and typecheck pass
  - Return milestone: tests green
  - Stop / reassessment: source catalog lacks prices for bridge models
- [x] AC-5: Subagent usage event publication
- [x] AC-5: Persist subagent usage snapshots in the session
  - Outcome: snapshots survive restart, resume and `/reload`
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/usage-events.ts`, `src/extension/subagents-extension.ts`
  - Inputs: accepted AC-5 publisher
  - Dependencies: AC-5 publication
  - Output: persistence and restore with tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/usage-events.ts`, `src/extension/subagents-extension.ts`, `test/usage-events.test.ts`
  - Interface boundaries: public session custom entries (`pi.appendEntry` or equivalent), `session_start`; event contract unchanged
  - Focused check and PASS evidence: tests restore the last snapshot from session entries and answer requests after restart; package tests pass
  - Return milestone: tests green
  - Stop / reassessment: no public API to append and read custom session entries
  - Outcome: cumulative subagent cost per parent session on the event bus
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/event-processing.ts:46-54,533-540`, `src/manager.ts:1507-1518`, `src/atelier-metadata.ts:250-280`
  - Inputs: usage event contract in Decisions
  - Dependencies: none
  - Output: emitter, request responder, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/usage-events.ts`, its wiring in `src/manager.ts` or `src/extension/subagents-extension.ts`, and `test/usage-events.test.ts`
  - Interface boundaries: `pi.events`; contract in Decisions
  - Focused check and PASS evidence: tests for emission after child assistant messages, cumulative snapshots with continuation/replay deduplication, per-parent isolation, request reply; package tests pass
  - Return milestone: tests green
  - Stop / reassessment: parent session identity unavailable at accounting time
- [x] AC-6: Status cost with subagents and subscription marker
  - Outcome: `$X.XXX (sub)` including subagent cost
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/status-line/**`
  - Inputs: AC-4 pricing, AC-5 event contract, AC-1 config key
  - Dependencies: AC-1, AC-4, AC-5
  - Output: status wiring reading `config.statusLine.subscriptionProviders`, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/status-line/**`
  - Interface boundaries: `thoth:subagent-usage` channels; footer cache digest
  - Focused check and PASS evidence: tests for summed cost with snapshot replacement (not addition), `(sub)` marking, request on session start, session isolation, no per-frame work
  - Return milestone: tests green
  - Stop / reassessment: usage events arrive before the footer subscribes and no request reply restores them

- [x] AC-7: Conventional semantic colors in the thoth theme
  - Outcome: green additions/success, red removals/errors, amber warnings
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/themes/thoth.json`, `test/theme.test.ts`
  - Inputs: Decisions semantic colors; user diff screenshot
  - Dependencies: none
  - Output: updated theme JSON and tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/themes/thoth.json`, `test/theme.test.ts`
  - Interface boundaries: Pi theme schema and validator
  - Focused check and PASS evidence: theme test asserts semantic token hues and passes Pi's `validateThemeJson`
  - Return milestone: tests green
  - Stop / reassessment: contrast on black fails for chosen hues

- [x] AC-8: Framed powershell tool block
  - Outcome: powershell renders like bash with unchanged execution
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/{bash,index}.ts`; SDK `core/tools/powershell.js`
  - Inputs: AC-3 ticker and bash renderer
  - Dependencies: AC-3
  - Output: powershell registration reusing the bash renderer, tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`
  - Interface boundaries: `createPowerShellToolDefinition`; its exit-status appendix
  - Focused check and PASS evidence: delegation identity test, SDK-composed frame and exit-status tests for powershell
  - Return milestone: tests green
  - Stop / reassessment: powershell result contract differs from bash in a way the shared renderer cannot express

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 2cdc346893b99b2202829d3310d71ee1789dd622bed34268256d1b0847131fa9

- Provenance: plan review EXPLICIT_REVIEW, fresh Oracle OKAY; AC-7 and AC-8 added afterwards on explicit user requests; implementation explicitly authorized by the user. Final verification by fresh read-only thoth-oracle sessions: round 1 FAIL (AC-1 Markdown fidelity, AC-2 shimmer cost), round 2 FAIL (AC-1), round 3 FAIL (AC-1); the user then removed the thinking animation and the message decoration (recorded in Clarifications); round 4 PASS (task subtask_thoth-oracle_1790994053584_dad4e1ea).
- AC-1: PASS | removal and composition audit | no message module, wiring, config key or README section; no Markdown transformer registered
- AC-2: PASS | package-wide absence check | no thinking-label module or hidden-label calls; native label unchanged
- AC-3: PASS | ticker lifecycle and real SDK tests | 1000 ms invalidation while running, frozen completion, cleanup at agent end, session shutdown and dispose
- AC-4: PASS | pricing projection and usage tests | catalog prices kept for 13 models; plan gating unchanged
- AC-5: PASS | publisher, persistence and lifecycle | cumulative snapshots, replay dedup, request recovery, custom-entry restore across restart, resume and reload
- AC-6: PASS | footer accounting and caching | parent plus replaced subagent snapshot, (sub) marker, session isolation, event-driven refresh
- AC-7: PASS | palette and Pi validator | green success/additions, red errors/removals, amber warnings, gold accent
- AC-8: PASS | delegation and SDK-composed frames | powershell execution unchanged, shared framing, exit status, ticker, SGR stripping
- Root fresh frozen-input checks: check:ci 0; typecheck 0 for pi-thoth-theme, pi-subagents, pi-claude-bridge; tests 327, 585 pass / 1 skipped, 325; frozen install 0; git diff --check 0
- Source: pi-packages/pi-thoth-theme/src/index.ts | sha256:78c1b9f1388f9071ba093e2ab3702286d7ff188631825717f03746b8ff8062a3
- Source: pi-packages/pi-thoth-theme/src/shared/config.ts | sha256:e69fc2b6945740d9e3ce41b83fe9932b9816089cd25dbaf844e4c3a947631e9b
- Source: pi-packages/pi-thoth-theme/src/tools/ticker.ts | sha256:9249c31423504df2e6092028cc0536aaa2ce9952a36711d296158796e7b72475
- Source: pi-packages/pi-thoth-theme/src/tools/bash.ts | sha256:d58ad90bd787c5a66bec5bdd6a698d526e9e5328da61ad8f2149d558fd5fa1a0
- Source: pi-packages/pi-thoth-theme/src/tools/index.ts | sha256:6e49af726dcd3ab74faf84292a086ad2e518a3ffe5c0d1e137400770714918ea
- Source: pi-packages/pi-thoth-theme/src/status-line/index.ts | sha256:5a0c3ce2648981a1393c60110da8afce71beb003a76fea9495140c4efc6f47d1
- Source: pi-packages/pi-thoth-theme/themes/thoth.json | sha256:2bff9f3e188fb0d4f2bd32b4ed23cd6fe25ee03e021dde5524c0001bbecbee95
- Source: pi-packages/pi-thoth-theme/README.md | sha256:efa47705e17cda513ef7400459478b0234c794fcd456060566c2922567427da7
- Source: pi-packages/pi-subagents/src/usage-events.ts | sha256:52f76f8b9b7dfb72501047ae64e8e7e1a37b29f2bb2136d1241e53062d33b8ff
- Source: pi-packages/pi-claude-bridge/src/models.ts | sha256:2bc9b56ef1a95762d30b769f3e23f521aa825686bafd4b8f6ded21f1f2c02466
- Residual manual checks (user): Orca fullscreen images, live elapsed and palette appearance, displayed cost across /reload and resume

## Closeout

**Archive**: READY
