# Change: pi-1-5-0-compat

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Root `package.json` and all 11 packages under `pi-packages/` pin the Pi SDK development dependencies (`@earendil-works/pi-ai`, `pi-coding-agent`, `pi-tui`, plus `pi-agent-core` in pi-subagents) to `1.4.0`; every `@earendil-works/*` peer is `>=0.99.0`. `@earendil-works/pi-coding-agent@1.5.0` is published on npm.
- An earlier analysis of the Pi 1.5.0 changelog (memory handoff `pi-1.5.0-upgrade`) found these risks:
  1. BREAKING pi-schema tool-argument validation: TypeBox features that are not JSON Schema are ignored, numeric strings are coerced to numbers, single values are coerced to arrays, and the error text is new. This affects every package that registers tools.
  2. Tool renderers now run once per frame with incremental args. This interacts with pi-sidebar's `tui.render` patch (`pi-packages/pi-sidebar/src/layout/inline-adapter.ts:119-126`) and its private `layoutRoot` access (`fullscreen-adapter.ts:19-38`).
  3. The fix for replacing the editor while a dialog is open interacts with the pi-core editor slot, the `hideOverlay` patch (`owned-overlay.ts:263-268`) and private `tui.overlayStack` access (`decorative-overlay.ts:29-46`).
  4. `pi-packages/pi-claude-bridge/src/prompt-capture.ts:286` depends on the `dist/core/system-prompt.js` layout.
  5. `pi.exec` now has a 256 MiB `maxBuffer` and a `truncated` flag.
- Canonical specs pin the current floor and dev version: `multi-harness-agent-pack` "Uniform Pi SDK compatibility floor" (`>=0.99.0`, dev `1.4.0`), "Native lifecycle translation" (delegation runtime `>=0.99.0` through the `1.4.0` pin), and `cli-installation` "Pi minimum version floor" (installer rejects Pi < `0.99.0`; `src/cli/pi-install.ts:50` `PI_MINIMUM_VERSION`).
- Floor strings also appear in docs (`docs/installation.md`, `docs/agent/{cli-installation,harness-packaging,testing}.md`), package READMEs, `pi-packages/pi-subagents/src/{manager.ts,types.ts,runner/pi-sdk-module.ts}` (`required_pi_version: '>=0.99.0'`), and `pi-packages/pi-claude-bridge/src/index.ts:2864`.

## Intent

Move the whole repository to Pi 1.5.0: develop and test against SDK 1.5.0, require Pi `>=1.5.0` everywhere (package peers, installer, delegation runtime gate, docs), and keep every package compiling, passing its offline tests, and behaving correctly against 1.5.0's changed tool-argument validation and private TUI seams.

## Non-goals

- Adopting new 1.5.0 APIs (keyText/keyHint, `ctx.ui.custom` blocked flag, `Usage.cost.totalFromProvider`, removing antigravity `dialog-lock.ts`, per-package CHANGELOG.md, MarkdownTransformContext messageId/timestamp). These belong to a follow-up adoption change after this one is verified.
- Bumping package versions or releasing.
- Changing non-Pi harness behavior.

## Acceptance

