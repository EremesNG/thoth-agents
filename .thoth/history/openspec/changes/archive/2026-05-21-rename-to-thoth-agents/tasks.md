# Tasks: Rename to thoth-agents

## Phase 1: Identity Audit and Allowlist Foundation

- [x] 1.1 Build the initial identity inventory and classify every `oh-my-opencode-lite` occurrence as active identity, historical/archive, third-party/example, or explicitly scoped exception — repository-wide audit output; active scopes include `package.json`, `src/**`, `docs/**`, `README.md`, `AGENTS.md`, `openspec/config.yaml`, `openspec/specs/**`, generated fixtures, and schema files.
  **Verification**:
  - Run: `rg "oh-my-opencode-lite"`
  - Expected: Every match is assigned to one of the design buckets before editing; there are no approved deliberately scoped exceptions for active compatibility behavior.

- [x] 1.2 Add or update an automated identity audit test/script with a documented allowlist — active source/tests/fixtures/docs/current specs must reject canonical `oh-my-opencode-lite`; allowed contexts are limited to `openspec/changes/rename-to-thoth-agents/**`, `openspec/changes/archive/**`, and explicitly historical/third-party prose.
  **Verification**:
  - Run: `bun test -t "identity"`
  - Expected: The audit fails on active canonical old-name references and passes only when remaining old-name matches are allowlisted as historical/archive/third-party rename context.

## Phase 2: Producer Constants, Package Metadata, and Config Contracts

- [x] 2.1 Rename package and release metadata producers — `package.json`, `scripts/generate-schema.ts`, `src/hooks/auto-update-checker/constants.ts`; change package/bin/schema file identity to `thoth-agents`, update registry/cache names, and do not add old-name package or binary aliases.
  **Verification**:
  - Run: `bun run typecheck`
  - Expected: TypeScript accepts the metadata/schema/checker constant updates and no producer emits `oh-my-opencode-lite` as a current package, binary, or schema name.

- [x] 2.2 Update OpenCode install/config producers — `src/cli/config-io.ts`, `src/cli/paths.ts`, `src/config/loader.ts`, `src/cli/install.ts`, `src/cli/index.ts`, `src/cli/config-manager.ts`; use `thoth-agents@latest`, `thoth-agents.json/jsonc`, new log/config labels, and `THOTH_AGENTS_PRESET` without reading the old env var as a fallback.
  **Verification**:
  - Run: `bun test src/cli/config-io.test.ts src/cli/paths.test.ts src/config/loader.test.ts src/cli/install.test.ts src/cli/index.test.ts src/cli/config-manager.test.ts`
  - Expected: OpenCode config, path, loader, installer, CLI, and config-manager expectations use only new-name active identities and do not create legacy managed install targets.

- [x] 2.3 Update Codex path/config/install producers — `src/cli/codex-paths.ts`, `src/cli/codex-install.ts`, `src/cli/codex-config-io.ts`; emit `~/.codex/plugins/thoth-agents`, `thoth-agents-{role}.toml`, `thoth-agents:codex-root:start/end`, `[plugins."thoth-agents"]`, and managed marketplace entries without old-name aliases or dual writes.
  **Verification**:
  - Run: `bun test src/cli/codex-paths.test.ts src/cli/codex-install.test.ts src/cli/codex-config-io.test.ts`
  - Expected: Codex dry-run/install plans, marketplace entries, plugin IDs, root markers, and role files use `thoth-agents`; old `oh-my-opencode-lite` user content is not treated as the active managed target.

