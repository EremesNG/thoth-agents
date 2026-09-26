# Work contract

`work.yaml` uses restricted YAML: mappings, lists, and scalar values only.
Duplicate or unknown keys, aliases, anchors, tags, merge keys, unsafe paths, and
dependency cycles are errors. Unit and context references are repository-root
relative. Exactly one of inline `units` or external `unitRefs` is allowed.

Required fields are `version: 1`, `change.id`, approved `agreement` with its
fingerprint, `goal`, `bounds`, `autonomy`, one or more `acceptance` definitions,
and units. Agreement identity covers goal, bounds, autonomy, acceptance
definitions, explicit decisions, and durable updates. It excludes implementation
unit refinements, mutable results, and verification.

Each unit declares a concrete output, dependencies, exact read/write footprints,
resources, an owner role, documentary checks, acceptance coverage, baseline, and
semantic status. `baseline.status: unknown` is valid while planning; capture it
before dispatch with the public baseline command and persist that snapshot in the
unit. A captured baseline records `capturedAt` and every write path's prior state
and fingerprint. Unknown remains an honest degraded state; checkpointing never
promotes it. Root acceptance results require `status: accepted`, nonempty
evidence, evidence/input/output fingerprints, and the accepted definition's
`definitionFingerprint`. Independent verification requires Oracle PASS, the same
content fingerprints, `agreementFingerprint`, and `technicalFingerprint`.
Current evidence, relevant content, and Git dirty state must still match at
closeout. Accepted unit evidence is freshness-checked at ready so a consumer
cannot release from stale work.

These fingerprints make documentary proof stale when its inputs, outputs,
evidence, criterion, unit definition, agreement, or technical plan changes. They
do not authenticate a reviewer or prove that a command actually ran; structural
validation cannot replace root judgment or independent Oracle review.

Durable updates target `.thoth/specs/<capability>/spec.md`. `expectedDigest` is
the raw lowercase SHA-256 of current spec bytes. `sourceDigest` is the same for
new source bytes. Add requires source/sourceDigest; replace additionally requires
expectedDigest; remove requires expectedDigest; rename requires target and
expectedDigest, plus sourceDigest when replacement source is supplied. Archive
must preflight every update and independently confirm Oracle PASS.

Fingerprint directories are allowed as explicit subtree scope. They are walked
without following symlinks. A directory containing `.thoth/changes` is rejected
because evidence would fingerprint itself.
