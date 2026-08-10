# Specify contract

**Owner**: root<br>
**Output**: `openspec/changes/<feature>/spec.md`

Start from `<skill-dir>/templates/spec.md`, where `<skill-dir>` is the directory
containing the installed `thoth-sdd/SKILL.md`, and remain
implementation-neutral.

- Record **Why**, **Impact**, and affected kebab-case capability slugs (or
  `None`).
- Define prioritized, independently testable `US#` stories. Every story needs
  `Covers: FR-###, SC-###` and Given/When/Then acceptance scenarios.
- Before choosing durable delta metadata, read
  `openspec/specs/<capability>/spec.md` when it exists and compare the exact
  `### Requirement:` titles and normative behavior:
  - use `ADDED` only when no canonical requirement already expresses the
    behavior;
  - use `MODIFIED` or `REMOVED` only with the exact existing title;
  - use `RENAMED <capability> FROM <exact previous title>` when the title changes;
  - only `ADDED` is valid when the canonical capability does not exist.
  A validator warning on `ADDED` into an existing nonempty capability requires
  semantic-overlap review; exact-title validity alone does not prove new intent.
- Give every sequential FR a descriptive title, a normative `MUST`/`SHALL`
  statement, and exactly one delta marker: `INTERNAL`, `ADDED`, `MODIFIED`,
  `REMOVED`, or `RENAMED ... FROM ...`.
- Type each measurable SC as `buildable` or `outcome`. Buildable criteria require
  implementation coverage; outcome criteria remain product/operational
  verification targets without fake tasks.
- State assumptions, dependencies, edge cases, and explicit non-goals.

Do not advance while a material ambiguity would change scope, behavior,
architecture, or durable delta intent. Run the `specify` gate before planning;
do not defer canonical delta reconciliation until archive.
