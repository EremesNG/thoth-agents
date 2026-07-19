# Verify contract

**Owner**: oracle, always read-only and independent

Oracle verifies Direct, Accelerated, and Full work. The root or writer that
implemented the change cannot substitute for oracle. Inspect changed code and run
or validate the smallest sufficient checks. Map every accepted requirement to
implementation evidence and executed checks; distinguish observed failures from
residual risk. Return `pass` or `fail`, compliance matrix, commands/results,
critical issues, warnings, and remediation anchors.

For Direct, return the verdict in-session. For Accelerated and Full, root persists
oracle's result using `templates/verify-report.md`. A fail routes to converge (or
straight back to implement for Direct); a pass permits archive for artifact-backed
routes.
