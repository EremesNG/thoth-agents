# Change: claude-bridge-prompt-fidelity

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Two Explorer runs (read-only, source and installed type definitions; no tests run) established:

- Prompt capture: `pi-packages/pi-claude-bridge/src/index.ts:2553-2598` records prompts on `before_agent_start` (with `event.systemPromptOptions`) and on `agent_start` / `turn_start` (with `ctx.getSystemPrompt()` plus the options stashed at `before_agent_start`). `recordSystemPrompt` reads only `customPrompt`, `appendSystemPrompt`, `contextFiles`, `skills` and `selectedTools`; it never reads `sections`.
- Captures are keyed by the full assembled prompt (`src/prompt-capture.ts:75-98`). `projectCapture` joins project context, skills, custom and append (`prompt-capture.ts:340-349`), guarded per part by `assertSendablePrompt` (`prompt-capture.ts:355-379`). The result is sent as `systemPrompt: { preset: "claude_code", append }` (`index.ts:2088-2090`).
- Pi (`@earendil-works/pi-coding-agent`) exposes `systemPromptOptions.sections: Record<string,string>`, mutable by extension handlers in order. Pi's renderer appends each non-empty entry after `cwd` as `<name>\n…\n</name>` (`dist/core/system-prompt.js:106-113`). Sections are therefore in the capture key but absent from every projected part for exact-key (top-level) captures. thoth-mem writes its identity/recovery block to `sections.thoth_mem_recovery`, so Claude Code never sees it. This was observed live: the current Claude Bridge root session has no thoth-mem identity block.
- Derived (child) captures project `custom` as the whole prompt with parents substituted (`prompt-capture.ts:141-202`). Section text can survive there inside the surrounding text.
- Plan review 1 (Oracle, [REJECT]) found that Pi's renderer (`system-prompt.js:68-117`) lets some section names (for example `addendum`) **replace built-in content in place** instead of adding a tagged block. For example, `appendSystemPrompt: "POLICY"` plus `sections.addendum: "POLICY"` renders once in Pi. The review also found that `index.ts:2351-2389` is AskClaude's native-tool path. The MCP-provider projection is at `index.ts:1908-1913`, and `renderSkillsBlock` returns nothing without visible skills or a reader (`skills.ts:8-12`). The assembled key itself is not projected, so exact captures do not inherently double-count sections.
- Pi includes a section when its value is truthy, so whitespace-only values are kept.
- Caching (Explorer, code and docs only; no live cache measurement):
  - Each query sends `systemPrompt {preset:"claude_code", append}` (`index.ts:2088-2091`).
  - On a resumed Claude Code session, the recorded system prompt is reused verbatim. A changed `append` is delivered as `UserPromptSubmit` `additionalContext` per recording epoch (`append-instructions.ts:20-85`), so the cached prefix (tools, system prompt, history) stays byte-identical (`.thoth/specs/pi-ecosystem/spec.md:59-61`).
  - Append diffs are block-based (`append-blocks.ts:66-161`):
    - Top-level XML tags or `<!-- name:start/end -->` regions at line start become keyed blocks.
    - Text between blocks becomes position-numbered `free:N` blocks.
    - Duplicate or ambiguous keys, or a change in the relative order of shared keys, force a full replacement. That is still a context update, not a prefix change, but it is larger.
  - MCP tool definitions are rebuilt per query in Pi's tool order (`index.ts:1120-1179`; Claude Code runs with `tools: []`). Any change to tool names, descriptions or schemas changes Claude Code's cached tool block.
  - Prompt-capture keys are already the assembled prompt, which already contains Pi-rendered sections. Projection does not change key pressure on the 256-entry map (`prompt-capture.ts:52-122`).
  - Rebuilds (abort, `/compact`, tree navigation) are the documented cache-loss path and are independent of append content (`diag/AUDIT.md:244-268`).
