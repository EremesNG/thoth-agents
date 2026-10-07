# Change: theme-tool-renderers

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Pi 1.0.1 (2026-10-03) adds `pi.registerToolRenderer(resolver)` with
`resolver(toolName, next) => { renderShell?, renderCall?, renderResult? } | undefined`
(upstream `packages/coding-agent/src/core/extensions/types.ts:649-658,1682`).
Interactive mode resolves extension renderers before a registered tool's own
renderers (`interactive-mode.ts:2192-2196`), so it applies to built-in and
extension tools by name; it never changes execution or schemas (`types.ts:649`).
Resolvers run in extension load order; `next()` returns the downstream
selection, ending in the registered tool's renderers; there is no field merge
(`loader.ts:367-371`, `runner.ts:789-795`, `tool-execution.ts:273-315`).
`renderShell: "self"` is supported (`tool-execution.ts:266-269`). Renderer context
keeps `args`, `toolCallId`, `invalidate`, `state`, `cwd`, `executionStarted`,
`argsComplete`, `isPartial`, `expanded`, `showImages`, `isError` (`types.ts:459-492`).
Pi 1.0.1 also converts JPEG/GIF/WebP inside `Image` for Kitty (#10292), so the
theme's `read` needs no image change.

Today `pi-packages/pi-thoth-theme/src/tools/index.ts` re-registers eight built-in
tools (`read`, `bash`, `powershell`, `ls`, `grep`, `find`, `edit`, `write`) through
`pi.registerTool`, delegating execution to the SDK `create*ToolDefinition`
factories, only to replace their renderers. Every other tool renders natively
or with its own renderer: user screenshots show `ask_user_question` and MCP calls
as plain native text, while the repository's forks (pi-subagents `subagent_*`,
pi-background-tasks, pi-claude-bridge and pi-antigravity-bridge tools) ship
their own renderers. The package's dev dependencies pin
`@earendil-works/*` `^0.99.1`.

