# Change: theme-narrow-hints

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- `pi-packages/pi-thoth-theme` combines QuangThai/pi-omp-theme (base `c7f705c`) and heyhuynhgiabuu/pi-pretty (base `817e84d`); local code has diverged from both. The upstream partial clone is at `/tmp/tmp.MhXmQnQV0T/omp`.
- Upstream omp `81176e6` ("make Ctrl+O hints truthful and tidy inline bash panels") changes 24 files. Only its narrow-width part is in scope: the helper `shared/keybinding-hints.ts`, with `compactExpandHint` and `fitExpandHint(row, width, ellipsis)`.
  - The helper leaves rows that fit unchanged and only recognizes a trailing expansion hint, ignoring ANSI codes and whitespace.
  - It tries the bare key first. If the row is still too wide, it reserves room for the separator and the key, then truncates the preceding text with an ellipsis.
  - It replays active SGR styling so the hint keeps its style.
  - It returns the row unchanged when no substantive preceding text would remain, leaving final truncation to the caller.
  - Tests: `tests/keybinding-hints.test.ts` and narrow golden fixtures.
  - The follow-up `9b5611a` keeps narrow hints as `· Ctrl+O`. No later upstream commit changes the helper.
- Locally, 12 sites compose an expansion hint as literal text, typically `… N more <sep> ctrl+o to expand`:
  - `src/tools/{bash.ts:224,edit.ts:217,write.ts:180,generic.ts:181,read.ts:167,ls.ts:210,find.ts:206,grep.ts:254,grep.ts:354,codemode.ts:192,codemode.ts:172}`
  - `src/render-kit/index.ts:225` (`collapse`)
- Rows are truncated at three independent boundaries, so on narrow terminals the key is lost first:
  - `src/tools/frame.ts:96` (`renderFrameRow`);
  - `src/tools/box.ts:215–218,256` (`renderBox` body and small-width fallback);
  - the unframed list paths `src/tools/{ls.ts:220,find.ts:216,grep.ts:360}`.
- Render-kit contract:
  - `pi-packages/pi-core/src/render-kit.ts:119–125,197`: `collapse` returns rows without a width argument, and `expandHint` is a complete free-form hint.
  - The theme's `card` (`src/render-kit/index.ts:105–159`) routes rows through `renderBox`/`renderFrameRow`.
  - Consumers of `collapse`:
    - `pi-todo/view/format.ts:513` (custom literal hint);
    - `pi-background-tasks/src/render/{tools.ts:194,messages.ts:74}` (keybinding-resolved hints);
    - `pi-claude-bridge/src/askclaude-render.ts:192` and `pi-questions-user/src/render.ts:403` (default hint).
  - The spec does not fix hint wording. The relevant invariants are output reuse (`spec.md` "Render kit output reuse"), result borders, the status footer, and icon modes.
- Test seams:
  - `src/tools/render.test.ts` (viewport bounds, including zero and narrow widths);
  - `src/tools/frame-composition.test.ts`;
  - `src/tools/box.test.ts` (width matrix, ANSI and wide content);
  - `test/render-kit.test.ts:270–300` (custom `"open details"` hint);
  - `test/icon-modes.test.ts:321`;
  - per-width caching in `src/shared/cache.ts`.
- Baseline: `pnpm --filter @thoth-agents/pi-thoth-theme test` gives 40 files and 1234 tests passing.

## Intent

On terminals too narrow for a collapsed row, keep the expansion key visible by compacting the hint and truncating the text before it. Apply this at the theme's shared truncation boundaries, so theme tool renderers and render-kit cards from other packages both benefit. Rows that fit keep their current output byte for byte.

## Non-goals

- The rest of `81176e6` and `9b5611a`: truthful-hint checks, grep and list budgets, diff skips, inline gutters, Windows git warnings and message layout.
- Changing the pi-core render-kit API, the `collapse` signature, or the wording any producer passes.
- Reading live keybindings inside the theme. Hint text stays whatever each producer supplies.
- Bumping package versions or publishing.

## Acceptance

- AC-1: A shared helper (for example `src/shared/expand-hint.ts`) fits a row to a display width. A row that fits is returned unchanged. A row ending in a recognized expansion hint `<sep>?<key> to expand` is handled like this, where `<key>` is a single token such as `ctrl+o` or `Alt+X` and `<sep>` is the theme's semantic separator in any icon mode, a plain `·`, or whitespace:
  1. It first replaces the hint with the bare key.
  2. If the row is still too wide, it truncates the preceding text with the theme ellipsis, keeping the separator and the key.
  3. It returns the row unchanged when less than one column of preceding text would remain.

  Width is measured in display columns with ANSI SGR codes ignored. The hint keeps its styling after the preceding text is truncated. Rows without a recognized trailing hint, including free-form custom hints such as `"open details"`, are returned unchanged.
