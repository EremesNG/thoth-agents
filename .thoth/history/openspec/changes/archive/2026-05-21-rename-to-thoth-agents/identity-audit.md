# Identity audit inventory: rename-to-thoth-agents

Baseline command: `rg "oh-my-opencode-lite" --count`.

This inventory classifies each current match by file. Every occurrence in a row
shares the listed classification. The automated allowlist in
`scripts/identity-audit.ts` is intentionally stricter than this inventory: it
allows only the current rename change artifacts and archived OpenSpec history.
There are no approved deliberately scoped compatibility exceptions.

## Summary

| Classification | Occurrences | Policy |
| --- | ---: | --- |
| Active identity | 397 | Must be renamed in later phases. |
| Historical/archive | 50 | Allowed only under `openspec/changes/archive/**`. |
| Current rename context | 40 | Allowed only under `openspec/changes/rename-to-thoth-agents/**`. |
| Third-party/example | 0 | No explicit third-party/example allowlist entries. |
| Deliberately scoped exception | 0 | None approved. |

## Active identity occurrences

These are active project-owned package, source, test, fixture, documentation,
schema, image-prompt, or current OpenSpec surfaces. They are not allowlisted by
the automated audit.

| Path | Count | Notes |
| --- | ---: | --- |
| `AGENTS.md` | 3 | Active agent reference documentation. |
| `README.md` | 16 | Active product docs/install/schema examples. |
| `codemap.md` | 3 | Active repository codemap. |
| `docs/cartography.md` | 1 | Active docs. |
| `docs/codex-install.md` | 8 | Active install/path docs. |
| `docs/codex-plugin-packaging.md` | 4 | Active Codex package docs. |
| `docs/codex-surface-validation.md` | 1 | Active verification docs. |
| `docs/installation.md` | 25 | Active install/config/schema/uninstall docs. |
| `docs/provider-configurations.md` | 5 | Active config docs. |
| `docs/quick-reference.md` | 4 | Active quick reference paths/prose. |
| `docs/sdd-pipeline.md` | 1 | Active SDD docs. |
| `docs/skills-and-mcps.md` | 2 | Active skill/MCP docs. |
| `docs/tmux-integration.md` | 4 | Active config docs. |
| `img/prompts_nano_banana.md` | 1 | Active prompt asset text. |
| `oh-my-opencode-lite.schema.json` | 2 | Active generated schema artifact. |
| `openspec/config.yaml` | 2 | Active OpenSpec project config. |
| `openspec/specs/multi-harness-agent-pack/spec.md` | 16 | Active OpenSpec spec. |
| `package.json` | 6 | Active package/bin/repository/schema metadata. |
| `scripts/generate-schema.ts` | 3 | Active schema producer. |
| `src/agents/orchestrator.ts` | 1 | Active agent prompt. |
| `src/cli/codemap.md` | 7 | Active CLI codemap. |
| `src/cli/codex-config-io.test.ts` | 2 | Active test expectations. |
| `src/cli/codex-install.test.ts` | 14 | Active test expectations. |
| `src/cli/codex-install.ts` | 7 | Active Codex installer producer. |
| `src/cli/codex-paths.test.ts` | 3 | Active test expectations. |
| `src/cli/codex-paths.ts` | 2 | Active Codex path producer. |
| `src/cli/config-io.test.ts` | 6 | Active test expectations. |
| `src/cli/config-io.ts` | 2 | Active OpenCode config producer. |
| `src/cli/config-manager.test.ts` | 2 | Active test expectations. |
| `src/cli/custom-skills.ts` | 1 | Active source docs. |
| `src/cli/index.ts` | 13 | Active CLI help/usage. |
| `src/cli/install.ts` | 8 | Active installer output/docs URL. |
| `src/cli/paths.test.ts` | 2 | Active test expectations. |
| `src/cli/paths.ts` | 2 | Active config path producer. |
| `src/codemap.md` | 1 | Active source codemap. |
| `src/config/codemap.md` | 7 | Active config codemap. |
| `src/config/loader.test.ts` | 61 | Active test expectations. |
| `src/config/loader.ts` | 11 | Active config loader producer/log prefix. |
| `src/harness/__fixtures__/codex/plugin-skill-provenance.json` | 1 | Active generated fixture. |
| `src/harness/__fixtures__/codex/plugin.json` | 1 | Active generated fixture. |
| `src/harness/__fixtures__/codex/skill-manifest.json` | 1 | Active generated fixture. |
| `src/harness/adapters/codex.test.ts` | 16 | Active test expectations. |
| `src/harness/adapters/codex.ts` | 5 | Active Codex harness producer. |
| `src/harness/generate-codex-plugin.test.ts` | 9 | Active test expectations. |
| `src/harness/generate-codex-plugin.ts` | 5 | Active package/marketplace fixture producer. |
| `src/harness/writers/codex-plugin-package.test.ts` | 6 | Active test expectations. |
| `src/harness/writers/codex-plugin-package.ts` | 2 | Active generated package producer. |
| `src/harness/writers/skill-layout.test.ts` | 6 | Active test expectations. |
| `src/harness/writers/skill-layout.ts` | 3 | Active generated manifest producer. |
| `src/hooks/auto-update-checker/cache.test.ts` | 3 | Active test expectations. |
| `src/hooks/auto-update-checker/checker.test.ts` | 7 | Active test expectations. |
| `src/hooks/auto-update-checker/codemap.md` | 1 | Active hook codemap. |
| `src/hooks/auto-update-checker/constants.ts` | 1 | Active update package constant. |
| `src/hooks/auto-update-checker/index.ts` | 1 | Active hook output. |
| `src/hooks/thoth-mem/index.test.ts` | 30 | Active test expectations/sample project IDs. |
| `src/index.ts` | 2 | Active plugin metadata/default project name. |
| `src/skills/cartography/README.md` | 1 | Active bundled skill docs. |
| `src/skills/cartography/SKILL.md` | 3 | Active bundled skill docs/metadata. |
| `src/skills/executing-plans/SKILL.md` | 1 | Active bundled skill metadata. |
| `src/skills/plan-reviewer/SKILL.md` | 1 | Active bundled skill metadata. |
| `src/skills/requirements-interview/SKILL.md` | 1 | Active bundled skill metadata. |
| `src/skills/thoth-mem-agents/SKILL.md` | 3 | Active bundled skill metadata/examples. |
| `src/thoth/client.test.ts` | 17 | Active test expectations/sample project IDs. |
| `src/tools/ast-grep/codemap.md` | 1 | Active tool codemap. |
| `src/tools/ast-grep/downloader.ts` | 6 | Active cache/log producer. |
| `src/tools/codemap.md` | 2 | Active tool codemap. |
| `src/utils/logger.test.ts` | 1 | Active test expectation. |
| `src/utils/logger.ts` | 1 | Active log path producer. |

