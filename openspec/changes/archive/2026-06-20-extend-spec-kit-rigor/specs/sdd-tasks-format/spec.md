# Delta for sdd-tasks-format

Add an optional `[P]` parallel marker to the `sdd-tasks` template and make
`executing-plans` consume it as an explicit parallel-dispatch signal, replacing
today's implicit batching. The `N.M` phase numbering and `[USN]` traceability
labels are preserved; no flat `T001` ids are introduced. Gated by a new
`rules.tasks.parallel_markers` toggle. Fully back-compatible: absence of `[P]`
preserves current behavior.

## Assumptions

- The `[P]` marker is emitted on individual task lines that the author judges
  safe to run concurrently within their phase; it does not change `N.M`
  numbering or `[USN]` labels (user-confirmed scope: keep `N.M` + `[USN]`, no
  flat `T001`).
- `parallel_markers` defaults to `false` so a project on the old config sees no
  behavior change until it opts in.
- The exact dispatch granularity of `[P]` (cross-phase parallelism vs.
  same-agent batch only) is deferred to the design phase (open question (c));
  this spec requires only that `[P]`-marked tasks form an explicit parallel
  batch, leaving the batch's execution boundary to design.

## ADDED Requirements

### Requirement: Optional Parallel Task Marker

The `sdd-tasks` template MUST support an optional `[P]` marker on a task line to
declare that the task is safe to run in parallel with other `[P]`-marked tasks
in the same phase. When `rules.tasks.parallel_markers` is enabled, `sdd-tasks`
MAY emit `[P]` on parallel-safe tasks. The marker MUST NOT alter the existing
`N.M` phase numbering or the `[USN]` story-traceability label on the task, and
no flat task id (e.g. `T001`) is introduced.

#### Scenario: A parallel-safe task carries the marker

- GIVEN `rules.tasks.parallel_markers` is enabled
- WHEN `sdd-tasks` generates a task it judges safe to run in parallel
- THEN the task line carries a `[P]` marker
- AND the task retains its `N.M` phase number and `[USN]` label
- AND no flat `T001`-style id is introduced

#### Scenario: Sequential tasks omit the marker

- GIVEN `rules.tasks.parallel_markers` is enabled
- WHEN `sdd-tasks` generates a task that depends on prior tasks in the phase
- THEN the task line does NOT carry a `[P]` marker

#### Scenario: Marker emission is gated by config

- GIVEN `rules.tasks.parallel_markers` is disabled or absent
- WHEN `sdd-tasks` generates tasks
- THEN no `[P]` markers are emitted
- AND the tasks retain their `N.M` numbering and `[USN]` labels

### Requirement: Parallel Marker Config Toggle

`openspec/config.yaml` MUST expose a `rules.tasks.parallel_markers` boolean
toggle that gates both emission of `[P]` markers by `sdd-tasks` and their
consumption by `executing-plans`. When the toggle is absent, the mechanism MUST
default to disabled so legacy projects behave exactly as before.

#### Scenario: Toggle enables the mechanism

- GIVEN `rules.tasks.parallel_markers` is set to `true`
- WHEN `sdd-tasks` and `executing-plans` run
- THEN `[P]` emission and explicit parallel dispatch are active

#### Scenario: Absent toggle defaults to disabled

- GIVEN a `config.yaml` that does not declare `rules.tasks.parallel_markers`
- WHEN `sdd-tasks` and `executing-plans` run
- THEN the mechanism is treated as disabled
- AND behavior is identical to the pre-mechanism baseline

### Requirement: Harness-Agnostic Parallel Markers

The `[P]` marker syntax, the `rules.tasks.parallel_markers` toggle semantics,
and the explicit parallel-dispatch behavior MUST be defined once in shared
conventions and behave identically across OpenCode, Claude Code, and Codex, with
per-harness prose limited to declared capability gaps reported as
unsupported-capability limitations.

#### Scenario: Identical parallel-marker behavior across harnesses

- GIVEN the parallel-marker definition in shared conventions
- WHEN `sdd-tasks` and `executing-plans` run under OpenCode, Claude Code, or Codex
- THEN the `[P]` syntax, toggle semantics, and dispatch behavior are identical across all three harnesses

## MODIFIED Requirements

### Requirement: Backward-Compatible Consumption of Traceability Fields

`executing-plans` MUST consume the `[USN]`, priority, and "Independent Test"
fields when present and MUST tolerate their absence on legacy task files without
failing, so pre-existing `tasks.md` artifacts remain executable. When
`rules.tasks.parallel_markers` is enabled, `executing-plans` MUST additionally
treat a `[P]` marker as an explicit parallel-dispatch signal at its grouping
logic, dispatching `[P]`-marked tasks within a phase as an explicit parallel
batch rather than relying on implicit batching. `executing-plans` MUST tolerate
the absence of `[P]` markers without failing, falling back to its existing
grouping behavior so legacy `tasks.md` artifacts remain executable.

#### Scenario: Legacy tasks without new fields still execute

- GIVEN a legacy `tasks.md` whose tasks lack `[USN]`, priority, and "Independent Test" fields
- WHEN `executing-plans` consumes it
- THEN execution proceeds without error
- AND the absent fields are treated as optional

#### Scenario: New fields are surfaced when present

- GIVEN a `tasks.md` whose tasks carry `[USN]`, priority, and "Independent Test" fields
- WHEN `executing-plans` consumes it
- THEN the story id, priority, and Independent Test are surfaced during execution

#### Scenario: Parallel markers drive explicit batch dispatch

- GIVEN `rules.tasks.parallel_markers` is enabled
- AND a `tasks.md` phase containing two tasks marked `[P]`
- WHEN `executing-plans` consumes the phase
- THEN the two `[P]`-marked tasks are dispatched as an explicit parallel batch

#### Scenario: Missing parallel markers fall back to implicit grouping

- GIVEN a `tasks.md` whose tasks carry no `[P]` markers
- WHEN `executing-plans` consumes it
- THEN execution proceeds without error
- AND `executing-plans` uses its existing implicit grouping behavior
