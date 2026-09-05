# Feature Specification: Native Pi Extension Package

**Change ID**: `pi-native-extension-package`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Pi operators must receive `thoth-agents` itself as a first-party native
Pi package, matching the native-package ownership pattern established by the
`gentle-ai` reference instead of activating Thoth only through CLI-copied
resources.<br>
**Impact**: The published `thoth-agents` artifact becomes a Pi package with a
native extension and packaged skills; Pi installation and Update install the
exact executing first-party package before external dependencies; root and
specialist asset ownership moves behind the native package boundary; existing
OpenCode, Codex, Claude Code, provider, and external-runtime behavior remains
otherwise unchanged.<br>
**Affected capabilities**: `multi-harness-agent-pack`, `cli-installation`, `external-required-skills`

## User stories

### US1 - Install thoth-agents as the first native Pi package (Priority: P1)

As a Pi operator, I can run `thoth-agents install --agent=pi` and have the exact
executing `thoth-agents` release installed and verified through Pi before any
external package is provisioned.

**Independent test**: Run dry-run and applied installation against an isolated
Pi home and inspect the ordered commands, exact `pi list` source, installed
manifest/resources, external dependencies, provider evidence, and final ledger.

**Covers**: FR-001, FR-003, FR-004, FR-007, FR-008, FR-009, SC-001, SC-002, SC-004, SC-007

**Acceptance scenarios**:

1. **Given** Pi `0.84.4`, Node.js `>=22.19`, an executing thoth-agents version,
   and an empty isolated Pi home, **When** Pi installation is applied, **Then**
   `pi install npm:thoth-agents@<exact-version> --no-approve` completes and is
   verified before delegation, research, skills, provider, or ledger steps.
2. **Given** the same environment, **When** installation is previewed, **Then**
   the first-party and external package commands plus every migration and setup
   target are reported with zero mutation.
3. **Given** first-party package installation or verification fails, **When**
   setup exits, **Then** no external dependency is installed and no complete
   ledger record is written.
4. **Given** an existing global `thoth-agents` Pi source, **When** no valid
   thoth-agents ownership receipt matches that exact source, **Then** setup
   reports an unowned conflict before invoking any mutating Pi command.
5. **Given** a receipt-owned prior source, **When** replacement, native-load
   observation, or receipt commit fails, **Then** setup restores and verifies
   the prior source, leaves the prior receipt authoritative, and blocks every
   downstream dependency; a failed compensation is reported explicitly.

### US2 - Run Thoth from its Pi extension boundary (Priority: P1)

As a Pi user, I receive the adaptive root, six specialists, and workflow skills
from the installed `thoth-agents` package rather than from a root configuration
that merely imitates a plugin.

**Independent test**: Install a packed candidate into an isolated Pi home,
start Pi with the native extension, and observe one injected root contract,
five packaged skills, and six discoverable specialist definitions without a
child orchestrator or duplicate root block.

**Covers**: FR-001, FR-002, FR-005, FR-006, FR-011, FR-012, SC-001, SC-003, SC-005

**Acceptance scenarios**:

1. **Given** the native package is installed, **When** Pi begins an agent turn,
   **Then** its extension injects exactly one current adaptive-root contract
   through the supported native lifecycle without persisting a duplicate
   `APPEND_SYSTEM.md` block.
2. **Given** Pi loads package resources, **When** skills are enumerated,
   **Then** the five thoth-owned workflow skills resolve from the native package
   manifest without copied global duplicates.
3. **Given** `pi-subagents-j0k3r` requires filesystem definitions, **When** the
   package synchronizer runs, **Then** exactly six attributable canonical agent
   definitions are discoverable globally and an unowned canonical conflict is
   preserved and reported rather than overwritten.

### US3 - Update, migrate, and diagnose native package state (Priority: P2)

As an operator, I can Update, Sync, and inspect Pi while distinguishing the
first-party package, its materialized assets, external packages, remote tools,
provider setup, and the last complete CLI-managed release.

**Independent test**: Exercise healthy, missing, stale, wrong-version,
wrong-source, legacy-root, duplicate-skill, custom-directory, conflict, and
partial-dependency fixtures through status, Update, Sync, CLI, and TUI paths.

