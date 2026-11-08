# Change: opencode-v2-migration

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: high

## Exploration

- Current OpenCode integration (Explorer, 2026-11-07): `package.json` pins `@opencode-ai/plugin` and `@opencode-ai/sdk` at `1.18.2`; agent types already import `@opencode-ai/sdk/v2`. `src/index.ts:28-350` default-exports a v1 `Plugin` returning `{name, agent, tool, mcp, config, event, tool.execute.after}`; no `chat.*`, `permission.ask`, `tool.execute.before` or `experimental.*` hooks.
- Agents: six roles rendered by `src/agents/index.ts:285-389` with `description/prompt/model/variant/temperature/steps/color/permission/mode`; the `config` hook merges agents, models, MCPs, LSP, the `/thoth-init` template command (`src/harness/opencode-init-command.ts`) and `default_agent`.
- Tools: six `tool()`+`tool.schema` tools in `src/tools/lsp/tools.ts` and `src/tools/ast-grep/tools.ts`.
- Delegation: host-owned native `task`; prompts assume `task`, `task(background=true)`, `task_status`, `task_id`, `@role` (`src/agents/prompt-dialects.ts:145-179`); post-tool hooks rewrite `task` output (`args.subagent_type`, `output.output`, `<task_result>`) in `src/hooks/delegate-task-retry`, `src/hooks/oracle-gate-verdict`, `src/hooks/json-error-recovery`.
- Events/client: `src/hooks/foreground-fallback/index.ts` consumes `message.updated`, `session.error`, `session.status`, `subagent.session.created`, `session.deleted` and calls `session.messages/abort/promptAsync` with a 500 ms replay; `src/utils/tmux-session-manager.ts` and `src/utils/tmux.ts` attach panes via `ctx.serverUrl` and `opencode attach`; `src/hooks/auto-update-checker/**` uses `tui.showToast` and a `%LOCALAPPDATA%/opencode` cache.
- CLI: writes exact-version `plugin` entries and `agent.explore/general.disable:true` (`src/cli/config-io.ts:109-139`); main config ignores `OPENCODE_CONFIG_DIR` (`src/cli/paths.ts`); owned skills copied to `~/.config/opencode/skills` (`src/cli/owned-skills.ts:149`); host version detected but never gated (`src/cli/system.ts:117-190`, `src/cli/install.ts:128-151`).
- OpenCode v2 contracts (Librarian, tag-pinned `anomalyco/opencode` v2.2.5; local `@opencode/cli@2.2.5`): packages `@opencode/plugin`, `@opencode/client`, `@opencode/sdk` (no `@opencode-ai/*` 2.x). Entry `Plugin.define({id, setup(ctx)})`; domains `agent/command/event/mcp/permission/session/skill/tool/...`, no `ctx.client`, `ctx.$`, `ctx.config` or server URL. Agents via `ctx.agent.transform` (`update` creates, `default`, `remove`; `system`, model `{providerID,id,variant}`, ordered permissions, no `prompt/temperature`). Native delegation tool `subagent` `{agent,description,prompt,model?,sessionID?,background?}` returning `<subagent sessionID state>`; no `task` alias, no `task_status`; default nesting depth 1; background completion wakes the owner natively. Events via `ctx.event.subscribe({types})`. Default paths are XDG-style (`~/.config|~/.cache|~/.local/share/opencode`) honoring `XDG_*` and `OPENCODE_CONFIG_DIR`; config key `plugins` (legacy `plugin` normalized).
- Spike (Worker, scratch `%TEMP%/thoth-oc2-spike`, no model calls): minimal `Plugin.define` plugin loads in local 2.2.5 with agent, tool, skill and command registered and no warnings. Zod `4.1.8` schemas type-check and convert to JSON Schema via host fallback (`core/src/tool/runtime.ts:135-171`). `ctx.skill.transform(e => e.add({id,name,path,content,description?}))` with `path` = package `SKILL.md`. Commands are `{name, description?, execute({sessionID,prompt,delivery})}` and may `switchAgent` then `prompt`. Permission rules `{action,resource,effect: allow|deny|ask}`, last match wins, unmatched = ask; actions `read, edit, shell, subagent, webfetch, external_directory, skill`; `permission.evaluate` sees the calling agent and can deny. `retry` hook gets `{sessionID,agent,model,error{type,...},attempt,decision}`; awaiting `switchModel` then `decision={retry:true,delay:0}` retries on the new model. Request order is agent `system`, frozen initial instructions, chronological messages: per-call `context.system` edits invalidate the cached history prefix, while keyed instructions (`ctx.session.instructions.entry.put`) freeze at first preparation and later changes become appended update messages. Compaction replaces the history prefix by design. No server-plugin toast API; `opencode attach` no longer exists.
- Affected canonical specs: `cli-installation` (owned OpenCode skills, plugin pinning, runtime version checker, update guidance) and `multi-harness-agent-pack` (OpenCode verdict delivery). Bundled skills text that names the OpenCode `task` tool also changes.

## Intent

Make thoth-agents a native OpenCode v2 (>= 2.2.5) plugin built on `@opencode/plugin`, preserving the six-role pack, delegation, Oracle gate verdicts and CLI-managed install, and adopting v2 capabilities: package-provided skills, native retry model fallback, host-enforced role permissions, compaction state preservation and cache-safe session instructions, while keeping provider prompt-cache prefixes stable.

## Non-goals

- OpenCode v1 compatibility or a dual v1/v2 export.
- Using `experimental.idle`; native background-completion wakeups are relied on.
- Replacement tmux integration or runtime update notifications (both removed).
- Changes to Codex, Claude Code or Pi harness behavior beyond shared text that names OpenCode tools.
- New roles, new MCP servers, OpenCode TUI/desktop plugins, package version bumps or releases.

## Acceptance