## Historical/archive occurrences

These are historical OpenSpec records and are allowlisted only because they live
under `openspec/changes/archive/**`.

| Path | Count |
| --- | ---: |
| `openspec/changes/archive/2026-03-26-create-omolite-plugin/design.md` | 3 |
| `openspec/changes/archive/2026-03-26-create-omolite-plugin/proposal.md` | 1 |
| `openspec/changes/archive/2026-03-26-create-omolite-plugin/tasks.md` | 4 |
| `openspec/changes/archive/2026-03-26-sdk-v1.3.3-migration/proposal.md` | 1 |
| `openspec/changes/archive/2026-05-20-add-codex-harness-adapter/proposal.md` | 1 |
| `openspec/changes/archive/2026-05-20-codex-install-agent-command/design.md` | 11 |
| `openspec/changes/archive/2026-05-20-codex-install-agent-command/proposal.md` | 6 |
| `openspec/changes/archive/2026-05-20-codex-install-agent-command/specs/multi-harness-agent-pack/spec.md` | 12 |
| `openspec/changes/archive/2026-05-20-codex-install-agent-command/tasks.md` | 7 |
| `openspec/changes/archive/2026-05-20-codex-install-agent-command/verify-report.md` | 1 |
| `openspec/changes/archive/2026-05-20-codex-plugin-packaging/proposal.md` | 1 |
| `openspec/changes/archive/2026-05-20-codex-plugin-packaging/specs/multi-harness-agent-pack/spec.md` | 1 |
| `openspec/changes/archive/2026-05-20-codex-plugin-packaging/verify-report.md` | 1 |

## Current rename-context occurrences

These are allowlisted because this change defines the rename and must refer to
both the old and new identities.

| Path | Count |
| --- | ---: |
| `openspec/changes/rename-to-thoth-agents/design.md` | 10 |
| `openspec/changes/rename-to-thoth-agents/identity-audit.md` | 2 |
| `openspec/changes/rename-to-thoth-agents/proposal.md` | 4 |
| `openspec/changes/rename-to-thoth-agents/specs/project-identity/spec.md` | 12 |
| `openspec/changes/rename-to-thoth-agents/tasks.md` | 12 |
