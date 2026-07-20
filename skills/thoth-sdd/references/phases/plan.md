# Plan contract

**Owner**: root<br>
**Output**: `openspec/changes/<feature>/plan.md`

Start from `<skill-dir>/templates/plan.md`, where `<skill-dir>` is the directory
containing the installed `thoth-sdd/SKILL.md`. Read active constitution
principles and record evidence-backed pre-design and post-design Constitution
Checks. Extract the exact active numbered principle headings once, then reuse
that same ordered name set in both checks; only status and evidence may differ.
Routine SDD does not amend the constitution or run its lifecycle validator;
activate `thoth-constitution` only when an explicit constitution amendment is
in scope.

Map each technical choice to FR/SC or a confirmed repository constraint. Name
affected components, interfaces, exact paths, migrations, risks, rollback, and
verification seams. Create `research.md`, `data-model.md`, `contracts/`, or
`quickstart.md` only when that artifact resolves a concrete implementation risk.
Any unexplained constitution failure blocks tasks.
