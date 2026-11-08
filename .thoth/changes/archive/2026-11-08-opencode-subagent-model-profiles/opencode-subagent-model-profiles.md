# Change: opencode-subagent-model-profiles

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi reference: `pi-packages/pi-subagents/src/model-profiles/{store,editor,session,command,formatting,data,orchestrator}.ts` and `profile-resolver.ts` (~2.3k LOC). Store schema `{version:1, active?, profiles:{name:{agents:{agent:{model?,effort?}}, orchestrator?}}}` at `<agentDir>/thoth/profiles.json` and `<project>/.pi/thoth/profiles.json`; selection session → project pin → global active → virtual read-only `default`; project profiles shadow same-name global ones; drafts live in memory until save. Store transitively imports Pi runtime parsers (`pi-subagents/src/config.ts:5-8`), command/formatting depend on pi-core panels; no shared `src/` ↔ `pi-packages/` code precedent exists.
- OpenCode plugin (this worktree, `@opencode/plugin` 2.2.5 v2 shape, `src/index.ts:13-23`): config loaded once at setup (`src/opencode/context.ts:25-65`, effective model arrays + retry chains); agents registered through `ctx.agent.transform` with `{providerID,id,variant}` (`src/opencode/agents.ts:20-52`); tool hooks only `execute.after` (`src/opencode/delegation-hooks.ts:15-19`); server commands via `ctx.command.transform` (`src/opencode/command.ts:13-24`); events via `src/opencode/session-hooks.ts:48-65`; no `ctx.rpc` / `ctx.storage` usage yet.
- Presets today (OpenCode-only runtime consumer, `src/opencode/context.ts:25`): `src/config/schema.ts:99-147`, `src/config/loader.ts:156-202` (selection, `THOTH_AGENTS_PRESET`, preset prompt dirs), `src/agents/index.ts:279,300`, `src/agents/configured-role-prompt.ts:25`, CLI `src/cli/providers.ts:21-67`, `src/cli/config-io.ts:228-342`, `src/cli/operations/opencode.ts:516-581,908,1043,1724-1816`, `src/cli/tui/operations.ts:194-205`, `src/cli/commands.ts:349`, `src/cli/install.ts:184`. Codex/Claude/Pi persist models natively and do not consume presets at runtime. Tests: `src/config/{schema,loader,constants}.test.ts`, `src/cli/{commands,config-io,providers}.test.ts`, `src/cli/model-catalog/models-dev.test.ts`, `src/cli/operations/opencode.test.ts`, `src/cli/tui/{App.test.tsx,operations.test.ts}`, `src/opencode/agents.test.ts`. Docs: `README.md:294`, `docs/provider-configurations.md`, `docs/installation.md`, `docs/quick-reference.md:125`, `docs/agent/{architecture,runtime-integrations,testing}.md`.
- OpenCode config paths: `src/cli/paths.ts:5-32` (`OPENCODE_CONFIG_DIR` → `XDG_CONFIG_HOME/opencode` → `~/.config/opencode`); project `.opencode/`. Packaging: `package.json:7-21` (no `./tui` export), `tsup.config.ts:4-16`, CLI installs `thoth-agents@<version>` into OpenCode `plugins`.
- Runtime spike on OpenCode 2.2.6 (scratch dir, outside repo): `tool.execute.before` on native `subagent` replaced `input.model` and the child ran on it; server command `execute` receives raw args in `prompt.text`; package `exports["./tui"]` auto-loads a TUI `Plugin.define` whose native `dialog.select` rendered (user-confirmed screenshot); TUI→server `ctx.rpc` works and definitions require `events:{}`; `session.switchModel` on `session.created` misses the first cold session because it is created before plugin setup. Upstream v2.2.5: `subagent` `model` arg format `provider/model#variant`, precedence explicit → agent → parent (`core/src/tool/plugin/subagent.ts:37-40,174-198`); runner prefers `session.model` over agent preference (`core/src/session/runner/model.ts:77-98`); `ctx.storage` is a global KV namespaced only by plugin id.

## Intent

Give OpenCode users of thoth-agents the Pi `/subagents-model` experience: named model profiles (model + variant per role, including the orchestrator), stored globally and per project, selectable per session, pinnable per project or activated globally, managed from an interactive `/subagents-model` TUI panel with Pi functional parity, and applied to the orchestrator and to every subagent spawn. Named profiles replace the thoth-agents.json `presets` mechanism entirely.

## Non-goals

- No backward compatibility or migration of `preset`/`presets`/`THOTH_AGENTS_PRESET`; no preset- or profile-scoped prompt directories.
- No custom JSX/Solid/OpenTUI rendering, two-column layout, or new UI dependencies.
- No changes to Pi `/subagents-model`, pi-subagents, Codex, Claude Code, or Pi harness behavior; no shared package extracted between `src/` and `pi-packages/`.
- No headless/server-only `/subagents-model` command; no tools/permissions in profiles.
- No package version bumps; no OpenCode `@opencode/plugin` upgrade beyond what the TUI entry strictly needs.

## Acceptance

