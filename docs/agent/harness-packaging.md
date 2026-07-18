# Harness packaging and compatibility

## Responsibility

This route owns common contracts, adapters, capabilities, diagnostics, agent
packs, and writers for OpenCode, Codex, and Claude Code. It also governs the
shape of generated artifacts; command experience belongs to the CLI.

## Signals and entrypoints

- Signals: harness, adapter, writer, capability, diagnostic, Codex plugin,
  Claude plugin, OpenCode config, generated artifact.
- `src/harness/registry.ts` defines `DEFAULT_HARNESS`, the registry, and
  resolution.
- `src/harness/adapters/` translates the common contract per harness.
- `src/harness/writers/` writes harness-specific layouts and packages.
- `src/harness/core/` contains shared agent-pack, SDD, and memory contracts.

## Invariants and risks

- OpenCode remains the stable default harness.
- Codex and Claude Code are supported routes, but their dispatch, permission,
  hook, and trust mechanisms must not be described as identical to OpenCode.
- Enforcement gaps must retain `instruction-only` diagnostics or wording; do not
  turn guidance into a runtime guarantee.
- Provider-owned memory assets and lifecycle protocols are never bundled in a
  harness package; installed provider guidance remains authoritative.
- Changing a generated layout requires reviewing fixtures, writers, installation,
  public documentation, and packaging included by `package.json`.
- Do not edit generated artifacts as the source of truth; change the owning writer.

## Existing documentation

- [`../installation.md`](../installation.md): harness selection and installation.
- [`../codex-install.md`](../codex-install.md): Codex layout and trust.
- [`../codex-plugin-packaging.md`](../codex-plugin-packaging.md): Codex packaging.
- [`../claude-code-plugin-packaging.md`](../claude-code-plugin-packaging.md):
  Claude Code packaging.

Use those documents for public detail, but validate sensitive claims against the
current registry, adapters, writers, and tests.

## Dependencies and overlays

- Load [`agents-and-delegation.md`](agents-and-delegation.md) if the role or
  common-prompt contract changes.
- Load [`cli-installation.md`](cli-installation.md) if the user changes install,
  update, reset, dry-run, or interactive selection.
- Load [`memory-governance.md`](memory-governance.md) for memory capabilities.

## Tests and verification

- `src/harness/registry.test.ts` fixes resolution and fallback.
- `src/harness/adapters/**/*.test.ts` fixes capabilities by harness.
- `src/harness/writers/**/*.test.ts` fixes generated layout and content.
- `src/harness/generate-codex-plugin.test.ts` and packaging tests cover Codex.
- `src/cli/*install.test.ts` covers installation integration.

## Expand context when

- a published surface or npm package content changes;
- a test reveals a difference between docs and generated output;
- a capability cannot be validated as runtime-enforced.

## Evidence and uncertainty

- Verified in `package.json`, `src/harness/`, `src/cli/operations/`, and tests.
- Future Codex/Claude runtime capabilities require current evidence; retain the
  declared limitation until such evidence exists.
