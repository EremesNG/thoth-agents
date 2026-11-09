# Cli Installation Specification

## Purpose

Durable behavioral contract for `cli-installation`.

## Requirements

### Requirement: Provider setup policy

Published installers MUST invoke `npx -y thoth-mem@>=0.7.0 setup <opencode|codex|claude|pi> --json`, passing the package spec as one literal argument that no shell interprets as redirection, after thoth-agents-owned setup and mandatory external skills, adding `--plan` only for dry-run, and MUST NOT substitute `@latest` or pass the rejected `--scope` option; provider setup is globally scoped by thoth-mem. An explicit Pi `--local-package-root` install MUST omit provider setup, record only thoth-agents completion, and direct the operator to install thoth-mem separately from its own local checkout.

#### Scenario: Provider setup policy

- **GIVEN** any supported harness using its published install source
- **WHEN** its installation reaches provider setup
- **THEN** it runs `npx -y thoth-mem@>=0.7.0 setup <harness> --json` with the spec as one literal argument, with `--plan` only for dry-run, after thoth-agents-owned setup and required skills

### Requirement: Truthful provider outcome

The installer MUST parse thoth-mem's per-host setup JSON and exit code, accept as success only exit 0 with a well-formed result whose status is `planned` for dry-run or `complete` when applied and whose reported host matches the requested harness, treat `unsupported`, `requires-user-action`, a thrown setup failure, invalid options, malformed output and status/exit or host contradictions as unsuccessful, and surface the provider's actions, warnings, diagnostics, receipt path and restart requirement without claiming completion for any other state.

#### Scenario: Truthful provider outcome

- **GIVEN** thoth-mem reports `requires-user-action` with exit 1, exits 1 with only a stderr failure, or prints malformed output
- **WHEN** thoth-agents finishes the command
- **THEN** it reports the bounded provider diagnostics, actions, warnings and receipt path and does not record complete installation

### Requirement: Public operator guidance

README, CLI help/status, and routed installation documentation MUST distinguish the native `thoth-agents` package from its external dependencies, show the exact first-party-first order, explain direct-package degraded behavior, package/global ownership, migration, dry-run/Update/Sync, custom-directory limitations, provider setup, credentials/network, security, and partial-install recovery.

#### Scenario: US3 - Update, migrate, and diagnose native package state 1

- **GIVEN** a legacy complete Pi setup from the prior release
- **WHEN** Update succeeds
- **THEN** the exact native package is installed, the attributable legacy root block and duplicate owned-skill copies are removed, specialist discovery is preserved, and unrelated operator content is unchanged

#### Scenario: US3 - Update, migrate, and diagnose native package state 2

- **GIVEN** any installed first-party or external package/source/version, resource, provider, or remote-state mismatch
- **WHEN** status is requested
- **THEN** each layer is reported independently without advancing or inferring the last-complete ledger

#### Scenario: US3 - Update, migrate, and diagnose native package state 3

- **GIVEN** native package state is incomplete or conflicting
- **WHEN** Sync or Update is planned
- **THEN** it returns a bounded repair or manual action and never falls through to another harness

#### Scenario: US4 - Preserve external ownership and existing harnesses 1

- **GIVEN** the native Pi package
- **WHEN** its packed contents are inspected
- **THEN** it contains only thoth-owned extension, agent, prompt, skill, and diagnostic assets and references external runtimes by pinned package source

#### Scenario: US4 - Preserve external ownership and existing harnesses 2

- **GIVEN** OpenCode, Codex, or Claude Code installation and runtime flows
- **WHEN** the Pi package change is present
- **THEN** their current behavior and generated artifacts remain unchanged except for shared truthful documentation

### Requirement: Activate the applied agents profile

Applying any valid OpenCode model configuration plan MUST materialize a complete `agents` profile in the global profiles file containing the changed assignment plus every unchanged effective role assignment, and MUST make it the global active profile.

#### Scenario: Activate the applied agents profile

- **GIVEN** the global active profile is `openai`
- **WHEN** the user applies one edited role
- **THEN** the global profiles file activates `agents` and its `agents` profile contains the change plus every unchanged effective role

### Requirement: Materialize the complete effective roster

Before activation, the system MUST derive all six effective role configurations from the active profile, root configuration, and canonical defaults using field-level precedence, apply the requested role changes, and preserve unrelated profiles and configuration keys; applying with no dirty role MUST still materialize and activate the same complete `agents` profile.