**Covers**: FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, SC-002, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a legacy complete Pi setup from the prior release, **When** Update
   succeeds, **Then** the exact native package is installed, the attributable
   legacy root block and duplicate owned-skill copies are removed, specialist
   discovery is preserved, and unrelated operator content is unchanged.
2. **Given** any installed first-party or external package/source/version,
   resource, provider, or remote-state mismatch, **When** status is requested,
   **Then** each layer is reported independently without advancing or inferring
   the last-complete ledger.
3. **Given** native package state is incomplete or conflicting, **When** Sync or
   Update is planned, **Then** it returns a bounded repair or manual action and
   never falls through to another harness.

### US4 - Preserve external ownership and existing harnesses (Priority: P1)

As a maintainer, I can publish native Pi support without vendoring external
execution, research, skill, or memory implementations or changing the other
harnesses.

**Independent test**: Inspect the packed npm inventory and run existing
OpenCode, Codex, Claude, shared-skill, provider-boundary, generated-package,
build, and full regression checks.

**Covers**: FR-003, FR-004, FR-005, FR-006, FR-010, FR-011, FR-012, SC-001, SC-006

**Acceptance scenarios**:

1. **Given** the native Pi package, **When** its packed contents are inspected,
   **Then** it contains only thoth-owned extension, agent, prompt, skill, and
   diagnostic assets and references external runtimes by pinned package source.
2. **Given** OpenCode, Codex, or Claude Code installation and runtime flows,
   **When** the Pi package change is present, **Then** their current behavior and
   generated artifacts remain unchanged except for shared truthful documentation.

## Edge cases

- The executing npm version is unpublished, malformed, differs from the packed
  candidate, or resolves to another package source.
- Pi canonicalizes a user-scoped absolute local package input to a path relative
  to `PI_CODING_AGENT_DIR`; verification and rollback must bind that configured
  source to its resolved absolute installed directory rather than compare the
  raw command argument byte-for-byte.
- `pi list --no-approve` shows a name-only, wrong-version, ambiguous, project-local,
  local-path, or user-owned conflicting thoth-agents package.
- `package.json#pi`, `dist/pi.js`, packaged skills, or packaged specialist assets
  are missing, malformed, symlinked, stale, or fail a load probe.
- Direct `pi install` activates the first-party extension without one or more
  external packages; runtime diagnostics must describe the degraded dependency
  rather than crash or claim completeness.
- The native root hook runs repeatedly, Pi reloads extensions, or another
  extension changes the system prompt; Thoth injection must remain bounded and
  non-duplicating for each turn.
- Existing attributable `APPEND_SYSTEM.md` content or copied skills were edited
  by the operator and cannot be proven safe to remove.
- A canonical agent definition is user-owned, modified outside attributable
  metadata, shadowed project-locally, or configured with supported model/effort
  overrides.
- `PI_CODING_AGENT_DIR` redirects package-owned synchronization while the
  external skills CLI still targets the default global root.
- A later external package, MCP merge, external skill, or provider step fails
  after the first-party native package was installed.
- Pi extension code runs with user privileges and can access process credentials
  and the network despite tool allowlists or `--no-approve`.

## Functional requirements

