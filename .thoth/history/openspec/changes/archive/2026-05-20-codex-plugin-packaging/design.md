# Design: Codex Plugin Packaging

## Technical Approach

Extend the existing Codex harness adapter from project-local artifact generation
to a two-target packaging model: the primary target is a Codex plugin package
rooted at `.codex-plugin/`, and the existing `.codex/*` plus `.agents/skills`
paths remain compatibility/fallback surfaces. The new package target should
render artifact descriptors only; this change does not implement an installer or
mutate user Codex configuration.

The plugin package will contain a deterministic `.codex-plugin/plugin.json`,
plugin-local skill assets under `.codex-plugin/skills/<skill>/`, optional
validated hook configuration under `.codex-plugin/hooks/hooks.json`, and
fixtures/manifests that record source-to-package provenance and hashes. Existing
Codex agent/config generation remains outside the plugin package unless future
implementation explicitly introduces a supported plugin manifest field for that
content.

## Architecture Decisions

### Decision: Make `.codex-plugin/` the primary Codex package target

**Choice**: Add a Codex plugin package renderer that emits
`.codex-plugin/plugin.json` and plugin-root assets as the primary deliverable for
future Codex install flows.

**Alternatives considered**:

- Continue making `.agents/skills` the main Codex skill delivery path.
- Delay packaging until `install --agent=codex` exists.

**Rationale**: Official Codex plugin docs support plugin-bundled skills and
plugin manifest asset references. Packaging first creates a deterministic,
reviewable artifact for a future installer without writing broad repo/user/admin
skill scopes or claiming activation behavior.

### Decision: Keep existing Codex `.codex/agents` and `.codex/config.toml` output stable

**Choice**: Treat current generated `.codex/agents/{name}.toml`,
`.codex/config.toml`, and MCP snippets as existing project-local Codex outputs,
not as plugin package content for this change unless a validated plugin manifest
field requires movement.

**Alternatives considered**:

- Move all Codex artifacts under `.codex-plugin/` immediately.
- Stop emitting project-local agents/config once plugin packaging exists.

**Rationale**: The current adapter and tests already validate these surfaces.
The user asked to prepare skill/hook delivery first, and preserving existing
agent/config output minimizes regression risk while keeping exact boundaries
explicit.

### Decision: Reclassify `.agents/skills` as fallback/dev/repo-local mode

**Choice**: Rename or parameterize the existing skill layout writer so it can
target plugin-local skills by default and `.agents/skills` only when an explicit
fallback/development/repo-local mode is selected.

**Alternatives considered**:

- Keep one writer hardcoded to `.agents/skills` and add plugin packaging as a
  separate copy implementation.
- Remove `.agents/skills` generation entirely.

**Rationale**: Reusing traversal, sorting, SHA-256, and missing-source
diagnostic behavior avoids duplicate code, while retaining fallback mode supports
current tests and local validation workflows.

### Decision: Include hooks only as validated packaged assets with activation diagnostics

**Choice**: Package only hook definitions that pass `validateCodexHookSurface`
and reference them from `plugin.json` with `./hooks/...`; always return
diagnostics explaining `features.plugin_hooks` and trust review requirements.

**Alternatives considered**:

- Generate project-local `.codex/hooks.json` as the primary hook target.
- Omit all hook packaging until installer work.

**Rationale**: Current research validated plugin hook bundles, but activation is
not equivalent to packaging. Conservative packaging lets users review assets
without implying that hooks are enabled, trusted, or capable of hard enforcement.

### Decision: Treat duplicate skill scope precedence as an explicit unknown

**Choice**: Emit diagnostics when plugin-bundled skills and `.agents/skills`
fallback output overlap, and document runtime validation as a follow-up.

**Alternatives considered**:

- Assume plugin-bundled skills always override `.agents/skills`.
- Block fallback output whenever plugin skills exist.

**Rationale**: The research identified plugin-bundled skill precedence versus
repo/user/admin skill scopes as unresolved. Diagnostics are safer than encoding
an unverified precedence rule.

## Data Flow

```text
codexAdapter.render(context)
  -> getAgentPackContract() / getSkillRegistry()
  -> render existing Codex project-local artifacts
     - .codex/agents/*.toml
     - .codex/config.toml snippets
  -> renderCodexPluginPackage(input)
     -> validate plugin manifest/skills/hooks surfaces
     -> renderCodexSkillLayout({ target: 'plugin-package' })
        -> .codex-plugin/skills/<skill>/...
        -> source/path/hash manifest data
     -> renderCodexPluginHooks(validated hook definitions, if configured)
        -> .codex-plugin/hooks/hooks.json
     -> render plugin.json with ./skills/ and optional ./hooks/hooks.json
  -> optionally render fallback repo skills only when explicitly selected
  -> return artifacts + diagnostics without installing or enabling Codex features
```

## File Changes

Planned implementation files:

- `src/harness/types.ts` — add `plugin-package` or equivalent artifact kind if
  existing `manifest`, `skill`, and `hook-config` kinds are insufficient for
  package-level artifacts.
- `src/harness/adapters/codex-surfaces.ts` — add validated records for official
  Codex plugin manifest fields, plugin-root `skills/`, plugin-root hook bundles,
  and diagnostics for trust/feature gates and duplicate skill scopes.
- `src/harness/adapters/codex-surfaces.test.ts` — verify plugin package surfaces
  are validated and unsupported plugin fields/paths fail closed.