- AC-2: The helper is applied before the final truncation at every theme truncation boundary that renders hint rows:
  - `renderFrameRow` (`src/tools/frame.ts`);
  - the `renderBox` body and its small-width fallback (`src/tools/box.ts`);
  - the unframed list paths in `src/tools/{ls,find,grep}.ts`.

  On a narrow width, collapsed rows from the built-in bash, edit, write, generic, read, ls, find, grep and codemode renderers show the key. A render-kit `card` that wraps `collapse` output keeps a visible key whether its hint is the default or `<key> to expand`. Final truncation still guarantees that no row exceeds its width.
- AC-3: Rows that fit are byte-identical to the current output. Existing render, frame, box, render-kit and icon-mode tests pass unchanged, except where an assertion targets an overflowing hint row; each such change is listed with its reason. Per-width output caching and invalidation stay correct. Result borders, status footers and icon modes are unchanged.
- AC-4: Tests cover:
  - the helper: fitting rows, one and two ANSI spans, compaction to the bare key, prefix truncation with the hint styling kept, the whitespace separator, the separator in each icon mode, absent, non-trailing and free-form hints, rebound keys, widths at or below the key budget, and wide glyphs;
  - integration: each built-in renderer and a render-kit card at narrow widths;
  - preservation: rows that fit are unchanged.
