# Proposal: Repair OpenCode Drift During Trusted Apply

## Intent

Correct the OpenCode managed-operation deadlock in which status can identify a
known, repairable thoth-agents drift but the generated sync or install plan is
then rejected because every `drift` item and every drifted aggregate status are
treated as unsafe. The live managed installation demonstrates both relevant
cases: its thoth-agents config selects the legacy top-level `agents` preset
instead of the current `openai` preset, and bundled thoth-agents skills are
missing.

Trusted OpenCode sync and install actions should be able to repair only drift
that status can positively attribute to thoth-agents-managed surfaces. Unsafe,
unknown, malformed, or unmanaged state must continue to fail closed. Model
configuration must remain blocked until the managed installation is healthy,
with the rejection identifying the concrete status diagnostics that must be
repaired first.

The original repair policy, managed skill refresh, blocker propagation,
plugin-free model discovery, automated verification, and completed live
preview/apply steps remain accepted history. This extension corrects a separate
model-editor ownership gap: the selected top-level preset identifies the
inherited role layer, while root `agents` contains user overrides. Model apply
must preserve both the selected preset and every named preset, and the TUI must
resolve the active named preset rather than silently assuming `openai`.

This extension is code-only. Current read-only evidence still observes the live
OpenCode cache package and bundled-skill manifest at version `0.2.2` with 12
skills. Cache/config recovery and post-recovery verification have not completed
and are not authorized by this proposal refinement.

## Scope

### In Scope

- Define a narrow repairable-drift policy for OpenCode `sync` and `install`
  apply actions. The policy covers only parseable, recognized thoth-agents
  managed state, including the expected seven-agent preset/roster and bundled
  thoth-agents skills.
- Repair the known roster drift from a top-level `preset: "agents"` layout to
  the generated current `preset: "openai"` seven-agent layout through the
  existing managed config writer.
- Make both sync and install refresh missing bundled thoth-agents skills; keep
  optional recommended global skills separately classified so their absence
  remains a non-blocking minor diagnostic.
- Preserve unrelated fields in the user's parseable OpenCode main config and
  use the existing managed backup behavior before replacing an existing
  thoth-agents config file.
- Keep parse errors, unknown state, unrecognized roster/config shapes, and
  unmanaged configuration outside the repair allowlist and blocked.
- Gate `model-config` on a healthy OpenCode managed status, not merely on an
  aggregate `installed` label that can still carry a blocking bundled-skill
  diagnostic.
- Preserve the existing top-level `preset` and the complete `presets` map when
  applying OpenCode model changes. Write selected role changes only to the root
  `agents` override map; root overrides must not be converted into a named
  preset.
- Resolve current OpenCode TUI role values from `presets[config.preset]` when
  the configured active preset exists, then overlay root `agents` so explicit
  root model/variant values win. When the top-level preset is absent or names a
  missing entry, use root overrides and existing role defaults without silently
  inheriting `presets.openai`.
- Isolate the native OpenCode model discovery used by model previews from
  external plugin startup by invoking the supported `opencode models --pure`
  mode. Retain provider/model visibility from the user's configured sources
  when OpenCode exposes them in pure mode, while intentionally excluding models
  contributed only by external plugins during preview.
- Surface the specific blocking status codes and messages in plan/apply
  diagnostics, including the affected target observations, so a rejected model
  change identifies roster drift, bundled-skill absence, plugin drift, or an
  unsafe/unknown state rather than returning only a generic refusal.
- Add focused operation tests for classification, preview safety, repair apply,
  backup creation, skill refresh, diagnostic propagation, post-repair health,
  and model-config refusal before health.
- Preserve the recorded history of the original live preview/apply and retained
  backups without rerunning or reclassifying those completed steps as part of
  this code-only extension.

### Deferred / Needs Discovery

- Confirm during task preparation whether the existing aggregate status needs
  an explicit health/blocking field or whether a shared predicate over target
  states and diagnostic severities is sufficient. Either representation must
  keep status, plan generation, and apply validation consistent.
- Confirm whether command and TUI presenters already render all returned
  diagnostic codes and target observations. If either surface drops the new
  blocker detail, include the smallest presenter/test update needed to expose
  it; do not redesign those interfaces.
- Live cache/config/skill recovery and post-recovery status/model verification
  are deferred by the user's explicit code-only decision. Current evidence is
  cache package/manifest version `0.2.2` with 12 bundled skills; this is an
  unresolved operational state, not a completed recovery claim. Any future
  recovery requires separate authorization and a refreshed, bounded plan.

