# Spec: Multi-Harness Agent Pack

## Requirements

### Requirement: Support exactly four harnesses

The system MUST support OpenCode, Codex, Claude Code, and Pi; OpenCode MUST remain the default when no harness is selected, and unsupported harnesses MUST fail explicitly without fallback artifacts or dispatch.

#### Scenario: US1 - Install the complete Pi agent pack 1

- **GIVEN** Pi `0.86.1` or a compatible evidenced release, Node.js `>=22.19`, and an empty isolated Pi home
- **WHEN** `thoth-agents install --agent=pi` is applied
- **THEN** the native Pi delegation and research packages, managed grep.app MCP configuration, root instructions, five canonical specialist definitions, owned skills, required external skills, provider setup, and Pi ledger record are completed in order

#### Scenario: US1 - Install the complete Pi agent pack 2

- **GIVEN** the same environment
- **WHEN** the installation is run with `--dry-run`
- **THEN** every intended command and managed target is reported and no Pi package, file, skill, provider, or ledger state is changed

#### Scenario: US1 - Install the complete Pi agent pack 3

- **GIVEN** any mandatory Pi-owned, thoth-agents-owned, external-skill, or provider step fails
- **WHEN** installation finishes
- **THEN** it reports bounded partial-state diagnostics and does not record complete installation

#### Scenario: US4 - Preserve existing harnesses while raising the runtime floor 1

- **GIVEN** an existing OpenCode, Codex, or Claude workflow
- **WHEN** the Pi integration is present
- **THEN** its existing adapter, installation, delegation, provider, and generated-package behavior is unchanged

#### Scenario: US4 - Preserve existing harnesses while raising the runtime floor 2

- **GIVEN** active package, CI, skill, and documentation surfaces
- **WHEN** runtime requirements are evaluated
- **THEN** they consistently require Node.js `>=22.19`

### Requirement: Preserve the six-role contract

The native Pi package MUST derive one ambient orchestrator root and the five explorer, librarian, oracle, designer, and worker specialists from the canonical role contracts, MUST NOT create an orchestrator child definition, and MUST preserve role prompts, model/effort metadata where Pi supports them (including max through @thoth-agents/pi-subagents effort), memory envelopes, ownership, and return contracts. The retired quick/deep writer tier MUST NOT remain an active role or alias. Root lifecycle injection MUST provide exactly one current adaptive-root contract without duplicate APPEND_SYSTEM.md persistence. Five owned skills MUST resolve from the package manifest without copied global duplicates. Specialist synchronization MUST make exactly five attributable definitions discoverable for @thoth-agents/pi-subagents and preserve/report unowned canonical conflicts instead of overwriting them. No native child identity marker may be invented.

#### Scenario: Preserve the six-role contract

- **GIVEN** generated specialists and lean child resources
- **WHEN** a child executes
- **THEN** its role and model/effort contract remain intact without root prompt injection

### Requirement: Use adaptive-root delegation

Before substantive execution, the root MUST shape bounded ready and blocked lanes with exact dependencies, ownership, specialist fit, and verification inputs; for each declared ready parallel group it MUST create one fresh bounded native assignment per lane, dispatch every lane admitted by current native capacity before the first blocking wait or result collection, refill released capacity with remaining ready lanes before waiting again, accept only terminal native evidence for fan-in, and cross the declared barrier only after all lanes are reconciled, while preserving truthful sequential fallback when native concurrency is unavailable or unproven.

#### Scenario: US3 - Execute native fan-out before fan-in 1

- **GIVEN** a declared group whose ready lanes fit current native capacity
- **WHEN** implementation begins
- **THEN** the root creates one fresh bounded specialist assignment per lane and issues all native dispatches before the first wait, status, result, or assigned-work implementation action

#### Scenario: US3 - Execute native fan-out before fan-in 2

- **GIVEN** a declared group is wider than current native capacity
- **WHEN** a terminal result releases capacity
- **THEN** the root dispatches the next undispatched ready lane before waiting again and does not claim full-width concurrency

#### Scenario: US3 - Execute native fan-out before fan-in 3

- **GIVEN** a harness lacks or does not prove the needed concurrent primitive
- **WHEN** the group is reached
- **THEN** the root reports the capability gap and uses a truthful sequential fallback without adding a Thoth executor

#### Scenario: US3 - Execute native fan-out before fan-in 4

- **GIVEN** some group lanes are nonterminal, timed out, silent, or malformed
- **WHEN** fan-in is evaluated
- **THEN** the root keeps the barrier closed until every lane has terminal validated evidence

### Requirement: Keep role permissions explicit

