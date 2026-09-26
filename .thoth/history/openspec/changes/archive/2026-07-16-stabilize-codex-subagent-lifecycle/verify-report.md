# Verification Report: Stabilize Codex Subagent Lifecycle

## Round

round 1

## Completeness

- OpenSpec preflight: complete and current.
- Accelerated-pipeline artifacts recovered from filesystem only.
- Proposal success criteria: **11/11 compliant**.
- Tasks: **17/17 completed and verified**.
- Changed implementation surface matches the proposal: 12 source/test files, 240 additions and 31 deletions.
- No changes found in the seven-role roster, OpenCode runtime adapter, memory ownership code, governing specs, artifact names, or topic keys.
- `git diff --check`: pass.
- No verification report or memory artifact was written.
- The optional plan-review remains `[OKAY]`; its task hash predates apply-time checkbox updates, so it was not used as fresh verification evidence.

| Tasks | Result | Fresh evidence |
| --- | --- | --- |
| 1.1–1.2 | Complete | Complexity-only routing contract and test at `src/harness/core/sdd.ts:187` and `src/harness/core/sdd.test.ts:207` |
| 1.3–1.4 | Complete | Typed lifecycle nomenclature and dialect tests at `src/agents/prompt-dialects.ts:147` and `src/agents/prompt-dialects.test.ts:113` |
| 1.5–1.6 | Complete | Shared lifecycle policy and rendering tests at `src/agents/prompt-sections.ts:358` and `src/agents/prompt-rendering.test.ts:827` |
| 2.1–2.2 | Complete | Codex wait/probe, stop guards, and disclosure at `src/harness/adapters/codex.ts:225` and `src/harness/adapters/codex.test.ts:548` |
| 2.3–2.4 | Complete | Unsupported lifecycle surface record at `src/harness/adapters/codex-surfaces.ts:288` and its focused test |
| 2.5 | Complete | Combined five-boundary lifecycle suite passed |
| 3.1–3.3 | Complete | Bounded validation and structured gaps at `src/skills/sdd-tasks/SKILL.md:50` and packaged-skill assertions at `src/harness/writers/skill-layout.test.ts:250` |
| 4.1–4.3 | Complete | Focused tests, CI checks, build, and isolated full regression evidence below |

## Build and Test Evidence

All results below are fresh round-1 evidence; prior reported results were used only to guide command selection.

| Check | Result |
| --- | --- |
| Six-file focused contract suite | **Pass:** 6 files, 101 tests |
| `pnpm run check:ci` | **Pass:** 234 files checked, no fixes |
| `pnpm run typecheck` | **Pass** |
| `pnpm run build` | **Pass:** package, declarations, and schema generated; schema hash remained identical to `HEAD` |
| Normal `pnpm test` | 75/76 files and 799/800 tests; only environment-sensitive CLI assertion failed after reading real OpenCode drift |
| Corrected isolated-profile `pnpm test` | **Pass:** 76 files, 800 tests |
| Polling timing-flake rerun | **Pass:** 1 file, 11 tests |
| Orchestrator prompt-size guard | **Pass:** 16,489 / 16,500 characters |
| Post-verification tree check | No additional tracked changes |

The normal-suite failure is unrelated to this diff: `src/cli/commands.test.ts:327` consumed the user’s real OpenCode state and observed missing managed skills/roster drift. Redirecting `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, and `OPENCODE_CONFIG_DIR` produced a clean 800/800 run.

## Compliance Matrix

| # | Proposal success criterion | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Quiet/nonterminal outcomes remain in progress and cannot trigger lifecycle action | `src/agents/prompt-dialects.ts:147`; `src/agents/prompt-sections.ts:358`; rendering tests at `src/agents/prompt-rendering.test.ts:827` | Compliant |
| 2 | Same-session wait/probe; no numeric duration, interval, or timeout | `src/agents/prompt-dialects.ts:149`; `src/agents/prompt-sections.ts:358`; Codex disclosure at `src/harness/adapters/codex.ts:225`; negative timeout assertion at `src/harness/adapters/codex.test.ts:564` | Compliant |
| 3 | Explicit allowed stop conditions | `src/agents/prompt-sections.ts:358` lists terminal completion/failure, user deadline, cancellation, and superseding request | Compliant |
| 4 | One shared quality/artifact retry; nonterminal probes consume none | `src/agents/prompt-sections.ts:359`; assertions at `src/agents/prompt-rendering.test.ts:838` and `src/harness/adapters/codex.test.ts:559` | Compliant |
| 5 | Same-role capacity recovery, three-attempt allowance, no role substitution | `src/agents/prompt-sections.ts:360`; rendering assertions at `src/agents/prompt-rendering.test.ts:841`; role contract unchanged | Compliant |
| 6 | sdd-tasks defaults to quick; deep only for complex plans | Canonical condition at `src/harness/core/sdd.ts:187`; rendered matrix at `src/agents/prompt-sections.ts:207`; focused route test at `src/harness/core/sdd.test.ts:207` | Compliant |
| 7 | sdd-tasks uses bounded validation and prior evidence | `src/skills/sdd-tasks/SKILL.md:50-64`; packaged-skill test at `src/harness/writers/skill-layout.test.ts:250` | Compliant |
| 8 | Every unresolved reference gets one structured Validation Gaps entry | `src/skills/sdd-tasks/SKILL.md:68-82`; package assertions at `src/harness/writers/skill-layout.test.ts:272` | Compliant |
| 9 | Codex enforcement remains instruction-only/unsupported | `src/harness/adapters/codex-surfaces.ts:288-305`; `src/harness/adapters/codex.ts:225`; focused surface tests | Compliant |
| 10 | Focused rendering, dialect, adapter, surface, routing, packaging, and OpenCode-leak coverage | Fresh focused suite passed 101/101; isolated full suite passed 800/800; OpenCode negative assertions at `src/agents/prompt-rendering.test.ts:827-859` | Compliant |
| 11 | Roster, permissions, OpenCode runtime, SDD gates, artifacts, and memory keys unchanged | Diff inspection found no changes in `agent-pack.ts`, OpenCode runtime wiring, memory code, or governing specs; full isolated regression passed | Compliant |

## Issues Found

### Critical

None.

### Warnings

- **[W1] Normal full-suite result depends on the user’s real OpenCode installation**
  - file: `src/cli/commands.test.ts:327`
  - criterion: Focused tests and OpenCode baseline verification
  - evidence: normal run failed 1/800 because managed OpenCode state was drifted; isolated full run passed 800/800
  - fix: Inject an isolated `OperationContext.env` or isolate OpenCode configuration variables in this test so repository verification does not consume ambient user state.

- **[W2] Orchestrator prompt budget has only 11 characters of headroom**
  - file: `src/agents/index.test.ts:556`
  - criterion: Preserve existing prompt and role-contract invariants
  - evidence: fresh rendered length is 16,489 against the 16,500 ceiling
  - fix: Reclaim prompt text before further root-guidance growth, or deliberately revise the ceiling with reviewed evidence.

## Constitution Suggestion

None. The change does not meet the governance-touching auto-suggest heuristic.

## Verdict

`pass with warnings`