### Out of Scope

- Credential, authentication, provider, provider-selection, or model-discovery
  changes. The previously completed plugin-free native OpenCode discovery
  remains unchanged.
- External-plugin-contributed model discovery during OpenCode preview; those
  models are intentionally excluded to prevent plugin startup side effects.
- Creating `presets.agents`, directly editing any named preset, or changing the
  selected top-level preset during model apply.
- Changes to sync/install classification, repair, roster generation, skill
  refresh, provider behavior, or model selection/effort semantics beyond the
  approved preset inheritance and override contract.
- Cache-management product code or generalized cache recovery behavior.
- Mutation, normalization, or repair of unmanaged OpenCode configuration.
- Broad configuration-schema changes or a general migration framework.
- Changes to Codex or Claude Code install, sync, status, or model behavior.
- Automatic repair during status inspection, plan preview, startup, or model
  configuration.
- Treating optional recommended global skills as required managed health.
- Any live cache, config, skill, provider, or model mutation during this
  code-only extension.

## Approach

Approaches 1-4 describe the completed original product correction and remain
part of the change history. Approach 5 is the approved code-only extension;
Approach 6 records the intentionally deferred operational work.

### 1. Separate trusted repair from general apply safety

- **From:** `validateApplyPlan` rejects any plan item with state `drift`, and
  `applyOpenCodePlan` accepts only aggregate `missing` or `installed` status.
  Consequently, sync/install cannot reach the existing managed writers when
  status has already identified repairable roster or plugin drift.
- **To:** Evaluate safety using both the requested action and the classified
  blocker. Permit `sync` and `install` to cross only a small allowlist of known
  managed drift; continue to reject unknown, malformed, unrecognized, or
  unmanaged state. Do not grant the same repair authority to `model-config`.
- **Reason:** A managed repair action must be able to correct the managed
  surfaces it owns, while unrelated configuration remains protected.
- **Impact:** Known managed drift becomes recoverable without weakening the
  default fail-closed boundary.

### 2. Make managed skill completeness part of health and repair

- **From:** Missing bundled skills produce an important diagnostic, but status
  can still be `installed`; sync does not install the bundled skills, and model
  configuration can proceed despite the incomplete managed installation.
- **To:** Treat missing bundled thoth-agents skills as a blocking managed-health
  condition, refresh them during trusted sync and install, and reserve
  `installed`/healthy model-apply eligibility for a complete managed roster.
  Recommended third-party/global skills remain minor and non-blocking.
- **Reason:** Bundled skills are owned package content and are required for the
  installed workflow; their absence is repairable without claiming ownership
  of optional external skills.
- **Impact:** Sync becomes sufficient to restore managed package completeness,
  and model changes cannot obscure an incomplete installation.

### 3. Propagate actionable blockers

- **From:** Apply rejection can collapse a detailed status report into a generic
  unsafe-state message, leaving the user without the diagnostic code, target,
  or observed mismatch that caused the block.
- **To:** Carry the relevant status diagnostic codes/messages and target
  observations into plan/apply rejection output. A model-config rejection must
  enumerate every current managed-health blocker and direct the user to trusted
  sync/install repair.
- **Reason:** Safety gates are useful only when the remediation is specific and
  inspectable.
- **Impact:** CLI and TUI consumers can explain exactly why apply is blocked
  without reimplementing status classification.

### 4. Isolate model preview discovery from external plugins

- **From:** Native OpenCode model discovery invokes `opencode models` with the
  normal startup path, which can load external plugins and allow a dry-run model
  preview to mutate managed skill state as a plugin side effect.
- **To:** Invoke the supported `opencode models --pure` mode on every platform,
  preserve parsing and catalog enrichment for provider/model entries that the
  user's configuration exposes without external plugins, and intentionally omit
  entries contributed only by external plugins.
- **Reason:** A preview must remain observational and must not start extension
  code capable of mutating managed surfaces.
- **Impact:** Configured native provider/model choices remain visible when
  available in pure mode, while plugin-only model choices are absent from the
  preview catalog by design. Model selection and apply semantics do not change.

### 5. Preserve active-preset inheritance and root overrides

- **From:** The TUI reads root `agents` over a hard-coded `presets.openai`
  base, regardless of the selected top-level preset. Model apply already writes
  role changes into root `agents`, but the preservation boundary for the
  top-level `preset` and named `presets` is not explicit or regression-tested.
