# Agent Guidelines

## Claims about how Claude Code behaves

`~/.claude/projects/**` is **not** evidence of what CC does -- the bridge writes there too, and CC re-serializes imported records under synthetic ids. Split by provenance (CC-live: real `requestId`/`promptId`; ours: `msg_syn_*`/`req_syn_*`) and regroup by `message.id` (`diag/audit-transcripts.mjs` does both).

Better: prove it with a live probe. `tests/int-cc-contracts.mjs` pins undocumented behavior against the installed CC/SDK; `diag/capture-proxy.mjs` captures request bodies. `claude-code-rip/` is mechanism only, never current behavior. Before reverse-engineering an SDK option, grep `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` first.

Validate any *rate* from the debug log on a case whose answer you know. Bin by era before comparing groups -- a window straddling the onset credits whatever else changed.

Five wrong conclusions across two sessions came from skipping the above.

## Changelog

Maintain an entry in the `## [Unreleased]` section at the top of `CHANGELOG.md` for every significant change, using its existing Keep a Changelog categories (`Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`). Mark breaking changes with `**Breaking:**` within the relevant category.

Do not add changelog entries for docs-only changes, or for small changes (especially test-only ones) unless they relate to an issue. Combine multiple Unreleased entries about the same feature into one. Test, debug and docs entries generally go last.

Keep entries short: one sentence of detail is usually enough. Only a big change warrants a few sentences. Leave implementation details and file lists to the commit log and docs. Preserve upstream history in `UPSTREAM-CHANGELOG.md`; upstream syncs belong under the local Unreleased section, not upstream-version headings.

## Release

This workspace copy builds to `dist` with `pnpm run build` (see `files` in `package.json`). Do not bump or publish this scoped package without explicit authorization. Releases are monorepo-managed through the root release scripts; follow the [workspace release flow](../../docs/agent/harness-packaging.md#release-flow) and [version-bump guidance](../../docs/agent/harness-packaging.md#bumping), not upstream's standalone release procedure.

## Tests

`pnpm run test:unit` is hermetic and safe offline. Never run `test` or `test:usage` without explicit live-service authorization: they access local Pi/Claude auth state and call the service.

Cover inputs the model chooses (tool names, message shapes), not just our own branches. A test of a copy of the code is not coverage.