#### Scenario: Materialize the complete effective roster

- **GIVEN** no role is dirty and the TUI sends every displayed role
- **WHEN** the user selects Apply
- **THEN** the same complete `agents` profile is materialized and activated

### Requirement: Recognize the managed agents profile

OpenCode status and model-role readback MUST recognize a complete active `agents` profile as a valid managed configuration and MUST keep subsequent valid model plans eligible to apply. Managed status MUST recognize a complete applied `agents` profile as the active roster without an `opencode-roster-drift` blocker, reload MUST display the active profile's effective values without falling back to `openai`, and a second apply MUST remain eligible and preserve the activated profile.

#### Scenario: Recognize the managed agents profile

- **GIVEN** a complete applied `agents` profile is globally active
- **WHEN** managed status is evaluated
- **THEN** the roster is recognized without an `opencode-roster-drift` blocker

### Requirement: Provide owned OpenCode workflow skills from the plugin package

The OpenCode plugin MUST register the five canonical thoth-owned workflow skills from its installed package through the OpenCode skill domain; the OpenCode installer MUST NOT copy them into or delete anything from the OpenCode skills directory, and when legacy same-name copies exist there it MUST move them, only after explicit operator confirmation, into a new no-clobber backup below a hidden (dot-prefixed) directory segment that host skill scanning does not traverse, otherwise (including when a move fails) leaving them untouched with a warning that they shadow the packaged skills.

#### Scenario: Provide owned OpenCode workflow skills from the plugin package

- **GIVEN** a complete installed thoth-agents package and a stale `thoth-sdd` copy under `~/.config/opencode/skills/`
- **WHEN** `install --agent=opencode` runs and the operator confirms the move
- **THEN** the copy is moved unchanged into the backup directory and OpenCode 2.2.6 lists all five owned skills once with paths inside the installed package

### Requirement: Pin the OpenCode plugin to the executing release

Every OpenCode install or applied update MUST replace all managed thoth-agents plugin entry forms in both the `plugins` and legacy `plugin` keys with exactly one `thoth-agents@<executing-package-version>` entry under `plugins` while preserving unrelated plugin entries and their relative order, and MUST fail without substituting `latest` or partially rewriting configuration when the executing version cannot be resolved.

#### Scenario: Pin the OpenCode plugin to the executing release

- **GIVEN** OpenCode configuration with a bare, tagged or differently versioned thoth-agents entry under `plugin` or `plugins` plus unrelated plugins
- **WHEN** installation runs from version `0.4.8`
- **THEN** `plugins` contains exactly one `thoth-agents@0.4.8` entry, no thoth-agents entry remains under `plugin`, and unrelated plugins keep their relative order

### Requirement: Make applied Update installation-equivalent

