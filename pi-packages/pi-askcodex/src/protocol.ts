/**
 * Hand-maintained app-server subset pinned to the spike's generate-ts bindings
 * and Desktop 0.162.0-alpha.17.2 wire captures. Not a complete Codex SDK.
 * Opaque JSON fields are deliberately not interpreted by this package.
 * app-server uses JSON-RPC envelopes without requiring a `jsonrpc` member.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };
export type RequestId = string | number;
export type JsonRpcError = { code: number; message: string; data?: JsonValue };
export type JsonRpcRequest<M extends string = string, P = unknown> = {
  jsonrpc?: '2.0';
  id: RequestId;
  method: M;
  params: P;
};
export type JsonRpcNotification<M extends string = string, P = unknown> = {
  jsonrpc?: '2.0';
  method: M;
  params: P;
};
export type JsonRpcResponse<R = unknown> =
  | { jsonrpc?: '2.0'; id: RequestId; result: R; error?: never }
  | { jsonrpc?: '2.0'; id: RequestId; error: JsonRpcError; result?: never };
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

export type InitializeParams = {
  clientInfo: { name: string; title: string | null; version: string };
  capabilities: {
    experimentalApi: boolean;
    requestAttestation: boolean;
    explicitGatewayOauth?: boolean;
    mcpServerOpenaiFormElicitation?: boolean;
    optOutNotificationMethods?: string[] | null;
    extensions?: Record<string, JsonValue> | null;
  } | null;
};
export type InitializeResponse = {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
};
export type AskForApproval =
  | 'untrusted'
  | 'on-request'
  | 'never'
  | {
      granular: {
        sandbox_approval: boolean;
        rules: boolean;
        skill_approval: boolean;
        request_permissions: boolean;
        mcp_elicitations: boolean;
      };
    };
export type ApprovalsReviewer = 'user' | 'auto_review' | 'guardian_subagent';
export type SandboxMode =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access';
export type SandboxPolicy =
  | { type: 'dangerFullAccess' }
  | { type: 'readOnly'; networkAccess: boolean }
  | { type: 'externalSandbox'; networkAccess: 'restricted' | 'enabled' }
  | {
      type: 'workspaceWrite';
      writableRoots: string[];
      networkAccess: boolean;
      excludeTmpdirEnvVar: boolean;
      excludeSlashTmp: boolean;
    };
export type ThreadStartParams = {
  cwd?: string | null;
  sandbox?: SandboxMode | null;
  approvalPolicy?: AskForApproval | null;
  approvalsReviewer?: ApprovalsReviewer | null;
  ephemeral?: boolean | null;
  model?: string | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
  config?: Record<string, JsonValue> | null;
};
export type ThreadResumeParams = Omit<ThreadStartParams, 'ephemeral'> & {
  threadId: string;
  excludeTurns?: boolean;
};
export type TextElement = {
  byteRange: { start: number; end: number };
  placeholder: string | null;
};
export type TextInput = {
  type: 'text';
  text: string;
  text_elements: TextElement[];
};
export type TurnStartParams = {
  threadId: string;
  input: TextInput[];
  model?: string | null;
  effort?: string | null;
  cwd?: string | null;
  sandboxPolicy?: SandboxPolicy | null;
  approvalPolicy?: AskForApproval | null;
  approvalsReviewer?: ApprovalsReviewer | null;
};
export type TurnInterruptParams = { threadId: string; turnId: string };

/** Projection: only item identity and agent text are consumed; retain other fields. */
export type ThreadItem = {
  type: string;
  id: string;
  text?: string;
  [key: string]: unknown;
};
export type TurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';
export type TurnError = {
  message: string;
  codexErrorInfo: JsonValue;
  additionalDetails: string | null;
  misalignment: JsonValue;
};
export type Turn = {
  id: string;
  rootTurnId: string | null;
  items: ThreadItem[];
  itemsView: 'notLoaded' | 'summary' | 'full';
  status: TurnStatus;
  error: TurnError | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
};
/** Thread metadata is opaque except for the durable continuation identifier. */
export type ThreadStartResponse = {
  thread: { id: string; [key: string]: unknown };
};
export type ThreadResumeResponse = ThreadStartResponse;
export type TurnStartResponse = { turn: Turn };
export type TurnInterruptResponse = Record<string, never>;
export type AgentMessageDeltaNotification = {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
};
export type ItemStartedNotification = {
  threadId: string;
  turnId: string;
  item: ThreadItem;
  startedAtMs: number;
};
export type ItemCompletedNotification = {
  threadId: string;
  turnId: string;
  item: ThreadItem;
  completedAtMs: number;
};
export type CommandExecutionOutputDeltaNotification =
  AgentMessageDeltaNotification;
export type TurnStartedNotification = { threadId: string; turn: Turn };
export type TurnCompletedNotification = TurnStartedNotification;
export type TurnPlanUpdatedNotification = {
  threadId: string;
  turnId: string;
  explanation: string | null;
  plan: { step: string; status: 'pending' | 'inProgress' | 'completed' }[];
};
export type TurnDiffUpdatedNotification = {
  threadId: string;
  turnId: string;
  diff: string;
};
export type TokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};
export type ThreadTokenUsage = {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
};
export type ThreadTokenUsageUpdatedNotification = {
  threadId: string;
  turnId: string;
  tokenUsage: ThreadTokenUsage;
};
export type ErrorNotification = {
  threadId: string;
  turnId: string;
  error: TurnError;
  willRetry: boolean;
};
export type ServerNotificationParams = {
  'item/agentMessage/delta': AgentMessageDeltaNotification;
  'item/started': ItemStartedNotification;
  'item/completed': ItemCompletedNotification;
  'item/commandExecution/outputDelta': CommandExecutionOutputDeltaNotification;
  'turn/started': TurnStartedNotification;
  'turn/completed': TurnCompletedNotification;
  'turn/plan/updated': TurnPlanUpdatedNotification;
  'turn/diff/updated': TurnDiffUpdatedNotification;
  'thread/tokenUsage/updated': ThreadTokenUsageUpdatedNotification;
  error: ErrorNotification;
};
export type ServerNotification = {
  [M in keyof ServerNotificationParams]: JsonRpcNotification<
    M,
    ServerNotificationParams[M]
  >;
}[keyof ServerNotificationParams];

