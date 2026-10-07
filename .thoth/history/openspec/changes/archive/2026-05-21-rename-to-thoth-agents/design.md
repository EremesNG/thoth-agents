# Design: Rename to thoth-agents

## Technical Approach

Perform a hard cutover from `oh-my-opencode-lite` to `thoth-agents` for every
active, project-owned identity surface. The implementation should treat the new
name as a single canonical constant conceptually, then update dependent paths,
manifest names, generated provenance, docs, fixtures, and tests in the same
change set so source behavior and expected outputs cannot diverge.

The rename is not a compatibility migration. New installers and generators must
write only `thoth-agents` package/plugin/config/path identities. There are no
existing users, installations, or persisted data to migrate or preserve, so the
plan does not include refresh, re-creation, or legacy managed targets.

Before editing, classify every old-name reference into one of four buckets:

1. **Active identity**: current package, binary, CLI help, install target,
   config file, schema, generated artifact, manifest/provenance, active docs,
   active specs, active tests, fixtures, and source constants. These MUST be
   renamed to `thoth-agents`.
2. **Historical/archive**: archived OpenSpec changes, changelogs, provenance
   notes, or rollback/history text that explicitly describes past behavior.
   These MAY remain only when their context is clearly non-canonical.
3. **Third-party/example**: external URLs, third-party package examples, or user
   content examples not owned by this project. These MAY remain only when they
   are not presented as the current project identity.
4. **Deliberately scoped exceptions**: references retained by a later approved
   requirement with rationale. There are no approved exceptions in this design.

## Architecture Decisions

### Decision: Hard cutover with no aliases

**Choice**: Rename active identity surfaces directly to `thoth-agents` and do
not generate old package/plugin IDs, old config filenames, old Codex paths, or
managed aliases.

**Alternatives considered**: Keep compatibility aliases; dual-write both names;
read old config paths as fallbacks; preserve old Codex marketplace entries as
managed entries.

**Rationale**: The spec requires hard-cutover semantics. Dual identities would
increase the risk of mixed generated outputs and make verification ambiguous.
Because this is a new ecosystem with no legacy users or data, migration cleanup
is intentionally out of scope.

### Decision: Rename generated artifact names and regenerate fixtures

**Choice**: Update generator inputs and deterministic output paths, then refresh
fixtures/snapshots from the generator behavior instead of hand-editing generated
JSON/TOML expectations in isolation.

**Alternatives considered**: Edit checked-in generated fixtures manually; leave
old hidden manifest filenames for continuity.

**Rationale**: Files such as `.oh-my-opencode-lite-manifest.json`,
`.oh-my-opencode-lite-plugin-assets.json`, `plugin.json`, and the schema are
machine-consumed identity surfaces. Regeneration keeps content hashes,
provenance, and test expectations aligned.

### Decision: Preserve agent role names

**Choice**: Keep role names (`orchestrator`, `explorer`, `librarian`, `oracle`,
`designer`, `quick`, `deep`) and skill names unchanged unless they embed the
project identity in prose or metadata.

**Alternatives considered**: Broader role rebranding.

**Rationale**: The spec explicitly excludes role-level rebranding; changing role
names would alter behavior and user-facing workflows beyond identity rename.

### Decision: Treat active OpenSpec/current docs as active identity

**Choice**: Update current OpenSpec config/specs and the active change artifacts
where they present the current project name, while allowing archived changes to
remain historical if clearly scoped.

**Alternatives considered**: Leave all OpenSpec artifacts untouched as history;
rewrite archived changes wholesale.

**Rationale**: Active verification surfaces must reflect the new canonical name,
but archive rewrites create unnecessary history churn and may obscure why prior
changes were made.

## Data Flow

1. Package metadata (`package.json`) exposes the package name, binary,
   repository links, schema file inclusion, and npm release metadata.
2. OpenCode installer paths and config writers use the package identity to add a
   plugin entry and write plugin-specific config under the OpenCode config
   directory.
3. Codex installer target resolution materializes role TOML files, a personal
   plugin source directory, root managed block markers, and a marketplace entry.
4. Harness adapters and writers render Codex package artifacts, skill manifests,
   plugin manifests, provenance files, and dry-run JSON outputs.
5. Schema generation writes the checked-in JSON schema from runtime config
   schema metadata.
6. Docs, skills, tests, and fixtures assert the expected identity across the
   installation and generation surfaces.

