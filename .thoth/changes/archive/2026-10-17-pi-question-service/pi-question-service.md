# Change: pi-question-service

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- `AskCodex` approval prompts use native `ctx.ui.select(title, options, {signal})` through the adapter at `pi-packages/pi-askcodex/src/ask-tool.ts:299-307`; policy in `src/approvals.ts:26-46,220-247` (`ApprovalUi.select`) is fail-closed on cancel, unknown answers, abort and adapter rejection; no-UI declines without calling the adapter. Live prompts verified 2026-10-17: "Allow Codex to use Paint? (this session)" with `Allow for this session`/`Decline`, and "Codex requests command: <escaped command> (cwd: …)" with `Allow once`/`Decline`.
- `pi-packages/pi-questions-user`: `createQuestionTool(uiHook)` (`src/index.ts:22-75`) validates, returns `no_ui` without UI, opens the question dock and falls back to sequential select/input; `openQuestionDock` (`src/question-dock.ts:16-118`) mounts the questionnaire in the editor slot via pi-core `registerEditorSlot`, with focus, collapse, abort and disposal; questionnaire UI `src/ui/questionnaire.ts` (previews beside/below at 100 columns `src/ui/layout.ts:2`, recommended options `:790-832,894-974`; single questions allow free text `:89-95`); frame uses registered `kit.card` with native fallback (`src/ui/frame.ts:47-78`). The tool definition is published via pi-core on UI `session_start` and withdrawn on shutdown (`src/index.ts:79-95`).
- pi-core has no question service. Existing versioned `globalThis` registries: tool definitions (`pi-packages/pi-core/src/tool-registry.ts:11-130`, key `thoth-agents.pi-core.tool-definitions.v1`, per-instance handles, renderer-only public contract) and render kit (`src/render-kit.ts`).
- Constraints: bundled packages inline pi-core and must not import siblings at runtime (`.thoth/specs/pi-ecosystem/spec.md` "Bundled Pi extension packages"); registries keyed by contract version with shape-mismatch fallback ("Version-tolerant pi-core registries"); question TUI focus rules ("Pi question focus over panel overlays"); question tool behavior ("Thoth Pi question tool").
- Other bridges (`pi-antigravity-bridge/src/approval-gate.ts:48`) also use native confirm; they are potential future consumers but out of scope.

## Intent

Approval prompts raised by `AskCodex` render through the Thoth question UI of `pi-questions-user` (framed card, preview pane, kit styling, focus/collapse behavior) via a new versioned pi-core question-service registry, falling back to native `ctx.ui.select` when no compatible provider is registered, with unchanged approval policy.

## Non-goals

- No change to approval decisions, allowlist semantics, no-UI decline, or session-only persistence.
- No migration of other bridges or packages to the service.
- No change to the `ask_user_question` tool schema or model-facing behavior.
- No package version bumps.

## Acceptance

- AC-1: pi-core exports a versioned question-service registry (key includes contract version) where a provider registers an `ask` function through a per-instance handle that withdraws only its own registration, and consumers look up the most recent compatible provider, receiving none on absence or shape mismatch; covered by unit tests.
- AC-2: `pi-questions-user` registers its question-dock provider on UI `session_start` and withdraws it on shutdown; the provider supports a per-question option to disable free-text answers, honors `AbortSignal` (disposes the dock and resolves as cancelled), and returns structured answers/cancellation; existing `ask_user_question` behavior and tests unchanged.
- AC-3: `AskCodex` approval prompts use the service when available: one single-choice question without recommended option and without free text, a concise title (app or command summary), options `Allow for this session`/`Allow once` (as today) and `Decline`, and a preview with the unescaped command, cwd, app display name and exact identifier, and Codex's reason when present; cancel/abort/unknown answers decline; without a compatible provider it falls back to the current `ctx.ui.select`; no-UI behavior unchanged; tests cover service path, fallback, abort and answer mapping.
- AC-4: READMEs/CHANGELOGs (Unreleased) of the three packages and the pi-ecosystem delta document the service.
- AC-5: Live check with the user in an interactive Pi session: a command approval and a non-allowlisted app approval both show the styled questionnaire with preview, and the chosen answers take effect.

