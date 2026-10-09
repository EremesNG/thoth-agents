# Pi-subagents migration compatibility evidence

## Scope and isolation

2026-09-26: npm pi-subagents 0.71.0 installed with `--ignore-scripts` into disposable directory `C:/Users/EremesNG/AppData/Local/Temp/thoth-subagents-probe-mue5Lz`. Pi 0.87.1 / Node 24.20.0 executed with a separate PI_CODING_AGENT_DIR and a credential-free deterministic model provider. The primary Pi settings/packages/auth were not edited. Candidate native artifacts also use the upstream per-user temporary runtime directory; these are test artifacts, not primary installation changes.

Official contracts: https://github.com/nicobailon/pi-subagents/releases/tag/v0.71.0 and packaged docs/agents.md, docs/tool-reference.md, docs/configuration.md. Upstream minimum host is 0.86.1; that minimum was not separately executed here.

## Executed checks

- Native `subagents_enable` activated `subagent` on the next request.
- Native `subagent({action:"list",capabilities:true})` discovered exactly the six Thoth definitions with builtin definitions disabled, model/thinking defaults and fresh context.
- A `workflowScript` using `runs.all` executed explorer, oracle, designer, quick and deep; all five returned `ok:true` and `PROBE_OK`, with requested/resolved fresh context. Different native child PIDs were observed. This verifies real child execution and terminal fan-in, not model quality.
- Librarian launched with `async:true`; its native completion caused the parent provider's next request without sleeps/polling. Background result was PROBE_OK.
- Final probe parent PID 5376 carried the root marker and PARENT_SECRET_SENTINEL. Child PIDs 11976, 4140, 42776, 42480, 2812, 25408 carried neither root marker nor parent sentinel. The role marker matched the intended specialist.
- Read-only roles exposed read/bash plus upstream contact_supervisor. Writers additionally exposed edit/write. No child exposed subagent or subagents_enable.
- With the actual pinned Context7, pi-web-access and pi-mcp-adapter extensions loaded, librarian exposed resolve-library-id, query-docs, mcp, web_search, fetch_content, get_search_content and source_check. No external research call was made; registration is not remote service health evidence. Ambient MCP configuration reported unavailable codegraph/pycharm endpoints; no project discovery or mutation was attempted through them.
- Missions initially auto-attached, revealing an upstream default. Installer now disables automatic missions and scheduled runs; the final ordinary launch receipts had no mission attachment.
- A controlled native async run b89d463e-816d-43fb-a095-307b76ab33f0 accepted steer/status/stop calls. Later native status artifact reported stopped, child not-started, and queued steering failed because the child was stopped. This proves routing/control requests and stopped-before-start handling only, NOT delivered steering or termination of an active child. Native processTerminal remained unknown; do not treat stop acknowledgement as mutation-safe completion.

## Runtime faults found and repaired

1. Pi's normalized provider context stores system prompts in transcript messages. The old observer used context.systemPrompt; real package verification failed. A red/green generated-provider regression now exercises getCurrentSystemPrompt(context.messages), and the real package verifier passes.
2. Candidate background children load ambient Thoth extensions. The first full-extension probe found the root marker in all six children. src/pi.ts now exits before registering root/session synchronization hooks for native PI_SUBAGENT_CHILD=1. Unit regression went red then green; the repeated native probe confirmed root markers absent from every child.

## Repository checks

- Writer TDD reproduced five override/inheritance/filesystem defects before repair; focused affected 131 tests, additional Pi/CLI 128 tests and integration 12 tests passed at that revision.
- Root rechecked focused native extension/observer: 10 tests passed after child guard; installer/adapter/observer: 43 passed after mission configuration change.
- Root check:ci, typecheck, build and verify:pi-package passed. Packed real-Pi verification observed one root marker, six materialized specialists, five attributable skills, one session_start and no orchestrator child.
- Full suite with inherited CODEX_HOME: 1169 passed / 20 failed before the child regression. Removing CODEX_HOME from only the test process produced 1186 passed / 3 failed. All three failures are publish-marketplace fixtures requiring absent sibling `../thoth-plugins`; no marketplace product code was changed. Complete suite is therefore NOT green in this workspace.

## Remaining limitations / rollout gate

No global runtime replacement, real model-provider generation, live research-service query, delivered live steering, running-child termination, or thoth-mem lifecycle coexistence test was performed. The deterministic provider proves execution mechanics and tool visibility, not autonomous behavior or external memory authorization. Review stopped/unknown native states before reassigning writable surfaces. Keep the primary installation unchanged pending explicit rollout and these live checks.

Raw isolated probe fixture/logs remain at the disposable path above: probe-provider.mjs, runtime-evidence.jsonl, runtime-output.jsonl, runtime-error.log. This report is distilled evidence; raw traces are not repository artifacts.