Applying Update for Pi MUST perform the same exact first-party-package-first, external-dependency, migration, provider, and ledger flow as installation; preview MUST include every package, resource, migration, external-skill, provider, and ledger action without mutation.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.86.1`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
- **WHEN** Pi installation is applied
- **THEN** `pi install npm:thoth-agents@<exact-version> --no-approve` completes and is verified before delegation, research, skills, provider, or ledger steps

#### Scenario: US1 - Install thoth-agents as the first native Pi package 2

- **GIVEN** the same environment
- **WHEN** installation is previewed
- **THEN** the first-party and external package commands plus every migration and setup target are reported with zero mutation

#### Scenario: US1 - Install thoth-agents as the first native Pi package 3

- **GIVEN** first-party package installation or verification fails
- **WHEN** setup exits
- **THEN** no external dependency is installed and no complete ledger record is written

#### Scenario: US1 - Install thoth-agents as the first native Pi package 4

- **GIVEN** an existing global `thoth-agents` Pi source
- **WHEN** no valid thoth-agents ownership receipt matches that exact source
- **THEN** setup reports an unowned conflict before invoking any mutating Pi command

#### Scenario: US1 - Install thoth-agents as the first native Pi package 5

- **GIVEN** a receipt-owned prior source
- **WHEN** replacement, native-load observation, or receipt commit fails
- **THEN** setup restores and verifies the prior source, leaves the prior receipt authoritative, and blocks every downstream dependency; a failed compensation is reported explicitly

#### Scenario: US3 - Update, migrate, and diagnose native package state 1

- **GIVEN** a legacy complete Pi setup from the prior release
- **WHEN** Update succeeds
- **THEN** the exact native package is installed, the attributable legacy root block and duplicate owned-skill copies are removed, specialist discovery is preserved, and unrelated operator content is unchanged

#### Scenario: US3 - Update, migrate, and diagnose native package state 2

- **GIVEN** any installed first-party or external package/source/version, resource, provider, or remote-state mismatch
- **WHEN** status is requested
- **THEN** each layer is reported independently without advancing or inferring the last-complete ledger

#### Scenario: US3 - Update, migrate, and diagnose native package state 3

- **GIVEN** native package state is incomplete or conflicting
- **WHEN** Sync or Update is planned
- **THEN** it returns a bounded repair or manual action and never falls through to another harness

### Requirement: Preserve complete per-harness setup

`install --agent=pi` MUST preflight Node.js and Pi; capture and validate the receipt-owned prior first-party state; install and verify the exact first-party native package before any external package; atomically commit its ownership receipt only after configured, loadable, and observed evidence passes; and compensate a failed replacement by restoring and verifying the prior owned source or removing a new source while leaving the prior receipt unchanged. Only then MAY setup install the adopted delegation runtime and research packages, merge the attributable grep.app entry, synchronize only package-owned specialist resources, install mandatory external skills, invoke provider-owned setup for a published install, and record the last-complete Pi ledger after every required in-scope step succeeds. An explicit local package install MUST omit provider setup while keeping the ledger commit. Dry-run MUST describe the complete in-scope order without mutation, and a first-party failure MUST prevent all downstream mutation. Delegation inspection MUST validate manifest/version and actual selected source for published npm and explicit local-root installations; local setup MUST not silently fall back to npm. Incompatible incumbent runtimes MUST be diagnosed before mutation with bounded manual native recovery, preserving operator assets.

#### Scenario: Preserve complete per-harness setup

- **GIVEN** an explicit valid local runtime root
- **WHEN** installation or status inspects Pi
- **THEN** the local source is verified consistently and invalid identity fails with an actionable diagnostic

### Requirement: Record the last complete CLI-managed version

The CLI MUST maintain an independent Pi ledger entry alongside OpenCode, Codex, and Claude and MUST advance it only after every Pi installation or update step succeeds.

#### Scenario: US3 - Operate and diagnose Pi safely 1

- **GIVEN** a healthy complete Pi installation
- **WHEN** status is requested
- **THEN** it reports Pi, Node, delegation package, root/agent resources, skills, provider evidence, and the CLI-managed version without consulting another harness adapter

#### Scenario: US3 - Operate and diagnose Pi safely 2

- **GIVEN** a stale or incomplete Pi installation
- **WHEN** Update is applied
- **THEN** it performs the same complete ordered refresh as installation and advances the Pi ledger only after every required step succeeds

#### Scenario: US3 - Operate and diagnose Pi safely 3

- **GIVEN** Pi cannot safely support a requested model, continuation, steering, permission, or custom-directory operation
- **WHEN** the operation is planned or executed
- **THEN** it reports unsupported, conditional, or degraded status and a safe manual action instead of claiming parity

### Requirement: Treat the CLI ledger as authoritative for managed setup

One dedicated Pi-package receipt MUST be authoritative only for first-party source ownership, exact version, and verified manifest/extension digests, while the existing install ledger remains authoritative only for the last complete harness setup. Pi status and update decisions MUST report executing, recorded, receipt, configured, loadable, observed-at-install, external-package, managed-resource, MCP, and provider drift independently, and MUST NOT infer or advance complete setup from ownership, package presence, extension execution, remote reachability, or native resources alone.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.86.1`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
- **WHEN** Pi installation is applied
- **THEN** `pi install npm:thoth-agents@<exact-version> --no-approve` completes and is verified before delegation, research, skills, provider, or ledger steps

#### Scenario: US1 - Install thoth-agents as the first native Pi package 2

- **GIVEN** the same environment
- **WHEN** installation is previewed
- **THEN** the first-party and external package commands plus every migration and setup target are reported with zero mutation

#### Scenario: US1 - Install thoth-agents as the first native Pi package 3