/** Observed computer-use metadata; untrusted until validated by approval policy. */
export type ComputerUseElicitationMeta = {
  connector_id: 'computer-use';
  persist: ('session' | 'always')[];
  tool_params: { app: string; [key: string]: JsonValue | undefined };
  [key: string]: JsonValue | undefined;
};
export type McpServerElicitationRequestParams = {
  threadId: string;
  turnId: string | null;
  serverName: string;
} & (
  | {
      mode: 'form' | 'openai/form' | 'openaiForm';
      _meta: JsonValue;
      message: string;
      requestedSchema: JsonValue;
    }
  | {
      mode: 'url';
      _meta: JsonValue;
      message: string;
      url: string;
      elicitationId: string;
    }
  | {
      mode: 'openai/userVerification';
      _meta: JsonValue;
      title: string;
      description: string;
      challenge: string;
    }
);
export type McpServerElicitationRequestResponse = {
  action: 'accept' | 'decline' | 'cancel';
  content?: JsonValue;
  _meta: JsonValue;
};
export type ExecPolicyAmendment = string[];
export type NetworkPolicyAmendment = { host: string; action: 'allow' | 'deny' };
export type CommandExecutionApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel'
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: ExecPolicyAmendment;
      };
    }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: NetworkPolicyAmendment;
      };
    };
export type FileChangeApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel';
export type FileSystemSpecialPath =
  | { kind: 'root' | 'minimal' | 'tmpdir' | 'slash_tmp' }
  | { kind: 'project_roots'; subpath: string | null }
  | { kind: 'unknown'; path: string; subpath: string | null };
export type FileSystemSandboxEntry = {
  path:
    | { type: 'path'; path: string }
    | { type: 'glob_pattern'; pattern: string }
    | { type: 'special'; value: FileSystemSpecialPath };
  access: 'read' | 'write' | 'deny';
};
export type AdditionalFileSystemPermissions = {
  read: string[] | null;
  write: string[] | null;
  globScanMaxDepth?: number;
  entries?: FileSystemSandboxEntry[];
};
export type AdditionalNetworkPermissions = { enabled: boolean | null };
export type RequestPermissionProfile = {
  network: AdditionalNetworkPermissions | null;
  fileSystem: AdditionalFileSystemPermissions | null;
};
export type GrantedPermissionProfile = {
  network?: AdditionalNetworkPermissions;
  fileSystem?: AdditionalFileSystemPermissions;
};
export type CommandExecutionRequestApprovalParams = {
  kind: 'command' | 'writeStdin';
  threadId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number;
  environmentId: string | null;
  approvalId?: string | null;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  networkApprovalContext?: JsonValue;
  commandActions?: JsonValue[] | null;
  additionalPermissions?: RequestPermissionProfile | null;
  proposedExecpolicyAmendment?: ExecPolicyAmendment | null;
  proposedNetworkPolicyAmendments?: NetworkPolicyAmendment[] | null;
  availableDecisions?: CommandExecutionApprovalDecision[] | null;
};
export type CommandExecutionRequestApprovalResponse = {
  decision: CommandExecutionApprovalDecision;
};
export type FileChangeRequestApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number;
  reason?: string | null;
  grantRoot?: string | null;
};
export type FileChangeRequestApprovalResponse = {
  decision: FileChangeApprovalDecision;
};
export type PermissionsRequestApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  environmentId: string | null;
  startedAtMs: number;
  cwd: string;
  reason: string | null;
  permissions: RequestPermissionProfile;
};
export type PermissionsRequestApprovalResponse = {
  permissions: GrantedPermissionProfile;
  scope: 'turn' | 'session';
  strictAutoReview?: boolean;
};
/**
 * The client normalizes unrecognized wire methods to `unknown`, preserving the
 * original method for reporting. This avoids a string fallback swallowing the
 * known-method discriminants. Unknown requests must get a JSON-RPC error.
 */
export type UnknownServerRequest = JsonRpcRequest<'unknown'> & {
  originalMethod: string;
};
export type ServerRequest =
  | JsonRpcRequest<
      'mcpServer/elicitation/request',
      McpServerElicitationRequestParams
    >
  | JsonRpcRequest<
      'item/commandExecution/requestApproval',
      CommandExecutionRequestApprovalParams
    >
  | JsonRpcRequest<
      'item/fileChange/requestApproval',
      FileChangeRequestApprovalParams
    >
  | JsonRpcRequest<
      'item/permissions/requestApproval',
      PermissionsRequestApprovalParams
    >
  | UnknownServerRequest;
/** Success values are sent as `result`; the error variant is sent as `error`. */
export type ServerRequestResponse =
  | McpServerElicitationRequestResponse
  | CommandExecutionRequestApprovalResponse
  | FileChangeRequestApprovalResponse
  | PermissionsRequestApprovalResponse
  | { error: JsonRpcError };
export type ServerRequestHandler = (
  req: ServerRequest,
  ctx: { signal: AbortSignal },
) => Promise<ServerRequestResponse>;