- AC-1: A host-neutral profile core reads/writes `<opencode-config-dir>/thoth/profiles.json` and `<project>/.opencode/thoth/profiles.json` with schema `{version:1, active?, profiles:{<name>:{agents:{<role>:{model?, variant?}}}}}` (roles = the six canonical roles incl. `orchestrator`), atomic writes, a reserved read-only virtual `default` (= effective thoth-agents.json roster), project-over-global name shadowing, and effective selection session → project pin → global active → `default`, warning and falling through on missing pointers.
- AC-2: `preset`, `presets`, `THOTH_AGENTS_PRESET` and preset-scoped prompt directories are removed from schema, loader and prompt loading; a config still containing `preset`/`presets` loads with one warning that they are unsupported and ignored.
- AC-3: At plugin setup the effective global/project profile sets each role's default model/variant via `ctx.agent.transform` (profile value first, remaining configured fallback chain after it, deduplicated), so the first cold session's orchestrator and all subagents use the profile without `session.switchModel`.
- AC-4: A native `subagent` call without an explicit `model` receives the effective profile model/variant for its parent session (session selection included) via `tool.execute.before`; an explicit `model` argument is never overridden.
- AC-5: Activating a profile for the session persists the selection per session in plugin storage and switches the current session's orchestrator model; global activation and project pin persist to the profile files and reload agent defaults for new sessions and switch the current session; an unavailable model leaves state unchanged with a warning.
- AC-6: The `./tui` package entry registers `/subagents-model` using only native OpenCode dialogs (select with search/actions, prompt, confirm) and provides Pi functional parity: overview of profiles with per-role model/variant rows, markers for effective/session/project/global/shadowed, create (from default or clone), rename, delete, edit model (provider → model) and variant per role, capture the current session model into the orchestrator row, save with draft-until-save and discard confirmation, activate for session/global/project pin and clear selections, communicating with the server through `ctx.rpc`.
- AC-7: The CLI writes and reads profiles instead of presets: install/sync write the built-in `openai` profile (shipped roles) into the global profiles file and activate it when nothing is active; model editing materializes and activates the complete `agents` profile; status recognizes the managed profile; shipped-default restore/update and readback operate on profiles; no `preset`/`presets` keys are written.
- AC-8: User and agent documentation describe profiles, file locations, selection order and `/subagents-model`, with no remaining preset guidance.
- AC-9: A live smoke on local OpenCode 2.2.x shows the TUI entry loading from the built package, a subagent spawned on the profile model, and the orchestrator using the profile model in a cold first session.

## Clarifications

- Presets vs profiles: profiles replace presets, no compatibility (user, 2026-11-08).
- UI scope: full Pi functional parity (user).
- Storage: separate `profiles.json` files like Pi, not inside thoth-agents.json (user).
- Rendering: native OpenCode dialogs, no JSX (user).
- Preset prompt directories: removed (user).

## Decisions

- Copy and adapt Pi profile logic into `src/opencode/profiles/` (host-neutral core + OpenCode adapters); no cross-package import.
- Effort is represented as OpenCode `variant` strings validated against the chosen model's variants when known.
- Per-role resolution: profile value → thoth-agents.json effective role config → shipped defaults; profile wins over root `agents` model/variant (Pi semantics), root config keeps all non-model fields.
- Orchestrator profile applies through agent defaults (cold-start safe); `session.switchModel` only for explicit session-level activation and for the current session on any activation.
- Subagent injection only fills an absent `model`; format `provider/model#variant`.
- Session selections live in `ctx.storage` keyed by session ID; project pin is `active` in the project file, global active is `active` in the global file.
- `/subagents-model` exists only in the TUI entry; the server exposes an RPC contract (state, save, rename, delete, activate, clear, capture).
- Durable spec deltas rename preset requirements to profile requirements and add one OpenCode profile requirement.

## Durable deltas

- `RENAMED multi-harness-agent-pack FROM Use OpenAI as the only OpenCode built-in preset` **Use OpenAI as the only OpenCode built-in profile** — Generated OpenCode model configuration MUST contain only the `openai` built-in profile for the six-role roster in the global profiles file. It MUST NOT generate Kimi, Copilot, ZAI/GLM, or mixed-provider mappings, and MUST NOT write `preset` or `presets` keys.
  - GIVEN a fresh OpenCode install; WHEN thoth-agents writes model configuration; THEN the global profiles file contains the `openai` profile for all six roles and thoth-agents.json contains no `preset` or `presets` key .
- `ADDED multi-harness-agent-pack` **Manage OpenCode subagent model profiles** — The OpenCode plugin MUST expose `/subagents-model` from its `./tui` entry using native dialogs to manage named profiles (model and variant per canonical role including `orchestrator`) stored in `<opencode-config-dir>/thoth/profiles.json` and `<project>/.opencode/thoth/profiles.json`, with a read-only virtual `default`, draft-until-save editing, project-over-global shadowing, and effective selection session → project pin → global active → `default`. The effective profile MUST set role default models at plugin setup, MUST fill the `model` of native `subagent` calls that omit it, MUST NOT override an explicit `model`, and MUST switch the current session's orchestrator on activation; unavailable models MUST leave state unchanged with a warning.
  - GIVEN a global active profile assigning the worker a different model; WHEN the orchestrator spawns the worker without a model argument; THEN the child session runs on the profile's worker model .
- `RENAMED cli-installation FROM Activate the applied agents preset` **Activate the applied agents profile** — Applying any valid OpenCode model configuration plan MUST materialize a complete `agents` profile in the global profiles file containing the changed assignment plus every unchanged effective role assignment, and MUST make it the global active profile.
  - GIVEN the global active profile is `openai`; WHEN the user applies one edited role; THEN the global profiles file activates `agents` and its `agents` profile contains the change plus every unchanged effective role .
