# Cli Installation Specification

## Purpose

Durable behavioral contract for `cli-installation`.

## Requirements

### Requirement: Provider setup policy

Published installers MUST invoke `npx -y thoth-mem@latest setup <opencode|codex|claude|pi> --json` after thoth-agents-owned setup and mandatory external skills, adding `--plan` only for dry-run and accepting only internally consistent `complete` evidence. Provider setup is globally scoped by thoth-mem and the consumer MUST NOT pass the rejected `--scope` option. An explicit Pi `--local-package-root` install MUST omit provider setup, record only thoth-agents completion, and direct the operator to install thoth-mem separately from its own local checkout.

#### Scenario: US1 - Install the complete Pi agent pack 1

- **GIVEN** Pi `0.84.4` or a compatible evidenced release, Node.js `>=22.19`, and an empty isolated Pi home
- **WHEN** `thoth-agents install --agent=pi` is applied
- **THEN** the native Pi delegation and research packages, managed grep.app MCP configuration, root instructions, six canonical specialist definitions, owned skills, required external skills, provider setup, and Pi ledger record are completed in order

#### Scenario: US1 - Install the complete Pi agent pack 2

- **GIVEN** the same environment
- **WHEN** the installation is run with `--dry-run`
- **THEN** every intended command and managed target is reported and no Pi package, file, skill, provider, or ledger state is changed

#### Scenario: US1 - Install the complete Pi agent pack 3

- **GIVEN** any mandatory Pi-owned, thoth-agents-owned, external-skill, or provider step fails
- **WHEN** installation finishes
- **THEN** it reports bounded partial-state diagnostics and does not record complete installation

### Requirement: Truthful provider outcome

The installer MUST parse the documented thoth-mem JSON result, accept only internally consistent `complete` evidence as success, and surface diagnostics, manual actions, and receipt information without claiming completion for any other state.

#### Scenario: US1 - Complete harness installation 1

- **GIVEN** any supported harness using its published install source
- **WHEN** its thoth-agents installation reaches provider setup
- **THEN** it invokes the official global thoth-mem setup command after thoth-agents-owned setup and required skills

#### Scenario: US1 - Complete harness installation 2

- **GIVEN** dry-run installation
- **WHEN** provider setup is planned
- **THEN** the thoth-mem command includes `--plan` and performs no provider mutation

#### Scenario: US1 - Complete harness installation 3

- **GIVEN** thoth-mem reports `partial`, `failed`, `requires_user_action`, malformed output, or contradictory exit evidence
- **WHEN** thoth-agents finishes the command
- **THEN** it preserves bounded diagnostics, manual actions, and receipt evidence and does not claim complete installation

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

### Requirement: Activate the applied agents preset

Applying any valid OpenCode model configuration plan MUST persist `preset: agents` and MUST materialize the applied configuration under the real named preset `presets.agents`.

#### Scenario: US1 - Activate applied model assignments 1

- **GIVEN** the managed OpenCode config selects `openai`
- **WHEN** the user applies one edited role
- **THEN** the persisted config selects `agents` and `presets.agents` contains the changed assignment plus every unchanged effective role assignment

#### Scenario: US1 - Activate applied model assignments 2

- **GIVEN** no role is dirty and the TUI sends every displayed role
- **WHEN** the user selects Apply
- **THEN** the same complete `agents` preset is materialized and activated

#### Scenario: US1 - Activate applied model assignments 3

- **GIVEN** the active preset and root overrides each contribute fields to a role
- **WHEN** model configuration is applied
- **THEN** the materialized `agents` preset preserves their field-level effective value before applying the requested model or effort change

### Requirement: Materialize the complete effective roster

Before activation, the system MUST derive all seven effective role configurations from the selected preset, root overrides, and canonical defaults using field-level precedence, apply the requested role changes, and preserve unrelated presets and configuration keys.

#### Scenario: US1 - Activate applied model assignments 1

- **GIVEN** the managed OpenCode config selects `openai`
- **WHEN** the user applies one edited role
- **THEN** the persisted config selects `agents` and `presets.agents` contains the changed assignment plus every unchanged effective role assignment

#### Scenario: US1 - Activate applied model assignments 2

- **GIVEN** no role is dirty and the TUI sends every displayed role
- **WHEN** the user selects Apply
- **THEN** the same complete `agents` preset is materialized and activated

#### Scenario: US1 - Activate applied model assignments 3

- **GIVEN** the active preset and root overrides each contribute fields to a role
- **WHEN** model configuration is applied
- **THEN** the materialized `agents` preset preserves their field-level effective value before applying the requested model or effort change

### Requirement: Recognize the managed agents preset

OpenCode status and model-role readback MUST recognize a complete active `presets.agents` roster as a valid managed configuration and MUST keep subsequent valid model plans eligible to apply.

#### Scenario: US2 - Reapply the activated preset safely 1

- **GIVEN** a complete applied `presets.agents` roster is active
- **WHEN** managed status is evaluated
- **THEN** the roster is recognized without an `opencode-roster-drift` blocker

