# Implementation Plan: Activate the applied OpenCode agents preset

## Technical context

The interactive TUI sends both clean Apply and dirty Apply through
`TuiOperations.modelPlan` and `TuiOperations.apply`. For OpenCode these resolve
to `buildOpenCodeModelPlan` and `applyOpenCodePlan` in
`src/cli/operations/opencode.ts`. The issued model payload contains only the
roles selected by the TUI: every current role for clean Apply and dirty roles
only after edits.

The root cause is in `applyModelPlan`: it starts from the parsed lite config (or
the generated OpenAI config), patches only the root-level `agents` map, and
writes that object without changing `preset`. Because generated and installed
configs select `openai`, model application necessarily leaves `preset: openai`.
The current operation test asserts only the root override and therefore does not
cover preset activation or post-apply status.

The affected surfaces are the OpenCode operation adapter and status classifier,
filesystem-backed operation tests, selected-preset role readback tests, and
public CLI model guidance. Existing plan provenance, malformed-config rejection,
backup behavior, effort ownership, install/sync defaults, and other harnesses
remain unchanged.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The user selected Accelerated after an evidence-based recommendation; root owns the sequential artifacts and will delegate optional plan review only if selected and final verification unconditionally to Oracle.
- **Explicit role boundaries**: PASS — Root is the sole artifact and product-code writer; Oracle remains read-only and no delegation depth beyond one is planned.
- **Proportional Spec Kit-compatible SDD**: PASS — The change mutates persisted configuration and status classification, justifying Accelerated spec/plan/tasks/verify/archive without optional research, checklist, or architectural grilling.
- **Truthful multi-harness contracts**: PASS — The design remains OpenCode-specific, keeps `openai` as the sole built-in preset, and introduces `agents` only as the user-applied named preset rather than another shipped provider preset.
- **Independent provider ownership**: PASS — No thoth-mem installation, lifecycle, persistence, hook, or recovery surface changes; memory is used only for bounded workflow continuity.
- **Evidence-led completion**: PASS — TDD will exercise real temporary config writes and round-trip status, and read-only Oracle will own final verification before closeout/archive.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add a distinct applied-preset key (`agents`); after a valid model payload is applied, preserve `presets`, write the effective roster to `presets.agents`, and set `preset` to `agents`. | `src/cli/operations/opencode.ts`; `applyModelPlan`, `applyOpenCodePlan` | Build/apply a public OpenCode model plan against a temporary lite config and read the persisted JSON. |
| FR-002 | Seed initial materialization from canonical generated OpenAI defaults, overlay the currently selected preset, then overlay root `agents` per role and per field. Treat a complete active `agents` preset as an already materialized authoritative baseline so absent optional fields are not recreated on reapply. Patch requested model/variant values into both the materialized preset and the existing root override layer so root precedence cannot mask the applied value. Preserve every unrelated top-level key and named preset. | `src/cli/operations/opencode.ts`; new focused record/merge helpers around `applyModelPlan` | Filesystem fixtures with an active partial selected preset, partial root fields, an unrelated preset, unrelated top-level configuration, and repeat Apply with an intentionally omitted optional field. |
| FR-003 | Generalize managed-roster recognition and marker output so a complete selected `openai` or `agents` preset is healthy; keep root-only `preset: agents` classified as legacy drift. Reuse existing selected-preset logic in `getOpenCodeModelRoles` and prove a second plan remains applicable. | `src/cli/operations/opencode.ts`; `liteConfigMarker`, managed-roster predicate, status path. `src/cli/tui/operations.ts`; existing readback interface. | After first apply, call `getOpenCodeStatus`, `getOpenCodeModelRoles`, build/apply a second model plan, and assert no roster-drift blocker. |
| FR-004 | Add explicit filesystem assertions that install and sync still persist `preset: openai`; extend operation/readback regression coverage and public guidance while preserving the prior TUI tests that distinguish clean all-role payloads from dirty-only payloads. | `src/cli/operations/opencode.test.ts`, `src/cli/tui/operations.test.ts`, existing `src/cli/tui/App.test.tsx`, `README.md` | Characterization assertions for install/sync, focused OpenCode operation/TUI suites, repository formatting, and typecheck. |

