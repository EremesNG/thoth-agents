# Implement contract

**Owner**: root, designer, quick, or deep; exactly one writer per mutable surface

Root marks selected artifact-backed tasks `[~]`, then assigns exact paths,
accepted FR/buildable-SC scope, non-goals, and verification commands. Use the
mandatory `tdd` skill for behavior changes and work in vertical red/green
slices. Child writers never edit task state; root marks `[x]` only after checking
task-specific evidence.

Implementation evidence may refine an artifact without restarting the workflow:

- If it preserves the accepted intent, return the evidence to root; root updates
  the canonical artifact and revalidates only affected downstream artifacts and
  gates.
- If it changes intent or accepted product scope, start a new change rather than
  silently expanding this one.

Report files changed, checks executed, deviations, and remaining work.