#### Scenario: US2 - Reapply the activated preset safely 2

- **GIVEN** a complete applied `agents` preset
- **WHEN** model roles are loaded again
- **THEN** the selected preset and permitted root overrides determine the displayed effective values without falling back to `openai`

#### Scenario: US2 - Reapply the activated preset safely 3

- **GIVEN** the first apply completed successfully
- **WHEN** a second valid model plan is built and applied
- **THEN** it remains eligible and preserves the activated `agents` preset

### Requirement: Install owned OpenCode workflow skills globally

The OpenCode installer MUST synchronize the five canonical thoth-owned workflow skill trees from the installed thoth-agents package into `~/.config/opencode/skills/` as a required global installation step.

#### Scenario: US1 - Complete the global OpenCode installation 1

- **GIVEN** a complete published thoth-agents package
- **WHEN** `install --agent=opencode` runs
- **THEN** `thoth-init`, `thoth-sdd`, `thoth-constitution`, `thoth-archive`, and `plan-reviewer` are synchronized under `~/.config/opencode/skills/` before installation can report success

#### Scenario: US1 - Complete the global OpenCode installation 2

- **GIVEN** an existing stale copy of a thoth-owned OpenCode skill
- **WHEN** installation runs again
- **THEN** the global owned copy matches the canonical packaged skill rather than remaining stale

#### Scenario: US1 - Complete the global OpenCode installation 3

- **GIVEN** dry-run installation
- **WHEN** owned skill installation is planned
- **THEN** the destination and five owned skills are reported without writing them

#### Scenario: US1 - Complete the global OpenCode installation 4

- **GIVEN** an incomplete canonical bundle or a failed global skill synchronization
- **WHEN** OpenCode installation runs
- **THEN** the overall installation fails and does not claim provider or combined installation completion

### Requirement: Pin the OpenCode plugin to the executing release

Every OpenCode install or applied update MUST replace all managed thoth-agents plugin entry forms with exactly one `thoth-agents@<executing-package-version>` entry while preserving unrelated plugin entries.

#### Scenario: US1 - Install the exact OpenCode plugin release 1

- **GIVEN** the executing thoth-agents package version is `0.4.8`
- **WHEN** OpenCode installation configures the plugin
- **THEN** the resulting managed entry is exactly `thoth-agents@0.4.8` and is not `thoth-agents@latest`

#### Scenario: US1 - Install the exact OpenCode plugin release 2

- **GIVEN** OpenCode configuration contains a bare, tagged, or differently versioned thoth-agents entry plus unrelated plugins
- **WHEN** installation runs again from version `0.4.8`
- **THEN** every prior thoth-agents entry is replaced by one `thoth-agents@0.4.8` entry and unrelated plugins retain their relative order

#### Scenario: US1 - Install the exact OpenCode plugin release 3

- **GIVEN** the executing package version cannot be resolved as a non-empty valid package version
- **WHEN** installation or update would write the OpenCode plugin entry
- **THEN** the operation fails without substituting `latest` and without partially rewriting the configuration

### Requirement: Make applied Update installation-equivalent

Applying Update for Pi MUST perform the same exact first-party-package-first, external-dependency, migration, provider, and ledger flow as installation; preview MUST include every package, resource, migration, external-skill, provider, and ledger action without mutation.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.84.4`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
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

`install --agent=pi` MUST preflight Node.js and Pi; capture and validate the receipt-owned prior first-party state; install and verify the exact first-party native package before any external package; atomically commit its ownership receipt only after configured, loadable, and observed evidence passes; and compensate a failed replacement by restoring and verifying the prior owned source or removing a new source while leaving the prior receipt unchanged. Only then MAY setup install delegation and research packages, merge the attributable grep.app entry, synchronize only package-owned specialist resources, install mandatory external skills, invoke provider-owned setup for a published install, and record the last-complete Pi ledger after every required in-scope step succeeds. An explicit local package install MUST omit provider setup while keeping the ledger commit. Dry-run MUST describe the complete in-scope order without mutation, and a first-party failure MUST prevent all downstream mutation.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.84.4`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
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

#### Scenario: US4 - Preserve external ownership and existing harnesses 1

- **GIVEN** the native Pi package
- **WHEN** its packed contents are inspected
- **THEN** it contains only thoth-owned extension, agent, prompt, skill, and diagnostic assets and references external runtimes by pinned package source

#### Scenario: US4 - Preserve external ownership and existing harnesses 2

- **GIVEN** OpenCode, Codex, or Claude Code installation and runtime flows
- **WHEN** the Pi package change is present
- **THEN** their current behavior and generated artifacts remain unchanged except for shared truthful documentation

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

- **GIVEN** Pi `0.84.4`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
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

The OpenCode runtime version checker MAY notify about a newer release but MUST NOT rewrite plugin configuration, invalidate package-manager state, or invoke package installation; release changes MUST require an explicit CLI install or Update action.

#### Scenario: US4 - Keep release changes operator-controlled 1

