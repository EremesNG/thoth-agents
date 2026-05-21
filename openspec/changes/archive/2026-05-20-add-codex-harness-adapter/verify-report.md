# Verification Report: Add Codex Harness Adapter

## Completeness

- OpenSpec prerequisites are present: `openspec/config.yaml`, `openspec/specs/`,
  and `openspec/changes/`.
- Required full-pipeline artifacts were recovered from OpenSpec:
  `proposal.md`, `specs/multi-harness-agent-pack/spec.md`, `design.md`, and
  `tasks.md`.
- Task checklist status: 21/21 tasks are marked complete across Phases 1-6.
- Implementation coverage observed in source:
  - Harness-neutral contracts: `src/harness/types.ts`,
    `src/harness/core/agent-pack.ts`, `src/harness/core/sdd.ts`,
    `src/harness/core/skills.ts`, and
    `src/harness/core/memory-governance.ts`.
  - Adapter isolation and defaults: `src/harness/registry.ts`,
    `src/harness/adapters/opencode.ts`, and
    `src/harness/adapters/codex.ts`.
  - Codex validation and generation: `docs/codex-surface-validation.md`,
    `src/harness/adapters/codex-surfaces.ts`,
    `src/harness/writers/codex-toml.ts`,
    `src/harness/writers/skill-layout.ts`, and
    `src/harness/__fixtures__/codex/`.
  - Explicit Codex opt-in surface: `src/cli/index.ts`, `src/cli/types.ts`,
    `src/config/schema.ts`, and `src/config/loader.ts`.

## Build and Test Evidence

- `bun test src/harness` — passed: 44 tests, 10 files, 184 assertions.
- `bun run check:ci` — passed: Biome checked 155 files with no fixes applied.
- `bun run typecheck` — passed: `tsc --noEmit` completed successfully.
- `bun test` — passed: 481 tests, 48 files, 1241 assertions.
- `bun test src/harness/registry.test.ts src/plugin-node-runtime.test.ts src/agents/index.test.ts` — passed: 63 tests, 3 files, 267 assertions.

## Compliance Matrix

