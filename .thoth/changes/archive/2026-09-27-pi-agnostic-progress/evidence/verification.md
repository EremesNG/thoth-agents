# Pi optional progress verification

## Scope and implementation

Removed rpiv-todo from PI_PACKAGE_SPECS, so shared install/update/status no longer manage that package. Removed the fixed Pi progressTool mapping. Pi root rendering now instructs use of an available task/progress tool with its actual name/schema, otherwise lightweight written progress without blocking work or installing an extension. Specialists retain root-owned progress reporting without a fixed todo call. Other harness dialects are unchanged.

Preserved the existing installer rather than adding capability detection, package removal, adapters, state, or scheduling. Generated only Pi specialist assets/provenance; no tracked Codex/Claude bundle drift. Public documentation and two staged durable specification replacements describe optional operator-owned task tooling. Existing user task extensions are preserved.

## Tests and checks

- TDD red: Pi root rendering regression failed on fixed `todo`; then passed after optional agnostic guidance.
- TDD red: minimum-only package inventory regression failed because rpiv-todo was still planned; then passed after inventory removal.
- Focused suite: 100 tests passed across seven install/status/dialect/adapter/memory/writer test files. Setup tests cover no optional tasks and preexisting rpiv-todo/custom task settings, asserting no install/remove calls for those packages. Status ignores an outdated rpiv-todo while preserving question-extension checks.
- pnpm run check:ci: passed.
- pnpm run typecheck: passed.
- pnpm run build: passed; generated Pi definitions/provenance updated.
- env -u CODEX_HOME pnpm test: 988 tests passed in 97 files. Isolated CODEX_HOME per existing repository test convention.
- git diff --check: passed.
- Offline work validator through ready: passed.

## Simplification and limits

Kept one inventory deletion and optional dialect guidance; no extension registry or compatibility layer added. The Pi-specific rendering branch preserves other harness fallback behavior. No global installation, uninstall, credentials, or settings changes were performed. These checks validate instruction text and setup behavior, not model compliance with every third-party tool. Independent Oracle run 01fc7ea6-97be-4634-a269-88d47ddd5905 returned PASS and reran 100 focused tests plus diff/hash checks. Its nonblocking README count correction (six to five) was applied; fresh final Oracle run 2639815e-f6b4-4b20-b222-99b6ac632edb confirmed PASS for the corrected diff and current agreement, with terminal process state verified by root. Root reran check:ci and git diff --check successfully after removing transient raw validation/test logs.
