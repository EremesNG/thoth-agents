# Implementation Plan: Native Pi Extension Package

## Technical context

The repository already renders Pi root/specialist contracts and implements
CLI/TUI install, Update, Sync, status, package verification, external skills,
provider setup, and ledger gating. It does not publish a Pi package manifest or
native extension. The current installer treats only four third-party packages
as Pi-owned and activates Thoth by writing `APPEND_SYSTEM.md`, six global agent
files, and five copied global skills.

Pi 0.84.4 supports package-declared `extensions`, `skills`, `prompts`, and
`themes`; `before_agent_start` can provide the effective system prompt. Pi has
no package-manifest agent field, while `pi-subagents-j0k3r` discovers definitions
only from global/project `agents/` or `subagents/`. The new design therefore
publishes the main npm artifact as a Pi package, uses a native extension for root
activation, lets Pi discover thoth-owned skills from that package, and retains a
single package-owned synchronizer for the six required global agent files.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — the user selected Full SDD; local packaging discovery and current official Pi research ran as separate read-only lanes before synthesis.
- **Explicit role boundaries**: PASS — root owns artifacts; explorer mapped local/gentle-ai behavior; librarian supplied current authoritative Pi evidence; no child mutated the workspace.
- **Proportional Spec Kit-compatible SDD**: PASS — native package publication, migration, installer ordering, and real-host verification justify Full exploration and separate gates.
- **Truthful multi-harness contracts**: PASS — the specification corrects the missing first-party Pi package while retaining external execution ownership and explicit native capability limits.
- **Independent provider ownership**: PASS — thoth-mem remains a later provider-owned setup command and is not bundled into the first-party extension.
- **Evidence-led completion**: PASS — the specification defines packed-candidate, adversarial installer, migration, full regression, and real Pi outcome evidence plus fresh Oracle verification.

## Design

### Native package and extension

- Add `keywords: ["pi-package"]` and `pi: { extensions:
  ["./dist/pi.js"], skills: ["./skills"] }` to `package.json`; retain one npm
  package name and exact executing version. Add the package-owned `pi/` asset
  directory to the published `files` inventory.
- Add exactly one `pi: "src/pi.ts"` ESM entry to `tsup.config.ts`; the existing
  `index`, `cli/index`, and `cli/tui/index` entries remain unchanged. The build
  and packed-candidate checks both require the resulting `dist/pi.js`.
- Add `src/pi.ts` as a side-effect-free importable Pi extension entrypoint. Its
  default registration function subscribes to `before_agent_start` and
  `session_start`; it appends one delimited adaptive-root block to the effective
  system prompt, reports degraded missing-dependency state without throwing a
  valid Pi turn, and calls only the package-owned specialist synchronizer.
- Refactor `src/harness/adapters/pi.ts` and
  `src/harness/writers/pi-agent.ts` so the canonical root renderer returns a
  hook-ready bounded block rather than an `APPEND_SYSTEM.md` artifact, while the
  six existing specialist definitions remain derived from shared role contracts.
- Extend `src/harness/generate-integration-packages.ts` to generate deterministic
  `pi/agents/{explorer,librarian,oracle,designer,quick,deep}.md` plus an asset
  provenance manifest from the same adapter output. Packed verification treats
  those files, `dist/pi.js`, and all five `skills/*/SKILL.md` files as one
  first-party release unit.

### Package-owned specialist synchronization and migration

- Extract the current agent conflict/write logic into a shared Pi resource
  module used by both the CLI and native extension. The setup path performs full
  convergence; `session_start` may materialize missing or exact attributable
  package resources but preserves supported model/effort fields and never
  overwrites an unowned canonical definition.
- Keep global `agents/` as the authoritative destination because neither Pi's
  package manifest nor `pi-subagents-j0k3r` discovers packaged agent files.
  Continue detecting project-local `agents/`, `subagents/`, and MCP shadowing.
- Replace Pi owned-skill copying with package-manifest discovery. During a
  successful migration, remove only legacy global skill trees proven identical
  to the packaged thoth-owned assets or covered by attributable receipt/evidence;
  preserve modified/ambiguous trees and return a manual action.
- Remove only the delimited legacy thoth-agents Pi block from
  `APPEND_SYSTEM.md` after the native extension has been installed and verified;
  preserve all unrelated bytes. Keep path helpers solely for migration and
  diagnostics where needed.

### Exact first-party bootstrap

- Introduce an exact first-party package descriptor derived from the executing
  package version: `npm:thoth-agents@<version>`. Tests and packed smoke may inject
  an explicit absolute candidate root/source; production never guesses a local
  package from `cwd`.
- Treat the command input and Pi's configured source as separate evidence. npm
  inputs remain byte-identical; for a local absolute candidate, derive the
  configured source exactly as Pi reports it relative to the user package base
  and require its reported absolute installed directory to equal the command
  input. Persist both values so rollback never reinterprets a relative settings
  source against the CLI's unrelated working directory.
