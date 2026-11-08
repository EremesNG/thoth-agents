# Change: thoth-mem-07-setup-contract

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: high

## Exploration

- thoth-agents `master` at `0f3e81f1` (clean, v0.11.0, OpenCode v2 migration merged) invokes `npx -y thoth-mem@latest setup <opencode|codex|claude|pi> [--plan] --json` (`src/cli/thoth-mem-install.ts:205-220`; Windows through `cmd /d /s /c` in `src/cli/npx-command.ts:11-22`; 120 s timeout) and parses a common envelope `{status: complete|failed|partial|requires_user_action, changed, harness, scope:"global", target, steps[{name,outcome}], diagnostics, manual_actions, receipt}` with exit mapping 0/1/2/3 (`src/cli/thoth-mem-install.ts:66-135,278-300`). Provider completion is mandatory before the ledger is recorded (`src/cli/install-completion.ts:60-70,113-145`).
- thoth-mem never emitted that envelope. Live plans on 2026-11-08 of published `thoth-mem@latest` (0.6.3) and of thoth-mem HEAD `879594e` (forthcoming 0.7.0, manifest still 0.6.3) both exit 0 with an OpenCode object `{status:"planned", changed, plugin, opencodeVersion (0.7.0 only), configPath, skillPath, providerConfigPath, receiptPath, actions, recovered, warnings}`. Every current provider step therefore fails thoth-agents evidence validation; unit tests mock the provider and miss it.
- thoth-mem 0.7.0 contract (`thoth-mem/src/cli.ts:308-343`, `src/setup/{opencode,pi,native-manager}.ts`): `setup <opencode|pi|codex|claude> [--plan] [--json] [--data-dir] [--local-package-root] [--force-version]`; `--scope` rejected. Statuses: OpenCode and Pi `planned` (plan) / `complete` (apply), exit 0; Codex and Claude additionally `unsupported` and `requires-user-action`, exit 1, JSON still on stdout. Thrown exceptions exit 1 with no JSON and stderr `Setup failed: <message>`; invalid host/options exit 2. `--json` stdout carries only the pretty-printed JSON object. Fields: all hosts `status, changed, actions[], warnings[], receiptPath (string|null), recovered`; Pi/Codex/Claude add `host`; Codex/Claude add `diagnostics[]`, `restartRequired`; OpenCode has no `host`. The result types are not exported in the published package, so the consumer owns its representation.
- thoth-mem 0.7.0 requires stable OpenCode >=2.2.6 (rejects older or prerelease hosts even in `--plan`), migrates its own legacy `plugin` entry to `plugins`, registers its packaged skill at runtime and writes no OpenCode MCP config; thoth-agents does not touch thoth-mem entries (`src/cli/config-io.ts:112-157`).
- thoth-agents enforces OpenCode >=2.2.5 at `src/cli/system.ts:161-175`, `src/cli/install.ts:134-155,379`, `src/cli/operations/opencode.ts:1956-1959`, help `src/cli/commands.ts:340`, descriptions `src/cli/operations/opencode.ts:379,1092,1380`, with tests `src/cli/opencode-v2.test.ts:182-197`, `src/cli/install.test.ts:1054-1057`, `src/cli/operations/opencode.test.ts:353`, `src/cli/commands.test.ts:121`, and docs `README.md:65`, `docs/installation.md:52,816`, `docs/provider-configurations.md:3`, `docs/agent/{cli-installation.md:11,architecture.md:16,harness-packaging.md:17,runtime-integrations.md:5,testing.md:456}`.
- Parsed provider evidence is transient: consumers are `src/cli/install.ts:269-295,315` (command, args, steps, diagnostics, receipt, manualActions, success, status, error), `src/cli/install-completion.ts`, and `src/cli/operations/types.ts:69-115` (success, status, diagnostics, manualActions, receipt) via the OpenCode/Codex/Claude finalizers; Pi reads only completion-level fields (`src/cli/operations/pi.ts:1350-1380`). The ledger stores only `{version}` per harness (`src/cli/install-ledger.ts:14-20`), so no persisted schema changes. `ProviderCapabilityEvidence` (`src/harness/types.ts:39-46`) is unrelated.
- `thoth-mem@latest` setup literals: `docs/claude-code-install.md:56`, `docs/codex-install.md:90`, `docs/installation.md:781-784`, `.thoth/specs/cli-installation/spec.md:11`, tests `src/cli/thoth-mem-install.test.ts:52,66,87`, `src/cli/npx-command.test.ts:9,15`, `src/cli/install.test.ts:115`, `src/cli/install-completion.test.ts:32`, `src/harness/provider-boundary.test.ts:248`. Occurrences in operation/writer test fixtures describe provider-owned configuration, not the setup invocation.

## Intent

