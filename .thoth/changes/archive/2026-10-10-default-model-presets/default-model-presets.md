# Change: default-model-presets

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- Shared OpenAI presets (OpenCode `openai/`, Codex providerless, Pi
  `openai-codex/`) live in `src/config/constants.ts`
  (`CONFIRMED_OPENAI_SUBAGENT_PRESET`, `OPENCODE_OPENAI_ORCHESTRATOR_PRESET`,
  `DEFAULT_MODELS`). Current values: explorer gpt-6-luna/low, librarian
  gpt-6-luna/high, oracle gpt-6-astra/medium, designer gpt-6-sol/medium, worker
  gpt-6-luna/max; OpenCode orchestrator gpt-6-sol/xhigh. `DEFAULT_MODELS.orchestrator`
  is undefined; Pi, Codex and Claude roots use the ambient session model.
- Consumers: `src/agents/index.ts:270–307`, `src/cli/providers.ts`
  `buildOpenAIModelMappings`, `src/harness/adapters/codex.ts`
  `getCodexAgentModel/getCodexAgentEffort`, `src/harness/adapters/pi.ts`
  `roleArtifacts`, `src/cli/model-defaults.ts` `getShippedModelRoles`.
- Claude uses separate aliases in `src/harness/adapters/claude-code.ts:52–103`
  (explorer haiku/low, librarian sonnet/high, oracle opus/high, designer
  sonnet/medium, worker sonnet/medium); `plugin/agents/*.md` are generated.
- Tracked generated assets: `pi/agents/thoth-*.md`, `plugin/agents/*.md`,
  `src/harness/__fixtures__/codex/agent-worker.toml`. Docs with defaults:
  `docs/provider-configurations.md:10–15`, `docs/codex-model-customization.md:8–12`,
  `docs/installation.md:542–546`, `docs/quick-reference.md:98`. Assertions in
  `src/config/constants.test.ts`, `src/agents/index.test.ts`,
  `src/harness/adapters/pi.test.ts`, `src/harness/provider-boundary.test.ts`,
  `src/cli/{providers,codex-install,commands,pi-resources}.test.ts`,
  `src/cli/operations/{codex,opencode}.test.ts`, `src/cli/tui/{App,operations}.test.ts`.
- Effort validation accepts high/xhigh/max for Codex
  (`src/cli/operations/codex.ts` `resolveCodexEffort`, catalog-gated), OpenCode
  (`src/cli/opencode-effort.ts`, catalog-gated) and Pi (`src/cli/pi-effort.ts`;
  runtime `pi-packages/pi-subagents/src/config.ts` `THINKING_EFFORTS`). Model
  availability is dynamic (models.dev catalog, last-known-good cache, manual
  definitions). `openai-codex/gpt-6.1-sol` with xhigh is in active use in the
  operator's Pi environment (observed Oracle runs in this session).
- Upgrade behavior today: Pi `src/cli/pi-resources.ts` `preserveOverrides`
  keeps existing model and effort even when they equal old shipped defaults;
  Codex `src/cli/codex-install.ts` `resolveRoleTomlContent` advances tracked
  generated models but keeps existing effort; OpenCode
  `src/cli/config-io.ts` `writeLiteConfig` regenerates the lite config from
  presets.
- `.thoth/specs/model-catalog/spec.md` requirement **Apply role-specific
  specialist effort** fixes the current efforts and root `xhigh`; it also holds
  two US2 routing scenarios that belong to routing, not effort.

## Intent

Ship new default model/effort presets: OpenAI specialists explorer, librarian,
designer and worker gpt-6-luna/max, oracle gpt-6.1-sol/xhigh; OpenCode
orchestrator gpt-6.1-sol/high; Claude keeps its aliases with explorer effort
raised to medium. Existing installs advance roles still on the previous shipped
defaults while preserving customizations.

## Non-goals

- No root model pinning for Pi, Codex or Claude (ambient root stays).
- No Claude model alias changes other than explorer effort.
- No catalog fetching changes; no change to reset/restore-defaults semantics.
- No live evaluation run in this change.

## Acceptance

- AC-1: Shipped OpenAI presets resolve to explorer/librarian/designer/worker
  gpt-6-luna max, oracle gpt-6.1-sol xhigh, and the OpenCode orchestrator to
  gpt-6.1-sol high, correctly qualified per harness (OpenCode, Codex, Pi), in
  generated artifacts and the Restore-defaults preview.
- AC-2: Claude Code explorer effort is medium; every other Claude alias and
  effort is unchanged.