- **GIVEN** OpenCode is running a pinned release and a newer release exists
- **WHEN** the background version check completes
- **THEN** it only notifies the operator and does not rewrite the plugin entry, invalidate cached package state, or run an installation command

#### Scenario: US4 - Keep release changes operator-controlled 2

- **GIVEN** an operator wants the newer release
- **WHEN** they follow CLI guidance or apply Update
- **THEN** the selected harness receives the complete refresh and OpenCode, when selected, is pinned to the CLI release performing that refresh

#### Scenario: US4 - Keep release changes operator-controlled 3

- **GIVEN** installation and update help or documentation
- **WHEN** an operator reads the OpenCode guidance
- **THEN** it explains the exact-version pin and that re-running the latest CLI installer or applying Update is the supported update mechanism

### Requirement: Document the explicit update contract

CLI help, status and operation messaging, and routed public installation guidance SHALL describe exact OpenCode version pinning, the last complete CLI-managed version, native marketplace independence, and the complete CLI-driven update path consistently.

#### Scenario: US4 - Keep release changes operator-controlled 1

- **GIVEN** OpenCode is running a pinned release and a newer release exists
- **WHEN** the background version check completes
- **THEN** it only notifies the operator and does not rewrite the plugin entry, invalidate cached package state, or run an installation command

#### Scenario: US4 - Keep release changes operator-controlled 2

- **GIVEN** an operator wants the newer release
- **WHEN** they follow CLI guidance or apply Update
- **THEN** the selected harness receives the complete refresh and OpenCode, when selected, is pinned to the CLI release performing that refresh

#### Scenario: US4 - Keep release changes operator-controlled 3

- **GIVEN** installation and update help or documentation
- **WHEN** an operator reads the OpenCode guidance
- **THEN** it explains the exact-version pin and that re-running the latest CLI installer or applying Update is the supported update mechanism

### Requirement: Expose truthful Pi operations

CLI and TUI status, install, Update, Sync, and specialist model/effort operations MUST target the native first-party Pi package and its attributable definitions, MUST surface exact source/version and extension/resource evidence, and MUST report unavailable or conflicting actions explicitly rather than falling through to another harness.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.84.4`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
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

Complete Pi setup MUST install and verify pinned Context7, pi-web-access, and the grep-only pi-mcp-adapter. Context7 and web research MUST remain native extensions; the managed global grep entry MUST retain https://mcp.grep.app, legacy protocol, lazy lifecycle, and proxy-only tools. Unrelated MCP configuration and operator credentials MUST remain untouched. Status MUST distinguish Context7, web access, and grep evidence independently, MUST NOT require EXA_API_KEY merely for web package availability, and MUST NOT infer live provider success from package presence.

#### Scenario: US1 - Install one web extension 1

- **GIVEN** valid first-party setup
- **WHEN** Install or applied Update runs
- **THEN** the exact selected pi-web-access pin is required and neither replaced package is requested

#### Scenario: US1 - Install one web extension 2

- **GIVEN** a web package failure or dry-run
- **WHEN** setup executes
- **THEN** failure prevents completion recording and dry-run writes nothing

#### Scenario: US1 - Install one web extension 3

- **GIVEN** a configured alternative web provider without EXA_API_KEY
- **WHEN** status runs
- **THEN** it does not declare missing Exa credentials and distinguishes installed evidence from unobserved live availability

#### Scenario: US1 - Install one web extension 4

- **GIVEN** an installation containing the replaced web package
- **WHEN** the operator follows the documented transition
- **THEN** native Pi removal of the conflicting package precedes installation; unrelated packages and credentials are preserved

### Requirement: Install pinned Pi interaction and web extensions

Complete Pi installation and applied Update MUST install and individually verify the selected exact pi-web-access version plus @juicesharp/rpiv-ask-user-question@2.9.0 and @juicesharp/rpiv-todo@2.9.0 after first-party verification. Neither @juicesharp/rpiv-web-tools nor @feniix/pi-exa MUST be required or installed by the selected dependency inventory. Dry-run MUST remain mutation-free; required dependency failure MUST prevent completion recording; external implementations MUST NOT be vendored.

#### Scenario: US1 - Install one web extension 1

- **GIVEN** valid first-party setup
- **WHEN** Install or applied Update runs
- **THEN** the exact selected pi-web-access pin is required and neither replaced package is requested

#### Scenario: US1 - Install one web extension 2

- **GIVEN** a web package failure or dry-run
- **WHEN** setup executes
- **THEN** failure prevents completion recording and dry-run writes nothing

#### Scenario: US1 - Install one web extension 3

- **GIVEN** a configured alternative web provider without EXA_API_KEY
- **WHEN** status runs
- **THEN** it does not declare missing Exa credentials and distinguishes installed evidence from unobserved live availability

#### Scenario: US1 - Install one web extension 4

- **GIVEN** an installation containing the replaced web package
- **WHEN** the operator follows the documented transition
- **THEN** native Pi removal of the conflicting package precedes installation; unrelated packages and credentials are preserved
