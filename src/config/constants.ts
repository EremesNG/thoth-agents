// Agent names
export const AGENT_ALIASES: Record<string, string> = {
  explore: 'explorer',
  'frontend-ui-ux-engineer': 'designer',
};

type BuiltinAgentName =
  | 'orchestrator'
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'quick'
  | 'deep';

export type AgentName = BuiltinAgentName | (string & {});

export const SUBAGENT_NAMES: readonly string[] = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
];

export const ORCHESTRATOR_NAME = 'orchestrator' as const;

export const ALL_AGENT_NAMES: readonly BuiltinAgentName[] = [
  ORCHESTRATOR_NAME,
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
];

// Subagent delegation rules: which agents can spawn which subagents
// orchestrator: can spawn all subagents (full delegation)
// quick/deep/designer: leaf nodes — no default delegation
// explorer/librarian/oracle: cannot spawn any subagents (leaf nodes)
// Unknown agent types not listed here default to explorer-only access
export const SUBAGENT_DELEGATION_RULES: Record<AgentName, readonly string[]> = {
  orchestrator: SUBAGENT_NAMES,
  designer: [],
  explorer: [],
  librarian: [],
  oracle: [],
  quick: [],
  deep: [],
};

// Default models for each agent
// orchestrator is undefined so its model is fully resolved at runtime via priority fallback
export const DEFAULT_MODELS: Record<AgentName, string | undefined> = {
  orchestrator: undefined,
  oracle: 'openai/gpt-5.4',
  librarian: 'openai/gpt-5.4-mini',
  explorer: 'openai/gpt-5.4-mini',
  designer: 'openai/gpt-5.4-mini',
  quick: 'openai/gpt-5.4-mini',
  deep: 'openai/gpt-5.4',
};

// Polling configuration
export const POLL_INTERVAL_MS = 500;
export const POLL_INTERVAL_SLOW_MS = 1000;
export const POLL_INTERVAL_BACKGROUND_MS = 2000;

// Timeouts
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const FALLBACK_FAILOVER_TIMEOUT_MS = 15_000;

// Thoth defaults
export const DEFAULT_THOTH_COMMAND = ['npx', '-y', 'thoth-mem@latest'];

// Polling stability
export const STABLE_POLLS_THRESHOLD = 3;