- AC-1: The plugin is a `Plugin.define({id:"thoth-agents", setup})` default export from `@opencode/plugin@2.2.5` that loads in local OpenCode 2.2.5; `@opencode-ai/plugin` and `@opencode-ai/sdk` are removed from dependencies and imports.
- AC-2: `setup` registers the six roles through `ctx.agent.transform` (system prompt, `{providerID,id,variant}` model from the existing model-chain resolution, mode, color, steps), makes `orchestrator` the default agent and removes native `explore` and `general`.
- AC-3: Each role's current permission intent is translated into ordered v2 rules, and `permission.evaluate` denies `subagent` actions from every non-orchestrator role.
- AC-4: The six LSP/AST tools, built-in MCP servers, a callback `/thoth-init` command (switch to orchestrator, submit the init prompt) and the five owned skills (from the installed package `skills/<name>/SKILL.md`) are registered through v2 domain APIs, resolving to package paths whenever no same-ID copy exists in a host-discovered OpenCode skills directory (OpenCode 2.2.5 applies config-discovered skills after external plugins, so such copies take precedence; see AC-11).
- AC-5: OpenCode prompt dialect and bundled skill text use the native `subagent` contract (`agent`, `description`, `prompt`, `background`, `sessionID` continuation, native completion wakeup) and no longer mention `task`, `task_status`, `task_id` or `@role` dispatch for OpenCode; OpenCode root guidance states that Oracle gate results delivered as background completions carry no verdict and require the explicit compact-validator fallback.
- AC-6: Delegation retry guidance, Oracle gate verdict delivery and JSON error recovery run on v2 `tool` `execute.after` for `subagent` results: a completed foreground Oracle gate result gets exactly one appended `thoth-gate-verdict` line; `running` placeholders (explicit `background:true` or host-backgrounded calls) and non-gate results are left unchanged; background completions admitted later as synthetic `<subagent ... state="completed">` messages are a declared OpenCode capability gap with no plugin mutation.
- AC-7: Model fallback uses the v2 `retry` hook with `switchModel` across the configured fallback chain, bounded to one switch per chain entry with no repetition, preserving operator-selected models; the abort/replay fallback and its event handling are removed.
- AC-8: A `compaction` hook carries thoth state (active `.thoth/changes/<id>` records and running delegated child sessions) into the compaction result, and that state is maintained through keyed session instructions rather than per-call `context.system` edits.
- AC-9: No hook rewrites, reorders or prepends to the agent system prompt, tool list or prior messages per request; any dynamic content is deterministic and lives in keyed instructions or is appended after existing messages.
- AC-10: The tmux integration (`src/utils/tmux*`) and the runtime auto-update checker (`src/hooks/auto-update-checker/**`) are removed with their configuration surface.
- AC-11: The CLI writes exactly one pinned `thoth-agents@<version>` entry under the v2 `plugins` key (migrating managed entries from legacy `plugin`), resolves OpenCode config via `OPENCODE_CONFIG_DIR`/`XDG_CONFIG_HOME`/`~/.config/opencode`, rejects OpenCode below 2.2.5 before writing, stops writing `agent.*.disable`, stops copying owned skills, and, when legacy same-name copies of the five owned skills exist in the global OpenCode skills directory, moves them only after explicit operator confirmation (interactive prompt, or in non-interactive runs only a dedicated explicit flag) to a new unique, no-clobber backup under a hidden (dot-prefixed) directory segment, which OpenCode 2.2.5 skill scanning never traverses from any discovery root, never deleting or overwriting anything and failing closed (originals untouched, warning) when a move fails; without confirmation (including non-interactive runs) it changes nothing and warns that the copies shadow the packaged skills; dry-run and status report the copies and the planned move.
- AC-12: Routed `docs/agent/` documentation reflects the v2 contracts, and `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` and focused tests for every touched area pass.

## Clarifications

- Compatibility: user selected v2 only (>= 2.2.5), consistent with the repository rule to ignore backward compatibility.
- v2 capabilities: user selected package skills, retry/switchModel fallback, enforced permissions, `experimental.idle`, `compaction` and `context`; after the spike the user chose not to use `experimental.idle`.
- Prompt caching: user requires hooks not to break cache hits.
- Update checker: user chose removal after the spike showed no server-plugin toast API.
- tmux: user chose removing the integration after the spike showed `opencode attach` and the server URL are gone.
- Pre-existing owned-skill copies: the legacy installer left no ownership marker, so copies cannot be distinguished from user copies; user first chose no deletion, runtime same-ID override by the plugin, and an installer notice.
- After final verification round 3 showed OpenCode 2.2.5 has no supported plugin-side precedence over config-discovered skills (`core/src/plugin/supervisor.ts:98-101`, `plugin/internal.ts:269-283`, `config/plugin/skill.ts:179`, `state.ts:19,197,261,269`; no priority field in `plugin/src/promise/skill.ts:6-16`), the user chose: installer moves legacy copies to a backup only after explicit confirmation, never deleting; otherwise warn.

## Decisions

- Single v2 implementation; no v1 `server()` export; minimum host OpenCode 2.2.5.
- `@opencode/plugin@2.2.5` is a type-only devDependency: `Plugin.define` is an identity helper and the package pulls the full host tree (`@opencode/ai`, `@opencode/client`, `effect`), so the entry exports a plain object typed with the v2 definition and no runtime import of `@opencode/plugin` ships.
- Package manifest adds `exports` (`.` -> `dist/index.js`/`dist/index.d.ts`, plus `./package.json`, `./dist/*`, `./skills/*`, `./plugin/*`, `./pi/*`, `./thoth-agents.schema.json`): the pinned host resolver (`packages/plugin/src/host.ts:25-57`, used for local and npm packages by `core/src/plugin/module.ts:102-116`) ignores `main`; the smoke failed to load the plugin without it.
- Implementation findings accepted by root: agent `temperature` is dropped (no v2 runtime field); host `lsp` overrides are a v2 capability gap (no config read API), LSP tools use built-in defaults; permission rules use the real host actions verified in pinned core (`read, edit, shell, subagent, glob, grep, question, todo, webfetch, skill, external_directory`, MCP `exa_*`), with `list/codesearch/lsp` read intent and most-restrictive merging; keyed instructions survive compaction (`projector.ts:851`, `instruction-state.ts:139-153`) so the compaction hook preserves host summarization; OpenCode root prompt cap raised by 225 characters after trimming for mandatory `subagent` guidance.
- Keep Zod 4 for tool schemas (host converts via `toJSONSchema`); restrict schemas to JSON-Schema-representable types.
- Register owned skills from the installed package with absolute `SKILL.md` paths and parsed content; the plugin cannot override config-discovered same-ID copies in 2.2.5, so the installer handles legacy copies by confirmed, reversible move into `$XDG_DATA_HOME/thoth-agents/.opencode-legacy-skills/` (default `~/.local/share/thoth-agents/.opencode-legacy-skills/`), never deleting; without confirmation it warns. Isolation relies on the host scanner skipping every dot-prefixed entry during traversal from any root (pinned `core/src/config/plugin/skill-scan.ts:9,18`), so no effective configuration source (global, project, explicit file, inline, managed) whose root is an ancestor of the backup can discover it; enumerating every discovery root from a global installer was rejected by plan review as unbounded. Residual, documented out of scope: a user configuration naming a skill root inside the backup itself or a user-created non-dot symlink into it. Plan review also required: source-distinct, exclusively created run directories; same-realpath sources deduplicated; same-volume rename only (cross-device or any error leaves the original and warns). Event-timing re-registration workarounds are rejected as racy.
- `/thoth-init` becomes a plugin callback command (`switchAgent` to orchestrator, then `prompt`), preserving incoming delivery.
- Role boundaries: ordered agent permission rules (broad defaults first, narrow exceptions last) plus `permission.evaluate` caller enforcement for `subagent`.
- Cache rule: never mutate `context.system`, tools or prior messages per request; durable evolving state uses keyed session instructions (`ctx.session.instructions.entry.put`), compaction is the only accepted prefix reset.
- `experimental.idle` is not used; tmux integration and runtime update checker are removed.
- Oracle verdicts on OpenCode are delivered only on completed foreground `subagent` tool results via `execute.after`. Background completions are admitted by the host as synthetic messages with no mutable admission hook (pinned 2.2.5 `core/src/session/session.ts:286-324`, `subagent-completion.ts:10-45`); request-local `context` decoration was rejected because a verdict recomputed on later requests can change after record repairs and would rewrite cached history, and a separate synthetic verdict message has no same-turn ordering guarantee. That path is declared a capability gap and root uses the compact validator fallback, as for Codex multi-agent v2 and Claude background runs.
- Model fallback through `retry` + `switchModel` using the existing configured fallback chain.

