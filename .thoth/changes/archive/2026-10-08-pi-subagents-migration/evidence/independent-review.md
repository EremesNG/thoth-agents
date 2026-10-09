# Independent review and continuation

Fresh Oracle task `subtask_thoth-oracle_1790463937522_6356e9ac` completed on 2026-09-26 with **PASS — repository migration only**, after inspecting current diff, tests, pinned upstream contracts and raw isolated runtime traces. No material implementation blocker remained. This does not authorize or verify global rollout.

Previous findings were repaired: old model/effort migration; explicit model inheritance; symlink/sidecar-safe managed writes; safe settings re-merge. Additional root-executed probes found and repaired transcript provider observation, default automatic missions, and ambient root injection into child processes.

Final focused root command:

`pnpm exec vitest run src/pi.test.ts src/cli/pi-native-probe.test.ts src/cli/pi-install.test.ts src/cli/pi-resources.test.ts src/cli/pi-paths.test.ts src/cli/operations/pi.test.ts src/harness/adapters/pi.test.ts src/harness/writers/pi-agent.test.ts src/agents/prompt-dialects.test.ts src/agents/prompt-rendering.test.ts src/harness/generate-integration-packages.test.ts src/harness/integration-lifecycle.test.ts`

Result: **155 tests / 12 files passed**. Root check:ci, typecheck, build, verify:pi-package and git diff --check also passed. Ready work-contract validation passed. No commit or primary Pi install was performed.

## Pending closeout

Work remains unclosed and semantic acceptance bookkeeping is pending; this report must not be mistaken for full green CI or production rollout approval.

- Full suite needs the existing `../thoth-plugins` fixture. With CODEX_HOME removed only in the test process, the last full run had 1186 passes / 3 missing-fixture failures (before the additional passing child-guard regression). Do not silently skip these tests or mutate other harness code to hide the environment limitation.
- Before authorized primary rollout: exercise the minimum host, real model/research services, delivered live steering, active-child termination and thoth-mem coexistence. A stopped-before-start run with unknown processTerminal is not proof of safe writer reassignment.
- Reconcile fingerprints and acceptance against the current diff before closeout. The child-boundary unit honestly has unknown pre-edit baseline; other implementation baselines were captured before dispatch.

## First next action

Restore or provide the expected marketplace fixture and rerun full validation with CODEX_HOME isolated. Then finish acceptance bookkeeping; arrange explicit approval and bounded live checks before changing the primary installation.
