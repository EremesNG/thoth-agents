# Change: codex-plugin-native-hooks

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: high

## Exploration

Current Codex integration (verified 2026-10-16, Codex CLI 0.162.1):

- Plugin bundle `plugin/.codex-plugin/plugin.json` ships five owned skills and MCP (`codex.mcp.json`) only; package inputs at `src/harness/adapters/codex.ts:358`. A tested but dormant hook writer exists in `src/harness/writers/codex-plugin-package.ts:136-184`.
- Out-of-plugin writes by the CLI (`src/cli/install.ts:599-650`, `src/cli/codex-install.ts`): managed root block in `~/.codex/AGENTS.md` (`src/harness/adapters/codex.ts:162-177`), five full-prompt agent TOMLs in `~/.codex/agents/` (`src/harness/adapters/codex.ts:217-246`), managed-models state, `features.default_mode_request_user_input` in `config.toml` (`src/cli/codex-config-io.ts:364-437`), external skills, install ledger. No Codex uninstall or doctor exists (`src/cli/operations/codex.ts:107-164`).
- Codex dialect uses multi-agent V2 tools (`src/agents/prompt-dialects.ts:179-210`, `src/harness/adapters/codex.ts:120-133`). Shared rendered lifecycle text requires a fresh session for every new work unit (`src/agents/prompt-sections.ts:203-208`, `src/harness/core/agent-pack.ts:387-391`).
- Hook validation allowlists in `src/harness/adapters/codex-surfaces.ts:25-73,518-581` reject `SubagentStart` and accept only `message` output; the hook writer drops `commandWindows` and `additionalContextLimit` (plan-review probe).
- Codex root prompt cap is 13,800 characters (`src/agents/prompt-rendering.test.ts:909-917`); current root renders 13,548 characters (252 headroom).
- Install-recovery fingerprints (`src/cli/codex-install.ts:547-577,752-768`) are ephemeral and deleted after success; managed-model state (`src/cli/managed-state-io.ts:53-59`) holds no durable file digests.

External evidence (docs + `openai/codex` rust-v0.162.1 source):

