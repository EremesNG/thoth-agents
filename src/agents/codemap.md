# Agents Directory Codemap

## Responsibility

The `src/agents/` directory implements a multi-agent orchestration system for OpenCode. It defines specialized AI agents with distinct roles, capabilities, and behaviors that collaborate under an orchestrator to optimize coding tasks across quality, speed, cost, and reliability dimensions.

## Design

### Core Architecture

**Agent Definition Interface** (defined in `orchestrator.ts`)
```typescript
interface AgentDefinition {
  name: string;
  description?: string;
  config: AgentConfig;
  /** Priority-ordered model entries for runtime fallback resolution. */
  _modelArray?: Array<{ id: string; variant?: string }>;
}
```

All agents follow a consistent factory pattern:
- `createXAgent(model, customPrompt?, customAppendPrompt?)` → `AgentDefinition`
- Custom prompts can fully replace or append to default prompts
- Temperature varies by agent role (0.1-0.7) to balance precision vs creativity
- Model can be string or priority-ordered array for runtime fallback resolution

### Agent Classification

**Primary Agent**
- **Orchestrator**: Central coordinator that delegates tasks to specialists based on quality/speed/cost/reliability trade-offs

**Subagents** (6 specialized agents)
1. **Explorer** - Codebase navigation and pattern matching (temperature: 0.1)
2. **Librarian** - External documentation and library research (temperature: 0.1)
3. **Oracle** - Strategic technical advisor and architecture guidance (temperature: 0.1)
4. **Designer** - UI/UX design and implementation (temperature: 0.7)
5. **Quick** - Fast bounded implementation specialist (temperature: 0.2)
6. **Deep** - Thorough correctness-first implementation specialist (temperature: 0.1)

### Configuration System

**Override Application**
- Model and temperature can be overridden per agent via user config
- Model can be string or priority-ordered array for runtime fallback resolution
- Default models defined in `../config/DEFAULT_MODELS`

**Permission System**
- All agents get `question: 'allow'` by default
- Skill permissions applied via `getSkillPermissionsForAgent()`
- Nested permission structure: `{ question, skill: { ... } }`
- Supports per-agent skill lists via `configuredSkills` parameter

**Custom Prompts**
- Loaded via `loadAgentPrompt(name)` from config
- Supports full replacement or append mode
- Applied after default prompt construction

### Agent Specialization Matrix

| Agent | Primary Focus | Tools | Constraints | Temperature |
|-------|--------------|-------|-------------|-------------|
| Explorer | Codebase navigation | grep, glob, ast_grep_search | Read-only, parallel | 0.1 |
| Librarian | External docs | context7, grep_app, exa | Evidence-based, citations required | 0.1 |
| Oracle | Architecture guidance | Analysis tools, code review | Read-only, advisory | 0.1 |
| Designer | UI/UX implementation | Read/edit/write, browser verification | Visual verification ownership | 0.4 |
| Quick | Fast implementation | Read/edit/write, bash, diagnostics | No research/delegation, bounded scope | 0.2 |
| Deep | Thorough implementation | Read/edit/write, bash, diagnostics | No research/delegation, correctness-first | 0.1 |

## Flow

### Agent Creation Flow

```
createAgents(config?)
  │
  ├─→ For each subagent:
  │   ├─→ Get model from defaults
  │   ├─→ Load custom prompts
  │   ├─→ Call factory function
  │   ├─→ Apply overrides (model, temperature, variant)
  │   └─→ Apply default permissions (question: 'allow', skill permissions)
  │
  ├─→ Create orchestrator:
  │   ├─→ Get model (or leave unset for runtime resolution)
  │   ├─→ Load custom prompts
  │   ├─→ Call factory function
  │   ├─→ Apply overrides
  │   └─→ Apply default permissions
  │
  └─→ Return [orchestrator, ...subagents]
```

### SDK Configuration Flow

```
getAgentConfigs(config?)
  │
  ├─→ createAgents(config)
  │
  ├─→ For each agent:
  │   ├─→ Extract config
  │   ├─→ Add description
  │   ├─→ Add MCP list via getAgentMcpList()
  │   ├─→ Set mode:
  │   │   ├─→ 'primary' for orchestrator
  │   │   └─→ 'subagent' for others
  │   └─→ Map to Record<string, SDKAgentConfig>
  │
  └─→ Return config object
```

### Orchestrator Delegation Flow

