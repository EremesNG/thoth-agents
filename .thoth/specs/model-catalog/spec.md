# Spec: Model Catalog

## Requirements

### Requirement: Dynamic effort discovery

The model catalog MUST derive the available reasoning-effort options for dynamically discovered models from `models.dev` metadata, and MUST NOT hard-code a universal effort list for those models.

#### Scenario: Dynamic metadata supplies effort options

- **GIVEN** `models.dev` returns valid metadata for a model with one or more supported effort options
- **WHEN** the catalog normalizes that model
- **THEN** the catalog MUST expose exactly the supported effort options represented by the validated metadata

#### Scenario: Dynamic metadata omits effort options

- **GIVEN** `models.dev` returns valid metadata for a model without supported effort information
- **WHEN** the catalog normalizes that model
- **THEN** the catalog MUST expose the model without inventing effort options

### Requirement: Conditional refresh and resilient fallback

The catalog refresh flow MUST use ETag-based conditional requests when an ETag is available, MUST retain only validated responses as the LKG catalog, and MUST fall back in order to the validated LKG catalog and then the manual catalog when dynamic refresh cannot produce a valid catalog.

#### Scenario: Remote catalog is unchanged

- **GIVEN** a validated LKG catalog and its ETag are available
- **WHEN** `models.dev` responds that the resource has not changed
- **THEN** the refresh flow MUST reuse the validated LKG catalog without replacing it

#### Scenario: Remote catalog changes validly

- **GIVEN** an existing LKG catalog may or may not be available
- **WHEN** `models.dev` returns a changed response that passes validation
- **THEN** the refresh flow MUST store the response as the new LKG catalog together with its ETag

#### Scenario: Remote catalog is invalid or unavailable

- **GIVEN** a dynamic refresh fails transport, parsing, or validation
- **WHEN** a validated LKG catalog exists
- **THEN** the refresh flow MUST use the validated LKG catalog and MUST NOT overwrite it with invalid data

#### Scenario: No validated LKG exists

- **GIVEN** a dynamic refresh cannot produce a valid catalog and no validated LKG catalog exists
- **WHEN** the catalog is requested
- **THEN** the refresh flow MUST use the manual fallback catalog

### Requirement: Manual catalog preservation

The system MUST preserve supported manual model definitions and their explicitly declared effort options when dynamic data is unavailable or when a manual-only model is not represented by the dynamic catalog.

#### Scenario: Manual-only model remains available

- **GIVEN** a valid manual model definition is absent from the dynamic catalog
- **WHEN** the effective catalog is assembled
- **THEN** the system MUST preserve that manual-only model and its declared effort options

### Requirement: Apply role-specific specialist effort

The built-in OpenAI defaults MUST assign `explorer`, `librarian`, `designer` and `worker` `gpt-6-luna` with `max` effort and `oracle` `gpt-6.1-sol` with `xhigh` effort (provider-qualified where required), and the OpenCode managed orchestrator `gpt-6.1-sol` with `high` effort; other harness roots remain ambient. Claude Code keeps its own aliases with `explorer` at `medium` effort. On update, a role whose installed model and effort equal the previous shipped default MUST advance to the new default, while valid operator overrides MUST remain effective, and every harness that supports effort metadata MUST render it without silently downgrading `max`.

#### Scenario: Apply role-specific specialist effort

- **GIVEN** the built-in OpenAI preset and an installed role still on the previous shipped default
- **WHEN** defaults are resolved or the install is updated
- **THEN** `worker` resolves to `gpt-6-luna` with `max`, `oracle` to `gpt-6.1-sol` with `xhigh`, and customized roles keep their values 

### Requirement: Preview shipped model defaults

The model configuration menu MUST offer Restore defaults for each harness, opening a write-free preview of all managed roles using package-defined models and efforts independently of installed customizations and manual drafts.

#### Scenario: US1 - Restore shipped role defaults 1

- **GIVEN** customized roles in OpenCode, Codex or Pi
- **WHEN** restore is selected
- **THEN** the preview contains every managed role's shipped model and effort, with no writes

#### Scenario: US1 - Restore shipped role defaults 2

- **GIVEN** a restoration preview
- **WHEN** Back is chosen
- **THEN** installed values remain unchanged

#### Scenario: US1 - Restore shipped role defaults 3

- **GIVEN** an applyable restoration preview
- **WHEN** Apply is chosen
- **THEN** supported managed model and effort fields are replaced with shipped defaults while unrelated fields remain intact

#### Scenario: US1 - Restore shipped role defaults 4

- **GIVEN** Claude Code's manager-owned package
- **WHEN** restore is selected
- **THEN** its own model/effort defaults are displayed with the existing blocking explanation and no cache writes

### Requirement: Apply model defaults explicitly

The restore workflow MUST require explicit Apply, preserve unrelated configuration and existing ownership checks, replace both managed model and effort values, and leave ambient root models unchanged except for OpenCode's managed orchestrator.

#### Scenario: US1 - Restore shipped role defaults 1

- **GIVEN** customized roles in OpenCode, Codex or Pi
- **WHEN** restore is selected
- **THEN** the preview contains every managed role's shipped model and effort, with no writes

#### Scenario: US1 - Restore shipped role defaults 2

- **GIVEN** a restoration preview
- **WHEN** Back is chosen
- **THEN** installed values remain unchanged

#### Scenario: US1 - Restore shipped role defaults 3

- **GIVEN** an applyable restoration preview
- **WHEN** Apply is chosen
- **THEN** supported managed model and effort fields are replaced with shipped defaults while unrelated fields remain intact

#### Scenario: US1 - Restore shipped role defaults 4

- **GIVEN** Claude Code's manager-owned package
- **WHEN** restore is selected
- **THEN** its own model/effort defaults are displayed with the existing blocking explanation and no cache writes

### Requirement: Report restore capability limits

Restoration MUST retain catalog/runtime validation and native cache ownership restrictions, block unsupported plans with actionable explanations, and never report unapplied values as restored.

#### Scenario: US1 - Restore shipped role defaults 1

- **GIVEN** customized roles in OpenCode, Codex or Pi
- **WHEN** restore is selected
- **THEN** the preview contains every managed role's shipped model and effort, with no writes

#### Scenario: US1 - Restore shipped role defaults 2

- **GIVEN** a restoration preview
- **WHEN** Back is chosen
- **THEN** installed values remain unchanged

#### Scenario: US1 - Restore shipped role defaults 3

- **GIVEN** an applyable restoration preview
- **WHEN** Apply is chosen
- **THEN** supported managed model and effort fields are replaced with shipped defaults while unrelated fields remain intact

#### Scenario: US1 - Restore shipped role defaults 4

- **GIVEN** Claude Code's manager-owned package
- **WHEN** restore is selected
- **THEN** its own model/effort defaults are displayed with the existing blocking explanation and no cache writes
