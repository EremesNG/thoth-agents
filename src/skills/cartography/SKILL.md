---
name: cartography
description: Repository understanding and hierarchical codemap generation
---

# Cartography Skill

You help users understand and map repositories by creating hierarchical codemaps.

## When to Use

- User asks to understand/map a repository
- User wants codebase documentation
- Starting work on an unfamiliar codebase

## Workflow

## Harness Bindings

`thoth-agents` is the canonical skill identity. Adapter bindings only decide
where the installed skill script lives and which instruction/context surface is
automatically loaded.

- Use the active skill resource path for `cartographer.py` rather than a fixed
  install directory.
- Register the root `codemap.md` in the active instruction/context surface. If
  the runtime does not support an automatically loaded surface, surface an
  unsupported-capability or manual-inclusion diagnostic instead of assuming a
  specific repo-root autoload file.

### Step 1: Check for Existing State

**First, check if `.lite/cartography.json` exists in the repo root.**

If it **exists**: Skip to Step 3 (Detect Changes) - no need to re-initialize.

If it **doesn't exist**: Continue to Step 2 (Initialize).

### Step 2: Initialize (Only if no state exists)

1. **Analyze the repository structure** - List files, understand directories
2. **Infer patterns** for **core code/config files ONLY** to include:
   - **Include**: `src/**/*.ts`, `package.json`, etc.
   - **Exclude (MANDATORY)**: Do NOT include tests, documentation, or translations.
     - Tests: `**/*.test.ts`, `**/*.spec.ts`, `tests/**`, `__tests__/**`
     - Docs: `docs/**`, `*.md` (except root `README.md` if needed), `LICENSE`
     - Build/Deps: `node_modules/**`, `dist/**`, `build/**`, `*.min.js`
   - Respect `.gitignore` automatically
3. **Run cartographer.py init** using the active skill resource path:

```bash
python3 {active-skill-resource-path}/cartography/scripts/cartographer.py init \
  --root ./ \
  --include "src/**/*.ts" \
  --exclude "**/*.test.ts" --exclude "dist/**" --exclude "node_modules/**"
```

This creates:
- `.lite/cartography.json` - File and folder hashes for change detection
- Empty `codemap.md` files in all relevant subdirectories

4. **Delegate discovery to semantic explorer roles** — Spawn one explorer per
   folder to read code and gather findings. Then delegate to a write-capable
   role to write each folder's `codemap.md` based on explorer findings.

### Step 3: Detect Changes (If state already exists)

1. **Run cartographer.py changes** to see what changed, using the active skill
   resource path:

```bash
python3 {active-skill-resource-path}/cartography/scripts/cartographer.py changes --root ./
```

2. **Review the output** - It shows:
   - Added files
   - Removed files
   - Modified files
   - Affected folders

3. **Only update affected codemaps** — Spawn one explorer per affected folder to gather updated findings, then dispatch quick to write the updated `codemap.md`.
4. **Run update** to save new state, using the active skill resource path:

```bash
python3 {active-skill-resource-path}/cartography/scripts/cartographer.py update --root ./
```

### Step 4: Finalize Repository Atlas (Root Codemap)

Once all specific directories are mapped, the orchestrator must create or
update the root `codemap.md`. This file serves as the **Master Entry Point**
for any agent or human entering the repository.

1.  **Map Root Assets**: Document the root-level files (e.g., `package.json`, `index.ts`, `plugin.json`) and the project's overall purpose.
2.  **Aggregate Sub-Maps**: Create a "Repository Directory Map" section. For every folder that has a `codemap.md`, extract its **Responsibility** summary and include it in a table or list in the root map.
3.  **Cross-Reference**: Ensure that the root map contains the absolute or relative paths to the sub-maps so agents can jump directly to the relevant details.

### Step 5: Register Codemap in Active Harness Context

Register the root `codemap.md` in the active harness's automatically loaded
instruction/context surface so agents can discover and use the codemap.

For runtimes with a repo-root instruction surface, update or create that
surface to point agents at the root `codemap.md`:

1. If the surface already contains a `## Repository Map` section, skip this step.
2. If it exists but has no `## Repository Map` section, append the section below.
3. If it does not exist, create it with the section below.

```markdown
## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.
```

This is idempotent — repeated cartography runs will detect the existing section and skip. No duplication.

For runtimes without an equivalent automatically loaded surface, report that
automatic codemap registration is an unsupported capability and instruct the
user to include `codemap.md` manually in the loaded instruction/context
surface.


## Codemap Content

Explorer agents gather the technical findings; quick agents write the `codemap.md` files. Use precise technical terminology to document the implementation:

- **Responsibility** - Define the specific role of this directory using standard software engineering terms (e.g., "Service Layer", "Data Access Object", "Middleware").
- **Design Patterns** - Identify and name specific patterns used (e.g., "Observer", "Singleton", "Factory", "Strategy"). Detail the abstractions and interfaces.
- **Data & Control Flow** - Explicitly trace how data enters and leaves the module. Mention specific function call sequences and state transitions.
- **Integration Points** - List dependencies and consumer modules. Use technical names for hooks, events, or API endpoints.

Example codemap:

```markdown
# src/agents/

## Responsibility
Defines agent personalities and manages their configuration lifecycle.

## Design
Each agent is a prompt + permission set. Config system uses:
- Default prompts (orchestrator.ts, explorer.ts, etc.)
- User overrides from the runtime's user configuration store
- Permission wildcards for skill/MCP access control

## Flow
1. Plugin loads → calls getAgentConfigs()
2. Reads user config preset
3. Merges defaults with overrides
4. Applies permission rules (wildcard expansion)
5. Returns agent configs to the runtime

## Integration
- Consumed by: Main plugin (src/index.ts)
- Depends on: Config loader, skills registry
```

Example **Root Codemap (Atlas)**:

```markdown
# Repository Atlas: thoth-agents

## Project Responsibility
A high-performance, low-latency agent orchestration plugin, focusing on specialized sub-agent delegation and native task orchestration.

## System Entry Points
- `src/index.ts`: Plugin initialization and runtime integration.
- `package.json`: Dependency manifest and build scripts.
- `thoth-agents.json`: User configuration schema.

## Directory Map (Aggregated)
| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/agents/` | Defines agent personalities (Orchestrator, Explorer) and manages model routing. | [View Map](src/agents/codemap.md) |
| `src/features/` | Core logic for tmux integration, background task spawning, and session state. | [View Map](src/features/codemap.md) |
| `src/config/` | Implements the configuration loading pipeline and environment variable injection. | [View Map](src/config/codemap.md) |
```
