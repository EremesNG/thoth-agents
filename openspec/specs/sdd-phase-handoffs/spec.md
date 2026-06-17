# Spec: sdd-phase-handoffs
    
    Optional handoff hints on `SddPhaseContract` (`src/harness/core/sdd.ts`) so each
    phase declares what the next phase must preserve, plus skill prose that surfaces
    those hints at phase transitions. Optional and back-compatible. Gated by a
    dedicated `config.yaml rules:` section where it affects surfacing behavior.
    
    ## Requirements
    
    ### Requirement: Optional Handoff Hints on Phase Contracts
    
    `SddPhaseContract` in `src/harness/core/sdd.ts` MUST support an optional handoff
    hint field by which a phase declares what the subsequent phase must preserve
    (for example, accepted scope, recorded assumptions, or coverage decisions). The
    field MUST be optional so that phases without hints remain valid and existing
    contract consumers continue to type-check and run unchanged.
    
    #### Scenario: A phase declares a handoff hint
    
    - GIVEN a phase contract that declares a handoff hint
    - WHEN the contract is read
    - THEN the hint text describing what the next phase must preserve is available
    
    #### Scenario: Phases without hints remain valid
    
    - GIVEN a phase contract that declares no handoff hint
    - WHEN the contract is validated and consumed
    - THEN it remains valid
    - AND existing consumers operate unchanged
    
    ### Requirement: Hints Surfaced at Phase Transitions
    
    When a phase that declares a handoff hint completes and the pipeline transitions
    to the next phase, the SDD skills MUST surface that hint to the next phase so
    the receiving phase is informed of what it must preserve. When the source phase
    declares no hint, no handoff text is surfaced.
    
    #### Scenario: Hint is surfaced on transition
    
    - GIVEN the spec phase declares a handoff hint that recorded assumptions must be preserved
    - WHEN the pipeline transitions from spec to design
    - THEN the design phase prose surfaces the assumption-preservation hint
    
    #### Scenario: No hint means no surfaced text
    
    - GIVEN a phase that declares no handoff hint
    - WHEN the pipeline transitions to the next phase
    - THEN no handoff hint text is surfaced for that transition
    
    ### Requirement: Harness-Agnostic Handoff Hints
    
    The handoff hint field and its surfacing behavior MUST be defined once in the
    shared phase contract and shared conventions and behave identically across
    OpenCode, Claude Code, and Codex, with per-harness prose limited to declared
    capability gaps reported as unsupported-capability limitations.
    
    #### Scenario: Identical handoff behavior across harnesses
    
    - GIVEN the handoff hint definition in the shared phase contract
    - WHEN phase transitions occur under OpenCode, Claude Code, or Codex
    - THEN the hint field and surfacing semantics are identical across all three harnesses
    
    ### Requirement: Handoff Config Section
    
    `openspec/config.yaml` MUST expose a dedicated `rules:` section that gates the
    handoff-hint surfacing behavior. When the section disables surfacing, declared
    hints MUST NOT be surfaced at transitions, while the optional contract field
    remains valid.
    
    #### Scenario: Disabled config suppresses surfacing
    
    - GIVEN a `config.yaml rules:` handoff section with surfacing disabled
    - WHEN a phase that declares a hint transitions to the next phase
    - THEN the hint is not surfaced
    - AND the contract field remains valid and consumable
    