- **FR-001 — Publish a native Pi package with runtime-autonomous assets**: `[RENAMED multi-harness-agent-pack FROM Distribute runtime-autonomous assets with explicit bootstrap]` The published `thoth-agents` npm artifact MUST identify as a Pi package, MUST declare exactly one compiled native extension and the five packaged thoth-owned workflow skills through supported Pi manifest fields, MUST ship the six canonical specialist resources, and MUST remain usable from its installed package root without invoking the thoth-agents CLI or network during ordinary Pi runtime.
- **FR-002 — Preserve the seven-role contract**: `[MODIFIED multi-harness-agent-pack]` The native Pi package MUST derive one ambient `orchestrator` root and the six `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` specialists from the canonical role contracts, MUST NOT create an orchestrator child definition, and MUST preserve role prompts, model/effort metadata where Pi supports them, memory envelopes, ownership, and return contracts.
- **FR-003 — Preserve native plugin-manager ownership**: `[MODIFIED multi-harness-agent-pack]` Pi installation MUST install and verify the exact executing `thoth-agents` package through `pi install` before installing the selected compatible `pi-subagents-j0k3r` and research packages; MUST treat one schema-validated thoth-agents Pi-package receipt as the sole authority for replacing or removing an existing global first-party source; MUST reject an unowned, ambiguous, project-local, or receipt-inconsistent first-party source before mutation; and MUST use external packages' public native surfaces without vendoring, patching, copying their internals, or reimplementing execution, concurrency, task/history, research, or provider lifecycle.
- **FR-004 — Preserve complete per-harness setup**: `[MODIFIED cli-installation]` `install --agent=pi` MUST preflight Node.js and Pi; capture and validate the receipt-owned prior first-party state; install and verify the exact first-party native package before any external package; atomically commit its ownership receipt only after configured, loadable, and observed evidence passes; and compensate a failed replacement by restoring and verifying the prior owned source or removing a new source while leaving the prior receipt unchanged. Only then MAY setup install delegation and research packages, merge the attributable grep.app entry, synchronize only package-owned specialist resources, install mandatory external skills, invoke provider-owned setup, and record the last-complete Pi ledger after every required step succeeds. Dry-run MUST describe the complete order without mutation, and a first-party failure MUST prevent all downstream mutation.
- **FR-005 — Preserve harness-native discovery**: `[MODIFIED external-required-skills]` Pi MUST discover the five thoth-owned workflow skills directly from the installed `thoth-agents` package manifest and MUST discover exactly six package-owned specialist definitions from Pi's global agent directory; setup MUST remove only provably attributable legacy copied skill duplicates, MUST install the four external skills from their canonical repositories, and MUST remain independent of CLI/network access during SDD execution.
- **FR-006 — Distinguish capability gaps from generation failure**: `[MODIFIED multi-harness-agent-pack]` Pi capability reporting MUST independently identify first-party package state as missing, conflicting, configured, loadable, observed-at-install, unobserved, or unavailable; MUST reserve `observed-at-install` for a real Pi subprocess whose final provider request contains exactly one current root marker for the receipt's exact source and manifest/extension digests; and MUST independently report packaged-skill discovery, specialist materialization, delegation, research, external credentials, provider setup, and unsupported security or lifecycle guarantees. Direct native-package activation with missing external dependencies MUST degrade truthfully without crashing or claiming complete installation.
- **FR-007 — Make applied Update installation-equivalent**: `[MODIFIED cli-installation]` Applying Update for Pi MUST perform the same exact first-party-package-first, external-dependency, migration, provider, and ledger flow as installation; preview MUST include every package, resource, migration, external-skill, provider, and ledger action without mutation.
- **FR-008 — Treat the CLI ledger as authoritative for managed setup**: `[MODIFIED cli-installation]` One dedicated Pi-package receipt MUST be authoritative only for first-party source ownership, exact version, and verified manifest/extension digests, while the existing install ledger remains authoritative only for the last complete harness setup. Pi status and update decisions MUST report executing, recorded, receipt, configured, loadable, observed-at-install, external-package, managed-resource, MCP, and provider drift independently, and MUST NOT infer or advance complete setup from ownership, package presence, extension execution, remote reachability, or native resources alone.
- **FR-009 — Expose truthful Pi operations**: `[MODIFIED cli-installation]` CLI and TUI status, install, Update, Sync, and specialist model/effort operations MUST target the native first-party Pi package and its attributable definitions, MUST surface exact source/version and extension/resource evidence, and MUST report unavailable or conflicting actions explicitly rather than falling through to another harness.
- **FR-010 — Public operator guidance**: `[MODIFIED cli-installation]` README, CLI help/status, and routed installation documentation MUST distinguish the native `thoth-agents` package from its external dependencies, show the exact first-party-first order, explain direct-package degraded behavior, package/global ownership, migration, dry-run/Update/Sync, custom-directory limitations, provider setup, credentials/network, security, and partial-install recovery.
- **FR-011 — Keep role permissions explicit**: `[MODIFIED multi-harness-agent-pack]` The Pi extension and specialist definitions MUST apply the strongest native root and child tool controls available while stating that extension execution, root injection, resource materialization, process credentials, filesystem, and network access remain within the invoking user's privileges and are not an OS sandbox.
- **FR-012 — Keep SDD runtime independent of the CLI**: `[MODIFIED external-required-skills]` Installation MAY invoke Pi, npm, the skills CLI, and provider setup, but after installation the native Pi package MUST supply its extension and thoth-owned SDD contracts without invoking the thoth-agents CLI, `npx skills add`, or a network fetch during an SDD phase.

