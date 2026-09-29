# Change: pi-j0k3r-runtime

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Read-only Explorer mapped the generated Pi root in src/harness/adapters/pi.ts, injected through src/pi.ts; specialist definitions originate in canonical role contracts and src/harness/writers/pi-agent.ts. External runtime dependency belongs to src/cli/pi-install.ts, not package.json or pnpm-lock.yaml. Current settings and child marker target pi-subagents. Initial worktree clean on 0.5.0, ahead 6.

Librarian inspected pi-subagents-j0k3r 1.6.1, gitHead 66f562ef7e15bc3fc1f9136d1b31faf4c20fb214: subagent_run accepts agent/task/context/mode/name/display_name; status/result/cancel accept task_id. Separate background launches allow concurrency and terminal notifications wake the parent. Definitions support effort (including max) and subagent_mode, not incumbent thinking/context fields. Global config is subagents.json. session_resources lean filters extension lifecycle hooks, including before_agent_start; upstream provides no PI_SUBAGENT_CHILD marker. Graceful session shutdown cancels active children, but arbitrary spawned-process cleanup is not proven.

Sources: https://registry.npmjs.org/pi-subagents-j0k3r/1.6.1 and https://github.com/j0k3r-dev-rgl/pi-subagents-j0k3r/tree/66f562ef7e15bc3fc1f9136d1b31faf4c20fb214/src . Static inspection only, not execution proof.

## Intent

Replace the Pi delegation dependency and generated instructions with the supported j0k3r contract while keeping Thoth orchestration policy and other harnesses unchanged. Children belong to the owning Pi session and are not independent persistent jobs.

## Non-goals

No package installation/removal in the operator environment, plugin fork, Atelier integration, workflow engine, custom scheduler, package version bump, provider changes, or cleanup of historical records. Do not silently delete incumbent configuration or user assets.

## Acceptance

- AC-1: Pi root instructions use the actual j0k3r single-agent launch and task-ID lifecycle tools; independent ready tasks launch before collection, terminal notifications replace polling, and cancellation acknowledgement alone is not termination.
- AC-2: Five generated specialists preserve roles, selected model and effort including max, tool boundaries and fresh assignments using j0k3r-supported definition fields; lean resources prevent root-hook injection without pretending there is a native child marker or sandbox.
- AC-3: Installer/status require npm:pi-subagents-j0k3r@>=1.6.1 and supported subagents.json settings, preserve unrelated settings, and block an incumbent pi-subagents conflict with manual removal guidance before mutation. No actual operator installation occurs during this work.
- AC-4: Maintained docs/specs and generated Pi assets agree; focused tests and applicable package checks pass, other harness artifacts retain their behavior, and final independent review reports any untested live-runtime limits.

## Clarifications

- RESOLVED: User explicitly includes the external plugin dependency in scope and owns actual uninstall/install.
- RESOLVED: User rejects children surviving closure of the owning Pi session; background concurrency while it remains open is allowed.
- RESOLVED: Use validated j0k3r 1.6.1 as minimum external package floor, following existing minimum-range installer convention. Do not lower or invent a Pi compatibility guarantee from wildcard peers.
- RESOLVED: Keep manual conflict recovery; never auto-remove the incumbent plugin or unrelated settings.

## Decisions

- Use public native tools, not incumbent subagent workflow APIs or a Thoth executor.
- Configure session_resources lean and disabled continuation using the validated upstream contract; preserve stronger role restrictions where native support exists and state instruction-only restrictions honestly.
- Treat lean as hook isolation, not process identity. Verify extension activation-time side effects as well as before_agent_start filtering before implementation acceptance; stop if testing reveals an isolation defect rather than invent a process-global child flag.
- Root owns record and decisions. One implementation owner owns the coupled Pi adapter/runtime/installer migration to avoid overlapping writes. Independent Oracle owns final read-only review.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Native lifecycle translation** — Pi root guidance MUST use one direct subagent_run with explicit canonical agent, bounded task and task/background mode per fresh assignment, and native status/result/cancel or supported live messaging only for a known task ID. Queued delivery, nonterminal state and cancellation requests MUST NOT prove termination or acceptance. New objectives, phases, mutable surfaces and independent judgments MUST receive fresh assignments. Thoth MUST NOT use subagent orchestration APIs or claim instruction-only policy is runtime enforcement. Terminal notifications drive collection without polling; children MUST remain scoped to the parent Pi lifetime.
  - GIVEN independent bounded assignments and j0k3r; WHEN root delegates; THEN separate background launches precede collection and fresh terminal evidence governs acceptance.
- `MODIFIED multi-harness-agent-pack` **Use the strongest truthful native role selector** — The Pi adapter MUST require the public agent field with one exact canonical specialist name through subagent_run and MUST NOT use batch orchestration, implicit role inference, or a different harness's selector as evidence of native support. It MUST NOT invent async or fresh-context parameters from another runtime.
  - GIVEN a known specialist assignment; WHEN Pi delegates; THEN it uses the supported explicit agent selector and actual j0k3r schema.