## Durable deltas

- `RENAMED cli-installation FROM Install owned OpenCode workflow skills globally` **Provide owned OpenCode workflow skills from the plugin package** — The OpenCode plugin MUST register the five canonical thoth-owned workflow skills from its installed package through the OpenCode skill domain; the OpenCode installer MUST NOT copy them into or delete anything from the OpenCode skills directory, and when legacy same-name copies exist there it MUST move them, only after explicit operator confirmation, into a new no-clobber backup below a hidden (dot-prefixed) directory segment that host skill scanning does not traverse, otherwise (including when a move fails) leaving them untouched with a warning that they shadow the packaged skills.
  - GIVEN a complete installed thoth-agents package and a stale `thoth-sdd` copy under `~/.config/opencode/skills/`; WHEN `install --agent=opencode` runs and the operator confirms the move; THEN the copy is moved unchanged into the backup directory and OpenCode 2.2.5 lists all five owned skills once with paths inside the installed package .
- `MODIFIED cli-installation` **Pin the OpenCode plugin to the executing release** — Every OpenCode install or applied update MUST replace all managed thoth-agents plugin entry forms in both the `plugins` and legacy `plugin` keys with exactly one `thoth-agents@<executing-package-version>` entry under `plugins` while preserving unrelated plugin entries and their relative order, and MUST fail without substituting `latest` or partially rewriting configuration when the executing version cannot be resolved.
  - GIVEN OpenCode configuration with a bare, tagged or differently versioned thoth-agents entry under `plugin` or `plugins` plus unrelated plugins; WHEN installation runs from version `0.4.8`; THEN `plugins` contains exactly one `thoth-agents@0.4.8` entry, no thoth-agents entry remains under `plugin`, and unrelated plugins keep their relative order .
- `ADDED cli-installation` **Require OpenCode 2.2.5 or later** — OpenCode installation and update MUST parse the detected host version and MUST fail before writing any configuration when OpenCode is missing, unparseable or older than 2.2.5.
  - GIVEN an OpenCode host reporting version 1.18.2; WHEN `install --agent=opencode` runs; THEN it fails with a message requiring OpenCode 2.2.5 or later and writes no configuration .
- `MODIFIED cli-installation` **Prohibit runtime self-update mutation** — The OpenCode plugin MUST NOT run a runtime version checker, rewrite plugin configuration, invalidate package-manager state or invoke package installation; release changes MUST require an explicit CLI install or Update action.
  - GIVEN OpenCode is running a pinned release and a newer release exists; WHEN the plugin runs; THEN it performs no version check, notification, configuration rewrite or installation, and the operator updates through the CLI .
- `MODIFIED cli-installation` **Document the explicit update contract** — CLI help, status and operation messaging, and routed public installation guidance SHALL describe exact OpenCode version pinning, the minimum OpenCode host version, the last complete CLI-managed version, native marketplace independence, and the complete CLI-driven update path consistently.
  - GIVEN installation and update help or documentation; WHEN an operator reads the OpenCode guidance; THEN it explains the exact-version pin, the OpenCode 2.2.5 minimum and that re-running the latest CLI installer or applying Update is the supported update mechanism .
- `MODIFIED multi-harness-agent-pack` **Delivery-time Oracle gate verdicts** — Each harness integration MUST validate Oracle gate envelopes at native result delivery with the bundled validator and add exactly one compact `thoth-gate-verdict` line per delivered message (Pi background completion notifications, `subagent_result` and task-mode `subagent_run` results, completed foreground OpenCode `subagent` tool results, Claude Code `SubagentHandback` reports delivered to the root as `<agent-message>` prompts and completed foreground `Agent` results whose content carries the report, Codex multi-agent v1 `wait_agent` results) without altering the envelope, MUST leave non-Oracle and non-gate results unchanged, and root MUST NOT re-emit an envelope to validate it when a verdict was delivered; where a delivery path exposes no native hook (Codex multi-agent v2 `FINAL_ANSWER` inter-agent messages, Claude Code background runs without hand-back, OpenCode background `subagent` completions admitted as synthetic messages), the integration MUST declare that capability gap and root MUST use the explicit validator fallback, which MUST print only the compact summary.
  - GIVEN an OpenCode root whose foreground `subagent` call to the Oracle completes with a valid plan-review envelope; WHEN the tool result is delivered; THEN exactly one `thoth-gate-verdict` line reporting valid, plan-review and the verdict is appended without altering the envelope, while a background Oracle completion arrives without a verdict and root uses the explicit validator fallback .
- `ADDED multi-harness-agent-pack` **Native OpenCode v2 plugin integration** — The OpenCode integration MUST be a `@opencode/plugin` v2 plugin that registers the six roles, tools, MCP servers, `/thoth-init` and owned skills through OpenCode domain APIs, delegates through the native `subagent` tool, enforces role delegation boundaries through OpenCode permissions, and MUST NOT rewrite the system prompt, tool list or prior messages per request.
  - GIVEN OpenCode 2.2.5 with thoth-agents installed; WHEN a session starts and the orchestrator delegates; THEN the six roles are listed with `orchestrator` as default, delegation uses `subagent`, a non-orchestrator `subagent` call is denied, and successive requests keep a byte-stable system prompt and message prefix .

## Plan

Approach: replace the v1 entry with one `Plugin.define` setup that composes small registration modules, each owning one v2 domain, so units can be implemented and tested independently.

- Migration boundary: `@opencode/plugin@2.2.5` (+ `@opencode/schema` types if required) is added alongside the legacy `@opencode-ai/*` packages, which stay installed so not-yet-migrated modules keep compiling; legacy dependencies are removed only by the final legacy-removal unit after every consumer is migrated, followed by the full repository typecheck.
- Core unit (Worker A): new `src/index.ts` composing `registerAgents`, `registerTools`, `registerMcp`, `registerCommand`, `registerSkills`, `registerDelegationHooks`, `registerSessionHooks`; agent renderer emits v2 runtime fields; permission translator from current permission maps to ordered rules; `permission.evaluate` caller enforcement; tools on `ctx.tool.transform` with existing Zod schemas; callback `/thoth-init`; package skill registration; removal of tmux and auto-update checker and their config/test surfaces; migration of `src/delegation/project-id.ts` off `PluginInput['$']` (or its removal if it has no remaining caller). `registerDelegationHooks` and `registerSessionHooks` are created as no-op modules with fixed signatures `(ctx) => Promise<void>` for the next units.
- Delegation unit (Worker B, after core): fill `registerDelegationHooks` (`tool` `execute.after` for `subagent`: retry guidance, gate verdict only on `status:"completed"` foreground results, JSON recovery; `running` placeholders untouched; background synthetic completions documented as a capability gap with root fallback) and rewrite the OpenCode dialect in `src/agents/prompt-dialects.ts` plus OpenCode tool references in `skills/**` (including the progress-tool name verified against 2.2.5).
- Session unit (Worker C, after core, parallel with B): fill `registerSessionHooks` (`retry` + `switchModel` fallback replacing `src/hooks/foreground-fallback`, keyed instructions tracking running children via `ctx.event.subscribe` on `session.created`/`session.status`/`session.deleted`, `compaction` carry-over) under the cache rule.
- CLI unit (Worker D, parallel with core): `src/cli/config-io.ts`, `paths.ts`, `system.ts`, `install.ts`, `owned-skills.ts`, operations/status for `plugins` key, XDG/`OPENCODE_CONFIG_DIR` paths, 2.2.5 version gate, no `agent.*.disable`, no skill copy plus managed-copy cleanup, help text.
- Legacy-removal unit (Worker E, after A, B, C, D): remove `@opencode-ai/plugin` and `@opencode-ai/sdk` from `package.json`/`pnpm-lock.yaml`, confirm no import remains, run the full typecheck.
- Docs unit (Worker E, after legacy removal): routed `docs/agent/` updates.
- Verification: focused Vitest per unit; `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`; non-model smoke load of the built plugin in local OpenCode 2.2.5 (agent/skill/command listing as in the spike); fresh Oracle final verification.