- AC-1: In the root and every `pi-packages/*` manifest, each `@earendil-works/*` peer is `>=1.5.0` and each `@earendil-works/*` dev dependency is `1.5.0`. The root lockfile resolves a single 1.5.0 for each, and `pnpm install` succeeds.
- AC-2: `pnpm run typecheck` and `pnpm --filter <pkg> run typecheck` pass for every pi-package.
- AC-3: The offline tests of every pi-package (`test`, or `test:unit` for pi-claude-bridge) pass. The root tests that consume the Pi SDK pass: `src/cli/pi-install.test.ts`, `src/cli/pi-git-source.test.ts` (the Git parser differential tests), `src/pi-gate-verdict.test.ts`, `src/pi.test.ts`, and the offline Pi harness tests `evals/pi/harness.test.ts`. `pnpm run check:ci` passes.
- AC-4: Each private seam listed in Exploration (risks 2–5) has a compatibility verdict backed by evidence from the installed 1.5.0 source. Each incompatible seam is fixed and has regression coverage.
- AC-5: Every tool schema registered by the pi-packages is audited against 1.5.0 pi-schema validation (unsupported TypeBox features, coercion, error text). Every incompatible schema, handler or test expectation is fixed and has a test.
- AC-6: The installer rejects Pi < `1.5.0` with a `Pi >=1.5.0` diagnostic. pi-subagents' runtime gate (numeric `MIN_PI_VERSION` and the `required_pi_version` diagnostic) requires `>=1.5.0`, and tests at the boundary reject 1.4.x and accept 1.5.0. Docs and READMEs state the `>=1.5.0` floor and the 1.5.0 development version. The record declares the matching spec deltas.

## Clarifications

- Resolved (user, 2026-11-02): raise the peer floor to `>=1.5.0`, so the new APIs can be used without runtime fallbacks.
- Resolved (user, 2026-11-02): work in two phases. This record covers compatibility only; adoption of all six listed APIs follows in a separate change.

## Decisions

- Raising package peers to `>=1.5.0` also raises the installer floor and the pi-subagents runtime gate to `1.5.0`. A lower installer floor would install packages whose peers cannot be satisfied.
- The canonical scenario preconditions remain superseded by the floor statement. It now reads `>=1.5.0`.
- The rule that features needing a newer Pi API must detect it at runtime still applies to APIs above the new floor.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Uniform Pi SDK compatibility floor** — The root thoth-agents package and every Pi package under pi-packages MUST declare each Pi SDK peer dependency (`@earendil-works/*`) with the same minimum `>=1.5.0`, MUST develop and test against one shared Pi SDK development version (currently `1.5.0`), and MUST declare an `engines.node` floor of Node 22.19 (`>=22.19` or `>=22.19.0`); features that need a newer Pi API MUST detect it at runtime and degrade without failing on the minimum.
  - GIVEN the repository manifests and root lockfile; WHEN Pi SDK dependencies are inspected; THEN every Pi peer range is `>=1.5.0`, every Pi development dependency resolves to the single shared version, and every manifest requires Node 22.19 or newer.
- `MODIFIED multi-harness-agent-pack` **Native lifecycle translation** — Pi root guidance MUST use one direct subagent_run with explicit canonical agent and bounded task per fresh assignment; omitted mode MUST run in background for both subagent_run and subagent_continue, task mode MUST occur only when the invocation explicitly passes `mode: "task"`, and agent definitions, subagent configuration and previous attempts MUST NOT select the execution mode. Native status/result/cancel or supported live messaging MUST be used only for a known task ID. Queued delivery, nonterminal state and cancellation requests MUST NOT prove termination or acceptance. New objectives, phases, mutable surfaces and independent judgments MUST receive fresh assignments. Thoth MUST NOT use subagent orchestration APIs or claim instruction-only policy is runtime enforcement. Terminal notifications drive collection without polling; children MUST remain scoped to the parent Pi lifetime. The adopted delegation runtime MUST support Pi `>=1.5.0` through the `1.5.0` development pin with its registry and model-only exposure semantics, restrict child registered tools to the selected permitted implementations, and distinguish queued, extension-handled, rejected, and model-consumed live input. Updating this runtime MUST preserve its responsibility for LLM subagent delegation; non-LLM background task execution remains external.
  - GIVEN an agent definition or configuration that previously requested task mode; WHEN root calls subagent_run or subagent_continue without mode; THEN the child runs in background, and only an explicit `mode: "task"` invocation blocks.
