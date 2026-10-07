# Change: theme-generic-frame-scope

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: medium

## Exploration

User tests of the archived `2026-10-03-theme-tool-renderers` in Pi 1.0.1 showed:
`ask_user_question` and thoth-mem tools (`mem_recall`, `mem_project`,
`mem_context`) in the generic frame, `subagent_run` and `read` correct, but MCP
`grep_searchGitHub` still in its native one-line style, because pi-mcp-adapter
ships its own renderers and the current rule respects any tool with
`renderCall` or `renderResult` (`pi-packages/pi-thoth-theme/src/tools/index.ts:41-55`).
thoth-mem results are single-line JSON, so the collapsed preview shows one
truncated line; `ask_user_question` arguments print as raw JSON
(`src/tools/generic.ts:44-64` uses compact `JSON.stringify`; body extraction at
`:126-156`).

Ownership is public at render time: `pi.getAllTools()` returns `ToolInfo` with
required `sourceInfo { path, source, scope, origin, baseDir? }`
(`pi-coding-agent/dist/core/extensions/types.d.ts:1540-1547,1246-1247`,
`core/source-info.d.ts:4-10`); built-ins use `source: "builtin"`; package tools
carry the package `baseDir` (local path or installed npm root); later
registrations refresh the registry (`core/extensions/loader.js:231-240`), so a
resolver closure can query current metadata (`core/extensions/runner.js:542-545`).
Fork tools with their own renderers: all eight `subagent_*`, `AskClaude`,
`AskAntigravity`, and `bg_task_log`, `bg_task`, `bg_status` (result only).

## Intent

The generic frame covers every tool not owned by this repository's packages,
including MCP and other third-party tools with their own renderers, and shows
JSON results and structured arguments legibly.

## Non-goals

- Changing built-in tool frames, execution, or any fork's renderers.
- Image squashing, queued-prompt race.
- Publishing or version bumps.

## Acceptance

- AC-1: For non-built-in tools, the resolver returns the downstream renderers
  unchanged only when the tool's registering package is a thoth-agents package
  (the nearest `package.json` found by walking up from `sourceInfo.baseDir` has
  name `thoth-agents` or one starting with `@thoth-agents/`; the walk stops at
  the first manifest found, even if foreign, malformed or unreadable, and
  results are cached per starting directory) and the downstream
  defines `renderCall` or `renderResult`; every other tool, including
  third-party tools with their own renderers, gets the generic frame. Registered
  tools without `baseDir` get the generic frame (no cwd substitution); tools
  missing from `getAllTools()` keep current behavior.
- AC-2: When a generic result's text parses as a JSON object or array, the body
  shows it pretty-printed with two-space indentation (collapsed to the first
  eight lines with the existing expand hint); other text is unchanged.
- AC-3: Generic argument summaries render arrays as `key=[N items]` and nested
  objects as `key={k1, k2, …}` (first keys, truncated), keeping scalars as today.

## Clarifications

- RESOLVED: Respect only this repository's forks; frame MCP and other tools
  (user, after screenshots, this session).
- RESOLVED: Pretty-print JSON results and summarize structured arguments (user).

## Decisions

- Ownership is decided by the registering package name, which works for local
  `pi-packages/*` paths and npm installs alike; no tool-name lists.
- Unregistered tools (for example resumed MCP calls before connect) cannot be
  attributed; they keep today's behavior (generic frame when no downstream
  callbacks, else respected), since no package can be read.
- Package-name lookups walk up from `baseDir` (plan review: `baseDir` can be a
  subdirectory such as `src/` for local extension files,
  `core/package-manager.js:1075`) and are cached per starting directory,
  positive and negative; a failed read counts as third-party.
- Ownership is read from the current `sourceInfo` at each resolution (resolution
  happens at component construction, not per frame); it is not cached by tool
  name, so a same-name replacement is attributed to its new owner.

## Durable deltas

- None.

## Plan

