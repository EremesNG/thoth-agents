// Agent names
type BuiltinAgentName =
  | 'orchestrator'
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'quick'
  | 'deep';

export type AgentName = BuiltinAgentName | (string & {});

export const SUBAGENT_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
] as const satisfies readonly Exclude<BuiltinAgentName, 'orchestrator'>[];

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

export const CONFIRMED_OPENAI_SUBAGENT_PRESET = {
  explorer: { model: 'gpt-5.6-luna', effort: 'low' },
  librarian: { model: 'gpt-5.6-luna', effort: 'high' },
  oracle: { model: 'gpt-5.6-sol', effort: 'high' },
  designer: { model: 'gpt-5.6-sol', effort: 'medium' },
  quick: { model: 'gpt-5.6-luna', effort: 'low' },
  deep: { model: 'gpt-5.6-sol', effort: 'medium' },
} as const satisfies Record<
  Exclude<BuiltinAgentName, 'orchestrator'>,
  { model: string; effort: string }
>;

export const OPENCODE_OPENAI_ORCHESTRATOR_PRESET = {
  model: 'gpt-5.6-sol',
  effort: 'xhigh',
} as const;

// Default models for each agent. OpenCode requires provider-qualified IDs,
// while the confirmed preset remains providerless for Codex.
// orchestrator is undefined so its model is fully resolved at runtime via priority fallback
function buildDefaultModels(): Record<AgentName, string | undefined> {
  const defaults: Record<AgentName, string | undefined> = {
    orchestrator: undefined,
    explorer: undefined,
    librarian: undefined,
    oracle: undefined,
    designer: undefined,
    quick: undefined,
    deep: undefined,
  };

  for (const [name, { model }] of Object.entries(
    CONFIRMED_OPENAI_SUBAGENT_PRESET,
  )) {
    defaults[name] = `openai/${model}`;
  }

  return defaults;
}

export const DEFAULT_MODELS = buildDefaultModels();

export function getDefaultOpenCodeModel(name: BuiltinAgentName): string {
  const subagentModel = DEFAULT_MODELS[name];
  if (subagentModel !== undefined) {
    return subagentModel;
  }

  return `openai/${OPENCODE_OPENAI_ORCHESTRATOR_PRESET.model}`;
}

export function getDefaultOpenCodeVariant(name: BuiltinAgentName): string {
  if (name === ORCHESTRATOR_NAME) {
    return OPENCODE_OPENAI_ORCHESTRATOR_PRESET.effort;
  }

  return CONFIRMED_OPENAI_SUBAGENT_PRESET[name].effort;
}

// Polling configuration
export const POLL_INTERVAL_MS = 500;
export const POLL_INTERVAL_SLOW_MS = 1000;
export const POLL_INTERVAL_BACKGROUND_MS = 2000;

// Timeouts
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const FALLBACK_FAILOVER_TIMEOUT_MS = 15_000;

// Polling stability
export const STABLE_POLLS_THRESHOLD = 3;
