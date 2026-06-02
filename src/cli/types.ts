export type BooleanArg = 'yes' | 'no';
export type InstallAgent = 'opencode' | 'codex' | 'claude';

export interface InstallArgs {
  tui: boolean;
  agent?: InstallAgent;
  tmux?: BooleanArg;
  skills?: BooleanArg;
  dryRun?: boolean;
  reset?: boolean;
}

export interface GenerateArgs {
  harness: 'codex' | 'claude';
  dryRun?: boolean;
  outputRoot?: string;
}

export type OperationHarnessArg = 'opencode' | 'codex' | 'claude';

export interface CliModelRoleArg {
  role: string;
  model: string;
  provider?: string;
}

export interface OperationArgs {
  harness?: OperationHarnessArg;
  all?: boolean;
  apply?: boolean;
  dryRun?: boolean;
  roles: CliModelRoleArg[];
}

export type CliOperationCommand =
  | 'status'
  | 'list'
  | 'update'
  | 'sync'
  | 'model';

export type CliParseResult =
  | { command: 'install'; installArgs: InstallArgs }
  | { command: 'generate'; generateArgs: GenerateArgs }
  | { command: 'tui' }
  | { command: CliOperationCommand; operationArgs: OperationArgs }
  | { command: 'help' }
  | { command: 'error'; message: string };

export interface OpenCodeConfig {
  plugin?: string[];
  provider?: Record<string, unknown>;
  agent?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface InstallConfig {
  agent: InstallAgent;
  hasTmux: boolean;
  installSkills: boolean;
  installCustomSkills: boolean;
  dryRun?: boolean;
  reset: boolean;
}

export interface ConfigMergeResult {
  success: boolean;
  configPath: string;
  error?: string;
}

export interface DetectedConfig {
  isInstalled: boolean;
  hasKimi: boolean;
  hasOpenAI: boolean;
  hasAnthropic?: boolean;
  hasCopilot?: boolean;
  hasZaiPlan?: boolean;
  hasAntigravity: boolean;
  hasChutes?: boolean;
  hasOpencodeZen: boolean;
  hasTmux: boolean;
}
