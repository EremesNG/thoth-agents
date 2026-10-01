# Change: lean-lifecycle-passthrough

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Live test (2026-10-01, Pi 0.99.1, merged `0.5.0`): a subagent on
  `claude-bridge/claude-sonnet-5-5` no longer fails auth but fails at
  `session.prompt` with `prompt-capture: no capture for this 4314-char system
  prompt ... Claude Code would receive none of this turn's context files, skills
  or custom instructions`, and pi-subagents reports category `context_overflow`.
  No `claude.exe` is spawned. Antigravity subagents pass cancel and timeout live
  tests (whole `agy` tree, including its native `pwsh`, terminated).
- claude-bridge records captures only in `before_agent_start`, `agent_start` and
  `turn_start` (`pi-packages/pi-claude-bridge/src/index.ts:2435-2464`) into a
  process-wide registry (`src/prompt-capture.ts:276-285`); the inherited parent
  stream resolves the child's prompt from it (`src/index.ts:1835-1850`,
  `resolveOrDerive` `src/prompt-capture.ts:141-202`, fail-closed throw). These
  handlers only record; they do not return prompt replacements, inject root
  context or show UI.
- pi-subagents lean isolation keeps only `tool_call`, `tool_result`, `user_bash`
  (`pi-packages/pi-subagents/src/runner/sdk-runner.ts:127-131`) plus
  `session_shutdown` for load-time provider owners (`:156-182`); applies only in
  lean mode (`:314-335`). Intent: tools and safety hooks without startup context
  injection (`README.md:256`; spec multi-harness-agent-pack "without root prompt
  injection"). The child capture hooks are therefore stripped.
- Pi 0.99.1 `Extension` records carry `path`/`resolvedPath`, no package name
  (`node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:477-490`).
- Antigravity registers none of the three events; its `session_start`
  (`extensions/index.ts:631`) does UI, setup, shared-state and MCP-bridge startup
  and must stay stripped. Instructions reach antigravity inside its provider
  (`src/provider.ts:1314-1326`).
- `src/error-metadata.ts:306-307` matches `/context|token|maximum|length/`, so
  the words "context files" misclassify the failure as `context_overflow`.
- Package identity references to rename: `pi-packages/pi-claude-bridge/package.json:2`,
  `pi-packages/pi-antigravity-bridge/package.json:2`, `.github/workflows/ci.yml:60-61,66-67`,
  antigravity `README.md:87`, `AGENTS.md:1,40-41`, `docs/DEVELOPMENT.md:11-12`,
  claude `README.md:1,3,21,101`, `docs/agent/testing.md:47`. Config/log paths and
  provider ids are explicit constants, not derived from package names.

## Intent

Subagents can run on `claude-bridge` models in lean mode: configured provider
extensions keep exactly the prompt-capture lifecycle hooks in child sessions,
the bridge packages carry their `@thoth-agents/*` names, and the failure is no
longer misclassified as context overflow.

## Non-goals

- Passing `session_start`, `context`, input or message hooks to any child.
- Antigravity's Pi-tool MCP bridge initialization in lean children (stays in the
  stripped `session_start`; documented limitation).
- Changing claude-bridge capture logic or its fail-closed behavior.
- Version bumps, publication, release workflow or tag rules.
- Renaming directories, provider ids, config/log paths or upstream coordinates;
  rewriting archived records.

## Acceptance

- AC-1: `subagents.json` accepts `lifecycle_passthrough` (array of package names);
  absent key defaults to `["@thoth-agents/pi-claude-bridge",
  "@thoth-agents/pi-antigravity-bridge"]`; explicit `[]` disables; a project
  array replaces the global one; non-string entries are rejected or ignored with
  a warning, never coerced.
