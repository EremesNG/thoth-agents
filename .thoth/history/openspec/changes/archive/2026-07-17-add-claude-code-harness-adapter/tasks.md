# Tasks: Add Claude Code Harness Adapter

## Scope Notes

- OpenCode remains the default harness; Codex behavior is unchanged.
- Claude Code is a first-class adapter (all capabilities `supported`, no surface
  gate, no capability-gap diagnostics).
- Delivery is plugin-only: a single `.claude-plugin/` package.
- Deferred/non-goals: any harness beyond Claude Code; porting `src/hooks/*`
  OpenCode runtime callbacks to Claude Code command hooks; hosted marketplace
  publishing; thoth-mem replacement.
- Every implementation result must include acceptance evidence: changed files,
  tests run, observed output.

## Phase B0: Types, Registry, Parser, Stubs

- [ ] B0.1 Widen `HarnessId` and register adapters — `src/harness/types.ts`,
  `src/harness/registry.ts`, `src/cli/operations/index.ts`
  - `HarnessId = 'opencode' | 'codex' | 'claude'`; register stub
    `claudeCodeAdapter` and `claudeCodeOperationAdapter`. `DEFAULT_HARNESS` stays
    `opencode`.
  - **Verification**: `pnpm run typecheck` enumerates the remaining non-exhaustive
    `commands.ts` spots and the two tests.

- [ ] B0.2 Extend CLI argument types and parser — `src/cli/types.ts`,
  `src/cli/parser.ts`
  - Add `'claude'` to `InstallAgent` and `OperationHarnessArg`; widen
    `GenerateArgs.harness`; accept `claude` in `parseOperationHarness`,
    `parseInstallArgs`, `parseGenerateArgs`.
  - **Verification**: `pnpm test src/cli/parser` (or focused parser tests) pass.

## Phase B1: Prompt Dialect

- [ ] B1.1 Add Claude Code dialect — `src/agents/prompt-dialects.ts`,
  `src/agents/prompt-dialects.test.ts`
  - `CLAUDE_CODE_PROMPT_CAPABILITIES` (all `supported`),
    `CLAUDE_CODE_PROMPT_DIALECT` (delegation `Task`, user-question
    `AskUserQuestion`, progress `TodoWrite`, `supportedCapabilityProfile`),
    `getPromptDialect('claude')` branch.
  - **Verification**: `pnpm test src/agents/prompt-dialects.test.ts`.

## Phase B2: Writers and Adapter Rendering

- [ ] B2.1 Extract shared helpers — `src/harness/core/package-version.ts`,
  `src/harness/writers/fs-skill-collect.ts`
  - Move `readRootPackageVersion`/`findRootPackageJsonPath` and
    `collectFiles`/`sha256` to shared modules; keep Codex behavior unchanged.
  - **Verification**: `pnpm test src/harness` stays green.

- [ ] B2.2 Subagent writer — `src/harness/writers/claude-code-subagent.ts` (+test)
  - `renderClaudeCodeSubagent({name, description, tools, model, instructions})`
    emits deterministic YAML frontmatter + body; read-only roles get no
    `Write`/`Edit`/`Bash`.
  - **Verification**: colocated test asserts frontmatter shape and per-role tools.

- [ ] B2.3 Plugin-package + skill-layout writers —
  `src/harness/writers/claude-code-plugin-package.ts`,
  `claude-code-skill-layout.ts` (+tests)
  - Emit `.claude-plugin/` artifacts (`plugin.json`, `agents/`, `skills/`,
    `.mcp.json`, `hooks/hooks.json`) with provenance hashes; no surface gate;
    `harness: 'claude'`.
  - **Verification**: colocated tests assert artifact paths and deterministic JSON.

- [ ] B2.4 Claude Code adapter — `src/harness/adapters/claude-code.ts` (+test)
  - Reuse the prompt pipeline with `CLAUDE_CODE_PROMPT_DIALECT`; render six
    subagents, `.mcp.json` (`type:"http"` for url servers), `hooks/hooks.json`,
    skills, manifest; `renderClaudeCodeRootInstructions`; diagnostics empty.
  - **Verification**: `pnpm test src/harness/adapters/claude-code.test.ts`.