- Add `src/cli/pi-package-receipt.ts` as the sole first-party ownership record,
  implementing the schema and state machine in `data-model.md`. The receipt is
  stored at `<config-root>/thoth-agents/pi-package.json`, separately from the
  last-complete install ledger. A configured global first-party source without
  an exact valid receipt, a project-local shadow, ambiguity, or receipt/source
  disagreement is a pre-mutation conflict and is never adopted implicitly.
- Change `src/cli/pi-install.ts` so preflight is followed by the first-party
  install/verification step before the existing four external package specs.
  Verification requires one user-scoped exact source record, an absolute regular
  installed directory, matching name/version and Pi manifest, all declared
  resources, generated asset provenance, and a successful `dist/pi.js` load
  probe plus native-root observation. Name-only, wrong-version, project-local,
  ambiguous, malformed, symlinked, or missing-resource evidence fails closed.
- Preserve current package-manager ownership through a compensating transaction:
  retain the prior valid receipt unchanged, run
  `pi install <desired-install-source> --no-approve`
  as the first mutation, prove the desired package, then atomically commit its
  receipt. On pre-commit failure, restore a prior configured receipt-owned source
  with `pi install <prior-install-source> --no-approve`, or remove a newly
  introduced desired source with
  `pi remove <desired-install-source> --no-approve`, and verify the resulting
  Pi-canonical source plus resolved path. Failed compensation returns both
  errors, leaves the receipt
  unchanged, blocks downstream setup, and supplies an exact manual recovery
  command. A later external failure may leave the newly receipt-owned verified
  first-party package visible, but provider setup and the final install ledger
  remain incomplete.
- Keep the ordered dependency tail: `pi-subagents-j0k3r`, Context7, Exa,
  `pi-mcp-adapter`, grep.app merge, specialist sync, four external skills,
  `thoth-mem setup pi`, then last-complete ledger commit. Dry-run includes every
  item and performs no package, file, provider, or ledger mutation.

### Native activation observation

- Model first-party evidence as progressive, non-interchangeable states:
  `configured`, `loadable`, `observed-at-install`, `unobserved`, and
  `unavailable`, with `missing` and `conflicting` ownership states reported
  independently. Status may report a receipt-bound prior observation only when
  the current source plus manifest and extension digests still match; it never
  upgrades configured or importable evidence to observed.
- Implement a deterministic probe helper used by first-party verification and
  `scripts/verify-pi-package.mjs`. It creates a disposable Pi home and temporary
  observer extension with a credential-free local provider, then invokes:
  `pi --mode json --no-session --no-approve --offline --no-extensions
  --extension <installed-dist-pi> --extension <temporary-observer>
  --provider thoth-observer --model thoth-observer/probe --print <probe-prompt>`.
  Explicit extensions remain enabled while automatic extension discovery is
  disabled, so unrelated user packages cannot satisfy or perturb the probe.
- The observer captures the final provider request after all
  `before_agent_start` handlers and returns a deterministic local response. It
  succeeds only when the current complete root start/end marker occurs exactly
  once, the expected hook executed once, and the observed package digests match
  the candidate. Missing Pi/API support, inability to reach the local provider,
  a duplicate/missing marker, or probe-process failure is failed or
  `unavailable` evidence and blocks first-party receipt commit.

### Operations, diagnostics, and distribution

- Extend `src/cli/operations/pi.ts` status targets with first-party exact source,
  ownership receipt, manifest/resource, extension-load, receipt-bound
  observed-at-install/unobserved/unavailable native-root, packaged-skill,
  legacy-migration, and specialist-sync evidence. Retain independent external
  package, research, credential, MCP, provider, and ledger states.
- Update Install/Update/Sync CLI and TUI plans so Update reuses the full
  first-party-first path, Sync previews native resources/migration without
  network mutation, and model/effort edits still touch only attributable
  specialist frontmatter.
- Add packed distribution verification using a disposable package/home and an
  isolated package source or registry so the installed candidate is the current
  build rather than a previously published npm release.
- Update README, CLI help, routed Pi/install/package documentation, architecture,
  runtime integration, testing, and release guidance to distinguish the native
  package from its four external Pi packages, four external skills, and
  provider-owned thoth-mem package.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Publish one first-party Pi package with extension, skills, and six assets. | `package.json`, `tsup.config.ts`, `src/pi.ts`, `pi/`, `src/harness/generate-integration-packages.ts` | Manifest/inventory, generation, build, pack, and load tests |
