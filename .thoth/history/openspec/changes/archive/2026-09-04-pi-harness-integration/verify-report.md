# Verification Report: Pi Harness Integration

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS. Every accepted buildable requirement is represented;
  the real-runtime gaps are truthfully retained as SC-008/SC-009 outcome risks.
- **Correctness**: PASS. V-001, V-002, and V-003 are closed with adversarial
  implementation evidence.
- **Coherence**: PASS. Spec, plan, tasks, implementation, tests, documentation,
  constitution, and generated output agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Four-harness registries, parser, CLI/TUI, and dispatch are exhaustive. | Focused Pi registry and dispatch tests. | PASS |
| FR-002 | Pi renderer derives one ambient root and six canonical specialists. | Pi writer and adapter tests. | PASS |
| FR-003 | Managed root, agents, skills, idempotency, and conflicts are explicit. | Pi installer and path fixture tests. | PASS |
| FR-004 | Delegation package uses an exact pinned Pi source and native tools. | Exact-source adversarial installer tests. | PASS |
| FR-005 | Generated root guidance maps native run, collection, steering, cancel, and continuation. | Prompt-dialect lifecycle tests. | PASS |
| FR-006 | Delegation requires one exact canonical agent selector. | Prompt and adapter contract tests. | PASS |
| FR-007 | Capability reporting separates supported, conditional, degraded, and unsupported states. | Pi adapter and operation-status tests. | PASS |
| FR-008 | Native allowlists and system-permission security boundaries are documented. | Pi agent writer and adapter tests. | PASS |
| FR-009 | Install preflights and orders packages, MCP, owned assets, skills, provider, and ledger. | Installer sequencing and failure-injection tests. | PASS |
| FR-010 | Pi invokes provider-owned setup and accepts only consistent completion. | thoth-mem setup command and evidence tests. | PASS |
| FR-011 | Applied Pi Update reuses the complete installation path. | Pi operation Install and Update tests. | PASS |
| FR-012 | Pi has an independent schema-v1 last-complete ledger record. | Version-ledger tests. | PASS |
| FR-013 | Status keeps ledger authority separate from observed native state. | Pi drift and status tests. | PASS |
| FR-014 | Specialist model operations validate six supported efforts plus inheritance. | Direct operation and CLI rejection tests. | PASS |
| FR-015 | Pi requires the same four external execution skills. | Shared skill inventory tests. | PASS |
| FR-016 | External skills use the concrete global copied Pi selector and detect root mismatch. | Skill command and custom-directory tests. | PASS |
| FR-017 | Five thoth-owned skills synchronize to Pi native global discovery. | Owned-skill install and sync-preview tests. | PASS |
| FR-018 | Active metadata, CI, skills, and docs require Node 22.19 or newer. | Runtime-floor scan and regression tests. | PASS |
| FR-019 | Public guidance covers Pi setup, ownership, security, credentials, operations, and recovery. | Routed documentation inspection and tests. | PASS |
| FR-020 | Exact Context7, Exa, and MCP adapter pins plus independent runtime states are implemented. | Package, MCP merge, and provider-state tests. | PASS |
| SC-001 `[buildable]` | Pi resolves through all exhaustive harness and operation paths. | Focused parser, CLI, TUI, registry, and dispatch suite. | PASS |
| SC-002 `[buildable]` | Dry-run is nonmutating and injected failures prevent ledger advancement. | Pi installer fixture tests. | PASS |
| SC-003 `[buildable]` | Output contains one managed root and exactly six deterministic specialists. | Pi renderer and install tests. | PASS |
| SC-004 `[buildable]` | Native lifecycle, concurrency, fan-in, and capability contracts are covered. | Prompt and adapter lifecycle tests. | PASS |
| SC-005 `[buildable]` | Exact packages, grep config, skills, provider setup, and ordering are asserted. | Exact-source and sequencing tests. | PASS |
| SC-006 `[buildable]` | Active Node floor is consistent and older claims are absent. | Runtime-floor tests and repository scan. | PASS |
| SC-007 `[buildable]` | Existing harnesses, build output, integration artifacts, and full suite remain sound. | Check, typecheck, build, 1,096 tests, and integration verification. | PASS |
| SC-008 `[outcome]` | Real Pi discovery passed; exact package installation stalled before lifecycle observation. | Isolated Windows Pi smoke timed out after 120 seconds without mocked success. | RISK |
| SC-009 `[outcome]` | Managed research contracts pass; real registrations remained blocked by the same package stall. | Isolated Windows Pi research smoke with explicit external blocker. | RISK |