- **To:** Resolve the TUI base only from `presets[config.preset]` when that entry
  exists, then overlay root `agents` field by field. If the active preset is
  absent or missing, do not substitute `presets.openai`; use root overrides and
  existing defaults. Apply model changes only to root `agents`, preserving the
  selected top-level preset and every named preset structurally unchanged.
- **Reason:** Root `agents` is the documented override layer, not a preset named
  `agents`. Hard-coding `openai` can show and then write values inherited from a
  preset the user did not select.
- **Impact:** Custom named presets remain the inheritance source, root
  model/variant overrides retain precedence, missing-preset states do not acquire
  silent `openai` values, and model apply does not rewrite preset ownership.

### 6. Defer outstanding live recovery without rewriting history

- **From:** The original plan completed live status/preview and trusted apply
  steps with retained backups, then left cache recovery and post-recovery
  verification pending. Current evidence still reports cache/package/manifest
  `0.2.2` and 12 bundled skills.
- **To:** Retain the completed steps as historical evidence, mark outstanding
  cache/config recovery and live verification as deferred, and make no live
  mutation or completion claim in this code-only extension.
- **Reason:** The user approved source and test changes only; operational
  recovery changes external state and requires separate authorization.
- **Impact:** The preset-semantics fix can be implemented and verified in
  isolated fixtures while the stale live state stays visible for a future
  bounded recovery decision.

## Affected Areas

- `src/cli/operations/opencode.ts`: completed status/health, trusted repair,
  model-config gate, and blocker behavior, plus the explicit contract that model
  apply updates root `agents` without changing top-level `preset` or named
  `presets`.
- `src/cli/operations/opencode.test.ts`: retain original repair regressions and
  add focused model-apply assertions for custom preset preservation, named-preset
  immutability, and root override writes.
- `src/cli/operations/types.ts`: only if the existing status/result types cannot
  represent the health predicate or structured blocker detail without loss.
- `src/cli/commands.ts`, `src/cli/commands.test.ts`, and OpenCode TUI status/plan
  presenters: conditional targets only if existing rendering drops returned
  diagnostic codes or target observations.
- `src/cli/tui/model-catalog.ts`: invoke native OpenCode model discovery through
  the supported plugin-free `opencode models --pure` mode while retaining the
  existing parser and catalog enrichment behavior.
- `src/cli/tui/model-catalog.test.ts`: verify cross-platform pure-mode
  invocation, retained native provider/model parsing, and absence of simulated
  external-plugin startup side effects.
- `src/cli/tui/operations.ts`: resolve role values from the selected named
  preset, overlay root `agents`, and avoid a hard-coded `openai` fallback when
  the active preset is absent or missing.
- `src/cli/tui/operations.test.ts`: cover custom active preset inheritance,
  root override precedence, absent/missing preset behavior, and conflicting
  unselected `openai` values.
- The user's current OpenCode cache, managed config, and bundled-skill directory:
  deferred evidence only (`0.2.2`, 12 skills), not write targets for this
  code-only extension.

## Risks

- An overly broad drift allowlist could overwrite user-owned or unrecognized
  configuration. Repair eligibility must depend on positive managed ownership
  and parseable recognized state, not on the `drift` label alone.
- Rewriting the generated roster can replace user edits inside the managed
  thoth-agents config. The preview, target observation, and backup must make
  that consequence explicit before local apply.
- Installing skills after config writes can leave a partially repaired state if
  skill installation fails. The result must report the failure precisely and a
  subsequent status must remain unhealthy rather than claiming success.
- Divergent health predicates between status, preview, and apply could reopen
  the deadlock or allow model-config too early. Tests must exercise the same
  fixture across all three boundaries.
- Treating recommended global skills as blocking would expand managed ownership
  and could prevent otherwise valid use; their current minor/non-blocking
  classification must be retained.
- Pure discovery intentionally omits model entries contributed only by external
  plugins, so the preview catalog can be smaller than a normal OpenCode session.
  Tests and user-facing behavior must distinguish this safety boundary from a
  provider/auth failure and retain configured provider/model entries that pure
  mode does expose.
- Platform-specific child-process invocation could accidentally drop `--pure`
  (especially through Windows command shims). Invocation tests must assert the
  exact effective command/arguments for Windows and POSIX paths.
- Resolving the wrong named preset could present model/variant values the user
  did not select. Fixtures must include conflicting values in the active custom
  preset, `presets.openai`, and root `agents` so source and precedence are
  unambiguous.