- `MODIFIED cli-installation` **Pi minimum version floor** — The Pi installer MUST reject a detected Pi older than `1.5.0` with a diagnostic naming the `>=1.5.0` requirement before changing any Pi state, and MUST accept Pi `1.5.0` and newer. This floor supersedes every Pi version named in a retained canonical scenario precondition of any capability (including Pi `0.86.1` and `0.99.0` in `cli-installation`, `external-required-skills`, `multi-harness-agent-pack` and `project-tooling`): such a precondition MUST be read as a supported Pi `>=1.5.0`, and the scenario's other assertions remain in force.
  - GIVEN a Pi installation reporting version 1.4.x; WHEN the user runs the Pi install; THEN it fails with the `Pi >=1.5.0` diagnostic without changing Pi state, while a Pi reporting 1.5.0 or 1.6.0 proceeds.

## Plan

1. **Bump (mechanical):** edit every `@earendil-works/*` entry in the root and `pi-packages/*` manifests (peers to `>=1.5.0`, dev deps to `1.5.0`; leave `peerDependenciesMeta` alone), then run `pnpm install` to refresh `pnpm-lock.yaml`. The `pnpm-workspace.yaml` minimumReleaseAge exemption already covers `@earendil-works/*`.
2. **Read-only audits** (run in parallel once 1.5.0 is installed, against `node_modules/@earendil-works/*` 1.5.0 sources):
   - (a) Private seams for risks 2–5.
   - (b) pi-schema tool-argument validation for every `registerTool`/tool definition in the pi-packages.

   Each audit returns per-item verdicts with file:line evidence.
3. **Compatibility fixes:** fix the typecheck and offline-test failures surfaced by step 1, then the incompatible items accepted from the step 2 audits. Behavior fixes go test-first.
4. **Floor contract:** set `PI_MINIMUM_VERSION` to `1.5.0` and update its tests, the pi-subagents `required_pi_version` gate and messages, the claude-bridge diagnostic, docs and READMEs.
5. **Verification seams:** per-package typecheck and offline tests, the root typecheck, the root SDK-consuming tests listed in AC-3 (installer, Git parser differential, gate verdict, Pi extension, offline Pi harness), and `check:ci`. Root compatibility fixes belong to the AC-2 unit; floor-dependent test updates belong to the AC-6 unit. `pnpm run build` runs because packaging manifests change.

Risks: the 1.5.0 private TUI internals may have changed shape. Seams are feature-detected, so a silent degradation could pass tests; the audit has to read the actual 1.5.0 source. pi-subagents has 4 tests known to time out under parallel load (they pass serially), so rerun those serially before calling them failures.

## Tasks