Risks: experimental v2 API drift beyond 2.2.5 (pin exact version); permission translation changing effective role boundaries (table-driven tests per role); fallback loops (bounded chain tests); duplicate skill IDs from stale copies (cleanup + test); cache stability is verified structurally (no system/tool/prefix mutation), not by provider measurements.

## Tasks

- [x] AC-1: Core v2 plugin entry scaffolding
  - Outcome: `Plugin.define` entry composing domain registration modules, `@opencode/plugin@2.2.5` added alongside the still-installed legacy packages, `src/delegation/project-id.ts` migrated off `PluginInput['$']` or removed if unused, no-op `registerDelegationHooks`/`registerSessionHooks` modules with fixed signatures.
  - Known entrypoints and skill paths: `src/index.ts`, `package.json`, `pnpm-lock.yaml`, `src/delegation/project-id.ts`, `src/plugin-node-runtime.test.ts`; skills `tdd`, `simplify`.
  - Inputs: accepted Exploration and Decisions of this record; spike prototype at `%TEMP%/thoth-oc2-spike/.opencode/plugins/spike.ts`.
  - Dependencies: none.
  - Output: compiling v2 entry and focused tests.
  - Owner: thoth-worker (A).
  - Writes: `src/index.ts`, `src/opencode/**` (new registration modules), `package.json`, `pnpm-lock.yaml` (adding the v2 package only), `src/delegation/project-id.ts` and its tests, `src/plugin-node-runtime.test.ts`.
  - Interface boundaries: `registerDelegationHooks(ctx)` and `registerSessionHooks(ctx)` signatures consumed by units B and C; legacy packages remain installed until the legacy-removal task.
  - Focused check and PASS evidence: `pnpm run typecheck` (legacy packages still present) and focused Vitest for entry/runtime and project-id tests pass.
  - Return milestone: entry composes and tests pass.
  - Stop / reassessment: v2 API mismatch with spike evidence or required schema package not resolvable.
- [x] AC-2: Agents registered through the v2 agent domain
  - Outcome: six roles, default orchestrator, native `explore`/`general` removed, v2 model shape.
  - Known entrypoints and skill paths: `src/agents/index.ts`, `src/agents/orchestrator.ts`, `src/harness/adapters/opencode.ts`, `src/agents/index.test.ts`, `src/harness/adapters/opencode.test.ts`.
  - Inputs: spike agent editor evidence; existing model-chain resolution in `src/index.ts`.
  - Dependencies: AC-1 core entry (same worker A, sequential).
  - Output: `registerAgents` module and updated renderer.
  - Owner: thoth-worker (A).
  - Writes: `src/agents/index.ts`, `src/agents/orchestrator.ts`, `src/harness/adapters/opencode.ts`, `src/opencode/agents.ts`, related tests.
  - Interface boundaries: role prompt rendering shared with other harness adapters stays unchanged.
  - Focused check and PASS evidence: agent and adapter Vitest suites pass with v2 field assertions.
  - Return milestone: roles render to v2 shape.
  - Stop / reassessment: role prompt semantics would change for other harnesses.
- [x] AC-3: Ordered permission rules and subagent caller enforcement
  - Outcome: permission translator plus `permission.evaluate` deny for non-orchestrator `subagent`.
  - Known entrypoints and skill paths: `src/agents/index.ts:45-160`.
  - Inputs: spike permission evidence (actions, last-match-wins, unmatched = ask).
  - Dependencies: AC-2.
  - Output: translator and hook with table-driven tests per role.
  - Owner: thoth-worker (A).
  - Writes: `src/opencode/permissions.ts`, its tests, `src/agents/index.ts` permission sources.
  - Interface boundaries: OpenCode only.
  - Focused check and PASS evidence: per-role permission tests pass, including deny of `subagent` from explorer/librarian/oracle/designer/worker.
  - Return milestone: permission tests pass.
  - Stop / reassessment: a current permission has no v2 action equivalent.
- [x] AC-4: Tools, MCP, `/thoth-init` and package skills registered
  - Outcome: domain registrations for six tools, built-in MCPs, callback command, five owned skills.
  - Known entrypoints and skill paths: `src/tools/lsp/tools.ts`, `src/tools/ast-grep/tools.ts`, `src/tools/ast-grep/index.ts`, `src/mcp/**`, `src/harness/opencode-init-command.ts`, `skills/**`.
  - Inputs: spike evidence for tool, command and skill shapes.
  - Dependencies: AC-1.
  - Output: `registerTools`, `registerMcp`, `registerCommand`, `registerSkills` modules with tests.
  - Owner: thoth-worker (A).
  - Writes: those source files, `src/opencode/{tools,mcp,command,skills}.ts`, related tests.
  - Interface boundaries: LSP/AST implementations unchanged.
  - Focused check and PASS evidence: tool/MCP/command/skill Vitest pass, including registration from package paths; built plugin smoke listing in local 2.2.5 shows the six roles, `/thoth-init` and five skills (no model calls).
  - Return milestone: smoke listing evidence captured in the report.
  - Stop / reassessment: package skill path unresolvable from the installed package layout.
- [x] AC-5: OpenCode dialect and bundled skill text use `subagent`
  - Outcome: OpenCode prompt dialect and skill references describe the native `subagent` contract and the background-completion verdict gap with explicit compact-validator fallback.
  - Known entrypoints and skill paths: `src/agents/prompt-dialects.ts:145-179`, `src/agents/prompt-sections.ts`, `skills/thoth-sdd/SKILL.md`, other `skills/**` OpenCode mentions.
  - Inputs: spike Q6 evidence; OpenCode 2.2.5 built-in progress tool name (verify in installed host sources).
  - Dependencies: AC-1.
  - Output: updated dialect, skill text and prompt snapshot tests.
  - Owner: thoth-worker (B).
  - Writes: `src/agents/prompt-dialects.ts`, OpenCode-specific prompt sections, `skills/**`, their tests.
  - Interface boundaries: Pi, Codex and Claude dialect output byte-identical.
  - Focused check and PASS evidence: dialect tests pass and other-harness prompt snapshots unchanged.
  - Return milestone: tests pass.
  - Stop / reassessment: shared section text cannot change without affecting other harnesses.