- `MODIFIED cli-installation` **Materialize the complete effective roster** — Before activation, the system MUST derive all six effective role configurations from the active profile, root configuration, and canonical defaults using field-level precedence, apply the requested role changes, and preserve unrelated profiles and configuration keys; applying with no dirty role MUST still materialize and activate the same complete `agents` profile.
  - GIVEN no role is dirty and the TUI sends every displayed role; WHEN the user selects Apply; THEN the same complete `agents` profile is materialized and activated .
- `RENAMED cli-installation FROM Recognize the managed agents preset` **Recognize the managed agents profile** — OpenCode status and model-role readback MUST recognize a complete active `agents` profile as a valid managed configuration and MUST keep subsequent valid model plans eligible to apply. Managed status MUST recognize a complete applied `agents` profile as the active roster without an `opencode-roster-drift` blocker, reload MUST display the active profile's effective values without falling back to `openai`, and a second apply MUST remain eligible and preserve the activated profile.
  - GIVEN a complete applied `agents` profile is globally active; WHEN managed status is evaluated; THEN the roster is recognized without an `opencode-roster-drift` blocker .
- `MODIFIED model-catalog` **Apply role-specific specialist effort** — The built-in OpenAI defaults (for OpenCode, the built-in `openai` profile) MUST assign `explorer`, `librarian`, `designer` and `worker` `gpt-6-luna` with `max` effort and `oracle` `gpt-6.1-sol` with `xhigh` effort (provider-qualified where required), and the OpenCode managed orchestrator `gpt-6.1-sol` with `high` effort; other harness roots remain ambient. Claude Code keeps its own aliases with `explorer` at `medium` effort. On update, a role whose installed model and effort equal the previous shipped default MUST advance to the new default, while valid operator overrides MUST remain effective, and every harness that supports effort metadata MUST render it without silently downgrading `max`.
  - GIVEN the built-in OpenAI profile and an installed role still on the previous shipped default; WHEN the install is updated; THEN `worker` resolves to `gpt-6-luna` with `max`, `oracle` to `gpt-6.1-sol` with `xhigh`, and customized roles keep their values .

## Plan

Approach — four layers with explicit seams:

1. **Profile core** (`src/opencode/profiles/`): pure store (paths injected, atomic JSON write, validation, shadowing, active/pin pointers, reserved `default`), editor operations (create/clone/rename/delete/save, draft working copies), and resolver (selection chain + per-role model/variant + fallback-chain merge). Ported from Pi store/editor/resolver with Pi runtime imports replaced by local parsers. Unit-tested in isolation.
2. **Config/runtime integration**: remove preset schema/loader/prompt paths with a single unsupported-key warning; `src/opencode/context.ts` resolves the effective global/project profile at setup and `src/opencode/agents.ts` applies it as agent defaults. New `src/opencode/profile-hooks.ts` (or equivalent) registers `tool.execute.before` for `subagent` model injection, session selection storage (`ctx.storage`), activation (agent transform update + `ctx.agent.reload()` + `ctx.session.switchModel`), and the `ctx.rpc` contract (with `events:{}`), wired from `src/index.ts`.
3. **TUI entry** (`src/tui/`): `Plugin.define` from `@opencode/plugin/tui`, `/subagents-model` slash command composed from native `dialog.select`/`prompt`/`confirm`, calling the RPC contract; provider/model/variant lists from the TUI context's model APIs. Packaging: `tsup.config.ts` entry, `package.json` `exports["./tui"]` and `files`.
4. **CLI**: `src/cli/providers.ts`, `config-io.ts`, `operations/opencode.ts`, `tui/operations.ts`, `commands.ts`, `install.ts` switch from presets to the profile core (global file), keeping Codex/Claude/Pi paths untouched.
5. **Docs**: user docs and `docs/agent/*` facts.

Interfaces: the profile core API (store/editor/resolver) is the contract between layers 2–4; the RPC definition module is shared by server and TUI. Mutable surfaces are disjoint per unit (see Tasks). Test-first for each behavior unit (`tdd` skill), `simplify` after implementation.

Verification seams: vitest units for core, loader, agents, hooks/RPC handlers (mocked plugin ctx), CLI operations; `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` (new entry/exports), packaging check that `dist/tui` is published; live OpenCode 2.2.x smoke in an isolated scratch project for AC-9.

Risks: `ctx.agent.reload()` may not re-run transforms as expected (fallback: re-register transform values from a mutable source before reload; verify in smoke); TUI model-list API shape (bounded unknown: resolve from `@opencode/plugin` tui `.d.ts`); concurrent writes from several TUIs (atomic write + re-read before save); Windows path handling; dependency pinned at 2.2.5 while local runtime is 2.2.6.

## Tasks