- `src/harness/writers/skill-layout.ts` — parameterize output target so primary
  Codex packaging writes `.codex-plugin/skills/<skill>/...`, while
  `.agents/skills/<skill>/...` remains explicit fallback/dev/repo-local mode.
- `src/harness/writers/skill-layout.test.ts` — update expectations for plugin
  skill paths, fallback mode, missing source diagnostics, duplicate diagnostics,
  deterministic source hash manifests, and SDD semantic anchors.
- `src/harness/writers/codex-plugin-package.ts` — new package writer for
  `plugin.json`, package-local asset manifests, path normalization, and stable
  JSON ordering.
- `src/harness/writers/codex-plugin-package.test.ts` — focused tests for manifest
  schema/paths, `./` relative references, deterministic JSON, hook references,
  and skipped/diagnosed unsupported assets.
- `src/harness/adapters/codex.ts` — compose plugin package artifacts into Codex
  render results as the primary packaging target while preserving existing
  `.codex/*` outputs and adding fallback/duplicate diagnostics.
- `src/harness/adapters/codex.test.ts` — regression tests for project-local
  agents/config, plugin package artifact list, no automatic hook enablement, and
  capability diagnostics.
- `src/harness/__fixtures__/codex/` — add deterministic fixtures for
  `plugin.json`, plugin skill manifest, optional plugin hook config, and updated
  diagnostics.
- `docs/codex-surface-validation.md` — update validated surface matrix for
  plugin manifest, plugin-bundled skills, and plugin hooks.
- `docs/codex-plugin-packaging.md` — document primary plugin packaging strategy,
  fallback `.agents/skills`, future installer consumption, and trust/feature
  gates.

No planned deletion. OpenCode adapter files should change only if tests need new
regression assertions; OpenCode runtime behavior is not part of this package
move.

## Interfaces / Contracts

Proposed writer inputs:

```ts
export type CodexSkillOutputMode = 'plugin-package' | 'repo-local-fallback';

export interface CodexSkillLayoutInput {
  projectRoot: string;
  skills: SkillRegistryEntry[];
  surfaceId: string;
  outputMode?: CodexSkillOutputMode;
}

export interface CodexPluginPackageInput {
  projectRoot: string;
  packageName: string;
  version: string;
  description: string;
  skills: SkillRegistryEntry[];
  includeHooks?: boolean;
  fallbackRepoSkillsEnabled?: boolean;
}
```

Manifest contract:

- `plugin.json` MUST be valid deterministic JSON with official Codex plugin
  fields only.
- `skills` entries MUST use plugin-root relative paths such as `./skills/`.
- `hooks` entries, when present, MUST use plugin-root relative paths such as
  `./hooks/hooks.json` or documented inline object forms.
- All generated package paths MUST stay under `.codex-plugin/` except explicit
  fallback `.agents/skills` mode.
- Generated diagnostics MUST distinguish packaging from installer activation and
  hook trust enablement.

## Testing Strategy

- Add writer tests for deterministic `plugin.json` generation, official field
  filtering, relative `./` paths, package-root path normalization, and stable
  fixture output.
- Add skill bundling tests proving all bundled skills render under
  `.codex-plugin/skills/`, retain SDD semantic anchors, preserve source hashes,
  and diagnose missing sources.
- Add fallback tests proving `.agents/skills` output appears only when an
  explicit fallback/dev/repo-local mode is selected.
- Add duplicate tests proving overlapping plugin and fallback skill names emit a
  precedence-risk diagnostic without claiming a runtime order.
- Add hook packaging tests proving validated command hook definitions can be
  bundled under `.codex-plugin/hooks/hooks.json`, while unsupported hook features
  produce diagnostics and no hook artifact.
- Add adapter regression tests proving existing `.codex/agents/*.toml`,
  `.codex/config.toml`, capability diagnostics, and OpenCode adapter behavior are
  unchanged.
- Run `bun run check:ci`, `bun run typecheck`, focused harness tests, and
  `bun test` after implementation.

## Migration / Rollout

1. Add validated Codex plugin package surfaces and docs before changing render
   output.
2. Introduce the plugin package writer with fixtures and no installer side
   effects.
3. Switch primary Codex skill packaging from `.agents/skills` to
   `.codex-plugin/skills` in adapter output.
4. Add explicit fallback/dev/repo-local mode for `.agents/skills` and duplicate
   diagnostics.
5. Add conservative hook package support only for validated hook definitions and
   keep feature/trust diagnostics visible.
6. Preserve existing `.codex/agents` and `.codex/config.toml` behavior with
   regression tests.
7. Defer `install --agent=codex`, plugin enablement, and hook trust automation to
   a future SDD change that consumes this package.

## Open Questions

- What is Codex runtime precedence when the same skill name exists in both a
  plugin-bundled `skills/` path and `.agents/skills`? This needs runtime
  validation before removing duplicate diagnostics.
- Should future installer work copy `.codex-plugin/` into a Codex plugin
  registry location, reference it in place, or expose both options?
- Which currently validated project-local artifacts, if any, can be represented
  as official plugin manifest `apps`, `interface`, or `mcpServers` fields without
  losing current behavior?

## Non-Goals

- Do not implement `install --agent=codex`.
- Do not modify user `~/.codex/config.toml`, enable `features.plugin_hooks`, or
  complete Codex trust review automatically.
- Do not claim plugin hooks provide hard security or runtime permission
  enforcement.
- Do not change OpenCode behavior, OpenCode skill sync, or OpenCode plugin
  packaging.
- Do not add non-Codex harness targets or replace thoth-mem.