- Tool names: the bridge serves Pi tools as `mcp__custom-tools__<name>` (`index.ts:1136,1176`; `src/skills.ts:3-4`) and maps names back on inbound calls only (`index.ts:930`). The only prompt-side handling is `rewriteSkillsBlock` (`skills.ts:15-20`), which annotates the `read` tool in the skills block. The thoth pi-root block (`src/harness/writers/pi-agent.ts:65`) and other Pi instructions use unprefixed names such as `subagent_run`. Models have concluded "subagent_run is unavailable" and skipped delegation.
- Spec: `.thoth/specs/pi-ecosystem/spec.md` "Claude bridge keeps appended instructions current" requires changed append content to be re-delivered on resumed sessions.
- Tests: `pi-packages/pi-claude-bridge/tests/unit-prompt-capture.mjs`, `unit-prompt-guard.mjs`, `unit-agent-start-capture.mjs`, `unit-append-instructions.mjs`, `unit-resume-prompt-capture.mjs` and `unit-skills.mjs`. None of them pass `sections`.

## Intent

When Pi runs through `@thoth-agents/pi-claude-bridge`, Claude Code receives:

1. the content of every extension prompt section from `systemPromptOptions.sections` exactly once, with built-in overrides applied as Pi applies them and other sections rendered as Pi's tagged blocks; and
2. an explicit statement that Pi tools referenced by their plain names in the instructions are served as `mcp__custom-tools__<name>`.

This fixes thoth-mem identity loss and false "delegation unavailable" conclusions without changing thoth-mem or the harness-neutral pi-root prompt.

## Non-goals

- Changing thoth-mem, its section channel, or `thoth-mem --help`.
- Rewriting every tool name inside projected instructions.
- Changing the pi-root prompt text or other harnesses.
- Changing capture keying, cache size, or derived-capture matching beyond what section projection requires.
- Bumping package versions.

## Acceptance

