# Spec: sdd-consistency
    
    Upgrade `plan-reviewer` with /analyze-style cross-artifact consistency
    analysis: severity-graded findings across proposal<->spec<->design<->tasks, a
    requirement-coverage percentage, and a blocking consistency gate with explicit
    user override. This augments the existing review; it is NOT a new pipeline
    phase. Gated by a dedicated `config.yaml rules:` section.
    
    ## Requirements
    
    ### Requirement: Cross-Artifact Consistency Analysis
    
    `plan-reviewer` MUST, in addition to its existing executability review, perform
    cross-artifact consistency analysis across the proposal, spec, design, and
    tasks artifacts. It MUST detect and report inconsistencies such as
    requirements present in the spec but absent from design or tasks, tasks with no
    spec basis, scope drift from the proposal, and contradictory statements between
    artifacts. Each finding MUST carry a severity level of CRITICAL, HIGH, MEDIUM,
    or LOW.
    
    #### Scenario: Spec requirement missing from tasks is reported
    
    - GIVEN a spec containing a requirement that no task maps to
    - WHEN `plan-reviewer` runs its consistency analysis
    - THEN a finding is reported identifying the unmapped requirement
    - AND the finding carries a severity level
    
    #### Scenario: Task with no spec basis is reported
    
    - GIVEN a task in `tasks.md` that does not trace to any spec requirement or proposal scope item
    - WHEN `plan-reviewer` runs its consistency analysis
    - THEN a finding is reported identifying the orphan task
    - AND the finding carries a severity level
    
    #### Scenario: Fully consistent artifacts yield no findings
    
    - GIVEN proposal, spec, design, and tasks that are mutually consistent
    - WHEN `plan-reviewer` runs its consistency analysis
    - THEN no consistency findings are reported
    
    ### Requirement: Requirement-Coverage Percentage
    
    `plan-reviewer` MUST compute and report a requirement-coverage percentage,
    defined as the proportion of spec requirements that have at least one mapped
    task, expressed as `(requirements with >=1 mapped task) / (total requirements)`.
    The percentage MUST appear in the review output.
    
    #### Scenario: Coverage percentage is computed and reported
    
    - GIVEN a spec with 10 requirements where 8 have at least one mapped task
    - WHEN `plan-reviewer` runs
    - THEN the review output reports a requirement-coverage percentage of 80%
    
    #### Scenario: Full coverage reports 100 percent
    
    - GIVEN a spec where every requirement has at least one mapped task
    - WHEN `plan-reviewer` runs
    - THEN the review output reports a requirement-coverage percentage of 100%
    
    ### Requirement: Blocking Consistency Gate with Override
    
    When the consistency analysis surfaces any CRITICAL finding, `plan-reviewer`
    MUST block advancement past plan review. The block MUST be overridable only
    through an explicit user decision delivered via the harness blocking-input
    surface (AskUserQuestion-equivalent), and the override MUST be logged.
    Non-CRITICAL findings MUST be reported but MUST NOT block on their own.
    
    #### Scenario: Critical inconsistency blocks advancement
    
    - GIVEN a consistency analysis that produced at least one CRITICAL finding
    - WHEN `plan-reviewer` completes
    - THEN advancement past plan review is blocked
    - AND the CRITICAL findings are listed in the review output
    
    #### Scenario: User override unblocks a critical finding
    
    - GIVEN `plan-reviewer` blocking on a CRITICAL finding
    - WHEN the user is presented the finding through the harness blocking-input surface and explicitly overrides
    - THEN the override decision is logged with the finding identity
    - AND advancement past plan review proceeds
    
    #### Scenario: Only non-critical findings do not block
    
    - GIVEN a consistency analysis with only HIGH, MEDIUM, or LOW findings and no CRITICAL findings
    - WHEN `plan-reviewer` completes
    - THEN the findings are reported
    - AND advancement is not blocked
    
    ### Requirement: Harness-Agnostic Consistency Gate
    
    The consistency analysis, severity model, coverage computation, and blocking
    gate MUST be defined once in shared conventions and behave identically across
    OpenCode, Claude Code, and Codex, with per-harness prose limited to declared
    capability gaps reported as unsupported-capability limitations.
    
    #### Scenario: Identical consistency behavior across harnesses
    
    - GIVEN the consistency analysis definition in shared conventions
    - WHEN `plan-reviewer` runs under OpenCode, Claude Code, or Codex
    - THEN the severity model, coverage percentage, and blocking semantics are identical across all three harnesses
    
    ### Requirement: Consistency Config Section
    
    `openspec/config.yaml` MUST expose a dedicated `rules:` section that gates the
    consistency mechanism, including whether the CRITICAL-finding block is
    enforced. When the section disables enforcement, CRITICAL findings MUST be
    reported but MUST NOT block advancement.
    
    #### Scenario: Disabled config downgrades the block to a report
    
    - GIVEN a `config.yaml rules:` consistency section with blocking disabled
    - WHEN a CRITICAL consistency finding is produced
    - THEN the finding is reported
    - AND advancement is not blocked
    