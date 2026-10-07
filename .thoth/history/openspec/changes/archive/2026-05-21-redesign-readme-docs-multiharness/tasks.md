# Tasks: Redesign README and Docs for Multi-Harness Positioning

## Phase 1: Inventory and Messaging Constraints
- [x] 1.1 Capture the current README structure, seven-agent roster, and image references - `README.md`, `img/`
  **Verification**:
  - Run: `rg -n "img/(team|orchestrator|explorer|librarian|oracle|designer|quick|deep)\.png|Orchestrator|Explorer|Librarian|Oracle|Designer|Quick|Deep" README.md`
  - Expected: README still references `img/team.png` and all seven role images/names before rewrite work begins

- [x] 1.2 Audit high-priority docs for shared concepts that are currently framed as OpenCode-only - `README.md`, `docs/installation.md`, `docs/quick-reference.md`, `docs/skills-and-mcps.md`, `docs/provider-configurations.md`, `docs/tmux-integration.md`, `docs/codex-*.md`
  **Verification**:
  - Run: `rg -n "OpenCode|opencode|Codex|codex|task|plugin|skills directory|\.config/opencode|\.codex" README.md docs`
  - Expected: Audit notes identify wording that must become harness-neutral versus wording that should remain explicitly scoped to OpenCode or Codex

- [x] 1.3 Confirm existing commands and package verification scripts to preserve exact command guidance - `README.md`, `docs/installation.md`, `package.json`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Existing markdown and repository formatting pass before documentation edits, establishing a clean baseline for doc-only changes

## Phase 2: README Product and Onboarding Redesign
- [x] 2.1 Rewrite the README opening into a multi-harness onboarding narrative - `README.md`
  **Verification**:
  - Run: `rg -n "multi-harness|OpenCode|Codex|delegate-first|seven-agent|what it is|what it is not|Quick start|Documentation" README.md`
  - Expected: README introduces thoth-agents as multi-harness, names OpenCode and Codex, explains the product clearly, and does not present Codex as full runtime parity

- [x] 2.2 Preserve the visual identity and complete seven-agent roster while restructuring the README - `README.md`, `img/`
  **Verification**:
  - Run: `rg -n "img/(team|orchestrator|explorer|librarian|oracle|designer|quick|deep)\.png|\b(orchestrator|explorer|librarian|oracle|designer|quick|deep)\b" README.md`
  - Expected: README still contains the team image, all seven agent images, and all seven canonical role names after the redesign

- [x] 2.3 Add a concise harness support matrix and scoped quick-start paths - `README.md`
  **Verification**:
  - Run: `rg -n "install --agent=opencode|install --agent=codex|opencode auth login|/plugins|/hooks|instruction-level|trust review|capability|caveat" README.md`
  - Expected: OpenCode install/run commands remain discoverable, Codex install steps include trust-review and instruction-level caveats, and unsupported parity claims are absent

- [x] 2.4 Refresh the README documentation index and development command table - `README.md`
  **Verification**:
  - Run: `rg -n "docs/installation.md|docs/codex-install.md|docs/quick-reference.md|docs/skills-and-mcps.md|docs/provider-configurations.md|docs/tmux-integration.md|bun run build|bun run typecheck|bun test|bun run check:ci" README.md`
  - Expected: README links to the relevant docs and lists only commands present in `package.json`

## Phase 3: Installation and Configuration Docs Alignment
- [x] 3.1 Make installation guidance harness-aware while preserving OpenCode defaults - `docs/installation.md`
  **Verification**:
  - Run: `rg -n "install --agent=opencode|install --agent=codex|install --no-tui|opencode auth login|/plugins|/hooks|default|OpenCode|Codex" docs/installation.md`
  - Expected: Installation docs explain default OpenCode setup, explicit Codex setup, non-interactive usage, auth boundaries, and trust-review steps without mixing their write targets

- [x] 3.2 Scope provider configuration guidance to OpenCode while cross-linking Codex customization docs - `docs/provider-configurations.md`
  **Verification**:
  - Run: `rg -n "OpenCode|Codex|codex-model-customization|provider|preset|THOTH_AGENTS_PRESET|\.config/opencode" docs/provider-configurations.md`
  - Expected: Provider presets remain accurate for OpenCode config, and Codex users are routed to dedicated Codex model/customization guidance

