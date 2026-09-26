# Design: Multi-Harness Skill Instructions

## Technical Approach

Update the `src/skills/` instruction set as a contract cleanup rather than a
runtime adapter change. The implementation will first centralize portable
concepts and harness bindings in shared references, then update phase-specific
skills to consume those references consistently.

The shared layer will define:

- Harness-neutral workflow vocabulary: semantic roles, delegated execution,
  user input surfaces, progress surfaces, artifact stores, persistence modes,
  memory governance, verification surfaces, and diagnostics.
- Harness-binding rules: OpenCode bindings remain explicit for current baseline
  behavior; Codex bindings are examples/capability notes with instruction-only
  limitations where runtime enforcement is not validated.
- Skill packaging guidance: Codex plugin-bundled `skills/<skill>/` is the
  preferred package form; `.agents/skills` is fallback/development/repo-local.

Phase skills will then replace universal OpenCode-only language with either a
semantic responsibility or a clearly scoped binding. The SDD phase order,
artifact prerequisites, OpenSpec paths, thoth-mem topic keys, review gates, and
role responsibility boundaries will remain unchanged.

## Architecture Decisions

### Decision: Centralize multi-harness vocabulary in shared support files

**Choice**:
Add the reusable multi-harness vocabulary and binding rules to
`src/skills/_shared/`, then make individual skills reference that shared
contract instead of restating harness-specific assumptions.

**Alternatives considered**:
- Edit each skill independently with local OpenCode/Codex wording.
- Add a new runtime adapter or generated skill transform.

**Rationale**:
The existing registry treats `_shared` as shared support available to all roles
and skills, while SDD skills already load shared OpenSpec, persistence, and
thoth-mem conventions. Centralizing the language avoids drift across
`requirements-interview`, `executing-plans`, `plan-reviewer`, `thoth-mem-agents`,
and all `sdd-*` skills. A runtime transform is unnecessary because the requested
change is instruction content, not generated adapter behavior.

### Decision: Preserve OpenCode as the baseline binding, not the universal model

**Choice**:
Keep OpenCode-specific operational details where they are required for current
behavior, but place them under OpenCode binding language or examples. Shared
rules will describe the semantic behavior first, then list known harness
bindings.

**Alternatives considered**:
- Remove OpenCode-specific tool/path names wherever another harness differs.
- Keep all current OpenCode language and append Codex notes.

**Rationale**:
The spec requires existing OpenCode SDD, delegation, memory, artifact, and
verification behavior to remain explicit. Removing concrete OpenCode guidance
would weaken the baseline, while appending Codex notes without changing shared
language would preserve universal OpenCode-only mandates.

### Decision: Model user input as a harness-provided blocking input surface

**Choice**:
Phrase `question`, `request_user_input`, and future equivalents as bindings for
the shared concept "blocking user input surface." Skills will require that
blocking choices use the harness-provided surface, not prose, when such a
surface is available. If a target harness lacks a supported binding, the skill
must stop or emit an unsupported-capability diagnostic instead of implying
support.

**Alternatives considered**:
- Name both tools everywhere.
- Keep `question` as the canonical skill primitive.

**Rationale**:
OpenCode uses `question`; Codex uses `request_user_input` in the current prompt
dialect. The shared behavior is the interaction contract, not the tool name.
This preserves the no-prose blocking-question rule while avoiding an OpenCode
tool as a universal requirement.

### Decision: Keep semantic role names stable and bind invocation syntax per harness

**Choice**:
Use `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` as
canonical semantic roles. Phrase dispatch syntax as a harness binding:
OpenCode examples may use `@role` and native `task`; Codex examples may use
"{role} role agent" and Codex custom-agent task language.

**Alternatives considered**:
- Make OpenCode `@role` names canonical.
- Introduce separate Codex role names.

**Rationale**:
The agent pack and prompt dialect already separate semantic roles from rendered
invocation syntax. The cleanup should align skill text to that abstraction
without changing role responsibilities or read-only/write-capable boundaries.

### Decision: Treat cartography autoload/path behavior as OpenCode-bound

**Choice**:
Keep cartography's current OpenCode path examples and AGENTS.md autoload
behavior as OpenCode-specific guidance. Add harness-neutral wording that the
codemap must be registered in the target harness's automatically loaded
instruction/context surface. For harnesses without a documented autoload
surface, require an explicit limitation or manual inclusion note.

