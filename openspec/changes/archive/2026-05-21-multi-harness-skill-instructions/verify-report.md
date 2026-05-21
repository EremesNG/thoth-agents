# Verification Report: Multi-Harness Skill Instructions

## Completeness

All tasks in `openspec/changes/multi-harness-skill-instructions/tasks.md` are
checked complete. A focused unchecked-task scan found no pending, in-progress,
or skipped task markers.

Changed implementation scope matches the proposal and design:

- Shared harness vocabulary and binding guidance were added under
  `src/skills/_shared/`.
- Workflow, orchestration, SDD, thoth-mem, and cartography skill instructions
  were updated to separate shared semantics from OpenCode/Codex bindings.
- Codex packaging and content assertions were updated in
  `src/harness/writers/skill-layout.test.ts`.
- Codex role instructions disclose instruction-level limits in
  `src/harness/adapters/codex.ts`.

## Build and Test Evidence

- `rg -n "^- \[ \]|^- \[~\]|^- \[-\]" openspec/changes/multi-harness-skill-instructions/tasks.md`
  exited with code 1 and no output, confirming no incomplete checklist markers.
- `rg -n "harness-neutral|harness binding|blocking user input surface|semantic role|instruction-level|unsupported-capability|plugin-bundled" src/skills/_shared -g "*.md"`
  passed and found the required shared anchors.
- `rg -n "question tool|question-tool|@explorer|@librarian|@oracle|@designer|@quick|@deep|task_status|todowrite|AGENTS\.md|~/.config/opencode|\.agents/skills" src/skills -g "*.md"`
  passed. Remaining hits are scoped as OpenCode bindings, examples, shared
  reference paths, or explicit fallback/development guidance.
- `rg -n "request_user_input|Codex|plugin-bundled|instruction-only|unsupported-capability|harness-provided" src/skills -g "*.md"`
  passed. Codex hits prefer plugin-bundled skills and disclose instruction-only
  or unsupported-capability limits.
- `rg -n "thoth-agents|thoth-agent|litebrain|engram" src/skills -g "*.md"`
  passed. `thoth-agents` remains canonical; `engram` appears only as a
  prohibition.
- `bun test src/harness/writers/skill-layout.test.ts` passed: 8 tests, 0
  failures.
- `bun test src/harness/adapters/codex.test.ts src/agents/index.test.ts src/agents/prompt-dialects.test.ts src/harness/core/skills.test.ts src/harness/core/sdd.test.ts src/harness/core/memory-governance.test.ts`
  passed: 104 tests, 0 failures.
- `bun run check:ci` passed: Biome checked 173 files with no errors.
- `bun run typecheck` passed: `tsc --noEmit` exited cleanly.
- `bun test` passed: 548 tests, 0 failures.
- `git diff --check -- src/skills src/harness/writers/skill-layout.test.ts src/harness/adapters/codex.ts openspec/changes/multi-harness-skill-instructions`
  passed with no whitespace errors.

## Compliance Matrix

| Spec scenario | Verdict | Evidence |
| --- | --- | --- |
| Shared workflow text avoids universal harness assumptions | Pass | Shared conventions define harness-neutral semantics and runtime-specific bindings; focused shared-anchor grep passed. |
| Harness examples remain clearly scoped | Pass | OpenCode and Codex primitive grep hits are framed as bindings/examples in shared, workflow, SDD, thoth-mem, and cartography instructions. |
| OpenCode primitives are scoped to OpenCode | Pass | Remaining `@role`, `task_status`, `todowrite`, `AGENTS.md`, and `~/.config/opencode` hits are OpenCode-bound examples or shared reference paths. |
| Codex primitives are scoped to Codex | Pass | Codex hits cover `request_user_input`, plugin-bundled skills, capability notes, and instruction-only limits without universal enforcement claims. |
| OpenCode skill users retain explicit operational guidance | Pass | OpenCode bindings remain explicit for question, role dispatch, progress, cartography paths, and review/execution surfaces. |
| Portable wording does not remove OpenCode requirements | Pass | SDD phase ordering, artifact prerequisites, review gates, OpenSpec paths, and thoth-mem topic keys remain covered by SDD/core tests. |
| Codex primary packaging points to plugin-local skills | Pass | `skill-layout.test.ts` asserts plugin-bundled Codex skill output and shared multi-harness anchors; focused test passed. |
| Fallback skill output is explicitly bounded | Pass | `.agents/skills` appears as explicit fallback/repository-local output with duplicate-scope diagnostics; focused grep and skill-layout tests passed. |
| Skill instructions avoid old project identities | Pass | Identity grep shows `thoth-agents` as canonical and no active `litebrain` or `thoth-agent` identity references. |
| Historical references remain non-canonical | Pass | `engram` appears only in explicit prohibition text, not active behavior. |
| Role semantics remain stable across harnesses | Pass | Shared and thoth-mem instructions preserve canonical semantic roles and read-only/write-capable boundaries; role tests passed. |
| Role invocation syntax is harness-specific | Pass | OpenCode `@role` syntax and Codex role-agent/custom-agent language are presented as bindings. |
| Missing harness binding blocks universal claims | Pass | Shared conventions require unsupported-capability diagnostics for missing bindings. |
| Instruction-only governance is disclosed | Pass | Codex adapter and thoth-mem instructions disclose instruction-level governance where runtime enforcement is not validated. |

## Design Coherence

The implementation follows the design's content-only approach. It centralizes
multi-harness vocabulary in shared skill references, preserves OpenCode as the
baseline binding, scopes Codex behavior to plugin-bundled skills and
instruction-level limitations, and avoids runtime adapter behavior changes
beyond Codex instruction text and content assertions.

The changed file set aligns with the design scope. No agent roster,
persistence-mode, OpenSpec path, thoth-mem topic-key, SDD phase-order, hook, MCP,
or package-writer contract drift was found during verification.

## Issues Found

None blocking.

Non-blocking note: Git reported that `src/skills/cartography/README.md` has CRLF
line endings that will be normalized to LF the next time Git touches the file.
`git diff --check`, Biome, TypeScript, and all tests still passed.

## Verdict

Pass.
