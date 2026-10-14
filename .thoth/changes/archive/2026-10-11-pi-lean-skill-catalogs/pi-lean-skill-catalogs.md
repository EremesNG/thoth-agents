# Change: pi-lean-skill-catalogs

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Lean children: `pi-packages/pi-subagents/src/runner/sdk-runner.ts`
  `createSession` (~465–540) builds `DefaultResourceLoader` with
  `noSkills: true`, `noPromptTemplates`, `noThemes`, `noContextFiles`,
  `systemPromptOverride` (specialist prompt) and isolated extensions; no
  `additionalSkillPaths`/`skillsOverride`. Full mode uses the SDK default loader
  and drops the specialist prompt override; Thoth declares full unsupported
  (`.thoth/specs/multi-harness-agent-pack/spec.md:79`,
  `src/harness/adapters/pi.ts` `piRuntimeGuidance`).
- `SubagentDefinition` (`src/types.ts`) and `config.ts` definition building
  (~726–733) carry no skills field; `SubagentsConfig`/`readSubagentsConfig`
  expose `session_resources` and `lifecycle_passthrough` only.
- Pi SDK 1.0.2: catalog = name, description, location per skill (progressive
  disclosure); `buildSystemPrompt` appends it to a custom prompt when `read` or
  `bash` is available; `additionalSkillPaths` work with `noSkills: true`;
  `skillsOverride` filters; `DefaultPackageManager.resolve()` yields
  provenance (`scope`, `origin`, source) for user, package, trusted project
  `.pi/skills` and trusted ancestor `.agents/skills`; `SettingsManager.create()`
  defaults `projectTrusted` to true; `ProjectTrustStore` holds persisted trust;
  package resolution can install missing packages.
- Product prompts: root must include exact skill paths
  (`src/agents/prompt-sections.ts` `renderTaskShapingPolicy`); specialists use
  only supplied paths (`renderSubagentRules`, dialect-aware). Generated Pi
  definitions (`src/harness/adapters/pi.ts` `roleArtifacts`,
  `src/harness/writers/pi-agent.ts`) have no skill input; `src/cli/pi-resources.ts`
  `preserveOverrides` keeps model/effort/tools/denied tools/mode only.
- Tests pinning lean: `pi-subagents/test/runner/interaction-bridge.test.ts`,
  real-SDK fixtures with `noSkills: true`, `test/config.test.ts:905–952`,
  `src/pi.test.ts:422`, `src/harness/adapters/pi.test.ts:332`. Docs:
  `docs/agent/harness-packaging.md:173–188`, `pi-subagents/README.md:417,751–759`.
- Observability: `sdk-runner.ts:729–768` returns the child `system_prompt`;
  transcripts include child tool calls (`event-processing.ts`).
- Measured catalog size (installed SDK formatter): five package skills 2,301
  chars vs 19,957 for full bodies; Oracle subset 1,110 chars.
- Live eval evidence (pi-behavioral-evals v2/v3): without skills the Oracle used
  a generic verdict instead of plan-reviewer `[OKAY]`; with parent skills the
  root forwarded the plan-reviewer path for plan review but forwarded no skill
  path for final verification.
- External reference (2026-10-10): nicobailon/pi-subagents offers
  `inheritSkills`, per-agent `skills` and `skillPath`; Claude Code subagents
  discover skills at runtime; OpenCode uses per-agent `permission.skill`.

## Intent

Pi specialists keep lean isolation but discover their own skill catalog
(metadata only) from native, trust-respecting discovery, with an optional
per-specialist filter, so the orchestrator no longer has to route every skill
path. Explicit skill paths in assignments remain a complement, and a specialist
that cannot load a protocol-required skill stops with an explicit blocker.

## Non-goals

- No full resource mode; no context files, prompt templates, themes or root
  lifecycle injection in children.
- No change to Claude Code, Codex or OpenCode.
- No automatic package installation during child startup.
- No new skills.

## Acceptance

- AC-1: With lean resources, a child session's effective system prompt keeps
  the specialist prompt and contains a skill catalog (name, description,
  location) from native discovery for the child cwd: user skills, configured
  packages (including thoth-agents manifest skills), and project skills only
  when the project is trusted; untrusted project skills, context files, prompt
  templates and root injection stay absent; no package is installed.
- AC-2: An optional per-specialist skill filter (frontmatter list of names or
  glob patterns) narrows the catalog; absent filter means all discovered;
  unmatched names produce a diagnostic, not a failure; a global/project switch can
  disable child catalogs (default enabled).
- AC-3: Thoth-generated Pi specialists render the filter only when configured,
  operator edits to it are preserved on sync/update, and Pi guidance tells the
  root that skill paths are optional complements and tells specialists to use
  their catalog or supplied paths and to stop with a blocker when a
  protocol-required skill cannot be loaded; non-Pi prompts unchanged.
