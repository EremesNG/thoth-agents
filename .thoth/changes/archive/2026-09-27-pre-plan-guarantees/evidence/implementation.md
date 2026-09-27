# Implementation verification

## Outcome

- Classification distinguishes consultation/research from mutation and assesses scope, uncertainty, risk, coordination and recovery with bounded inspection.
- Clear bounded low-risk work remains eligible for direct execution and useful delegation without planning artifacts. Delegation/unit count is not a persistence trigger; material new uncertainty/scope/risk requires reclassification.
- The public workflow contract and routed planning skill require exploration, specification, clarification, then technical planning and persistence. Material uncertainty blocks readiness; bounded technical unknowns need a resolution strategy and stop/replan condition.
- Grilling remains conditional, not an interview requirement. Repository facts are investigated and settled decisions reused.
- Root prompts in all four harnesses carry compact entry rules and require reading the detailed planning reference. No schema, scheduler or mandatory artifact bundle was added.
- Existing native choices, authority, ownership, recovery and final independent verification remain intact.

## Tests and checks

- TDD: classification test failed before contract changes, then passed; readiness test failed before phase changes, then passed; all four rendered-root tests failed before prompt changes, then passed; skill integrity test failed before skill changes, then passed.
- Focused tests: 50 passed across workflow, rendered-root, work-contract and generated integration suites.
- Final pre-review order: pnpm run check:ci PASS; pnpm run typecheck PASS; pnpm run build PASS; pnpm test PASS (95 files, 964 tests).
- Test-process isolation: unset inherited CODEX_HOME and set THOTH_PLUGINS_ROOT=C:/DEV/Proyectos/Webstorm/thoth-plugins for the test process only. The unisolated attempt failed from inherited Codex paths and the absent default sibling marketplace fixture. No CLI/environment product fix was made; no live configuration was intentionally changed.
- Generated package synchronization is part of build; expected changes only in the orchestrator, copied skills and owned asset manifest. Pi specialist files and generated schema have no final diff.
- Context router validation PASS, zero errors and warnings. AGENTS.md has 163 nonblank lines (size informational notice).
- git diff --check PASS.
- LSP diagnostics unavailable: configured default biome server was skipped as unavailable. Install/configure its command in pi-lsp.json if LSP diagnostics are needed; repository Biome and TypeScript checks passed independently.

## Simplification and context budget

Removed repeated planning-choice/ownership prose from the expanded phase and kept detailed exit criteria in the existing routed planning reference rather than injecting the full procedure into every root. No new abstractions or data fields. The overall root ceiling was adjusted from 12000 to 12500 characters; existing adapter growth ceilings still pass unchanged.

Measured characters / estimated ceil(characters / 4), not billing or measured model tokens:
- AGENTS before: 10500 / 2625; after: 11054 / 2764.
- OpenCode rendered root: 10945 / 2737.
- Codex rendered root: 12343 / 3086.
- Claude rendered root: 11806 / 2952.
- Pi rendered root: 14226 / 3557.

Routing examples: a tiny explicit fix stays direct after targeted inspection; a substantive cross-cutting change routes to workflow readiness before persistence; a research question gathers evidence without automatically authorizing code changes.

## Limits and closeout

Instruction tests prove contract consistency, not that every model obeys it. A new read-only Oracle must verify actual agreement, diff, durable update candidate and evidence before closeout. The work specification replacement is staged and declared with raw SHA-256 digests; active specifications are not yet changed. Baseline was captured before product edits. Root is the only implementation writer; the previous Oracle review completed, and no child writer was launched.