thoth-agents installs and updates every harness successfully against the real thoth-mem 0.7 setup contract: it invokes a pinned compatible thoth-mem release line, judges provider completion truthfully from thoth-mem's per-host JSON and exit codes, surfaces the provider's own actions, warnings, diagnostics and receipt, and rejects OpenCode hosts that thoth-mem 0.7 cannot set up before writing any configuration.

## Non-goals

- Changing thoth-mem or its published contract (user decision: thoth-agents adapts).
- Using `--local-package-root` for non-Pi harnesses, passing `--data-dir`, or passing Codex `--force-version`.
- Changing the install ledger schema, `ProviderCapabilityEvidence`, or thoth-agents plugin-entry migration.
- Editing or cleaning up thoth-mem-owned OpenCode entries, skills or receipts.
- Version bumps, publishing, or editing historical `.thoth/history/**` records.
- Changing the `@opencode/plugin` type-only devDependency pin.

## Acceptance

- AC-1: Every non-local provider setup for opencode, codex, claude and pi runs `npx -y thoth-mem@>=0.7.0 setup <harness> [--plan] --json` from one source constant, passing the package spec as a single literal argument (quoted through the existing Windows `cmd /d /s /c` wrapper so `>` is never a redirection); the explicit local Pi path still skips provider setup and prints the separate local command.
- AC-2: Provider success is accepted only for exit 0 with a well-formed per-host result whose status is `planned` in dry-run or `complete` when applied, and whose `host` (when present) equals the requested harness; `unsupported`/`requires-user-action` with exit 1, exit 1 without JSON (stderr diagnostic, bounded), exit 2, launch error, timeout, malformed or non-JSON stdout, missing/mistyped fields, status/exit contradiction, wrong `host`, or a mode-inconsistent status are reported as unsuccessful without fabricated evidence and without recording the ledger.
- AC-3: Install and operation output surface the provider's `actions`, `warnings`, `diagnostics` (when present), receipt path and restart requirement (when present) for both successful and unsuccessful results; the ledger schema and provider-before-ledger ordering are unchanged.
- AC-4: OpenCode install and applied update require stable OpenCode >=2.2.6 and fail before writing any configuration for missing, unparseable, prerelease or older hosts, with CLI help and operation descriptions stating 2.2.6.
- AC-5: README, `docs/installation.md`, `docs/claude-code-install.md`, `docs/codex-install.md`, `docs/provider-configurations.md` and routed `docs/agent/**` state the quoted `"thoth-mem@>=0.7.0"` setup command, the per-host status/exit semantics, and the OpenCode 2.2.6 minimum.
- AC-6: The local closeout gate passes: `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build`, and focused Vitest for touched CLI/harness areas, including a parser test fed with the captured real thoth-mem 0.7 OpenCode plan output; and the built CLI's OpenCode dry-run install reports the live published `thoth-mem@>=0.7.0` provider plan as successful without mutating provider state.

## Clarifications

- Contract owner: the user chose to adapt thoth-agents to thoth-mem's real per-host contract rather than add a common envelope to thoth-mem (2026-11-08).
- Target release: thoth-mem 0.7.0 is published; on 2026-11-08 `npm view thoth-mem dist-tags` reports `latest: 0.7.0` and `npm view "thoth-mem@>=0.7.0" version` resolves `0.7.0`.
- Version selector: the user chose a 0.7.0 floor with latest-like resolution afterwards, accepting that later releases with contract changes are picked up automatically (2026-11-08).

## Decisions

- Selector `thoth-mem@>=0.7.0`: npx resolves the highest published release, like `@latest`, but refuses anything older than the 0.7 contract. The spec contains `>`, so it is passed as one argv element without a shell on POSIX. On Windows, quoting inside the command string is not enough: Node's default `spawnSync` argument escaping delivers the selector with literal surrounding quotes (plan-review probe). The executor therefore builds the complete `cmd /d /s /c "..."` command line itself, double-quoting the selector, and spawns it with `windowsVerbatimArguments: true`; shared `src/cli/npx-command.ts` callers (required external skills through `npx skills add`, `src/cli/skills.ts`) keep their current behavior and tests. Documentation shows the selector quoted. thoth-mem 0.7.0 is already published, so the thoth-agents release can follow directly.
- thoth-agents owns a typed mirror of the thoth-mem 0.7 per-host result, validated structurally because the provider exports no public types: every field the provider declares as required for that host (thoth-mem `src/setup/opencode.ts:33-45`, `src/setup/pi.ts:28-40`, `src/setup/native-manager.ts:72-86`, including nested `verification` booleans) must be present with its declared type; only declared-optional fields may be absent; unknown extra fields are tolerated.
- Normalized internal result replaces `steps`/`manualActions`/`scope`/`target` with `actions`, `warnings`, `diagnostics`, `receipt`, `restartRequired`, raw provider `status`, exit code, and `error`; consumers in `install.ts`, `install-completion.ts` and `operations/types.ts` render those fields. Existing exit-code-to-status contradiction checks are kept using the new mapping (`planned`/`complete` ⇔ 0; `unsupported`/`requires-user-action` ⇔ 1).
- Raise the thoth-agents OpenCode floor to 2.2.6 so incompatible hosts fail before any thoth-agents write instead of after them at the provider step.
- Codex `--force-version` is not passed: an unsupported Codex CLI surfaces as an unsuccessful provider result with thoth-mem's diagnostic.

