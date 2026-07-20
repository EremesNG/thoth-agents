# Plan contract

**Owner**: root<br>
**Output**: `openspec/changes/<feature>/plan.md`

Start from `templates/plan.md`. Read active constitution principles and record
evidence-backed pre-design and post-design Constitution Checks. Routine SDD does
not amend the constitution or run its lifecycle validator; activate
`thoth-constitution` only when an explicit constitution amendment is in scope.

Map each technical choice to FR/SC or a confirmed repository constraint. Name
affected components, interfaces, exact paths, migrations, risks, rollback, and
verification seams. Create `research.md`, `data-model.md`, `contracts/`, or
`quickstart.md` only when that artifact resolves a concrete implementation risk.
Any unexplained constitution failure blocks tasks.
