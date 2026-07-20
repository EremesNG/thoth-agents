# Verification Report: Separate Global Installation from Project Initialization

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — all accepted installation, initializer,
  generated-package, and documentation surfaces are covered.
- **Correctness**: PASS — the compiled CLI resolves the packaged skills from
  its emitted chunk and completes isolated dry-run installation.
- **Coherence**: PASS — artifacts, source, generated plugin, tests, compiled
  runtime, and documentation express the same ownership boundary.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `THOTH_OWNED_SKILL_NAMES`, `syncOpenCodeOwnedSkills`, direct installer integration, and emitted-module package-root resolution | Owned-skill tests and compiled CLI release-layout test | PASS |
| FR-002 | External `REQUIRED_SKILLS` remain canonical-repository installs; OpenCode status/install/sync models five owned plus four external skills | Seven-file focused suite, including status/preview/apply operations | PASS |
| FR-003 | `skills/thoth-init/scripts/init.mjs` accepts only `--project`/`--json`, preflights, and contains no harness installation branch | Bundled initializer and command-contract tests | PASS |
| FR-004 | Initializer ensures the required graph, preserves constitution/templates, normalizes only its manifest, and preflights collisions | Empty, preservation, repeat, missing-root, incomplete-bundle, and collision fixtures | PASS |
| FR-005 | Generator imports the canonical inventory; generated init assets and public/routed docs are aligned | `integration:verify`, documentation search, Biome, typecheck, and focused tests | PASS |
| SC-001 `[buildable]` | Complete recursive copy, stale replacement, exact five-skill inventory, and release-layout resolution | `owned-skills.test.ts` plus `plugin-node-runtime.test.ts` | PASS |
| SC-002 `[buildable]` | Zero-write dry-run, truthful invalid source/destination failure, and provider blocking on owned-sync failure | Focused owned-skill/direct-install tests and isolated compiled dry-run | PASS |
| SC-003 `[buildable]` | Initializer mutations stay beneath `openspec/`; obsolete harness argument is rejected | `bundled-skills.test.ts` and `opencode-init-command.test.ts` | PASS |
| SC-004 `[buildable]` | Minimum governance branches, byte preservation, zero repeat creations, and collision failure are asserted | Bundled initializer fixture suite | PASS |
| SC-005 `[buildable]` | Source, compiled runtime, generated plugin, docs, format, types, and integration contracts agree | Focused 49 tests, `check:ci`, `typecheck`, `integration:verify`, and `git diff --check` | PASS |

## Executed verification

- `pnpm exec vitest run src/cli/owned-skills.test.ts src/plugin-node-runtime.test.ts`
  — PASS, 2 files and 10 tests.
- Seven-file focused Vitest command — PASS, 7 files and 49 tests.
- `pnpm run check:ci` — PASS, 231 files and no fixes.
- `pnpm run typecheck` — PASS.
- `pnpm run integration:verify` — PASS, 2 files and 12 tests.
- `git diff --check` — PASS.
- Bounded obsolete-contract documentation search — PASS.
- Root build evidence: `pnpm run build` — PASS.
- Root full-suite evidence: `pnpm test` — PASS, 77 files and 878 tests.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | No unresolved findings | — |

Prior critical finding `F-001` was resolved through append-only convergence
task T021. The corrected resolver is present in the emitted CLI chunk, and both
the simulated chunk-layout test and real compiled CLI test pass.

## External evidence

OpenCode documents npm plugins as executable packages cached under its module
cache, while native skills are discovered from fixed project/global roots. The
lack of a declarative package-relative native skill root is therefore a
supported inference from the documented surfaces:
[Plugins](https://dev.opencode.ai/docs/plugins/) and
[Agent Skills](https://dev.opencode.ai/docs/skills/).

## Residual risks

- None. All declared success criteria are buildable and observed passing.