The implementation should update producer constants first, then refresh tests
and generated fixtures from those producers, then audit residual old-name text.

## File Changes

### Package and release metadata

- `package.json`: rename `name`, `bin` key, repository/bugs/homepage URLs if the
  repository slug changes, and `files` entry from
  `oh-my-opencode-lite.schema.json` to `thoth-agents.schema.json`.
- `scripts/generate-schema.ts`: change schema output filename, title, and
  description.
- `oh-my-opencode-lite.schema.json`: replace with regenerated
  `thoth-agents.schema.json`; remove the stale old-name checked-in schema file
  unless a later release process requires transitional documentation.
- `src/hooks/auto-update-checker/constants.ts`: change `PACKAGE_NAME`, registry
  URL, and OpenCode cache package path to `thoth-agents`.

### OpenCode install/config surfaces

- `src/cli/config-io.ts`: update `PACKAGE_NAME` and comments/tests so OpenCode
  plugin entries become `thoth-agents@latest`. Do not filter or migrate old
  entries as a managed alias unless later scoped; new writes should not create
  `oh-my-opencode-lite`.
- `src/cli/paths.ts`: rename plugin config file paths from
  `oh-my-opencode-lite.json/jsonc` to `thoth-agents.json/jsonc`.
- `src/config/loader.ts`: rename `PROMPTS_DIR_NAME`, user/project config base
  names, log prefixes, docs comments, and environment variable from
  `OH_MY_OPENCODE_LITE_PRESET` to a new-name equivalent such as
  `THOTH_AGENTS_PRESET`. Do not keep the old env var as a fallback in this
  change.
- `src/cli/install.ts`, `src/cli/index.ts`, `src/cli/config-manager.ts`, and
  related tests: update CLI help, install status text, GitHub links, and managed
  config expectations.

### Codex install and generated package surfaces

- `src/cli/codex-paths.ts`: role TOML filenames become
  `thoth-agents-{role}.toml`; personal plugin root becomes
  `~/.codex/plugins/thoth-agents`.
- `src/cli/codex-install.ts`: managed root markers become
  `thoth-agents:codex-root:start/end`; rendered root heading/prose,
  marketplace entry name, managed-entry filter, role artifact lookup path,
  descriptions, and diagnostics use `thoth-agents`.
- `src/cli/codex-config-io.ts`: tests should assert plugin IDs such as
  `[plugins."thoth-agents"]` when plugin ID enablement is supplied.
- `src/harness/adapters/codex.ts`: package manifest `name`, generated role
  artifact paths, and test expectations use `thoth-agents`.
- `src/harness/writers/codex-plugin-package.ts`: provenance artifact path
  becomes `.codex-plugin/.thoth-agents-plugin-assets.json`; `generatedBy`
  becomes `thoth-agents`.
- `src/harness/writers/skill-layout.ts`: generated skill manifest filenames
  become `.thoth-agents-manifest.json`; manifest `generatedBy` becomes
  `thoth-agents`.
- `src/harness/__fixtures__/codex/*` and harness tests: regenerate or update
  deterministic fixture files and expected paths.

### Docs, skills, and OpenSpec

- `README.md`, `AGENTS.md`, `docs/**/*.md`, `src/**/codemap.md`, and active
  skill markdown under `src/skills/**`: update active product/package/install
  identity, commands, schema references, and generated path examples.
- `openspec/config.yaml` and active specs under `openspec/specs/`: update the
  current project identity to `thoth-agents` where the text describes current
  behavior.
- `openspec/changes/rename-to-thoth-agents/**`: this change may mention both
  names because it defines the rename; remaining old-name mentions are scoped by
  the change context.
- `openspec/changes/archive/**`: leave historical references unless a line is
  reused as active guidance; classify these as archive exceptions in the audit.

### Tests

- Update source-adjacent tests in `src/cli/*.test.ts`, `src/config/*.test.ts`,
  `src/harness/**/*.test.ts`, `src/hooks/**/*.test.ts`, `src/thoth/*.test.ts`,
  and `src/utils/*.test.ts` where expected package names, paths, schema names,
  managed markers, URLs, or log prefixes appear.
- Add or update an identity audit test/script that scans active paths for
  forbidden `oh-my-opencode-lite` references outside documented allowlist
  contexts.

## Interfaces / Contracts