| FR-002 | Derive root and six specialists from the canonical seven-role pack. | `src/harness/adapters/pi.ts`, `src/harness/writers/pi-agent.ts`, `src/agents/` | Adapter/writer/prompt rendering tests |
| FR-003 | Install exact thoth-agents first and retain external runtime ownership. | `src/cli/pi-install.ts`, `src/cli/pi-package-receipt.ts`, package descriptors | Pre-mutation conflict, ordered command, ownership, and rollback tests |
| FR-004 | Gate the complete install path on observed first-party verification and receipt commit. | `src/cli/install.ts`, `src/cli/pi-install.ts`, `src/cli/pi-package-receipt.ts`, `src/cli/install-completion.ts` | Dry-run, injected-failure, probe, compensation, receipt, and ledger tests |
| FR-005 | Use manifest skills and global package-owned agent synchronization. | `package.json`, `pi/agents/`, shared Pi resource synchronizer, `src/cli/owned-skills.ts` | Discovery, count, idempotency, conflict, and migration tests |
| FR-006 | Report configured/loadable/observed native state separately from dependencies. | `src/harness/adapters/pi.ts`, `src/cli/pi-native-probe.ts`, `src/cli/operations/pi.ts` | Hook-observation and capability/status degradation tests |
| FR-007 | Make Update use the same native-package-first pipeline. | `src/cli/operations/pi.ts`, `src/cli/install.ts`, TUI operations | Install/Update plan and apply equivalence tests |
| FR-008 | Separate receipt-owned first-party state from last-complete ledger state. | `src/cli/pi-package-receipt.ts`, `src/cli/install-ledger.ts`, `src/cli/operations/pi.ts` | Receipt/source/digest and missing/stale/partial/complete status fixtures |
| FR-009 | Route CLI/TUI operations to native package and attributable agents. | `src/cli/commands.ts`, `src/cli/operations/pi.ts`, `src/cli/tui/` | Parser, commands, operation, and TUI tests |
| FR-010 | Document package ownership, order, migration, and recovery. | `README.md`, `docs/installation.md`, `docs/agent/*`, CLI help | Documentation assertions and review |
| FR-011 | Apply root/child controls and disclose extension privileges. | `src/pi.ts`, Pi writer/adapter diagnostics | Extension hook and security-copy tests |
| FR-012 | Keep runtime self-contained after package installation. | `package.json#pi`, `dist/pi.js`, `skills/`, generated `pi/` assets | Packed unrelated-cwd smoke with network disabled after install |

## Optional support artifacts

- `research.md`: required; resolves Pi manifest limits, hook capability,
  pi-subagents discovery, gentle-ai ownership, and the current repository gap.
- `data-model.md`: required; defines the new durable Pi-package ownership
  receipt, its strict schema, progressive observation states, commit point, and
  compensating rollback without changing the last-complete ledger schema.
- `contracts/`: not needed; public contracts are the npm `pi` manifest, existing
  CLI JSON evidence, and TypeScript interfaces verified at package boundaries.
- `quickstart.md`: not needed; operator workflow belongs in existing installation
  and routed documentation.

## Risks and migrations

- **Self-install mismatch**: normal setup pins the executing version; packed
  verification injects only an explicit candidate source and verifies the
  installed manifest/path before any dependency action.
- **Legacy duplicate root/skills**: migration removes only attributable exact
  state after native activation is verified; ambiguous modifications remain and
  produce manual recovery guidance.
- **Agent package-discovery gap**: a shared package-owned synchronizer writes the
  only supported global definitions; one writer and ownership markers prevent
  competing CLI/extension implementations.
- **Runtime hook failure**: hooks degrade diagnostically and do not reject a
  valid Pi turn; setup/status still report incomplete native activation.
- **Partial external installation**: the native package may remain installed,
  but the ledger never advances and status exposes each missing downstream layer.
- **Security**: extension and external packages run with user privileges; pins,
  `--no-approve`, trust, and tool allowlists remain provenance/control signals,
  not an OS sandbox.
- **Rollback**: first-party receipt commit is atomic, while Pi package mutation
  uses verified compensating rollback to the receipt-owned prior source (or
  removal of a newly added source). Failed compensation is visible and manual;
  resource migration uses backups/atomic replacement; unrelated Pi packages,
  configuration, skills, and operator content are never inferred or removed.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — the design keeps one root-owned artifact and one future writer for coupled package/install/resource surfaces, with a fresh Oracle reserved for review and verification.
- **Explicit role boundaries**: PASS — the native extension creates no orchestrator child, materializes exactly the six canonical specialists, and retains read-only versus writer contracts.
- **Proportional Spec Kit-compatible SDD**: PASS — research decisions feed exact requirements, technical seams, migration, tasks, review, implementation, independent verification, and archive without rewriting prior history.
- **Truthful multi-harness contracts**: PASS — first-party Pi activation now uses supported package/hook/skill surfaces; filesystem agent synchronization is explicit because neither manifest nor delegation package discovers embedded agents.
- **Independent provider ownership**: PASS — the plan invokes provider-owned setup only after first-party and external setup and never packages, rewrites, or verifies provider internals itself.
- **Evidence-led completion**: PASS — every FR maps to exact files and checks; outcome smoke may record an external blocker as RISK without replacing it with mocked success.