- Codex plugin manifest accepts skills, MCP, apps and hooks; no agents or root-instruction field (`codex-rs/plugin/src/manifest.rs`; openai/codex #18308, #36855 open). "Plugin Extensions" are ChatGPT MCP/UI extensions, not relevant.
- Trusted plugin hooks: `SessionStart` (startup/resume/clear/compact/fork) and `SubagentStart` (`agent_type` = requested role) inject developer context; handler `additionalContextLimit: 0` disables the ~2,500-token spill.
- Trust hash = `sha256:` over sorted-JSON normalized single-handler declaration (`hooks/src/engine/discovery.rs`, `config/src/fingerprint.rs`); key `<plugin_id>:hooks/hooks.json:<event>:<group>:<handler>` under `[hooks.state]` in user `config.toml`; payload files and plugin version are not hashed. Untrusted hooks are skipped silently. Plan review reproduced all five Codex-written `trusted_hash` values for thoth-mem from `C:/DEV/Proyectos/Webstorm/thoth-mem/plugin/hooks/hooks.json` (not its `integrations/codex` copy), e.g. SessionStart `sha256:1bac29436e9f8bf8113d01c6a93c8a436c706631d038569f8e849c9d9bb06d35`.
- Multi-agent V2: default 4 total threads incl. root; no `close_agent`; terminal children evicted lazily; capacity configured by `agents.max_concurrent_threads_per_session` (children, +1 root), fixed per session. Known slot-leak issues #32353, #34518.
- Config profiles are CLI-only (app-server rejects `--profile`; #38104), so not usable for Desktop.

Spikes (isolated `CODEX_HOME`, real home untouched; reports in `%TEMP%\thoth-codex-spike*\REPORT.md`):

- SessionStart injection works on startup and resume; spill files are unreadable under read-only sandbox, `additionalContextLimit: 0` injects fully.
- On Windows hooks run under PowerShell; `%PLUGIN_ROOT%` fails. Portable command passing in both `command` and `commandWindows`: `node -e "require(require('path').join(process.env.PLUGIN_ROOT,'hooks','context.cjs'))"`.
- Thin TOML (one-line `developer_instructions`, `sandbox_mode = "read-only"`) + `SubagentStart` matcher delivered the role context; write was blocked. Undefined roles are rejected (`unknown agent_type`), so TOMLs remain required.
- `spawn_agent` with `fork_turns: "none"` keeps parent SessionStart context out of the child; `followup_task` reuse keeps role context and SubagentStart fires once per child.

Peer practice: gentle-ai (main 4acaf424) keeps the orchestrator in `AGENTS.md`, defines roles in prompt without TOMLs, reuses idle children via `followup_task`, sets `agents.max_threads = 4`; it hit the same `agent thread limit reached` (#3117). Spec Kit and oh-my-codex use ownership-aware cleanup.

## Intent

Make the Codex integration as plugin-native as Codex allows: the plugin delivers the orchestrator and all role prompts through trusted hooks, the CLI keeps only the irreducible global surfaces (thin agent TOMLs, two config keys, consented hook trust), Codex delegation is made robust against V2 thread-capacity exhaustion, and Codex gains `uninstall` and `doctor` that remove or diagnose exactly what thoth-agents owns.

## Non-goals

- Shipping agent roles inside the plugin (unsupported by Codex until #18308/#36855 land).
- Codex config profiles or `CODEX_HOME` switching.
- Changing OpenCode, Claude Code or Pi behavior, or the canonical fresh-delegation policy outside Codex.
- Changing thoth-mem provider setup or its hooks.
- Supporting Codex versions older than the verified 0.162.1 contract; ChatGPT MCP UI extensions.

## Acceptance

- AC-1: The generated Codex plugin ships Codex-only hook declarations at `codex-hooks/hooks.json`, referenced explicitly by the Codex manifest `hooks` field and outside Claude Code's default `hooks/hooks.json` discovery, with a `SessionStart` handler (matcher `startup|resume|clear|compact`) that injects the canonical Codex root prompt and a `SubagentStart` handler that injects the canonical role prompt for each of the five thoth roles by `agent_type`; handlers use the portable `node -e` loader in both `command` and `commandWindows`, set `additionalContextLimit: 0`, contain no machine-specific paths, and read prompts from plugin payload files generated from canonical sources.
- AC-2: Codex install, update and sync no longer write the root block to `~/.codex/AGENTS.md`; update/sync remove an existing thoth-managed block and preserve all other content byte-for-byte. Before removing the legacy root block or replacing full agent TOMLs, the CLI verifies that the installed `thoth-agents@thoth-plugins` plugin is enabled and hook-capable (installed bundle contains `codex-hooks/hooks.json`, `codex-hooks/context.cjs` and all six payloads); if not, sync fails without changing any legacy prompt surface and directs the operator to `update`, and install/update perform the plugin step first and then apply the same check. Hook-trust consent is not part of this prerequisite.
- AC-3: Generated Codex agent TOMLs are thin: `name`, `description`, a one-line `developer_instructions` stating that role instructions arrive as developer context, `model`, optional `model_reasoning_effort`, and role `sandbox_mode`; operator model/effort preservation keeps working.
- AC-4: The Codex root dialect requires `fork_turns: "none"`, bounds parallel spawns by free native capacity, permits `followup_task` reuse of a completed child only for the same role with unchanged objective, SDD phase and mutable surface (or read-only work) when no independent judgment is required, keeps every Oracle plan review and verification on a fresh child, forbids `send_message` to completed children, and on `agent thread limit reached` inspects `list_agents` and reports truthfully; the Codex root payload stays within the 13,800-character cap and other harnesses' rendered prompts are unchanged.
- AC-5: Codex install/update writes `agents.max_concurrent_threads_per_session = 6` preserving unrelated config text and recording the prior value; with explicit consent (interactive confirmation or `--trust-hooks`) it writes `[hooks.state]` `trusted_hash` entries for the plugin hooks computed with the Codex 0.162.1 algorithm (golden fixture from a Codex-generated hash); without consent it writes none and tells the user to trust hooks in Codex; dry-run reports both without mutation.
- AC-6: `thoth-agents uninstall --agent=codex` removes only thoth-owned surfaces (fingerprinted agent TOMLs, managed state files, any legacy `AGENTS.md` block, our `hooks.state` entries, the threads key restored to its recorded prior value) and uninstalls the plugin through the native manager; `doctor --agent=codex` reports plugin presence, hook trust (trusted/untrusted/modified), Node on PATH, TOML drift, threads setting and legacy `AGENTS.md` leftovers, each with an actionable fix.
- AC-7: `docs/codex-install.md`, `docs/agent/harness-packaging.md` and the canonical specs reflect the new surfaces, trust consent and lifecycle.
- AC-8: Manual Codex Desktop (Windows) validation by the user confirms hook trust, root injection and role injection for at least one read-only and one writing role.

## Clarifications

- Roles: thin TOMLs + `SubagentStart` (user choice over no-TOML gentle-ai style) to keep native per-role sandbox.
- Reuse: allowed for same role, same objective, no independent judgment; Oracle always fresh (user choice). Reuse is further bounded to the same SDD phase and the same mutable surface (or read-only work), so `Fresh delegation at work boundaries` keeps full force and only `Bounded continuation exception` changes.
- Lifecycle: uninstall and doctor are in scope (user choice).
- Threads: write `agents.max_concurrent_threads_per_session = 6` with reversal on uninstall (user choice).
- Hook trust: auto-trust only with explicit install-time consent; doctor verifies hash match (user choice). No pre-existing auto-trust flow exists in any branch.
- Desktop manual validation is an acceptance gate (user choice).

## Decisions

- Keep `.codex-plugin/plugin.json` compatibility manifest; migrating to root `plugin.json` (Agent Plugins 1.0.0) is deferred because it replaces rather than merges the OpenAI extension overlay and is not required for hooks.
- `hooks.json` declarations stay stable across releases; prompt updates ship as payload files so existing trust remains valid (trust covers declarations only).
- Codex hook artifacts live under `plugin/codex-hooks/` (declarations `codex-hooks/hooks.json`, script `codex-hooks/context.cjs`, payloads `codex-hooks/payloads/`), referenced by `.codex-plugin/plugin.json` `"hooks": "./codex-hooks/hooks.json"`, because the shared `plugin/` root is also a Claude Code plugin and Claude auto-discovers `hooks/hooks.json` (and provides `CLAUDE_PLUGIN_ROOT`, not `PLUGIN_ROOT`). Trust keys are therefore `thoth-agents@thoth-plugins:codex-hooks/hooks.json:<event>:<group>:<handler>`. The loader path becomes `path.join(process.env.PLUGIN_ROOT,'codex-hooks','context.cjs')`.
- One hook script `codex-hooks/context.cjs` serves both events; it selects payload by `hook_event_name` and `agent_type`, emits `hookSpecificOutput.additionalContext`, and emits nothing for unknown roles.
- Each role payload states that it supersedes inherited orchestrator context, as defence in depth if a full-history fork occurs.
- Node on PATH is a documented runtime requirement (already required by the CLI).
- The Codex trust-hash implementation is version-coupled; doctor treats mismatch as `modified` and directs the user to Codex's native review.
- Capacity: 6 children configured; prompt still bounds by observed capacity because the limiter is fixed per session.
- Codex lifecycle wording is rendered through a Codex-only seam in the shared prompt sections/agent pack; other harnesses' rendered text stays byte-identical.
- Durable ownership: install records the SHA-256 of each last-written thoth TOML (`roleDigests`), a structural SHA-256 with `model`/`model_reasoning_effort` lines removed (`roleStructureDigests`, so operator model/effort-only edits remain owned and preserved by managed-model rules), and the prior threads value in managed state; uninstall and migration remove only files whose current digest matches a recorded or known legacy rendered digest, otherwise preserve and report. The recorded prior threads value is captured once and kept across updates; an operator-changed threads value is preserved and reported.
- Installer-related files and tests are serialized: AC-5 starts after AC-3.
- Migration prerequisite: `src/cli/operations/codex.ts:658-725,1005-1048` builds a native plugin plan only for install/update, while sync applies only global setup. A shared hook-capability check (enabled plugin + installed `codex-hooks` artifacts under the plugin cache) gates every legacy prompt-surface replacement.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Deliver Codex orchestration through plugin hooks** — The Codex plugin MUST deliver the ambient root prompt through a `SessionStart` hook and each specialist role prompt through a `SubagentStart` hook keyed by `agent_type`, using shell-independent commands, unlimited additional-context size and payload files generated from canonical prompts; the CLI MUST NOT write root instructions to `~/.codex/AGENTS.md` and MUST write only thin agent TOMLs carrying name, description, a pointer instruction, model/effort and sandbox.
  - GIVEN a trusted thoth-agents Codex plugin and thin agent TOMLs; WHEN a Codex session starts and spawns `thoth-agents-oracle`; THEN the root receives the orchestrator prompt as developer context, the child receives the Oracle role prompt as developer context, and no thoth content exists in `~/.codex/AGENTS.md`.
- `MODIFIED multi-harness-agent-pack` **Generate the shared plugin from canonical source** — Claude agents MUST be generated from `src/agents/`. The shared bundle MUST receive one copy of the canonical thoth-owned `skills/` tree and MUST contain separate harness-specific manifests, MCP surfaces and Codex hook declarations with their payload files placed outside any path another harness auto-discovers and referenced explicitly by the Codex manifest. The Codex plugin manifest MUST NOT declare generated role TOMLs; the CLI writer remains their canonical delivery surface. Build and npm version lifecycle commands MUST synchronize the generated shared plugin output, including Codex hook payloads.
  - GIVEN a changed canonical role prompt; WHEN the build runs; THEN the Codex hook payload for that role in `plugin/codex-hooks/` is regenerated while `codex-hooks/hooks.json` declarations remain byte-identical and no `plugin/hooks/hooks.json` exists for Claude Code to auto-discover.
- `MODIFIED multi-harness-agent-pack` **Bounded continuation exception** — The canonical orchestration policy MUST permit resuming or steering an existing subagent only for the exact same bounded assignment and MUST NOT treat completed role instances as a reusable pool, except that the Codex dialect MAY reuse a completed child through `followup_task` for a later unit of the same role only when the objective, SDD phase and mutable surface are unchanged (or the work is read-only) and no independent judgment is required, because Codex multi-agent capacity is bounded per session; this exception MUST NOT override `Fresh delegation at work boundaries`, `Status is not reuse` or `Fresh independent judgment`, and Oracle plan reviews and verification rounds MUST remain fresh. Other harnesses' rendered lifecycle instructions remain unchanged.
  - GIVEN a Codex root whose completed Explorer child mapped one area during the explore phase of the current objective; WHEN the root needs another read-only Explorer question in that same phase; THEN it MAY send it with `followup_task` to that child, while a new phase, a different mutable surface or any Oracle verification uses a newly spawned child.
- `ADDED cli-installation` **Consent-gated Codex hook trust and capacity** — Codex install and update MUST write `agents.max_concurrent_threads_per_session` while recording its prior value, and MUST write Codex `hooks.state` trust entries for thoth-agents plugin hooks only after explicit operator consent through interactive confirmation or `--trust-hooks`; without consent no trust entry is written and the operator is directed to Codex's native hook review; dry-run reports both without mutation.
  - GIVEN a Codex install without `--trust-hooks` in a non-interactive run; WHEN it completes; THEN `config.toml` contains the threads key but no thoth-agents `hooks.state` entry and the output names the hook review step.
- `ADDED cli-installation` **Codex uninstall and doctor** — The CLI MUST provide Codex `uninstall`, removing only attributable thoth-agents surfaces (fingerprinted agent TOMLs, managed state, legacy root block, owned hook trust entries, the threads key restored to its prior value) and the plugin through the native manager while preserving unrelated content, and Codex `doctor`, reporting plugin, hook trust, Node availability, TOML drift, capacity setting and legacy root-block state with actionable remediation and no mutation.
  - GIVEN an operator-edited agent TOML and an unrelated hook trust entry; WHEN `uninstall --agent=codex` runs; THEN the edited TOML and the unrelated entry are preserved and reported, and every unmodified thoth-owned surface is removed.

## Plan

Approach: switch Codex delivery from global files to plugin hooks, shrink the remaining global writes, adapt the Codex dialect to V2 capacity, and add a lifecycle with ownership-aware removal and diagnostics.

Units and seams:

1. Hook package (adapter + surfaces + writer + generator): extend hook validation allowlists to accept `SubagentStart` and `additionalContext` output (`src/harness/adapters/codex-surfaces.ts`), make the hook writer preserve `commandWindows` and `additionalContextLimit`, add hook declarations and payload assets to the Codex package inputs (`src/harness/adapters/codex.ts:358`), reuse the dormant hook writer (`src/harness/writers/codex-plugin-package.ts`), add `codex-hooks/context.cjs` and payload files under `codex-hooks/payloads/` (root + five roles) generated from the existing Codex root/role prompt builders (`src/harness/adapters/codex.ts:145-177`), sync `plugin/` via `src/harness/generate-integration-packages.ts`. Seams: writer tests, generator tests, a `context.cjs` unit test feeding SessionStart/SubagentStart stdin JSON, and a shared-bundle isolation test (no `plugin/hooks/hooks.json`, no hooks in the Claude manifest).
2. Global-surface reduction: thin TOML rendering (`src/harness/adapters/codex.ts:217-246`, `src/harness/writers/codex-toml.ts`), stop root-block writes and remove existing managed block on install/update/sync (`src/cli/codex-install.ts:512,601-610,742`). Seams: `codex.test.ts`, `codex-install.test.ts`, `operations/codex.test.ts`.
3. Codex dialect delegation rules (`src/agents/prompt-dialects.ts:179-210`, Codex runtime guidance `src/harness/adapters/codex.ts:120-133`, now rendered into the root payload) plus a Codex-only lifecycle-rendering seam replacing the shared fresh-per-unit wording for Codex (`src/agents/prompt-sections.ts:203-208`, `src/harness/core/agent-pack.ts:387-391`). Net payload must stay within the 13,800-character cap (252 headroom today), compacting Codex runtime guidance if needed. Seams: `prompt-dialects.test.ts`, `prompt-rendering.test.ts` (cap measured on the actual hook payload), non-Codex rendering snapshots unchanged.
4. Config writes: threads key and consent-gated hook trust in `src/cli/codex-config-io.ts`; Codex trust-hash function with golden fixture (thoth-mem plugin declarations + their Codex-written hashes, copied into a test fixture); `--trust-hooks` flag and interactive confirmation in CLI parser/install/TUI; prior-value recording in managed state. Seams: `codex-config-io.test.ts`, new hash test, `codex-install.test.ts`.
5. Lifecycle: `uninstall` and `doctor` Codex operations (`src/cli/operations/codex.ts:107-164`) reusing fingerprints and managed state. Seams: `operations/codex.test.ts`.
6. Docs and spec sync: `docs/codex-install.md`, `docs/agent/harness-packaging.md`; canonical specs updated at archive.
7. Manual Desktop validation by the user with a checklist.

Order: 1 → 2 → 3 (shared `codex.ts`, one writer at a time); 4 after 3 (needs declarations from 1; serialized with installer files/tests touched by 2 and 3); 5 after 4; 6 after 5; 7 after a local build is installable. Local closeout: focused tests per unit, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`.

Risks: Codex hook/trust contract is version-coupled (doctor detects drift); Desktop hook execution reported flaky on Windows (#35863), covered by AC-8; trust auto-write bypasses Codex's review prompt, mitigated by explicit consent and disclosure; V2 slot leaks remain upstream bugs, mitigated not fixed.

## Tasks

- [x] AC-1: Codex plugin ships SessionStart/SubagentStart hooks with portable loader and canonical payloads
  - Outcome: generated `plugin/` contains `codex-hooks/hooks.json`, `codex-hooks/context.cjs`, root and five role payloads under `codex-hooks/payloads/`; Codex manifest references `./codex-hooks/hooks.json`; no `plugin/hooks/` directory and no hooks in the Claude manifest
  - Known entrypoints and skill paths: `src/harness/adapters/codex.ts`, `src/harness/writers/codex-plugin-package.ts`, `src/harness/generate-integration-packages.ts`, `plugin/.codex-plugin/plugin.json`; skills `tdd`
  - Inputs: Exploration contract (portable command, `additionalContextLimit: 0`, matcher sets, stdin fields)
  - Dependencies: none
  - Output: adapter/writer/generator changes, `context.cjs`, tests, regenerated `plugin/`
  - Owner: thoth-worker
  - Writes: `src/harness/adapters/codex.ts` (package inputs and payload builders only), `src/harness/adapters/codex-surfaces.ts` (hook event/output allowlists), `src/harness/writers/codex-plugin-package.ts`, `src/harness/generate-integration-packages.ts`, their tests, new hook script source, `plugin/**`
  - Interface boundaries: canonical role prompts in `src/agents/`; Claude manifest and Claude-discovered paths unchanged (`src/harness/writers/claude-code-plugin-package.ts`)
  - Focused check and PASS evidence: surfaces/writer/generator/adapter tests accept `SubagentStart`, `additionalContext`, `commandWindows` and `additionalContextLimit`; a `context.cjs` test passes for SessionStart and each role; a shared-bundle isolation test asserts `plugin/hooks/hooks.json` is absent and the Claude manifest declares no hooks; `pnpm run build` produces stable `codex-hooks/hooks.json` across two builds
  - Return milestone: hook package generated and tests green
  - Stop / reassessment: writer cannot express required handler fields, or payload generation needs prompt-contract changes
- [x] AC-2: Install, update and sync stop writing and remove the AGENTS.md root block
  - Outcome: no root-block write; existing managed block removed with surrounding content preserved, only after the installed plugin passes the hook-capability prerequisite
  - Known entrypoints and skill paths: `src/cli/codex-install.ts`, `src/cli/codex-paths.ts`, `src/cli/operations/codex.ts:658-725,1005-1048`, `src/cli/codex-plugin-install.ts`; skill `tdd`
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 hook package unit
  - Output: installer changes and tests
  - Owner: thoth-worker
  - Writes: `src/cli/codex-install.ts`, `src/cli/codex-paths.ts`, `src/cli/operations/codex.ts` (hook-capability prerequisite in install/update/sync), `src/cli/codex-plugin-install.ts` (installed-bundle inspection), related tests
  - Interface boundaries: dry-run reporting, install ledger, native plugin manager state
  - Focused check and PASS evidence: `codex-install.test.ts`, `codex-plugin-install.test.ts` and `operations/codex.test.ts` cover block removal with byte-preserved surroundings and a managed backup (markers establish ownership, so a structurally valid block is removed regardless of content), absent block, malformed or duplicate markers left in place and reported, and sync with missing, disabled or legacy (no `codex-hooks`) plugin failing with no prompt-surface change and an `update` instruction, plus a successful migration case
  - Return milestone: migration tests green
  - Stop / reassessment: block markers ambiguous or unowned content detected inside markers
- [x] AC-3: Agent TOMLs become thin pointers with model, effort and sandbox
  - Outcome: thin TOML rendering with preserved operator model/effort handling
  - Known entrypoints and skill paths: `src/harness/adapters/codex.ts` (TOML rendering), `src/harness/writers/codex-toml.ts`, `src/cli/codex-install.ts` (managed models); skill `tdd`
  - Inputs: accepted AC-1 and AC-2 units, including the hook-capability prerequisite that gates full-TOML replacement
  - Dependencies: AC-2 unit (shared files and prerequisite)
  - Output: rendering changes and tests
  - Owner: thoth-worker
  - Writes: `src/harness/adapters/codex.ts` (TOML section), `src/harness/writers/codex-toml.ts`, `src/cli/codex-install.ts` (TOML migration and digests), `src/cli/managed-state-io.ts` (durable digests), related tests
  - Interface boundaries: recovery fingerprints for previously installed full TOMLs
  - Focused check and PASS evidence: `codex.test.ts`, `codex-toml.test.ts`, `codex-install.test.ts` assert legacy full TOMLs are untouched when the prerequisite fails, thin fields, model preservation, replacement of unmodified legacy full TOMLs, preservation of edited TOMLs, old recovery journals handled, and durable last-written digests recorded in managed state
  - Return milestone: tests green
  - Stop / reassessment: legacy full TOMLs cannot be attributed for replacement
- [x] AC-4: Codex dialect enforces fork_turns none, capacity-bounded spawning and scoped reuse
  - Outcome: updated Codex delegation rules in root payload within the token cap
  - Known entrypoints and skill paths: `src/agents/prompt-dialects.ts`, `src/agents/prompt-sections.ts:203-208`, `src/harness/core/agent-pack.ts:387-391`, `src/harness/adapters/codex.ts` (runtime guidance); skill `tdd`
  - Inputs: Exploration V2 capacity facts; Clarifications reuse rule
  - Dependencies: AC-3 unit (shared `codex.ts`)
  - Output: dialect/guidance changes and tests
  - Owner: thoth-worker
  - Writes: `src/agents/prompt-dialects.ts`, `src/agents/prompt-sections.ts`, `src/harness/core/agent-pack.ts` (Codex-only lifecycle seam), `src/harness/adapters/codex.ts` (runtime guidance lines), related tests, regenerated `plugin/` payloads
  - Interface boundaries: other harness dialects and rendered prompts byte-identical
  - Focused check and PASS evidence: `prompt-dialects.test.ts` and `prompt-rendering.test.ts` assert fork_turns none, capacity bound, phase/surface-scoped reuse, fresh Oracle, no send_message to completed children, list_agents on limit error, and the 13,800-character cap on the actual hook payload; OpenCode, Claude and Pi rendered prompts unchanged
  - Return milestone: tests green
  - Stop / reassessment: rule requires changing shared canonical policy text for all harnesses
- [x] AC-5: Config writes threads key and consent-gated hook trust with a Codex-compatible hash
  - Outcome: threads key with prior-value record; `--trust-hooks`/interactive consent writes `hooks.state`; golden hash test
  - Known entrypoints and skill paths: `src/cli/codex-config-io.ts`, `src/cli/codex-install.ts`, CLI parser/args under `src/cli/`, `src/cli/managed-state-io.ts`; skill `tdd`
  - Inputs: AC-1 hook declarations; trust-hash algorithm in Exploration; golden pair derived from a Codex-written `trusted_hash` for a known declaration
  - Dependencies: AC-1 hook package unit and AC-3 unit (serialized installer surfaces)
  - Output: config/trust implementation, flag, tests, fixture
  - Owner: thoth-worker
  - Writes: `src/cli/codex-config-io.ts`, new hash module and tests, CLI flag wiring, `src/cli/managed-state-io.ts`, related tests
  - Interface boundaries: unrelated `config.toml` text and other `hooks.state` entries preserved
  - Focused check and PASS evidence: golden hash test reproduces the five thoth-mem Codex-written hashes; config tests show byte-preserved unrelated text; no trust entries without consent; prior threads value captured once across repeated updates; operator-modified threads value preserved; dry-run no mutation
  - Return milestone: tests green
  - Stop / reassessment: golden hash mismatch after following the documented normalization
- [x] AC-6: Codex uninstall and doctor operations
  - Outcome: ownership-aware uninstall and read-only doctor
  - Known entrypoints and skill paths: `src/cli/operations/codex.ts`, `src/cli/codex-install.ts`, `src/cli/codex-plugin-install.ts`, CLI command registry; skill `tdd`
  - Inputs: accepted AC-2, AC-3, AC-5 units
  - Dependencies: AC-3 and AC-5 units
  - Output: operations, CLI wiring, tests
  - Owner: thoth-worker
  - Writes: `src/cli/operations/codex.ts`, command registry/parser files, related tests
  - Interface boundaries: native plugin manager commands; provider-owned thoth-mem surfaces untouched
  - Focused check and PASS evidence: `operations/codex.test.ts` covers removal, preservation of edited/unrelated surfaces, doctor states
  - Return milestone: tests green
  - Stop / reassessment: native manager lacks a removal command
- [x] AC-7: Docs reflect the new Codex surfaces, consent and lifecycle
  - Outcome: updated install and packaging docs
  - Known entrypoints and skill paths: `docs/codex-install.md`, `docs/agent/harness-packaging.md`
  - Inputs: accepted AC-1 to AC-6 units
  - Dependencies: AC-6 unit
  - Output: documentation edits
  - Owner: thoth-worker
  - Writes: `docs/codex-install.md`, `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes; docs name every global surface and the trust consent
  - Return milestone: docs edited
  - Stop / reassessment: none
- [x] AC-8: Manual Codex Desktop validation by the user
  - Outcome: user-confirmed Desktop checklist results
  - Known entrypoints and skill paths: locally built package; checklist from root
  - Inputs: accepted AC-1 to AC-7 and a passing build
  - Dependencies: AC-7 unit
  - Output: recorded user confirmation per checklist item
  - Owner: root (user executes)
  - Writes: none
  - Interface boundaries: user's real Codex home, changed only by the user
  - Focused check and PASS evidence: user reports trust prompt or auto-trust, root marker, Oracle read-only and Worker role injection
  - Return milestone: user report received
  - Stop / reassessment: Desktop does not execute plugin hooks

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: four fresh Oracle reviews; rounds 1-3 REJECT (hook allowlist seam, continuation coherence, Claude hook autodiscovery, sync migration prerequisite), each repaired in the record; round 4 OKAY, envelope validated with validate-result.mjs (exit 0).
Non-blocking implementation note from round 4: SubagentStart matchers, spawn guidance and tests must bind to the TOML `name` field (currently bare role names such as `oracle`), not file names; the delta scenario's `thoth-agents-oracle` denotes the Oracle role.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 18128572628c6cd63840c9cdb5fb8474a94698b1760ad8037e573e9a6df8de67

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-8 are adequately satisfied. No blocking defect reproduced in the changed behavior.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/codex-plugin-native-hooks/codex-plugin-native-hooks.md",
      "claim": "Independently recomputed prefix SHA-256 matches 18128572628c6cd63840c9cdb5fb8474a94698b1760ad8037e573e9a6df8de67. Installed validator passes through verify; canonical source digests match.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "execution",
      "locator": "pnpm run build; npx vitest run src/cli src/harness src/agents; pnpm run typecheck; pnpm run check:ci",
      "claim": "Build ran first and passed. All 89 test files and 1,815 tests passed; typecheck and check:ci passed. Biome reported 753 warnings and eight informational diagnostics. git diff --check passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "artifact-inspection",
      "locator": "plugin/.codex-plugin/; plugin/codex-hooks/; src/agents/; src/harness/",
      "claim": "Reviewed actual diff. Hook digest is b2949fe8110fdc7552bc09788d4b0b0543c9276f8fb90f155b5e974da91b8ece; all eight hook provenance hashes match. Loader emits all six exact payloads. Root is 13,550 characters. Claude discovery remains isolated, non-Codex prompt baselines pass, and generated plugin changes are confined to Codex manifest/provenance and codex-hooks/.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "operator-lifecycle",
      "locator": "%TEMP%/oracle-native-lifecycle-XGQAoX",
      "claim": "Isolated Codex 0.162.1 lifecycle passed: install without consent, install with consent, status, CLI model override, update, sync, doctor, mutation-free uninstall preview, uninstall and post-uninstall doctor. Outputs matched resulting state; prior threads=3 and unrelated trust survived, owned trust/state/roles were removed.",
      "basis": "observed",
      "uncertainty": "Used actual native plugin add/list/remove with a local prerelease marketplace; only its provenance inspection response was normalized. External skill/provider setup used fixtures. No real Codex home writes."
    },
    {
      "id": "E5",
      "kind": "regression-probe",
      "locator": "src/cli/operations/codex.ts; src/cli/managed-state-io.ts; isolated lifecycle home",
      "claim": "Consented setup and CLI overrides report current and permit update/sync. Independent thin model-only and effort-only edits survive both operations with refreshed ownership digests. Genuine description edits remain unchanged and correctly block update/sync. Semantic ordering regressions also pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "migration-and-safety",
      "locator": "src/cli/codex-install.ts; src/cli/codex-lifecycle.ts; src/cli/safe-atomic-write.ts; isolated migration fixtures",
      "claim": "Frozen legacy roles exactly match HEAD full-role rendering. Released-state update/sync migration preserves models, effort, backups and outside root bytes, including invalid UTF-8. Disabled/incomplete plugins block migration. Backup symlinks fail closed; fixed staging symlinks remain untouched; generated dotted config parses in native Codex; uninstall preserves concurrent role edits.",
      "basis": "observed",
      "uncertainty": "Migration/safety fixtures simulate native-manager state except the native TOML parsing check."
    },
    {
      "id": "E7",
      "kind": "documentation-and-manual-evidence",
      "locator": "docs/codex-install.md; docs/agent/harness-packaging.md; change record Verification",
      "claim": "Documentation reflects consent, surfaces, migration, capacity and lifecycle. Durable deltas are baseline-pinned for archive. Recorded user Desktop validation covers native hook trust, root injection and Oracle/Worker role injection, adequately satisfying AC-8.",
      "basis": "observed",
      "uncertainty": "Desktop execution is user-reported, not independently repeated; its Oracle refusal did not exercise sandbox enforcement."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect generated declarations, provenance and isolation; execute loader for all six payloads.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Required portable hooks and canonical payloads are present and functional."
    },
    {
      "check": "AC-2",
      "method": "Exercise migration and prerequisite failures through public operations.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6"],
      "reason": "Legacy removal preserves outside bytes and is gated by installed hook capability."
    },
    {
      "check": "AC-3",
      "method": "Inspect thin TOMLs and exercise legacy migration, CLI overrides and direct model/effort edits.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E6"],
      "reason": "Thin roles preserve operator selections without adopting genuine edits."
    },
    {
      "check": "AC-4",
      "method": "Review Codex lifecycle seam and rendered payload; run prompt baseline and capacity tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Scoped reuse, fresh Oracle, capacity handling and root cap are satisfied; other harness prompts remain unchanged."
    },
    {
      "check": "AC-5",
      "method": "Exercise consent/no-consent installs, capacity restoration and trust diagnostics; run golden-hash and dry-run tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E6"],
      "reason": "Trust requires consent and ownership survives subsequent operations."
    },
    {
      "check": "AC-6",
      "method": "Run CLI lifecycle against native isolated plugin management and focused ownership/safety probes.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Doctor is actionable; uninstall preview is nonmutating and removal preserves unrelated or changed content."
    },
    {
      "check": "AC-7",
      "method": "Review documentation diff, declared deltas and canonical baseline validation.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E7"],
      "reason": "Documentation and archive-ready durable deltas describe the implemented contract."
    },
    {
      "check": "AC-8",
      "method": "Assess recorded user-run Windows Desktop validation against the stated acceptance.",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "Evidence covers trust, root injection and both requested role categories; sandbox enforcement was not this acceptance gate."
    }
  ],
  "risks": [
    {
      "description": "Hook trust normalization remains coupled to Codex 0.162.1; Desktop and upstream capacity behavior retain the documented runtime limitations.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record PASS, then run closeout and archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/codex-plugin-native-hooks/codex-plugin-native-hooks.md",
    "reviewedRecordSha256": "18128572628c6cd63840c9cdb5fb8474a94698b1760ad8037e573e9a6df8de67"
  }
}
```

Final verification round 7 (fresh Oracle): PASS; envelope validated with validate-result.mjs --record-sha256 (exit 0).

- AC-1: PASS | vitest codex-plugin-package, codex-surfaces, codex, generate-integration-packages, codex-hook-script; pnpm run build twice | plugin/codex-hooks/{hooks.json,context.cjs,payloads/*} generated; hooks.json SHA-256 b2949fe8… stable across builds and identical to installed personal bundle and Codex cache; no plugin/hooks/, Claude manifest has no hooks; Desktop executed both hooks (AC-8).
- AC-2: PASS | vitest codex-install, codex-plugin-install, operations/codex, setup-codex-local | root never written; valid block removed with .bak, malformed preserved; sync fails without changes when plugin missing/disabled/legacy; real home: block removed, AGENTS.md.bak present.
- AC-3: PASS | vitest codex, codex-toml, codex-install, managed-state-io | thin TOMLs with roleDigests/roleStructureDigests; model-only edits stay owned; --replace-legacy-agents migrates signature-matched legacy TOMLs with .bak; real home doctor: five agents owned.
- AC-4: PASS | vitest prompt-dialects, prompt-rendering, codex | Codex lifecycle seam (fork_turns none, capacity bound, phase/surface-scoped reuse, fresh Oracle, no send_message to completed, list_agents on limit); root payload 13,550 chars <= 13,800; OpenCode/Claude/Pi prompt digests unchanged; Desktop root restated these rules (AC-8).
- AC-5: PASS | vitest codex-config-io, codex-hook-trust (two golden sets: thoth-mem and Codex-Desktop-written thoth-agents hashes), codex-hook-consent, codex-install, tui App | threads=6 with prior value; trust only with --trust-hooks/CLI y/N/TUI step; doctor hash equals Codex-written trusted_hash on real home.
- AC-6: PASS | vitest codex-lifecycle, operations/codex, codex-command-executor, codex-config-io structural fixture | ownership-aware uninstall/dry-run, read-only doctor with identity-aware fixes; real-home doctor exit 0 all healthy.
- AC-7: PASS | pnpm run check:ci; docs grep | docs/codex-install.md, docs/agent/harness-packaging.md, installation.md, quick-reference.md, codex-surface-validation.md, codex-plugin-packaging.md, docs/agent/architecture.md updated; no remaining claim that the CLI writes the Codex root to AGENTS.md.
- Integrated checks 2026-10-17: npx vitest run src/cli src/harness src/agents 88 files / 1,751 passed; pnpm run typecheck, check:ci (753 pre-existing warnings), build passed; root rebuilt and confirmed plugin/codex-hooks/hooks.json SHA-256 b2949fe8110fdc7552bc09788d4b0b0543c9276f8fb90f155b5e974da91b8ece unchanged across build.
- Final verification round 1 (fresh Oracle): FAIL — applyCodexManagedModelOverrides dropped priorThreadsValue/ownedHookTrustKeys, breaking uninstall restoration. Converged: shared read-modify-write managed-state helper for all writers (codex-install setup and overrides; OpenCode writer routed defensively), regression test install → model override → uninstall restores threads=3 and removes owned trust entries.
- Final verification round 2 (fresh Oracle): FAIL — symlinked AGENTS.md.bak overwrite, uninstall ownership not revalidated after native removal, reset kept override maps; stale Worker-collision doc. Converged: shared lstat-validated fail-closed backup destinations across all backup writers, post-native-command revalidation before each uninstall mutation, reset clears configuredModels/configuredEfforts while keeping ownership fields, docs corrected. Checks: 88 files / 1,770 tests, typecheck, check:ci, build passed; hooks.json SHA-256 b2949fe8… unchanged.
- Final verification round 3 (fresh Oracle): FAIL — fixed config.toml.tmp staging followed a pre-existing symlink. Converged: shared src/cli/safe-atomic-write.ts (UUID sibling staging, existing-entry rejection, exclusive open, fd write, mode preservation, fsync, rename, owned-temp cleanup) for config/hook trust, AGENTS migration, agent TOMLs, managed/recovery JSON, uninstall rewrites and local-setup manifest writes. Checks: 89 files / 1,781 tests, typecheck, check:ci, build passed; hooks.json SHA-256 unchanged.
- Final verification round 4 (fresh Oracle): FAIL — appending `[agents]` after root dotted `agents.*` keys produced invalid TOML; uninstall revalidated AGENTS.md via lossy decoding. Converged: scalar insertion handles explicit tables, root and ancestor dotted keys and unrelated scopes, inline parents fail closed; dotted restore/removal covered; lifecycle revalidation compares raw Buffers. Checks: build, 89 files / 1,803 tests, typecheck, check:ci passed; hooks.json SHA-256 unchanged.
- Final verification round 5 (fresh Oracle): FAIL — normal update/sync rejected an untouched released 0.7.0 install (ownership-approved migration classified as drift). Converged: ownership-approved role writes report as outdated, exact legacy `{version, models}` state recognized; public-operation regressions for update, sync and model/effort-preserving migration. Checks: build, 89 files / 1,811 tests, typecheck, check:ci passed; hooks.json SHA-256 unchanged.
- Final verification round 6 (fresh Oracle): FAIL — textual JSON comparison flagged semantically equal managed state as drift after consented setup/overrides; ownership-approved model/effort-only edits blocked update/sync. Converged: normalized semantic state comparison (trust keys as a set), planner-approved per-role digest refresh, docs clarify direct setup vs update/sync for edited roles, test non-null assertions removed. Checks: build, 89 files / 1,815 tests, typecheck, check:ci (753 warnings) passed; hooks.json SHA-256 unchanged; read-only real-home doctor healthy.
- AC-8: PASS | user manual Codex Desktop (Windows) validation 2026-10-17 | After pnpm run setup:codex:local -- --replace-legacy-agents and reinstall of thoth-agents@personal: native startup hook review appeared and the user trusted all hooks; root answered as thoth root coordinator and restated the Codex-specific rules (fork_turns none, phase/surface-scoped followup_task reuse, fresh Oracle, list_agents on agent thread limit reached); oracle child answered with its role and refused to write (instruction-level; sandbox not exercised); worker child answered with its role; doctor afterwards: plugin enabled with hook capability, session_start and subagent_start trusted (doctor hash equals Codex-written trusted_hash), five agents owned, threads managed (6), legacy AGENTS.md block absent.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:7e6bb61acbc6da0baf94cea7415eb9d88f05577c753f74b53320e046233998cf
- Source: .thoth/specs/cli-installation/spec.md | sha256:c2204bd7ddb036a852e253de7eadaf024b2994efe0296d24e7883be07b59a3d2

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
