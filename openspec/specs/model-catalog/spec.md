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