**Alternatives considered**:
- Keep AGENTS.md autoload as universal.
- Remove AGENTS.md registration guidance from cartography.

**Rationale**:
`src/skills/cartography/SKILL.md` currently assumes OpenCode auto-loads
`AGENTS.md` and references `~/.config/opencode` script paths. Those assumptions
are valid OpenCode bindings, but the portable contract is codemap generation and
discoverability by future sessions.

### Decision: Verify with focused content greps plus existing project checks

**Choice**:
Use targeted grep checks to catch unscoped OpenCode/Codex primitives and run the
standard project checks that validate skill packaging/rendering.

**Alternatives considered**:
- Rely only on prose review.
- Add broad snapshot changes before the content cleanup is stable.

**Rationale**:
This change is mostly Markdown instruction content. Focused grep checks provide
direct evidence for the spec scenarios. Existing Bun tests already cover Codex
plugin-local skill packaging, fallback `.agents/skills`, duplicate-scope
diagnostics, prompt dialect tool names, and semantic role rendering.

## Data Flow

1. `src/skills/_shared/*` defines the common vocabulary, persistence semantics,
   OpenSpec paths, thoth-mem topic keys, and harness binding model.
2. Individual `src/skills/*/SKILL.md` files load shared references, state their
   phase-specific responsibilities, and use semantic concepts from the shared
   layer.
3. OpenCode skill installation continues to copy bundled source skills to the
   OpenCode skills directory through the existing custom skill installer.
4. Codex rendering continues to package `src/skills/` into plugin-local
   `.codex-plugin/skills/` by default, with `.agents/skills` emitted only when
   fallback output is explicitly requested.
5. Prompt rendering continues to map semantic roles and interaction concepts to
   harness-specific text through the existing prompt dialects.

## File Changes

### Planned modifications

- `src/skills/_shared/persistence-contract.md` - add shared multi-harness
  vocabulary, binding rules, and unsupported-capability diagnostic guidance
  while preserving existing persistence-mode semantics.
- `src/skills/_shared/openspec-convention.md` - keep canonical OpenSpec
  artifact paths and clarify that filesystem artifact semantics are independent
  of the harness that invokes the skill.
- `src/skills/_shared/thoth-mem-convention.md` - keep deterministic topic keys
  and recovery protocol, while scoping exposed tool names to the active
  harness/plugin binding.
- `src/skills/requirements-interview/SKILL.md` - rephrase `question` usage as
  the blocking user input surface with OpenCode and Codex bindings; preserve the
  five-question limit, SDD route decision, and persistence-mode choice.
- `src/skills/executing-plans/SKILL.md` - rephrase `@role`, `todowrite`,
  `task`, and background status references as harness-bound dispatch/progress
  surfaces; preserve task batching and progress ownership.
- `src/skills/plan-reviewer/SKILL.md` - keep `[OKAY]`/`[REJECT]` semantics and
  phase gate behavior while using shared persistence and role vocabulary.
- `src/skills/thoth-mem-agents/SKILL.md` - preserve orchestrator/subagent memory
  ownership and parent `session_id`/`project` requirements while disclosing
  instruction-only governance for harnesses that lack hard enforcement.
- `src/skills/cartography/SKILL.md` - scope `~/.config/opencode` script paths
  and AGENTS.md autoload assumptions to OpenCode; add portable codemap
  registration wording.
- `src/skills/cartography/README.md` - align documentation with the same
  cartography path/autoload binding model if it repeats those assumptions.
- `src/skills/sdd-init/SKILL.md`
- `src/skills/sdd-propose/SKILL.md`
- `src/skills/sdd-spec/SKILL.md`
- `src/skills/sdd-design/SKILL.md`
- `src/skills/sdd-tasks/SKILL.md`
- `src/skills/sdd-apply/SKILL.md`
- `src/skills/sdd-verify/SKILL.md`
- `src/skills/sdd-archive/SKILL.md`
  - update shared reference paths, persistence wording, thoth-mem binding
    language, and OpenSpec recovery/writing instructions only where needed.

### Planned tests / fixtures

