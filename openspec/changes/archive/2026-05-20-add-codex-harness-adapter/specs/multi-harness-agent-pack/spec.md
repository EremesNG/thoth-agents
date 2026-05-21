# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Preserve OpenCode Baseline Behavior
The system MUST continue to expose the existing OpenCode plugin behavior as the
default harness path unless a caller explicitly selects another supported
harness.

#### Scenario: Existing OpenCode users receive unchanged plugin behavior
- GIVEN an installation that uses the current OpenCode plugin entrypoints
- WHEN the multi-harness agent pack is loaded without a Codex-specific selection
- THEN the system MUST register the same OpenCode agents, skills, delegation
  rules, thoth-mem governance, and verification guidance that existed before
  this change
- AND the system MUST NOT require Codex configuration or artifacts for OpenCode
  operation

#### Scenario: OpenCode-specific behavior remains isolated
- GIVEN OpenCode plugin wiring requires OpenCode SDK types, hooks, or runtime
  registration semantics
- WHEN shared agent-pack contracts are used by another harness adapter
- THEN OpenCode-specific package writing and runtime integration MUST remain
  behind the OpenCode adapter boundary
- AND shared contracts MUST NOT import or depend on OpenCode-only APIs

### Requirement: Define Harness-Agnostic Agent-Pack Contracts
The system MUST define harness-agnostic contracts for the seven-agent roster
intent, delegate-first operating rules, SDD pipeline semantics, thoth-mem
governance, and verification protocol.

#### Scenario: Shared contracts describe agent intent independent of harness
- GIVEN the agent pack contains orchestrator, explorer, librarian, oracle,
  designer, quick, and deep roles
- WHEN an adapter renders those roles for a supported harness
- THEN the adapter MUST derive role responsibilities, mutation permissions,
  dispatch expectations, and tool-governance language from shared contracts
- AND the adapter MAY translate that intent into harness-specific syntax or
  configuration files

#### Scenario: Delegate-first rules remain portable
- GIVEN a harness supports some form of subagent, task, or delegated execution
- WHEN the agent pack is rendered for that harness
- THEN the rendered artifacts MUST preserve the orchestrator-as-coordinator model
  and the read-only versus write-capable specialist split
- AND the rendered artifacts MUST describe any harness capability gaps rather
  than claiming unsupported delegation parity

#### Scenario: Verification protocol remains shared
- GIVEN a write-capable agent completes implementation work in any supported
  harness
- WHEN it reports completion
- THEN it MUST report verification evidence tied to the changed files,
  diagnostics, tests, or documented checks
- AND it MUST NOT claim completion for behavior changes without the smallest
  sufficient automated or explicitly documented verification

### Requirement: Isolate Harness-Specific Artifact Writing Behind Adapters
The system MUST keep harness-specific configuration, package, prompt, skill, and
MCP artifact writing behind harness adapter implementations.

#### Scenario: Shared layer requests harness artifact generation
- GIVEN shared agent-pack definitions are available in harness-neutral form
- WHEN a target harness is selected
- THEN only the selected harness adapter MUST write that harness's files,
  packages, prompts, skill manifests, or MCP settings
- AND the shared layer MUST NOT directly write OpenCode-only or Codex-only
  artifact paths

#### Scenario: Unsupported harnesses are not silently generated
- GIVEN a target harness has no implemented adapter
- WHEN a caller requests artifacts for that harness
- THEN the system MUST fail with an explicit unsupported-harness result
- AND it MUST NOT generate partial, misleading, or best-effort artifacts under
  another harness's layout

### Requirement: Provide a Codex Adapter MVP
The system MUST provide Codex as the first additional harness target and MUST
treat Codex as configuration-first unless design validates a stronger
docs-backed runtime API.

#### Scenario: Codex artifacts are generated from shared contracts
- GIVEN the Codex adapter is selected
- WHEN agent-pack artifacts are generated or shipped for Codex
- THEN the system MUST produce Codex-compatible project artifacts for the
  confirmed Codex surface, including `.codex/agents/*.toml` where supported
- AND it MUST include Codex configuration TOML, MCP settings, hooks, or skill
  layout only where those artifacts are backed by confirmed Codex documentation
  or an explicit design decision

#### Scenario: Codex runtime assumptions are constrained
- GIVEN Codex capability validation has not proven a programmable runtime
  orchestration API equivalent to OpenCode plugin hooks
- WHEN the Codex adapter is designed or implemented
- THEN it MUST model Codex as configuration-first
- AND it MUST NOT depend on undocumented runtime APIs to satisfy delegate-first,
  SDD, memory, or verification requirements

#### Scenario: Codex capability gaps are visible
- GIVEN a shared agent-pack behavior cannot be mapped exactly to Codex
- WHEN the Codex adapter emits artifacts or diagnostics
- THEN it MUST preserve the intended behavior in instructions where possible
- AND it MUST surface the gap as an adapter limitation or follow-up validation
  item rather than hiding the discrepancy

