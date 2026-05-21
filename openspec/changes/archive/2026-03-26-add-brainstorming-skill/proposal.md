# Proposal: Add Brainstorming Skill and Clarification Gate

## Intent

Add a bundled `brainstorming` skill and clarification gate so ambiguous requests
are clarified before implementation, then handed into the existing SDD flow with
clear approval and resumable execution state.

## In Scope

- Add a simple, user-facing brainstorming skill focused only on understanding
  the request, clarifying scope, presenting options, and getting approval.
- Add a configurable clarification gate hook plus config wiring so the
  orchestrator can nudge users into brainstorming when needed.
- Add an artifact store policy so the brainstorming-to-SDD handoff asks whether
  artifacts should persist to `thoth-mem`, OpenSpec files, or both.
- Document and wire the post-planning oracle review loop on generated SDD
  `tasks.md`, not on brainstorming output.
- Update SDD execution guidance so `tasks.md` tracks real-time progress with
  pending, in-progress, completed, and skipped states.

## Out of Scope

- Formal brainstorming artifacts such as a `design-brief`.
- Oracle review during brainstorming.
- Direct feature implementation discovered during brainstorming.

## Approach

Brainstorming is intentionally small. The bundled skill should run only six
phases: (1) Context Gathering with `explorer` and `librarian`, (2) Interview
with one question at a time and at most five questions, (3) Scope Assessment
using the seven scope signals, (4) Approach Proposal with 2-3 options and a
recommendation, (5) User Approval, and (6) Handoff to trivial/direct,
medium/accelerated SDD, or complex/full SDD. The user is the only approver.

At the brainstorming-to-SDD transition, the handoff should recommend the right
SDD path and ask the user to choose an artifact store policy: `thoth-mem`,
`openspec`, or `hybrid` (default). That mode is wired through config so each
SDD skill knows whether to persist artifacts to thoth-mem only, OpenSpec files
only, or both.

After brainstorming approval, the normal SDD pipeline continues. Once
`openspec/changes/{change-name}/tasks.md` is generated, the orchestrator may
offer a precise oracle review using the bundled `plan-reviewer` skill. If
oracle returns `[REJECT]`, fix only the blocking issues (max 3) and re-run the
review loop until `[OKAY]`, then proceed to execution.

During execution, `tasks.md` becomes the live source of truth for progress:
`- [ ]` pending, `- [~]` in progress, `- [x]` completed, and `- [-]` skipped
with reason. `sdd-apply` must mark `[~]` before work starts, then update to
`[x]` or `[-]` and persist the revised task list plus `apply-progress` to
thoth-mem.

## Affected Areas

- `src/skills/brainstorming/SKILL.md` handoff guidance for SDD path selection
  and artifact store choice.
- `src/config/schema.ts` and `src/config/loader.ts` for `artifactStore.mode`
  config wiring with a `hybrid` default.
- `src/skills/_shared/persistence-contract.md`,
  `src/skills/_shared/thoth-mem-convention.md`, and
  `src/skills/_shared/openspec-convention.md` for the three persistence modes.
- SDD skill assets and orchestrator-facing workflow guidance so
  `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`,
  `sdd-verify`, and `sdd-archive` honor the selected persistence mode.

## Success Criteria

- [ ] Brainstorming is documented as a simple clarification-and-approval flow.
- [ ] The brainstorming handoff presents `thoth-mem`, `openspec`, and
      `hybrid` persistence choices before SDD generation starts.
- [ ] Oracle review is documented on SDD task plans, not brainstorming.
- [ ] Execution guidance documents `[ ]`, `[~]`, `[x]`, and `[-]` task states.
- [ ] The clarification gate, docs, and bundled skill registration are covered
      by the implementation plan.