## Verification evidence

- Fresh Oracle convergence suite: 5 files and 69 tests passed.
- Independent V-001 probes accepted exact/multiline-exact evidence and rejected
  name-only, wrong-version, and malformed evidence.
- Independent V-002 probes accepted six Pi efforts plus inheritance and rejected
  unsupported or catalog-unavailable values before apply.
- Independent V-003 probes surfaced all five runtime states independently while
  aggregate and ledger states remained unchanged; inferred readiness explicitly
  states that no live probe was requested.
- `pnpm run check:ci`: PASS, 253 files.
- `pnpm run typecheck`: PASS.
- `pnpm run build`: PASS.
- `pnpm test`: PASS, 89 files and 1,096 tests.
- `pnpm run integration:verify`: PASS, 2 files and 12 tests.
- `git diff --check`, generated-output review, changed-file secret scan, and SDD
  validation through tasks: PASS.

## Findings

- Stable findings: V-001, V-002, and V-003 are closed.
- No open CRITICAL findings remain.

## Residual risks

- SC-008: foreground/background Pi lifecycle remains externally unobserved
  because exact package installation stalled beyond 120 seconds; repeat the
  isolated smoke when Pi package installation completes normally.
- SC-009: the two Context7 tools, an Exa tool, and adapter-backed
  `searchGitHub` remain externally unobserved.
- The isolated smoke directory
  `C:\Users\EremesNG\AppData\Local\Temp\thoth-pi-smoke-c46a925bca014a5da66cca5140a392fa`
  remains because host policy rejected cleanup; the real Pi home was untouched.

## Oracle verification round 1 — Superseded

### Review dimensions

- **Completeness**: The integration is broadly complete, but FR-020 does not yet
  represent Context7, Exa, and grep.app runtime states independently (V-003).
- **Correctness**: Package verification accepts the expected package name at the
  wrong version (V-001), and the operation boundary accepts unsupported Pi
  effort values (V-002).
- **Coherence**: Rendering, paths, delegation, installation order, provider and
  ledger gates, documentation, Node floor, and existing-harness behavior agree;
  the three findings below are the remaining artifact/code gaps.

### Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/harness/types.ts`, `src/harness/registry.ts`, parser and dispatch tests | Focused Oracle suite | PASS |
| FR-002 | `src/harness/adapters/pi.ts`, `src/harness/writers/pi-agent.ts` | Renderer tests | PASS |
| FR-003 | Managed root/agents, conflict scans, backups, global `agents/` and `subagents/` paths | Installer/path tests | PASS |
| FR-004 | Exact install sources are pinned, but verification accepts name-only evidence | Wrong-version Oracle probe | FAIL (V-001) |
| FR-005 | `src/agents/prompt-dialects.ts` lifecycle translation | Prompt tests | PASS |
| FR-006 | Exact single `agent` selector and batch prohibition | Prompt tests | PASS |
| FR-007 | Pi capability matrix and diagnostics | Adapter tests | PASS |
| FR-008 | Role allowlists and security disclosures; librarian exposes Context7, Exa, and `mcp` | Writer/adapter tests | PASS |
| FR-009 | Ordered package, MCP, root, agents, skills, provider, ledger flow | Installer tests plus V-001 probe | FAIL (V-001) |
| FR-010 | Consistent provider-complete gate | Provider/install tests | PASS |
| FR-011 | Install and Update share the complete Pi path | Operation tests | PASS |
| FR-012 | Independent schema-v1 Pi ledger entry | Ledger tests | PASS |
| FR-013 | Ledger authority remains separate from observed Pi state | Operation/ledger tests | PASS |
| FR-014 | CLI/TUI specialist model flow exists, but direct operation input accepts `ultra` | Oracle effort probe | FAIL (V-002) |
| FR-015 | Shared four-skill inventory | Skill/install tests | PASS |
| FR-016 | Pi global copied skill command and custom-root blocker | Skill/path tests | PASS |
| FR-017 | Five thoth-owned skills under the Pi global root | Owned-skill tests | PASS |
| FR-018 | Node `>=22.19` and pnpm `11.2.2` across active surfaces | Runtime scan/tests | PASS |
| FR-019 | Public Pi install, ownership, security, credentials, and recovery guidance | Documentation inspection | PASS |
| FR-020 | Pins and proxy-only grep config exist; exact versions and independent runtime states are incomplete | Oracle probes/status inspection | FAIL (V-001, V-003) |
| SC-001 `[buildable]` | Exhaustive registry/parser/CLI/TUI/operation coverage | Focused Oracle suite | PASS |
| SC-002 `[buildable]` | Dry-run and injected-failure coverage | Installer tests | PASS |
| SC-003 `[buildable]` | One root and six deterministic specialists | Renderer/install tests | PASS |
| SC-004 `[buildable]` | Lifecycle, concurrency, fan-in, and capability contracts | Prompt/adapter tests | PASS |
| SC-005 `[buildable]` | Exact commands are tested, but verification is not version-exact | Wrong-version Oracle probe | FAIL (V-001) |
| SC-006 `[buildable]` | Active Node-floor scan | Runtime tests | PASS |
| SC-007 `[buildable]` | Style, types, build, full tests, integration verification, diff check | Root and Oracle command evidence | PASS |
| SC-008 `[outcome]` | Isolated Pi install stalled before lifecycle smoke; no mocked success substituted | Windows Pi smoke | RISK |
| SC-009 `[outcome]` | Research registrations were not observable after the package-install stall | Windows Pi smoke | RISK; V-003 actionable |

### Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| V-001 | Critical | Correctness | `src/cli/pi-install.ts` verifies only `packageName`; a wrong-version probe succeeded for `@0.0.1` listings. | Require `pi list` evidence matching each exact planned source/version and add wrong-version/malformed-list tests. |
| V-002 | Critical | Correctness | `src/cli/operations/pi.ts` accepts and writes arbitrary effort strings; `ultra` produced an applicable plan. | Enforce `off|minimal|low|medium|high|xhigh|inherit` at the operation boundary and add direct/CLI tests. |
| V-003 | Major | Completeness/coherence | Pi status reports package/config health and an Exa credential warning, not independent provider-runtime states. | Add explicit Context7, Exa, and grep.app status entries that separate managed health from credential, remote, and schema availability. |

### Commands and stable findings

- Oracle focused suite: 12 files and 98 tests passed.
- Root suite: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`,
  `pnpm test` (89 files, 1,090 tests), `pnpm run integration:verify`, and
  `git diff --check` passed.
- Correct Pi global/project discovery paths, root/six-specialist rendering,
  lifecycle guidance, librarian tool allowlist, setup ordering, dry-run purity,
  conflict handling, backups, provider/ledger gates, Node floor, generated
  output, existing-harness regression behavior, and secret scan are sound.

### Residual risks

- SC-008: Pi `0.84.4` resource discovery worked, but installation of
  `pi-subagents-j0k3r@1.5.9` exceeded 120 seconds; foreground/background
  lifecycle remains unobserved.
- SC-009: Context7's two tools, Exa registration, and adapter-backed grep.app
  `searchGitHub` were not observed because package installation did not finish.
- The isolated smoke directory
  `C:\Users\EremesNG\AppData\Local\Temp\thoth-pi-smoke-c46a925bca014a5da66cca5140a392fa`
  remains because host policy rejected cleanup; the real Pi home was untouched.
