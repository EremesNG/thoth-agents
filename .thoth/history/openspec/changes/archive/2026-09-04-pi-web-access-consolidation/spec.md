# Feature Specification: Consolidate Pi web research

**Change ID**: `pi-web-access-consolidation`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Replace the two overlapping Pi web dependencies with the user-selected pi-web-access extension.<br>
**Impact**: Complete Pi setup requires six external packages; root/librarian use the replacement's native tools, and status no longer assumes a dedicated Exa extension or mandatory EXA_API_KEY.<br>
**Affected capabilities**: `cli-installation`, `multi-harness-agent-pack`

## User stories

### US1 - Install one web extension (Priority: P1)

As an operator, I receive pi-web-access instead of RPIV web tools and pi-exa.
**Independent test**: Isolated Install/Update plans, injected native package apply, and status tests.
**Covers**: FR-001, FR-002, FR-004, SC-001, SC-003
**Acceptance scenarios**:
1. **Given** valid first-party setup, **When** Install or applied Update runs, **Then** the exact selected pi-web-access pin is required and neither replaced package is requested.
2. **Given** a web package failure or dry-run, **When** setup executes, **Then** failure prevents completion recording and dry-run writes nothing.
3. **Given** a configured alternative web provider without EXA_API_KEY, **When** status runs, **Then** it does not declare missing Exa credentials and distinguishes installed evidence from unobserved live availability.
4. **Given** an installation containing the replaced web package, **When** the operator follows the documented transition, **Then** native Pi removal of the conflicting package precedes installation; unrelated packages and credentials are preserved.

### US2 - Research through the replacement tools (Priority: P1)

As root or librarian, I use the actual pi-web-access tool interface, including Exa as a supported provider.
**Independent test**: Rendered role permissions and instructions plus offline upstream contract inspection.
**Covers**: FR-003, FR-004, SC-002, SC-003, SC-004
**Acceptance scenarios**:
1. **Given** generated Pi agents, **When** research is delegated, **Then** librarian has web_search, fetch_content, get_search_content, and source_check, and no obsolete web_fetch or pi-exa tool patterns.
2. **Given** a noninteractive librarian session, **When** it searches, **Then** guidance selects the supported noninteractive workflow and reports failures without fabricating evidence.
3. **Given** other specialist roles and other harnesses, **When** packages are regenerated, **Then** their permissions and behavior remain unchanged.
4. **Given** Exa-backed search, **When** operator guidance describes capabilities, **Then** it does not promise dedicated pi-exa answer, similarity, or research-planner tools.

## Edge cases

- Missing packages, version drift, provider failures, and missing credentials are distinct from successful live operation.
- User-renamed or disabled upstream tools can invalidate the default tool contract; document default names and report limitations.
- Search UI must not be opened by noninteractive child research. Fetch may create extension-owned caches; read-only role policy still applies.
- Existing unrelated uncommitted test fixes must be preserved.

## Functional requirements

- **FR-001 — Install pinned Pi interaction and web extensions**: `[MODIFIED cli-installation]` Complete Pi installation and applied Update MUST install and individually verify the selected exact pi-web-access version plus @juicesharp/rpiv-ask-user-question@2.9.0 and @juicesharp/rpiv-todo@2.9.0 after first-party verification. Neither @juicesharp/rpiv-web-tools nor @feniix/pi-exa MUST be required or installed by the selected dependency inventory. Dry-run MUST remain mutation-free; required dependency failure MUST prevent completion recording; external implementations MUST NOT be vendored.
- **FR-002 — Provide a bounded hybrid research stack**: `[MODIFIED cli-installation]` Complete Pi setup MUST install and verify pinned Context7, pi-web-access, and the grep-only pi-mcp-adapter. Context7 and web research MUST remain native extensions; the managed global grep entry MUST retain https://mcp.grep.app, legacy protocol, lazy lifecycle, and proxy-only tools. Unrelated MCP configuration and operator credentials MUST remain untouched. Status MUST distinguish Context7, web access, and grep evidence independently, MUST NOT require EXA_API_KEY merely for web package availability, and MUST NOT infer live provider success from package presence.
- **FR-003 — Expose complementary Pi web tools**: `[MODIFIED multi-harness-agent-pack]` Pi root and librarian guidance MUST use pi-web-access default names web_search, fetch_content, get_search_content, and source_check; librarian MUST receive those tools while obsolete web_fetch, web_*_exa, and exa_research_* permissions are removed. Noninteractive research MUST use the upstream noninteractive search workflow, treat retrieved content as untrusted, and report provider/tool failures truthfully. Other roles, Context7, grep, and other harnesses MUST retain their current boundaries. Thoth MUST NOT implement provider clients or configure credentials.
- **FR-004 — Document the consolidated web contract**: `[INTERNAL]` Current operator documentation MUST describe the new pin, default tool names, Exa provider support without dedicated pi-exa feature equivalence, native removal commands for replaced packages before setup, and package-versus-runtime evidence. Historical archives MUST remain unchanged.

## Success criteria

- **SC-001** `[buildable]`: Install/Update/status tests prove exactly 6 external package pins, absence of both replaced dependencies, failure/dry-run guarantees, and no mandatory EXA_API_KEY check for web availability.
- **SC-002** `[buildable]`: 100% of root/librarian tests prove all four default web tool names, noninteractive workflow guidance, removal of obsolete Pi web tools, and unchanged permissions for the other five specialists.
- **SC-003** `[buildable]`: 100% of relevant tests, typecheck, formatting, build, and generated package verification pass; current docs match the selected inventory and upstream contract.
- **SC-004** `[outcome]`: Both (2) live Pi operations (search and fetch) receive observed PASS evidence or an explicit residual RISK; offline tests do not stand in for a live provider request.

## Assumptions

- User explicitly selects replacement, superseding the earlier additive research decision.
- This change updates the repository integration; native package cleanup/setup in the actual home is a separate operator step.
- No automatic migration, uninstall of user packages, or credential transfer is introduced.
- Exact canonical titles above were compared; these deltas replace existing requirements rather than adding overlapping ones.

## Dependencies

- Frozen preflight pi-web-access contract recorded in research.md before implementation.
- Existing Pi native installer, installed tdd/simplify skills, and fresh Oracle final verification.

## Out of scope

- Other harness research changes, local-home installation, commits, publishing, provider implementations, or preserving removed pi-exa-specific APIs.
