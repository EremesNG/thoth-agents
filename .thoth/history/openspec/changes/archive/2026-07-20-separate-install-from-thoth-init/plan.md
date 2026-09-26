# Implementation Plan: Separate Global Installation from Project Initialization

## Technical context

The published package already includes the canonical top-level `skills/` tree, and the shared Codex/Claude plugin generator copies the same five owned skills into `plugin/skills/`. OpenCode's direct installer currently installs only the four external skills, while `skills/thoth-init/scripts/init.mjs` compensates by copying owned skills into each project's `.agents/skills/`. OpenCode operations/status likewise model only the four external skills.

The implementation will establish one canonical owned-skill name list, add a package-to-global OpenCode synchronization service, invoke it from direct and managed OpenCode install/sync paths, and expose owned skills in status/preview evidence. The initializer will remove its harness branch and accept only `--project` plus optional `--json`; it will preflight and synchronize a bounded `openspec/` graph without touching project-local skill or harness surfaces. Generated `plugin/` output remains generator-owned.

No compatibility shim will retain the obsolete `--harness` initializer argument. Existing legacy project-local skill copies are intentionally not deleted because the new initializer is forbidden from touching paths outside `openspec/`.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The user explicitly selected Accelerated; root owns planning and implementation, and mandatory final verification remains reserved for Oracle.
- **Explicit role boundaries**: PASS — Root is the single writer for CLI, skill, generated, documentation, and OpenSpec surfaces; no parallel writer is assigned.
- **Proportional Spec Kit-compatible SDD**: PASS — The change uses the Accelerated artifact set and validator gates; no clarification, checklist, or optional design artifact is needed because ownership and filesystem semantics are explicit in the specification.
- **Truthful multi-harness contracts**: PASS — The design preserves canonical external-skill repositories, keeps packaged skills thoth-owned, and makes the OpenCode-specific discovery gap explicit without changing Codex or Claude manager ownership.
- **Independent provider ownership**: PASS — Owned-skill synchronization completes before the existing public thoth-mem setup invocation and neither reads nor mutates provider assets.
- **Evidence-led completion**: PASS — Behavior tests precede implementation, focused and repository checks are planned, and independent Oracle verification plus closeout remain mandatory.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Define `THOTH_OWNED_SKILL_NAMES` once and implement `syncOpenCodeOwnedSkills({ homeDir, packageRoot, dryRun })`. Preflight all five source trees and `SKILL.md` files, stage copies under the destination filesystem, then replace each installer-owned destination with rollback on a failed swap. | `src/harness/core/owned-skills.ts`; new `src/cli/owned-skills.ts`; `src/cli/install.ts`; `InstallDependencies` | New focused owned-skill tests; direct installer dry-run/failure-order tests; exact destination and nested-tree assertions. |
| FR-002 | Keep `REQUIRED_SKILLS` and `npx skills add` exclusively for external skills. Add the five packaged owned targets to OpenCode status, install/sync previews, and apply paths so managed operations restore both classes of global skills. | `src/cli/skills.ts` unchanged in ownership; `src/cli/operations/opencode.ts`; `src/cli/operations/opencode.test.ts` | Status reports nine required global skills with owned/external provenance; install/sync previews and apply tests cover owned synchronization. |
| FR-003 | Remove `OWNED_SKILL_NAMES`, `installOpenCode`, and harness parsing from the initializer. Change its public invocation to `node .../init.mjs --project <root> --json`; update the OpenCode command and bundled skill contract. | `skills/thoth-init/SKILL.md`; `skills/thoth-init/scripts/init.mjs`; `src/harness/opencode-init-command.ts`; associated tests | Initializer tests enumerate all paths created on disk and assert zero paths outside `openspec/`; command tests reject the obsolete harness argument contract. |
| FR-004 | Preflight the project root and every required directory/file type before writes. Ensure `openspec/changes/archive`, `specs`, `memory`, and `templates`; normalize only the thoth-owned metadata manifest; create missing dated constitution and templates while preserving existing constitution/template bytes. | `skills/thoth-init/scripts/init.mjs`; `src/harness/bundled-skills.test.ts` | Empty, partial, repeated, preservation, and collision fixtures validate structure, idempotence, and truthful nonzero failure. |
| FR-005 | Import the canonical name list in integration generation, regenerate the shared plugin, and update all public/routed installation and skill documentation that still assigns local skill copying to init. | `src/harness/generate-integration-packages.ts`; `src/harness/generate-integration-packages.test.ts`; generated `plugin/`; `README.md`; `skills/README.md`; `docs/installation.md`; `docs/skills-and-mcps.md`; `docs/quick-reference.md`; `docs/agent/{architecture,cli-installation,harness-packaging,sdd-and-skills}.md`; durable deltas in `spec.md` | `pnpm run integration:sync`; focused generator tests; repository text search; Biome, typecheck, build, and full Vitest evidence. |