- AC-1: For an exact-key capture, every section whose name is not a built-in Pi slot and whose value is truthy (Pi's own inclusion rule) is projected as `<name>\n<value>\n</name>`, in insertion order, after the existing parts. The rule holds for sections set by handlers that run after the bridge's `before_agent_start` handler: the bridge snapshots sections at every recording (`before_agent_start`, `agent_start`, `turn_start`).
- AC-2: Projection is source-aware and emits each section's content exactly once in every capture kind: exact, recorded-child and derived.
  - A section whose name is a built-in Pi slot (for example `addendum`) replaces or occupies that slot's projected part as Pi does. It is never projected in addition to the same captured `custom` or `append` content.
  - Section content already carried by a derived capture's custom text is not emitted again.
  - Projected section parts pass through `assertSendablePrompt`.
  - Regressions are renderer-backed: tests build the prompt with the installed Pi renderer and compare.
  - Capture keys and matching stay unchanged.
- AC-3: Changed section content on a resumed session is delivered through the existing appended-instructions update mechanism.
- AC-4: When the provider query actually advertises Pi tools over the `custom-tools` MCP server, the outer provider append (`index.ts` ~1908-1913) contains exactly one concise note stating that a plain tool name `X` in the instructions refers to `mcp__custom-tools__X` and must not be treated as unavailable.
  - The note does not depend on skills or `read` availability.
  - It is emitted once even for inherited or derived children.
  - It is absent when no MCP tools are advertised.
  - Existing `renderSkillsBlock` / `rewriteSkillsBlock` behavior and the AskClaude native-tool path (`index.ts` ~2351-2389) are unchanged.
- AC-6: The change preserves prompt caching.
  - It does not alter MCP tool names, descriptions, schemas or order.
  - Each projected section and the prefix note is its own top-level, line-start tagged block with a stable unique key. No `free:N` text is introduced between blocks. Blocks appear in a deterministic order.
  - The note text is byte-constant across queries.
  - A test on a resumed session shows that changing one section's value produces a per-block `additionalContext` delta for that section's key only, not a full replacement or a rewritten system prompt.
  - Prompt-capture keys are unchanged.
- AC-5: Existing bridge unit tests and the package typecheck pass. Root `pnpm run check:ci` introduces no new failure. Biome excludes `pi-claude-bridge`. A preexisting error in the unchanged `pi-packages/pi-subagents/test/ui/panel.test.ts:3323` is out of scope and is recorded, not fixed.

## Clarifications

- Resolved: the user chose to plan both issues in one record (question-tool answer, this session).
- No further human-owned decisions. Placement, format and note wording are technical decisions below.

## Decisions

- D-1: Fix in the bridge, not in thoth-mem. Sections are a native Pi channel that any extension may use.
- D-2: Follow Pi's renderer semantics for sections; the installed `system-prompt.js` is the source of truth.
  - Derive the set of built-in slot names from that renderer.
  - A built-in-slot section maps onto the corresponding projected part and is not added twice.
  - Every other truthy section is rendered as `<name>\n…\n</name>` in insertion order, as the final projected part.
- D-3: Snapshot (copy) sections at each recording (`before_agent_start`, `agent_start`, `turn_start`) so the result does not depend on the order in which extension handlers run. The retained options reference is never read lazily.
- D-4: The prefix note is a generic statement added once at the outer provider-append boundary. It is gated on the MCP tools actually advertised for that query, not on skills. Individual names are not rewritten. The note text stays out of any prompt the bridge records as a capture key.
- D-5 (user requirement: do not break caching): Nothing goes into tool definitions.
  - The note is a constant tagged block (for example `<mcp_tool_names>…</mcp_tool_names>`), placed before the section blocks.
  - Sections are emitted last, in insertion order, as tagged blocks.
  - Mid-session changes therefore travel only through the existing per-block append update. A section name that collides with an existing top-level tag in the append degrades only to a full-replacement context update; this is accepted and covered by a test.

## Durable deltas

- `ADDED pi-ecosystem` **Claude bridge projects Pi prompt sections** — `@thoth-agents/pi-claude-bridge` MUST project the content of every Pi `systemPromptOptions.sections` entry that Pi would render into the prompt sent to Claude Code exactly once, applying built-in slot overrides as Pi does and rendering other sections in Pi's tag-wrapped form.
  - GIVEN a Pi extension sets a non-built-in prompt section with a truthy value; WHEN the bridge sends that turn to Claude Code; THEN the appended system prompt contains that section exactly once in Pi's tag-wrapped form.
- `ADDED pi-ecosystem` **Claude bridge discloses MCP tool names** — `@thoth-agents/pi-claude-bridge` MUST, when it serves Pi tools over its MCP server, tell the model that plain Pi tool names in instructions refer to the prefixed MCP tools.
  - GIVEN Pi tools are served as `mcp__custom-tools__<name>`; WHEN the bridge projects the system prompt; THEN the prompt states that a plain name `X` refers to `mcp__custom-tools__X`.

## Plan

Bridge-only changes in `pi-packages/pi-claude-bridge/src/`, implemented test-first:

1. **Sections (AC-1..3).**
   - Extend the capture record in `index.ts` `recordSystemPrompt` and in `prompt-capture.ts` with a snapshot of `sections` taken at each recording.
   - In `projectCapture`, apply built-in-slot sections onto their corresponding parts and render the remaining sections as a final guarded part.
   - For derived captures, never emit section content the custom text already carries.
   - Seams: renderer-backed cases built with the installed Pi `buildSystemPrompt`:
     - a custom section on an exact capture;
     - a late-set section;
     - the `addendum`-equals-`append` override;
     - a recorded child and a derived child, with no duplication;
     - a guard rejection;
     - a resumed-session update case in `unit-append-instructions.mjs`.
2. **Prefix note (AC-4).**
   - Add a note builder (for example in `skills.ts` or a small sibling module).
   - Emit it once at the outer provider-append boundary in `index.ts` (~1908-1913), gated on the MCP tools advertised for that query.
   - Seams:
     - a non-`read` MCP tool with zero skills shows the note;
     - inherited and derived children get a single note;
     - no MCP tools means no note;
     - existing `unit-skills.mjs` expectations still pass.
3. **Cache stability (AC-6).**
   - Seams:
     - a resumed-session test in `unit-append-instructions.mjs` style showing a single-key per-block delta when a section changes;
     - an assertion that MCP tool definitions are identical with and without the change for the same Pi tools;
     - note byte-equality across two queries;
     - a block-segmentation check showing no `free:N` blocks added by the projection.
4. **Checks (AC-5).** Run the bridge package unit tests (`test:unit`) and typecheck, then root `pnpm run check:ci`. Root check:ci must show no failure attributable to this change; Biome excludes the bridge package.

Both units touch `index.ts` / projection, so one Worker owns both sequentially (one writer per surface).

Risks:
- Changes to the prompt key or projection could break child matching or trigger the pi#5581 diagnostic. Mitigation: keep keys unchanged and project only.
- Per-turn section variation grows the append-diff traffic. This is accepted, because the existing spec already handles it.
- From plan review 3 ([OKAY]), for the implementer:
  - Raw built-in slot replacements (for example `addendum`) would produce `free:N` deltas, and `<project_context>` is segmented recursively. Give the override an opaque keyed representation and cover it in the resumed-session tests, without changing segmentation.
  - `mcpTools` can include tools whose schema is omitted. Gate the note on tools actually advertised to Claude Code, not on the array length.
  - The first query of an epoch may pay a one-time cache write for the new content.

## Tasks

- [x] AC-1: Bridge projects non-empty Pi prompt sections for exact-key captures, including late-set sections
  - Outcome: sections captured at every recording point and rendered as the final projected part
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/index.ts (recordSystemPrompt ~2553-2598), src/prompt-capture.ts (75-98, 340-379), pi-packages/pi-claude-bridge/node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js (68-147); C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md
  - Inputs: Exploration section of this record
  - Dependencies: none
  - Output: code plus failing-then-passing unit tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/prompt-capture.ts, tests/unit-prompt-capture.mjs, tests/unit-agent-start-capture.mjs (or a new tests/unit-prompt-sections.mjs)
  - Interface boundaries: capture key and resolveOrDerive semantics unchanged; assertSendablePrompt applies to sections
  - Focused check and PASS evidence: new section tests fail before and pass after; bridge test:unit passes
  - Return milestone: section tests green
  - Stop / reassessment: if keys or derived matching must change, or the built-in slot set cannot be derived from the installed renderer, return to root
- [x] AC-2: Section projection is source-aware exactly-once across exact, recorded-child and derived captures, including built-in overrides, and is guarded
  - Outcome: built-in-slot overrides applied without duplication; no duplicate section text in any capture kind; guard covers sections
  - Known entrypoints and skill paths: src/prompt-capture.ts (141-202, 340-379)
  - Inputs: AC-1 unit output
  - Dependencies: AC-1 unit accepted
  - Output: code plus renderer-backed tests (addendum-equals-append override, recorded child, derived child without duplication, guard rejection)
  - Owner: thoth-worker
  - Writes: same files as AC-1
  - Interface boundaries: derived-capture matching unchanged
  - Focused check and PASS evidence: new derived and guard tests pass
  - Return milestone: tests green
  - Stop / reassessment: if de-duplication requires changing matching, return to root
- [x] AC-3: Changed sections on resumed sessions arrive via the appended-instructions update
  - Outcome: resumed session receives the section diff
  - Known entrypoints and skill paths: tests/unit-append-instructions.mjs; appended-instructions logic in src/index.ts
  - Inputs: AC-1 unit output
  - Dependencies: AC-1 unit accepted
  - Output: test (plus code only if needed)
  - Owner: thoth-worker
  - Writes: tests/unit-append-instructions.mjs, src/index.ts if required
  - Interface boundaries: existing pi-ecosystem appended-instructions contract
  - Focused check and PASS evidence: new resumed-session test passes
  - Return milestone: test green
  - Stop / reassessment: if the update mechanism cannot see sections, return to root
- [x] AC-4: Prompt states the MCP tool-name prefix when tools are served over MCP
  - Outcome: concise generic note present only when MCP tools are served
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/index.ts (outer provider append ~1906-1913, resolveMcpTools ~1114-1176), src/skills.ts (3-20)
  - Inputs: Exploration section of this record
  - Dependencies: AC-1 unit (same writer and files)
  - Output: code plus tests (new tests/unit-mcp-tool-note.mjs or equivalent; unit-skills.mjs unchanged expectations)
  - Owner: thoth-worker
  - Writes: src/index.ts, src/skills.ts or a new sibling module, new or updated test file
  - Interface boundaries: renderSkillsBlock / rewriteSkillsBlock and the AskClaude native-tool path (~2351-2389) unchanged
  - Focused check and PASS evidence: note present for a non-read MCP tool with zero skills; single note for inherited and derived children; absent with no MCP tools
  - Return milestone: tests green
  - Stop / reassessment: if the outer provider-append boundary does not cover child sessions with a single emission, return to root
- [x] AC-6: Projection preserves prompt caching
  - Outcome: tests prove stable tool definitions, a constant note, keyed tagged blocks without free text, and single-key context deltas on resumed sessions
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/append-instructions.ts (20-85), src/append-blocks.ts (66-161), src/index.ts (1120-1179, 2088-2091); tests/unit-append-instructions.mjs
  - Inputs: AC-1 through AC-4 outputs
  - Dependencies: AC-1, AC-2, AC-3, AC-4 accepted
  - Output: tests (plus code only if a cache invariant fails)
  - Owner: thoth-worker
  - Writes: bridge test files; bridge src only to restore an invariant
  - Interface boundaries: append-update and recording-epoch semantics unchanged; MCP tool definitions unchanged
  - Focused check and PASS evidence: the cache-stability tests pass
  - Return milestone: tests green
  - Stop / reassessment: if any invariant requires changing epoch, segmentation or tool-building semantics, return to root
- [x] AC-5: Bridge checks pass and root check:ci introduces no new failure
  - Outcome: bridge test:unit and bridge typecheck pass. Root pnpm run check:ci shows no failure attributable to this change; the preexisting error in unchanged pi-packages/pi-subagents/test/ui/panel.test.ts:3323 is recorded, not fixed.
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/package.json; root package.json; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: AC-1 through AC-4 and AC-6 outputs
  - Dependencies: AC-1, AC-2, AC-3, AC-4, AC-6 accepted
  - Output: simplify pass plus command results
  - Owner: thoth-worker
  - Writes: none beyond the files above
  - Interface boundaries: none
  - Focused check and PASS evidence: bridge test:unit and typecheck exit 0. Every root check:ci error is in files unchanged from HEAD.
  - Return milestone: final worker report
  - Stop / reassessment: an unrelated failing check is reported, not fixed

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS

Reviewers were fresh read-only thoth-oracle instances: final-verify reviewed the implementation and record-reverify-2 and record-reverify-3 reviewed the post-review prefix. The implementer was thoth-worker bridge-impl.
**Reviewed record SHA-256**: e4238f70f5909984109d2408c9511ec56d49e9441c2a96150b51823b6383211d

- AC-1: PASS | renderer-backed and recording-boundary tests (unit-prompt-sections.mjs, unit-agent-start-capture.mjs) | truthy sections, whitespace, insertion order, late mutations and snapshot isolation verified; the HEAD spot-check fails the new assertions
- AC-2: PASS | installed-renderer comparison and guard tests | built-in overrides replace portable parts; recorded and derived children carry each section once; guards apply; keys and matching unchanged
- AC-3: PASS | resumed-query tests (unit-append-instructions.mjs) | changed sections arrive as appended-instructions context updates
- AC-4: PASS | provider/MCP tests (unit-mcp-tool-note.mjs) and diff review | constant note emitted once at the outer append, gated on advertised schemas, absent without tools, independent of skills; the AskClaude path is unchanged
- AC-5: PASS | pnpm --dir pi-packages/pi-claude-bridge run test:unit; run typecheck; pnpm run check:ci | 423 passed, 0 failed; typecheck exit 0; the sole check:ci error is in pi-packages/pi-subagents/test/ui/panel.test.ts:3323, whose blob is identical to HEAD; Biome excludes the bridge
- AC-6: PASS | segmentation, catalog and resumed-query tests | no added free:N blocks; single-key deltas; byte-identical recorded system prompt, note and tool catalog; collisions fall back to context replacement; no live API cache measurement (out of scope)
- Source: pi-packages/pi-claude-bridge/src/index.ts | sha256:8b777e579eb293381451ff65f5efd3b83ded8108ea705b99330a0f48d9a87f45
- Source: pi-packages/pi-claude-bridge/src/prompt-capture.ts | sha256:25f6577b3891bc686a0b673ba39f19cb824b67fa9d2ab9de8cbc12146bd8a6e4
- Source: pi-packages/pi-claude-bridge/src/mcp-tool-note.ts | sha256:a1a7689fd2b71397ffe21079b0b33272d5e01d44c06dc66c3e35dfc1e27a5a0a
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:655f22464380b5bae8c4f5c52298797e6583b94e6f3c33d4f3aa49900ebd3711

## Closeout

**Archive**: READY
