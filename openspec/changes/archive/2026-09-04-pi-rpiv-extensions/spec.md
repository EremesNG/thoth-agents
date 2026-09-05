# Feature Specification: Pi interaction and web extensions

**Change ID**: `pi-rpiv-extensions`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Give Pi interactive user questions, visible task progress, and general web tools through the three extensions requested by the user.<br>
**Impact**: Complete Pi Install/Update adds three exact native package pins; generated prompts and role tool lists use their actual contracts. Existing delegation, research providers, model overrides, namespace, and other harnesses remain intact.<br>
**Affected capabilities**: `cli-installation`, `multi-harness-agent-pack`

## User stories

### US1 - Install the additional Pi extensions (Priority: P1)

As an operator, I receive the three extensions in complete Pi setup.
**Independent test**: Plan/apply/status tests with an isolated filesystem and injected package executor.
**Covers**: FR-001, FR-005, SC-001
**Acceptance scenarios**:
1. **Given** a valid first-party installation, **When** complete Install or Update runs, **Then** all three versioned packages are installed and individually verified before completion.
2. **Given** dry-run or a failed new dependency, **When** setup runs, **Then** dry-run writes nothing and a dependency failure cannot advance the completion ledger.
3. **Given** a missing or mismatched dependency, **When** status runs, **Then** the affected package is reported without claiming live tool availability.

### US2 - Ask the user and show progress (Priority: P1)

As a Pi user, I can answer material questions interactively and see a task list maintained by the root.
**Independent test**: Rendered root and child contracts name the real tools and enforce root ownership.
**Covers**: FR-002, FR-003, SC-002, SC-004, SC-005
**Acceptance scenarios**:
1. **Given** a compatible interactive host and a material choice, **When** the root asks, **Then** it uses ask_user_question with a supported question/options payload.
2. **Given** cancellation, partial answers, missing tool, or no UI, **When** an answer is required, **Then** the root reports the unresolved choice without inventing consent; explicit cancellation is not an answerless route-default attempt.
3. **Given** multi-step work, **When** the root reports progress, **Then** it uses session-local todo without replacing native task execution or canonical OpenSpec artifacts.
4. **Given** a child needs user input or has progress, **When** it reports to the root, **Then** it escalates through its return contract rather than opening user dialogs or editing the root task list.

### US3 - Use complementary general web tools (Priority: P2)

As the root or research specialist, I can search and fetch web material using the installed provider-owned extension.
**Independent test**: Generated tool allowlist and guidance cover web_search/web_fetch, prerequisites, and failure semantics.
**Covers**: FR-004, FR-005, SC-003, SC-004, SC-005
**Acceptance scenarios**:
1. **Given** a configured search provider, **When** the root or librarian needs external evidence, **Then** it can use web_search and web_fetch with exact upstream names.
2. **Given** no configured provider or a fetch/search error, **When** evidence is requested, **Then** the root reports the limitation and does not claim a successful lookup.
3. **Given** existing Context7, Exa, and grep configuration, **When** new tools are installed, **Then** those providers and unrelated user configuration remain unchanged.

## Edge cases

- Noninteractive hosts remove ask_user_question; cancellation and skipped questions are unresolved.
- Todo state belongs to one Pi session and is not shared child coordination state.
- Package presence does not prove UI support or successful remote requests.
- Web search requires provider configuration; some fetch paths work without credentials.
- Extension tool filtering is not an OS sandbox. Web result content remains untrusted.
- Existing model/effort overrides and thoth-* specialist identities survive regeneration/sync.

## Functional requirements

- **FR-001 — Install pinned Pi interaction and web extensions**: `[ADDED cli-installation]` Complete Pi installation and applied Update MUST install and individually verify @juicesharp/rpiv-ask-user-question@2.9.0, @juicesharp/rpiv-todo@2.9.0, and @juicesharp/rpiv-web-tools@2.9.0 as required native Pi packages after first-party verification; dry-run MUST remain mutation-free and any required dependency failure MUST prevent completion recording. These packages MUST remain external and not be vendored.
- **FR-002 — Use Pi interactive questions truthfully**: `[ADDED multi-harness-agent-pack]` Pi root instructions MUST use ask_user_question for material user choices, follow its supported question schema, handle unavailable UI and partial/cancelled answers truthfully, and MUST NOT infer approval from cancellation or absent answers. Pi children MUST escalate user questions to the root and MUST NOT receive the interactive question tool in their allowlists.
- **FR-003 — Keep Pi progress session-owned**: `[ADDED multi-harness-agent-pack]` Pi root instructions MUST use todo for useful multi-step progress, with the extension owning session-local task state. Todo MUST NOT replace Pi-native delegation lifecycle or OpenSpec artifacts; child agents MUST report progress to root and MUST NOT receive todo in their allowlists.
- **FR-004 — Expose complementary Pi web tools**: `[ADDED multi-harness-agent-pack]` Pi root and librarian guidance MUST expose web_search and web_fetch with their exact upstream names and acknowledge provider, credential, network, and output limitations. The librarian allowlist MUST include both; other specialist allowlists MUST remain unchanged. Existing Context7, Exa, and grep integration MUST be preserved, and thoth-agents MUST NOT configure credentials or duplicate provider implementation.
- **FR-005 — Document and diagnose added capabilities**: `[INTERNAL]` Operator documentation and existing package status MUST identify the added dependencies and explain UI, session-local progress, web provider requirements, and the difference between installed package evidence and observed operation.

## Success criteria

- **SC-001** `[buildable]`: 100% of Install/Update/dry-run/status checks pass and prove all three exact pins, source checks, partial failure, and unchanged ledger guarantees.
- **SC-002** `[buildable]`: 100% of root and all six child prompt/allowlist tests prove correct question/progress names, root ownership, and cancellation/unavailable handling.
- **SC-003** `[buildable]`: Exactly 2 new generated librarian tools include web_search/web_fetch alongside current research tools; all other roles preserve their previous web boundary.
- **SC-004** `[buildable]`: 100% of relevant tests, formatting, types, build, and generated artifact checks pass with no changes to other harness behavior.
- **SC-005** `[outcome]`: All 3 capabilities (answering a question, seeing task progress, and web research) on a configured Pi host receive observed PASS evidence or an explicit residual RISK.

## Assumptions

- User requested additive dependencies, not replacement of existing research providers.
- Root owns interaction/progress; external research belongs primarily to librarian.
- Version 2.9.0 for each package was verified in preflight registry metadata and exact shipped source on 2026-09-04.
- Semantic-overlap review: the new durable requirements add concrete interaction/progress/general-web contracts absent from existing canonical requirements. Existing complete-setup and hybrid-research requirements remain applicable unchanged.

## Dependencies

- Existing Pi 0.84.4+ / Node 22.19+ environment and native installer contracts.
- Frozen package contracts and source locations in research.md; no network fetching during SDD.
- Installed tdd/simplify skills and fresh Oracle final verification.

## Out of scope

- Installing into the operator's actual Pi home, entering credentials, changing provider selection, or publishing/committing.
- Implementing extension UI, a task scheduler, shared todo persistence, or web provider clients.
- Replacing the existing research stack or changing other harnesses.