## Clarifications

- User chose a pi-core question-service registry (option A) over executing the published tool or an AskCodex-local selector.
- User chose no recommended option on approval prompts.

## Decisions

- The service contract is SDK-independent: provider `ask(ctx, request, { signal })` where `ctx` is the Pi extension context with UI, `request` is a list of questions in the `ask_user_question` shape plus a `allowCustom?: boolean` per question; result mirrors the tool's structured answers (status per id, values, cancelled).
- Registry follows the tool-definition registry pattern (Symbol.for versioned key on `globalThis`, per-instance handle, most recent live provider wins, shape-checked lookup).
- Provider registration only in sessions with UI; withdraw on shutdown.
- Free text disabled for approvals; any non-option or cancelled answer maps to decline.
- English labels stay as today for options; previews in English.

## Durable deltas

- `ADDED pi-ecosystem` **Shared Pi question service** — `@thoth-agents/pi-core` MUST provide a process-wide question-service registry keyed by its contract version where a provider registers an ask function through a per-instance handle that withdraws only its own registration and consumers resolve the most recent compatible provider, receiving none when absent or when the stored record has an incompatible shape; `@thoth-agents/pi-questions-user` MUST register its question UI as provider only in sessions with UI, withdraw it on shutdown, support disabling free-text answers per question and resolve an aborted request as cancelled after disposing its UI; `@thoth-agents/pi-askcodex` MUST present approval prompts through a compatible provider as a single-choice question without a recommended option or free text and with a preview of the command, working directory or app identifier, MUST fall back to the native select dialog when no compatible provider exists, and MUST decline on cancellation, abort or any answer other than an allow option.
  - GIVEN a Pi UI session with pi-questions-user and pi-askcodex loaded; WHEN Codex requests approval for a command outside the sandbox; THEN the question UI shows the command and working directory in its preview with `Allow once` and `Decline`, no option is marked recommended, free text is not offered, and choosing `Decline` declines the request.

## Plan

- **pi-core** `src/question-service.ts` (+ export from `src/index.ts`): types `QuestionServiceRequest`, `QuestionServiceResult`, `QuestionServiceProvider`, `QuestionServiceHandle`; `registerQuestionService(provider)`, `getQuestionService()`; versioned key `thoth-agents.pi-core.question-service.v1`; shape guard; tests mirroring `tool-registry` tests.
- **pi-questions-user**: provider wrapping `openQuestionDock`/questionnaire with `allowCustom` support (questionnaire hides the "type your own" row when false), AbortSignal disposal, registration on UI `session_start`, withdrawal on shutdown; tests.
- **pi-askcodex**: `ApprovalUi` adapter chooses service when `getQuestionService()` returns a provider, else `ctx.ui.select`; `approvals.ts` builds title/options/preview per request kind (preview data passed via the adapter; keep `decide` unchanged); tests with a fake provider.
- **Seams**: pure registry tests; fake provider in pi-askcodex; questionnaire component tests for `allowCustom`; live check.
- **Risks**: cross-copy pi-core versions (mitigated by versioned key + shape guard + fallback); focus interactions while AskCodex tool card is running (dock already handles focus rules); abort race leaving UI mounted (provider disposes dock on abort).
- **Verification**: per-package typecheck/tests, root `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build`, `pnpm run test:pi-extensions`, live check, fresh Oracle.

## Tasks