- AC-4: Deferred by root decision (2026-10-10): the catalog-driven eval cases
  (plan review without forwarded skill paths; trusted project designer skill)
  move to the pi-behavioral-evals follow-up that adopts the structured result
  contract, because evals/ stays owned by that open change.
- AC-5: Docs, spec and tests updated; local closeout passes (focused tests,
  pi-subagents package tests, `pnpm run check:ci`, `pnpm run typecheck`,
  `pnpm run build`).

## Clarifications

- Resolved by user: keep lean and let specialists discover skills; optional
  per-role filter.
- Resolved by user: project skills — all skills of trusted projects, optional
  role filter.
- Resolved by user: protocol-critical skill unavailable → stop with explicit
  blocker.
- Resolved by user: scope Pi only.

## Decisions

- D1: "Trusted project skills" means native discovery for the child's cwd and
  its ancestors, never an enumeration of every persisted trusted project.
- D2: Trust for the child cwd: reuse the parent session's trust state when the
  child cwd equals or lies within the parent's project; otherwise consult the
  persisted `ProjectTrustStore`; no decision means untrusted. The child never
  relies on a fresh `SettingsManager` default of trusted.
- D3: Catalog discovery runs offline (no package install) through a separate
  skills-only resolution; resolution failures become diagnostics and the child
  starts without the affected entries.
- D4: Filter field is `skills` in agent frontmatter (list of names or globs);
  config switch is `lean_skills` (boolean, default true) in global/project
  `subagents.json`. `disable-model-invocation` skills stay hidden.
- D5: The protocol-required rule is Pi-dialect wording in specialist rules: a
  skill named by the assignment or by the current phase contract that cannot be
  loaded produces a blocker return instead of improvised substitutes.
- D6: The catalog eval cases are deferred out of this change (see AC-4);
  `evals/` remains owned by the open `pi-behavioral-evals` change.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Pi lean children discover a filtered skill catalog** — Lean Pi children MUST keep the specialist prompt and lean isolation while receiving a metadata-only skill catalog from offline native discovery for the child cwd, including user, configured package and trusted project skills and excluding untrusted project skills; an optional per-specialist `skills` filter MAY narrow it and `lean_skills: false` MAY disable it; explicit skill paths in assignments remain valid, and a specialist that cannot load a protocol-required skill MUST return a blocker.
  - GIVEN a trusted project with a designer skill and a lean designer child without a filter; WHEN the child starts; THEN its effective prompt lists that skill's name, description and location without context files or root injection .

## Plan

Test-first. U1 adds catalog discovery, trust handling, filter and switch to the
pi-subagents fork with offline real-SDK tests. U2 updates Thoth Pi generation,
sync preservation and Pi-dialect guidance on top of U1's field names. U3
updates docs and spec text. U4 extends pi-behavioral-evals after that change is
archived. Root runs closeout and a fresh Oracle verifies.

## Tasks