The Pi extension and specialist definitions MUST apply the strongest native root and child tool controls available while stating that extension execution, root injection, resource materialization, process credentials, filesystem, and network access remain within the invoking user's privileges and are not an OS sandbox. Child tool registration filtered by `tools`, `disallowed_tools`, configuration and native `subagent_*` exclusions MAY be reported as runtime-verified registry filtering; all other role restrictions MUST be reported as instruction-level rather than unverified enforcement. Global @thoth-agents/pi-subagents configuration MUST request lean child resources and disabled continuation, preserving unrelated keys; project overrides can supersede global lean and full child resources are unsupported. Root-only lifecycle injection and synchronization MUST remain absent from lean children, while normal root injection remains singular and package skills remain manifest-discovered. Unowned specialist conflicts MUST be preserved/reported. Packed contents MUST remain thoth-owned without external implementations or provider assets, and non-Pi behavior MUST remain unchanged. Obsolete pi-subagents definition and builtin-disablement settings MUST NOT be presented as active @thoth-agents/pi-subagents controls.

#### Scenario: Keep role permissions explicit

- **GIVEN** supported @thoth-agents/pi-subagents configuration and an Oracle definition denying `ask_orchestrator`
- **WHEN** definitions and guidance are generated
- **THEN** the denial is described as registry filtering, behavioral role limits as instruction-level, and no unsupported control is claimed as enforced

### Requirement: Publish a native Pi package with runtime-autonomous assets

The published thoth-agents npm artifact MUST identify as a Pi package, MUST declare exactly one compiled native extension and the five packaged thoth-owned workflow skills through supported Pi manifest fields, MUST ship the five canonical specialist resources, and MUST remain usable from its installed package root without invoking the thoth-agents CLI or network during ordinary Pi runtime. Exactly five attributable specialists MUST be discoverable globally for @thoth-agents/pi-subagents; unowned canonical conflicts MUST be preserved/reported. Root injection MUST remain singular without persistent duplicate APPEND_SYSTEM.md, and manifest skills MUST not acquire global copies. Installation MUST verify the exact first-party package before downstream work, preserve zero-mutation preview, block unowned replacement and all downstream work on first-party failure, and restore/verify receipt-bound prior source and path on failed replacement. Explicit normalized local-package-root installation MUST match executing identity/version, verify Pi canonical source and resolved path, complete downstream packages/skills/ledger, omit provider setup and print separate local provider-install guidance.

#### Scenario: Publish a native Pi package with runtime-autonomous assets

- **GIVEN** a built package
- **WHEN** Pi assets are verified
- **THEN** five @thoth-agents/pi-subagents-compatible definitions ship without copied external implementation

### Requirement: Publish shared plugin bundles

The repository and npm package MUST contain one versioned shared `plugin/` bundle
with Codex and Claude manifests and one copy of the five canonical owned skills.
Marketplace catalogs remain in the separately versioned `EremesNG/thoth-plugins`
repository; this package MUST NOT generate project-local marketplace files.
Generated plugin versions MUST equal the root package version.

### Requirement: Install the Codex plugin through its native manager

The Codex installer MUST inspect JSON marketplace and plugin state, register
`EremesNG/thoth-plugins` when absent, and install or enable
`thoth-agents@thoth-plugins` through official `codex plugin` commands before
writing global agent-pack files. It MUST fail closed on unreadable state, a
same-named marketplace from another source, command failure, or failed
post-install verification. Dry-run MUST plan these commands without mutating the
native manager.

### Requirement: Generate the shared plugin from canonical source

Claude agents MUST be generated from `src/agents/`. The shared bundle MUST
receive one copy of the canonical thoth-owned `skills/` tree and MUST contain
separate harness-specific manifests and MCP surfaces. The Codex plugin manifest
MUST NOT declare generated role TOMLs; the CLI writer remains their canonical
delivery surface. Build and npm version lifecycle commands MUST synchronize the
generated shared plugin output.

### Requirement: Preserve native plugin-manager ownership

Pi installation MUST install and verify the exact executing thoth-agents package through pi install before installing the selected compatible separately packaged `@thoth-agents/pi-subagents` and research packages; MUST treat one schema-validated thoth-agents Pi-package receipt as the sole authority for replacing or removing an existing global first-party source; MUST reject an unowned, ambiguous, project-local, or receipt-inconsistent first-party source before mutation; and MUST use external packages' public native surfaces without vendoring, patching, copying their internals, or reimplementing execution, concurrency, task/history, research, or provider lifecycle in the root package. The adopted runtime source is maintained separately under pi-packages and MUST remain outside the root packed artifact. Configured incompatible incumbents pi-subagents or pi-subagents-j0k3r MUST block before mutation with manual native recovery, never automatic removal. Dry-run MUST mutate nothing; first-party verification failure MUST block downstream steps; replacement failure MUST restore and verify the prior receipt-bound source and report compensation failure. Packed contents MUST remain thoth-owned root assets and external package references, and non-Pi installation/runtime behavior MUST remain unchanged. Explicit local runtime roots MUST be validated and installed through native package management without requiring npm publication or silently falling back to npm.

