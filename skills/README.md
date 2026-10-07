# Bundled thoth-owned skills

This directory is the canonical, versioned source for owned skills. The installer
and `pnpm run integration:sync` expose the same bundle in supported harnesses.

Owned workflow skills are `thoth-init`, `thoth-sdd`, `thoth-constitution`,
`thoth-archive`, and `plan-reviewer`. `thoth-sdd` owns proportional
understanding/classification, the single ID-named substantial-change record, and
maintained validation. The optional plan reviewer is read-only; archive applies
declared `.thoth/specs/` deltas transactionally.

External skills (`simplify`, `tdd`, `progressive-context-router`, and
`architectural-grilling`) are not copied here. Installation handles them; never
fetch or install dependencies during an active SDD phase. `thoth-init` only
initializes canonical `.thoth/` governance and preserves existing records.