- [x] AC-1: Host-neutral profile core (store, editor operations, resolver) with unit tests
  - Outcome: `src/opencode/profiles/` exposes store/editor/resolver satisfying AC-1 semantics
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/model-profiles/{store,editor}.ts`, `pi-packages/pi-subagents/src/profile-resolver.ts` (reference only), `src/cli/paths.ts:5-32`, `src/config/schema.ts:73-93`; skills `tdd`, `simplify`
  - Inputs: Exploration and Decisions sections of this record
  - Dependencies: none
  - Output: core module + `*.test.ts` files
  - Owner: thoth-worker
  - Writes: `src/opencode/profiles/**`
  - Interface boundaries: no imports from `pi-packages/**`; consumed by runtime, TUI RPC and CLI units
  - Focused check and PASS evidence: `pnpm vitest run src/opencode/profiles` passes covering selection chain, shadowing, reserved default, missing-pointer warning, atomic write, draft save/discard
  - Return milestone: core API and tests green
  - Stop / reassessment: core requires runtime context not expressible through injected inputs
- [x] AC-2: Remove presets from config schema, loader and prompt loading
  - Outcome: presets/preset/THOTH_AGENTS_PRESET and preset prompt dirs gone; legacy keys warn once and are ignored
  - Known entrypoints and skill paths: `src/config/schema.ts:99-147`, `src/config/loader.ts:125-202`, `src/agents/index.ts:279,300`, `src/agents/configured-role-prompt.ts:25`, tests `src/config/{schema,loader,constants}.test.ts`; skill `tdd`
  - Inputs: AC-1 core API (accepted)
  - Dependencies: AC-1 core unit
  - Output: updated config/prompt modules and tests
  - Owner: thoth-worker
  - Writes: `src/config/**`, `src/agents/index.ts`, `src/agents/configured-role-prompt.ts` and their tests
  - Interface boundaries: `loadPluginConfig` callers; CLI unit adapts separately
  - Focused check and PASS evidence: `pnpm vitest run src/config src/agents` green; no `presets` references remain in `src/config`/`src/agents`
  - Return milestone: config layer compiles and tests pass
  - Stop / reassessment: removal breaks a non-OpenCode harness runtime path
- [x] AC-3: Apply the effective profile as agent defaults at setup
  - Outcome: setup resolves global/project profile and registers role models/variants with fallback chains
  - Known entrypoints and skill paths: `src/opencode/context.ts:21-65`, `src/opencode/agents.ts:19-52`, `src/opencode/agents.test.ts`; skill `tdd`
  - Inputs: AC-1 core, AC-2 config changes
  - Dependencies: AC-1 core unit, AC-2 unit
  - Output: updated context/agents + tests
  - Owner: thoth-worker
  - Writes: `src/opencode/context.ts`, `src/opencode/agents.ts`, `src/opencode/agents.test.ts`, related context tests
  - Interface boundaries: `ctx.agent.transform` contract; retry chains in `context.ts`
  - Focused check and PASS evidence: vitest shows profile model first, configured fallbacks after, default profile equals current behavior
  - Return milestone: agents tests green
  - Stop / reassessment: fallback-chain semantics conflict with retry hooks
- [x] AC-4: Inject profile model into native subagent calls lacking a model
  - Outcome: `tool.execute.before` hook fills `model` from the parent session's effective profile
  - Known entrypoints and skill paths: `src/index.ts:13-23`, `src/opencode/delegation-hooks.ts:15-19`, `src/hooks/oracle-gate-verdict/hook.ts:10` (subagent filter precedent); skill `tdd`
  - Inputs: AC-1 core, AC-3 setup context
  - Dependencies: AC-3 unit
  - Output: profile runtime module (hooks part) + tests
  - Owner: thoth-worker
  - Writes: `src/opencode/profile-runtime.ts` (new, shared with AC-5 unit, same owner sequentially), `src/opencode/profile-runtime.test.ts`, `src/index.ts`
  - Interface boundaries: native `subagent` input `model` format `provider/model#variant`
  - Focused check and PASS evidence: vitest: absent model injected, explicit model untouched, session selection respected
  - Return milestone: hook tests green
  - Stop / reassessment: hook input shape differs from spike evidence
- [x] AC-5: Session/global/project activation and the server RPC contract
  - Outcome: RPC handlers (state, save, rename, delete, activate, clear, capture) with session storage, agent reload and switchModel
  - Known entrypoints and skill paths: `src/opencode/profile-runtime.ts`, `src/opencode/session-hooks.ts:48-65`; `@opencode/plugin` promise `rpc`/`storage`/`session`/`agent` types; skill `tdd`
  - Inputs: AC-1 core, AC-4 runtime module
  - Dependencies: AC-4 unit
  - Output: RPC definition module shared with TUI (`src/opencode/profile-rpc.ts`) + handlers + tests
  - Owner: thoth-worker
  - Writes: `src/opencode/profile-runtime.ts`, `src/opencode/profile-rpc.ts`, tests, `src/index.ts`
  - Interface boundaries: RPC definitions require `events:{}`; consumed by TUI unit
  - Focused check and PASS evidence: vitest with mocked ctx: activation paths persist correctly, switchModel/reload invoked, unavailable model warns without change
  - Return milestone: RPC contract frozen and tests green
  - Stop / reassessment: `agent.reload` cannot re-apply defaults without re-registering transforms
- [x] AC-6: TUI `/subagents-model` panel with Pi functional parity and `./tui` packaging
  - Outcome: TUI entry registering `/subagents-model` with all parity operations through native dialogs, packaged as `exports["./tui"]`
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/model-profiles/{command,formatting}.ts` (behavior reference), `src/opencode/profile-rpc.ts`, `tsup.config.ts`, `package.json:7-58`; `@opencode/plugin` `dist/tui/context.d.ts` dialog/keymap/model APIs
  - Inputs: AC-5 frozen RPC contract
  - Dependencies: AC-5 unit
  - Output: `src/tui/**` + build/export wiring + tests for pure view-model logic
  - Owner: thoth-designer
  - Writes: `src/tui/**`, `tsup.config.ts`, `package.json` (exports/files only)
  - Interface boundaries: RPC contract only; no server module edits
  - Focused check and PASS evidence: vitest for view-model/flow logic; `pnpm run build` emits the TUI entry and `package.json` exports resolve it
  - Return milestone: build green with TUI entry
  - Stop / reassessment: a parity operation is impossible with native dialogs
- [x] AC-7: CLI writes and reads profiles instead of presets
  - Outcome: install/sync/update/status/model editing/restore/readback use the global profiles file
  - Known entrypoints and skill paths: `src/cli/providers.ts:21-67`, `src/cli/config-io.ts:228-342`, `src/cli/operations/opencode.ts:516-581,908,1043,1724-1816`, `src/cli/tui/operations.ts:194-205`, `src/cli/commands.ts:349`, `src/cli/install.ts:184`, tests listed in Exploration; skill `tdd`
  - Inputs: AC-1 core, AC-2 config changes
  - Dependencies: AC-1 core unit, AC-2 unit
  - Output: updated CLI modules and tests
  - Owner: thoth-worker
  - Writes: `src/cli/**` (OpenCode/preset paths only) and tests
  - Interface boundaries: Codex/Claude/Pi operations unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/cli` green; no `presets` written in OpenCode operation tests
  - Return milestone: CLI tests green
  - Stop / reassessment: shared CLI flow forces a non-OpenCode behavior change
- [x] AC-8: Update user and agent documentation
  - Outcome: docs describe profiles, locations, selection order and `/subagents-model`; preset guidance removed
  - Known entrypoints and skill paths: `README.md:294`, `docs/provider-configurations.md`, `docs/installation.md:72,94,564,829`, `docs/quick-reference.md:125`, `docs/agent/{architecture,runtime-integrations,testing}.md`
  - Inputs: accepted outputs of AC-3..AC-7 units
  - Dependencies: AC-5, AC-6, AC-7 units
  - Output: documentation edits
  - Owner: thoth-worker
  - Writes: `README.md`, `docs/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: grep shows no stale preset guidance; `pnpm run check:ci` green
  - Return milestone: docs updated
  - Stop / reassessment: docs reveal undocumented behavior gap
- [x] AC-9: Live OpenCode 2.2.x smoke of the built package
  - Outcome: evidence that TUI entry loads, subagent uses profile model, cold first session orchestrator uses profile
  - Known entrypoints and skill paths: built `dist/`, local OpenCode 2.2.6, isolated scratch project outside the repo
  - Inputs: AC-3..AC-6 accepted, `pnpm run build` output
  - Dependencies: AC-6, AC-7 units
  - Output: smoke evidence reported in the task result (no evidence files in repo) plus manual panel steps for the user
  - Owner: thoth-worker
  - Writes: none in repo (scratch dir only)
  - Interface boundaries: must not modify user global OpenCode config/auth
  - Focused check and PASS evidence: OpenCode session data shows profile models for cold orchestrator and spawned subagent; TUI plugin registration observed
  - Return milestone: smoke verdicts reported
  - Stop / reassessment: runtime contradicts unit-tested behavior

- [x] AC-6: Repair TUI clone so it never silently discards the original unsaved draft (final verification round 1)
  - Outcome: cloning a profile with unsaved edits preserves the original draft or requires an explicit save/discard/cancel disposition for it
  - Known entrypoints and skill paths: `src/tui/flow.ts:604-611`, `src/tui/flow.test.ts`; skill `tdd`
  - Inputs: Oracle FAIL evidence `draft-loss` (edit deep, clone, discard clone, reopen deep → edits lost)
  - Dependencies: none
  - Output: flow fix + regression test reproducing the Oracle sequence
  - Owner: thoth-designer
  - Writes: `src/tui/**`
  - Interface boundaries: frozen RPC contract unchanged
  - Focused check and PASS evidence: new regression test red then green; `pnpm vitest run src/tui` green
  - Return milestone: regression green
  - Stop / reassessment: fix requires RPC contract change
- [x] AC-5: Repair rename so session selections pointing at the renamed profile follow it (final verification round 1)
  - Outcome: after `rename`, every stored session selection that resolved to the renamed profile (same scope, respecting project shadowing) points to the new name; effective selection and subagent injection are unchanged
  - Known entrypoints and skill paths: `src/opencode/profile-rpc-handlers.ts:312-316`, `src/opencode/profile-sessions.ts`, `src/opencode/profile-rpc.test.ts`; Pi reference `pi-packages/pi-subagents/src/model-profiles/command.ts` rename handling; skill `tdd`
  - Inputs: Oracle FAIL evidence `rename`
  - Dependencies: none
  - Output: handler/storage fix + regression test
  - Owner: thoth-worker
  - Writes: `src/opencode/profile-rpc-handlers.ts`, `src/opencode/profile-sessions.ts`, `src/opencode/profile-rpc.test.ts`
  - Interface boundaries: no core (`src/opencode/profiles/**`) or contract changes
  - Focused check and PASS evidence: regression (activate session → rename → state keeps renamed profile effective, no warning) red then green; `pnpm vitest run src/opencode` green
  - Return milestone: regression green
  - Stop / reassessment: storage API cannot enumerate session selections
- [x] AC-7: Repair consistent model/variant pair resolution in workspace and CLI readback, and shipped-default advancement in the active managed roster (final verification round 1)
  - Outcome: `ModelProfileWorkspace.valuesFor`, CLI readback/materialization and runtime agent defaults resolve identical model/variant pairs (including model arrays with scalar variants); on update, roles in CLI-managed profiles (`openai` and the active `agents`) still equal to the previous shipped default pair advance while operator overrides and unrelated profiles stay
  - Known entrypoints and skill paths: `src/opencode/profiles/{editor,resolver}.ts`, `src/cli/opencode-profiles.ts:37-89`, `src/opencode/context.ts` (runtime roster reference), tests; skill `tdd`
  - Inputs: Oracle FAIL evidence `pair` and `update`
  - Dependencies: none
  - Output: single shared effective-pair resolution used by runtime, workspace and CLI + regressions
  - Owner: thoth-worker
  - Writes: `src/opencode/profiles/**`, `src/cli/opencode-profiles.ts`, related `src/cli/**` tests
  - Interface boundaries: public core API names unchanged; runtime behavior of AC-3 preserved
  - Focused check and PASS evidence: regressions for each Oracle probe red then green; `pnpm vitest run src/opencode src/cli` green
  - Return milestone: regressions green
  - Stop / reassessment: runtime and CLI semantics cannot be unified without changing AC-3 behavior
- [x] AC-5: Repair project-scoped session-selection maintenance on rename/delete and destination shadowing (final verification round 2)
  - Outcome: stored session selections carry their project identity; rename/delete affect only selections whose per-session resolution (in that session's project, project shadowing global) pointed at the changed profile; a rename whose destination would change any stored selection's or pointer's effective profile through shadowing is rejected with a typed error before mutation
  - Known entrypoints and skill paths: `src/opencode/profile-rpc-handlers.ts:312-332`, `src/opencode/profile-sessions.ts:14-24`, `src/opencode/profile-runtime.ts` (selection reads), `src/opencode/profile-rpc.test.ts`; skill `tdd`
  - Inputs: Oracle round-2 evidence `cross-project` and `target-shadow`
  - Dependencies: none
  - Output: selection format with project identity, per-session resolution for rename/delete, shadow-collision guard + shared-KV multi-project regressions
  - Owner: thoth-worker
  - Writes: `src/opencode/profile-rpc-handlers.ts`, `src/opencode/profile-sessions.ts`, `src/opencode/profile-runtime.ts`, their tests, and `src/opencode/profile-rpc.ts` only for an added error code
  - Interface boundaries: RPC request shapes unchanged; new error code allowed and must be rendered by the TUI generically
  - Focused check and PASS evidence: shared-KV two-project and destination-shadow regressions red then green; `pnpm vitest run src/opencode src/tui` green
  - Return milestone: regressions green
  - Stop / reassessment: pointer (global active/project pin) shadowing requires core store changes
- [x] AC-5: Repair availability validation so a session selection cannot mask unavailable prospective defaults (final verification round 3)
  - Outcome: global/project activate and clear validate both the prospective no-session effective defaults (project → global → default after the mutation) and the current session's resulting effective profile; any unavailable model returns MODEL_UNAVAILABLE with files, storage, reload and switchModel untouched
  - Known entrypoints and skill paths: `src/opencode/profile-rpc-handlers.ts:194-224`, `src/opencode/context.ts:106-134` (reference), `src/opencode/profile-rpc.test.ts`; skill `tdd`
  - Inputs: Oracle round-3 evidence `availability-bypass`
  - Dependencies: none
  - Output: validation fix + masked-session regressions
  - Owner: thoth-worker
  - Writes: `src/opencode/profile-rpc-handlers.ts`, `src/opencode/profile-rpc.test.ts`
  - Interface boundaries: RPC contract unchanged
  - Focused check and PASS evidence: masked-session activate and clear regressions red then green; `pnpm vitest run src/opencode` green
  - Return milestone: regressions green
  - Stop / reassessment: validation requires core changes

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Round 1 REJECT (sha 416afb33ed8ca149a3da44a252efb113cd0aff7f4a447451bd70c23abf945626): model-catalog delta dropped canonical obligations; repaired. Round 2 fresh Oracle OKAY on sha da592f24361fdb222ca5d285d3c804eae0ae4567726b4177a07e0226026f5e94 (task subtask_thoth-oracle_1794162061839_c7456b7c).
**Implementation**: AUTHORIZED
User selected Implement (Recommended) via ask_user_question on 2026-11-08 after plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d2647a8caf8e3e43dc609a512fc79896a8c5cf127433b183206cc7550bb3a521
Final verification round 1: FAIL on sha 27694a5cfda57495dcd6b4e8b69cdc318a6636624724f3b108bdc8aaa3b331aa (task subtask_thoth-oracle_1794165351841_b3c912c6): clone draft loss, rename breaks session selection, inconsistent pair resolution in workspace/CLI, previous shipped defaults not advanced in active roster. Repairs recorded as tasks.
Repairs completed: clone keeps original draft pending (src/tui/flow.ts); rename/delete retarget/clear resolving session selections respecting shadowing (profile-rpc-handlers.ts, profile-sessions.ts); shared resolveModelPair used by runtime, workspace and CLI, sync advances previous shipped pairs in openai and active agents (src/opencode/profiles, src/cli/opencode-profiles.ts). Each Oracle probe has a red-then-green regression.
Final verification round 2: FAIL on sha e23014d07b67c68e11097f4de58d43c329db584200eb91a6f0bfb0b2165b8c62 (task subtask_thoth-oracle_1794166126736_6d50b5d4): round-1 defects fixed; rename/delete scan session selections across projects via plugin-global storage, and rename into a project-shadowed destination silently changes the effective profile. Repair recorded as a task.
Round-2 repair completed: session selections stored as {name, projectDir}; rename/delete resolve each selection in its owning project and act only on exact profile matches; rename preflight rejects destination shadowing with PROFILE_SHADOWED before mutation; six regressions red-then-green. Known limitation: pointers (project pins) of projects with no stored selections cannot be enumerated, so a global rename can leave such a pin dangling (it warns and falls through, as for any missing pointer).
Final verification round 3: FAIL on sha 9be8fb71a6787b4b3191bf6e6369c9486a3b0811d635b5878fade853ab9b7e41 (task subtask_thoth-oracle_1794166776230_04a71d88): prior defects repaired and pin limitation accepted as nonblocking; a valid session selection masks unavailable prospective defaults during global activation. Repair recorded as a task.
Round-3 repair completed: global/project activate and clear validate prospective no-session defaults and the current session result before mutation; session-scope operations validate only the session result (escape hatch when defaults are already unavailable); eight regressions red-then-green asserting no file/KV/refresh/reload/switchModel effects.
Final verification round 4: PASS on sha d2647a8caf8e3e43dc609a512fc79896a8c5cf127433b183206cc7550bb3a521 (fresh Oracle task subtask_thoth-oracle_1794167410363_0354d7f5; delivered verdict valid, mode record, recordDigest match). Nonblocking accepted risks: unenumerated project pins on global rename/delete; non-transactional cross-file/storage/host updates; interactive panel edit/save unit-tested only.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The implementation satisfies AC-1 through AC-9, the pair rule, non-goals and durable deltas. Prior verification blockers are repaired; no new blocking defect was found.",
  "evidence": [
    {
      "id": "binding",
      "kind": "record-validation",
      "locator": ".thoth/changes/opencode-subagent-model-profiles/opencode-subagent-model-profiles.md",
      "claim": "Record-prefix hash matches the assignment; --through verify passes and canonical source digests match. Record and 356 relevant input files remained unchanged throughout validation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "source",
      "kind": "source-review",
      "locator": "Working-tree diff against HEAD 1106ccf6, including untracked profile core, RPC, runtime, CLI and TUI modules",
      "claim": "Reviewed storage/resolution, preset removal, setup defaults, injection, activation safety, native-dialog management, CLI materialization/update/restore, packaging and documentation against the complete contract.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "tests",
      "kind": "execution",
      "locator": "Focused Vitest runs: 12 files/193 tests and 7 files/108 tests",
      "claim": "All 301 tests passed, including clone-draft preservation, cross-project rename/delete, destination shadowing, pair resolution, shipped-default advancement and unavailable-model regressions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "probes",
      "kind": "independent-execution",
      "locator": "Inline no-write probes using current source modules",
      "claim": "Masked-session global/project activate and clear reject unavailable prospective defaults without mutation, refresh, reload or switch. Separate probes confirm runtime/workspace/CLI pair agreement and managed shipped-default advancement while preserving overrides.",
      "basis": "observed",
      "uncertainty": "Independent probes use in-memory storage; focused tests additionally exercise filesystem persistence."
    },
    {
      "id": "package",
      "kind": "execution",
      "locator": "package.json, tsup.config.ts, import('thoth-agents/tui')",
      "claim": "The built TUI export resolves to thoth-agents.model-profiles with a setup function; dist is included in published files.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "smoke",
      "kind": "runtime-artifact",
      "locator": "%TEMP%/thoth-profiles-smoke/{global-plugins.json,native-messages.json,tui.stdout,data/opencode/log/opencode.log}",
      "claim": "OpenCode 2.2.6 loaded server/TUI features and displayed /subagents-model. Cold orchestrator messages use the global profile model; an implicit-model worker child uses that profile model. A cold pinned session uses the project profile.",
      "basis": "observed",
      "uncertainty": "Artifacts precede repairs; the demonstrated loading and model paths remain applicable. Interactive panel edit/save was not live-tested."
    },
    {
      "id": "root-checks",
      "kind": "reported-execution",
      "locator": "Assignment and record Verification section",
      "claim": "Root reports post-repair build, typecheck and check:ci PASS, 1736 focused tests passing, and 13 integration checks passing.",
      "basis": "inferred",
      "uncertainty": "Broad checks were reused rather than rerun; independent focused checks passed on frozen inputs."
    },
    {
      "id": "memory",
      "kind": "recalled-context",
      "locator": "thoth-mem:6507b9fd-e2c7-4e64-a00a-3bca7ad15b10,ae40b98e-150b-425a-af46-3ab44ebee8ef,aedb096a-f05d-4737-b52b-0184e2d7fe85,b5e5d80c-a10c-4bfb-811c-bafd6cc820bc",
      "claim": "Recalled project-scoped context for git:3726a62c-51e1-43ba-a466-57d41c5b7048; expanded the pair-rule record and confirmed it against source. No memory writes or root lifecycle operations.",
      "basis": "observed",
      "uncertainty": "Recall snippets were truncated; current artifacts governed this judgment."
    }
  ],
  "verification": [
    {
      "check": "Record binding and reviewed baselines",
      "method": "Prefix hashing, bundled verify validator and final input fingerprint comparison",
      "outcome": "pass",
      "evidenceIds": ["binding"],
      "reason": "Expected digest matches; inputs remained frozen."
    },
    {
      "check": "AC-1 and AC-2",
      "method": "Core/config source review and focused tests",
      "outcome": "pass",
      "evidenceIds": ["source", "tests"],
      "reason": "Storage, selection, shadowing, virtual default, atomic writes and unsupported-preset handling satisfy the contract."
    },
    {
      "check": "AC-3 through AC-5",
      "method": "Runtime/RPC review, regression tests and independent masked-session probes",
      "outcome": "pass",
      "evidenceIds": ["source", "tests", "probes", "smoke"],
      "reason": "Defaults and injection preserve pair semantics and explicit models. Prospective defaults and current-session results are validated before global/project mutation; the deliberate session escape hatch remains."
    },
    {
      "check": "AC-6",
      "method": "Native-dialog flow review, clone regression tests and built-export import",
      "outcome": "pass",
      "evidenceIds": ["source", "tests", "package", "smoke"],
      "reason": "Required management operations are present; cloning preserves the original unsaved draft."
    },
    {
      "check": "AC-7 and pair-rule regressions",
      "method": "CLI tests and independent pair/update probes",
      "outcome": "pass",
      "evidenceIds": ["source", "tests", "probes"],
      "reason": "Complete agents materialization, status/readback, restoration and managed default advancement behave consistently."
    },
    {
      "check": "AC-8, non-goals and durable deltas",
      "method": "Full diff review, documentation search and canonical baseline comparison",
      "outcome": "pass",
      "evidenceIds": ["source", "binding"],
      "reason": "Documentation reflects profiles without stale preset guidance; no prohibited dependency, version or other-harness implementation changes were introduced."
    },
    {
      "check": "AC-9 and broader validation",
      "method": "Inspect live-smoke artifacts and reuse fresh root checks",
      "outcome": "pass",
      "evidenceIds": ["smoke", "package", "root-checks", "binding"],
      "reason": "Artifacts demonstrate the required runtime outcomes; focused independent validation found no regression."
    }
  ],
  "risks": [
    {
      "description": "Global rename/delete cannot maintain pins in projects without enumerable stored selections; missing pointers warn and fall through. Accepted limitation.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["source", "tests"]
    },
    {
      "description": "Cross-file, plugin-storage and host updates are not transactional. Accepted limitation.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["source"]
    },
    {
      "description": "Interactive panel edit/save remains unit-tested only; live artifacts establish discovery and model execution, not every dialog operation.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["tests", "smoke"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, record PASS and concrete acceptance evidence, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/opencode-subagent-model-profiles/opencode-subagent-model-profiles.md",
    "reviewedRecordSha256": "d2647a8caf8e3e43dc609a512fc79896a8c5cf127433b183206cc7550bb3a521"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `pnpm vitest run src/opencode/profiles` | worker: store/editor/resolver tests green (selection chain, shadowing, reserved default, missing pointer, invalid file, atomic write, drafts, conflict); pair model/variant fix with tests
- AC-2: PASS | `pnpm vitest run src/config src/agents` | worker: 250 tests green; legacy preset keys warn once and are ignored; schema regenerated
- AC-3: PASS | `pnpm vitest run src/opencode` | worker: default parity, profile-first deduplicated chains, project precedence, missing pointer, refresh
- AC-4: PASS | `pnpm vitest run src/opencode` | worker: absent model injected, explicit untouched, session selection respected, non-subagent/unknown agent untouched
- AC-5: PASS | `pnpm vitest run src/opencode` | worker: activation scopes persist/refresh/reload/switchModel, clear, MODEL_UNAVAILABLE, PROFILE_CONFLICT, session-less state/activate/clear
- AC-6: PASS | `pnpm vitest run src/tui`; `pnpm run build`; `import('thoth-agents/tui')` | designer: 30 flow/model tests green incl. variant-only rendering; TUI bundle emitted and resolvable
- AC-7: PASS | `pnpm vitest run src/cli` | worker: install/sync openai profile, agents profile apply/readback/status, update/restore on profiles, dry-run no writes
- AC-8: PASS | stale-preset grep on README/docs; `pnpm run check:ci` | worker: no named-preset guidance remains (only unrelated permission-preset example)
- AC-9: PASS | live OpenCode 2.2.6 isolated smoke | worker: server+tui loaded, /subagents-model in autocomplete; cold first session orchestrator on profile model; implicit-model child on profile role model; project pin beats global (OpenCode SQLite records)
- Root closeout checks (after round-3 repair): `pnpm run build` PASS; `pnpm run typecheck` PASS; `pnpm run check:ci` PASS; `pnpm vitest run src/opencode src/tui src/config src/agents src/cli src/plugin-node-runtime.test.ts` 1736 passed (80 files); `pnpm run integration:verify` 13 passed. One plugin-node-runtime CLI failure pre-existed on HEAD 1106ccf6 (stale thoth-mem 0.7 fake evidence) and was fixed in the fixture.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:34123a2649971751efebf042f9982c936a7f3aa12815e0557f394a782f130d45
- Source: .thoth/specs/cli-installation/spec.md | sha256:e44564236ecfc50a78d227aa5e8d5c3d1feaa88a133f699722c7251c0b7d8f1e
- Source: .thoth/specs/model-catalog/spec.md | sha256:dbf1dce0bd5be1947dc94db328d0ee343f043a3b882894bdb05cae9daf4d4bb2

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