## Phase B3: Registry/Operations Test Updates

- [ ] B3.1 Update harness tests — `src/harness/registry.test.ts`,
  `src/cli/operations/index.test.ts`
  - Positive `resolveHarness('claude')`; `SUPPORTED_OPERATION_HARNESSES`
    becomes `['opencode','codex','claude']`.
  - **Verification**: both test files pass.

## Phase B4: Install Layer and Operation Adapter

- [ ] B4.1 Paths + config IO — `src/cli/claude-code-paths.ts`,
  `claude-code-config-io.ts` (+tests)
  - `resolveClaudeCodeTargets`; JSON merge with `.bak` backup and
    skip-if-identical.
  - **Verification**: colocated path/config tests pass.

- [ ] B4.2 Install plan/apply — `src/cli/claude-code-install.ts` (+test)
  - `buildClaudeCodeSetupPlan` (from adapter render), `applyClaudeCodeSetup`,
    `applyClaudeCodeManagedModelOverrides` (frontmatter `model:` ∈
    {sonnet,opus,haiku,inherit}); managed model state JSON.
  - **Verification**: dry-run plan, apply, backup creation, model override tests.

- [ ] B4.3 Operation adapter — `src/cli/operations/claude-code.ts` (+test)
  - status/list/install/update/sync/model-config; builders + `applyClaudeCodePlan`;
    positive disclaimers; `WeakMap` plan-source pattern.
  - **Verification**: `pnpm test src/cli/operations/claude-code.test.ts`.

## Phase B5: CLI Dispatch

- [ ] B5.1 Polymorphic dispatch — `src/cli/operations/types.ts`,
  `src/cli/operations/{opencode,codex,claude-code}.ts`, `src/cli/commands.ts`
  - Add adapter method hooks (`getStatus`, `buildPlan`, `buildModelPlan`,
    `applyPlan`, `defaultModelRoles`); dispatch via `getOperationHarness`;
    generalize `printCodexGeneration`; update help and `install()`.
  - **Verification**: `pnpm test src/cli/commands.test.ts` plus
    `generate --harness=claude --dry-run` smoke run.

## Phase B6: Orchestrator Injection

- [ ] B6.1 Orchestrator main-thread agent — `agents/orchestrator.md` +
  plugin-root `settings.json`
  - Generate the orchestrator agent (body = `renderClaudeCodeRootInstructions`,
    no `tools`, `model: inherit`) and `settings.json` `{ "agent": "orchestrator" }`.
  - **Verification**: adapter test asserts orchestrator agent + settings.json and
    that no SessionStart hook is generated.

## Phase B7-B9: Models, Surfaces, Schema

- [ ] B7.1 Model defaults — `CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS`
  (oracle/deep=opus, others=sonnet); model-config restricted to
  {sonnet,opus,haiku,inherit}.
- [ ] B8.1 Optional pure surface descriptor —
  `src/harness/adapters/claude-code-surfaces.ts` (no validators) for docs/status.
- [ ] B9.1 Generation config — `src/config/schema.ts`
  (`ClaudeCodeGenerationConfigSchema` + `claudeCode` field); run
  `pnpm run generate-schema`; commit `thoth-agents.schema.json`.
  - **Verification**: `pnpm test src/config` + schema diff.

## Phase B10: Docs and Final Verification

- [ ] B10.1 Docs — `README.md` harness section; new
  `docs/claude-code-plugin-packaging.md`, `docs/claude-code-install.md`,
  `docs/claude-code-model-customization.md`; `docs/quick-reference.md` and
  `docs/installation.md` examples.
- [ ] B10.2 Full verification — `pnpm run lint`, `pnpm run typecheck`,
  `pnpm run test`, `pnpm run build`, `pnpm run check:ci`; end-to-end
  `generate`/`install --agent=claude` dry-run then apply.