- [x] AC-6: v2 post-tool hooks for subagent results
  - Outcome: `registerDelegationHooks` implementing retry guidance, gate verdict and JSON recovery on `execute.after`.
  - Known entrypoints and skill paths: `src/hooks/delegate-task-retry/**`, `src/hooks/oracle-gate-verdict/**`, `src/hooks/json-error-recovery/**`.
  - Inputs: AC-1 interface; spike evidence for `<subagent>` result shape.
  - Dependencies: AC-1.
  - Output: hook module and updated suites.
  - Owner: thoth-worker (B).
  - Writes: those hook directories, `src/opencode/delegation-hooks.ts`.
  - Interface boundaries: bundled validator invocation unchanged.
  - Focused check and PASS evidence: hook suites pass for: completed foreground Oracle gate result gets exactly one verdict line; repeated hook invocation does not add a second line; explicit `background:true` and host-backgrounded `running` placeholders stay unchanged; non-Oracle and non-gate results stay unchanged.
  - Return milestone: suites pass.
  - Stop / reassessment: `execute.after` cannot mutate the result content.
- [x] AC-7: Retry-based model fallback
  - Outcome: bounded `retry` + `switchModel` fallback replacing abort/replay.
  - Known entrypoints and skill paths: `src/hooks/foreground-fallback/**`.
  - Inputs: spike Q9 evidence; existing fallback chain configuration.
  - Dependencies: AC-1.
  - Output: session hook and tests (no repetition, operator model preserved).
  - Owner: thoth-worker (C).
  - Writes: `src/hooks/foreground-fallback/**` (rewritten or replaced), `src/opencode/session-hooks.ts`.
  - Interface boundaries: fallback configuration schema unchanged unless a field becomes meaningless.
  - Focused check and PASS evidence: fallback tests pass for chain advance, exhaustion and non-retryable errors.
  - Return milestone: tests pass.
  - Stop / reassessment: chain configuration cannot map to `{providerID,id,variant}`.
- [x] AC-8: Compaction carry-over and keyed instructions
  - Outcome: keyed instruction state for running children and active records, carried through `compaction`.
  - Known entrypoints and skill paths: `src/opencode/session-hooks.ts`.
  - Inputs: spike Q7 evidence.
  - Dependencies: AC-1.
  - Output: hook code and tests.
  - Owner: thoth-worker (C).
  - Writes: `src/opencode/session-hooks.ts`, `src/opencode/session-state.ts`, tests.
  - Interface boundaries: `.thoth/` remains read-only for the runtime.
  - Focused check and PASS evidence: tests show state updated only on change and present in compaction output.
  - Return milestone: tests pass.
  - Stop / reassessment: keyed instruction API unavailable in plugin ctx.
- [x] AC-9: Cache-stability guard
  - Outcome: tests asserting no hook mutates system, tools or prior messages and dynamic content is deterministic.
  - Known entrypoints and skill paths: `src/opencode/**`.
  - Inputs: AC-6 and AC-8 hooks.
  - Dependencies: AC-6, AC-8.
  - Output: guard tests.
  - Owner: thoth-worker (C).
  - Writes: `src/opencode/cache-stability.test.ts`.
  - Interface boundaries: none.
  - Focused check and PASS evidence: guard tests pass.
  - Return milestone: tests pass.
  - Stop / reassessment: a required behavior needs prefix mutation.
- [x] AC-10: tmux and runtime update checker removed
  - Outcome: modules, config fields, tests and references removed.
  - Known entrypoints and skill paths: `src/utils/tmux*.ts`, `src/hooks/auto-update-checker/**`, `src/config/**`.
  - Inputs: user decisions.
  - Dependencies: AC-1 (same worker).
  - Output: removals with no dangling imports.
  - Owner: thoth-worker (A).
  - Writes: removed files, `src/config/**` schema entries.
  - Interface boundaries: CLI status must not report removed features.
  - Focused check and PASS evidence: `pnpm run typecheck` and config tests pass.
  - Return milestone: with AC-1.
  - Stop / reassessment: removal breaks CLI-owned surfaces outside worker A's writes.
- [x] AC-11: CLI v2 config, paths, version gate and skill cleanup
  - Outcome: `plugins` key pinning, XDG/`OPENCODE_CONFIG_DIR` resolution, 2.2.5 gate, no `agent.*.disable`, no skill copy and no deletion with a notice for pre-existing same-name copies, help text.
  - Known entrypoints and skill paths: `src/cli/config-io.ts`, `src/cli/paths.ts`, `src/cli/system.ts`, `src/cli/install.ts`, `src/cli/owned-skills.ts`, `src/cli/operations/opencode.ts`, `src/cli/commands.ts`, their tests.
  - Inputs: Librarian path evidence; durable deltas above.
  - Dependencies: none.
  - Output: CLI changes and tests.
  - Owner: thoth-worker (D).
  - Writes: those CLI files and tests.
  - Interface boundaries: Codex, Claude and Pi CLI flows unchanged.
  - Focused check and PASS evidence: CLI Vitest suites pass, including legacy `plugin` migration, version gate rejection of 1.18.2, no skill copy and a notice without deletion for pre-existing copies.
  - Return milestone: tests pass.
  - Stop / reassessment: a change would require deleting or rewriting user-owned files.
- [x] AC-1: Legacy OpenCode packages removed after consumer migration
  - Outcome: `@opencode-ai/plugin` and `@opencode-ai/sdk` removed from dependencies and lockfile with no remaining import.
  - Known entrypoints and skill paths: `package.json`, `pnpm-lock.yaml`, `src/**`.
  - Inputs: accepted outputs of AC-2 to AC-11.
  - Dependencies: AC-2 to AC-11.
  - Output: dependency removal and full typecheck evidence.
  - Owner: thoth-worker (E).
  - Writes: `package.json`, `pnpm-lock.yaml`.
  - Interface boundaries: none.
  - Focused check and PASS evidence: no `@opencode-ai/` import in `src/**`; `pnpm install` and `pnpm run typecheck` pass.
  - Return milestone: typecheck passes without legacy packages.
  - Stop / reassessment: a remaining legacy import belongs to another unit's surface.
