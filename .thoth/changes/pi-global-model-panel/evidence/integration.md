# Integrated implementation verification

Root consumed terminal designer run ca572af5-1de4-43df-895d-218b86321862 and reviewed the delivered command/panel. Root then added narrow-screen stacked summaries and Ctrl-C safe cancellation after red tests, and aligned the existing CLI catalog test with newly supported max. No live user configuration was edited; all command-save probes used temporary Pi agent homes.

## Packaging correction (same-intent implementation refinement)

A real compiled-command probe reproduced a module-loading failure: variable dynamic imports worked in an isolated TypeScript prototype through Jiti but bypassed host aliases when the compiled JS entrypoint was natively loaded. Root inspected installed Pi loader getAliases() and packages.md, then verified a static-import JS probe through actual loadExtensions.

The implementation now uses static public @earendil-works/pi-ai and pi-tui imports. Both are declared `*` peerDependencies, installed at 0.87.1 as development dependencies, and explicit tsup externals. No Pi coding-agent runtime is bundled. New transitive package build hooks for @google/genai and protobufjs were declined (allowBuilds false); pnpm install subsequently passed.

Bare Node import is not the supported loadability contract for host-provided native peers. Removed that redundant check from CLI Pi install and package verifier while retaining manifest/assets/skills integrity and receipt-bound observePiNativeRoot actual Pi execution. Focused Pi installer/native-probe tests passed (49 combined with panel/extension). The real packed Pi verification subsequently passed with one session_start, five skills, six specialists, root prompt observation and no orchestrator child. This changes no product scope, settings scope, storage semantics, or user choices; integration write footprint now names the necessary packaging/probe files.

A second actual compiled-command probe loaded dist/pi.js via installed Pi loadExtensions, invoked thoth-agents:models with real native key/width/thinking helpers and an isolated Pi home, navigated model/effort/save, and observed model test/probe persisted plus successful notification. Result passed=true, rendered=true. An isolated pi-subagents discoverAgents probe also observed a changed global definition on the next discovery (test/first -> test/second-model), without modifying live agents.

## Checks

- Targeted service/CLI: 27 passed before panel; service snapshot and override-preserving sync regressions included.
- Targeted extension/panel: 13 passed after root refinements.
- Pi installer/native probe/extension/panel combined: 49 passed.
- pnpm run check:ci: PASS.
- pnpm run typecheck: PASS.
- pnpm run build: PASS; generated tracked outputs unchanged.
- pnpm run verify:pi-package: PASS using actual packed/native Pi observation.
- LSP tool reported default servers unavailable; CLI Biome and TypeScript checks are the usable diagnostics here.
- Raw pnpm test first exposed inherited CODEX_HOME pointing to Orca's global Codex runtime, plus a stale Pi max expectation (fixed) and four missing external marketplace fixture failures.
- `env -u CODEX_HOME pnpm test`: 999 passed, four failures before final UI refinement; all four originate from missing sibling C:/Users/EremesNG/orca/workspaces/thoth-agents/thoth-plugins in unmodified src/harness/publish-marketplace.test.ts.
- Final available-suite run `env -u CODEX_HOME pnpm exec vitest run --exclude src/harness/publish-marketplace.test.ts`: 98 files, 998 tests passed. External fixture excluded explicitly, not represented as passing.

Logs: build.log, tests.log, tests-isolated.log, tests-final.log. No commits or publication. Final fresh Oracle judgment remains pending.
