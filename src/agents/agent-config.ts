/** Internal role-rendering input; translated to the host's v2 Agent.Info at registration. */
export interface AgentConfig {
  model?: string;
  variant?: string;
  temperature?: number;
  prompt?: string;
  description?: string;
  mode?: 'primary' | 'subagent' | 'all';
  hidden?: boolean;
  color?: string;
  steps?: number;
  permission?:
    | 'allow'
    | 'ask'
    | 'deny'
    | Record<
        string,
        'allow' | 'ask' | 'deny' | Record<string, 'allow' | 'ask' | 'deny'>
      >;
}
