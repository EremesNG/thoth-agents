# Verification Report: Pi interaction and web extensions

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: All FR-001 through FR-005 and SC-001 through SC-004 are implemented and covered. SC-005 retains explicit unobserved runtime risks.
- **Correctness**: Native exact pins, root-only interaction/progress, librarian additive web permissions, truthful status and dependency-failure semantics match the approved contracts.
- **Coherence**: Spec, refined plan, task evidence, generated agents, tests and operator docs agree. Final documentation corrections resolve the two nonblocking notes below.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | src/cli/pi-install.ts PI_PACKAGE_SPECS and shared apply branch; three required 2.9.0 pins | Oracle focused installer/status tests (command below), exact source/dry-run/partial failure and ledger coverage | PASS |
| FR-002 | src/agents/prompt-dialects.ts, src/agents/prompt-sections.ts, src/harness/adapters/pi.ts; root schema/cancel/partial/no-UI guidance, six children escalate | Oracle focused adapter/dialect tests and full generated child prompt audit | PASS |
| FR-003 | Pi todo mapping and root session-owned progress guidance; children have no todo permission | Oracle focused adapter tests and six-child prompt/allowlist audit | PASS |
| FR-004 | src/harness/writers/pi-agent.ts and generated thoth-librarian.md retain current research tools plus web_search/web_fetch | Oracle focused writer tests and all six allowlist audit | PASS |
| FR-005 | README.md, docs/installation.md, docs/skills-and-mcps.md and Pi status clarify installed/live evidence | Oracle status tests and operator-doc inspection; context validator | PASS |
| SC-001 [buildable] | Installer/status tests cover exact source pins, dry-run, mismatch, partial failure; Update shares inspected apply branch | Oracle focused suite 85/85 PASS | PASS |
| SC-002 [buildable] | Full root plus six-child render audit; questions through openQuestions, no direct child dialog/todo | Oracle focused suite and generated prompt audit | PASS |
| SC-003 [buildable] | Exactly two extra librarian tools, five other allowlists unchanged | Oracle focused writer test and inventory audit | PASS |
| SC-004 [buildable] | Product diff limited to 26 declared files; generated other-harness resources unchanged | check:ci, typecheck, build, full 1162/1162 tests, integration:verify 12/12, diff check | PASS |
| SC-005 [outcome] | No real Pi dialog, todo-panel or configured-provider request observed | N/A: explicit RISK-UI-001, RISK-TODO-001, RISK-WEB-001 | RISK |

## Executed checks

Fresh oracle_rpiv_final:
- `pnpm exec vitest run src/cli/pi-install.test.ts src/cli/install.test.ts src/cli/operations/pi.test.ts src/agents/prompt-dialects.test.ts src/harness/adapters/pi.test.ts src/harness/writers/pi-agent.test.ts src/harness/core/memory-governance.test.ts` — 7 files, 85 tests PASS.
- `pnpm run integration:verify` — 2 files, 12 tests PASS.
- `pnpm run check:ci` — 266 files, PASS.
- `pnpm run typecheck` — PASS.
- `git diff --check` — PASS.
- Full root and six-child rendered prompt/allowlist audit — PASS.
- Frozen exact-version manifests and tool contracts — matched all three 2.9.0 extensions.

Implementation writer:
- Focused feature tests 149/149; installer/status 59/59; memory/prompt regression 25/25.
- `pnpm run build` — PASS.
- `pnpm test` with inherited CODEX_HOME omitted only from child environment — 94 files, 1162 tests PASS.
- One earlier full-suite failure was a stale Pi progress expectation; it was corrected, then the complete suite passed.
- Context-router validation — zero errors/warnings; no network or home installation.

Root after documentation-only corrections:
- `python C:/Users/EremesNG/.agents/skills/progressive-context-router/scripts/validate_context_setup.py --root .` — PASS, zero errors/warnings, existing informational entrypoint-size note.
- `git diff --check` — PASS.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| WARN-DOC-001 | nonblocking, resolved | Coherence | Internal CLI routing paragraph omitted new packages | docs/agent/cli-installation.md now lists RPIV question, todo and web extensions |
| WARN-COV-001 | nonblocking, resolved | Coherence | T003 overstated a dedicated applied-Update test | tasks.md now accurately says Update-plan parity plus inspected shared apply branch |

No critical findings. Product review PASS is from fresh oracle_rpiv_final. Documentation-delta verification is recorded in the final lineage below.

## Residual risks

- SC-005: RISK-UI-001, RISK-TODO-001 and RISK-WEB-001 remain unobserved runtime outcomes; validate questions, task-panel rendering and provider-backed web operation in the operator's configured Pi session.
- SC-005 / RISK-UI-001: No real interactive ask_user_question response/cancellation observed. Validate in a compatible interactive Pi host.
- SC-005 / RISK-TODO-001: No real Pi task-panel/session progress rendering observed. Validate on a multi-step task in the operator session.
- SC-005 / RISK-WEB-001: No credentialed search or live fetch observed. Validate using an operator-configured provider without copying credentials.
- Wildcard upstream Pi peer ranges are not a live-host compatibility certificate; installed package evidence alone is not live capability evidence.

## Final verification lineage

Fresh oracle_rpiv_doc_closeout returned PASS after independently checking both documentation corrections against spec/plan; no new runtime claim or code mutation. All warnings resolved. Root retains responsibility for subsequent mechanical closeout bookkeeping and transactional archive.