- AC-3: On update, a Pi, Codex or OpenCode role whose installed model and
  effort exactly equal the previous shipped default advances to the new
  default; any other installed role model/effort value (customization) is
  preserved and remains effective, including in OpenCode's managed lite config;
  omitted effort remains inheritance and is never compared as a legacy effort.
- AC-4: Tracked generated assets, docs and tests reflect the new values;
  durable spec updated by the declared delta.
- AC-5: Local closeout passes (focused tests, `pnpm run check:ci`,
  `pnpm run typecheck`, `pnpm run build`).

## Clarifications

- Resolved by user: Claude keeps its aliases; explorer effort becomes medium.
- Resolved by user: the orchestrator preset applies only to OpenCode.
- Resolved by user: existing installs advance only roles still equal to the
  previous shipped default; customizations are preserved.

## Decisions

- D1: The previous shipped OpenAI preset is kept as a named legacy table used
  only for upgrade comparison (model and effort must both match, after harness
  qualification) so advancement is deterministic and testable.
- D2: The MODIFIED delta replaces the whole requirement block; the two
  misfiled US2 routing scenarios are dropped from this effort requirement
  because routing is specified by the delegation and agent-pack contracts.
- D3: Generated assets are regenerated with `pnpm run build`, never hand-edited.
- D4: OpenCode's lite-config write (`src/cli/config-io.ts` `writeLiteConfig`,
  install/sync with `reset:false`) changes from wholesale replacement to a
  role-level merge for managed model/effort fields: roles equal to the legacy
  shipped pair advance, customized roles keep their values, new managed keys
  are added, and unrelated keys are preserved; the existing backup stays.
  Reset/restore keeps wholesale defaults.
- D5: Comparison uses the complete installed (model, effort) pair against the
  harness-qualified legacy pair; an omitted effort means inheritance and does
  not match a legacy effort. Codex advancement updates every configured-state
  entry it tracks for the role coherently so later syncs do not revert it.

## Durable deltas

- `MODIFIED model-catalog` **Apply role-specific specialist effort** — The built-in OpenAI defaults MUST assign `explorer`, `librarian`, `designer` and `worker` `gpt-6-luna` with `max` effort and `oracle` `gpt-6.1-sol` with `xhigh` effort (provider-qualified where required), and the OpenCode managed orchestrator `gpt-6.1-sol` with `high` effort; other harness roots remain ambient. Claude Code keeps its own aliases with `explorer` at `medium` effort. On update, a role whose installed model and effort equal the previous shipped default MUST advance to the new default, while valid operator overrides MUST remain effective, and every harness that supports effort metadata MUST render it without silently downgrading `max`.
  - GIVEN the built-in OpenAI preset and an installed role still on the previous shipped default; WHEN defaults are resolved or the install is updated; THEN `worker` resolves to `gpt-6-luna` with `max`, `oracle` to `gpt-6.1-sol` with `xhigh`, and customized roles keep their values .

## Plan

Test-first. U1 changes presets, Claude explorer effort, regenerates assets and
updates docs/tests. U2 adds legacy-default advancement for Pi, Codex and OpenCode
upgrades on top of U1's constants. Root runs closeout and a fresh Oracle verifies.

## Tasks

- [x] AC-1: U1 — New shipped presets across harnesses, Claude explorer effort, assets, docs and tests.
  - Outcome: new defaults resolved, rendered and documented
  - Known entrypoints and skill paths: src/config/constants.ts; src/harness/adapters/claude-code.ts; src/agents/index.ts; src/cli/providers.ts; src/harness/adapters/{codex,pi}.ts; src/cli/model-defaults.ts; docs/{provider-configurations,codex-model-customization,installation,quick-reference}.md; test files listed in Exploration; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: this record (Intent, D1, D3)
  - Dependencies: none
  - Output: code, regenerated assets, docs, tests; legacy preset table per D1 exported for U2
  - Owner: thoth-worker
  - Writes: src/config/constants.ts, src/harness/adapters/claude-code.ts, related tests, pi/agents/, plugin/agents/, src/harness/__fixtures__/codex/, the four docs
  - Interface boundaries: no upgrade-path logic (U2); no evals/ edits
  - Focused check and PASS evidence: red then green on preset/rendering/preview tests; build regenerates assets
  - Return milestone: values table per harness and changed files
  - Stop / reassessment: a requested effort rejected by a harness validator for the target model
