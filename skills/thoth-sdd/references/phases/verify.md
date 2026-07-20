# Verify contract

**Owner**: oracle, always read-only and independent

Oracle verifies Direct, Accelerated, and Full work. The root or writer that
implemented the change cannot substitute for oracle. Inspect changed code and
run or validate the smallest sufficient checks.

Judge three dimensions separately: **completeness** of accepted scope and
coverage, **correctness** against behavioral contracts and executed evidence,
and **coherence** across artifacts, code, tests, and documentation. Map every FR
and buildable SC to implementation evidence and an executed check. Record
each outcome SC as PASS with concrete observed evidence or as RISK with an
explicit ID-matched residual-risk entry, never as an invented implementation
task.

Return `pass` or `fail`, compliance matrix, commands/results, stable findings,
critical issues, warnings, and remediation anchors. For Direct, return the
verdict in-session. For Accelerated and Full, root persists oracle's exact result
using `<skill-dir>/templates/verify-report.md`, where `<skill-dir>` is the
directory containing the installed `thoth-sdd/SKILL.md`. Fail routes to converge
(straight back to implement for Direct); PASS permits closeout and archive for
artifact-backed routes.