The Pi 1.0.1 fullscreen Kitty fix (#10319) is WezTerm-only; forcing it in Orca
showed the image briefly then blank, so image squashing remains out of scope.

## Intent

Render the theme's eight built-in tool frames through `registerToolRenderer`
instead of re-registering the tools, and give every tool without its own
renderer (MCP tools, user-question tools, web tools, etc.) a generic thoth frame,
while tools that ship their own renderers, including this repository's forks,
keep them.

## Non-goals

- Changing tool execution, parameters or any other package's renderers.
- Image squashing in Orca fullscreen; queued-prompt race.
- Supporting Pi older than 1.0.1.
- Publishing or version bumps.

## Acceptance

- AC-1: The theme no longer calls `pi.registerTool`; the eight built-in tools
  render with the existing framed renderers through `pi.registerToolRenderer`,
  with unchanged execution, and all existing fidelity, caching, ticker, image
  and frame tests still pass.
- AC-2: For any other tool name, the resolver returns the downstream renderers
  unchanged when they define `renderCall` or `renderResult`, and otherwise a
  generic framed renderer: tool name as title, a one-line argument summary,
  collapsed result preview with Pi's native expand, error styling, live elapsed
  while running, control-character escaping and width safety; images still
  render natively.
- AC-3: The package targets Pi 1.0.1: dev dependencies `^1.0.1`, peer
  `@earendil-works/pi-coding-agent` `>=1.0.1`, lockfile updated, README
  documents the requirement and the generic frame; module toggle
  `tools.enabled` disables both built-in and generic rendering.

## Clarifications

- RESOLVED: Implement the Pi 1.0.1 renderer API (user, this session).
- RESOLVED: Respect tools whose renderers the repository's forks already adapt;
  add a generic frame for the rest, e.g. MCP and user-question tools (user).
- RESOLVED: Images stay out of scope; WezTerm path tested by the user and not a
  fix for Orca.

## Decisions

- Respect rule: a tool keeps its own presentation when `next()` returns an
  object with `renderCall` or `renderResult`; this covers all forks without a
  name list. Third-party tools that ship renderers are respected the same way.
- Respect is per tool, not per package (plan review): fork tools without
  callbacks (some pi-background-tasks tools, pi-antigravity-bridge web/replay
  tools) receive the generic frame. Built-in names are dispatched before
  `next()`, since Pi 1.0.1 adds native callbacks for built-ins. Tests cover
  built-in precedence, callback-free downstream objects and single-callback
  definitions; object truthiness alone is not the rule.
- No fallback to `registerTool` for Pi < 1.0.1: when `pi.registerToolRenderer`
  is absent the tools module registers nothing and Pi renders natively.
- The generic frame reuses `src/tools/frame.ts`, `box.ts`, `cache.ts` and
  `ticker.ts`; MCP names display without transport prefixes only when Pi
  provides a separate label; otherwise the raw name.

## Durable deltas

- None.

## Plan

Root first upgrades dev dependencies and the lockfile (mechanical, network
install) so typings expose `registerToolRenderer`. Then two writers in
sequence on `src/tools/**`: the migration of the eight built-ins, then the
generic frame on top of it (both touch `src/tools/index.ts`). Verification:
package typecheck and tests, root `check:ci`, frozen install, manual Pi session.

## Tasks

- [x] AC-3: Target Pi 1.0.1 dependencies
  - Outcome: typings and lockfile at 1.0.1
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/package.json`, `pnpm-lock.yaml`
  - Inputs: Exploration
  - Dependencies: none
  - Output: updated manifest and lockfile
  - Owner: root
  - Writes: `pi-packages/pi-thoth-theme/package.json`, `pnpm-lock.yaml`
  - Interface boundaries: other packages keep their pins
  - Focused check and PASS evidence: `pnpm install` succeeds and the installed SDK types declare `registerToolRenderer`
  - Return milestone: typings available
  - Stop / reassessment: 1.0.1 not published on npm
- [x] AC-1: Built-in frames through registerToolRenderer
  - Outcome: eight built-ins rendered by resolver, no registerTool
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/{index,bash,read,ls,grep,find,edit,write,powershell}.ts`, tests under `src/tools/`, `src/index.test.ts`, `test/image-lifecycle.test.ts`; skills tdd, simplify
  - Inputs: AC-3 typings
  - Dependencies: AC-3
  - Output: migrated tools module and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`, `src/index.ts`, `src/index.test.ts`, `test/image-lifecycle.test.ts`
  - Interface boundaries: `registerToolRenderer` resolver contract; renderers keep current output
  - Focused check and PASS evidence: tests prove no `registerTool` call, resolver returns theme renderers for the eight names, SDK-composed frames unchanged
  - Return milestone: package tests green
  - Stop / reassessment: renderers depend on execution-time state only available through registerTool
- [x] AC-2: Generic frame for tools without renderers
  - Outcome: thoth frame for unrendered tools, respect for rendered ones
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/{frame,box,ticker}.ts`
  - Inputs: AC-1 resolver
  - Dependencies: AC-1
  - Output: `src/tools/generic.ts`, resolver branch, tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`, `README.md`
  - Interface boundaries: `next()` respect rule in Decisions
  - Focused check and PASS evidence: tests for respected renderers, generic frame (partial, success, error, expanded, long args, control characters, widths 0/1/80), images preserved
  - Return milestone: package tests green
  - Stop / reassessment: `next()` returns renderers for every registered tool even without callbacks

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 2d85bfb5b74239dacde84cf2dfdafec341763cd1ea5d89078ecee6f68004fe0f

- Provenance: plan review EXPLICIT_REVIEW, fresh Oracle OKAY; implementation explicitly authorized by the user; final verification by a fresh read-only thoth-oracle, round 1 PASS (task subtask_thoth-oracle_1791047118046_814a2648).
- AC-1: PASS | renderer-only migration against Pi 1.0.1 dist | no registerTool; eight built-ins resolved before next(); execution native; toggle, absent-API guard, ticker and image hooks preserved
- AC-2: PASS | respect rule and real 1.0.1 runtime probes | downstream callbacks preserved by identity; callback-free or missing get the generic frame; ticker, escaping, error, collapse/expand, widths 0/1, Kitty images and resumed unregistered tools
- AC-3: PASS | manifest, README and structural lockfile comparison | dev deps ^1.0.1, peer >=1.0.1; other six importers unchanged
- Root fresh frozen-input checks: check:ci 0; package typecheck 0; 342 tests pass twice; frozen install 0; git diff --check 0
- Source: pi-packages/pi-thoth-theme/src/tools/index.ts | sha256:ff19b5a0835aa4ea1c00dc24871da562ae6c4a5066482f2d1694f4d49c33173a
- Source: pi-packages/pi-thoth-theme/src/tools/generic.ts | sha256:334c3b096db2c33b95b8574d070e12f045eb166c1f787fadc2ad82335308864c
- Source: pi-packages/pi-thoth-theme/src/tools/resolver.test.ts | sha256:15a64a8c7ac5b679732b34fc856790865d229c82027805dfe1742bd74256d2ba
- Source: pi-packages/pi-thoth-theme/package.json | sha256:53f94aad544f3aa1bd1d6be61b58f1653a832d074328248ed8a1afbc8a68fb76
- Source: pi-packages/pi-thoth-theme/README.md | sha256:7971f9c3d684bde5e6ec82be6d8c6f05c754ca9e7a362148b0dcc5a75c6446a6
- Source: pnpm-lock.yaml | sha256:d478d949fdf503ede352e8ae388ed63d37692428c3672a4d305f9fc64f721746
- Residual manual checks (user): real-terminal appearance of generic frames, native expansion, /reload; fullscreen image squashing out of scope

## Closeout

**Archive**: READY