### Configuration merge and activation

1. Parse the existing lite config; when absent, use `generateLiteConfig` as both
   the writable base and canonical seven-role fallback.
2. Treat only plain object records as presets/role maps. Read the currently
   selected preset when valid, otherwise use an empty selected layer; existing
   safety classification still blocks malformed/unrecognized installed configs.
3. For initial materialization, or when the active `agents` preset is
   incomplete, shallow-merge every canonical role in this order: generated
   OpenAI fallback, selected preset role, root override role. When a complete
   `agents` preset is already active, use its materialized role objects as the
   authoritative baseline and overlay root overrides without reintroducing
   absent optional fields such as `variant`. This preserves explicit inherited
   effort across repeat Apply while retaining field-level root precedence.
4. Apply each issued role model/variant to the effective `agents` preset using
   the existing managed-effort ownership rules. Apply the same requested fields
   to the root override role so root precedence cannot retain a stale model.
5. Persist the merged roster at `presets.agents`, preserve other presets and
   top-level keys, set `preset: agents`, and write through the existing backup
   helper.
6. Recognize a complete active `presets.agents` roster as managed. A legacy
   `preset: agents` config with only root `agents` remains repairable drift and
   is not silently reclassified.

### Optional support artifacts

- `research.md`: Not needed; the failing data flow and current merge/status contracts are directly evidenced in repository code and tests.
- `data-model.md`: Not needed; `preset`, `presets`, and `agents` already exist in the validated configuration schema.
- `contracts/`: Not needed; no public TypeScript signature or external protocol changes.
- `quickstart.md`: Not needed; the README model-configuration section is the public operator surface.

## Risks and migrations

- Dirty Apply carries only changed roles. Mitigation: materialize all seven roles
  from the effective current configuration before applying the subset.
- Root overrides have higher precedence than the selected preset and could mask
  newly applied values. Mitigation: patch requested model/variant fields in both
  the named preset and root override while preserving unrelated root fields.
- Reclassifying every `preset: agents` config as healthy would revive the legacy
  root-only layout. Mitigation: require a complete `presets.agents` object for
  managed health; leave root-only legacy detection unchanged.
- A custom selected preset may be partial. Mitigation: merge canonical defaults,
  selected fields, and root fields per role so the applied preset is complete.
- Reapplying canonical defaults over a complete materialized `agents` preset
  could recreate an intentionally absent optional field. Mitigation: only use
  canonical fallback for initial or incomplete materialization; regression
  coverage keeps an unrequested omitted `variant` stable.
- Install or sync intentionally rewrites the canonical built-in OpenAI preset.
  This is not migrated; explicit model Apply is the transition to `agents`, and
  filesystem-backed regression assertions keep both fixed-operation paths on
  `openai`.
- Existing config writes retain managed `.bak` recovery. Code rollback consists
  of reverting the adapter/status changes; an operator can restore the prior
  lite config from its backup if desired.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — One root writer owns `openspec/`, adapter, tests, and docs; the planned Oracle interactions are read-only plan review by user choice and mandatory final verification.
- **Explicit role boundaries**: PASS — No mutable surface is shared and the implementation remains within the root-owned bounded CLI operation surface.
- **Proportional Spec Kit-compatible SDD**: PASS — Every technical decision maps to FR/SC, no optional artifact lacks a concrete risk purpose, and the ready/verify/archive gates remain intact.
- **Truthful multi-harness contracts**: PASS — The design does not claim `agents` is shipped or provider-built-in; `openai` remains the installation default and only explicit OpenCode model application activates `agents`.
- **Independent provider ownership**: PASS — The design changes only thoth-agents-owned OpenCode JSON and tests and introduces no provider mutation or claimed provider effect.
- **Evidence-led completion**: PASS — Filesystem persistence, field preservation, status/readback, repeat apply, regression suites, and Oracle verdict provide explicit evidence for every buildable SC.