## Durable deltas

- `MODIFIED cli-installation` **Provider setup policy** — Published installers MUST invoke `npx -y thoth-mem@>=0.7.0 setup <opencode|codex|claude|pi> --json`, passing the package spec as one literal argument that no shell interprets as redirection, after thoth-agents-owned setup and mandatory external skills, adding `--plan` only for dry-run, and MUST NOT substitute `@latest` or pass the rejected `--scope` option; provider setup is globally scoped by thoth-mem. An explicit Pi `--local-package-root` install MUST omit provider setup, record only thoth-agents completion, and direct the operator to install thoth-mem separately from its own local checkout.
  - GIVEN any supported harness using its published install source; WHEN its installation reaches provider setup; THEN it runs `npx -y thoth-mem@>=0.7.0 setup <harness> --json` with the spec as one literal argument, with `--plan` only for dry-run, after thoth-agents-owned setup and required skills .
- `MODIFIED cli-installation` **Truthful provider outcome** — The installer MUST parse thoth-mem's per-host setup JSON and exit code, accept as success only exit 0 with a well-formed result whose status is `planned` for dry-run or `complete` when applied and whose reported host matches the requested harness, treat `unsupported`, `requires-user-action`, a thrown setup failure, invalid options, malformed output and status/exit or host contradictions as unsuccessful, and surface the provider's actions, warnings, diagnostics, receipt path and restart requirement without claiming completion for any other state.
  - GIVEN thoth-mem reports `requires-user-action` with exit 1, exits 1 with only a stderr failure, or prints malformed output; WHEN thoth-agents finishes the command; THEN it reports the bounded provider diagnostics, actions, warnings and receipt path and does not record complete installation .
- `RENAMED cli-installation FROM Require OpenCode 2.2.5 or later` **Require OpenCode 2.2.6 or later** — OpenCode installation and update MUST parse the detected host version and MUST fail before writing any configuration when OpenCode is missing, unparseable, a prerelease or older than 2.2.6.
  - GIVEN an OpenCode host reporting version 2.2.5; WHEN `install --agent=opencode` runs; THEN it fails with a message requiring OpenCode 2.2.6 or later and writes no configuration .
- `MODIFIED cli-installation` **Provide owned OpenCode workflow skills from the plugin package** — The OpenCode plugin MUST register the five canonical thoth-owned workflow skills from its installed package through the OpenCode skill domain; the OpenCode installer MUST NOT copy them into or delete anything from the OpenCode skills directory, and when legacy same-name copies exist there it MUST move them, only after explicit operator confirmation, into a new no-clobber backup below a hidden (dot-prefixed) directory segment that host skill scanning does not traverse, otherwise (including when a move fails) leaving them untouched with a warning that they shadow the packaged skills.
  - GIVEN a complete installed thoth-agents package and a stale `thoth-sdd` copy under `~/.config/opencode/skills/`; WHEN `install --agent=opencode` runs and the operator confirms the move; THEN the copy is moved unchanged into the backup directory and OpenCode 2.2.6 lists all five owned skills once with paths inside the installed package .
- `MODIFIED cli-installation` **Document the explicit update contract** — CLI help, status and operation messaging, and routed public installation guidance SHALL describe exact OpenCode version pinning, the minimum OpenCode host version, the last complete CLI-managed version, native marketplace independence, and the complete CLI-driven update path consistently.
  - GIVEN installation and update help or documentation; WHEN an operator reads the OpenCode guidance; THEN it explains the exact-version pin, the OpenCode 2.2.6 minimum and that re-running the latest CLI installer or applying Update is the supported update mechanism .
- `MODIFIED multi-harness-agent-pack` **Native OpenCode v2 plugin integration** — The OpenCode integration MUST be a `@opencode/plugin` v2 plugin that registers the six roles, tools, MCP servers, `/thoth-init` and owned skills through OpenCode domain APIs, delegates through the native `subagent` tool, enforces role delegation boundaries through OpenCode permissions, and MUST NOT rewrite the system prompt, tool list or prior messages per request.
  - GIVEN OpenCode 2.2.6 with thoth-agents installed; WHEN a session starts and the orchestrator delegates; THEN the six roles are listed with `orchestrator` as default, delegation uses `subagent`, a non-orchestrator `subagent` call is denied, and successive requests keep a byte-stable system prompt and message prefix .

## Plan