- `src/harness/writers/skill-layout.test.ts` - add or adjust content assertions
  for harness-neutral anchors, plugin-bundled Codex skills, fallback
  `.agents/skills`, and duplicate-scope diagnostics.
- Existing Codex adapter and prompt dialect tests should remain green; update
  only if assertions intentionally depend on old instruction wording.

### Non-goals

- Do not change runtime adapter behavior, agent roster, role permissions, MCP
  configuration, hook implementation, or generated artifact paths.
- Do not rename `thoth-agents`, role names, persistence modes, SDD artifacts, or
  thoth-mem topic key formats.
- Do not change cartographer script behavior unless wording exposes an actual
  script bug during implementation.

## Interfaces / Contracts

- Semantic roles remain: `explorer`, `librarian`, `oracle`, `designer`, `quick`,
  `deep`.
- Harness-bound role invocation examples:
  - OpenCode: `@explorer`, `@librarian`, `@oracle`, `@designer`, `@quick`,
    `@deep`, native `task`, optional `task(background=true)`, `task_status`.
  - Codex: installed role agents named by semantic role, invoked through Codex
    custom-agent task surfaces where available.
- Harness-bound user input examples:
  - OpenCode: `question`.
  - Codex: `request_user_input` when available/enabled.
- Harness-bound progress examples:
  - OpenCode: `todowrite`.
  - Codex: Codex progress tracking surface.
- Persistence modes remain exactly: `thoth-mem`, `openspec`, `hybrid`, `none`.
- OpenSpec canonical paths remain exactly under `openspec/`.
- SDD thoth-mem topic keys remain exactly `sdd/{change-name}/{artifact}`.
- Codex skill packaging remains plugin-bundled by default through
  `.codex-plugin/skills/{skill}/SKILL.md`; `.agents/skills/{skill}/SKILL.md`
  remains explicit fallback output.

## Testing Strategy

Focused content checks:

```bash
rg -n "question tool|question-tool|@explorer|@librarian|@oracle|@designer|@quick|@deep|task_status|todowrite|AGENTS\\.md|~/.config/opencode|\\.agents/skills" src/skills -g "*.md"
```

Each hit must be either removed, framed as a harness-specific binding/example,
or justified as an OpenCode-only section.

```bash
rg -n "request_user_input|Codex|plugin-bundled|instruction-only|unsupported-capability|harness-provided" src/skills -g "*.md"
```

Hits must not claim hard runtime enforcement where Codex surfaces are currently
instruction-only or diagnostic-only.

```bash
rg -n "thoth-agents|thoth-agent|litebrain|engram" src/skills -g "*.md"
```

Hits must preserve `thoth-agents` as canonical and avoid reviving legacy active
identities.

Project checks:

```bash
bun run check:ci
bun run typecheck
bun test src/harness/writers/skill-layout.test.ts src/harness/adapters/codex.test.ts src/agents/index.test.ts
bun test
```

Use the focused tests first while iterating. Run the full suite before claiming
the implementation complete.

## Migration / Rollout

1. Update shared references first so phase skills have a stable vocabulary.
2. Update `requirements-interview`, `executing-plans`, `plan-reviewer`, and
   `thoth-mem-agents` next because they contain the most user-input,
   delegation, progress, review, and memory-governance language.
3. Update `sdd-*` phase skills after the shared and orchestration wording is
   stable.
4. Update cartography wording last, preserving the current OpenCode examples
   while adding the portable registration model.
5. Run focused grep checks after each group, then focused Bun tests, then the
   full project checks.

Rollback is content-only: revert the skill Markdown and any test assertion
updates from this change. Runtime adapters and generated output behavior should
not need rollback because they are not part of the implementation scope.

## Open Questions

- Should the shared multi-harness vocabulary live in a new
  `src/skills/_shared/harness-convention.md` file, or be folded into
  `persistence-contract.md`? Preferred default: create a new shared file if the
  content grows beyond persistence semantics, then reference it from affected
  skills.
- Should cartography continue to instruct direct script execution via
  `~/.config/opencode/...` for OpenCode, or should it add a repo-relative
  fallback command for bundled skill execution contexts? Preferred default:
  keep the OpenCode command as binding-specific and add a harness-neutral
  "use the installed skill script path for the active harness" note.