#### Scenario: Preserve native plugin-manager ownership

- **GIVEN** the adopted runtime is available in the checkout
- **WHEN** local Pi setup is planned and applied
- **THEN** it installs and verifies that runtime by local path without resolving an unpublished npm package

### Requirement: Distinguish capability gaps from generation failure

Pi capability reporting MUST independently identify first-party package state as missing, conflicting, configured, loadable, observed-at-install, unobserved, or unavailable; MUST reserve observed-at-install for a real Pi subprocess whose final provider request contains exactly one current root marker for the receipt's exact source and manifest/extension digests; and MUST independently report packaged-skill discovery, specialist materialization, delegation, research, external credentials, provider setup, and unsupported security or lifecycle guarantees. Direct native-package activation with missing external dependencies MUST degrade truthfully without crashing or claiming complete installation. Delegation reporting MUST describe @thoth-agents/pi-subagents, lean resource requirements, project override limits and unproven forced-exit cleanup truthfully. Update MUST preserve specialist discovery and unrelated operator content while removing only attributable legacy root/skill copies. Status MUST report each layer independently without advancing or inferring the last-complete ledger. Incomplete/conflicting Sync or Update MUST return bounded repair/manual guidance without harness fallback. Native root injection, package skill discovery, five attributable specialist definitions and external/provider ownership MUST remain intact; non-Pi behavior MUST remain unchanged.

#### Scenario: Distinguish capability gaps from generation failure

- **GIVEN** missing or conflicting delegation runtime
- **WHEN** status is requested
- **THEN** it reports bounded actionable state without inventing complete installation or live execution proof

### Requirement: Preserve provider ownership

No generated package may bundle thoth-mem hooks, MCP lifecycle, protocol, or
persistence implementation. Provider capability MUST be reported only from
evidence as supported, degraded, or unsupported.

### Requirement: Use OpenAI as the only OpenCode built-in preset

Generated OpenCode configuration MUST contain only the `openai` built-in preset
for the six-role roster. It MUST NOT generate Kimi, Copilot, ZAI/GLM, or
mixed-provider mappings.

### Requirement: Bundle the proportional SDD contract

Canonical workflow skills, generated root prompts, and owned-skill registries MUST
require proportional explore, specify, and clarify before risk-aware
classification. They MUST NOT force an understanding document, specialist, or
interview. Classification MUST use meaningful coordination and contract impact,
uncertainty, and risk; touched-file count alone MUST NOT require persistence.
Small clear low-risk work MUST use test-first implementation and focused
verification without a record. Substantial work MUST use one
`.thoth/changes/<id>/<id>.md` record. Harness prompts and machine interfaces MUST
NOT expose named SDD routes or route-choice selectors.

The optional selected fresh Oracle plan review and separate post-review
`Implement (Recommended)` / `Stop` decision MUST remain. A review MUST NOT
authorize implementation or replace final verification. For each of those two
choices separately, only the third confirmed answerless native return MAY select
its recommendation; pending, unavailable, failed, or interrupted questions MUST
NOT count. These defaults MUST NOT settle material human-owned decisions.

#### Scenario: Understand every change without forced ceremony

- **GIVEN** any requested change
- **WHEN** the root prepares to classify it
- **THEN** it completes proportional explore, specify, and clarify in order without requiring a document, specialist, or interview

#### Scenario: Keep localized multi-file mechanical work small

- **GIVEN** a clear low-risk mechanical change touches several files in one area
- **WHEN** its coordination and contract impact remain local
- **THEN** it remains eligible for test-first implementation without a persistent record

#### Scenario: Plan when uncertainty or risk warrants it

- **GIVEN** coordinated, cross-cutting, materially uncertain, or elevated-risk work
- **WHEN** understanding is complete
- **THEN** it is classified substantial and tracked in one ID-named record

#### Scenario: Clarification blocks unresolved material intent

- **GIVEN** a material human-owned decision remains unresolved
- **WHEN** clarification completes
- **THEN** classification and implementation remain blocked

#### Scenario: Keep plan review distinct from implementation authorization