- [x] 3.3 Update quick-reference shared behavior to separate concepts from harness bindings - `docs/quick-reference.md`
  **Verification**:
  - Run: `rg -n "harness|OpenCode|Codex|task|request_user_input|artifactStore|thoth-mem|SDD|tmux|instruction-level" docs/quick-reference.md`
  - Expected: Shared agent, SDD, memory, and skill concepts are described first, with OpenCode and Codex-specific bindings clearly scoped

## Phase 4: Skills, MCPs, Codex Cross-Links, and Tmux Notes
- [x] 4.1 Update skills and MCP documentation for multi-harness delivery surfaces - `docs/skills-and-mcps.md`
  **Verification**:
  - Run: `rg -n "OpenCode|Codex|plugin-bundled|skills directory|MCP|thoth_mem|instruction-level|prompt-driven" docs/skills-and-mcps.md`
  - Expected: The page distinguishes shared bundled skills/MCPs from OpenCode config and Codex plugin/skill packaging surfaces

- [x] 4.2 Add targeted cross-links from Codex docs back to the new multi-harness orientation where useful - `docs/codex-install.md`, `docs/codex-plugin-packaging.md`, `docs/codex-surface-validation.md`, `docs/codex-model-customization.md`
  **Verification**:
  - Run: `rg -n "README.md|installation.md|quick-reference.md|skills-and-mcps.md|provider-configurations.md|multi-harness|OpenCode" docs/codex-install.md docs/codex-plugin-packaging.md docs/codex-surface-validation.md docs/codex-model-customization.md`
  - Expected: Codex pages stay technically focused but link to the broader README/onboarding docs instead of duplicating product narrative

- [x] 4.3 Add OpenCode-scope notes to tmux documentation without implying Codex tmux support - `docs/tmux-integration.md`
  **Verification**:
  - Run: `rg -n "OpenCode|opencode --port|OPENCODE_PORT|Codex|scope|task|tmux" docs/tmux-integration.md`
  - Expected: Tmux docs remain accurate for OpenCode child `task` sessions and explicitly avoid implying Codex pane/session integration

## Phase 5: Documentation Verification and Cleanup
- [x] 5.1 Check for stale OpenCode-only language in shared documentation after edits - `README.md`, `docs/installation.md`, `docs/quick-reference.md`, `docs/skills-and-mcps.md`, `docs/provider-configurations.md`, `docs/tmux-integration.md`
  **Verification**:
  - Run: `rg -n "OpenCode plugin|OpenCode-only|native OpenCode|OpenCode skills directory|opencode config|task tool" README.md docs/installation.md docs/quick-reference.md docs/skills-and-mcps.md docs/provider-configurations.md docs/tmux-integration.md`
  - Expected: Any remaining matches are intentionally scoped to OpenCode behavior, not shared thoth-agents concepts

- [x] 5.2 Verify markdown formatting and repository checks for documentation-only edits - all changed docs
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Biome check passes with no formatting or lint issues introduced by the documentation rewrite

- [x] 5.3 Perform practical markdown link and anchor review for touched docs - `README.md`, `docs/*.md`
  **Verification**:
  - Run: `rg -n "\[[^\]]+\]\(([^)#]+\.md|\.\/|\.\.\/|#)[^)]+\)" README.md docs`
  - Expected: Links added or changed by this work resolve to existing docs or valid in-page anchors, and no broken cross-link is knowingly introduced

- [x] 5.4 Confirm no runtime, installer, generated artifact, or image changes were introduced - documentation scope only
  **Verification**:
  - Run: `git diff -- README.md docs/installation.md docs/quick-reference.md docs/skills-and-mcps.md docs/provider-configurations.md docs/tmux-integration.md docs/codex-install.md docs/codex-plugin-packaging.md docs/codex-surface-validation.md docs/codex-model-customization.md`
  - Expected: Diff is limited to documentation text/link changes and preserves existing image assets, agent role names, and accurate command snippets
