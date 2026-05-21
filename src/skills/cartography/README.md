# Cartography Skill

Repository understanding and hierarchical codemap generation.

## Overview

Cartography helps orchestrators map and understand codebases by:

1. Selecting relevant code/config files using LLM judgment
2. Creating `.lite/cartography.json` for change tracking
3. Generating empty `codemap.md` templates for explorers to fill in

## Commands

Use the active harness's installed skill script path for `cartographer.py`.
`thoth-agents` is the canonical skill identity; adapter bindings only decide
where scripts are installed and which instruction/context surface is
automatically loaded.

Example script path:

```bash
[scripts/cartographer.py](scripts/cartographer.py)
```

```bash
# Initialize mapping
python3 {active-skill-resource-path}/cartography/scripts/cartographer.py init --root /repo --include "src/**/*.ts" --exclude "node_modules/**"

# Check what changed
python3 {active-skill-resource-path}/cartography/scripts/cartographer.py changes --root /repo

# Update hashes
python3 {active-skill-resource-path}/cartography/scripts/cartographer.py update --root /repo
```

## Outputs

### .lite/cartography.json

```json
{
  "metadata": {
    "version": "1.0.0",
    "last_run": "2026-01-25T19:00:00Z",
    "include_patterns": ["src/**/*.ts"],
    "exclude_patterns": ["node_modules/**"]
  },
  "file_hashes": {
    "src/index.ts": "abc123..."
  },
  "folder_hashes": {
    "src": "def456..."
  }
}
```

### codemap.md (per folder)

Empty templates created in each folder for explorers to fill with:
- Responsibility
- Design patterns
- Data/control flow
- Integration points

### Codemap registration

Place or register the root `codemap.md` reference in the active harness's
automatically loaded instruction/context surface.

For runtimes with a repo-root instruction surface, add a `## Repository Map`
section that points agents to the root `codemap.md`.

For other harnesses, use the equivalent automatically loaded context surface.
If the harness does not support one, report an unsupported-capability or
manual-inclusion diagnostic and instruct the user to include `codemap.md`
manually.

## Installation

Installed automatically via thoth-agents installer when custom skills are enabled.
