# Contract examples

External units and optional topic context use repository-root-relative paths:

```yaml
unitRefs:
  - .thoth/changes/example/units/implementation.yaml
context:
  - topic: api
    path: .thoth/changes/example/context/api.md
    relevantTo: [implementation]
```

An external unit file contains one unit mapping without a `units:` wrapper.
Evidence is also repository-root-relative. Root writes acceptance only after the
declared checks actually run:

```yaml
result:
  status: accepted
  reviewedBy: root
  reviewedAt: 2026-09-26T12:00:00Z
  evidence: [.thoth/changes/example/evidence/review.txt]
  evidenceFingerprint: sha256:...
  inputFingerprint: sha256:...
  outputFingerprint: sha256:...
  definitionFingerprint: sha256:...
```

Resolve `<skill-dir>` to the installed skill directory. Calculate identities and
create or read a checkpoint with the standalone CLI:

```text
node "<skill-dir>/scripts/work.mjs" fingerprint --project <root> --id example --kind agreement
node "<skill-dir>/scripts/work.mjs" fingerprint --project <root> --id example --kind inputs --unit implementation
node "<skill-dir>/scripts/work.mjs" baseline --project <root> --paths src/output.ts
node "<skill-dir>/scripts/work.mjs" checkpoint --project <root> --id example --unit implementation --writer <native-agent-id> --summary "implemented seam" --completed implementation --pending verify --check-results "[]" --next-action "run focused verification" --read-refs src/input.ts
node "<skill-dir>/scripts/work.mjs" checkpoint --project <root> --id example --unit implementation --read
node "<skill-dir>/scripts/work.mjs" resume --project <root> --id example --unit implementation --max-bytes 16384
```

The baseline command returns a pre-dispatch snapshot for the root to persist in
the unit. `--check-results` is a JSON list of `{id,command,result,
inputFingerprint,outputFingerprint}` records; `result` is `pass` or `fail`.
Other list arguments are comma-separated. Checkpoint creation derives baseline,
read/write scope, agreement identity, and unit lineage from the current contract.
