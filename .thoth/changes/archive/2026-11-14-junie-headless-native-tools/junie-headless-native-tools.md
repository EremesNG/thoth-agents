# Change: junie-headless-native-tools

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: medium

## Exploration

- A pi-subagents worker on `junie/mix.normal` ran `pnpm run typecheck` / `pnpm exec vitest` through Junie's native `powershell` tool. Transcripts (`~/.junie/sessions/session-261114-105253-hkjz`) record `User response: No` and REJECTED blocks.
- Child subagent sessions are headless: `pi-packages/pi-subagents/src/runner/sdk-runner.ts:463–465`. The bridge passes `ui` only when `ctx.hasUI` (`pi-packages/pi-junie-bridge/extensions/index.ts:91–95,111–120`); `src/permissions.ts:44` rejects without UI; `:109–118` auto-allows only MCP calls titled `pi/...`.
- Native Junie activity is never a Pi tool call (`src/provider.ts:879`); approving it would bypass Pi's `bash`/edit policy. MCP calls become Pi `toolUse` (`src/provider.ts:969–992`).
- One Junie process per Pi session (`src/provider.ts:398–410,737–749`; `src/acp/connection.ts:82–89`). Launch: `src/junie-process.ts:123–145` (direct executable args at `:140`), Windows batch path hardcodes flags in encoded PowerShell at `:92` and rejects extra args at `:87`. Session metadata stores only `{cwd}`; `hasUI` is known in `extensions/index.ts` but not passed to launch.
- Prompt seam: `projectPrompt` in `src/provider.ts:185–222` (system text forwarded as bounded transcript context; test `tests/provider.test.ts:445–485`).
- Observed native model tool names (Windows): `powershell` (exec), `apply_patch` (mutation), `open`, `grep_search`, `glob_search`, `agent_skill_read_doc`, `create_plan` (read/plan). Junie docs also name `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `submit`.
- Junie docs (https://junie.jetbrains.com/docs/junie-cli-hooks.html, junie-cli-configuration.html, junie-cli-acp.html, retrieved 2026-11-13): ACP triggers `PreToolUse`; hooks load from files passed with `--config-location` (repeatable, additive; hook entries concatenated with user config); shape `{"hooks":{"PreToolUse":[{"matcher":"<regex>","hooks":[{"type":"command","command":"..."}]}]}}`; stdout `{"decision":"block","reason":"..."}` blocks and the model receives the reason; hook commands run via `cmd /c` on Windows and `sh -c` elsewhere. `PermissionRequest` hooks are not invoked in ACP. No documented MCP-only switch.

## Intent

In headless Pi sessions (e.g. subagent children) on a `junie` model, Junie's native shell-execution and file-mutation tools are blocked before execution with a model-visible reason directing it to the Pi MCP tools (`pi/bash`, `pi/edit`, `pi/write`), and the prompt tells Junie to use Pi tools, so commands and edits run through Pi's tool policy instead of failing on a rejected native permission.

## Non-goals

- No change for interactive (UI) sessions: native permission dialog behavior stays as today.
- No auto-approval of native tools; no forwarding of native permission requests to the orchestrator.
- Native read-only tools (`open`, `grep_search`, `glob_search`, etc.) stay allowed.
- No change to `~/.junie/config.json`, `~/.junie/allowlist.json` or project `.junie/`.
- No change to other bridges or pi-subagents.

## Acceptance

- AC-1: The bridge produces a Junie hook config file (under `getAgentDir()/junie-bridge/`) whose `PreToolUse` matcher selects exactly the native execution/mutation tools `Bash`, `powershell`, `apply_patch`, `Edit`, `Write` (anchored, case-insensitive) and whose synchronous command prints `{"decision":"block","reason":...}` with a reason naming `pi/bash`, `pi/edit`, `pi/write`; the command is valid for `cmd /c` on Windows and `sh -c` elsewhere and needs no Node or script file.
- AC-2: Headless Pi sessions launch Junie with `--config-location <hook file>` on both the direct-executable and Windows batch launch paths; sessions with UI launch without it. When the Windows batch path cannot pass the hook config path safely (cmd metacharacters such as `%`, `&`, `^`, `!`), the headless launch fails closed with an error directing the user to set `JUNIE_BRIDGE_LAUNCHER` to the real `junie.exe`, and never launches Junie without the hook or via a temporary hook copy. The extension's process-global shared state version (`extensions/index.ts` `STATE_VERSION`, currently 3) is bumped so a reload/upgrade replaces a pre-change provider instead of reusing it.
- AC-3: In headless sessions the prompt sent to Junie includes a short instruction to use the `pi/` MCP tools for commands and file changes; UI sessions' prompts are unchanged.
- AC-4: Without UI, any native permission request still fails closed (existing backstop unchanged), and README documents the headless behavior.

## Clarifications

- Approach: user selected "Hook PreToolUse + guía de prompt" over guidance-only, auto-approve, or no change.
- Scope: user selected headless sessions only (subagents); UI sessions keep the native approval dialog.

## Decisions

- Denylist matcher over allowlist: an allowlist could block unknown required tools such as `submit`; the fail-closed permission gate remains the backstop for unlisted native mutations.
- Matcher covers documented (`Bash`, `Edit`, `Write`, `apply_patch`) and observed (`powershell`) names, case-insensitive and anchored, e.g. `(?i)^(bash|powershell|apply_patch|edit|write)$` subject to the regex flavor Junie accepts (fallback: explicit case alternatives).
- Hook command is a platform-specific echo of a fixed JSON line (no `cmd` metacharacters in the reason) rather than a Node script, avoiding executable resolution and quoting risks; synchronous with `blockOnError` and `strictJsonOutput` true so hook failures and malformed output block.
- Provider contract change requires bumping the shared-state `STATE_VERSION` in `extensions/index.ts` (source comment mandates it; plan review showed a version-3 state is otherwise reused across reload).
- The hook file is static content written idempotently (atomic write) under the agent dir and reused across sessions.
- Unsafe batch config paths fail closed (user decision after final verification): a temporary hook copy in a shared location inherited writable ACLs (Oracle counterexample), and the case requires Windows + `.bat`/`.cmd` launcher + metacharacters in the agent dir path; the direct `junie.exe` path has no such limitation.
- Headless state flows from `extensions/index.ts` (`ctx.hasUI`) through session metadata into the provider and launcher.

## Durable deltas

- `ADDED pi-ecosystem` **Junie bridge headless native tool routing** — In a Pi session without a dialog-capable UI, the Junie bridge MUST launch Junie with a `PreToolUse` hook configuration that blocks Junie's native shell-execution and file-mutation tools before execution with a reason directing it to the Pi MCP tools, MUST refuse to start rather than launch Junie without that hook, MUST tell Junie in the prompt to use the Pi tools for commands and file changes, and MUST leave native read-only tools and UI sessions unchanged.
  - GIVEN a headless Pi run (such as a subagent child) on a `junie` model; WHEN Junie attempts its native `powershell` or `apply_patch` tool; THEN the hook blocks it before execution with a reason naming `pi/bash`, Junie can continue through the Pi MCP tools, and an interactive session launches without the hook .

## Plan

Package: `pi-packages/pi-junie-bridge` only.

1. Hook config (AC-1): new module (e.g. `src/native-tool-hooks.ts`) exporting a pure builder for the config object/command string per platform and an idempotent atomic writer returning the file path under `getAgentDir()/junie-bridge/`. Unit tests assert JSON shape, matcher semantics against tool names (block `powershell`, `Bash`, `apply_patch`, `Edit`, `Write`; allow `open`, `grep_search`, `glob_search`, `submit`, `mcp_pi_bash`), and that executing the generated command through the platform shell prints parseable block JSON.
2. Headless plumbing + launch (AC-2): record `headless` (from `!ctx.hasUI`) in session metadata in `extensions/index.ts`; provider passes it into connection/launch; `src/junie-process.ts` accepts extra args and appends `--config-location <path>` on both the direct path (`:140`) and the Windows batch/encoded-PowerShell path (`:87–92`, quoting the path safely, with an argument round-trip test). Bump `STATE_VERSION` in `extensions/index.ts` (`:17–108`) and add an extension lifecycle test seeded with a complete old version-3 shared state proving the old provider is closed/replaced and the new provider configures headless launch. Tests in `tests/junie-process.test.ts` and `tests/provider.test.ts` (fake Junie records argv) for headless vs UI.
3. Prompt guidance (AC-3): in `projectPrompt` (`src/provider.ts:185–222`), prepend/append a bounded guidance block only for headless sessions; extend `tests/provider.test.ts` prompt assertions.
4. Backstop + docs (AC-4): keep `permissions.ts` behavior; add/confirm a test that headless native permission requests are rejected; update `README.md` (native tools section, `:58`).

Verification: `pnpm run typecheck` and `pnpm exec vitest run` in `pi-packages/pi-junie-bridge`; root `pnpm run typecheck` and `pnpm run check:ci` (pre-existing unrelated `src/**` formatting failures noted). Live Junie behavior (hook actually firing on `powershell`, Junie retrying with `pi/bash`) requires a manual subagent run by the user.

Risks: hook availability in the installed Junie release (docs once labeled hooks EAP); matcher regex flavor; hook-input tool naming layer (model names vs display titles); Junie may not retry via `pi/` after a block (guidance mitigates, not guarantees).

## Tasks

- [x] AC-1: Hook config builder and idempotent writer with platform-specific blocking command
  - Outcome: tested module that writes the static `PreToolUse` block config and returns its path
  - Known entrypoints and skill paths: `pi-packages/pi-junie-bridge/src/` (new module), `src/session-store.ts:58–94` (agent dir + atomic write pattern); skills `tdd`, `simplify`
  - Inputs: Exploration and Decisions of this record
  - Dependencies: none
  - Output: module + unit tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/src/**`, `pi-packages/pi-junie-bridge/tests/**`
  - Interface boundaries: Junie hook config contract (docs above); no change to user Junie config files
  - Focused check and PASS evidence: vitest for the new test file passes, including real platform-shell execution of the generated command producing block JSON
  - Return milestone: with AC-2..AC-4 in one worker return
  - Stop / reassessment: Junie matcher regex flavor or shell quoting cannot be made safe without a script
- [x] AC-2: Headless flag plumbing and `--config-location` on both launch paths
  - Outcome: headless sessions launch Junie with the hook config; UI sessions do not
  - Known entrypoints and skill paths: `extensions/index.ts:17–120` (incl. `STATE_VERSION`), `src/provider.ts:398–410,737–749`, `src/acp/connection.ts:82–89`, `src/junie-process.ts:87–145`; tests `tests/junie-process.test.ts:45–89`, `tests/provider.test.ts:89–90,295–326`, `tests/fixtures/fake-junie.cjs`
  - Inputs: AC-1 module
  - Dependencies: AC-1
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/**`
  - Interface boundaries: session store metadata shape; Windows job launcher encoded command
  - Focused check and PASS evidence: launch/provider tests assert argv contains `--config-location <path>` only for headless, on direct and batch paths (batch path argument round trip); extension lifecycle test seeded with old version-3 state shows replacement of the old provider
  - Return milestone: same worker return
  - Stop / reassessment: headless state unavailable at first launch for some session kinds
- [x] AC-2: Unsafe batch config paths fail closed with an actionable error and no temporary hook copy
  - Outcome: headless Windows batch launch whose hook config path contains cmd metacharacters refuses to start with an error naming `JUNIE_BRIDGE_LAUNCHER` and `junie.exe`; the temporary safe-copy mechanism added in the first repair is removed
  - Known entrypoints and skill paths: `pi-packages/pi-junie-bridge/src/junie-process.ts:81–116` and launch/cleanup code, `src/native-tool-hooks.ts` (`copyBatchSafeConfig`), `tests/headless-launch.test.ts`, `README.md`; skills `tdd`, `simplify`
  - Inputs: Oracle FAILs subtask_thoth-oracle_1794678630383_bae063c9 and subtask_thoth-oracle_1794679275673_cab77822 (inherited writable ACL on temp copy); user decision to fail closed
  - Dependencies: prior AC-2 unit
  - Output: code + tests + README
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/**`
  - Interface boundaries: Windows job launcher encoded command; provider surfaces the launch error to Pi
  - Focused check and PASS evidence: test with `%`/`&`/`^`/`!` config paths asserts the actionable error and that no launcher call and no temp file occur; non-metacharacter batch round-trip and direct-path metacharacter tests still pass; full package vitest + typecheck pass
  - Return milestone: worker return
  - Stop / reassessment: launch error is swallowed or leaves the session hung instead of surfacing
- [x] AC-3: Headless-only prompt guidance to use `pi/` tools
  - Outcome: headless first/subsequent prompts carry the guidance; UI prompts unchanged
  - Known entrypoints and skill paths: `src/provider.ts:185–222,919–923`; `tests/provider.test.ts:445–490`
  - Inputs: AC-2 headless flag
  - Dependencies: AC-2
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/**`
  - Interface boundaries: prompt projection and history digests (resume divergence must not be triggered by guidance)
  - Focused check and PASS evidence: provider tests assert guidance presence/absence and unchanged resume behavior
  - Return milestone: same worker return
  - Stop / reassessment: guidance would alter history digests used for resume
- [x] AC-4: Backstop test and README documentation
  - Outcome: headless native permission rejection still covered; README describes headless routing
  - Known entrypoints and skill paths: `src/permissions.ts`, `README.md:58`
  - Inputs: AC-1..AC-3
  - Dependencies: AC-3
  - Output: test + README edit
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/README.md`, `pi-packages/pi-junie-bridge/tests/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: package typecheck + full package vitest pass; root typecheck passes
  - Return milestone: worker final return
  - Stop / reassessment: none

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
After two final-verification FAILs, AC-2 amended to fail closed (user decision); fresh plan review subtask_thoth-oracle_1794681333402_8034feb5 OKAY, recordSha256 809ef2f9e6458dfaf47cd5a468443d6fe41cd5ea2ae3a7ccd80d5034a784aa9f.
First review REJECT (STATE_VERSION invalidation) repaired; fresh Oracle subtask_thoth-oracle_1794677935190_3f63c36a OKAY, recordSha256 1fa955eb9ac721db3b8dc802b4d6f8ed861355f798f6362a0b68b2c39c82f033.
**Implementation**: AUTHORIZED
User selected Implement after plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d8d4ded2bfd27ff345c60111b8c9e69cc539bb325295de8f6e781b254a81aa9b

Fresh Oracle subtask_thoth-oracle_1794681654921_c9f1ef86; delivered thoth-gate-verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match. Prior FAILs: subtask_thoth-oracle_1794678630383_bae063c9 (metacharacter batch path threw), subtask_thoth-oracle_1794679275673_cab77822 (temp copy inherited writable ACLs); repaired per amended AC-2. Live Junie hook firing/retry remains a manual follow-up (non-blocking).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-4 and the durable delta are satisfied. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "gate",
      "locator": ".thoth/changes/junie-headless-native-tools/junie-headless-native-tools.md",
      "claim": "Verify gate passes; canonical baseline digest matches. Reviewed record prefix and scoped implementation remained unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-and-test",
      "locator": "pi-packages/pi-junie-bridge/src/native-tool-hooks.ts:13-58; tests/native-tool-hooks.test.ts",
      "claim": "Anchored case-insensitive matcher selects the five required tools. Synchronous shell command produces blocking JSON naming Pi tools. Writer atomically maintains the agent-directory config.",
      "basis": "observed",
      "uncertainty": "POSIX shell execution was not reproduced on this Windows host."
    },
    {
      "id": "E3",
      "kind": "source-and-test",
      "locator": "pi-packages/pi-junie-bridge/src/junie-process.ts:82-169; tests/headless-launch.test.ts; tests/provider.test.ts:498-524",
      "claim": "Unsafe batch config paths reject before launcher invocation, with actionable JUNIE_BRIDGE_LAUNCHER/junie.exe guidance and a Pi error terminal. Windows batch round-trip and direct pass-through tests pass. Temporary-copy mechanism is absent.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "source-and-test",
      "locator": "pi-packages/pi-junie-bridge/extensions/index.ts:25-31,111-120; src/provider.ts:208-212,415-427,759-814,942-946; tests/extension.test.ts; tests/provider.test.ts",
      "claim": "Version 4 replaces legacy state. Headless initial launches and resume-failure reconnects receive the hook; prompts receive guidance without changing history digests. UI launches/prompts remain unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "source-and-test",
      "locator": "pi-packages/pi-junie-bridge/src/permissions.ts:44,101-120; tests/native-permissions.test.ts; README.md:58-67",
      "claim": "Native permission requests still reject without UI; documentation describes routing and unsafe-batch refusal.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "Fresh package and root checks",
      "claim": "Package typecheck passes; Vitest passes 18 files/174 tests, including usage-context interactions. Root typecheck and check:ci pass; check:ci reports warnings/information only. Scoped diff whitespace check passes.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect hook builder/writer and execute package tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6"],
      "reason": "Required matcher, command output, fail-closed flags and config location verified."
    },
    {
      "check": "AC-2",
      "method": "Audit launch/reconnect paths and run Windows launch, provider and extension regressions",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E6"],
      "reason": "No hookless headless launch or reconnect fallback found; refusal reaches Pi without hanging or copying the hook."
    },
    {
      "check": "AC-3",
      "method": "Inspect prompt projection and continuation/resume assertions",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Guidance is headless-only; resume remains functional."
    },
    {
      "check": "AC-4 and durable delta",
      "method": "Review baseline, permission backstop, documentation and verify gate",
      "outcome": "pass",
      "evidenceIds": ["E1", "E3", "E4", "E5", "E6"],
      "reason": "Declared behavior and preserved contracts are covered."
    },
    {
      "check": "Live Junie integration",
      "method": "Manual installed-CLI hook/retry exercise",
      "outcome": "not-run",
      "evidenceIds": ["E1", "E2"],
      "reason": "Explicitly deferred in the record; offline checks do not prove installed Junie hook consumption or model retry."
    },
    {
      "check": "Supplementary inline argv probe",
      "method": "Additional shell-character exploration outside the regression suite",
      "outcome": "not-run",
      "evidenceIds": ["E3"],
      "reason": "Inconclusive due to unsettled await; owned temporary fixtures were removed and no probe processes remain. Required Windows regression tests passed."
    }
  ],
  "risks": [
    {
      "description": "Installed Junie hook compatibility and retry through Pi tools remain manually unverified, as explicitly documented in the record.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E1", "E2"]
    }
  ],
  "openQuestions": [],
  "nextAction": "root: validate delivery and proceed through closeout/archive",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/junie-headless-native-tools/junie-headless-native-tools.md",
    "reviewedRecordSha256": "d8d4ded2bfd27ff345c60111b8c9e69cc539bb325295de8f6e781b254a81aa9b"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | tests/native-tool-hooks.test.ts + Oracle source review | Oracle E2/E6; matcher permutations and Windows shell JSON output verified
- AC-2: PASS | tests/headless-launch.test.ts, tests/provider.test.ts, tests/extension.test.ts | Oracle E3/E4/E6; headless-only --config-location, STATE_VERSION 4 replaces v3, unsafe batch paths fail closed with error terminal
- AC-3: PASS | tests/provider.test.ts continuation/resume guidance tests | Oracle E4/E6; guidance headless-only, history digests unchanged
- AC-4: PASS | tests/native-permissions.test.ts + README review | Oracle E5/E6; headless native permission rejection unchanged, README documents routing and limitation
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:f869409ecf13080902c5349419d1ccf487dba7bc48994c286874a3ef504ceeea

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
