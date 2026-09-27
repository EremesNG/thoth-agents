# Verification evidence

## Scope and ownership

User authorized implementation and explicitly selected direct implementation. Product Git baseline was clean. First-party Thoth receipt/exact-version policy, other harness behavior, global user installation and credentials were not changed. Six existing external versions became stable >= floors; no upper bounds were added.

Native implementation task subtask_thoth-deep_1790466822606_4956c104 terminated completed. Native repair task subtask_thoth-quick_1790467795639_80afce99 terminated completed. No overlapping product writer remained when root checked the final diff.

## Checks

- Implementation worker reported a failing minimum-only plan regression before implementation (RED), followed by 72 passing focused installer/operation/top-level-install tests.
- Root ran `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, and `env -u CODEX_HOME pnpm test` after the recovery fix: all passed; 977 tests in 96 files.
- The ambient CODEX_HOME affects existing Codex path fixtures: worker reported 17 failures with it present and a full pass with that single variable removed. No product change was made to hide those failures.
- Root `git diff --check` passed; build introduced no tracked generated drift.
- LSP diagnostics were unavailable: tool skipped unavailable default servers and returned no diagnostics. Project-owned Biome and TypeScript checks passed. Installing a suitable server or updating pi-lsp.json would enable separate LSP checks.
- Pi 0.86.1 isolated native compatibility was verified by implementation worker: >= parses as an unpinned SemVer range; addSourceToSettings replaces an object-form exact source while preserving extension/skill filters. Root did not independently rerun that disposable probe. Installed Pi 0.87.1 parser and update/notification implementation were previously directly checked by root.

## Independent findings and repair

Fresh Oracle subtask_thoth-oracle_1790467704248_7f81fd2e blocked round one: external downgrade recovery reported success based only on exit code. Repair now reads a fresh native listing and validates the restored manifest's identity, scope and exact prior version; otherwise reports failed/unverifiable recovery with manual guidance. The operation remains failed and cannot record complete installation in either recovery case. The committed external recovery regression covers zero-exit no-op restoration. Other recovery failure modes and genuine restoration were reviewed in code, not independently covered by a committed test matrix; the repair worker's broader coverage claim was not accepted.

## Simplification and remaining limits

Shared manifest validation removes install/status divergence. Focused review retained explicit recovery steps and separate first-party receipts rather than adding an updater abstraction. No broader refactor was needed. Future major-version compatibility and live provider behavior are not guaranteed by a minimum range or manifest inspection. Scope remains CLI-managed global packages; project-shadowed/ambiguous package evidence does not claim readiness.

Two proposed durable spec replacements remove obsolete external pins and update native Pi examples to 0.86.1. Their source and target byte hashes are declared in work.yaml; archive applies them only after final independent PASS and fresh acceptance.
