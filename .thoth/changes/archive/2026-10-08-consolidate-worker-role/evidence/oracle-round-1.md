# Final Oracle review — round 1

Native fresh read-only run: `515dd200-28e7-496e-9b61-383eec812895`.
Verdict: **REJECT**. Root accepts these as actionable same-intent blockers; no product decision is required.

1. **P1 — Codex dangling symlinks.** `src/cli/codex-install.ts` checks existsSync before lstatSync, so dangling Worker, obsolete-role and ledger links can be treated as absent. The managed-state writer can follow a dangling Worker symlink to an out-of-scope target. Require lstat-based presence including ancestors, plus regressions.
2. **P2 — Residual implementation tiers.** `src/harness/core/agent-pack.ts` excludes narrow known low-risk edits and `src/agents/worker.ts` excludes bulk mechanical changes; generated Worker prompts inherit both. Worker must cover bounded nonvisual implementation regardless of complexity, while retaining appropriate designer/read-only-role distinctions.
3. **P2 — Interrupted Codex recovery.** Worker is created before ownership ledger persistence. An interruption leaves its own new file unowned for the next plan, which then rejects retry. Require durable ownership-safe recovery, without accepting arbitrary colliding Worker files, and test interrupted first install followed by retry.
4. **P2 — Published schema rejection.** Runtime Zod refinements reject retired role names but disappear during JSON Schema generation. Published schema still allows presets.example.quick, agents.deep and fallback.chains.quick. Express forbidden keys in serializable constraints and verify runtime plus published schema rejection.

Oracle assessment: AC-defaults passed; AC-roster and AC-resources rejected; docs generally aligned with historical records preserved. Fresh focused runs passed 177 tests across 18 files; diff check passed. Broad-suite/native-package results were reviewed as root evidence, not independently rerun. No live changes or provider calls.