```
User Request
    │
    ↓
Understand (parse requirements)
    │
    ↓
Path Analysis (quality, speed, cost, reliability)
    │
    ↓
Delegation Check
    │
    ├─→ Need to discover unknowns? → @explorer
    ├─→ Complex/evolving APIs? → @librarian
    ├─→ High-stakes decisions? → @oracle
    ├─→ User-facing polish? → @designer
    ├─→ UI/UX implementation? → @designer
    ├─→ Clear bounded implementation? → @quick
    └─→ Thorough correctness-critical implementation? → @deep
    │
    ↓
Parallelize (if applicable)
    │
    ├─→ Multiple @explorer searches?
    ├─→ @explorer + @librarian research?
    └─→ Independent read-only work in parallel?
    │
    ↓
Execute & Integrate
    │
    ↓
Verify (lsp_diagnostics, tests)
```

### Agent Interaction Patterns

**Research → Implementation Chain**
```
Orchestrator
    ↓ delegates to
Explorer (find files) + Librarian (get docs)
    ↓ provide context to
Quick or Deep (implement changes)
```

**Advisory Pattern**
```
Orchestrator
    ↓ delegates to
Oracle (architecture decision)
    ↓ provides guidance to
Orchestrator (delegates to Quick, Deep, or Designer)
```

**Design Pattern**
```
Orchestrator
    ↓ delegates to
Designer (UI/UX implementation)
```

## Integration

### Dependencies

**External Dependencies**
- `@opencode-ai/sdk` - Core agent configuration types (`AgentConfig`)
- `@modelcontextprotocol/sdk` - MCP protocol (via config)

**Internal Dependencies**
- `../config` - Agent overrides, default models, MCP lists, custom prompts
- `../cli/skills` - Skill permission system (`getSkillPermissionsForAgent`)

### Consumers

**Direct Consumers**
- `src/index.ts` - Main plugin entry point exports `getAgentConfigs()`
- `src/cli/index.ts` - CLI entry point uses agent configurations

**Indirect Consumers**
- OpenCode SDK - Consumes agent configurations via `getAgentConfigs()`
- MCP servers - Agents configured with specific MCP tool lists

### Configuration Integration

**Agent Override Config**
```typescript
interface AgentOverrideConfig {
  model?: string;
  temperature?: number;
  skills?: string[];
}
```

**Plugin Config**
```typescript
interface PluginConfig {
  agents?: {
    [agentName: string]: AgentOverrideConfig;
  };
  // ... other config
}
```

### Skill System Integration

Each agent gets skill-specific permissions:
- Permissions loaded from `../cli/skills`
- Applied via nested `skill` key in permissions object
- Respects user-configured skill lists if provided

### MCP Integration

Agents are configured with specific MCP tool lists:
- `getAgentMcpList(agentName, config)` returns tool list
- MCP tools enable agent capabilities (e.g., grep_app for Librarian)
- Configured per agent based on role and needs

## Key Design Decisions

1. **Factory Pattern**: Consistent agent creation with customization hooks
2. **Temperature Gradient**: 0.1 (precision) → 0.7 (creativity) based on role
3. **Read-Only Specialists**: Explorer, Librarian, and Oracle do not modify code
4. **Split Implementers**: Quick handles bounded work while Deep handles thorough implementation
5. **Permission Defaults**: All agents get `question: 'allow'` for smooth UX
6. **Custom Prompt Flexibility**: Full replacement or append mode for customization
7. **Delegate-First Orchestration**: Orchestrator coordinates instead of doing repo work inline
8. **Evidence-Based Research**: Librarian must provide sources and citations
9. **Visual Verification Ownership**: Designer decides, implements, and verifies user-facing work

## File Structure

```
src/agents/
├── index.ts          # Main entry point, agent factory registry, config application
├── index.test.ts     # Unit tests for agent creation and configuration
├── orchestrator.ts   # Orchestrator agent definition, delegation workflow, AgentDefinition interface
├── prompt-utils.ts   # Shared prompt composition helpers
├── explorer.ts       # Codebase navigation specialist
├── librarian.ts      # Documentation and library research specialist
├── oracle.ts         # Strategic technical advisor
├── designer.ts       # UI/UX design specialist
├── quick.ts          # Fast bounded implementation specialist
└── deep.ts           # Thorough implementation specialist
```

## Extension Points

**Adding New Agents**
1. Create `src/agents/newagent.ts` with `createNewAgent()` factory
2. Add to `SUBAGENT_FACTORIES` in `index.ts`
3. Add to `SUBAGENT_NAMES` in `../config`
4. Configure default model in `../config/DEFAULT_MODELS`
5. Add MCP configuration in `../config/agent-mcps`
6. Add skill permissions in `../cli/skills`

**Customizing Existing Agents**
- Override model/temperature via plugin config
- Replace or append to prompts via `loadAgentPrompt()`
- Configure MCP tools via agent-mcps config
- Adjust skill permissions via skills config