- **GIVEN** first-party package installation or verification fails
- **WHEN** setup exits
- **THEN** no external dependency is installed and no complete ledger record is written

#### Scenario: US1 - Install thoth-agents as the first native Pi package 4

- **GIVEN** an existing global `thoth-agents` Pi source
- **WHEN** no valid thoth-agents ownership receipt matches that exact source
- **THEN** setup reports an unowned conflict before invoking any mutating Pi command

#### Scenario: US1 - Install thoth-agents as the first native Pi package 5

- **GIVEN** a receipt-owned prior source
- **WHEN** replacement, native-load observation, or receipt commit fails
- **THEN** setup restores and verifies the prior source, leaves the prior receipt authoritative, and blocks every downstream dependency; a failed compensation is reported explicitly

#### Scenario: US3 - Update, migrate, and diagnose native package state 1

- **GIVEN** a legacy complete Pi setup from the prior release
- **WHEN** Update succeeds
- **THEN** the exact native package is installed, the attributable legacy root block and duplicate owned-skill copies are removed, specialist discovery is preserved, and unrelated operator content is unchanged

#### Scenario: US3 - Update, migrate, and diagnose native package state 2

- **GIVEN** any installed first-party or external package/source/version, resource, provider, or remote-state mismatch
- **WHEN** status is requested
- **THEN** each layer is reported independently without advancing or inferring the last-complete ledger

#### Scenario: US3 - Update, migrate, and diagnose native package state 3

- **GIVEN** native package state is incomplete or conflicting
- **WHEN** Sync or Update is planned
- **THEN** it returns a bounded repair or manual action and never falls through to another harness

### Requirement: Prohibit runtime self-update mutation

The OpenCode plugin MUST NOT run a runtime version checker, rewrite plugin configuration, invalidate package-manager state or invoke package installation; release changes MUST require an explicit CLI install or Update action.

#### Scenario: Prohibit runtime self-update mutation

- **GIVEN** OpenCode is running a pinned release and a newer release exists
- **WHEN** the plugin runs
- **THEN** it performs no version check, notification, configuration rewrite or installation, and the operator updates through the CLI

### Requirement: Document the explicit update contract

CLI help, status and operation messaging, and routed public installation guidance SHALL describe exact OpenCode version pinning, the minimum OpenCode host version, the last complete CLI-managed version, native marketplace independence, and the complete CLI-driven update path consistently.

#### Scenario: Document the explicit update contract

- **GIVEN** installation and update help or documentation
- **WHEN** an operator reads the OpenCode guidance
- **THEN** it explains the exact-version pin, the OpenCode 2.2.6 minimum and that re-running the latest CLI installer or applying Update is the supported update mechanism

### Requirement: Expose truthful Pi operations