- [x] AC-2: U1 — Claude explorer effort medium (same unit, cohesive).
  - Outcome: Claude explorer renders medium; other Claude values unchanged
  - Known entrypoints and skill paths: src/harness/adapters/claude-code.ts; plugin/agents/explorer.md
  - Inputs: this record
  - Dependencies: none
  - Output: code, regenerated asset, test
  - Owner: thoth-worker
  - Writes: covered by U1 writes
  - Interface boundaries: none
  - Focused check and PASS evidence: Claude adapter test asserts explorer medium
  - Return milestone: with U1
  - Stop / reassessment: none expected
- [x] AC-3: U2 — Upgrade advances roles still on the previous shipped default.
  - Outcome: Pi, Codex and OpenCode updates advance unchanged legacy defaults and preserve customizations (D4, D5)
  - Known entrypoints and skill paths: src/cli/pi-resources.ts preserveOverrides; src/cli/codex-install.ts resolveRoleTomlContent; src/cli/config-io.ts writeLiteConfig; src/cli/operations/opencode.ts (~1997-2005); their tests; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted U1 legacy table and new presets
  - Dependencies: U1 accepted
  - Output: code and tests
  - Owner: thoth-worker
  - Writes: src/cli/pi-resources.ts, src/cli/codex-install.ts, src/cli/config-io.ts, src/cli/operations/opencode.ts if needed, their tests
  - Interface boundaries: reset paths unchanged; custom values never overwritten
  - Focused check and PASS evidence: tests per harness (Pi, Codex, OpenCode) for legacy-default advance, custom preserve, model-only and effort-only customizations, omitted-effort inheritance, unrelated-key preservation and reset unchanged
  - Return milestone: behavior matrix and test results
  - Stop / reassessment: an install format that cannot distinguish shipped from custom values
- [x] AC-4: U1/U2 — Assets, docs and tests reflect the new values (covered by U1 and U2 outputs).
  - Outcome: no stale default literals remain in tracked assets/docs
  - Known entrypoints and skill paths: repository search for old literals
  - Inputs: accepted U1, U2
  - Dependencies: U1, U2 accepted
  - Output: search evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: search for gpt-6-astra and old effort defaults shows only legacy table and tests
  - Return milestone: before closeout
  - Stop / reassessment: stale literal in an unowned surface
- [x] AC-5: U3 — Local closeout.
  - Outcome: closeout evidence
  - Known entrypoints and skill paths: this record
  - Inputs: accepted U1, U2
  - Dependencies: U1, U2 accepted
  - Output: Verification entries
  - Owner: root
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: focused tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: failures attributable to this change

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

User directed on 2026-10-10: "Vamos a aprovechar para cambiar los valores por defecto" with the exact new values, then answered the three scope questions (the selected upgrade option stated it applies equally to Pi, Codex and OpenCode).
User explicitly selected Oracle plan review. First fresh Oracle returned [REJECT] (B1: OpenCode preservation contradiction); root resolved per recorded user intent (D4, AC-3, U2). Second fresh Oracle returned [OKAY]; noted: test OpenCode active presets and repeated Codex sync coherence. Prior explicit authorization stands.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: a46ebcb78dc0db71d155ebc649ddbd6bd48ffaeab5473fec292258fb3d96625f

- AC-1: PASS | constants/agents/providers/pi/codex adapter and Restore-defaults preview tests | new pairs per harness asserted; 427/427 focused tests pass
- AC-2: PASS | claude-code adapter test; plugin/agents/explorer.md regenerated | explorer haiku/medium, other aliases unchanged
- AC-3: PASS | pi-resources, codex-install, config-io, operations/{codex,opencode} tests | legacy advance, custom/omitted-effort preserve, Codex repeated sync, OpenCode active preset, reset unchanged
- AC-4: PASS | search gpt-6-astra outside tests | only LEGACY_OPENAI_PRESET in src/config/constants.ts; docs and generated assets updated
- AC-5: PASS | pnpm run build, typecheck, check:ci | all exit 0; build produced no further diff