- `MODIFIED multi-harness-agent-pack` **Preserve native plugin-manager ownership** — Pi installation MUST install and verify the exact executing thoth-agents package through pi install before installing the selected compatible pi-subagents-j0k3r@>=1.6.1 and research packages; MUST treat one schema-validated thoth-agents Pi-package receipt as the sole authority for replacing or removing an existing global first-party source; MUST reject an unowned, ambiguous, project-local, or receipt-inconsistent first-party source before mutation; and MUST use external packages' public native surfaces without vendoring, patching, copying their internals, or reimplementing execution, concurrency, task/history, research, or provider lifecycle. A configured incumbent pi-subagents MUST block before mutation with manual recovery, never automatic removal. Dry-run MUST mutate nothing; first-party verification failure MUST block downstream steps; replacement failure MUST restore and verify the prior receipt-bound source and report compensation failure. Packed contents MUST remain thoth-owned assets and external package references, and non-Pi installation/runtime behavior MUST remain unchanged.
  - GIVEN incumbent pi-subagents is configured; WHEN installation is attempted; THEN setup blocks before mutation without deleting the operator's runtime.
- `MODIFIED multi-harness-agent-pack` **Preserve the six-role contract** — The native Pi package MUST derive one ambient orchestrator root and the five explorer, librarian, oracle, designer, and worker specialists from the canonical role contracts, MUST NOT create an orchestrator child definition, and MUST preserve role prompts, model/effort metadata where Pi supports them (including max through j0k3r effort), memory envelopes, ownership, and return contracts. The retired quick/deep writer tier MUST NOT remain an active role or alias. Root lifecycle injection MUST provide exactly one current adaptive-root contract without duplicate APPEND_SYSTEM.md persistence. Five owned skills MUST resolve from the package manifest without copied global duplicates. Specialist synchronization MUST make exactly five attributable definitions discoverable for j0k3r and preserve/report unowned canonical conflicts instead of overwriting them. No native child identity marker may be invented.
  - GIVEN generated specialists and lean child resources; WHEN a child executes; THEN its role and model/effort contract remain intact without root prompt injection.
- `MODIFIED multi-harness-agent-pack` **Keep role permissions explicit** — The Pi extension and specialist definitions MUST apply the strongest native root and child tool controls available while stating that extension execution, root injection, resource materialization, process credentials, filesystem, and network access remain within the invoking user's privileges and are not an OS sandbox. Current role restrictions MUST be reported as instruction-level rather than unverified allowlist enforcement. Global j0k3r configuration MUST request lean child resources and disabled continuation, preserving unrelated keys; project overrides can supersede global lean and full child resources are unsupported. Root-only lifecycle injection and synchronization MUST remain absent from lean children, while normal root injection remains singular and package skills remain manifest-discovered. Unowned specialist conflicts MUST be preserved/reported. Packed contents MUST remain thoth-owned without external implementations or provider assets, and non-Pi behavior MUST remain unchanged. Obsolete pi-subagents definition and builtin-disablement settings MUST NOT be presented as active j0k3r controls.
  - GIVEN supported j0k3r configuration; WHEN definitions and guidance are generated; THEN no unsupported control is claimed as enforced.
- `MODIFIED multi-harness-agent-pack` **Publish a native Pi package with runtime-autonomous assets** — The published thoth-agents npm artifact MUST identify as a Pi package, MUST declare exactly one compiled native extension and the five packaged thoth-owned workflow skills through supported Pi manifest fields, MUST ship the five canonical specialist resources, and MUST remain usable from its installed package root without invoking the thoth-agents CLI or network during ordinary Pi runtime. Exactly five attributable specialists MUST be discoverable globally for j0k3r; unowned canonical conflicts MUST be preserved/reported. Root injection MUST remain singular without persistent duplicate APPEND_SYSTEM.md, and manifest skills MUST not acquire global copies. Installation MUST verify the exact first-party package before downstream work, preserve zero-mutation preview, block unowned replacement and all downstream work on first-party failure, and restore/verify receipt-bound prior source and path on failed replacement. Explicit normalized local-package-root installation MUST match executing identity/version, verify Pi canonical source and resolved path, complete downstream packages/skills/ledger, omit provider setup and print separate local provider-install guidance.
  - GIVEN a built package; WHEN Pi assets are verified; THEN five j0k3r-compatible definitions ship without copied external implementation.