## Success criteria

- **SC-001** `[buildable]`: Packed-package verification proves the exact published manifest identifies one `./dist/pi.js` extension and the `./skills` root, includes all five owned skills and six specialist resources, excludes external implementation trees, and loads the compiled extension from an unrelated directory.
- **SC-002** `[buildable]`: Installer tests prove that receipt/source conflict checks occur without mutation; the exact first mutation after preflight is `pi install npm:thoth-agents@<executing-version> --no-approve`; exact configured/loadable/observed evidence and an atomic ownership-receipt commit precede the four pinned external packages, MCP merge, specialist sync, four external skills, `thoth-mem setup pi`, and last-complete ledger commit; dry-run performs zero mutation; every injected first-party failure prevents downstream calls; and compensation restores the exact receipt-owned prior source or removes a newly added source while preserving the prior receipt.
- **SC-003** `[buildable]`: Native extension tests prove `before_agent_start` contributes exactly `1` bounded adaptive-root contract per turn, `5` skills are package-discovered, and the shared synchronizer produces exactly `6` deterministic attributable specialists with no orchestrator child, no unowned overwrite, and preserved supported model/effort state.
- **SC-004** `[buildable]`: Status, Update, Sync, CLI, and TUI tests distinguish all missing, conflicting, configured, loadable, observed-at-install, unobserved, unavailable, stale, wrong-source, wrong-version, malformed-receipt, project-local, directly installed, partially configured, and last-complete native package states without false receipt/ledger advancement or harness fallback.
- **SC-005** `[buildable]`: Migration tests remove only the legacy attributable root block and exact or receipt-owned duplicate thoth skill copies, preserve unrelated or modified operator content, retain discoverable specialists, and return a manual action for ambiguous ownership.
- **SC-006** `[buildable]`: `check:ci`, typecheck, build, full tests, integration verification, packed distribution verification, generated Codex/Claude comparison, diff review, and changed-file secret scanning pass without unrelated harness regressions.
- **SC-007** `[outcome]`: An isolated real Pi 0.84.4 smoke installs the packed first-party candidate before external packages, lists its exact Pi-canonical global source and resolved absolute package path, loads `1` extension, discovers `5` skills and `6` specialists, and invokes `pi --mode json --no-session --no-approve --offline --no-extensions --extension <installed-dist-pi> --extension <temporary-observer> --provider thoth-observer --model thoth-observer/probe --print <probe-prompt>` with `PI_CODING_AGENT_DIR` set to a disposable directory. For a local packed candidate, the receipt MUST preserve both Pi's configured relative source and the absolute command-safe install source. The temporary credential-free local provider MUST capture the final provider request and prove exactly `1` complete native root marker; failure to reach or capture that request is `unavailable` or failed evidence, never mocked success. External network/credential blockers are recorded separately.

## Assumptions

- The npm package name remains `thoth-agents`; no separate Pi-only package is
  introduced.
- Pi 0.84.4's manifest and extension API are the certified baseline.
- Public installation uses an exact `npm:thoth-agents@<executing-version>`
  source; tests may inject an explicit absolute packed/local install source and
  must accept only the corresponding Pi-canonical configured source plus exact
  resolved absolute package path.
- The native extension owns root injection and thoth-owned package assets; the
  CLI remains the authorized complete setup/update coordinator.
- Direct `pi install` alone may be degraded until external dependencies are
  provisioned and must explain that state.

## Dependencies

- Pi `0.84.4` or a compatible evidenced `0.84.x` release and Node.js `>=22.19`.
- Pi manifest, extension, package-manager, and global resource contracts.
- `pi-subagents-j0k3r@1.5.9`, `@upstash/context7-pi@0.1.2`,
  `@feniix/pi-exa@5.1.1`, and `pi-mcp-adapter@2.32.1`.
- The four canonical external skills and provider-owned `thoth-mem setup pi`.

## Out of scope

- Publishing a second npm package such as `thoth-agents-pi`.
- Reimplementing Pi's package manager, extension loader, delegation runtime,
  task/history store, research tools, or thoth-mem lifecycle.
- Installing dependencies automatically from inside ordinary Pi session hooks.
- Treating `pi list`, extension load, or remote-provider reachability as proof
  of complete CLI-managed setup.
- Rewriting the archived `pi-harness-integration` audit trail.