- [x] AC-12: Routed documentation and closeout checks
  - Outcome: `docs/agent/` reflects v2 contracts; repository gates pass.
  - Known entrypoints and skill paths: `docs/agent/{runtime-integrations,cli-installation,harness-packaging,architecture,testing}.md`, `docs/agent/index.md`.
  - Inputs: accepted outputs of AC-1 to AC-11, including legacy package removal.
  - Dependencies: AC-1 to AC-11, including legacy package removal.
  - Output: docs updates and gate evidence.
  - Owner: thoth-worker (E).
  - Writes: `docs/agent/**`.
  - Interface boundaries: none.
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` pass.
  - Return milestone: gates pass.
  - Stop / reassessment: gate failure traced to another unit's surface.
- [x] AC-2: Repair (final verification round 1 FAIL): scalar model variant preserved and configured primary eligible for retry fallback
  - Outcome: a role configured with a scalar model plus variant and a fallback chain registers `{providerID,id,variant}` with the variant, and a retryable error on that configured primary advances through the chain; genuinely external operator selections stay untouched.
  - Known entrypoints and skill paths: `src/opencode/context.ts:45-55`, `src/opencode/agents.ts:22-24`, `src/hooks/foreground-fallback/index.ts:57-66`; skills `tdd`, `simplify`.
  - Inputs: Oracle FAIL evidence `models` (worker model p/a, variant high, chain [p/b,p/c]).
  - Dependencies: none.
  - Output: fix plus actual-loader regression tests.
  - Owner: thoth-worker (repair R1).
  - Writes: `src/opencode/context.ts`, `src/opencode/agents.ts`, `src/hooks/foreground-fallback/**`, `src/opencode/session-hooks.ts`, related tests.
  - Interface boundaries: deps shape consumers in `src/opencode/**`.
  - Focused check and PASS evidence: new real-loader tests pass; `pnpm exec vitest run src/opencode src/hooks src/config`; typecheck.
  - Return milestone: tests pass.
  - Stop / reassessment: fix would change shared model-resolution semantics for other harnesses.
- [x] AC-11: Repair (final verification round 1 FAIL): legacy tuple plugin entries migrated
  - Outcome: managed thoth-agents entries in tuple form (`["thoth-agents@next", {...}]`) under `plugin` or `plugins` are recognized and replaced, leaving exactly one pinned entry under `plugins`.
  - Known entrypoints and skill paths: `src/cli/config-io.ts:112-139`; pinned host `packages/core/src/v1/config/plugin.ts`, `packages/core/src/config/normalize.ts:185-190`.
  - Inputs: Oracle FAIL evidence `migration`.
  - Dependencies: none.
  - Output: fix plus regression tests for string, object and tuple forms in both keys.
  - Owner: thoth-worker (repair R2).
  - Writes: `src/cli/config-io.ts` and its tests.
  - Interface boundaries: unrelated plugin entries keep order.
  - Focused check and PASS evidence: `pnpm exec vitest run src/cli`.
  - Return milestone: tests pass.
  - Stop / reassessment: tuple options carry user data that must be preserved.
- [x] AC-12: Repair (final verification round 1 FAIL): testing guide matches the v2 verdict hook
  - Outcome: `docs/agent/testing.md:170-173` describes the v2 verdict behavior (completed foreground `subagent` results only, existing tail verdict preserved, unwrapped and running results ignored, background fallback).
  - Known entrypoints and skill paths: `docs/agent/testing.md`, `src/hooks/oracle-gate-verdict/hook.ts`.
  - Inputs: Oracle FAIL evidence `docs`.
  - Dependencies: none.
  - Output: corrected documentation.
  - Owner: thoth-worker (repair R2).
  - Writes: `docs/agent/testing.md`.
  - Interface boundaries: none.
  - Focused check and PASS evidence: text matches hook source; `pnpm run check:ci`.
  - Return milestone: with R2.
  - Stop / reassessment: none.
- [x] AC-12: Repair (final verification round 2 FAIL): routed delegation docs and bundled-skills test reconciled
  - Outcome: `docs/agent/agents-and-delegation.md:104-111` and every other routed doc describe completed foreground `subagent` verdict delivery and the OpenCode background fallback gap, and `src/harness/bundled-skills.test.ts:480-489` passes without weakening Claude delivery coverage.
  - Known entrypoints and skill paths: `docs/agent/agents-and-delegation.md`, `docs/agent/testing.md:171-172`, `src/harness/bundled-skills.test.ts:480-489`.
  - Inputs: Oracle round 2 evidence `stale-route`, `doc-test`.
  - Dependencies: none.
  - Output: corrected docs and a passing focused gate.
  - Owner: thoth-worker (repair R3).
  - Writes: `docs/agent/**`; `src/harness/bundled-skills.test.ts` only to scope the Claude assertion to Claude text if rewording alone cannot satisfy it.
  - Interface boundaries: Claude delivery assertions keep their strength.
  - Focused check and PASS evidence: `pnpm exec vitest run src/harness`, full focused selection green, `pnpm run check:ci`.
  - Return milestone: tests pass.
  - Stop / reassessment: the assertion encodes a product rule that conflicts with the OpenCode wording.
- [x] AC-4: Repair investigation (final verification round 3 FAIL): plugin-side precedence over config-discovered skills
  - Outcome: evidence that OpenCode 2.2.5 offers no supported plugin-side precedence mechanism (root accepted; user decision recorded in Clarifications); no code changed.
  - Known entrypoints and skill paths: `src/opencode/skills.ts:54-60`, `src/opencode/skills.test.ts:23-39`; pinned host `packages/core/src/plugin/supervisor.ts:98-101`, `plugin/internal.ts:283`, `config/plugin/skill.ts:178-179`.
  - Inputs: Oracle round 3 evidence `skill-shadow`, `precedence`.
  - Dependencies: none.
  - Output: bounded blocker with host file:line evidence.
  - Owner: thoth-worker (repair R4).
  - Writes: none.
  - Interface boundaries: no deletion or rewrite of user skill files.
  - Focused check and PASS evidence: pinned host evidence cited in Clarifications.
  - Return milestone: blocker report.
  - Stop / reassessment: reached; escalated to the user.
- [x] AC-11: Repair (final verification round 3 FAIL): confirmed backup move of legacy owned-skill copies
  - Outcome: OpenCode install/Update detects legacy copies of exactly the five owned skills (owned registry `src/harness/core/owned-skills.ts`) in the global OpenCode skills directories (`skills/` and `skill/` under the resolved config dir and the legacy hardcoded `~/.config/opencode`, deduplicated by realpath). Confirmation: interactive prompt, or in non-interactive runs only a dedicated explicit flag; otherwise nothing changes and a shadowing warning is printed. Backup root: `$XDG_DATA_HOME/thoth-agents/.opencode-legacy-skills/` (default `~/.local/share/thoth-agents/.opencode-legacy-skills/`), the dot-prefixed segment being the isolation mechanism (host scanner skips dot-prefixed entries, pinned `skill-scan.ts:9,18`); the code asserts the computed backup path keeps that segment and refuses to move otherwise; each run creates a new directory exclusively (`<UTC timestamp>-<random suffix>`, retry on EEXIST, never reuse) with one source-distinct subdirectory per source root, and each copy moves by same-volume rename only to `<run>/<source-label>/<name>`; existing destinations are never overwritten. A failed or cross-device move leaves the original intact and warns; partial runs report exactly what moved. Dry-run and status report copies, the backup path and planned moves without writing.
  - Known entrypoints and skill paths: `src/cli/owned-skills.ts`, `src/cli/install.ts`, `src/cli/parser.ts`, `src/cli/operations/opencode.ts`, `src/cli/commands.ts`, existing legacy-copy notice code; skills `tdd`, `simplify`.
  - Inputs: user decision; Oracle round 3 evidence `skill-shadow`.
  - Dependencies: none.
  - Output: CLI behavior plus tests.
  - Owner: thoth-worker (repair R5).
  - Writes: `src/cli/**` and tests.
  - Interface boundaries: other harnesses' skill installation unchanged; never deletes.
  - Focused check and PASS evidence: CLI tests for confirm, decline, non-interactive without flag, explicit flag, dry-run, status, move failure, cross-device failure, dual-root distinct same-name copies, same-realpath dedupe, pre-existing destination/run directory (no clobber), computed backup path missing the dot segment (refuse); isolated OpenCode 2.2.5 smoke after a confirmed move lists the five skills once with package paths, also with a project `opencode.json` whose `skills` entry names the backup's ancestor (`thoth-agents` data dir), and the backup holds byte-identical copies.
  - Return milestone: tests and smoke pass.
  - Stop / reassessment: confirmation cannot be obtained in a flow that must remain non-interactive.
- [x] AC-12: Repair (final verification round 3 FAIL): plugin skill registration and docs reflect host precedence
  - Outcome: `src/opencode/skills.ts` and its test no longer claim runtime override of config-discovered copies (the misleading mock ordering is replaced by a host-order regression documenting that copies win); docs describe the confirmed backup move and the warning.
  - Known entrypoints and skill paths: `src/opencode/skills.ts:54-60`, `src/opencode/skills.test.ts:23-39`, `docs/skills-and-mcps.md`, `docs/installation.md`, `docs/agent/cli-installation.md`, `docs/agent/runtime-integrations.md`.
  - Inputs: R4 host evidence.
  - Dependencies: AC-11 repair R5 for the final CLI flag name.
  - Output: code comment/test and docs updates.
  - Owner: thoth-worker (repair R6).
  - Writes: `src/opencode/skills.ts`, `src/opencode/skills.test.ts`, `docs/**`.
  - Interface boundaries: registrar signature unchanged.
  - Focused check and PASS evidence: `pnpm exec vitest run src/opencode src/harness`, `pnpm run check:ci`.
  - Return milestone: tests pass.
  - Stop / reassessment: none.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Post-OKAY amendment: user decision on pre-existing owned-skill copies (no deletion, runtime same-ID override, installer notice) narrowed AC-4, AC-11 and the renamed cli-installation delta; reduces destructive scope; full record re-examined at final verification.
Post-round-3 amendment: user decision (confirmed backup move of legacy skill copies) changed AC-4, AC-11 and the renamed cli-installation delta; user selected plan review again: amendment round 1 REJECT (collision safety, isolation), round 2 REJECT (global-only isolation), round 3 fresh Oracle OKAY with validated delivery verdict for record prefix 31c848dcde079a2f9cc92b4ecff8a62ae5b6912bb5a60f2d97d6ac3e8c105762; prior implementation authorization stands.
Final verification round 3: fresh Oracle FAIL (record prefix a302b6f5af690a413264296bc1d26b0b4a68b84942ce7f9fcf3ac14f125fec9a) on AC-4 only: real host applies config-discovered skills after external plugins, so legacy copies shadow packaged skills; all gates and other ACs pass; repair row added.
Final verification round 2: fresh Oracle FAIL (record prefix 4febbd40a802a800283a501b45e4beed4b5a0c747b121c7ed36d6c9db46e4347) on AC-12 only (stale routed delegation doc; docs wording trips a bundled-skills assertion); model and tuple repairs passed independent probes; repair row added.
Final verification round 1: fresh Oracle FAIL (record prefix db4adaa8ea28d2c809a99b06d2b617fe6303efaa825048efd9fda2a0710adfe3) on AC-2, AC-7, AC-11, AC-12; repair rows added to Tasks.
Plan review notes: round 1 REJECT (background verdict delivery, migration ordering) repaired; round 2 fresh Oracle OKAY with validated delivery verdict for record prefix 5967671f682fb96d833aae6950bb9b878c9a968878178dc219992eb2bc8b1662.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1344cfd16f506fd381948e9770ce6c8083c7bbf74c3de4ca3b0c7140f8255311

Final verification round 4: fresh read-only Oracle PASS; validated delivery verdict (valid, final-verification, mode record, recordDigest match). Rounds 1-3 FAIL repaired (R1-R6). Oracle gates: typecheck, check:ci, build passed; focused Vitest 118 files, 2241 tests passed; independent isolated OpenCode 2.2.5 smoke reproduced legacy shadowing before and package paths after the confirmed move. Non-blocking residuals: explicit skill roots inside the backup or non-dot symlinks into it; OpenCode background Oracle completions use the compact validator fallback; provider cache-hit rates not measured.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-12 and the accepted amendments are satisfied. No blocking findings.",
  "evidence": [
    {
      "id": "record",
      "kind": "governance",
      "locator": ".thoth/changes/opencode-v2-migration/opencode-v2-migration.md",
      "claim": "The installed verify validator passes; both canonical source digests match. The reviewed prefix digest remained unchanged through completion.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "gates",
      "kind": "execution",
      "locator": "pnpm run typecheck; pnpm run check:ci; pnpm run build",
      "claim": "All three required gates passed. check:ci reported warnings in unchanged Pi-package files.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "tests",
      "kind": "execution",
      "locator": "pnpm exec vitest run src/opencode src/cli src/agents src/harness src/hooks src/config src/tools src/plugin-node-runtime.test.ts",
      "claim": "118 test files and 2241 tests passed. No timing-only failure or rerun occurred.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "host",
      "kind": "independent-smoke",
      "locator": "OpenCode 2.2.5; isolated temporary environment thoth-oracle-r4-DzAlk2",
      "claim": "Before moving, all five owned IDs resolved to legacy copies. After invoking the built move module, each resolved once to its package path, including with the backup ancestor configured as a skill root. Backups were byte-identical. Six roles, default orchestrator, removed explore/general, thoth-init command and active plugin were observed. Both servers exited and the isolated environment was removed.",
      "basis": "observed",
      "uncertainty": "No model calls were made."
    },
    {
      "id": "move",
      "kind": "source-and-tests",
      "locator": "src/cli/{owned-skills,opencode-skill-consent,install,parser}.ts; src/cli/operations/opencode.ts; src/cli/tui/",
      "claim": "Moves use exactly five fixed registry names, explicit flag or interactive consent, exclusive randomized run directories, source-distinct labels, realpath deduplication, a required hidden path segment and rename-only operations. Destination checks prevent clobbering; errors including EXDEV preserve originals and warn. Preview, status and no-consent paths do not move files. Names are not taken from directory listings or skill metadata.",
      "basis": "observed",
      "uncertainty": "Failure and collision cases use focused filesystem tests; successful moves were additionally reproduced on Windows."
    },
    {
      "id": "runtime",
      "kind": "source-and-tests",
      "locator": "src/index.ts; src/opencode/; src/hooks/; package.json; dist/",
      "claim": "Native v2 domain registration, role permissions, foreground verdict handling and bounded model fallback match the accepted contracts. Legacy packages and runtime OpenCode imports are absent. Public runtime entry and intended asset subpaths are exported.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "cache",
      "kind": "source-and-tests",
      "locator": "src/opencode/{session-hooks,session-state,cache-stability.test}.ts; pinned host session/instruction-state.ts",
      "claim": "No request-context rewrite hook is registered. Dynamic state uses deterministic keyed instructions; current-result additions and compaction preserve existing prefixes. Pinned host code freezes initial instruction values and preserves current values across compaction epochs.",
      "basis": "observed",
      "uncertainty": "Provider cache-hit rates were not measured."
    },
    {
      "id": "diff",
      "kind": "diff-review",
      "locator": "Working tree versus HEAD; docs/; skills/; plugin/; pi/; pnpm-lock.yaml",
      "claim": "Routed documentation reflects v2 behavior and backup recovery. Other-harness generated prompts are unchanged; only the shared skill's OpenCode guidance changed. Removed tmux/update surfaces have no active legacy runtime references. No unrelated implementation drift or secret candidate was found in the reviewed changes.",
      "basis": "observed",
      "uncertainty": "Secret checking was source review and pattern scanning, not exhaustive credential detection."
    }
  ],
  "verification": [
    {
      "check": "Record contract and durable deltas",
      "method": "Installed verify validator, canonical baseline review and independent byte hashing",
      "outcome": "pass",
      "evidenceIds": ["record"],
      "reason": "Declared changes match the reviewed baselines and accepted amendments."
    },
    {
      "check": "AC-1 through AC-4: native integration",
      "method": "Source review, focused tests and isolated real-host listing",
      "outcome": "pass",
      "evidenceIds": ["runtime", "tests", "host"],
      "reason": "Entry, agents, permissions, tools, MCPs, command and package skills satisfy the amended contracts."
    },
    {
      "check": "AC-5 and AC-6: delegation and Oracle verdicts",
      "method": "Prompt, hook, bundled-skill and documentation review with focused tests",
      "outcome": "pass",
      "evidenceIds": ["runtime", "tests", "diff"],
      "reason": "Native subagent guidance and foreground-only verdict delivery are consistent; background fallback is explicit."
    },
    {
      "check": "AC-7: model fallback",
      "method": "Real-loader and retry tests plus implementation review",
      "outcome": "pass",
      "evidenceIds": ["runtime", "tests"],
      "reason": "Configured primary variants survive registration, fallback advances without repetition, and external operator model selections remain untouched."
    },
    {
      "check": "AC-8 and AC-9: compaction and prompt-cache safety",
      "method": "Structural cache guards, session tests and pinned host instruction-state review",
      "outcome": "pass",
      "evidenceIds": ["cache", "tests"],
      "reason": "State evolves through keyed instructions without per-request system, tool-list or prior-message rewrites."
    },
    {
      "check": "AC-10: legacy feature removal",
      "method": "Diff and reference review, typecheck and configuration tests",
      "outcome": "pass",
      "evidenceIds": ["diff", "gates", "tests"],
      "reason": "Tmux, runtime update checking and their configuration surfaces are removed."
    },
    {
      "check": "AC-11: CLI migration and safe backup move",
      "method": "CLI tests, consent-path review and independent built-module Windows smoke",
      "outcome": "pass",
      "evidenceIds": ["move", "host", "tests"],
      "reason": "Pin migration, paths, version gating, consent, preservation, collision handling and non-mutating inspection satisfy the amended contract."
    },
    {
      "check": "AC-12 and cross-harness preservation",
      "method": "Required gates, full assigned test selection and generated-artifact diff",
      "outcome": "pass",
      "evidenceIds": ["gates", "tests", "diff"],
      "reason": "Documentation is consistent and all required checks pass without other-harness prompt drift."
    }
  ],
  "risks": [
    {
      "description": "Explicit skill roots inside the backup or non-dot symlinks into it can rediscover backups; this accepted limitation is documented.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["move", "diff"]
    },
    {
      "description": "OpenCode background Oracle completions require the documented compact-validator fallback. Cache safety is structurally verified, not a guarantee of provider cache-hit rates.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["runtime", "cache", "diff"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root can record this PASS, run closeout validation, and proceed through the archive contract.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/opencode-v2-migration/opencode-v2-migration.md",
    "reviewedRecordSha256": "1344cfd16f506fd381948e9770ce6c8083c7bbf74c3de4ca3b0c7140f8255311"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `pnpm run typecheck`, `pnpm run build`, entry runtime test, isolated host smoke | no `@opencode-ai/` dependency or import; type-only `@opencode/plugin@2.2.5`; OpenCode 2.2.5 `plugin.list` shows `thoth-agents` active, warnings `[]`
- AC-2: PASS | `src/opencode/agents.test.ts`, real-loader `src/opencode/models.test.ts`, host smoke `agent.list` | six roles, orchestrator default, native explore/general absent; scalar model variant preserved (repair R1)
- AC-3: PASS | `src/opencode/permissions.test.ts` (table-driven) | ordered rules per role; `subagent` denied for non-orchestrator roles
- AC-4: PASS | `src/opencode/{tools,mcp,command,skills}.test.ts`, host smoke `command.list`/`skill.list` | `/thoth-init` and five package skill paths listed without legacy copies; host-order regression in `src/opencode/skills.test.ts` shows config copies win, handled by the installer move (repair R6); tools not host-listable (registration and cache tests)
- AC-5: PASS | `pnpm exec vitest run src/agents src/harness` (803 passed) | OpenCode dialect uses `subagent`; other-harness prompts byte-identical
- AC-6: PASS | `src/opencode/delegation-hooks.test.ts` and hook suites (30 passed) | foreground verdict once; running placeholders and non-gate results unchanged
- AC-7: PASS | `src/hooks/foreground-fallback/index.test.ts`, `src/opencode/session-hooks.test.ts` | chain advance, exhaustion, no repetition, operator model preserved; configured scalar primary advances p/a -> p/b -> p/c via real loader (repair R1, 185 tests passed)
- AC-8: PASS | `src/opencode/session-hooks.test.ts` | keyed `thoth.state` written only on change; host summarization preserved
- AC-9: PASS | `src/opencode/cache-stability.test.ts` (7 passed) | no system/tool/prior-message mutation; deterministic prompts, schemas and instructions
- AC-10: PASS | config and CLI suites, schema regeneration | tmux and auto-update checker removed; legacy keys stripped; removed flags rejected
- AC-11: PASS | `pnpm exec vitest run src/cli` (1184 passed), isolated OpenCode 2.2.5 smoke `%TEMP%\thoth-r6-smoke.log` | confirmed `--move-legacy-opencode-skills` move: before, five IDs resolve to legacy copies; after, five IDs resolve once to package paths even with a project `skills` entry naming the backup ancestor; backup SHA-256 identical to originals (repairs R5, R6); string/object/tuple managed entries in `plugin` and `plugins` migrate to one pin, non-empty options warned (repair R2); `plugins` pin, XDG/`OPENCODE_CONFIG_DIR`, 2.2.5 gate, no agent disable, no skill copy/deletion with notice
- AC-12: PASS | `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, focused Vitest (116 files, 2200 tests) | docs updated incl. v2 verdict behavior in `docs/agent/testing.md` (repair R2) and `docs/agent/agents-and-delegation.md`, `docs/skills-and-mcps.md`, `docs/provider-configurations.md` (repair R3; focused selection 117 files, 2223 tests passed); `docs/tmux-integration.md` removed; check:ci warnings only in untouched `pi-packages/**`
- Source: .thoth/specs/cli-installation/spec.md | sha256:8b7774d39f0894011dae4b84083c7be08cf5cb6796a24ca05c28a181b630e007
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:a1718f8de7b9c9dd600f7b0dc6ced9d55f6339b771094306454b2b5ba46a603f

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