- **GIVEN** a selected plan review returns `[OKAY]`
- **WHEN** implementation has not been separately selected
- **THEN** the root asks `Implement (Recommended)` or `Stop`, and does not begin work

#### Scenario: Preserve explicit Stop and bounded native choice handling

- **GIVEN** a plan-choice question is pending, unavailable, or explicitly answered Stop
- **WHEN** the harness reports its state
- **THEN** pending or unavailable state does not count as an unanswered attempt and explicit Stop prevents implementation

### Requirement: Fresh delegation at work boundaries

The canonical orchestration policy MUST make a fresh subagent instance the default whenever the objective, SDD phase, mutable surface, or independent-judgment boundary changes.

#### Scenario: US1 - Receive fresh specialists at work boundaries 1

- **GIVEN** a specialist completed one bounded assignment
- **WHEN** the root delegates a different objective, SDD phase, mutable surface, or independent judgment
- **THEN** the root creates a fresh native subagent instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 2

- **GIVEN** Oracle performed an optional plan review
- **WHEN** final implementation verification begins
- **THEN** the root delegates that verification to a fresh Oracle instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 3

- **GIVEN** Oracle returned findings that need clarification
- **WHEN** the root asks only about those same findings without requesting a new approval or PASS judgment
- **THEN** the root may continue that exact Oracle assignment

### Requirement: Bounded continuation exception

The canonical orchestration policy MUST permit resuming or steering an existing subagent only for the exact same bounded assignment and MUST NOT treat completed role instances as a reusable pool.

#### Scenario: US2 - Continue only the same bounded assignment 1

- **GIVEN** a specialist is still executing a bounded assignment
- **WHEN** the root supplies a correction or missing context for that same assignment
- **THEN** the root may continue the existing session

#### Scenario: US2 - Continue only the same bounded assignment 2

- **GIVEN** a specialist completed a bounded assignment
- **WHEN** the root requests clarification or completion of that unchanged assignment and no independent judgment is required
- **THEN** the root may resume it deliberately

#### Scenario: US2 - Continue only the same bounded assignment 3

- **GIVEN** the root is waiting for a running task
- **WHEN** it uses the harness status or wait surface
- **THEN** that operation is treated as collection of the existing assignment rather than permission to reuse the session for later work

### Requirement: Fresh independent judgment

Every Oracle plan review, verification round, and PASS-producing judgment MUST use a fresh Oracle instance; an existing Oracle session MAY be resumed only to clarify its current findings without issuing a new approval judgment.

#### Scenario: US1 - Receive fresh specialists at work boundaries 1

- **GIVEN** a specialist completed one bounded assignment
- **WHEN** the root delegates a different objective, SDD phase, mutable surface, or independent judgment
- **THEN** the root creates a fresh native subagent instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 2

- **GIVEN** Oracle performed an optional plan review
- **WHEN** final implementation verification begins
- **THEN** the root delegates that verification to a fresh Oracle instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 3

- **GIVEN** Oracle returned findings that need clarification
- **WHEN** the root asks only about those same findings without requesting a new approval or PASS judgment
- **THEN** the root may continue that exact Oracle assignment

### Requirement: Status is not reuse

Native wait and status operations MUST remain scoped to collecting a nonterminal assignment and MUST NOT authorize reusing that session for a later work unit.

#### Scenario: US2 - Continue only the same bounded assignment 1

- **GIVEN** a specialist is still executing a bounded assignment
- **WHEN** the root supplies a correction or missing context for that same assignment
- **THEN** the root may continue the existing session

#### Scenario: US2 - Continue only the same bounded assignment 2

- **GIVEN** a specialist completed a bounded assignment
- **WHEN** the root requests clarification or completion of that unchanged assignment and no independent judgment is required
- **THEN** the root may resume it deliberately

#### Scenario: US2 - Continue only the same bounded assignment 3

- **GIVEN** the root is waiting for a running task
- **WHEN** it uses the harness status or wait surface
- **THEN** that operation is treated as collection of the existing assignment rather than permission to reuse the session for later work

### Requirement: Native lifecycle translation

Pi root guidance MUST use one direct subagent_run with explicit canonical agent and bounded task per fresh assignment; omitted mode MUST use the configured agent/config mode or otherwise background, and explicit task/background modes MUST remain supported. Native status/result/cancel or supported live messaging MUST be used only for a known task ID. Queued delivery, nonterminal state and cancellation requests MUST NOT prove termination or acceptance. New objectives, phases, mutable surfaces and independent judgments MUST receive fresh assignments. Thoth MUST NOT use subagent orchestration APIs or claim instruction-only policy is runtime enforcement. Terminal notifications drive collection without polling; children MUST remain scoped to the parent Pi lifetime. The adopted delegation runtime MUST support Pi `>=0.99.0` through the `1.0.2` development pin with its registry and model-only exposure semantics, restrict child registered tools to the selected permitted implementations, and distinguish queued, extension-handled, rejected, and model-consumed live input. Updating this runtime MUST preserve its responsibility for LLM subagent delegation; non-LLM background task execution remains external.