One writer (thoth-designer, visual) changes `src/tools/index.ts` and
`src/tools/generic.ts` with tests in `src/tools/{resolver,generic}.test.ts`.
Verification: package typecheck and tests, root `check:ci`, frozen install,
manual Pi check with an MCP tool, `ask_user_question` and thoth-mem tools.

## Tasks

- [x] AC-1: Ownership-based respect rule
  - Outcome: only thoth-agents package tools keep their own renderers
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/index.ts:41-55`, `src/tools/resolver.test.ts`; skills tdd, simplify
  - Inputs: Exploration and Decisions
  - Dependencies: none
  - Output: resolver change and tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`
  - Interface boundaries: `pi.getAllTools()` sourceInfo; `registerToolRenderer` contract
  - Focused check and PASS evidence: tests for fork tool respected (package root and nested `src/` baseDir), npm-style root, third-party tool with renderers framed, foreign/malformed/unreadable nearest manifest framed, no baseDir framed, tool absent from registry keeps current behavior, same-name replacement, built-ins (incl. shadow names) unchanged, directory cache with no repeated fs reads
  - Return milestone: package tests green
  - Stop / reassessment: `getAllTools` unavailable inside the resolver
- [x] AC-2: Pretty JSON results in the generic frame
  - Outcome: JSON bodies indented and collapsible
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/generic.ts:126-156`
  - Inputs: AC-1 unit (same files)
  - Dependencies: AC-1
  - Output: body formatting and tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`
  - Interface boundaries: existing escaping, width safety and cache
  - Focused check and PASS evidence: tests for object, array, invalid JSON, large JSON collapse/expand, control characters
  - Return milestone: package tests green
  - Stop / reassessment: none
- [x] AC-3: Structured argument summaries
  - Outcome: arrays and objects summarized
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/generic.ts:44-64`
  - Inputs: AC-1 unit
  - Dependencies: AC-1
  - Output: summary change and tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`
  - Interface boundaries: width truncation and escaping
  - Focused check and PASS evidence: tests for arrays, nested objects, scalars, long keys
  - Return milestone: package tests green
  - Stop / reassessment: none

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 3b4193ade58381622605fa1590202cd1c10ecf447a4e273befe2a3e6f1b47ef8

- Provenance: plan review EXPLICIT_REVIEW, round 1 REJECT (baseDir may be a subdirectory) repaired, round 2 fresh Oracle OKAY; implementation explicitly authorized by the user; final verification by a fresh read-only thoth-oracle, round 1 PASS (task subtask_thoth-oracle_1791048878860_a74eb8fd).
- AC-1: PASS | ownership and resolver probes on real paths | repo root and six forks owned; thoth-mem and pi-mcp-adapter third-party; first manifest decides; current registry metadata; built-ins first
- AC-2: PASS | Pi 1.0.1 ToolExecutionComponent probes | JSON object/array indented, eight-line collapse and full expand; non-JSON unchanged; escaping and width preserved
- AC-3: PASS | summary assertions | arrays as item counts, objects as first four keys; scalars, truncation and escaping intact
- Root fresh frozen-input checks: check:ci 0; package typecheck 0; 366 tests pass twice; frozen install 0; git diff --check 0
- Source: pi-packages/pi-thoth-theme/src/tools/ownership.ts | sha256:a3a1b7b8b89ef72ae0b20fe3d6cadda3b23be87eaf0c0ec7b0ba8687f4696ca1
- Source: pi-packages/pi-thoth-theme/src/tools/index.ts | sha256:2464e295a108af3fa7e89f12b2ccf91ad8f59b7fdc2b24dfb3897d5bece9d89e
- Source: pi-packages/pi-thoth-theme/src/tools/generic.ts | sha256:b6f2d25803df3b108e95c3b9ed87043a5aa957a69b8f90bce160c88b72ebe57b
- Residual manual checks (user): live Pi view of MCP, ask_user_question and thoth-mem collapsed/expanded; read and subagent renderers unchanged

## Closeout

**Archive**: READY
