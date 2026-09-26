# Implementation Plan: Restore model defaults

## Technical context

Ink TUI model menu currently supports edit, preview and apply; current role readers can preserve installed overrides. Shipped defaults are separate constants in config and Claude adapter. Codex effort validation requires catalog evidence. Claude model plans always block manager-owned cache edits. Pi current-role reader is not a shipped-default reader.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — Root retains coupled menu/default-resolution work; fresh Oracle verifies after implementation.
- **Explicit role boundaries**: PASS — Root owns artifacts and product writes; Oracle is read-only and cannot delegate.
- **Proportional Spec Kit-compatible SDD**: PASS — User selected Accelerated; specify gate passed; ready and review choice precede implementation.
- **Truthful multi-harness contracts**: PASS — Use existing harness writers and preserve Claude cache and ambient-root boundaries.
- **Independent provider ownership**: PASS — No provider assets, lifecycle or memory protocol changes.
- **Evidence-led completion**: PASS — TDD at existing TUI and operation seams; isolated tests and fresh Oracle verdict required.

## Design

- Introduce a pure shipped-default role resolver, using canonical OpenAI/OpenCode presets, Pi provider-qualified projection, and Claude adapter constants. No filesystem or catalog reads in this resolver.
- Add a restore-plan operation to TuiOperations. Resolve shipped defaults, enrich with exact matching catalog metadata, then route through the existing harness model-plan builders. Do not fabricate catalog support for missing models or efforts. Missing metadata may block Codex; keep current capability validation for every harness.
- Add Restore defaults beside current model actions. Selecting it builds a preview for all shipped roles without updating installed files or discarding the manual edit draft. Existing Apply writes, Back returns to the draft. Distinguish restoration in the UI preview title and explanatory text and disclose model plus effort replacement.
- No CLI reset flag or install invocation. Existing writers retain backups, custom unrelated fields, and path/ownership checks.
- Replace obsolete Codex fallback values only where needed to share the canonical shipped resolver; do not refactor unrelated CLI discovery.

Implementation evidence: OpenCode authenticates issued plan identity and contents before apply. Keep native plans unchanged; restoration labeling belongs to UI state. The isolated OpenCode restore test exercises this provenance check.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Pure shipped defaults and restore preview | src/cli/model-defaults.ts; src/cli/tui/operations.ts; src/cli/tui/App.tsx | App keyboard flow and defaultTuiOperations |
| FR-002 | Reuse explicit model-plan apply for all roles | src/cli/tui/operations.ts; existing src/cli/operations builders | Isolated model plan/apply fixture tests |
| FR-003 | Keep catalog validation and Claude blocked plans | src/cli/tui/operations.ts; src/cli/tui/components/ModelScreen.tsx | Missing catalog and Claude no-write tests |

### Ownership and dependencies

Root owns the product surface and tests. The outputs form one ordered chain: shipped-default resolution -> plan assembly -> menu integration -> apply evidence. Explorer adds little after focused CodeGraph discovery; librarian is unnecessary because no external contract changes; designer's independent UI lane would overlap the same TUI contract; quick is inappropriate for coupled state/effort behavior; deep delegation would duplicate already loaded ordered context. Fresh Oracle owns independent verification and optionally selected plan review. No children delegate.

### File Changes

- src/cli/model-defaults.ts: new canonical projection helper.
- src/cli/tui/operations.ts: restore plan and canonical Codex fallback.
- src/cli/tui/App.tsx: action and preview routing.
- src/cli/tui/components/ModelScreen.tsx: restore explanatory text if needed.
- src/cli/tui/App.test.tsx: keyboard flow, preview/back/apply and unsupported behavior.
- src/cli/tui/operations.test.ts: defaults and catalog/plan contracts.
- src/cli/operations/codex.test.ts: apply defaults with preserved unrelated fields.
- src/cli/operations/opencode.test.ts: apply defaults with preserved unrelated fields.
- src/cli/operations/pi.test.ts: apply defaults with preserved unrelated fields.
- src/cli/operations/claude-code.test.ts: blocked restore defaults.
- docs/installation.md: restoration menu and harness limits.

## Optional support artifacts

- research.md: not needed; existing source answers contract questions.
- data-model.md: not needed; existing ModelRoleInput and OperationPlan suffice.
- contracts/: not needed; no external API.
- quickstart.md: not needed; update existing installation guide.

## Risks and migrations

No migration. Explicit restoration replaces custom model/effort values only after Apply; preview and Back are write-free. Catalog absence may block restoration and must be explained, never bypassed. Claude remains unsupported for writes. Preserve drafts on preview cancellation. Tests omit inherited CODEX_HOME in a child process and use isolated file fixtures; live installations must not be touched. Reverting source changes restores previous menu behavior; existing writer backups cover operator rollback of applied values.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — One writer across TUI flow and defaults avoids competing interface edits.
- **Explicit role boundaries**: PASS — Root persists gates; Oracle only supplies independent findings.
- **Proportional Spec Kit-compatible SDD**: PASS — Tasks map all requirements and buildable criteria; archive follows PASS.
- **Truthful multi-harness contracts**: PASS — Explicit restore uses native model plans and displays blocked Claude capability.
- **Independent provider ownership**: PASS — Restore changes only role model/effort fields and existing managed state.
- **Evidence-led completion**: PASS — Regression tests cover preview, Back, apply, unsupported catalog and ownership failure.