#### Scenario: Native lifecycle translation

- **GIVEN** an active root using the adopted fork on Pi 0.99.0 or 1.0.2
- **WHEN** it launches an LLM subagent, selects tools, or sends live input
- **THEN** native delegation controls remain model-only, child callability respects the permitted registry, and reported message/terminal states retain their actual meanings without adding generic task responsibilities

### Requirement: Expose routable role contracts

Every root MUST present the complete specialist roster with equally salient positive and negative semantic triggers, MUST consider all five specialists during task shaping, and MUST distinguish role existence from an actual dispatch decision.

#### Scenario: US2 - Activate the complete specialist roster 1

- **GIVEN** broad or uncertain local repository discovery
- **WHEN** the root selects a specialist
- **THEN** it selects `explorer` and keeps the assignment read-only

#### Scenario: US2 - Activate the complete specialist roster 2

- **GIVEN** current, unfamiliar, version-sensitive, or externally sourced facts are required
- **WHEN** the root selects a specialist
- **THEN** it selects `librarian`; stable facts already established locally do not trigger it

#### Scenario: US2 - Activate the complete specialist roster 3

- **GIVEN** material UI/UX, interaction, accessibility, or visual-quality work
- **WHEN** the root selects a writer
- **THEN** it selects `designer` with bounded user-facing ownership and visual verification

#### Scenario: US2 - Activate the complete specialist roster 4

- **GIVEN** known bounded nonvisual implementation, regardless of complexity
- **WHEN** delegation has a concrete benefit and is permitted by the user's ownership instruction
- **THEN** it selects `worker` with one independently checkable outcome and bounded mutable surface, not a narrow-versus-complex writer tier

#### Scenario: US2 - Activate the complete specialist roster 5

- **GIVEN** source, scope and checks are known for a minimal authorized low-risk edit
- **WHEN** no discovery or independent judgment is needed
- **THEN** root retains the bounded work, including commits of already reviewed changes; an additional targeted search or file count does not force delegation

#### Scenario: Explicit direct ownership

- **GIVEN** the user requests direct work without delegation
- **WHEN** root executes the authorized scope
- **THEN** it performs the work directly, preserves operator-selected model and effort, and reports any unavailable independent review without claiming independent PASS or archive

#### Scenario: Bounded implementation supervision

- **GIVEN** a delegated assignment with one checkable outcome, exact known entrypoints and skill paths, focused checks and a return/stop condition
- **WHEN** native attention fires, an agreed milestone is missed, or two consecutive attempts make no evidential progress
- **THEN** root inspects and steers, narrows, or safely stops the assignment instead of waiting for a generous timeout; native notifications/waits remain authoritative without polling or a custom scheduler

#### Scenario: Stable validation and handoff

- **GIVEN** relevant inputs are stable after implementation
- **WHEN** the writer performs final validation and returns
- **THEN** it reuses fresh evidence, reruns only checks invalidated by changes, reconciles background commands, and preserves the substantive handoff across late notifications

#### Scenario: US2 - Activate the complete specialist roster 6

- **GIVEN** material architecture, security, persistent diagnosis, contradictory evidence, or high-cost uncertainty
- **WHEN** independent judgment would change confidence or authorization
- **THEN** the root selects a fresh read-only `oracle`

### Requirement: Use the strongest truthful native role selector

The Pi adapter MUST require the public agent field with one exact canonical specialist name through subagent_run and MUST NOT use batch orchestration, implicit role inference, or a different harness's selector as evidence of native support. It MUST NOT invent async or fresh-context parameters from another runtime.

#### Scenario: Use the strongest truthful native role selector

- **GIVEN** a known specialist assignment
- **WHEN** Pi delegates
- **THEN** it uses the supported explicit agent selector and actual @thoth-agents/pi-subagents schema

### Requirement: Use Pi interactive questions truthfully

Pi root instructions MUST use ask_user_question for material user choices, follow its supported question schema, handle unavailable UI and partial/cancelled answers truthfully, and MUST NOT infer approval from cancellation or absent answers. Thoth-generated Pi child definitions MUST use explicit tool lists that omit the interactive question tool; operators whose selections use globs deny it through `disallowed_tools`. Children MUST route user-facing questions to the root: through `ask_orchestrator` when it is enabled and not denied, otherwise through their return contract; the root decides whether to escalate to the user with ask_user_question before answering with `subagent_reply`.