### Requirement: Enforce thoth-mem Governance Across Harnesses
The system MUST preserve thoth-mem as the memory integration and MUST distinguish
runtime-enforced governance from instruction-level governance with visible
enforcement-gap diagnostics when a harness cannot enforce tool restrictions.

#### Scenario: Root-only memory tools remain restricted
- GIVEN an agent or subagent prompt is rendered for any supported harness
- WHEN memory tool guidance is included
- THEN only the root orchestrator role MAY own `mem_session_start`,
  `mem_session_summary`, and `mem_save_prompt`
- AND subagents MUST be instructed not to call those tools

#### Scenario: Runtime enforcement is used where available
- GIVEN a supported harness exposes documented per-agent tool, permission, or MCP
  allow/deny controls
- WHEN harness-specific prompts or configs are generated
- THEN the adapter MUST configure those controls to prevent subagents from using
  root-only memory operations and disallowed memory writes
- AND tests MUST verify the generated controls in addition to rendered prompt
  text

#### Scenario: Enforcement gaps are diagnosed where unavailable
- GIVEN a supported harness does not expose documented runtime controls for a
  memory-governance rule
- WHEN the adapter renders artifacts for that harness
- THEN it MUST preserve the governance rule as instruction-level guidance
- AND it MUST emit a visible diagnostic identifying the unsupported enforcement
  capability and the resulting instruction-only limitation

#### Scenario: Subagents require parent memory context
- GIVEN a subagent is dispatched with access to thoth-mem tools
- WHEN the dispatch lacks either `parent session_id` or `project`
- THEN the subagent MUST NOT call thoth-mem tools
- AND it MAY proceed only with non-memory work that does not require persistent
  context

#### Scenario: Memory permissions remain role-sensitive
- GIVEN read-only and write-capable agents have different operational modes
- WHEN harness-specific prompts or configs are generated
- THEN read-only agents MUST receive memory guidance that prevents durable writes
  except where explicitly allowed by the shared governance contract
- AND write-capable agents MUST receive only the memory write permissions allowed
  for their delegated role and active persistence mode
- AND harnesses without role-sensitive runtime permission support MUST report that
  limitation as a capability diagnostic rather than implying hard enforcement

#### Scenario: SDD namespace remains protected in OpenSpec-only mode
- GIVEN the active SDD persistence mode is OpenSpec-only
- WHEN SDD artifacts are produced for this change
- THEN agents MUST NOT write SDD artifacts to thoth-mem
- AND future harness prompts MUST still protect the `sdd/{change}/{artifact}`
  topic namespace from ad hoc or non-deterministic writes when a memory-enabled
  mode is used

### Requirement: Preserve SDD Skills Portability
The system MUST keep requirements-interview and SDD skills reusable or
distributable through both OpenCode and Codex adapters.

#### Scenario: SDD skill content remains harness-neutral
- GIVEN requirements-interview and SDD phase skills are packaged for a supported
  harness
- WHEN the skill content is rendered or synchronized
- THEN phase responsibilities, artifact contracts, persistence-mode rules, and
  review gates MUST remain semantically equivalent across OpenCode and Codex
- AND harness-specific syntax MUST be confined to adapter packaging or wrapper
  instructions

#### Scenario: Full SDD pipeline remains portable
- GIVEN a full SDD flow requires proposal, spec, design, tasks, implementation,
  verification, and archive phases
- WHEN the flow is invoked through any supported harness adapter
- THEN the adapter MUST preserve phase ordering, artifact prerequisites,
  plan-review gating, and implementation confirmation rules
- AND it MUST NOT bypass specs or design for full-pipeline work

### Requirement: Limit Rollout Scope Safely
The system MUST limit this change to OpenCode preservation, shared harness
contracts, and the Codex adapter MVP; it MUST NOT add Claude, Antigravity, or
other harness implementations.

#### Scenario: Non-Codex harness requests remain out of scope
- GIVEN a caller requests Claude, Antigravity, or another non-OpenCode and
  non-Codex target during this change
- WHEN the system evaluates the request
- THEN it MUST report that the harness is out of scope for this change
- AND it MUST NOT create implementation files, generated artifacts, or tests that
  imply support for that harness

#### Scenario: thoth-mem is not replaced
- GIVEN the agent pack is adapted for Codex
- WHEN memory integration is described, configured, or validated
- THEN thoth-mem MUST remain the memory backend and governance model
- AND the system MUST NOT introduce a replacement memory layer as part of this
  change

#### Scenario: Rollback preserves OpenCode behavior
- GIVEN Codex validation or adapter implementation fails after this spec phase
- WHEN Codex support is disabled or removed
- THEN the OpenCode plugin path MUST continue to operate without Codex artifacts
  or Codex dependencies
- AND rollback MUST NOT remove shared behavior required by the existing OpenCode
  baseline

## MODIFIED Requirements

## REMOVED Requirements