- `MODIFIED multi-harness-agent-pack` **Distinguish capability gaps from generation failure** — Pi capability reporting MUST independently identify first-party package state as missing, conflicting, configured, loadable, observed-at-install, unobserved, or unavailable; MUST reserve observed-at-install for a real Pi subprocess whose final provider request contains exactly one current root marker for the receipt's exact source and manifest/extension digests; and MUST independently report packaged-skill discovery, specialist materialization, delegation, research, external credentials, provider setup, and unsupported security or lifecycle guarantees. Direct native-package activation with missing external dependencies MUST degrade truthfully without crashing or claiming complete installation. Delegation reporting MUST describe j0k3r, lean resource requirements, project override limits and unproven forced-exit cleanup truthfully. Update MUST preserve specialist discovery and unrelated operator content while removing only attributable legacy root/skill copies. Status MUST report each layer independently without advancing or inferring the last-complete ledger. Incomplete/conflicting Sync or Update MUST return bounded repair/manual guidance without harness fallback. Native root injection, package skill discovery, five attributable specialist definitions and external/provider ownership MUST remain intact; non-Pi behavior MUST remain unchanged.
  - GIVEN missing or conflicting delegation runtime; WHEN status is requested; THEN it reports bounded actionable state without inventing complete installation or live execution proof.

## Plan

1. Add failing focused regressions for tool guidance, definition effort/mode, config path/merge, dependency and reversed conflict detection. Check src/cli/pi-model-config.ts callers and src/cli/pi-resources.ts override preservation for generated frontmatter coupling. Cover legacy thinking to effort conversion and edit → sync → reread preservation, including max and inheritance.
2. Change canonical Pi adapter/writer/runtime and CLI config/install/status surfaces together. Preserve receipt handling and unrelated keys. Replace incumbent-marker assumptions with proven lean lifecycle behavior, testing extension activation effects separately. If evidence reveals a material upstream limitation, stop and reopen clarification.
3. Regenerate owned Pi artifacts using existing integration scripts; update routed/public installation documentation. Keep shared role and non-Pi changes limited to necessary truthful references. Durable spec updates occur only during verified closeout.
4. Simplify changed code, inspect diff, and run focused tests followed by check:ci, typecheck, build, test in the applicable order; run integration:verify and verify:pi-package where available. Do not use operator installation as a test.
5. Fresh Oracle reviews actual diff, agreement and results. Root fixes findings, revalidates invalidated checks and archives only after independent PASS and validated durable deltas.

## Tasks

- [x] AC-1: Test and replace Pi native delegation guidance with exact j0k3r calls, notifications and cancellation semantics.
- [x] AC-2: Test and migrate specialist fields and root/child isolation assumptions, including model-panel round trips and max effort preservation.
- [x] AC-3: Test and migrate external dependency, config target/merges, conflict preflight and status without touching operator state.
- [x] AC-4: Regenerate owned assets, update maintained docs, simplify and run focused/package/regression checks. Final independent judgment and archive disposition are tracked below.

## Authorization

**Plan review**: OKAY
**Implementation**: AUTHORIZED

User selected fresh Oracle review; thoth-oracle run 8d1e8f81-7df7-4c8a-b248-fd3e16e8e2d5 returned [OKAY] without blockers. Its model-override and activation-test cautions were incorporated. User then separately selected Implementar (Recommended). Operator retains actual plugin uninstall/install.

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS

Fresh thoth-oracle e675ba48-f02c-4907-b58a-1882248e2b6f verified both earlier blockers repaired, actual diff and durable obligations; independently checked syntax, whitespace, ready validation and record/baseline hashes. Reused frozen-input test/build/package evidence. Archive eligible with disclosed lean/project-override, instruction-only control, forced-exit and telemetry-format limitations. Fresh read-only metadata attestation by thoth-oracle 9d7ad991-c268-45a1-ae4b-54d04fcc6fa5 returned PASS, confirmed the normalized prefix and canonical baseline hashes, and passed closeout without errors or warnings; archive eligible.
**Reviewed record SHA-256**: fe7d4ff6924246531b2802b1912b3dfe2dabeff1f08fb7d3b1dd4d1aa266edd8

- AC-1: PASS | prompt/adapter and full regression tests | Full suite 1060/1060 passed with inherited CODEX_HOME removed only from test subprocess; task bf94793dd.
- AC-2: PASS | writer/runtime/model/resources tests | Full suite passed; lean filtering tested with activation separately; no live j0k3r smoke performed. Role restrictions remain instruction-level.
- AC-3: PASS | installer/path/operations tests | Full suite passed; no operator-home install/uninstall. Project-local configuration can override global lean; full child resource mode is unsupported.
- AC-4: PASS | consolidated validation and isolated package verification | Source-scoped Biome 263 files, typecheck and build passed (b1264a173); full suite 98 files/1060 tests and integration:verify 12 tests passed (bf94793dd). Global check:ci fails on unrelated .pi/tasks telemetry JSON formatting. After fixing stale package fields and Windows executable resolution, npm run verify:pi-package passed including npm pack/install and Pi invocations in an isolated temporary home (worker 00d270d6-0adb-4065-a520-6698945043b8); node --check, targeted Biome and git diff --check passed. No live j0k3r delegation smoke claimed. Windows verification resolves quoted %~dp0 JavaScript targets from installed .cmd shims and fails explicitly for unsupported shim layouts. Root simplify review retained direct merge/ownership logic without additional abstraction; generated changes restricted to Pi.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:c51e0cbfdb7183ac72d62921f46bdf82939ce278ed3ae524c195cfac0a7931e4

## Closeout

**Archive**: READY