CLI and TUI status, install, Update, Sync, and specialist model/effort operations MUST target the native first-party Pi package and its attributable definitions, MUST surface exact source/version and extension/resource evidence, and MUST report unavailable or conflicting actions explicitly rather than falling through to another harness.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.86.1`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
- **WHEN** Pi installation is applied
- **THEN** `pi install npm:thoth-agents@<exact-version> --no-approve` completes and is verified before delegation, research, skills, provider, or ledger steps

#### Scenario: US1 - Install thoth-agents as the first native Pi package 2

- **GIVEN** the same environment
- **WHEN** installation is previewed
- **THEN** the first-party and external package commands plus every migration and setup target are reported with zero mutation

#### Scenario: US1 - Install thoth-agents as the first native Pi package 3

- **GIVEN** first-party package installation or verification fails
- **WHEN** setup exits
- **THEN** no external dependency is installed and no complete ledger record is written

#### Scenario: US1 - Install thoth-agents as the first native Pi package 4

- **GIVEN** an existing global `thoth-agents` Pi source
- **WHEN** no valid thoth-agents ownership receipt matches that exact source
- **THEN** setup reports an unowned conflict before invoking any mutating Pi command

#### Scenario: US1 - Install thoth-agents as the first native Pi package 5

- **GIVEN** a receipt-owned prior source
- **WHEN** replacement, native-load observation, or receipt commit fails
- **THEN** setup restores and verifies the prior source, leaves the prior receipt authoritative, and blocks every downstream dependency; a failed compensation is reported explicitly

#### Scenario: US1 - Install thoth-agents from a local package root

- **GIVEN** a built local thoth-agents package whose normalized absolute root matches the executing package identity and version
- **WHEN** `thoth-agents install --agent=pi --local-package-root <root>` is applied
- **THEN** `pi install <root> --no-approve` replaces only the public first-party source, is receipt-verified through Pi's canonical source and exact resolved path, completes the downstream package, skill, and ledger flow, omits thoth-mem setup, and prints the separate local provider-install command

#### Scenario: US3 - Update, migrate, and diagnose native package state 1

- **GIVEN** a legacy complete Pi setup from the prior release
- **WHEN** Update succeeds
- **THEN** the exact native package is installed, the attributable legacy root block and duplicate owned-skill copies are removed, specialist discovery is preserved, and unrelated operator content is unchanged

#### Scenario: US3 - Update, migrate, and diagnose native package state 2

- **GIVEN** any installed first-party or external package/source/version, resource, provider, or remote-state mismatch
- **WHEN** status is requested
- **THEN** each layer is reported independently without advancing or inferring the last-complete ledger

#### Scenario: US3 - Update, migrate, and diagnose native package state 3

- **GIVEN** native package state is incomplete or conflicting
- **WHEN** Sync or Update is planned
- **THEN** it returns a bounded repair or manual action and never falls through to another harness

### Requirement: Provide a bounded hybrid research stack

Complete Pi setup MUST install and verify pinned pi-web-access and pi-mcp-adapter. Web research MUST remain a native extension; the managed global grep entry MUST retain https://mcp.grep.app, legacy protocol, lazy lifecycle, and proxy-only tools, and the managed global context7 entry MUST use https://mcp.context7.com/mcp, auto protocol, lazy lifecycle, proxy-only tools and an optional `CONTEXT7_API_KEY` header read from the environment. Unrelated MCP configuration and operator credentials MUST remain untouched. Status MUST distinguish Context7, web access, and grep evidence independently, MUST NOT require EXA_API_KEY merely for web package availability, and MUST NOT infer live provider success from package or entry presence.

#### Scenario: Provide a bounded hybrid research stack

- **GIVEN** a global MCP config with an unrelated server
- **WHEN** complete Pi setup runs
- **THEN** context7 and grep entries are written, the unrelated server is unchanged and no Context7 extension package is requested

### Requirement: Install selected Pi interaction and web extensions

Complete Pi installation and applied Update MUST install and individually verify the selected Pi-native delegation, web-access and grep-adapter packages after first-party verification, using their configured minimum versions; the interactive question tool MUST come from the first-party `@thoth-agents/pi-questions-user` package, which MUST likewise be installed and individually verified at its configured minimum version after root-package verification. The juicesharp rpiv task-list, web-tools and question packages, `@feniix/pi-exa` and `@upstash/context7-pi` MUST NOT be required or installed by the selected inventory, and a user-scope installed juicesharp rpiv question package or `@upstash/context7-pi` MUST be removed natively before installation, while a project-scope one MUST block completion with explicit manual removal guidance instead of granting project trust. Dry-run MUST remain mutation-free; required dependency failure MUST prevent completion recording; external implementations MUST NOT be vendored.

#### Scenario: Install selected Pi interaction and web extensions

- **GIVEN** an existing complete install with user-scope `@upstash/context7-pi`
- **WHEN** applied Update runs
- **THEN** the package is removed natively, context7 is reachable as a managed MCP entry and dry-run only reports the planned removal

### Requirement: Pi minimum version floor

The Pi installer MUST reject a detected Pi older than `1.5.0` with a diagnostic naming the `>=1.5.0` requirement before changing any Pi state, and MUST accept Pi `1.5.0` and newer. This floor supersedes every Pi version named in a retained canonical scenario precondition of any capability (including Pi `0.86.1` and `0.99.0` in `cli-installation`, `external-required-skills`, `multi-harness-agent-pack` and `project-tooling`): such a precondition MUST be read as a supported Pi `>=1.5.0`, and the scenario's other assertions remain in force.

#### Scenario: Pi minimum version floor

- **GIVEN** a Pi installation reporting version 1.4.x
- **WHEN** the user runs the Pi install
- **THEN** it fails with the `Pi >=1.5.0` diagnostic without changing Pi state, while a Pi reporting 1.5.0 or 1.6.0 proceeds

### Requirement: Install the first-party Pi task-list extension

Complete Pi installation and applied Update MUST install and individually verify the Thoth Pi task-list package at its configured minimum version as an additional selected Pi package, and preflight MUST reject an installed juicesharp rpiv task-list package before changing any Pi state with a diagnostic containing the native `pi remove` command for that package; the installer MUST NOT remove it automatically. This requirement extends the selected inventory of "Install selected Pi interaction and web extensions"; its prohibition on installing the juicesharp rpiv task-list package remains in force.

#### Scenario: Install the first-party Pi task-list extension

- **GIVEN** a Pi installation containing the juicesharp rpiv task-list package
- **WHEN** the operator runs Install
- **THEN** preflight fails with its `pi remove` instruction and no Pi state changes, while an installation without it receives and verifies the Thoth Pi task-list package

### Requirement: Install the first-party Pi theme and background-tasks extensions

Complete Pi installation and applied Update MUST install and individually verify `@thoth-agents/pi-thoth-theme` and `@thoth-agents/pi-background-tasks` at their configured minimum versions as additional selected Pi packages after root-package verification; an existing copy of either at or above the minimum from any source MUST be preserved and verified without reinstalling, a copy below the minimum MUST be left untouched and block completion with manual upgrade guidance, and an ambiguous source MUST fail closed; dry-run MUST remain mutation-free. This requirement extends the selected inventory of "Install selected Pi interaction and web extensions" without changing its other guarantees.

#### Scenario: Install the first-party Pi theme and background-tasks extensions

- **GIVEN** a Pi profile with a user-installed pi-thoth-theme at the minimum version and no pi-background-tasks
- **WHEN** Install or applied Update runs
- **THEN** the theme copy is preserved and verified, pi-background-tasks is installed and verified, and a dry-run performs no mutation

### Requirement: Install the first-party Pi sidebar extension

Complete Pi installation and applied Update MUST install and individually verify `@thoth-agents/pi-sidebar` at its configured minimum version as an additional selected Pi package, preserving and verifying an existing copy at or above the minimum from any source, blocking with manual upgrade guidance below it and failing closed on ambiguous identity; dry-run MUST remain mutation-free.

#### Scenario: Install the first-party Pi sidebar extension

- **GIVEN** a Pi profile without the sidebar
- **WHEN** Install runs
- **THEN** `@thoth-agents/pi-sidebar` is installed and verified, and a dry-run performs no mutation

### Requirement: Consent-gated Codex hook trust and capacity

Codex install and update MUST write `agents.max_concurrent_threads_per_session` while recording its prior value, and MUST write Codex `hooks.state` trust entries for thoth-agents plugin hooks only after explicit operator consent through interactive confirmation or `--trust-hooks`; without consent no trust entry is written and the operator is directed to Codex's native hook review; dry-run reports both without mutation.

#### Scenario: Consent-gated Codex hook trust and capacity

- **GIVEN** a Codex install without `--trust-hooks` in a non-interactive run
- **WHEN** it completes
- **THEN** `config.toml` contains the threads key but no thoth-agents `hooks.state` entry and the output names the hook review step

### Requirement: Codex uninstall and doctor

The CLI MUST provide Codex `uninstall`, removing only attributable thoth-agents surfaces (fingerprinted agent TOMLs, managed state, legacy root block, owned hook trust entries, the threads key restored to its prior value) and the plugin through the native manager while preserving unrelated content, and Codex `doctor`, reporting plugin, hook trust, Node availability, TOML drift, capacity setting and legacy root-block state with actionable remediation and no mutation.

#### Scenario: Codex uninstall and doctor

- **GIVEN** an operator-edited agent TOML and an unrelated hook trust entry
- **WHEN** `uninstall --agent=codex` runs
- **THEN** the edited TOML and the unrelated entry are preserved and reported, and every unmodified thoth-owned surface is removed

### Requirement: Require OpenCode 2.2.6 or later

OpenCode installation and update MUST parse the detected host version and MUST fail before writing any configuration when OpenCode is missing, unparseable, a prerelease or older than 2.2.6.

#### Scenario: Require OpenCode 2.2.6 or later

- **GIVEN** an OpenCode host reporting version 2.2.5
- **WHEN** `install --agent=opencode` runs
- **THEN** it fails with a message requiring OpenCode 2.2.6 or later and writes no configuration