- [x] AC-1: Pi SDK manifests and lockfile moved to 1.5.0
  - Outcome: every `@earendil-works/*` peer is `>=1.5.0` and every dev dep is `1.5.0`, and the lockfile is refreshed
  - Known entrypoints and skill paths: `package.json`, `pi-packages/*/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
  - Inputs: Exploration manifest inventory
  - Dependencies: none
  - Output: updated manifests and lockfile
  - Owner: thoth-worker
  - Writes: `package.json`, `pi-packages/*/package.json`, `pnpm-lock.yaml`, and the manifest-floor expectations in tests that assert manifest peer or dev versions (known: `pi-packages/pi-core/test/package.test.ts`, `pi-packages/pi-subagents/test/package.test.ts`; plus any other test reading `package.json` Pi versions)
  - Interface boundaries: `peerDependenciesMeta` and non-Pi deps unchanged; runtime-floor tests (installer, pi-subagents `MIN_PI_VERSION`, claude-bridge diagnostic) are left to the AC-6 unit
  - Focused check and PASS evidence: `pnpm install` exits 0; the manifest tests above pass with `>=1.5.0`; grepping the manifests shows no `@earendil-works` entry at `1.4.0` or `>=0.99.0`; `pnpm why @earendil-works/pi-coding-agent` (or a lockfile grep) shows only 1.5.0
  - Return milestone: install done, with an initial run of `pnpm -r --filter "./pi-packages/*" run typecheck` reported as an inventory of failures, not fixed
  - Stop / reassessment: install failure caused by the release-age policy or by peer conflicts outside `@earendil-works`
- [x] AC-4: Private seam audit against 1.5.0
  - Outcome: a compatibility verdict with evidence for each private seam (risks 2–5)
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/layout/inline-adapter.ts`, `pi-packages/pi-sidebar/src/layout/fullscreen-adapter.ts`, `pi-packages/pi-core/src/**/owned-overlay.ts`, `pi-packages/pi-core/src/**/decorative-overlay.ts`, the pi-core editor slot, `pi-packages/pi-claude-bridge/src/prompt-capture.ts`, `pi.exec` callers across pi-packages; 1.5.0 sources under `node_modules/@earendil-works/{pi-tui,pi-coding-agent}`
  - Inputs: accepted AC-1 install
  - Dependencies: AC-1 bump
  - Output: per-seam verdict (compatible / degraded / broken) with file:line evidence on both sides and the minimal fix direction
  - Owner: thoth-explorer
  - Writes: none
  - Interface boundaries: read-only
  - Focused check and PASS evidence: every seam in risks 2–5 has a verdict that cites 1.5.0 source
  - Return milestone: full verdict list
  - Stop / reassessment: a seam whose 1.5.0 counterpart cannot be located
- [x] AC-5: Tool-argument validation audit against 1.5.0 pi-schema
  - Outcome: every registered tool schema is classified under 1.5.0 validation
  - Known entrypoints and skill paths: tool registrations across `pi-packages/*/src`; the 1.5.0 pi-schema/validation code in `node_modules/@earendil-works/*`
  - Inputs: accepted AC-1 install
  - Dependencies: AC-1 bump
  - Output: a list of schemas that use unsupported TypeBox features, depend on coercion-sensitive behavior, or have tests asserting the old error text, each with file:line and a fix direction
  - Owner: thoth-explorer
  - Writes: none
  - Interface boundaries: read-only
  - Focused check and PASS evidence: the audit covers every package that registers tools and cites the 1.5.0 validation behavior
  - Return milestone: classified list
  - Stop / reassessment: validation entrypoint not found in 1.5.0
- [x] AC-2: Typecheck and offline-test failures fixed
  - Outcome: all pi-packages typecheck and pass their offline tests on 1.5.0, and the root SDK-consuming tests listed in AC-3 pass
  - Known entrypoints and skill paths: failures reported at the AC-1 milestone; root SDK consumers `src/cli/pi-install.test.ts`, `src/cli/pi-git-source.test.ts`, `src/pi-gate-verdict.test.ts`, `src/pi.test.ts`, `evals/pi/harness.test.ts`; installed `tdd` skill
  - Inputs: the AC-1 failure inventory
  - Dependencies: AC-1 bump
  - Output: source and test fixes
  - Owner: thoth-worker
  - Writes: `pi-packages/*/src/**`, `pi-packages/*/test/**`, `pi-packages/*/tests/**`; root compatibility fixes limited to the SDK-consuming files above and the `src/**` modules they cover (excluding the floor constants owned by AC-6)
  - Interface boundaries: public package contracts unchanged
  - Focused check and PASS evidence: `pnpm --filter <pkg> run typecheck` exits 0 for every pi-package; its offline test script exits 0 except for failures that only assert the old runtime floor, which are listed by name, left untouched, and resolved by the AC-6 unit (the all-green barrier is the AC-3 closeout unit); `pnpm vitest run src/cli/pi-git-source.test.ts src/pi-gate-verdict.test.ts src/pi.test.ts evals/pi/harness.test.ts` and `pnpm run typecheck` exit 0
  - Return milestone: all packages green, or a list of failures that need a design decision
  - Stop / reassessment: a failure that requires dropping a feature or changing a public contract
- [x] AC-5: Accepted seam and schema findings fixed
  - Outcome: every incompatible item accepted from the seam (AC-4) and schema (AC-5) audits is fixed with regression coverage
  - Known entrypoints and skill paths: the accepted audit outputs; installed `tdd` skill
  - Inputs: root-accepted audit verdicts
  - Dependencies: AC-4 seam audit, AC-5 schema audit, AC-2 fixes
  - Output: fixes and regression tests
  - Owner: thoth-worker
  - Writes: files named in the accepted findings
  - Interface boundaries: public package contracts unchanged
  - Focused check and PASS evidence: new regression tests fail before the fix and pass after; the affected packages' typecheck and offline tests exit 0
  - Return milestone: all accepted findings resolved
  - Stop / reassessment: a fix that needs a public API change or the 1.5.0 API adoption that was deferred
- [x] AC-6: Floor contract raised to 1.5.0
  - Outcome: installer floor, pi-subagents gate, diagnostics, docs and READMEs all state `>=1.5.0` and dev 1.5.0
  - Known entrypoints and skill paths: `src/cli/pi-install.ts:50`, `src/cli/pi-install.test.ts`, `pi-packages/pi-subagents/src/{manager.ts,types.ts,runner/pi-sdk-module.ts}` (numeric `MIN_PI_VERSION` and `required_pi_version`), `pi-packages/pi-subagents/test/runner/interaction-bridge.test.ts`, `pi-packages/pi-claude-bridge/src/index.ts:2864`, `pi-packages/pi-claude-bridge/tests/unit-model-diagnostic.mjs`, `docs/installation.md`, `docs/agent/{cli-installation,harness-packaging,testing}.md`, `pi-packages/*/README.md`; installed `tdd` skill
  - Inputs: the Decisions and Durable deltas in this record
  - Dependencies: the accepted seam and schema fixes (shared pi-subagents and claude-bridge surfaces)
  - Output: updated code, tests and docs
  - Owner: thoth-worker
  - Writes: the paths above, plus any other `pi-packages/*/test/**`, `pi-packages/*/tests/**` or root test file whose assertions depend on the old floor
  - Interface boundaries: the installer diagnostic format is unchanged apart from the version
  - Focused check and PASS evidence: `pnpm vitest run src/cli/pi-install.test.ts` passes with a 1.4.x host rejected and 1.5.0 accepted; the pi-subagents runtime gate tests reject a 1.4.x runtime and accept 1.5.0 through `MIN_PI_VERSION`, not only through the diagnostic string; the claude-bridge `test:unit` passes; grepping for `0\.99\.0` and for `1\.4\.0` used as a dev pin returns no live floor statements outside history; `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build` and the pi-subagents offline tests exit 0
  - Return milestone: all checks green
  - Stop / reassessment: floor references in generated or archived artifacts that should stay unchanged
- [x] AC-3: Workspace closeout checks green on 1.5.0
  - Outcome: one fresh run of every package's offline tests, the root SDK-consuming tests listed in AC-3, `check:ci`, `typecheck` and `build` on the final tree
  - Known entrypoints and skill paths: `docs/agent/testing.md#local-closeout-gate`, `pi-packages/*/package.json` scripts
  - Inputs: accepted outputs of every previous unit
  - Dependencies: AC-6 floor contract
  - Output: the check results recorded in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: every command exits 0 (the known parallel-load timeouts in pi-subagents are rerun serially)
  - Return milestone: before the final Oracle review
  - Stop / reassessment: any failure goes back to the owning unit

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 6f95e9b5e79b4a2b48d3a67849fd615e38f94e2981dafd1910d61237a53b7192

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-6 are satisfied. Changes remain compatibility-only; no blocking regressions, unrelated changes, or secrets were found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/pi-1-5-0-compat/pi-1-5-0-compat.md",
      "claim": "The verify gate passes. Both recorded canonical-source digests match, and all three durable deltas preserve their baseline contracts apart from the intended version changes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "dependency-check",
      "locator": "package.json; pi-packages/*/package.json; pnpm-lock.yaml; node_modules/.pnpm/lock.yaml",
      "claim": "All 12 manifests pass inspection: 23 Pi peer ranges are >=1.5.0, 36 installed development dependencies are 1.5.0, Node floors remain correct, and package versions are unchanged. Pi lock entries resolve only 1.5.0; installed and repository lockfiles agree.",
      "basis": "observed",
      "uncertainty": "Installation was not rerun during read-only verification."
    },
    {
      "id": "E3",
      "kind": "execution-log",
      "locator": "C:/Users/EremesNG/AppData/Local/Temp/pi-better-background-tasks/tasks/bg_vvw_mvzuou13_1/output.log",
      "claim": "All 11 package typechecks and offline suites, five root SDK test files, root typecheck, check:ci, and build exited zero. No implementation file is newer than this completed log.",
      "basis": "observed",
      "uncertainty": "Full suites were reused rather than duplicated."
    },
    {
      "id": "E4",
      "kind": "independent-tests",
      "locator": "Focused native test runs during this review",
      "claim": "Passed: theme real-SDK/image tests (32), subagent boundary/messaging tests (37), subagent schema tests (10), bridge prompt/inventory/model tests (76), core overlay/editor-focus tests (21), sidebar layout tests (25), and CLI commands tests (26). Installer/install tests also passed.",
      "basis": "observed",
      "uncertainty": "One CLI commands test initially timed out during concurrent startup; isolated and complete-file reruns passed."
    },
    {
      "id": "E5",
      "kind": "schema-audit",
      "locator": "pi-packages/pi-claude-bridge/src/askclaude-schema.ts; pi-packages/pi-todo/tool/types.ts; node_modules/@earendil-works/pi-ai/dist/utils/validation.js",
      "claim": "The registered-schema inventory uses supported JSON Schema constructs. Type.Unsafe changes produce byte-identical JSON against HEAD using the observed published 1.4.0 StringEnum implementation, including all 12 AskClaude default combinations. SDK probes pass enum rejection, batch bounds, metadata preservation, and numeric/array coercion.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "installed-source-audit",
      "locator": "Installed SDK 1.5.0: tui-renderer.js; tui-alt-screen.js; tui.js; interactive-mode.js; core/exec.js; core/agent-session.js",
      "claim": "Render forwarding, layoutRoot, overlay entries/handles, and editor replacement remain compatible. extensionDialogs matches the corrected fixture. pi.exec truncation reports failure and has no package API callers. The five streamFn mentions comprise two existing handoffs and three auth-metadata mentions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "assertion-review",
      "locator": "pi-packages/pi-claude-bridge/tests/unit-prompt-guard.mjs; pi-packages/pi-thoth-theme/test/render-kit-real-sdk.test.ts; changed cost tests",
      "claim": "The prompt regression exercises the real SDK preamble without either documentation trigger; negative assertions still reject current harness leakage. Theme staging loads production source through real SDK discovery and retains renderer/lifecycle assertions. Image coverage is stronger, and cost tests retain exact expectations while adding totalFromProvider:false.",
      "basis": "observed",
      "uncertainty": "Theme source staging tests compatibility rather than packed-artifact loading; the existing packaging checks and successful build remain separate evidence."
    },
    {
      "id": "E8",
      "kind": "scope-and-freshness",
      "locator": "git diff; repository version-reference scan",
      "claim": "The 61-file diff is scoped to the upgrade, compatibility fixes, fixtures, and documentation. No secret patterns were detected. Remaining 0.99.0/1.4.0 references are canonical baselines awaiting archive, historical material, compatibility test titles/comments, or rejection cases—not live floors or development pins. Implementation digest remained da8e7133ce84c6495d0ca1bf9f9657cce4e19e81f12218f6240f4145456c5c5a throughout review.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Manifest, installed-version, and lockfile assertions",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Uniform 1.5.0 dependencies and matching installed lock state corroborate the reported successful install."
    },
    {
      "check": "AC-2",
      "method": "Fresh closeout-log inspection",
      "outcome": "pass",
      "evidenceIds": ["E3", "E8"],
      "reason": "Root and every package typecheck passed on unchanged inputs."
    },
    {
      "check": "AC-3",
      "method": "Closeout evidence plus independent focused reruns",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "Required offline suites and repository checks passed; no bridge live tests were run."
    },
    {
      "check": "AC-4",
      "method": "Installed-source seam audit and real-SDK regression tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6", "E7"],
      "reason": "Every listed seam has compatible source evidence or a tested compatibility correction."
    },
    {
      "check": "AC-5",
      "method": "Schema inventory review, byte comparison, SDK validation probes, and schema tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "No unsupported schema dependency or weakened runtime validation was found."
    },
    {
      "check": "AC-6",
      "method": "Boundary-test reruns, code/documentation inspection, and canonical-delta comparison",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E4", "E8"],
      "reason": "Installer and numeric runtime gates reject 1.4.x and accept 1.5.0; diagnostics, documentation, and declared deltas agree."
    },
    {
      "check": "Scope, assertion integrity, and record binding",
      "method": "Diff review, secret-pattern scan, and repeated input hashing",
      "outcome": "pass",
      "evidenceIds": ["E1", "E7", "E8"],
      "reason": "No blocking scope or assertion issue; implementation and record prefix remained unchanged."
    }
  ],
  "risks": [
    {
      "description": "The extra CLI commands suite showed startup-load timing sensitivity: one timeout during concurrent checks, followed by successful isolated and full-file reruns.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, record PASS evidence, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-1-5-0-compat/pi-1-5-0-compat.md",
    "reviewedRecordSha256": "6f95e9b5e79b4a2b48d3a67849fd615e38f94e2981dafd1910d61237a53b7192"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `pnpm install`; manifest tests (pi-core, pi-subagents, pi-todo packed) | worker reported all `@earendil-works/*` peers `>=1.5.0`, dev deps `1.5.0`, lockfile only 1.5.0
- AC-2: PASS | `pnpm --filter "./pi-packages/*" --no-bail run typecheck` | rc=0, all 11 packages (root closeout bg_vvw_mvzuou13_1)
- AC-3: PASS | serial per-package offline tests + root SDK tests + `typecheck` + `check:ci` + `build` | all rc=0 (antigravity 1153, askcodex 315, background-tasks 756, core 1231, openai-fast 49, questions-user 313, sidebar 543, subagents 2025, theme 1448, todo 349, claude-bridge test:unit 788; root 5 SDK test files pass)
- AC-4: PASS | read-only seam audit against installed 1.5.0 | sidebar render/layoutRoot, overlays, editor slot, system-prompt layout, pi.exec compatible; focus fixture fixed (`extensionDialogs: []`); prompt guard marker drift fixed with real-SDK regression test
- AC-5: PASS | tool-schema audit + typing fix | 27 tools runtime-compatible; StringEnum typing wrapped with `Type.Unsafe` in askclaude-schema.ts and pi-todo/tool/types.ts, schemas byte-identical
- AC-6: PASS | `src/cli/pi-install.test.ts`; pi-subagents interaction-bridge MIN_PI_VERSION tests; claude-bridge unit-model-diagnostic | 1.4.x rejected, 1.5.0/1.6.0 accepted; red→green observed; grep leaves only historical comment `pi-core/src/channels.ts:3`
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:03a6caeb694ed8835a65f9fe7108719d111d778d4ae14868529bc673774aba82
- Source: .thoth/specs/cli-installation/spec.md | sha256:4bad31167e198f673570f7e86f87ce7cbfeec678347deb82b9362aa01ada604e

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
