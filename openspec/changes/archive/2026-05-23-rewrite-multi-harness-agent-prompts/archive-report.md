# Archive Report: Rewrite Multi-Harness Agent Prompts

## Archive Summary

- Change: `rewrite-multi-harness-agent-prompts`
- Pipeline: full
- Persistence mode: hybrid
- Archive date: 2026-05-23
- Verification source: `openspec/changes/rewrite-multi-harness-agent-prompts/verify-report.md`
- Verification verdict: passed; all 27 full-pipeline scenarios compliant and all 17 tasks complete

## Merged Specs

- `openspec/specs/multi-harness-agent-pack/spec.md`

## Merged Requirements

Added:

- Define Root Coordinator Prompt Contract
- Define Read-Only Subagent Prompt Contract
- Define Write-Capable Subagent Prompt Contract
- Preserve Custom Prompt Replacement and Append Semantics
- Preserve Reference-Inspired Style Without Importing Roles

Modified:

- Preserve the Seven-Agent Role Nature Across Harnesses
- Derive Harness-Specific Wording from Typed Dialects and Capabilities
- Enforce thoth-mem Governance Across Harnesses
- Verify OpenCode and Codex Prompt Contracts with Focused Tests
- Keep Harness-Agnostic Prompt Work Within Approved Scope

## Archive Location

The completed change is archived at:

`openspec/changes/archive/2026-05-23-rewrite-multi-harness-agent-prompts/`

## Notes

- Hybrid memory recall found no prior prerequisite SDD artifacts, so the archive used canonical OpenSpec files as the source of truth.
- Per dispatch limits, only this archive report is persisted to thoth-mem under `sdd/rewrite-multi-harness-agent-prompts/archive-report`.