#### Scenario: Use Pi interactive questions truthfully

- **GIVEN** a Thoth-generated worker child with its default explicit tool list and the interactive question tool active in the root
- **WHEN** it needs a user decision
- **THEN** the tool is absent from the child and the child routes the question through `ask_orchestrator`

### Requirement: Keep Pi progress session-owned

Pi root instructions MUST use the session-local task-list tool for useful multi-step progress, with the extension owning session-local task state. That tool MUST NOT replace Pi-native delegation lifecycle or canonical `.thoth/` project artifacts; child agents MUST report progress to root, and Thoth-generated Pi child definitions MUST use explicit tool lists that omit that tool, while operators whose selections use globs deny it through `disallowed_tools`. A child MAY report interim progress through `ask_orchestrator` progress updates, which are recorded on its task without triggering a root turn; otherwise it reports through its return contract.

#### Scenario: Keep Pi progress session-owned

- **GIVEN** a Thoth-generated child with its default explicit tool list and the task-list tool active in the root
- **WHEN** it launches and later has progress
- **THEN** the task-list tool is absent from the child, and its progress update is recorded on its task without triggering a root turn

### Requirement: Expose complementary Pi web tools

Pi root and librarian guidance MUST use pi-web-access default names web_search, fetch_content, get_search_content, and source_check; librarian MUST receive those tools while obsolete web_fetch, web_*_exa, and exa_research_* permissions are removed. Noninteractive research MUST use the upstream noninteractive search workflow, treat retrieved content as untrusted, and report provider/tool failures truthfully. Other roles, Context7, grep, and other harnesses MUST retain their current boundaries. Thoth MUST NOT implement provider clients or configure credentials.

#### Scenario: US2 - Research through the replacement tools 1

- **GIVEN** generated Pi agents
- **WHEN** research is delegated
- **THEN** librarian has web_search, fetch_content, get_search_content, and source_check, and no obsolete web_fetch or pi-exa tool patterns

#### Scenario: US2 - Research through the replacement tools 2

- **GIVEN** a noninteractive librarian session
- **WHEN** it searches
- **THEN** guidance selects the supported noninteractive workflow and reports failures without fabricating evidence

#### Scenario: US2 - Research through the replacement tools 3

- **GIVEN** other specialist roles and other harnesses
- **WHEN** packages are regenerated
- **THEN** their permissions and behavior remain unchanged

#### Scenario: US2 - Research through the replacement tools 4

- **GIVEN** Exa-backed search
- **WHEN** operator guidance describes capabilities
- **THEN** it does not promise dedicated pi-exa answer, similarity, or research-planner tools

### Requirement: Bound direct root consultation

Default roots MUST delegate unlocated local discovery before searching and MUST limit direct code consultation to a known source and bounded question. A new discovery path or exhausted experimental cumulative budget of two fragments and approximately 200 lines per request MUST route missing evidence to a specialist. Tool, file and subtask changes MUST NOT reset the budget; required operating instructions and relevant coordination artifacts are excluded but MUST NOT hide source/log dumps. Explicit user ownership and required independent verification remain authoritative. Full custom prompt replacement MAY omit these defaults and MUST be documented truthfully.

#### Scenario: Bound direct root consultation

- **GIVEN** an initially bounded known-source question reveals an unlocated dependency
- **WHEN** another discovery path is needed
- **THEN** the root delegates the remaining question without using accumulated context or remaining budget to justify continued discovery

### Requirement: Configure adopted Pi subagents natively

Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same shared list-editor shell with safe tool persistence, both registered by pi-subagents; /subagents-tools MUST persist only the definition `tools` field generically and MAY receive reset defaults and managed-file ownership validation from a registered adapter, which thoth-agents provides for its managed specialist definitions; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST edit exact tool names only, list the root's registered tools (active and inactive) and the child-provided `ask_orchestrator`, offer no dynamic `*` mode, reject `@active`, and preserve glob entries and unrecognized names unchanged on save. Tool selections MAY contain globs, where `*` is an ordinary glob; every glob expands against the root's registered tools, active and inactive, excluding the native `subagent_*` tools and the definition's `disallowed_tools`. Explicitly selected tools MUST reach the child even when inactive in the root, unless removed by configuration, `disallowed_tools` or native exclusions. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve operator tool selections including globs and an operator-set `disallowed_tools`, and child launch MUST resolve its current inventory; for every selection form, selected tools without a child implementation MUST be dropped and reported as a durable warning visible on the running task's widget card and on its status, result and completion, and launch MUST fail with a truthful missing-implementation diagnostic only when no selected tool remains. When thoth-agents and pi-subagents versions do not form a supported pair for /subagents-tools ownership, the user MUST receive a truthful diagnostic with upgrade guidance instead of silent command loss.