- Public package name and CLI binary: `thoth-agents`.
- OpenCode plugin config entry: `thoth-agents@latest`.
- Plugin-specific config files: `thoth-agents.json` and
  `thoth-agents.jsonc` in the OpenCode config directory and project
  `.opencode/` directory.
- Schema file and `$schema` examples: `thoth-agents.schema.json` and package URL
  under `thoth-agents@latest`.
- Codex personal plugin root: `~/.codex/plugins/thoth-agents/`.
- Codex role files: `thoth-agents-{role}.toml` for non-orchestrator roles.
- Codex managed root markers: `thoth-agents:codex-root:start/end`.
- Codex marketplace entry name and generated package manifest name:
  `thoth-agents`.
- Generated provenance identity: `generatedBy: "thoth-agents"`.

No interface should accept or emit `oh-my-opencode-lite` as a compatibility
alias in this change.

## Testing Strategy

1. Run focused tests while editing producers:
   - `bun test src/cli/config-io.test.ts src/cli/paths.test.ts`
   - `bun test src/cli/codex-paths.test.ts src/cli/codex-install.test.ts`
   - `bun test src/cli/codex-config-io.test.ts`
   - `bun test src/harness/adapters/codex.test.ts`
   - `bun test src/harness/writers/codex-plugin-package.test.ts`
   - `bun test src/harness/writers/skill-layout.test.ts`
   - `bun test src/harness/generate-codex-plugin.test.ts`
   - relevant config/auto-update tests after changing loader and package-name
     constants.
2. Regenerate the schema with `bun run generate-schema`; ensure the old schema
   filename is not left checked in as an active generated artifact.
3. Run full verification before completion:
   - `bun run check:ci`
   - `bun run typecheck`
   - `bun test`
4. Run an identity audit after tests, for example with
   `rg "oh-my-opencode-lite"` and an allowlist that only permits:
   - the rename change artifacts under
     `openspec/changes/rename-to-thoth-agents/**`,
   - archived OpenSpec/history contexts under `openspec/changes/archive/**`,
   - explicitly documented third-party or historical examples,
   - no active source, fixture, generated schema, package metadata, current
     docs, or active specs.
5. Verify generated/dry-run outputs include `thoth-agents` paths and names by
   exercising the Codex generation path (`bunx` is not required locally; use the
   existing tests or `bun run build`/CLI dry-run if needed).

## Migration / Rollout

- Release coordination is required because npm package name, CLI command, schema
  filename, and plugin IDs change together. Confirm `thoth-agents` package name
  availability and repository URL policy before publishing.
- Users will install with `bunx thoth-agents@latest install`. Existing old-name
  installs are not automatically migrated or cleaned up by this change.
- If old managed entries/directories should be cleaned later, create a follow-up
  SDD change defining explicit migration and safety behavior.
- Publish docs and release notes that state this is a breaking rename and that
  old commands/paths are not aliases.

## Risks and Mitigations

- **Mixed identity in generated outputs**: mitigate by updating producer
  constants first, regenerating fixtures/schema, and running the identity audit.
- **Stale checked-in generated files**: mitigate by deleting/replacing old
  schema and fixture filenames instead of leaving duplicate active artifacts.
- **Package/plugin release mismatch**: mitigate by coordinating npm package
  name, binary name, repository URLs, README commands, and auto-update registry
  checks in the same release.
- **Accidental compatibility behavior**: mitigate by reviewing filters and path
  resolvers so they do not refresh or emit old-name managed targets.
- **Historical false positives**: mitigate with a small, documented allowlist
  for archived OpenSpec/history contexts only.
- **Environment variable breakage**: expected for hard cutover; document the new
  env var and do not silently read the old one.

## Non-Goals

- Compatibility aliases for old package names, plugin IDs, binary names, config
  filenames, schema filenames, install paths, or marketplace entries.
- Legacy install targets or dual-write generated outputs.
- Migration shims, cleanup of existing old-name user content, or automatic
  import from old config paths.
- Role rebranding beyond package/project identity.
- Functional changes to delegation, SDD, thoth-mem, OpenCode, or Codex behavior
  unrelated to identity strings and paths.

## Open Questions

- Confirm npm availability and ownership for `thoth-agents` before release.
- Confirm whether repository URLs should change immediately to a new slug or
  continue pointing at the existing repository until hosting is renamed.
- Confirm the exact new environment variable name; this design assumes
  `THOTH_AGENTS_PRESET` for the current `OH_MY_OPENCODE_LITE_PRESET` surface.