- [x] AC-1: pi-core question-service registry
  - Outcome: exported, tested versioned registry and frozen contract types
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/{tool-registry.ts,index.ts}`, its tests; skills `tdd`, `vitest`
  - Inputs: Decisions of this record
  - Dependencies: none
  - Output: `pi-packages/pi-core/src/question-service.ts`, export, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/question-service.ts`, `pi-packages/pi-core/src/index.ts`, `pi-packages/pi-core/tests/question-service.test.ts` (or sibling test location)
  - Interface boundaries: contract types consumed by AC-2 and AC-3; frozen after acceptance
  - Focused check and PASS evidence: pi-core typecheck + tests pass (register/lookup/withdraw-own/latest-wins/shape-mismatch → none)
  - Return milestone: registry tests pass and types accepted by root
  - Stop / reassessment: contract needs Pi SDK runtime types beyond type-only imports
- [x] AC-2: pi-questions-user provider
  - Outcome: dock-backed provider with allowCustom and abort support, registered only with UI
  - Known entrypoints and skill paths: `pi-packages/pi-questions-user/src/{index.ts,question-dock.ts,custom-ui.ts,ui/questionnaire.ts}`; skills `tdd`, `vitest`
  - Inputs: accepted AC-1 contract
  - Dependencies: AC-1 accepted
  - Output: provider module, registration wiring, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-questions-user/src/**`, `pi-packages/pi-questions-user/tests/**`
  - Interface boundaries: implements `QuestionServiceProvider`; `ask_user_question` tool unchanged
  - Focused check and PASS evidence: package typecheck + full tests pass, new tests for registration lifecycle, allowCustom=false hides free text, abort disposes and returns cancelled
  - Return milestone: tests pass
  - Stop / reassessment: questionnaire cannot hide free text without changing tool-visible behavior
- [x] AC-3: pi-askcodex approvals through the service
  - Outcome: styled approval prompts with preview and native fallback
  - Known entrypoints and skill paths: `pi-packages/pi-askcodex/src/{ask-tool.ts,approvals.ts}`, tests; skills `tdd`, `vitest`
  - Inputs: accepted AC-1 contract
  - Dependencies: AC-1 accepted
  - Output: updated adapter and prompt builders, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/src/{ask-tool,approvals}.ts`, `pi-packages/pi-askcodex/tests/{approvals,ask-tool}.test.ts`
  - Interface boundaries: consumes `getQuestionService()`; `decide` and policy unchanged
  - Focused check and PASS evidence: package tests pass incl. service path (no recommended, allowCustom false, preview content), fallback to ctx.ui.select, abort/cancel/custom → decline
  - Return milestone: tests pass
  - Stop / reassessment: approval request data lacks fields for preview
- [x] AC-4: Documentation
  - Outcome: READMEs, CHANGELOG Unreleased entries for pi-core, pi-questions-user, pi-askcodex
  - Known entrypoints and skill paths: the three package READMEs/CHANGELOGs
  - Inputs: accepted AC-1..AC-3
  - Dependencies: AC-2 and AC-3 accepted
  - Output: doc updates
  - Owner: thoth-worker
  - Writes: `pi-packages/{pi-core,pi-questions-user,pi-askcodex}/{README.md,CHANGELOG.md}`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes
  - Return milestone: docs updated
  - Stop / reassessment: none expected
- [x] AC-5: Live check with the user
  - Outcome: styled prompts observed for a command approval and a non-allowlisted app approval
  - Known entrypoints and skill paths: rebuilt bundles on master after merge, `/reload`
  - Inputs: accepted AC-1..AC-4; user consent for a GUI action
  - Dependencies: AC-4 accepted
  - Output: recorded observations in Verification
  - Owner: root with user
  - Writes: none
  - Interface boundaries: user's Pi session and Codex Desktop
  - Focused check and PASS evidence: user confirms questionnaire with preview, answers take effect
  - Return milestone: both prompts observed
  - Stop / reassessment: provider not found in live session

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Fresh Oracle OKAY, envelope validated. Nonblocking caution carried into AC-1/AC-2: freeze unavailable-dock behavior; sequential fallback must honor allowCustom=false or return structured cancellation.
**Implementation**: AUTHORIZED
User explicitly selected Implement after validated plan-review OKAY (2026-10-17), including commit, merge --no-ff to master and rebuild.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 4ad906bb6b9b74a484627e9c52c1fd0c21a4c25018b729bb3a75464bed44c47b
Round history: R1 FAIL (command preview newline flattening; ambiguous argv rendering), R2 FAIL (Markdown altered literal metadata), R3 fresh Oracle PASS.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-5 and applicable canonical requirements are satisfied. Both preview fixes independently pass; no blocking defects found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "binding",
      "locator": ".thoth/changes/pi-question-service/pi-question-service.md",
      "claim": "Exact-byte prefix SHA-256 is 4ad906bb6b9b74a484627e9c52c1fd0c21a4c25018b729bb3a75464bed44c47b. Canonical pi-ecosystem SHA-256 matches 85fc9a941fff5b00a87e19f14b76c46c57af1a414ba874b44cc875b4b4f39589. HEAD remained 744581bf33d2573c182cffd442de8197a55675be; tracked working tree remained unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-core/src/question-service.ts; pi-packages/pi-core/test/",
      "claim": "Reviewed versioned, SDK-independent registry, shape guards, cross-copy discovery and owner-only withdrawal. Independently ran package tests: 39 files, 979 tests passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-questions-user/src/; pi-packages/pi-questions-user/test/",
      "claim": "Reviewed UI-only registration, shutdown withdrawal, allowCustom handling, structured results, abort disposal and unavailable-dock behavior. Existing tool schema, sequential fallback, rendering and focus paths remain intact. Independently ran 9 files, 280 tests: all passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-askcodex/src/{approvals,ask-tool}.ts; pi-packages/pi-askcodex/tests/",
      "claim": "Reviewed service request construction, native fallback, strict answer mapping, cancellation/abort rejection and unchanged allowlist/session-only policy. Independently ran 9 files, 285 tests: all passed, including delegation and lifecycle coverage.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "independent-runtime-probes",
      "locator": "stdin-only tsx probes through createApprovalHandler and pi-questions-user/src/ui/markdown-cache.ts",
      "claim": "48 metadata probes passed through the real questionnaire MarkdownCache and host Markdown: Windows paths, app/display identifiers, backticks at either boundary, repeated backticks, asterisks, underscores, angle brackets, links, multiline reasons, grant roots and permission entries remain literal. Another 16 command probes passed: exact three-argument shell wrappers decode; extra arguments, ambiguous quoting, operators, expansions and unquoted line boundaries remain verbatim.",
      "basis": "observed",
      "uncertainty": "An initial probe trimmed trailing spaces itself; removing that probe-only transformation resolved the false failure without implementation changes."
    },
    {
      "id": "E6",
      "kind": "executed-checks",
      "locator": "root and touched-package validation commands",
      "claim": "Root typecheck, check:ci, all three package typechecks, build and test:pi-extensions passed. Bundle validation passed 13/13, including isolated loading without sibling dependencies. check:ci reported warnings and infos but no errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "documentation-and-governance",
      "locator": "git diff 0568fb3..744581b; AGENTS.md; .thoth/constitution.md; assigned record",
      "claim": "Reviewed all 19 changed files, six package README/CHANGELOG updates, accepted decisions/non-goals and ADDED Shared Pi question service delta. No version bumps or unrelated changes. Installed SDD verify validator passed with the matching canonical baseline.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "recorded-live-evidence",
      "locator": ".thoth/changes/pi-question-service/pi-question-service.md#verification",
      "claim": "AC-5 records user-observed command and Paint questionnaire previews, effective answers, file creation and Paint opening after reload.",
      "basis": "observed",
      "uncertainty": "Live execution was not repeated; the assignment explicitly supplies recorded evidence and prohibits GUI actions."
    }
  ],
  "verification": [
    {
      "check": "AC-1 and version-tolerant question registry",
      "method": "Source review and independently executed pi-core suite",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Versioned lookup, incompatibility fallback, latest-live ownership and withdrawal contracts hold."
    },
    {
      "check": "AC-2; Thoth Pi question tool; Pi question focus over panel overlays; render/tool-definition preservation",
      "method": "Provider/dock/UI review and package regression suites",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Service reuses existing dock, focus and render infrastructure; tool behavior remains unchanged."
    },
    {
      "check": "AC-3; Shared Pi question service delta; AskCodex app-server delegation; rounds 1 and 2",
      "method": "Diff review, AskCodex suite and independent rendered-output probes",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Literal previews, conservative command decoding, service/fallback behavior and fail-closed approval policy satisfy the contracts."
    },
    {
      "check": "AC-4",
      "method": "Review package documentation and declared durable delta",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "All three packages document the service in READMEs and Unreleased changelogs."
    },
    {
      "check": "AC-5",
      "method": "Review supplied live evidence without GUI interaction",
      "outcome": "pass",
      "evidenceIds": ["E8"],
      "reason": "Recorded observations cover both required prompt types and effective answers."
    },
    {
      "check": "Bundled Pi extension packages and required validation",
      "method": "Root/package typechecks, check:ci, build and isolated bundle tests",
      "outcome": "pass",
      "evidenceIds": ["E6"],
      "reason": "Every requested check passed; bundles load with host-provided SDK identities."
    },
    {
      "check": "Governance, non-goals and review freshness",
      "method": "Installed SDD verify gate, full diff review and final exact-byte hash/status checks",
      "outcome": "pass",
      "evidenceIds": ["E1", "E7"],
      "reason": "Record and baseline bindings match; scope, authorization and independent-verification requirements are preserved."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Validate this envelope, update Verification with current results, run closeout, then archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-question-service/pi-question-service.md",
    "reviewedRecordSha256": "4ad906bb6b9b74a484627e9c52c1fd0c21a4c25018b729bb3a75464bed44c47b"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | pi-core typecheck + vitest (979 pass, `--maxWorkers=2`) incl. 14 tests in test/question-service.test.ts | versioned key, latest-live wins, withdraw-own, shape mismatch → none, independent copies
- AC-2: PASS | pi-questions-user typecheck + vitest (280 pass) | dock provider registered only with UI and withdrawn on shutdown; allowCustom=false hides/blocks free text; abort → cancelled after dispose; unavailable dock → status unavailable; ask_user_question schema unchanged
- AC-3: PASS | pi-askcodex typecheck + vitest (285 pass); `pnpm run build`; `pnpm run test:pi-extensions` 13/13 | service path single choice, no recommended, allowCustom false, previews (POSIX shell-word decoded command validated against captured wire payload, cwd, reason; App/Identifier for apps), select fallback, decline on cancel/abort/unknown; no-UI unchanged; round-1 final Oracle FAIL (newline flattening, ambiguous argv rendering) fixed in a later commit: only exact [exe, flag, script] shell wrappers decode, everything else and unquoted newlines/metacharacters stay verbatim, 38 regression cases; round-2 final Oracle FAIL (raw Markdown altered app identifiers/paths) fixed with code-span/fenced literal metadata, tested through the questionnaire MarkdownCache
- AC-4: PASS | `pnpm run check:ci` no errors | READMEs and [Unreleased] CHANGELOGs for pi-core, pi-questions-user, pi-askcodex
- AC-5: PASS | live checks with user 2026-10-17 after /reload | command approval and Paint approval rendered in styled questionnaire with previews (screenshots); answers took effect (files created, Paint opened); follow-up previews verified: decoded pwsh command without doubled backslashes, `App: Paint` + `Identifier: Microsoft.Paint_8wekyb3d8bbwe!App`
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:85fc9a941fff5b00a87e19f14b76c46c57af1a414ba874b44cc875b4b4f39589

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