Repair after first final review FAIL (OpenCode omitted variant still rendered shipped variant): src/agents/index.ts clears shipped variant on model-only override; sync->load->render tests added; 266/266 focused tests, typecheck, check:ci pass.
- Source: docs/codex-model-customization.md | sha256:34279678a68d74eba6898e89a6277d44c933ccd8609cce9088f632a170862780
- Source: docs/installation.md | sha256:84d2ce31f92654aae005f4d71f354ab2860335e5ec04647c51d7df47118d0292
- Source: docs/provider-configurations.md | sha256:0c6965143cf41425e5831bcf0773c20315885b13159b7fd74267c6e1ddb48e79
- Source: pi/.thoth-agents-assets.json | sha256:035de5547ecfe6a23638fba9eecbb21787555cf80d1717292fe801cb08b182ae
- Source: pi/agents/thoth-designer.md | sha256:cb762ebf1ed44166fd5623e620090609c178c05fd5cef276eb6048b631f6bc80
- Source: pi/agents/thoth-explorer.md | sha256:1bca1c67237c26606969a4e21c6221919deb5cf264aae4506b88ffbbed3dae51
- Source: pi/agents/thoth-librarian.md | sha256:aa6d37c57f788d237d472392a07b90fadaa4d40208ebb5cc1fe530636e185584
- Source: pi/agents/thoth-oracle.md | sha256:ab4d79af8b12158393c18d32cb8b09d1d3fc347a43662e75e7e898b39617c455
- Source: plugin/.claude-plugin/.thoth-agents-plugin-assets.json | sha256:239fdd1468bb4ccb49a239d5452e38bf69ccd54ef05cc01a95bc0bbb006ec0df
- Source: plugin/agents/explorer.md | sha256:386a0478c7584bd03bc62a9f0a6ed4472a0dc966b466ee6a115dbf943d952c42
- Source: src/agents/index.ts | sha256:637d84f6c19190723c7d8c9b6b083a702e9a6e292297704d56b40a25f317da39
- Source: src/agents/index.test.ts | sha256:5420207ddf7bbddc505c01d3f4c0aad73f301fc52e0063e90eb103c7b1eaf4e4
- Source: src/cli/codex-install.test.ts | sha256:6b744143b6267b7b006ed70294b0749bfc70772ecd1af52006ca3ea243425f7e
- Source: src/cli/codex-install.ts | sha256:0fc9312dd1456193e8cf1af495d0abfb2db08c35a9b066c69eb4155303b3e44d
- Source: src/cli/commands.test.ts | sha256:3f37a2c8e55748cc44a1026fd4cc99a07eb171f400d672cbee0683f34a918a9b
- Source: src/cli/config-io.test.ts | sha256:380f91f1e1a100b14f20e8d93263de37735e802f011764e14169fa7f0f1854a2
- Source: src/cli/config-io.ts | sha256:73a5f2b96467ed63a0245687bafc6bc54387395d1a4471f0caf1db17597abade
- Source: src/cli/operations/codex.test.ts | sha256:470c6a3491c5e53a3653794a6850e2b7e3dad2616f95f8363ff19241e7d15fc9
- Source: src/cli/operations/opencode.test.ts | sha256:71901beb9daedd4b459d5f5e65d5d80ae4bde1aca10aec79c16f701bdaf8a3a0
- Source: src/cli/pi-resources.test.ts | sha256:37c3e4d9806449c0908b041fe6ce17a109350a99f8ed08e0699837b4a84e9c64
- Source: src/cli/pi-resources.ts | sha256:61baa3245c843320d6db0853a8671bfa961e12b216426d1cd24fbcd00fecfbeb
- Source: src/cli/providers.test.ts | sha256:51e99ebdac0a87dbcb150c0a05bea15ab52d1caa01dcf53d88949da125bb88b8
- Source: src/cli/tui/App.test.tsx | sha256:14cf2876e66390a70a91d7fcd1201775e11a0bc08c6147bdbb6fcc3165e22cb3
- Source: src/cli/tui/operations.test.ts | sha256:bba1cbf4b4ccd27ffb284fee28552223f8651237e42843a38aa71ef1d261e5fb
- Source: src/config/constants.test.ts | sha256:9599092b1448ca0e7d74fd68341c60d983c9dafec96863f8b536d270e8e8ed3d
- Source: src/config/constants.ts | sha256:30ba7bead7dd4eaa13e2d910b26a4ca9c7883219ee1ee8a4d7000d002fce8481
- Source: src/harness/adapters/claude-code.test.ts | sha256:79550132b171c637d41fc63554c83d83d40f6f06857ff91e38581cfcb335dbf7
- Source: src/harness/adapters/claude-code.ts | sha256:3175f3c15bb03edd82c96bd6f50cf82af8eaa81abb735a678ad633e286fcdbfb
- Source: src/harness/adapters/pi.test.ts | sha256:820187cb6cdb2f2c3139d6e9c2816fb568c9b9e058052bf25b4ada2bd2ff49a4
- Source: .thoth/specs/model-catalog/spec.md | sha256:82e5b41a914a95bd594614aa18209f4fba2a7be7757af2254a024b64aa784ee3

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
