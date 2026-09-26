# Proposal: Codex Plugin Packaging

## Intent

Make the Codex delivery path package oh-my-opencode-lite as a Codex plugin so
skills and eligible hooks are bundled under the plugin root, not primarily
installed into shared `.agents/skills`. This prepares future
`install --agent=codex` work with a deterministic plugin package that Codex can
consume after explicit install, feature, and trust review steps.

## Scope

### In Scope

- Define `.codex-plugin/plugin.json` as the primary Codex package manifest.
- Package bundled skills under plugin-root `skills/<skill>/SKILL.md` and related
  skill assets, with manifest paths beginning `./`.
- Package validated hook surfaces under a plugin-root path such as
  `hooks/hooks.json`, while preserving diagnostics for activation/trust gates.
- Reclassify `.agents/skills` output as fallback, development, or repo-local
  mode rather than the primary Codex install artifact.
- Preserve existing OpenCode behavior and Codex `.codex/agents/*.toml` /
  `.codex/config.toml` generation unless a design explicitly moves a boundary.

### Out of Scope

- Implementing code in this SDD phase.
- Implementing `install --agent=codex` or enabling Codex plugin features.
- Claiming bundled hooks are trusted, enabled, or enforcement-capable by default.
- Replacing thoth-mem, changing OpenCode plugin packaging, or adding new harnesses.

## Approach

Add a Codex plugin package artifact target to the existing harness adapter model.
The Codex adapter should produce a deterministic plugin package containing
`plugin.json`, bundled skills, optional validated hook configuration, and
fixtures/manifests that prove stable output. Existing project-local Codex agent
and config artifacts remain separate compatibility outputs unless implementation
design deliberately folds specific files into the plugin package. `.agents/skills`
generation becomes explicit fallback/dev/repo-local output with duplicate and
precedence diagnostics.

## Affected Areas

- `src/harness/adapters/codex-surfaces.ts` for plugin manifest, skills, and hook
  surface records.
- `src/harness/writers/skill-layout.ts` and related tests for primary plugin
  skill bundling plus fallback `.agents/skills` behavior.
- `src/harness/adapters/codex.ts` for plugin package artifact planning,
  diagnostics, and boundary preservation.
- `src/harness/types.ts` if plugin package artifacts need a distinct kind.
- `src/harness/__fixtures__/codex/` for deterministic plugin/package fixtures.
- `docs/codex-surface-validation.md` or a new Codex packaging doc for delivery
  strategy, trust gates, and runtime-validation unknowns.

## Risks

- Codex plugin-bundled skill precedence versus duplicate `.agents/skills` scopes
  may require runtime validation.
- Hook packaging may be mistaken for hook activation unless diagnostics and docs
  clearly separate package content from feature/trust enablement.
- Moving too much existing Codex output into the plugin package could regress the
  already validated `.codex/agents` and `.codex/config.toml` behavior.

## Rollback Plan

Keep plugin package generation isolated behind Codex adapter packaging surfaces.
Rollback can disable the plugin-package target and return Codex generation to the
current project-local `.codex/*` and fallback `.agents/skills` outputs without
touching OpenCode runtime behavior.

## Success Criteria

- Codex primary packaging emits deterministic `.codex-plugin/plugin.json` and
  plugin-root `skills/` artifacts with valid relative `./` paths.
- Eligible bundled hooks, when generated, live under plugin-root hooks paths and
  always carry feature/trust diagnostics.
- `.agents/skills` is documented and tested as fallback/dev/repo-local mode, not
  the primary install package.
- Existing OpenCode and current Codex agent/config behavior remain covered by
  regression tests.