- A convenience fallback from an absent/missing active preset to `openai` would
  hide configuration drift and make the editor's displayed state misleading.
  Missing-preset tests must prove that only root overrides and role defaults are
  used.
- Model apply could accidentally rewrite the selected preset, mutate a named
  preset in place, or synthesize `presets.agents`. Apply tests must compare the
  full pre/post `preset` and `presets` structures while asserting only requested
  root overrides change.
- The live `0.2.2`/12-skill state remains unresolved. It must not be described as
  healthy or recovered merely because isolated code tests pass.

## Rollback Plan

- Revert the OpenCode repairability/health policy, sync skill refresh, diagnostic
  propagation, and focused tests as one coherent product change if the managed
  ownership boundary proves unsafe.
- If the installed OpenCode version does not support pure discovery, revert the
  narrow model-catalog invocation and its tests only after preventing model
  preview from falling back to plugin-starting discovery; prefer an unavailable
  catalog over reintroducing preview-time external plugin side effects.
- Revert the active-preset resolution and preservation assertions as one narrow
  code change if they regress supported model editing. Do not compensate by
  editing named presets or creating `presets.agents`; fail closed for ambiguous
  preset state rather than writing through the wrong inheritance layer.
- Preserve the original managed backups and completed live repair record. Any
  use of those backups, cache recovery, or skill restoration remains a separate
  authorized operation, not an automatic rollback step for this extension.
- Do not modify credentials, providers, optional recommended skills, or
  unrelated OpenCode config during either the extension or rollback.

## Success Criteria

- A fixture with the current managed plugin entry and a parseable thoth-agents
  config whose top-level preset is `agents` is reported with an explicit roster
  blocker and observed preset/role details.
- For that fixture, OpenCode sync and install plans remain dry-run previews,
  identify the managed repair, and are apply-eligible; model-config is rejected
  with the roster diagnostic code/message until repair succeeds.
- A fixture with one or more missing bundled thoth-agents skills is unhealthy,
  exposes `opencode-bundled-skills-missing`, is repairable by both sync and
  install, and blocks model-config until all bundled skills are present.
- Missing recommended global skills remain a minor non-blocking diagnostic and
  do not prevent an otherwise healthy model-config apply.
- Native OpenCode model discovery invokes `opencode models --pure` on POSIX and
  through the Windows shim path; focused tests assert that `--pure` is present in
  the effective invocation on both platforms.
- Given pure-mode output containing configured provider/model identifiers,
  model preview retains the existing parsing, deduplication, and catalog
  enrichment behavior for those identifiers; models available only through
  external plugins are intentionally absent.
- An isolated fake child that records external-plugin startup produces no marker
  during model discovery, and discovery failure returns an empty native catalog
  rather than retrying through a plugin-starting command.
- Given `preset: "custom"`, conflicting values in `presets.custom` and
  `presets.openai`, and a root override for one role, the TUI reads untouched
  roles from `presets.custom`, applies the root override for the overridden
  role/field, and reads no value from the unselected `openai` preset.
- Given a top-level preset that names a missing entry, the TUI uses root
  overrides where present and existing role defaults elsewhere; it does not
  silently inherit any value from `presets.openai`. The same no-`openai`
  fallback holds when the top-level preset is absent.
- Applying a model plan to a config with `preset: "custom"`, multiple named
  presets, and root overrides preserves the top-level preset and the full named
  `presets` structure, updates only the requested root `agents` entries, and
  does not create `presets.agents`.
- Applying trusted repair creates a backup before replacing an existing managed
  config, writes the current `openai` seven-agent roster, refreshes bundled
  skills, preserves unrelated parseable main-config fields, and returns changed
  targets for each repaired managed surface.
- Parse errors, unknown state, unrecognized roster/config shapes, unmanaged
  configuration, and fabricated drift plan items remain rejected without
  writes, with specific blocker diagnostics.
- After a successful repair, status is healthy with no important or critical
  managed-health diagnostics, and the same model-config request becomes
  apply-eligible without bypassing validation.
- Focused OpenCode operation tests cover status, preview, apply, failure/partial
  repair, backup, and post-repair behavior; the repository's typecheck and
  relevant CLI tests pass.
- Focused TUI and operation tests cover active custom preset inheritance,
  absent/missing preset handling, root override precedence, and model-apply
  preservation without changing sync/install, provider, effort, or model
  discovery semantics.
- Verification performs no live cache/config/skill/provider/model mutation.
  The observed `0.2.2` cache/package/manifest and 12-skill state remains
  explicitly deferred and is not reported as recovered or complete.