Approach: replace the consumer adapter in `src/cli/thoth-mem-install.ts` with a thoth-mem 0.7 per-host parser and the `>=0.7.0` floor selector, propagate the normalized result to its three consumers, raise the OpenCode floor, then align documentation. Root applies spec deltas only at archive.

Interfaces and mutable surfaces:
- Provider adapter: `src/cli/thoth-mem-install.ts` (command builder, parser, exit/status consistency, normalized `ThothMemSetupResult`), `src/cli/npx-command.ts` only if quoting requires it; consumers `src/cli/install.ts` (evidence display), `src/cli/install-completion.ts` (success gate), `src/cli/operations/types.ts` (operation targets/warnings); finalizers in `src/cli/operations/{opencode,codex,claude-code,pi}.ts` only if types force it. Tests: `src/cli/thoth-mem-install.test.ts`, `src/cli/npx-command.test.ts`, `src/cli/install.test.ts`, `src/cli/install-completion.test.ts`, `src/cli/operations/*.test.ts` where evidence fixtures change, `src/harness/provider-boundary.test.ts:241-274`.
- OpenCode floor: `src/cli/system.ts:161-175`, `src/cli/commands.ts:340`, `src/cli/operations/opencode.ts:379,1092,1380,1956-1959`, tests `src/cli/opencode-v2.test.ts`, `src/cli/install.test.ts:1054-1057`, `src/cli/operations/opencode.test.ts:353`, `src/cli/commands.test.ts:121`.
- Documentation: README and `docs/**` listed in AC-5.

Unit boundaries: the adapter unit and the floor unit both touch `src/cli/install.test.ts` and `src/cli/operations/opencode.*`, so they run sequentially (adapter first). Docs follow both, because they describe the accepted behavior.

