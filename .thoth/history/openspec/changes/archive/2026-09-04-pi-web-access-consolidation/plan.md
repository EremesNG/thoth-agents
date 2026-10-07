# Implementation Plan: Consolidate Pi web research

## Technical context

Current Pi inventory contains seven external packages, with Exa-specific runtime status and librarian patterns plus RPIV web_search/web_fetch. Replace two web packages with pi-web-access@0.27.0, leaving six external packages. Existing default tool names are a supported contract; operator overrides may degrade it.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — Root owns artifacts; one deep writer for coupled installer/status/prompt contracts; fresh Oracle review when selected and mandatory final verification.
- **Explicit role boundaries**: PASS — Only root/librarian receive web tools; six specialists and root ownership remain intact.
- **Proportional Spec Kit-compatible SDD**: PASS — User selected Accelerated; specification validated before this plan, ready/review/implementation gates remain separate.
- **Truthful multi-harness contracts**: PASS — Use frozen native extension contract; no network or installer invocation during SDD and other harnesses unchanged.
- **Independent provider ownership**: PASS — No thoth-mem assets or provider credentials are modified.
- **Evidence-led completion**: PASS — Test-first public seams, generated checks, and fresh Oracle evidence precede transactional archive.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Replace exa/web-tools entries with web-access pin npm:pi-web-access@0.27.0; preserve native install/verify/failure ordering | src/cli/pi-install.ts; src/cli/pi-install.test.ts; src/cli/install.test.ts | injected executor asserts six exact packages and no old source |
| FR-002 | Replace research provider id exa with web-access; remove mandatory key inference; add explicit unverified runtime state for package-present web access without live evidence; missing package remains drifted; provided evidence remains authoritative | src/cli/operations/pi.ts; src/cli/operations/pi.test.ts | status without EXA_API_KEY is unverified, never missing credentials or ready solely from installation |
| FR-003 | Replace two Exa patterns and web_fetch with fetch_content/get_search_content/source_check while retaining web_search, Context7, mcp; add workflow none guidance and exact-name/failure caveats | src/harness/writers/pi-agent.ts; src/harness/adapters/pi.ts; colocated tests | rendered librarian exact allowlist, root/child guidance, negative assertions on other specialists |
| FR-004 | Update current operator docs and diagnostics, remove claims that Pi requires pi-exa-specific tools; document native cleanup before installation and upstream configuration ownership | README.md; docs/installation.md; docs/skills-and-mcps.md; docs/agent/architecture.md; docs/agent/cli-installation.md; docs/agent/harness-packaging.md | targeted inventory scan excludes historical archives; documentation review |

Only if additional Pi-specific references exist in src/agents/prompt-dialects.ts, src/agents/prompt-sections.ts or their tests, align them within the same writer ownership. Regenerate pi/agents and pi/.thoth-agents-assets.json via the project integration generator; other harness output must remain unchanged. Memory-governance tests may require updated Pi tool-name expectations without changing production memory rules.

### Execution ownership

Root owns openspec/changes/pi-web-access-consolidation and later canonical delta synchronization. A fresh deep writer owns all coupled product/tests/current-docs/generated Pi changes: package ids feed status and generated permissions, so isolating one coherent implementation chain creates net gain while root tracks evidence. Explorer is unnecessary (entrypoints known), librarian preflight is complete, designer has no material UI design task, quick is unsuitable for status semantics, and fresh Oracle owns independent review/verify. No concurrent product writers.

Preexisting modifications in src/cli/pi-install.test.ts, src/cli/operations/pi.test.ts, src/harness/generate-integration-packages.test.ts and src/harness/publish-marketplace.test.ts are unrelated platform/environment test fixes. Preserve and adapt to them, never revert them or claim ownership. No commits.

### Status semantics

PiResearchProviderId becomes context7 | web-access | grep. Extend PiResearchRuntimeState with unverified and map it to unknown with a truthful minor diagnostic. Installed web package alone yields unverified; missing/drifted web package yields drifted. Explicit ready/credential-required/unreachable/failed evidence is surfaced without inspecting or printing secrets. EXA_API_KEY absence alone is irrelevant because upstream supports other providers and keyless Exa. Context7 and grep retain their current semantics.

### Research guidance

Expose all four default tools documented in research.md. web_search calls should specify workflow: "none" for delegated/noninteractive research; this also bypasses curator when a child unexpectedly reports UI support. fetch_content returns/cache/cloning behavior remains extension-owned. Do not invent dedicated Exa tools or claim tool allowlists prevent upstream cache writes. Preserve read-only workspace policy and untrusted-data treatment. Configurable tool aliases/disabled tools are operator-owned capability gaps, not new automatic config writes.

## Optional support artifacts

- research.md freezes exact upstream source and compatibility/side-effect facts needed offline.
- data-model.md, contracts/, quickstart.md are unnecessary: no new persistent data model or provider implementation.

## Risks and migrations

- No automatic uninstall/migration. Current documentation instructs removing npm:@juicesharp/rpiv-web-tools and npm:@feniix/pi-exa with Pi before complete setup. This repository work does not modify actual home state.
- Keyless search is network/service dependent, not guaranteed ready; explicit unverified status avoids false assurance.
- Removed pi-exa answer/find-similar/research-planner APIs are not retained. Exa is a selectable upstream provider.
- Package uses installed Pi @earendil-works peer namespace; exact package declares no engine floor, so validate against project Node/Pi baseline via available offline checks.
- Revert the bounded product change if validation fails; no rollback of operator configuration is needed because it is untouched.
- SC-004 live-provider behavior may remain RISK under offline SDD; do not invoke network or invent a successful smoke test.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — Root owns artifacts; one deep writer for coupled installer/status/prompt contracts; fresh Oracle review when selected and mandatory final verification.
- **Explicit role boundaries**: PASS — Only root/librarian receive web tools; six specialists and root ownership remain intact.
- **Proportional Spec Kit-compatible SDD**: PASS — User selected Accelerated; specification validated before this plan, ready/review/implementation gates remain separate.
- **Truthful multi-harness contracts**: PASS — Use frozen native extension contract; no network or installer invocation during SDD and other harnesses unchanged.
- **Independent provider ownership**: PASS — No thoth-mem assets or provider credentials are modified.
- **Evidence-led completion**: PASS — Test-first public seams, generated checks, and fresh Oracle evidence precede transactional archive.
