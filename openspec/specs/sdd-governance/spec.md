# Spec: sdd-governance
    
    Constitution artifact and the blocking Constitution Check gate. Native
    thoth-agents principles, semver-versioned, bootstrapped by `sdd-init` and
    enforced during `sdd-design`/`plan-reviewer`. Harness-agnostic; gated by a
    dedicated `config.yaml rules:` section; overridable only through an explicit,
    logged user decision.
    
    ## Requirements
    
    ### Requirement: Versioned Constitution Artifact
    
    The SDD pipeline MUST maintain a project constitution at
    `openspec/memory/constitution.md` that holds NATIVE thoth-agents principles
    (delegate-first coordination, read-only role boundaries, governed persistence,
    multi-harness parity, evidence-led verification). The artifact MUST carry a
    semantic version (`MAJOR.MINOR.PATCH`). `sdd-init` MUST bootstrap this artifact
    when it is absent. The artifact MUST NOT embed spec-kit's own articles; only
    the mechanics of versioned governance are adopted.
    
    #### Scenario: sdd-init bootstraps a missing constitution
    
    - GIVEN a repository where `openspec/memory/constitution.md` does not exist
    - WHEN `sdd-init` runs against that repository
    - THEN `openspec/memory/constitution.md` is created
    - AND it contains the native thoth-agents principles
    - AND it declares an initial semantic version of `1.0.0`
    
    #### Scenario: sdd-init preserves an existing constitution
    
    - GIVEN a repository where `openspec/memory/constitution.md` already exists with version `2.1.0`
    - WHEN `sdd-init` runs again
    - THEN the existing constitution content and version `2.1.0` are preserved unchanged
    - AND no duplicate constitution file is created
    
    ### Requirement: Constitution Semver Bump and Sync-Impact Report
    
    When the constitution changes, the editor MUST increment its semantic version
    according to impact (MAJOR for principle removal/redefinition, MINOR for an
    added principle or materially expanded guidance, PATCH for clarifications) and
    MUST emit a sync-impact report enumerating which principles changed and which
    downstream artifacts or gates are affected.
    
    #### Scenario: Adding a principle bumps the minor version with a sync-impact report
    
    - GIVEN a constitution at version `1.0.0`
    - WHEN a new native principle is added to the constitution
    - THEN the version becomes `1.1.0`
    - AND a sync-impact report is produced listing the added principle and the gates that consume it
    
    #### Scenario: Redefining a principle bumps the major version
    
    - GIVEN a constitution at version `1.4.2`
    - WHEN an existing principle's meaning is changed or a principle is removed
    - THEN the version becomes `2.0.0`
    - AND the sync-impact report flags the breaking change
    
    ### Requirement: Blocking Constitution Check Gate
    
    A "Constitution Check" gate MUST evaluate the design and plan against each
    constitution principle during `sdd-design` and/or `plan-reviewer`. On any
    detected violation the gate MUST block advancement to the next phase. The gate
    MUST allow an explicit user override delivered through the harness
    blocking-input surface (the AskUserQuestion-equivalent primitive). An override
    MUST be recorded as an explicit, logged user decision before advancement
    proceeds.
    
    #### Scenario: Violation blocks advancement
    
    - GIVEN a design that violates the read-only role boundaries principle
    - WHEN the Constitution Check gate evaluates the design
    - THEN the gate reports the violated principle
    - AND advancement to the next phase is blocked
    - AND no override is recorded automatically
    
    #### Scenario: Explicit user override unblocks advancement
    
    - GIVEN a Constitution Check gate currently blocking on a violation
    - WHEN the user is presented the violation through the harness blocking-input surface and explicitly chooses to override
    - THEN the override decision is logged with the violated principle and the user's choice
    - AND advancement to the next phase proceeds
    
    #### Scenario: Compliant plan passes without prompting
    
    - GIVEN a design and plan that satisfy every constitution principle
    - WHEN the Constitution Check gate evaluates them
    - THEN the gate reports no violations
    - AND advancement proceeds without any user prompt
    
    ### Requirement: Harness-Agnostic Constitution Governance
    
    The constitution artifact, the semver/sync-impact discipline, and the
    Constitution Check gate MUST be defined once in shared conventions and apply
    identically across OpenCode, Claude Code, and Codex. Per-harness prose is
    permitted ONLY to describe a capability gap (for example, an absent
    blocking-input primitive), and such a gap MUST be reported as an
    unsupported-capability limitation rather than silently changing the gate
    semantics.
    
    #### Scenario: Same gate behavior across harnesses
    
    - GIVEN the Constitution Check gate definition in shared conventions
    - WHEN the gate runs under OpenCode, Claude Code, or Codex
    - THEN the blocking behavior and override semantics are identical across all three harnesses
    
    #### Scenario: Missing blocking-input primitive is reported as a capability gap
    
    - GIVEN a harness that lacks an AskUserQuestion-equivalent blocking-input surface
    - WHEN the Constitution Check gate needs to offer an override
    - THEN the gate reports an unsupported-capability limitation
    - AND it does not silently downgrade the block to a non-blocking warning
    
    ### Requirement: Constitution Governance Config Section
    
    `openspec/config.yaml` MUST expose a dedicated `rules:` section that gates the
    constitution mechanism (artifact path, version policy, and whether the
    Constitution Check gate is enforced). When the section disables the gate, the
    Constitution Check MUST NOT block advancement.
    
    #### Scenario: Enabled config enforces the gate
    
    - GIVEN a `config.yaml rules:` constitution section with enforcement enabled
    - WHEN a constitution violation is detected
    - THEN the Constitution Check gate blocks advancement
    
    #### Scenario: Disabled config skips the gate
    
    - GIVEN a `config.yaml rules:` constitution section with enforcement disabled
    - WHEN a constitution violation would otherwise be detected
    - THEN the Constitution Check gate does not block advancement
    - AND the skip is noted in the phase output
    