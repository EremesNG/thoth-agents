# Specify contract

**Owner**: root<br>
**Output**: `openspec/changes/<feature>/spec.md`

Start from `templates/spec.md` and remain implementation-neutral.

- Record **Why**, **Impact**, and affected kebab-case capability slugs (or
  `None`).
- Define prioritized, independently testable `US#` stories. Every story needs
  `Covers: FR-###, SC-###` and Given/When/Then acceptance scenarios.
- Give every sequential FR a descriptive title, a normative `MUST`/`SHALL`
  statement, and exactly one delta marker: `INTERNAL`, `ADDED`, `MODIFIED`,
  `REMOVED`, or `RENAMED ... FROM ...`.
- Type each measurable SC as `buildable` or `outcome`. Buildable criteria require
  implementation coverage; outcome criteria remain product/operational
  verification targets without fake tasks.
- State assumptions, dependencies, edge cases, and explicit non-goals.

Do not advance while a material ambiguity would change scope, behavior,
architecture, or durable delta intent.
