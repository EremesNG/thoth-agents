# Converge contract

**Owner**: root<br>
**Activation**: failed artifact-backed verification

Classify every oracle gap as `missing`, `partial`, `contradicts`, or
`unrequested`. Append one traceable remediation task per actionable gap to a new
Convergence section in `tasks.md`, ordered by severity and linked to its finding,
FR/buildable SC, exact writer surface, and verification outcome.

Never rewrite, renumber, reorder, or delete earlier tasks, and never edit product
code during convergence. If no actionable gap exists, leave `tasks.md`
byte-for-byte unchanged. Return to implement, then always ask oracle to verify
again.