- [x] 2.4 Update harness and generated-package producers — `src/harness/adapters/codex.ts`, `src/harness/writers/codex-plugin-package.ts`, `src/harness/writers/skill-layout.ts`; set package manifest names, generated role artifact paths, `.codex-plugin/.thoth-agents-plugin-assets.json`, `.thoth-agents-manifest.json`, and `generatedBy: "thoth-agents"`.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts src/harness/writers/codex-plugin-package.test.ts src/harness/writers/skill-layout.test.ts src/harness/generate-codex-plugin.test.ts`
  - Expected: Harness producers and writer tests verify deterministic new-name paths, names, manifests, and provenance with no legacy generated artifact filenames.

## Phase 3: Generated Artifacts, Fixtures, and Cleanup

- [x] 3.1 Regenerate schema output and replace stale checked-in schema artifacts — create `thoth-agents.schema.json`, update package `files`, and remove `oh-my-opencode-lite.schema.json` as an active generated artifact.
  **Verification**:
  - Run: `bun run generate-schema`
  - Expected: The checked-in schema title/description and filename use `thoth-agents`, and no active old-name schema file remains referenced by package metadata or docs.

- [x] 3.2 Regenerate/update Codex/OpenCode generated fixtures and snapshots — `src/harness/__fixtures__/codex/**`, harness test expectations, plugin manifests, skill manifests, marketplace/package fixture entries, dry-run JSON/TOML paths, and agent config names.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts src/harness/adapters/codex-surfaces.test.ts src/harness/generate-codex-plugin.test.ts src/harness/writers/codex-plugin-package.test.ts src/harness/writers/skill-layout.test.ts src/harness/writers/codex-toml.test.ts`
  - Expected: Fixtures and snapshots are deterministic and contain `thoth-agents` package/plugin/config/path identities; generated role names remain orchestrator/explorer/librarian/oracle/designer/quick/deep.

- [x] 3.3 Remove stale active old-name generated outputs and install targets from the repository — old schema filename, old generated manifest filenames, old Codex role fixture names, old plugin asset fixture paths, and any stale marketplace fixture entries; do not add migration shims or legacy install targets.
  **Verification**:
  - Run: `rg "oh-my-opencode-lite" package.json src/harness src/cli src/config src/hooks scripts --glob "*.schema.json"`
  - Expected: No active producer, test, fixture, schema, or generated-artifact path exposes the old name except test cases that intentionally model unmanaged pre-existing old user content and are documented by the audit allowlist.

## Phase 4: Docs, Skills, Specs, and User-Facing Text

- [x] 4.1 Update active product documentation and install instructions — `README.md`, `AGENTS.md`, `docs/**/*.md`, and `src/**/codemap.md`; replace package commands, schema URLs, Codex/OpenCode plugin paths, marketplace references, and current product prose with `thoth-agents` while preserving role names.
  **Verification**:
  - Run: `rg "oh-my-opencode-lite" README.md AGENTS.md docs src --glob "*.md"`
  - Expected: Remaining old-name documentation matches are only explicitly historical, third-party, or allowed rename-context references; active install commands and examples use `bunx thoth-agents@latest` and new paths.

- [x] 4.2 Update bundled skill and agent metadata text — `src/skills/**`, agent config names/metadata under `src/agents/**`, and related skill/manifest tests; keep skill IDs and agent role names unchanged unless prose identifies the package/product.
  **Verification**:
  - Run: `bun test src/agents/index.test.ts src/cli/skill-manifest.test.ts src/harness/core/skills.test.ts`
  - Expected: Skill/agent metadata uses the new project identity where applicable, generated skill manifests remain valid, and role-level rebranding is not introduced.

- [x] 4.3 Update active OpenSpec identity surfaces — `openspec/config.yaml`, `openspec/specs/multi-harness-agent-pack/spec.md`, and current change artifacts as needed; leave `openspec/changes/rename-to-thoth-agents/**` old-name mentions only as scoped rename context and leave `openspec/changes/archive/**` as historical unless reused as active guidance.
  **Verification**:
  - Run: `rg "oh-my-opencode-lite" openspec/config.yaml openspec/specs openspec/changes/rename-to-thoth-agents openspec/changes/archive`
  - Expected: Active specs/config use `thoth-agents`; current change mentions are clearly about the rename; archived matches are historical and not used as active install/config guidance.

## Phase 5: Focused Behavior Verification and Hard-Cutover Review

- [x] 5.1 Run focused OpenCode install/config verification after producer and docs updates — config I/O, paths, loader, installer, CLI, config manager, provider/config surfaces, and auto-update checker tests.
  **Verification**:
  - Run: `bun test src/cli/config-io.test.ts src/cli/paths.test.ts src/config/loader.test.ts src/cli/install.test.ts src/cli/index.test.ts src/cli/config-manager.test.ts src/cli/providers.test.ts src/hooks/auto-update-checker/checker.test.ts src/hooks/auto-update-checker/cache.test.ts`
  - Expected: Focused OpenCode-related tests pass and confirm no compatibility aliases, old env-var fallback, old schema path, or old managed plugin entry is emitted.

- [x] 5.2 Run focused Codex and generated-artifact verification — Codex install/path/config tests, harness adapter/writer tests, generated package tests, and fixture comparison tests.
  **Verification**:
  - Run: `bun test src/cli/codex-paths.test.ts src/cli/codex-install.test.ts src/cli/codex-config-io.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/codex-surfaces.test.ts src/harness/generate-codex-plugin.test.ts src/harness/writers/codex-plugin-package.test.ts src/harness/writers/skill-layout.test.ts src/harness/writers/codex-toml.test.ts`
  - Expected: Focused Codex and generation tests pass with new package/plugin paths, marketplace names, role filenames, manifests, provenance, and fixture contents.

- [x] 5.3 Review hard-cutover semantics in code and tests — confirm no compatibility aliases, migration shims, dual-write behavior, legacy install targets, old package fallbacks, old config filename fallbacks, old Codex marketplace managed entries, or old env-var fallback were introduced; there is no legacy user data to migrate or preserve.
  **Verification**:
  - Run: `rg "oh-my-opencode-lite|OH_MY_OPENCODE_LITE|legacy|alias|fallback|migration|dual-write" src docs README.md package.json`
  - Expected: Old-name and compatibility-related matches are either removed, explicitly negative tests/prose enforcing hard cutover, or documented historical/third-party rename context; none implement legacy active behavior.

## Phase 6: Full Repository Verification and Final Identity Audit

- [x] 6.1 Run formatting/lint policy verification for the complete rename.
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Biome check passes without formatting or lint errors.

- [x] 6.2 Run TypeScript verification for the complete rename.
  **Verification**:
  - Run: `bun run typecheck`
  - Expected: `tsc --noEmit` passes with no type errors after package/config/path/schema renames.

- [x] 6.3 Run the full Bun test suite.
  **Verification**:
  - Run: `bun test`
  - Expected: All tests pass, including focused install/config, Codex, harness, schema, skill, and identity audit coverage.

- [x] 6.4 Run the final active identity audit and document allowed residual old-name references.
  **Verification**:
  - Run: `rg "oh-my-opencode-lite"`
  - Expected: No active source, package metadata, generated fixture, generated schema, current documentation, current spec, install/config path, marketplace entry, manifest, or test expectation treats `oh-my-opencode-lite` as canonical; residual matches are limited to the rename change artifacts, archived OpenSpec/history contexts, or explicit third-party/historical examples recorded in the audit allowlist.
