# Verification Report: Codex Plugin Packaging

## Completeness

Verdict: PASS.

All tasks in `openspec/changes/codex-plugin-packaging/tasks.md` are marked
complete. The implementation adds Codex plugin package surfaces, a deterministic
plugin package writer, plugin-root skill bundling, explicit fallback
`.agents/skills` mode, conservative hook packaging validation, Codex adapter
integration, and packaging documentation. The implementation preserves the
declared boundaries: it does not implement `install --agent=codex`, mutate user
Codex configuration, automatically enable plugins/hooks, or automate hook trust
review.

## Build and Test Evidence

- `bun run check:ci` — PASS: Biome checked 160 files with no issues.
- `bun run typecheck` — PASS: `tsc --noEmit` completed successfully.
- `bun test` — PASS: 503 tests passed, 0 failed, across 49 files.

Focused evidence from the full test run includes:

- `src/harness/adapters/codex-surfaces.test.ts` validates plugin manifest,
  skills, hook surfaces, fail-closed paths/fields, and unsupported hook shapes.
- `src/harness/writers/codex-plugin-package.test.ts` validates deterministic
  `plugin.json`, `./skills/`, `./hooks/hooks.json`, fixture stability, and hook
  filtering diagnostics.
- `src/harness/writers/skill-layout.test.ts` validates primary
  `.codex-plugin/skills`, explicit `.agents/skills` fallback mode, missing source
  diagnostics, SDD semantic anchors, deterministic manifests, and duplicate-scope
  diagnostics.
- `src/harness/adapters/codex.test.ts` validates default plugin package output,
  explicit fallback-only `.agents/skills`, hook trust/feature diagnostics, no hard
  permission enforcement, and existing Codex agent/config fixtures.
- `src/harness/adapters/opencode.test.ts`, `src/plugin-node-runtime.test.ts`, and
  `src/hooks/skill-sync.test.ts` validate OpenCode behavior remains independent
  of `.codex-plugin/` artifacts.

## Compliance Matrix

| Requirement / Scenario | Result | Evidence |
| --- | --- | --- |
| Package Codex plugin as the primary delivery artifact | PASS | `src/harness/adapters/codex.ts` composes `.codex-plugin/plugin.json` and plugin skills by default; `codex.test.ts` covers default package artifacts. |
| Plugin manifest references package-local assets | PASS | `codex-plugin-package.ts` orders official manifest fields, validates package paths, and converts asset paths to `./` references; writer tests cover deterministic JSON and official-field filtering. |
| Plugin package is separate from future installer activation | PASS | No `src/**` implementation of `install --agent=codex`; docs state package generation does not install, edit user config, enable hooks, or complete trust review. |
| Bundle Codex skills under plugin root | PASS | `skill-layout.ts` defaults to `plugin-package` with `.codex-plugin/skills`; adapter passes plugin output mode by default. |
| Bundled skill artifacts use plugin-local paths and provenance | PASS | Skill layout manifests include source paths, output paths, and SHA-256 hashes; tests validate `.codex-plugin/skills/.oh-my-opencode-lite-manifest.json` fixtures. |
| Missing skill sources are diagnosed without partial deception | PASS | `skill-layout.ts` emits `codex.skill.source_missing` and skips missing content; tests cover missing sources. |
| Treat `.agents/skills` as fallback or development output | PASS | `skill-layout.ts` only emits `.agents/skills` for `repo-local-fallback`; adapter default is `['plugin-package']`; tests cover explicit fallback only. |
| Duplicate skill delivery is diagnosed | PASS | `skill-layout.ts` emits `codex.skill.duplicate_scope_precedence_unverified`, identifying plugin-bundled skills as primary and runtime precedence as unresolved. |
| Package validated Codex plugin hooks conservatively | PASS | `codex-plugin-package.ts` renders only hooks accepted by `validateCodexHookSurface`; unsupported event/handler/async/output/tool-interception cases produce diagnostics and no invalid hook artifact. |
| Hook package diagnostics preserve trust boundaries | PASS | `codex.ts` emits `codex.hooks.plugin_trust.required` with `features.plugin_hooks`, trust review, no automatic enablement, and no hard permission enforcement; tests assert these phrases. |
| Provide a Codex Adapter MVP with existing artifact preservation | PASS | `codex.ts` still renders `.codex/agents/*.toml` and `.codex/config.toml` alongside plugin package artifacts; fixture tests preserve deterministic existing outputs. |
| Codex runtime assumptions are constrained | PASS | Docs and diagnostics model `.codex-plugin/` as distributable assets for future installer/manual enablement; no runtime API or trust automation is required for verification. |
| Codex capability gaps are visible | PASS | Surface/capability diagnostics remain visible for unsupported or unknown runtime controls, hook enforcement, delegation runtime, and parent context injection. |
| Preserve SDD skills portability | PASS | `core/skills.test.ts` and `skill-layout.test.ts` validate requirements-interview/SDD skills render under plugin-bundled Codex paths while preserving phase, artifact, persistence, and review-gate anchors. |
| Full SDD pipeline remains portable | PASS | SDD semantic-anchor tests cover full-pipeline ordering and gating content in bundled skills; no packaging code bypasses specs/design. |

## Design Coherence

- `.codex-plugin/` is the primary Codex package target, while existing
  `.codex/agents` and `.codex/config.toml` remain project-local compatibility
  outputs.
- Skill output is parameterized rather than duplicated, preserving recursive file
  collection, deterministic sorting, SHA-256 provenance, and missing-source
  diagnostics.
- Hook packaging remains conservative: packaging is allowed only for validated
  command hook surfaces and is always paired with feature/trust diagnostics.
- Duplicate plugin/fallback skill scope precedence remains an explicit unresolved
  validation item instead of an assumed runtime ordering.

## Issues Found

None blocking.

Residual risks:

- Codex runtime precedence between plugin-bundled skills and `.agents/skills`
  remains intentionally unresolved and diagnosed for future runtime validation.
- Future installer work must still define explicit user consent, registry/copy
  behavior, plugin enablement, and hook trust-review flows.

## Verdict

PASS. The implementation satisfies the OpenSpec requirements and task plan with
passing repository verification and preserved installer/trust/user-config
boundaries.
