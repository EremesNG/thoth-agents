# Agreed intent and execution scope

Prior feature was committed as 06350fc (feat(pi): add global specialist model configuration panel). Source was clean before this new planning work.

## Human decisions

Remove Quick and rename Deep to Worker across every supported harness. Keep Deep's write-capable implementation role but remove the narrow/complex implementation-tier distinction. New inventory: orchestrator plus explorer, librarian, oracle, designer, worker.

User explicitly chose fresh Worker defaults, NOT transfer of Deep model/effort personalizations: gpt-6-luna/max in OpenCode and Codex; openai-codex/gpt-6-luna/max in Pi. Claude-specific choice explicitly remains sonnet/medium. No quick/deep aliases. Preserve an existing unowned Worker resource by failing closed rather than overwriting it; preserve unrelated resources. Installed old managed resources may be retired only with attribution/safe path checks, without reading their customization into Worker.

User supplied screenshot C:/Users/EremesNG/AppData/Local/Temp/orca-paste-1790479611562-06107d56-0e62-4031-8401-b75d21c8c3d5.png, inspected by root: OpenCode Select variant shows none/low/medium/high/xhigh/max and status GPT-6 Luna OpenAI. This resolves the OpenCode UI capability question and proves the repo whitelist is stale for this selected model; it does not attest a provider API call. No silent xhigh fallback is authorized.

## Native evidence

Explorer run e9227d31-fd0c-406c-9d60-27700078183c completed read-only impact discovery. Canonical identity resides in src/harness/core/agent-pack.ts; related unions/routing in workflow.ts and prompt-sections.ts; factories in src/agents; manual schema keys and presets in src/config. Pi has explicit role inventory in src/harness/pi-specialists.ts. CLI role selection, managed lifecycle and generated assets require semantic updates, not a global text replacement. Keep historical .thoth/archive/history and prior .thoth/changes records unchanged.

Librarian run 5cb9230b-8f79-4024-a497-1fd04e60c537 returned official Codex model_reasoning_effort/max evidence and OpenAI GPT-6 Luna model effort documentation. OpenCode docs/source alone were initially inconclusive; inspected user UI evidence resolves current availability. Sources: https://developers.openai.com/codex/config-file/config-reference ; https://developers.openai.com/api/docs/models/gpt-6-luna ; https://dev.opencode.ai/docs/models/ . No provider calls or live setup were performed.

## Ownership and dependencies

One implementation writer owns the role-identity seam. The canonical role union propagates through every adapter, schema, UI and installer; splitting simultaneous writers by file would create incompatible shared role assumptions and generated inventories. Managed cleanup is an ordered substep within that same writer's output, with its own fixture tests before acceptance. Root follows with active docs/spec alignment, integration checks and final fresh Oracle. No concurrent writers in this worktree.

Explorer and librarian delivered distinct useful evidence. Deep is the installed native writer fitting the coupled cross-harness change; its current runtime name remains thoth-deep until a later explicitly authorized installation. Quick offers no gain for this graph-wide identity change. Designer is unnecessary because the existing Pi panel only loses one role and renames another, with no new interaction design. Oracle plan review remains user-selected; fresh final Oracle is mandatory. Root retains intent, acceptance and artifacts.

## Approved-seam test proposal

Canonical roster/config parser and defaults; rendered role routing/prompts; adapter/writer inventories; CLI model read/save; native Pi panel command/render/input; setup/sync owned-resource preflight and cleanup. Add negative tests for old role names, unsafe/unowned targets and Worker collisions. Assert Worker defaults on every harness, preserve other defaults, preserve model-panel snapshot/cancel/partial-save behavior with five roles, and assert generated assets contain no old role files.

No live global installation, credentials, external runtime code changes, commits of this new feature or push are part of implementation authority yet. Initial user asked to commit the prior feature first; that is complete. No old-name occurrence sweep may rewrite historical records, unrelated model/provider identifiers, filenames such as quick-reference.md, or third-party definitions.