| Spec scenario | Verdict | Evidence |
| --- | --- | --- |
| Existing OpenCode users receive unchanged plugin behavior | Compliant | `src/index.ts` remains the OpenCode plugin entry path; `src/agents/index.test.ts`, `src/plugin-node-runtime.test.ts`, `src/mcp/index.test.ts`, and `src/hooks/skill-sync.test.ts` pass in the full suite. |
| OpenCode-specific behavior remains isolated | Compliant | `src/harness/core/*` and `src/harness/types.ts` have no OpenCode SDK imports; `src/harness/adapters/opencode.ts` contains the SDK boundary; `opencode.test.ts` passes. |
| Shared contracts describe agent intent independent of harness | Compliant | `src/harness/core/agent-pack.ts` defines all seven roles, modes, dispatch expectations, governance, and verification metadata; `agent-pack.test.ts` passes. |
| Delegate-first rules remain portable | Compliant | Shared delegate-first rules are encoded in `agent-pack.ts`; Codex renders instruction-level delegation and emits capability diagnostics for unsupported runtime parity; `codex.test.ts` passes. |
| Verification protocol remains shared | Compliant | `VERIFICATION_PROTOCOL` is shared and rendered into Codex agent instructions; `agent-pack.test.ts` and `codex.test.ts` verify evidence-oriented reporting. |
| Shared layer requests harness artifact generation | Compliant | `HarnessAdapter` contracts and `registry.ts` route selected harnesses to adapter renderers; Codex/OpenCode artifact writing stays adapter-owned. |
| Unsupported harnesses are not silently generated | Compliant | `resolveHarness()` returns `harness.unsupported` with `artifacts: []`; `registry.test.ts` covers Claude, Antigravity, and unknown harnesses. |
| Codex artifacts are generated from shared contracts | Compliant | `codex.ts` renders seven `.codex/agents/*.toml` artifacts, Codex config/MCP snippets, and skill layout artifacts only through validated surfaces; fixture tests pass. |
| Codex runtime assumptions are constrained | Compliant | Codex capabilities are configuration-first/instruction-only for delegation/runtime enforcement; unvalidated hooks and runtime delegation produce diagnostics instead of runtime API dependencies. |
| Codex capability gaps are visible | Compliant | `codex-surfaces.ts` and `memory-governance.ts` emit diagnostics including `codex.permission.memory.enforcement_gap`, `codex.delegation.runtime.unsupported`, and parent-context warnings; fixture tests pass. |
| Root-only memory tools remain restricted | Compliant | `memory-governance.ts` marks `mem_session_start`, `mem_session_summary`, and `mem_save_prompt` as root-owned and forbids them for subagents; memory governance tests pass. |
| Runtime enforcement is used where available | Compliant | OpenCode capabilities report runtime support; Codex does not claim hard enforcement where unavailable and instead emits explicit diagnostics, matching the spec branch for unavailable controls. |
| Enforcement gaps are diagnosed where unavailable | Compliant | Codex permission, parent-context, and memory-write enforcement gaps are warnings/errors in adapter diagnostics; `codex.test.ts` and `memory-governance.test.ts` pass. |
| Subagents require parent memory context | Compliant | Rendered governance instructions require parent `session_id` and `project` before subagent memory calls; `memory-governance.test.ts` covers this rule. |
| Memory permissions remain role-sensitive | Compliant | Read-only roles receive only the recall chain; write-capable roles receive delegated write tools; unsupported Codex hard enforcement is diagnosed. |
| SDD namespace remains protected in OpenSpec-only mode | Compliant | Governance instructions protect `sdd/*` and state SDD artifacts use thoth-mem topic keys only in modes including thoth-mem; this verification persisted OpenSpec only. |
| SDD skill content remains harness-neutral | Compliant | `src/harness/core/skills.ts` derives bundled skills from shared registry paths; skill layout tests verify SDD skill phase responsibilities when rendered for Codex. |
| Full SDD pipeline remains portable | Compliant | `src/harness/core/sdd.ts` models proposal -> spec -> design -> tasks -> plan-review -> implementation confirmation -> apply -> verify -> archive; `sdd.test.ts` passes. |
| Non-Codex harness requests remain out of scope | Compliant | Harness ID type is limited to `opencode | codex`; unsupported requests fail without artifacts; no Claude/Antigravity implementation files were introduced. |
| thoth-mem is not replaced | Compliant | Codex config uses the `thoth_mem` MCP and shared governance preserves thoth-mem as backend; no replacement memory layer is present. |
| Rollback preserves OpenCode behavior | Compliant | `opencode` remains `DEFAULT_HARNESS`; CLI generation requires explicit `--harness=codex --dry-run`; rollback safety tests passed. |

## Design Coherence

- The implementation follows the design's adapter boundary: shared contracts are
  in `src/harness/core/*`, OpenCode SDK usage is confined to the OpenCode
  adapter, and Codex rendering is confined to Codex adapter/writer modules.
- Codex is configuration-first and dry-run/generate-first: the CLI rejects
  implicit generation and non-dry-run Codex output.
- Codex surface validation gates generation; unknown or unsupported surfaces are
  represented as diagnostics rather than speculative artifacts.
- thoth-mem governance remains shared and role-sensitive, with Codex enforcement
  gaps explicitly visible instead of treated as hard runtime controls.
- Rollback remains bounded to Codex adapter registration and generation surface;
  OpenCode stays the default runtime path.

## Issues Found

None. Intentional Codex capability limitations are surfaced as adapter
diagnostics and are compliant with the MVP scope.

## Verdict

PASSED — 20/20 spec scenarios compliant, 21/21 tasks complete, and all executed
verification commands passed.