### Filesystem and reporting contracts

- The package root defaults from `import.meta.url` and remains injectable for isolated tests and packaged-layout verification.
- The OpenCode owned-skill root is exactly `<home>/.config/opencode/skills`; the alternate `~/.agents/skills` root remains accepted only for externally installed skills.
- Owned skill synchronization validates all five sources before any destination mutation. Each replacement is staged on the same filesystem; a failed swap restores that skill's previous destination before returning failure.
- Dry-run performs source validation and returns a planned result containing the five source/destination pairs while creating zero destination files.
- Initializer JSON remains machine-readable with `status`, `project`, `created`, `managed`, and `preserved` evidence; the obsolete `harness` field is removed.
- Required OpenSpec directories are `openspec/`, `changes/`, `changes/archive/`, `specs/`, `memory/`, and `templates/`. Expected file/directory type collisions fail during preflight before mutation.
- `openspec/.thoth-agents.json` is thoth-managed and may be normalized to the current schema; existing constitutions and template files are project-owned and never overwritten.

## Optional support artifacts

- `research.md`: Not needed; the official OpenCode discovery constraint and the local packaging evidence are already resolved and captured in the specification.
- `data-model.md`: Not needed; no persisted domain model or schema is introduced.
- `contracts/`: Not needed; the CLI/helper interfaces and initializer JSON shape are fully named in this plan and tested in-process.
- `quickstart.md`: Not needed; existing installation and quick-reference documents are the public operator surfaces.
- Requirement checklist: Not activated; filesystem failure modes, ownership, measurability, and compatibility decisions are explicit in FR-001 through FR-005 and their acceptance tests.

## Risks and migrations

- **Owned skill replacement overwrites local edits**: The five destination names are explicitly installer-owned. Staging and per-skill rollback prevent a failed replacement from silently destroying the prior valid tree. Operators can roll back by running a pinned previous thoth-agents package.
- **Source-root resolution differs between source and built CLI**: Package-root injection tests plus the repository build verify both layouts; missing `SKILL.md` files fail before destination writes.
- **Managed status becomes stricter**: OpenCode installations missing any owned global skill will report drift by design, and install/sync apply restores it.
- **Initializer interface changes**: Canonical skill instructions, OpenCode command generation, generated plugin files, tests, and docs change together. No legacy `--harness` parsing is retained.
- **Legacy project copies can shadow global skills**: Automatic cleanup is out of scope because it would violate the new bounded init contract. The migration note will tell operators they may remove old `.agents/skills/thoth-*` copies manually if present.
- **Generated output drift**: Only canonical source is edited; `pnpm run integration:sync` regenerates `plugin/`, and the committed-sync test detects divergence.
- **Rollback**: Before archive, source changes and generated outputs remain ordinary Git changes. At runtime, reinstalling a pinned prior package restores its owned global skill version; project OpenSpec content is preserved by initializer design.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — One root writer owns all mutable surfaces, the ready gate will offer optional Oracle plan review, and Oracle remains the final verifier.
- **Explicit role boundaries**: PASS — No read-only role is assigned writes; generated files are updated only from canonical sources by the root writer.
- **Proportional Spec Kit-compatible SDD**: PASS — Every technical decision maps to an FR/SC, optional artifacts remain off for stated reasons, and the plan is ready for executable task decomposition.
- **Truthful multi-harness contracts**: PASS — OpenCode gains its missing native global skill materialization while Codex/Claude plugin behavior and external canonical sources remain intact and documented.
- **Independent provider ownership**: PASS — The plan neither vendors nor repairs thoth-mem and preserves the existing provider setup evidence boundary.
- **Evidence-led completion**: PASS — Red tests, focused checks, generated consistency, full validation, Oracle verification, and transactional durable-delta archive are all explicit completion gates.