- AC-5: Package `typecheck` and `test` pass. Root `pnpm run build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- Scope: the user chose the shared truncation boundaries (theme tool renderers plus render-kit cards) over theme-only renderers.

## Decisions

- Fit at the truncation boundaries, not at the composition sites. Composition stays literal, so `collapse` and producers are unchanged and no width needs to reach the render kit.
- Recognize `<key> to expand` generically instead of a configured key name. This covers the theme's literal `ctrl+o`, rebound keys and pi-background-tasks' resolved hints without reading keybindings, which would add a mutable cache input. Free-form hints fall back to ordinary truncation.
- Reimplement the upstream algorithm locally, using local width and truncation helpers. Do not import upstream's `safeVisibleWidth`/`safeTruncateToWidth` structure.

## Durable deltas

- `ADDED pi-ecosystem` **Narrow-width expansion hints** — `@thoth-agents/pi-thoth-theme` MUST keep the expansion key visible when a collapsed row that ends in a `<key> to expand` hint is wider than its available width. It does so by first shortening the hint to the bare key and then truncating the preceding text, at every theme truncation boundary, including render-kit cards. It MUST leave rows that fit, rows without such a hint, and rows too narrow to keep at least one column of preceding text unchanged apart from ordinary truncation.
  - GIVEN a collapsed bash result whose row `… 120 more lines · ctrl+o to expand` is wider than a 20-column frame even after the hint is shortened to `ctrl+o`; WHEN it renders; THEN the row ends with `· ctrl+o`, preceded by truncated text; and the same result at 120 columns renders exactly as before.

## Plan

- Single worker unit for AC-1 through AC-4, written test-first:
  1. Port the upstream helper tests from `81176e6`, adapted to local separators, icon modes and ellipsis, plus the integration and preservation cases. Confirm they fail.
  2. Implement the helper.
  3. Wire it into `frame.ts`, `box.ts` and the unframed `ls`/`find`/`grep` paths.
  4. Update the README only if it documents hint behavior.
- Root then reviews regressions and cross-package render-kit consumers (AC-3) and runs the closeout checks (AC-5).
- Mutable surface: `pi-packages/pi-thoth-theme/**` only. No dependency, lockfile or pi-core changes.
- Interfaces to preserve: the pi-core `ThothRenderKit` v1 contract, the semantic icons and modes, the output reuse cache, the result borders and the status footer.
- Risks:
  - ANSI or wide-glyph miscounting;
  - separator recognition across icon modes;
  - mis-detecting a non-hint row ending in `to expand`;
  - inconsistency between the boundaries;
  - visible changes in other packages' cards, mitigated because only overflowing rows change.
- Mitigation: a byte-identical preservation test for rows that fit, a test matrix across icon modes and widths, and fresh independent Oracle verification.

## Tasks

- [x] AC-1: Shared expansion-hint fitting helper with tests
  - Outcome: the AC-1 helper exists with the AC-4 helper tests; AC-2 wiring and AC-4 integration and preservation tests are part of the same unit.
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/{frame,box,ls,find,grep}.ts`, `src/render-kit/index.ts`, `src/shared/`, tests `src/tools/{render,frame-composition,box}.test.ts`, `test/{render-kit,icon-modes}.test.ts`; upstream `/tmp/tmp.MhXmQnQV0T/omp` commit `81176e6` (`shared/keybinding-hints.ts`, `tests/keybinding-hints.test.ts`). Skills: `tdd`, then `simplify`.
  - Inputs: the accepted Exploration and Decisions.
  - Dependencies: none
  - Output: source and test diff, adapted upstream cases, red → green evidence.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/**`
  - Interface boundaries: pi-core render-kit v1 (unchanged); producers' hint text (unchanged).
  - Focused check and PASS evidence: new tests fail before and pass after; package `typecheck` exits 0; `test` passes with no unexplained changes to existing tests.
  - Return milestone: on completion.
  - Stop / reassessment: a boundary that needs width information it does not have, or a required change outside the theme.
- [x] AC-2: Wiring at every truncation boundary verified
  - Outcome: root confirms that each boundary applies the helper before final truncation and that integration tests cover each built-in renderer and a render-kit card.
  - Known entrypoints and skill paths: the diff and the tests named in the AC-1 unit output.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: AC-1 unit accepted by root.
  - Output: acceptance note.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: named tests pass in the package run.
  - Return milestone: after reviewing the AC-1 unit.
  - Stop / reassessment: a missing boundary returns to the worker.
- [x] AC-3: Preservation and cross-package review
  - Outcome: root confirms byte-identical output for rows that fit, justified test changes, and unchanged cache, border, footer and icon-mode behavior.
  - Known entrypoints and skill paths: the diff; consumers `pi-todo/view/format.ts`, `pi-background-tasks/src/render/{tools,messages}.ts`, `pi-claude-bridge/src/askclaude-render.ts`, `pi-questions-user/src/render.ts`.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: AC-1 unit accepted by root.
  - Output: regression note.
  - Owner: root
  - Writes: none
  - Interface boundaries: `.thoth/specs/pi-ecosystem/spec.md` render-kit requirements.
  - Focused check and PASS evidence: diff review and preservation tests.
  - Return milestone: after the AC-1 unit.
  - Stop / reassessment: an unjustified change returns to the worker.
- [x] AC-4: Helper, integration and preservation tests present and passing
  - Outcome: root confirms that the AC-4 matrix is covered.
  - Known entrypoints and skill paths: tests named in the AC-1 unit output.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: AC-1 unit accepted by root.
  - Output: acceptance note.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: named tests pass.
  - Return milestone: after reviewing the AC-1 unit.
  - Stop / reassessment: a missing case returns to the worker.
- [x] AC-5: Package and root closeout checks pass
  - Outcome: package and root gates are green.
  - Known entrypoints and skill paths: package and root `package.json` scripts.
  - Inputs: accepted AC-3 and AC-4.
  - Dependencies: AC-3 and AC-4 accepted by root.
  - Output: check results.
  - Owner: root
  - Writes: none (generated build output only)
  - Interface boundaries: none
  - Focused check and PASS evidence: package `typecheck` and `test`, root `pnpm run build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` exit 0.
  - Return milestone: after the checks run.
  - Stop / reassessment: failures caused by unrelated workspace changes are reported.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

A fresh Oracle returned a validated plan-review OKAY with no blocking risks, against record SHA c8eadee7856c73d2f9d6c9841d75226cf6ae4dcbd6e847d522c1bdebaa0f396c. Afterwards, root applied the Oracle's nonblocking caution 3: the durable-delta wording now includes the insufficient-room exception, and the example is narrowed to 20 columns. Cautions 1 (a data-lookalike regression) and 2 (immutable icon-mode ellipsis plumbing) were passed to the worker. The user then chose Implement.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d7ff3b3f16cc6f4190a235f1e8581b8c3ac2fadd3976007b1d4b57b483199284

The first fresh Oracle final-verification round passed. The reviewer independently reconstructed the pre-change renderers from HEAD and confirmed all 66 ANSI-bearing wide snapshots match byte for byte. It also ran 972 helper width and idempotence probes and 306 boundary probes, including the ASCII ellipsis.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-5 and the specified render-kit contracts are satisfied. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "code-review",
      "locator": "pi-packages/pi-thoth-theme/src/shared/expand-hint.ts",
      "claim": "Implements fit-first matching, trailing hint compaction, separator-preserving prefix truncation, SGR replay, insufficient-room fallback and display-column measurement.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code-review-and-probes",
      "locator": "pi-packages/pi-thoth-theme/src/tools/{frame,box,ls,find,grep}.ts; src/render-kit/index.ts",
      "claim": "All required boundaries fit hints before final truncation. Immutable icon-mode ellipses reach every production call site. Independent probes passed 972 helper width/idempotence checks and 306 boundary checks, including ASCII ellipses, sections and small-width fallbacks.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "tests",
      "locator": "pi-packages/pi-thoth-theme/src/shared/expand-hint.test.ts; test/expand-hints.test.ts",
      "claim": "Tests cover the required helper cases, built-in renderers, framed/unframed paths, render-kit cards, cache reuse/invalidation and the exact durable 20-column example.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "baseline-comparison",
      "locator": "pi-packages/pi-thoth-theme/test/__snapshots__/expand-hints.test.ts.snap",
      "claim": "Reconstructed pre-change renderers from git HEAD using in-memory loading without edits. All 66 wide snapshots match pre-change output exactly; all 66 contain ANSI sequences.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "execution",
      "locator": "pnpm --filter @thoth-agents/pi-thoth-theme {typecheck,test}",
      "claim": "Independent package typecheck exited 0; package tests passed: 42 files, 1376 tests. Required environment variables were unset.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "root-check-report",
      "locator": "Delegated exact-tree verification evidence",
      "claim": "Root reports successful build, test:pi-extensions (13/13), check:ci and root typecheck.",
      "basis": "observed",
      "uncertainty": "Root-attested execution evidence; these root checks were not independently rerun."
    },
    {
      "id": "E7",
      "kind": "scope-and-contract-review",
      "locator": "Scoped git diff; pi-core/src/render-kit.ts; named pi-todo, pi-background-tasks, pi-claude-bridge and pi-questions-user consumers",
      "claim": "No dependency, lockfile, pi-core API or unrelated implementation changes. Producers, registry, cache, border and footer logic remain unchanged. Named consumers retain fitting output; only overflowing recognized hint rows receive the new treatment. Scoped diff --check passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "digest-verification",
      "locator": ".thoth/changes/theme-narrow-hints/theme-narrow-hints.md; .thoth/specs/pi-ecosystem/spec.md",
      "claim": "At review start and end, record-prefix SHA-256 remained d7ff3b3f16cc6f4190a235f1e8581b8c3ac2fadd3976007b1d4b57b483199284 and canonical-spec SHA-256 remained 37276d3e42801e66deb9b169cdef39a39bedd872078b1deb531d20ae56922810.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Helper review, unit tests and independent width/idempotence probes.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E5"],
      "reason": "Required matching, compaction, styling, fallback and wide-glyph behavior are implemented and exercised."
    },
    {
      "check": "AC-2",
      "method": "Boundary/call-site audit, integration tests and independent boundary probes.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Every specified boundary is wired; keys survive when sufficient room exists, final widths remain bounded, and ASCII ellipses are supplied correctly."
    },
    {
      "check": "AC-3",
      "method": "Pre-change snapshot reconstruction, unchanged regression tests and cross-package contract review.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E7"],
      "reason": "All 66 ANSI-bearing preservation snapshots match HEAD. Existing tests were not modified; cache, borders, footer, icon modes and pi-core API remain intact."
    },
    {
      "check": "AC-4",
      "method": "Test-matrix inspection and execution.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E5"],
      "reason": "Required helper, renderer, card and preservation cases are covered, including the durable 20-column example."
    },
    {
      "check": "AC-5",
      "method": "Independent package checks and reuse of supplied exact-tree root check evidence.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6", "E8"],
      "reason": "Package checks pass independently; all required root gates are reported successful."
    }
  ],
  "risks": [
    {
      "description": "The accepted text heuristic also compacts overflowing literal data ending in '<token> to expand'; this behavior is documented and regression-tested.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E1", "E3"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Validate this envelope, record the verification evidence, and complete SDD closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/theme-narrow-hints/theme-narrow-hints.md",
    "reviewedRecordSha256": "d7ff3b3f16cc6f4190a235f1e8581b8c3ac2fadd3976007b1d4b57b483199284"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | src/shared/expand-hint.test.ts | fit-first, trailing-only <key> to expand, compaction, then prefix truncation with SGR replay; insufficient-room fallback; free-form hints unchanged; wide glyphs
- AC-2: PASS | test/expand-hints.test.ts integration (9 built-in renderers, framed and unframed paths, render-kit cards) | key visible at narrow widths; durable 20-column example renders `│ … 120 … · ctrl+o │`; widths bounded
- AC-3: PASS | 66 ANSI wide snapshots captured before the change; no existing test changed | rows that fit are byte-identical; cache, borders, footer, icon modes and pi-core API unchanged
- AC-4: PASS | 142 new tests, red → green | helper, integration and preservation matrix, including the data-lookalike regression
- AC-5: PASS | package typecheck and test; root build, test:pi-extensions, check:ci and typecheck | exit 0; 42 files, 1376 passed; exit 0; 13/13; exit 0; exit 0
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:37276d3e42801e66deb9b169cdef39a39bedd872078b1deb531d20ae56922810

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