Focused verification seams: Vitest for `src/cli/thoth-mem-install.test.ts` (including the captured real OpenCode plan JSON from this record's Exploration and per-host fixtures for Pi/Codex/Claude including `unsupported`/`requires-user-action`, stderr-only exit 1, exit 2), `install-completion`, `install`, `opencode-v2`, `commands`, `operations/*`, `provider-boundary`; then `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build`.

Risks:
- Future contract drift: `>=0.7.0` follows the newest release, so a later thoth-mem with an incompatible setup contract would fail provider validation until thoth-agents adapts (accepted by the user).
- Windows transport: an unquoted `>` inside `cmd /c` would redirect output to a file named `=0.7.0`, and default spawn escaping would add literal quotes to the selector; a native Windows argv round-trip test through the same executor (with a Node argv observer in place of npx) must prove the selector arrives exactly as `thoth-mem@>=0.7.0`, and no `=0.7.0` file is created.
- thoth-mem 0.7 accepts only Codex CLI 0.151.x without `--force-version`; other Codex versions fail provider setup by design.
- Applied (non-dry-run) installs mutate the operator's real host configuration, so live evidence is limited to non-mutating provider plans; applied behavior is covered by fixtures.

## Tasks

- [x] AC-1: `thoth-mem@>=0.7.0` provider command for every harness
  - Outcome: one selector constant drives the provider command for opencode, codex, claude and pi, passed as one literal argument (quoted in the Windows wrapper); local Pi skip path unchanged
  - Known entrypoints and skill paths: `src/cli/thoth-mem-install.ts:152-170,205-220`, `src/cli/npx-command.ts:11-22`, `src/cli/skills.ts` (shared npx-helper caller), `src/cli/install.ts:335-350`, tests `src/cli/thoth-mem-install.test.ts:42-88`, `src/cli/npx-command.test.ts`, `src/cli/install.test.ts:115`, `src/cli/install-completion.test.ts:32`, `src/harness/provider-boundary.test.ts:241-274`; skill `tdd`
  - Inputs: Exploration and Decisions in this record
  - Dependencies: none
  - Output: updated command builder and tests
  - Owner: thoth-worker
  - Writes: `src/cli/thoth-mem-install.ts`, `src/cli/npx-command.ts` (only if needed), `src/cli/npx-command.test.ts`, the listed tests
  - Interface boundaries: `buildThothMemSetupCommand`-style exports consumed by install/operations preview
  - Focused check and PASS evidence: `pnpm vitest run src/cli/thoth-mem-install.test.ts src/cli/npx-command.test.ts src/harness/provider-boundary.test.ts` passes with exact argv assertions on `thoth-mem@>=0.7.0` for all four harnesses, an exact Windows `cmd /d /s /c` command line spawned with `windowsVerbatimArguments: true`, and a Windows-only (skipped elsewhere) native round-trip through the executor where a Node argv observer receives exactly `thoth-mem@>=0.7.0` and no `=0.7.0` file appears; required-skill npx tests still pass
  - Return milestone: together with the AC-2 and AC-3 adapter rows in one worker result
  - Stop / reassessment: the verbatim cmd command line cannot deliver the selector literally, or a shared npx-helper caller would change behavior
- [x] AC-2: Truthful thoth-mem 0.7 per-host result parser
  - Outcome: parser and consistency checks implement exactly the AC-2 success and failure matrix
  - Known entrypoints and skill paths: `src/cli/thoth-mem-install.ts:66-149,234-300`, `src/cli/install-completion.ts:60-70,113-145`, tests `src/cli/thoth-mem-install.test.ts:91-180`, `src/cli/install-completion.test.ts`; skill `tdd`
  - Inputs: thoth-mem 0.7 contract in Exploration, captured OpenCode plan JSON, Decisions
  - Dependencies: none (same worker as AC-1)
  - Output: typed per-host mirror, normalized `ThothMemSetupResult`, tests for every matrix row
  - Owner: thoth-worker
  - Writes: `src/cli/thoth-mem-install.ts`, `src/cli/install-completion.ts`, their tests
  - Interface boundaries: `install-completion` success gate and ledger ordering unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/cli/thoth-mem-install.test.ts src/cli/install-completion.test.ts` passes, covering planned/complete success, unsupported/requires-user-action exit 1, stderr-only exit 1, exit 2, malformed/non-JSON, missing fields, status/exit contradiction, wrong host, planned-on-apply and complete-on-plan
  - Return milestone: same worker result as AC-1
  - Stop / reassessment: a consumer depends on removed fields in a way not listed in Exploration
- [x] AC-3: Provider evidence rendering in install and operations
  - Outcome: install and operation outputs show actions, warnings, diagnostics, receipt path and restart requirement; ledger unchanged
  - Known entrypoints and skill paths: `src/cli/install.ts:269-295,315`, `src/cli/operations/types.ts:69-115`, finalizers `src/cli/operations/{opencode.ts:2089-2098,codex.ts:1226-1235,claude-code.ts:780-789,pi.ts:1350-1380}`, tests `src/cli/install.test.ts:604-626,971-1012`, `src/cli/operations/*.test.ts`; skill `tdd`
  - Inputs: normalized result from AC-2
  - Dependencies: AC-2 row (same worker, sequential)
  - Output: updated renderers and tests
  - Owner: thoth-worker
  - Writes: `src/cli/install.ts`, `src/cli/operations/types.ts`, finalizers only if types require, related tests
  - Interface boundaries: `src/cli/install-ledger.ts` untouched
  - Focused check and PASS evidence: `pnpm vitest run src/cli/install.test.ts src/cli/operations` passes; `pnpm run typecheck` clean
  - Return milestone: one worker result covering AC-1..AC-3 with test output
  - Stop / reassessment: rendering change requires ledger or TUI schema changes
- [x] AC-4: OpenCode floor 2.2.6
  - Outcome: every enforcement, message, help and description uses 2.2.6, failing before writes for older/prerelease hosts
  - Known entrypoints and skill paths: `src/cli/system.ts:161-175`, `src/cli/install.ts:134-155`, `src/cli/commands.ts:340`, `src/cli/operations/opencode.ts:379,1092,1380,1956-1959`, tests `src/cli/opencode-v2.test.ts:182-197`, `src/cli/install.test.ts:1054-1057`, `src/cli/operations/opencode.test.ts:353`, `src/cli/commands.test.ts:121`; skill `tdd`
  - Inputs: Decisions; accepted AC-1..AC-3 worker result
  - Dependencies: AC-1..AC-3 accepted (shared test files)
  - Output: floor raised with tests rejecting 2.2.5 and accepting 2.2.6
  - Owner: thoth-worker
  - Writes: listed source and test files
  - Interface boundaries: `@opencode/plugin` devDependency untouched
  - Focused check and PASS evidence: `pnpm vitest run src/cli/opencode-v2.test.ts src/cli/install.test.ts src/cli/operations/opencode.test.ts src/cli/commands.test.ts` passes with a 2.2.5 rejection case
  - Return milestone: worker result with test output
  - Stop / reassessment: another runtime path enforces a separate floor
- [x] AC-5: Documentation aligned with the new contract
  - Outcome: listed docs state the quoted `"thoth-mem@>=0.7.0"` command, per-host status/exit semantics, and OpenCode 2.2.6
  - Known entrypoints and skill paths: `README.md:46-65`, `docs/installation.md:34,52,78,773-816`, `docs/claude-code-install.md:56`, `docs/codex-install.md:90`, `docs/provider-configurations.md:3`, `docs/agent/{cli-installation.md:11-41,architecture.md:16,harness-packaging.md:17,runtime-integrations.md:5,testing.md:456}`
  - Inputs: accepted AC-1..AC-4 results
  - Dependencies: AC-4 accepted
  - Output: documentation edits only
  - Owner: thoth-worker
  - Writes: the listed documentation files
  - Interface boundaries: `.thoth/**` and historical records untouched
  - Focused check and PASS evidence: `rg -n "thoth-mem@latest|2\.2\.5" README.md docs` returns no setup-invocation or minimum-version hits (fixtures describing provider-owned config excluded); `pnpm run check:ci` clean
  - Return milestone: worker result with the search output
  - Stop / reassessment: docs describe behavior not implemented
- [x] AC-6: Local closeout gate
  - Outcome: proportional local gate passes on the final diff
  - Known entrypoints and skill paths: `docs/agent/testing.md` local-closeout gate
  - Inputs: accepted AC-1..AC-5 results
  - Dependencies: AC-5 accepted
  - Output: command results recorded in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build`, and focused Vitest for `src/cli` and `src/harness/provider-boundary.test.ts` all exit 0; the built CLI `install --agent=opencode --dry-run` shows the `thoth-mem@>=0.7.0 setup opencode --plan --json` command and a successful `planned` provider result
  - Return milestone: before requesting final Oracle verification
  - Stop / reassessment: failure unrelated to this change is reported with evidence
- [x] AC-2: Enforce every provider-declared required per-host field (final-verification FAIL repair)
  - Outcome: OpenCode, Pi, Codex and Claude results missing or mistyping any provider-declared required field (e.g. OpenCode `plugin`, `recovered`, `opencodeVersion`, path fields; Pi/native `host`, `source`, `version`, `verification` booleans, `restartRequired`, `diagnostics`) are unsuccessful and never reach ledger recording; declared-optional fields and unknown extras still pass
  - Known entrypoints and skill paths: `src/cli/thoth-mem-install.ts:101-140` (`isProviderSetupResult`), `src/cli/install-completion.ts:114-142`, tests `src/cli/thoth-mem-install.test.ts`, `src/cli/install-completion.test.ts`; provider types in C:/DEV/Proyectos/Webstorm/thoth-mem; skill `tdd`
  - Inputs: final-verification FAIL (Oracle subtask_thoth-oracle_1794157358793_be794c01) and the amended Decisions
  - Dependencies: accepted AC-1..AC-6 working tree
  - Output: per-host required-field validation plus isolated omission/type regressions with no-ledger assertions
  - Owner: thoth-worker
  - Writes: `src/cli/thoth-mem-install.ts`, `src/cli/thoth-mem-install.test.ts`, `src/cli/install-completion.test.ts`
  - Interface boundaries: normalized result shape and consumers unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/cli src/harness/provider-boundary.test.ts`, `pnpm run typecheck`, `pnpm run check:ci` exit 0; live OpenCode dry-run still accepts the published 0.7.0 `planned` result
  - Return milestone: worker result with test output
  - Stop / reassessment: the published provider omits a field its source declares required
- [x] AC-4: Reject malformed OpenCode version metadata before writes (final-verification round 2 FAIL repair)
  - Outcome: the OpenCode version guard accepts exactly the stable versions thoth-mem 0.7 accepts (>=2.2.6, valid SemVer build metadata such as `2.2.6+build.1`) and rejects malformed metadata such as `2.2.6+_`, `2.2.6+..`, `2.2.6+build..1` before any configuration write in install and applied update
  - Known entrypoints and skill paths: `src/cli/system.ts:161-175` (`isSupportedOpenCodeVersion`), `src/cli/install.ts:152-157`, `src/cli/operations/opencode.ts:1953-1963`; provider grammar C:/DEV/Proyectos/Webstorm/thoth-mem/src/setup/opencode.ts:161-174; tests `src/cli/opencode-v2.test.ts`, `src/cli/install.test.ts`, `src/cli/operations/opencode.test.ts`; skill `tdd`
  - Inputs: final-verification round 2 FAIL (Oracle subtask_thoth-oracle_1794157810861_1585ddbe)
  - Dependencies: accepted working tree including the AC-2 required-field repair
  - Output: aligned predicate plus predicate and install/update no-write regressions for the malformed inputs
  - Owner: thoth-worker
  - Writes: `src/cli/system.ts`, `src/cli/opencode-v2.test.ts`, `src/cli/install.test.ts`, `src/cli/operations/opencode.test.ts`
  - Interface boundaries: adapter and documentation unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/cli src/harness/provider-boundary.test.ts`, `pnpm run typecheck`, `pnpm run check:ci` exit 0
  - Return milestone: worker result with test output
  - Stop / reassessment: provider grammar differs from SemVer in a way that requires a product decision

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 (fresh Oracle subtask_thoth-oracle_1794155765941_336fb560): REJECT, recordSha256 626771d821d6f3111fb8f864ab2512dd13639edb5472dd8dbfed49b99db4049a; blockers repaired: Windows verbatim argv transport and the missing `Document the explicit update contract` delta.
Round 2 (fresh Oracle subtask_thoth-oracle_1794155969960_bf62bc7f): OKAY, valid delivered verdict, recordDigest match, recordSha256 71b7ecb27e2b220029fbcc1b3537eb8733d0c3197af8747516f4192dde10803f.
Implementation authorized explicitly by the user on 2026-11-08 after plan-review OKAY.
Final verification round 1 (fresh Oracle subtask_thoth-oracle_1794157358793_be794c01): FAIL, recordSha256 e837c47f5c3936b648f0d636baa808d5f045b05bd56de9b8f60f99a898945f64; AC-2 accepted results missing/mistyping provider-required fields. Repair recorded as an added AC-2 task row.
Final verification round 2 (fresh Oracle subtask_thoth-oracle_1794157810861_1585ddbe): FAIL, recordSha256 6cf235fda77cf772870a6905ba9192439ad75ca451a35e8140ea6641c0452881; AC-2 repair passed, AC-4 guard accepted malformed build metadata. Repair recorded as an added AC-4 task row.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: b66cb17d93f972644e276facc2a39f14bed51e4b98bd6c36e8b53eb175c12d28

Final verification round 3 (fresh Oracle subtask_thoth-oracle_1794158204683_49bf7533): PASS; delivered thoth-gate-verdict valid:true, kind final-verification, mode record, recordDigest match.
Non-blocking residual risks: open-ended `>=0.7.0` selector may meet a future incompatible provider contract (rejected by validation, not fabricated); applied installs not exercised live.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-6 are satisfied. Both prior blocking findings are repaired.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/thoth-mem-07-setup-contract/thoth-mem-07-setup-contract.md",
      "claim": "Independent prefix SHA-256 matches the supplied digest; bundled verify validation passes with current canonical baselines.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "contract-review",
      "locator": "src/cli/thoth-mem-install.ts; thoth-mem/src/setup/{opencode,pi,native-manager}.ts; thoth-mem/src/cli.ts:308-343",
      "claim": "Selector, required per-host field validation, status/exit/mode checks, host matching, bounded failures and evidence preservation agree with the provider contract.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "test-execution",
      "locator": "pnpm vitest run src/cli src/harness/provider-boundary.test.ts",
      "claim": "55 files and 1314 tests passed, including Windows argv transport, malformed evidence, ledger gating, rendering and pre-write version rejection.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "live-dry-run",
      "locator": "node dist/cli/index.js install --agent=opencode --dry-run --no-tui",
      "claim": "Exit 0; quoted selector resolved published thoth-mem 0.7.0 and confirmed its plan. Snapshotted provider/config/receipt/ledger paths remained unchanged; no =0.7.0 file appeared.",
      "basis": "observed",
      "uncertainty": "Mutation verification covers the identified setup paths."
    },
    {
      "id": "E5",
      "kind": "independent-probe",
      "locator": "Source adapter and install-completion in-memory checks using raw published provider stdout",
      "claim": "Actual 0.7.0 planned JSON passed the source parser; six checks covered valid output, mode contradiction, exit 2, wrong host, missing recovered and tolerated extras without ledger writes.",
      "basis": "observed",
      "uncertainty": "The checked-in captured fixture has lossy Windows path literals; this probe used raw current stdout."
    },
    {
      "id": "E6",
      "kind": "version-guard",
      "locator": "src/cli/system.ts:164-175; src/cli/install.ts; src/cli/operations/opencode.ts",
      "claim": "Version grammar exactly matches the provider predicate. Install and applied-update guards precede writes; malformed metadata and unsupported hosts are rejected.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "quality-checks",
      "locator": "pnpm run typecheck; pnpm run check:ci; git diff --check",
      "claim": "All exited 0; check:ci applied no fixes and reported existing warnings/info.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "diff-and-governance-review",
      "locator": "Working-tree diff versus 0f3e81f1; README.md; docs/**; declared durable deltas",
      "claim": "Documentation and durable deltas align with implementation. Ledger, shared npx helper/callers, manifests, lockfile and canonical specs are unchanged. No apparent secrets or material unrelated changes. Diff SHA-256 remained d58ec1e17ebb2339c9f2effbb8a0ac50f973757e436a7adb01d706df08faf30a throughout review.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "supplied-build-evidence",
      "locator": "Assignment build report; dist/cli/index.js; dist/chunk-SEF6PFM6.js",
      "claim": "Root reports build exit 0. Existing built CLI postdates changed production sources, contains the repaired grammar and passed the independent live smoke.",
      "basis": "inferred",
      "uncertainty": "Build was not rerun because it writes generated workspace files."
    }
  ],
  "verification": [
    {
      "check": "Record binding and verification gate",
      "method": "Independent hashing and bundled validate --through verify",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Digest and reviewed baselines match."
    },
    {
      "check": "AC-1",
      "method": "Command review, native Windows test and live dry-run",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E8"],
      "reason": "Literal selector transport works; local Pi bypass and shared helper behavior remain intact."
    },
    {
      "check": "AC-2",
      "method": "Provider-source comparison, failure matrix and raw-output probe",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Required fields and success conditions are enforced; unsuccessful evidence cannot advance the ledger."
    },
    {
      "check": "AC-3",
      "method": "Consumer and finalizer review with rendering/order tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E8"],
      "reason": "Provider evidence is surfaced on success and failure; provider-before-ledger ordering is preserved."
    },
    {
      "check": "AC-4",
      "method": "Exact grammar comparison and install/update no-write regressions",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6"],
      "reason": "Stable >=2.2.6 policy now rejects malformed build metadata before writes."
    },
    {
      "check": "AC-5 and durable deltas",
      "method": "Full documentation diff, stale-contract search and canonical-baseline comparison",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Commands, outcomes and minimum-version guidance are coherent."
    },
    {
      "check": "AC-6",
      "method": "Independent typecheck, check:ci, focused suite and built/source live smoke; reuse supplied build result",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5", "E7", "E9"],
      "reason": "Required checks have passing evidence and live provider plans succeed without observed setup-state mutation."
    },
    {
      "check": "Independent build rerun",
      "method": "Not executed under read-only assignment",
      "outcome": "not-run",
      "evidenceIds": ["E9"],
      "reason": "Build generates workspace files; fresh supplied build evidence was supplemented by artifact inspection and execution."
    }
  ],
  "risks": [
    {
      "description": "The explicitly accepted open-ended selector can encounter future incompatible provider contracts, which structural validation will reject.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E2"]
    },
    {
      "description": "Live applied installs were intentionally not executed; mutation behavior is verified through isolated tests.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root validates this envelope, records PASS, and runs closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/thoth-mem-07-setup-contract/thoth-mem-07-setup-contract.md",
    "reviewedRecordSha256": "b66cb17d93f972644e276facc2a39f14bed51e4b98bd6c36e8b53eb175c12d28"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | thoth-mem-install, npx-command, provider-boundary Vitest incl. Windows-native argv round-trip; live dry-run | THOTH_MEM_PACKAGE_SPEC = 'thoth-mem@>=0.7.0' (src/cli/thoth-mem-install.ts:5), windowsVerbatimArguments on win32 (:164); built CLI `install --agent=opencode --dry-run --no-tui` ran `cmd.exe /d /s /c "npx -y "thoth-mem@>=0.7.0" setup opencode --plan --json"`, resolved published 0.7.0, no `=0.7.0` file created
- AC-2: PASS | thoth-mem-install and install-completion Vitest; live dry-run | per-host matrix tests incl. captured real OpenCode plan JSON; every provider-declared required field per host (thoth-mem src/setup/opencode.ts:33-45, pi.ts:28-40, native-manager.ts:72-86, incl. nested verification booleans) enforced with omission/type regressions and no-ledger assertions after final-verification round 1 FAIL; live provider `planned` exit 0 still accepted
- AC-3: PASS | install, install-completion, operations/* Vitest; live dry-run | provider actions rendered live; Pi finalizer now renders shared provider evidence (root-approved bounded AC-3 extension), ledger untouched
- AC-4: PASS | opencode-v2, install, operations/opencode Vitest | guard mirrors thoth-mem src/setup/opencode.ts:161-174 (optional `opencode `/`v` prefix, stable >=2.2.6, non-empty dot-separated `[0-9A-Za-z-]+` build identifiers); 2.2.5, prerelease, missing, invalid and malformed-metadata (`2.2.6+_`, `2.2.6+..`, `2.2.6+build..1`) hosts rejected before install/update writes after final-verification round 2 FAIL; 2.2.6 and 2.2.6+build.1 accepted
- AC-5: PASS | rg "thoth-mem@latest|2\.2\.5|requires_user_action|manual_actions" README.md docs | only observed-2.2.5 skill-precedence notes (docs/skills-and-mcps.md:33, docs/quick-reference.md:44) and the type-only devDependency pin (docs/agent/runtime-integrations.md:12) remain; docs/quick-reference.md added with root approval
- AC-6: PASS | pnpm run typecheck; pnpm run check:ci; pnpm run build; pnpm vitest run src/cli src/harness/provider-boundary.test.ts; live OpenCode dry-run | all exit 0 after the AC-2 and AC-4 repairs; Vitest 55 files / 1314 tests passed; rebuilt CLI dry-run ran `cmd.exe /d /s /c "npx -y "thoth-mem@>=0.7.0" setup opencode --plan --json"`, resolved published thoth-mem 0.7.0 and confirmed the plan, no `=0.7.0` file; an earlier src/cli/tui/operations.test.ts 5 s timeout (file untouched) passed when rerun
- Source: .thoth/specs/cli-installation/spec.md | sha256:bb528be32c6c593c0c6494fd040fd7e7a09eaa8112912e491012f42523796098
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:d63c17c0deb1521db8982be806ab841c2812568722a95c49f224cc2f87b9f784

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