- AC-2: In lean isolation, an extension whose nearest `package.json` (walking up
  from `dirname(resolvedPath)`, stopping at the first manifest) has an exact
  `name` in `lifecycle_passthrough` keeps `before_agent_start`, `agent_start` and
  `turn_start` as observe-only handlers: each receives a structured clone of the
  event and its return value is discarded, so a listed extension can never change
  the child's system prompt or messages; every other lifecycle handler and every
  non-listed extension stay stripped exactly as before; unreadable/missing
  manifests (including a standalone extension file symlinked from a foreign
  project, which resolves to that project's manifest) fail closed. Real-SDK
  regressions show a listed fixture's three handlers run in the child, an unlisted
  memory-style fixture's `before_agent_start` does not, and a LISTED root-injector
  fixture (returns a replacement prompt and mutates `systemPromptOptions` in place)
  leaves the child's system prompt unchanged.
- AC-3: A real-SDK regression with a claude-bridge-shaped fixture (provider
  registered only in the parent; child capture via the three hooks into a shared
  registry; stream fails closed without a capture) passes in a lean child and the
  projected capture the stream receives contains the child agent's own
  instructions (not merely a registry hit).
- AC-4: Errors containing `prompt-capture:` classify as non-retryable
  `provider_api_error`; `context_overflow` is assigned only for exact provider
  capacity codes and messages (`context_length_exceeded`, `context_overflow`, the
  OpenAI "maximum context length is N tokens. However, you requested M tokens",
  the Anthropic "prompt is too long: N tokens > M maximum", the Gemini "The input
  token count (N) exceeds the maximum number of tokens allowed (M)"); generic or
  negated wording falls back to `provider_api_error`; existing classification
  tests still pass and regressions cover the reported message and the reviewer
  negatives.
- AC-5: The two bridge packages are named `@thoth-agents/pi-claude-bridge` and
  `@thoth-agents/pi-antigravity-bridge`; CI filters, active docs and the
  workspace lockfile use the new names; directories, provider ids and archived
  records are unchanged.
- AC-6: Docs (pi-subagents `README.md` config/lean sections and
  `skills/subagents-configuration/SKILL.md`) describe `lifecycle_passthrough`,
  its default, the three observe-only events and the antigravity MCP limitation;
  the Pi harness adapter guidance (`src/harness/adapters/pi.ts:52` and any
  generated guidance/tests asserting the lean event set) is updated to match.
- AC-7: All package typechecks and offline tests pass through pnpm; root
  `check:ci`, `typecheck`, `build` pass; after merge, a live subagent on
  `claude-bridge/claude-sonnet-5-5` completes a read-only task whose answer proves
  the child agent's own system-prompt instructions reached Claude, and a cancelled
  one leaves no orphaned child `claude.exe` (root's own process excluded).

## Clarifications

- Identification: configurable package-name list, default both bridges (user,
  2026-10-01).
- Key name `lifecycle_passthrough` (user).
- Package renames to `@thoth-agents/pi-claude-bridge` and
  `@thoth-agents/pi-antigravity-bridge` are part of this change (user).

## Decisions

- Passthrough events are fixed to `before_agent_start`, `agent_start`,
  `turn_start`; the list selects extensions, not events.
- Antigravity is in the default list for forward compatibility; it registers none
  of the three events today, so the default has no current effect on it.
- Package identity is the exact `name` of the nearest manifest; no path or
  substring matching.
- No spec delta: passthrough hooks are observe-only (cloned event, discarded
  return), so no listed extension, including a misconfigured root injector, can
  inject root prompts; multi-harness-agent-pack's lean child contract holds.
- Plan review round 1 (fresh Oracle): REJECT because a configurable list could
  retain the root injector's prompt replacement; repaired with observe-only
  passthrough and the listed-injector regression.
- Plan review round 2 (fresh Oracle subtask_thoth-oracle_1790816235399_4020ef16):
  [OKAY]. Implementation notes: clone the event per handler with `structuredClone`
  and pass `ctx` separately (cloning it throws); realpath the extension file before
  walking to the nearest manifest (`resolvedPath` is not canonicalized).
- Closeout waits for AC-7 live evidence after merge, reviewed by a fresh Oracle;
  pre-merge Oracle evidence cannot establish AC-7.
- Reference (gentle-shell `1162ce9`, Librarian 2026-10-01): it runs children as
  separate `pi --mode rpc` processes with full extension loading and filters
  prompt content instead of lifecycle hooks; claude-bridge rebuilds prompts from
  `systemPromptOptions`. Kept in-process lean children (strict isolation, Windows
  tree cleanup already verified); AC-7 checks that child instructions reach Claude.
- AC-7 live part runs after merge in the operator's Pi (like the previous change);
  pre-merge evidence is package tests only.
- Implementation checkpoint (root, 2026-10-01): worker delivered AC-1..AC-4 and
  pi-subagents AC-6 (25 new tests; real-SDK listed/unlisted/injector/manifest and
  capture-projection regressions; Windows symlink case ran). Root renamed both
  bridge packages (manifests, CI filters, READMEs incl. not-yet-published
  `npm:@thoth-agents/*` install lines, antigravity AGENTS/DEVELOPMENT,
  docs/agent/testing.md); lockfile unchanged (importers keyed by directory).
  Root updated `src/harness/adapters/pi.ts` lean guidance test-first. Checks:
  frozen install 0; pi-subagents typecheck 0 / 438 passed; antigravity 0 / 542
  passed, 9 skipped; claude-bridge 0 / unit 290; check:ci, typecheck, build 0;
  root `pnpm test` without Orca CODEX_HOME 1142 passed / 4 missing-sibling
  failures; operator claude-bridge.json hash unchanged across runs. AC-7 live
  evidence follows after merge.
- AC-7 live evidence (root, 2026-10-01, operator Pi restarted on 0.5.0 `5bd7d73`,
  root Pi PID 65724, root `claude.exe` 15496): designer temporarily on
  `claude-bridge/claude-sonnet-5-5` (operator `subagents.json` restored after).
  Task subtask_thoth-designer_1790817918433_35716eec completed; asked to quote the
  first sentence of its own `<role>`, it answered `"You are designer."`, the
  literal first sentence in `~/.pi/agent/agents/thoth-designer.md`. Task
  subtask_thoth-designer_1790817960971_eb0a8690 ran a 120 s pwsh tool with child
  `claude.exe` 61332 (parent 65724); cancel at 01:26:33Z; within 2 s 61332 and the
  tool `pwsh` were gone, only root 15496 remained; task status `cancelled`.
- Final verification round 1 (fresh Oracle subtask_thoth-oracle_1790818047441_e67dc8b2):
  FAIL on AC-4 (bare `maximum context` matched "Failed to load maximum context
  configuration") and AC-5 (antigravity README still named `pi-claude-bridge`);
  other ACs, including AC-7 live evidence, passed. Repairs (root, test-first):
  classifier accepts the maximum-context phrase only as `maximum context length is
  <n> tokens ... request(ed)`, with the configuration negative case and the real
  OpenAI-style capacity message as tests (pi-subagents 439/439); antigravity README
  heading and shape reference plus three source comments use
  `@thoth-agents/*`; antigravity 542 passed / 9 skipped; check:ci 0.
- Final verification round 2 (fresh Oracle subtask_thoth-oracle_1790818638499_8534818b):
  FAIL on AC-4 (`maximum context length is N tokens ... request` still matched a
  parse failure) and AC-5 (antigravity README prose line 218). Repairs (root,
  test-first): maximum-context phrase requires `you requested <n> tokens`; added
  Anthropic `prompt is too long: <n> tokens > <m> maximum` and
  `context_length_exceeded` positives and the parse-failure negative (classifier
  tests 20/20; pi-subagents 440 passed). AC-5 boundary, applied by a full sweep:
  active Markdown prose (READMEs, docs/, AGENTS.md, issue templates) uses the
  `@thoth-agents/*` package names; runtime identifiers (global symbols, MCP
  server/key names, config/data paths, UI strings), source/test comments, test
  fixtures, CHANGELOG history and CI step display labels keep the product name and
  are not package-identity references. Updated: antigravity README line 218,
  `docs/PI-BRIDGE-GAPS.md` heading, claude-bridge issue template.
- Final verification round 3 (fresh Oracle subtask_thoth-oracle_1790819024426_21da46f8):
  AC-5 PASS (recorded boundary accepted); AC-4 FAIL on proximity false positives
  (retry limit/budget exceeded near context/tokens; negated "was not exceeded").
  Repair (root, test-first): proximity matching replaced by a named list of
  contiguous affirmative phrasings (`CONTEXT_OVERFLOW_PATTERNS`: context
  length/window exceeded or exceeds, non-negated exceed the context window,
  `context_overflow` code, too many tokens, OpenAI and Anthropic capacity
  messages); four new negatives incl. "does not exceed the context window";
  classifier 24/24, pi-subagents 446 passed, check:ci 0. Removed the reviewer probe
  artifact `200000` (untracked JSON output).
- Final verification round 4 (fresh Oracle subtask_thoth-oracle_1790819371653_d320dd6f):
  only AC-4 FAIL (negated generic phrasing: "never exceeds", "does not currently
  exceed", "not too many tokens"). After four rounds the user chose (2026-10-01)
  exact provider formats only: AC-4 text updated above; generic phrases removed;
  Gemini format added; generic and negated wording are negative tests
  (classifier 28/28); the runner stopReason=error overflow test now uses the
  Anthropic capacity message (pi-subagents 450 passed).

## Durable deltas

- None.

## Plan

1. Worker (sole writer of `pi-packages/pi-subagents/**`): config key and parsing
   (`src/config.ts`, `src/types.ts`), isolation passthrough with manifest
   resolution in `src/runner/sdk-runner.ts`, classification fix in
   `src/error-metadata.ts`, real-SDK regressions, README and configuration skill.
2. Root (after 1, mechanical): rename package `name` fields, CI filters, active
   docs, `docs/agent/testing.md`; `pnpm install` to refresh the lockfile.
3. Root: all package and root checks; fresh Oracle verification; after merge, live
   claude-bridge subagent completion and cancel tests.

## Tasks

- [x] AC-1: lifecycle_passthrough config
  - Outcome: key parsed with default, disable and project replacement
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts:386-435`, `src/types.ts:69-87`, tdd skill
  - Inputs: Clarifications
  - Dependencies: none
  - Output: config code + unit tests
  - Owner: worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: existing keys unchanged
  - Focused check and PASS evidence: config tests for absent, `[]`, project override, invalid entries
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-2: passthrough in lean isolation
  - Outcome: listed packages keep exactly three observe-only hooks; others unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts:127-182,331`
  - Inputs: AC-1 config
  - Dependencies: AC-1 (same writer)
  - Output: isolation code + real-SDK regression
  - Owner: worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: provider-owner `session_shutdown` rule unchanged
  - Focused check and PASS evidence: listed fixture hooks run; unlisted memory fixture stays stripped; listed root-injector fixture leaves the child prompt unchanged; fail-closed manifest cases
  - Return milestone: tests green
  - Stop / reassessment: extension records lack a usable resolved path
- [x] AC-3: claude-bridge-shaped child regression
  - Outcome: capture-dependent provider works in lean child
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/test/runner/providers-real-sdk.test.ts`, fixtures dir
  - Inputs: AC-2
  - Dependencies: AC-2 (same writer)
  - Output: regression test
  - Owner: worker
  - Writes: `pi-packages/pi-subagents/test/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: fails without passthrough, passes with it; projected capture includes the child instructions
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-4: error classification
  - Outcome: prompt-capture errors are provider_api_error
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/error-metadata.ts:283-328`
  - Inputs: reported message
  - Dependencies: none (same writer)
  - Output: classifier change + tests
  - Owner: worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: category enum unchanged
  - Focused check and PASS evidence: regression + existing error-metadata tests green
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-5: package renames
  - Outcome: new scoped names everywhere active
  - Known entrypoints and skill paths: files listed in Exploration
  - Inputs: AC-1..AC-4 worker done
  - Dependencies: worker unit (lockfile and CI filters shared)
  - Output: renamed manifests, CI, docs, lockfile
  - Owner: root
  - Writes: bridge `package.json` names, `.github/workflows/ci.yml`, bridge docs, `docs/agent/testing.md`, `pnpm-lock.yaml`
  - Interface boundaries: directories, provider ids, archives unchanged
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile` exit 0 after refresh; filtered commands with new names run; grep finds no old active package names
  - Return milestone: install and filters green
  - Stop / reassessment: a runtime path depends on the old name
- [x] AC-6: documentation
  - Outcome: config and limitation documented
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md:173-183,223,256`, `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md:109-148`
  - Inputs: AC-1/AC-2 behavior
  - Dependencies: AC-2 (same writer)
  - Output: updated docs
  - Owner: worker
  - Writes: those docs (worker); `src/harness/adapters/pi.ts` and related root tests (root, after worker)
  - Interface boundaries: none
  - Focused check and PASS evidence: docs name key, default, three events, limitation
  - Return milestone: docs updated
  - Stop / reassessment: none expected
- [x] AC-7: checks and live verification
  - Outcome: green checks; live claude-bridge subagent works and cancels cleanly
  - Known entrypoints and skill paths: package filters, root scripts, operator Pi after merge
  - Inputs: AC-1..AC-6
  - Dependencies: AC-1..AC-6
  - Output: evidence
  - Owner: root
  - Writes: none in repo (temporary `~/.pi/agent/subagents.json` model switch restored after)
  - Interface boundaries: operator config restored
  - Focused check and PASS evidence: typechecks/tests/check:ci/build exit 0; live task completes and its answer reflects the child agent's system-prompt instruction; after cancel no child `claude.exe` besides root's
  - Return milestone: evidence captured
  - Stop / reassessment: live failure with a new cause

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Round 1 fresh Oracle returned
[REJECT] (root-injection via configurable list), repaired; round 2 fresh Oracle
subtask_thoth-oracle_1790816235399_4020ef16 returned [OKAY].

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1561f8ec66d78acfbd6c0a252b0df79788ef29b9764a28f6adc0bbe0be7aa482

Fresh read-only Oracle subtask_thoth-oracle_1790819698702_2606416c (round 5) returned
PASS; rounds 1-4 failed AC-4 (and AC-5 in rounds 1-2) and were repaired in this record.

- AC-1: PASS | config regressions | default list, explicit empty, project replacement, invalid entries warned not coerced
- AC-2: PASS | real-SDK isolation regressions | listed observers run, unlisted memory hooks stripped, listed injector cannot change prompt, manifest and symlink cases fail closed
- AC-3: PASS | capture-dependent provider regression | projected capture contains child instructions; without passthrough fails closed
- AC-4: PASS | classifier probes + tests | 6 exact-format positives, 23 generic/negated/incidental negatives, prompt-capture precedence; classifier 28/28
- AC-5: PASS | manifests, CI filters, lockfile, active-Markdown sweep | scoped names; recorded boundary for runtime identifiers accepted
- AC-6: PASS | docs and adapter guidance | key, default, observe-only events, antigravity MCP limitation documented
- AC-7: PASS | serial checks + live evidence | pi-subagents 450/450, antigravity 542 passed/9 skipped, claude unit 290, check:ci/typecheck/build 0; live claude-bridge child quoted its own role and cancel left no orphaned child claude.exe
- Source: pi-packages/pi-subagents/src/config.ts | sha256:cf807b1718fb8bd238c299aecf864d5c4586282d99c25c1fd2e57aca5dd33fb2
- Source: pi-packages/pi-subagents/src/types.ts | sha256:ba357b74d0fb193beaee1c0f53bc562b183892b007b188410966a1c83bb1b779
- Source: pi-packages/pi-subagents/src/runner/sdk-runner.ts | sha256:a5b6280581d99b426f5e264bba6a5def5d8f3af1dc6a071c882890f42f4f3bbe
- Source: pi-packages/pi-subagents/src/error-metadata.ts | sha256:13c8b136495b3d0d797f1b794178bac91795d21130fa124e4ad35697a40331f7
- Source: pi-packages/pi-subagents/README.md | sha256:404947af60898ccf90025af26b6b924a1c2a7df7b003825001175c4e95496f0f
- Source: pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md | sha256:8878ef789474becb0ce9f9e007bbc59070d0486012902c15f8246a2190d6c743
- Source: pi-packages/pi-claude-bridge/package.json | sha256:35322498ad4be5d60b8690d9c8ad8137fe7bdde44e040c343322d6beee1e8f2d
- Source: pi-packages/pi-antigravity-bridge/package.json | sha256:346a0917cdc099527c13d0664858312986dabd4f5de3826368a96c466b62aa91
- Source: .github/workflows/ci.yml | sha256:fc3654ebccb258a32c0f8a83e1e63a5a5bdf1f4ed151ebcc383519f3e40f4d30
- Source: docs/agent/testing.md | sha256:d7269d60ea63ffdb41941159fd8f12d2d82c8a1eec404f2d9a0a0d75456ebb8d
- Source: src/harness/adapters/pi.ts | sha256:074c5662971117a64a8433e8987d5ad3f76b66d800548a319bbe704a83d79283

## Closeout

**Archive**: READY
