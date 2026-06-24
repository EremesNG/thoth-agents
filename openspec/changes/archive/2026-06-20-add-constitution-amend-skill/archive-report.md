# Archive Report: add-constitution-amend-skill
    
    ## Change Summary
    
    | Field | Value |
    |---|---|
    | Change Name | add-constitution-amend-skill |
    | Archive Date | 2026-06-20 |
    | Pipeline Type | Full SDD |
    | Persistence Mode | hybrid (openspec + thoth-mem) |
    | Archive Path | openspec/changes/archive/2026-06-20-add-constitution-amend-skill/ |
    
    ## Verification Lineage
    
    | Round | Verdict | Notes |
    |---|---|---|
    | Round 1 | pass with warnings | W1: over-indentation in skills.ts + custom-skills.test.ts; resolved by running `pnpm run format` during verify pass |
    
    - lint: PASS (222 files, 0 errors)
    - typecheck: PASS (exit 0)
    - build: PASS (schema unchanged)
    - full test suite: PASS (70 files, 717/717 tests green)
    - compliance: 9/9 requirements, 18/18 scenarios
    
    ## Merged Specs
    
    | Domain | Action | Canonical Path |
    |---|---|---|
    | sdd-constitution | NEW capability spec (no prior base) | openspec/specs/sdd-constitution/spec.md |
    
    The delta `## ADDED Requirements` section was promoted wholesale into the canonical spec as `## Requirements`. The preamble, assumptions, and all 9 requirements with 18 GWT scenarios are preserved verbatim.
    
    ## Files Created / Updated by the Change
    
    | File | Action |
    |---|---|
    | src/skills/sdd-constitution/SKILL.md | NEW — governance skill implementing the constitution amendment workflow |
    | src/harness/core/skills.ts | UPDATED — BUNDLED_SKILL_REGISTRY entry for sdd-constitution (ORCHESTRATOR_ONLY) |
    | src/cli/custom-skills.test.ts | UPDATED — 15 tests covering registry presence and correct metadata |
    | src/skills/_shared/openspec-convention.md | UPDATED — Constitution Governance doctrine section (auto-suggest snippet shared by sdd-verify and sdd-archive) |
    | src/skills/sdd-verify/SKILL.md | UPDATED — added report-only auto-suggest hook referencing shared doctrine |
    | src/skills/sdd-archive/SKILL.md | UPDATED — added report-only auto-suggest hook referencing shared doctrine |
    
    ## Audit Notes
    
    - sdd-constitution is registered as ORCHESTRATOR_ONLY and is absent from FULL_SDD_PHASE_ORDER, SDD_PHASES, and the per-change delegation matrix by design.
    - The auto-suggest in sdd-verify and sdd-archive is advisory and never blocks verification or archival.
    - The constitution change detection heuristic is intentionally broad (false-positive-tolerant) because the suggestion is non-blocking.
    - W1 was a formatting-only issue (no behavioral change); all 717 tests pass on either form.
    
    ## thoth-mem Record
    
    Persisted under topic_key: sdd/add-constitution-amend-skill/archive-report  
    Session: 777056fc-304f-423a-a3f5-ab3f995199f4  
    Project: thoth-agents
    