#### Scenario: Configure adopted Pi subagents natively

- **GIVEN** exact names and globs including `*` and `agent_browser_*`, with root tools that are inactive or lack a child implementation, and pi-subagents with or without the Thoth adapter
- **WHEN** the panel saves, synchronization runs and a child launches
- **THEN** only the `tools` field changes, exact names and globs persist unchanged, globs include root-inactive registered tools minus `subagent_*` and `disallowed_tools`, missing implementations are dropped and reported, the child fails only when nothing remains, and reset-to-defaults is offered only when the adapter supplies defaults

### Requirement: Run visible background Pi specialists

Omitted mode MUST run specialists in background while respecting explicit modes, and the runtime MUST display truthful live execution metrics in a tree above input. Tool uses, lifetime tokens, available child-context percentage, average output speed in tokens per second (total output tokens over total generation time) and active elapsed time MUST remain readable even with long task/model text, using compact or separate metric rows as needed and marking absent values without fabrication. Running status MUST use an animated braille indicator and terminal statuses MUST use simple distinguishable completion, cancellation and failure glyphs. Animation MUST remain inactive when no child runs and MUST clean up on task termination or session teardown without blocking root input. The widget MUST NOT consume keyboard input unless the root editor holds focus, so overlays, Thoth panels, native dialogs and other custom UIs receive their keys.

#### Scenario: Run visible background Pi specialists

- **GIVEN** a child running or queued and later completing or stopping, and an overlay possibly open
- **WHEN** the UI renders, keys are pressed and the session tears down
- **THEN** metrics including average output speed and status symbols remain truthful, keys reach the focused overlay, dialog or custom UI, root stays interactive and no idle animation timer remains

### Requirement: Expose session-owned Pi subagent consumption

The adopted runtime MUST produce Atelier-compatible session references, usage metadata and annotated async cost events attributed to the owning root session, without fabricating unavailable prices or double counting continuations.

#### Scenario: Expose session-owned Pi subagent consumption

- **GIVEN** runs belonging to distinct root sessions
- **WHEN** Atelier reads referenced artifacts
- **THEN** it attributes only each session's own child usage and cost history

### Requirement: Keep discovery roles evidence-only

Explorer and Librarian MUST return facts with evidence, verification, risks and open questions only, MUST NOT recommend fixes, designs, defaults or next actions, and MUST escalate an open question it cannot settle as the question with its possible options and the facts for each option without choosing one. Oracle judgment and Worker/Designer implementation handoffs MUST remain unchanged, and every harness MUST render the same role-specific return contract.

#### Scenario: Keep discovery roles evidence-only

- **GIVEN** an Explorer or Librarian assignment that ends with findings and an open choice it cannot settle
- **WHEN** the specialist returns in any harness
- **THEN** its return lists facts and the open question with options and their facts, contains no recommendation or next action, and root decides or asks Oracle

### Requirement: Own session-scoped Pi background shell jobs

The vendored `@thoth-agents/pi-background-tasks` package MUST run local shell jobs owned by their session and, on Windows, inside Job Objects assigned before the job runs, MUST keep a session's running jobs across that session's same-process reload, MUST on Windows stop every running job of the session, including in-flight watch commands, on any other session shutdown, subagent teardown or Pi process exit including a crash, MUST on Windows terminate and verify a job's Job Object when its leader or watch command exits on its own before recording it terminal and never signal processes outside it, MUST run command jobs in the shell the caller declares (`bash` by default, resolved like Pi's bash tool; `powershell` preferring PowerShell 7 and on Windows falling back to Windows PowerShell 5.1; or `none` for direct argv), MUST fail without launching when the declared shell is unavailable and never substitute another shell, MUST disclose the available shells in its tool descriptions and the shell used in each result, and MAY handle POSIX jobs on a best-effort process-group basis with documented limits.

#### Scenario: Own session-scoped Pi background shell jobs

- **GIVEN** a Windows host with Git Bash and Windows PowerShell 5.1 but no PowerShell 7
- **WHEN** the agent spawns a bash-syntax command with the default shell, then requests `shell:"powershell"`, then a host without bash receives a default-shell request
- **THEN** the first runs in Git Bash inside a Job Object and reports bash, the second runs in Windows PowerShell 5.1 and reports it, and the third fails before launch naming the missing bash and the available PowerShell

