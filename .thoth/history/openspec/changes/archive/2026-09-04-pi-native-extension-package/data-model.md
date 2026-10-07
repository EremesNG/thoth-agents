# Data Model: Native Pi Package Ownership

## Purpose

First-party Pi package ownership and last-complete harness setup are different
facts. The existing install ledger remains the authority for a fully completed
`thoth-agents install --agent=pi`; a dedicated receipt is the sole authority for
whether the CLI may replace or remove an existing global `thoth-agents` Pi
source.

## Pi package receipt

The receipt lives beside the install ledger at
`<config-root>/thoth-agents/pi-package.json` and is written atomically through a
sibling temporary file and rename. Schema version `1` contains only:

```json
{
  "schemaVersion": 1,
  "owner": "thoth-agents",
  "scope": "user",
  "packageName": "thoth-agents",
  "source": "npm:thoth-agents@0.3.12",
  "installSource": "npm:thoth-agents@0.3.12",
  "version": "0.3.12",
  "manifestSha256": "<64 lowercase hex characters>",
  "extensionSha256": "<64 lowercase hex characters>"
}
```

All keys are required and additional keys are rejected. `source` is Pi's
canonical global settings/list string. Public npm setup preserves the exact npm
source in both `source` and `installSource`. Pi 0.84.4 rewrites an absolute local
input relative to the user package base, so packed verification stores that
relative configured value in `source` and the resolved absolute command-safe
path in `installSource`. The configured entry is valid only when its reported
absolute installed path resolves to `installSource`. The two digests bind the
observation to the exact installed manifest and compiled extension. The receipt
does not claim that external packages, skills, MCPs, agents, or thoth-mem are
complete.

## Ownership states

- `missing`: no configured first-party source and no receipt.
- `configured-unowned`: one global first-party source exists without a matching
  valid receipt; setup must not mutate or adopt it.
- `owned-missing`: a valid receipt exists but its source is not configured; setup
  may repair by installing the desired source but has no prior Pi source to
  restore.
- `owned-current`: exactly one global first-party source matches the valid
  receipt source, package identity, scope, version, and resolved install source.
- `conflicting`: the receipt is malformed/inconsistent, a project-local source
  shadows the global source, multiple identities are visible, or configured and
  receipted sources differ. Mutation is forbidden.

## Verification states

First-party verification is progressive and never promotes a weaker state:

1. `configured`: `pi list --no-approve` exposes exactly one expected global
   canonical source and resolved installed directory.
2. `loadable`: the installed package has the expected name/version/manifest,
   declared skills/assets, regular non-symlinked files, and its compiled default
   extension factory loads and registers the expected lifecycle handlers.
3. `observed-at-install`: an isolated real Pi subprocess explicitly loads the
   installed extension plus a temporary observer extension backed by a local
   credential-free provider; the provider's final request contains exactly one
   complete current root marker. The observation's manifest and extension
   digests equal the committed receipt.
4. `unobserved`: configuration/load evidence exists but no exact matching
   observation is available.
5. `unavailable`: the required Pi version, subprocess, extension API, or local
   observer cannot produce evidence. This never counts as success.

## Replacement transaction

1. Read and validate the receipt and `pi list --no-approve` before mutation.
2. Reject `configured-unowned` and `conflicting` states without a mutating Pi
   command. Preserve the prior valid receipt as the transaction authority.
3. Run `pi install <desired-install-source> --no-approve`; Pi replaces the same
   npm identity or canonicalizes the local source relative to the user package
   base.
4. Prove `configured`, `loadable`, and one-marker real-Pi observation against
   the returned canonical source and resolved absolute package path, then
   compute both digests.
5. Atomically replace the receipt. This is the commit point for first-party
   ownership; only after it may external setup begin.
6. On any failure before receipt commit, leave the old receipt unchanged and
   compensate: run `pi install <prior-receipt-installSource> --no-approve` when a
   prior configured owned source existed, otherwise run
   `pi remove <desired-install-source> --no-approve`. Verify the compensated
   canonical source and resolved path.
7. If compensation fails, return both the original and rollback errors, report
   `rollback-failed`, block downstream work, and provide the exact manual source
   command. Never rewrite the receipt to disguise inconsistent Pi state.

The last-complete install ledger is updated only after first-party ownership,
external packages, resources, external skills, and provider setup all succeed.