- [x] AC-1: U1 — Lean child skill catalog from offline, trust-respecting native discovery.
  - Outcome: lean children see a catalog of allowed skills with specialist prompt intact
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/sdk-runner.ts createSession; node_modules/@earendil-works/pi-coding-agent dist/core/{resource-loader,package-manager,skills,settings-manager,project-trust,trust-manager}.js; pi-packages/pi-subagents/test/runner/*real-sdk*.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: this record (D1–D4)
  - Dependencies: none
  - Output: runner/config code and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/** (runner, config, types), its tests, README lean section
  - Interface boundaries: lean isolation unchanged except skills; full mode untouched
  - Focused check and PASS evidence: offline real-SDK tests show catalog present, untrusted project skills absent, no context files/templates/root injection, no install attempted
  - Return milestone: field/switch names and test results
  - Stop / reassessment: trust or offline discovery not achievable through SDK seams
- [x] AC-2: U1 — Per-specialist `skills` filter and `lean_skills` switch (same unit).
  - Outcome: filter and switch behave per D4
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/{types,config}.ts
  - Inputs: this record
  - Dependencies: none
  - Output: covered by U1
  - Owner: thoth-worker
  - Writes: covered by U1
  - Interface boundaries: unmatched names diagnostic only
  - Focused check and PASS evidence: tests for names, globs, absent filter, unmatched names, disabled switch
  - Return milestone: with U1
  - Stop / reassessment: none expected
- [x] AC-3: U2 — Thoth Pi generation, sync preservation and Pi-dialect guidance.
  - Outcome: generated specialists and prompts reflect the catalog model
  - Known entrypoints and skill paths: src/harness/adapters/pi.ts roleArtifacts piRuntimeGuidance; src/harness/writers/pi-agent.ts; src/cli/pi-resources.ts preserveOverrides; src/pi.ts syncPiSpecialists; src/agents/prompt-sections.ts renderTaskShapingPolicy renderSubagentRules; src/agents/prompt-dialects.ts; their tests; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted U1 names and semantics
  - Dependencies: U1 accepted
  - Output: code, regenerated pi/agents assets, tests
  - Owner: thoth-worker
  - Writes: listed src files and tests, pi/agents/ via build
  - Interface boundaries: non-Pi rendered prompts byte-identical
  - Focused check and PASS evidence: Pi rendering tests; non-Pi prompt snapshots unchanged; preserve-override test for `skills`
  - Return milestone: changed wording and tests
  - Stop / reassessment: shared wording cannot be dialect-scoped
- [x] AC-5: U3 — Docs and spec text.
  - Outcome: docs describe lean catalogs truthfully
  - Known entrypoints and skill paths: docs/agent/harness-packaging.md; pi-packages/pi-subagents/README.md; C:/Users/EremesNG/.pi/agent/skills/progressive-context-router/SKILL.md
  - Inputs: accepted U1, U2
  - Dependencies: U1, U2 accepted
  - Output: edited docs
  - Owner: thoth-worker
  - Writes: docs/agent/harness-packaging.md, pi-packages/pi-subagents/README.md (if not done in U1)
  - Interface boundaries: no product policy restated in AGENTS.md
  - Focused check and PASS evidence: links resolve; agent-routing and provider-boundary tests pass
  - Return milestone: diff summary
  - Stop / reassessment: none expected
- [x] AC-4: U4 — Deferred catalog eval cases recorded (no work in this change).
  - Outcome: deferral recorded in Acceptance and D6
  - Known entrypoints and skill paths: this record
  - Inputs: root sequencing decision
  - Dependencies: none
  - Output: deferral note
  - Owner: root
  - Writes: this record only
  - Interface boundaries: evals/ untouched
  - Focused check and PASS evidence: no evals/ path in this change's Source list
  - Return milestone: closeout
  - Stop / reassessment: none
- [x] AC-5: U5 — Local closeout.
  - Outcome: closeout evidence
  - Known entrypoints and skill paths: this record
  - Inputs: accepted U1–U4
  - Dependencies: U1–U4 accepted
  - Output: Verification entries
  - Owner: root
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: focused tests, pi-subagents package tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: failures attributable to this change

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

User explicitly selected Implement after review on 2026-10-10.
User explicitly selected Oracle plan review; fresh Oracle returned [OKAY] (risks: prevent install in both separate discovery and DefaultResourceLoader.reload(); D2 needs explicit parent trust evidence and child-local settings without mutating the parent manager; degrade truthfully at the SDK compatibility floor).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 12838bdd3e5c714e4fbd879b606c40ed3b4ecb021761f3e3dc08ff38d95817ef

- AC-1: PASS | pi-subagents offline real-SDK tests (skills-real-sdk.test.ts, interaction-bridge, config) | catalog in child system_prompt with specialist prompt intact; trusted project skills present, untrusted absent; no context files/templates/root injection; no install; parent settings unmutated; package 1485 passed/1 skipped (after P1 repair)
- AC-2: PASS | config/definition tests | `skills` names/globs, absent=all, []=none, unmatched diagnostic; `lean_skills` default true, project overrides global
- AC-3: PASS | src Pi rendering/writer/pi-resources/schema tests; non-Pi prompt SHA snapshots | `agents.<role>.skills` renders frontmatter only when set; sync preserves operator filters; Pi-only guidance; non-Pi prompts unchanged; 373/373 focused root tests
- AC-4: PASS | deferral | catalog eval cases deferred to the pi-behavioral-evals follow-up; no evals/ paths in this change
- AC-5: PASS | build, typecheck, check:ci | all exit 0; docs/agent/harness-packaging.md and pi-subagents README updated
- Source: docs/agent/harness-packaging.md | sha256:49ab156af7724b6f78c6799d59e43569a54bb4c9b423545894c7693580af76a8
- Source: pi-packages/pi-subagents/README.md | sha256:24ef2d4dcb41b9bce302f67d569ecd6755268f924c4d1bb6e3e3045461e8ea44
- Source: pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md | sha256:975264678f394741a7fb692f714966c87c2673776837c8cd1b7e996aa5f91d69
- Source: pi-packages/pi-subagents/src/config.ts | sha256:ef4f5e32c0cd046d2ef4397a609d36d21ca65f8db5e13e432b30f67027c70c7f
- Source: pi-packages/pi-subagents/src/runner/sdk-runner.ts | sha256:81ce6e74ff0869b0d8e6a3a4a330244094be529bacfc8d784e6d8e356ce96ace
- Source: pi-packages/pi-subagents/src/types.ts | sha256:9f849e59e87209fecb39b00acd4b9f0b74ad56a7415aec0f3dfbbfa84b88684f
- Source: pi-packages/pi-subagents/test/config.test.ts | sha256:d77bbf3c4c974e9d50acf91fac048a6c3ccf85ef06f916eb125983729f824455
- Source: pi-packages/pi-subagents/test/runner/interaction-bridge.test.ts | sha256:cb30fc625d84eff49bc954a4895ec01dac94671047f05f17b3388e172d67d2cb
- Source: pi-packages/pi-subagents/src/runner/lean-resources.ts | sha256:3054813ef1356e11ec18842a2d29962b78041c2bf975e165ff4f11bb5544a80b
- Source: pi-packages/pi-subagents/test/runner/lean-resources-trust.test.ts | sha256:796dff9a8593948b6f8b3bb91651c07bdbf7db7ecfdad286f5679f2c51b8847b
- Source: pi-packages/pi-subagents/test/runner/skills-real-sdk.test.ts | sha256:1808a2999d62855e4f8050a4ec56a22e8e6b228274a4cc0f2bff7cd51d61f5d4
- Source: pi/.thoth-agents-assets.json | sha256:2d313b7da2150476ae8157d702fc09a6a2927459d732aee1c89dd0018a24bb2f
- Source: pi/agents/thoth-designer.md | sha256:5c5f278e2ef665db194e8f0bfa9462d45f9d315074c13b08ccbb6fb367fcf19e
- Source: pi/agents/thoth-explorer.md | sha256:17e1219bad5744a139461ac68cc5f54154e1ade72d09f8f710970309458dc029
- Source: pi/agents/thoth-librarian.md | sha256:52589276ba32de92882458e03b7530625bb2dc25caa912bbbab041df2d34ed4a
- Source: pi/agents/thoth-oracle.md | sha256:6c3d8d7596e0b4fe34a416021e0d2c43285a252fb37159450403760533dcc22c
- Source: pi/agents/thoth-worker.md | sha256:0ac01ec04710cfba9b4bc5d0f413d0b97b91599ea604f9d8256d65b48b74287e
- Source: src/agents/prompt-rendering.test.ts | sha256:8b417ee1810fea130728ed4d051e3acadd18b9c3ee92f356ec45ef8bf12becc5
- Source: src/agents/prompt-sections.ts | sha256:54f2af6184679004188a7ee4e502746d84ba0d29656cff60e4de0103e72d7139
- Source: src/cli/pi-resources.test.ts | sha256:fc573e9fdb9ce0c6cad00985a8e2c283b67f95c412e1f10fd9f1cd28dd5ad285
- Source: src/cli/pi-resources.ts | sha256:76a3e52d523b636878e78c07f046f4a8fd4aeef8b9515bd353d6c5e24037259e
- Source: src/config/schema.test.ts | sha256:42d9baaa1635588e3ae066b02f07a9f94f3c7431f7fdaf519a4a42025b3e3e83
- Source: src/config/schema.ts | sha256:7a90a031fcc8e5677e11167cba02a40a55bb7bcbec5bab63b1d04b470152e2ec
- Source: src/harness/adapters/pi.test.ts | sha256:8d831844c4f4e937d683c31534bb58ff01442b50e7d5377065621b236c3eb027
- Source: src/harness/adapters/pi.ts | sha256:a3078002f9eb01b3a61d8e4759eb366dc3f31aed1475032a76e2ab9b52312013
- Source: src/harness/writers/pi-agent.test.ts | sha256:664b9e98630f809062f8242a03d76c9b3862cdc5d496ff7cce8eea60cd3a92bf
- Source: src/harness/writers/pi-agent.ts | sha256:22e7241dfa9cda9ac3dca211d947e1d3a93117f295fef19c5974d28113cc61ca
- Source: thoth-agents.schema.json | sha256:daa56991ae0f506bf1957d564196ee75dbb9b5c8a8aef8beaec24fab963154db
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:26fd368f0c6b32113b96aae0fed137c369b3bcc75f5c9c8e99cf6781a86b67c0

Repair after final review FAIL P1 (lexical containment let a junction/symlink inherit parent trust): lean-resources.ts canonicalizes parent and child with realpath, case-insensitive on Windows, fails closed with a diagnostic when containment cannot be established; one trust decision gates skills and extensions; junction regressions added (lean-resources-trust.test.ts). Root rerun: pi-subagents 75 files 1485 passed/1 skipped; check:ci, typecheck pass.

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