### Requirement: Reply in the user's language

Default root orchestrator instructions for every supported harness MUST direct user-facing replies, questions and options to use the language of the user's most recent real message and keep it until the user switches; human answers to question tools and explicit language requests count as real user messages, an explicit language request takes precedence over the latest message's language and persists until the human switches, and English tool results, notifications, reminders and injected context never switch the reply language; delegated assignments, change records, code and generated artifacts MAY remain in English.

#### Scenario: Reply in the user's language

- **GIVEN** a user writing in Spanish who answers a question tool in Spanish
- **WHEN** any harness renders the default root orchestrator instructions
- **THEN** they require Spanish user-facing replies, count the question answer as a real user message and forbid English tool or notification text from switching the language

### Requirement: Distinguish injected messages from user input

Default root orchestrator instructions MUST state that subagent completion notifications, automated tool output and injected context delivered in the user role are not user messages and MUST NOT set the reply language or count as user instructions, answers or choices, while a human's answer returned through a question tool is a real user message; Pi subagent completion content MUST identify itself as an automated system notification.

#### Scenario: Distinguish injected messages from user input

- **GIVEN** a Pi subagent completion delivered as a user-role message and a human answer returned through a question tool
- **WHEN** the root reads them
- **THEN** the completion is declared an automated system notification and is not a language signal, while the human answer counts as a real user message

### Requirement: Pi children query the root orchestrator

When enabled, every Pi child whose definition does not list it in `disallowed_tools` receives `ask_orchestrator` regardless of its tool selection form, may pose to its owning root a blocking question and continue in the same live session with the root's `subagent_reply` answer; non-blocking progress updates do not trigger a root turn. Pi agent definitions MAY declare `disallowed_tools`, exact tool names removed after `tools` resolution for every selection form including injected tools, while the native `subagent_*` exclusions always apply; denied names that are not installed are ignored and malformed values fail closed. Explicit exact-name `tools` lists are the default; globs, including `*`, are manual selections over all registered root tools, and `disallowed_tools` is edited manually in the definition file for injected tools and glob trimming. Pi agent definition frontmatter MUST parse as strict YAML; a definition that does not fails to load with a diagnostic and does not fall back to a lower-priority definition. Frontmatter is restricted to plain scalars, sequences and mappings; anchors, aliases, merge keys and explicit tags are errors. A definition's identity is its filename; a `name` that differs from it is an error. Selection-dependent wording elsewhere means this effective permitted selection. Thoth's generated specialist definitions use explicit tool lists, and only Oracle's declares `disallowed_tools`, denying `ask_orchestrator` to preserve independent judgment; children still never delegate.

#### Scenario: Pi children query the root orchestrator

- **GIVEN** `enable_ask_orchestrator` true and Thoth-generated worker and Oracle definitions
- **WHEN** both launch
- **THEN** only the worker receives `ask_orchestrator`, Oracle's definition is the only one declaring `disallowed_tools`, and the worker's question returns the root's `subagent_reply` answer to that same child tool call

### Requirement: Pi conversation language anchor

The Pi root extension MUST add one non-displayed custom anchor message to each agent run started by real human input (source interactive or rpc) received while the session is natively idle and paired with its own run start, restating in fixed text, without quoting the input or claiming which adjacent text is human, the rule to reply in the language of the human's most recent real message unless the human explicitly requested another reply language, without modifying the system prompt and without anchoring extension-sourced or queued input.

#### Scenario: Pi conversation language anchor

- **GIVEN** a Pi root session
- **WHEN** the human sends a prompt while idle, queues another while running, and later an extension triggers a turn
- **THEN** only the idle human-started run receives the anchor, no stale anchor appears later, and the system prompt stays unchanged

### Requirement: Uniform Pi SDK compatibility floor

The root thoth-agents package and every Pi package under pi-packages MUST declare each Pi SDK peer dependency (`@earendil-works/*`) with the same minimum `>=0.99.0`, MUST develop and test against one shared Pi SDK development version (currently `1.0.2`), and MUST declare an `engines.node` floor of Node 22.19 (`>=22.19` or `>=22.19.0`); features that need a newer Pi API MUST detect it at runtime and degrade without failing on the minimum.

#### Scenario: Uniform Pi SDK compatibility floor

- **GIVEN** the repository manifests and root lockfile
- **WHEN** Pi SDK dependencies are inspected
- **THEN** every Pi peer range is `>=0.99.0`, every Pi development dependency resolves to the single shared version, and every manifest requires Node 22.19 or newer
