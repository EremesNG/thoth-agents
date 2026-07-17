import type { HarnessArtifactKind, HarnessDiagnostic } from '../types';

export type CodexSurfaceStatus = 'validated' | 'unsupported' | 'unknown';

export type CodexArtifactTarget =
  | 'agent-definition'
  | 'config'
  | 'mcp-config'
  | 'plugin-manifest'
  | 'skill-directory'
  | 'hook-config'
  | 'permission-control'
  | 'delegation-runtime'
  | 'parent-context-injection';

export interface CodexSurfaceRecord {
  id: string;
  target: CodexArtifactTarget;
  status: CodexSurfaceStatus;
  artifactKind?: HarnessArtifactKind;
  path?: string;
  fields: string[];
  diagnosticCode: string;
  summary: string;
  evidence: string;
  fallback?: 'instruction-only' | 'diagnostic-only' | 'none';
}

export type CodexHookEvent =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'Stop';

export type CodexHookHandlerType = 'command' | 'prompt' | 'agent';

export interface CodexHookValidationInput {
  event: string;
  handler?: {
    type?: string;
    command?: unknown;
    prompt?: unknown;
    agent?: unknown;
    async?: unknown;
  };
  outputFields?: readonly string[];
  interceptsToolExecution?: boolean;
}

export type CodexHookValidationResult =
  | {
      ok: true;
      event: CodexHookEvent;
      handlerType: 'command';
    }
  | { ok: false; diagnostics: HarnessDiagnostic[] };

const CODEX_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'Stop',
] as const satisfies readonly CodexHookEvent[];

const SUPPORTED_CODEX_HOOK_OUTPUT_FIELDS = ['message'] as const;

export const CODEX_PLUGIN_MANIFEST_FIELDS = [
  'name',
  'version',
  'description',
  'skills',
  'mcpServers',
  'apps',
  'hooks',
  'interface',
] as const;

export const CODEX_SURFACES = [
  {
    id: 'project-agent-toml',
    target: 'agent-definition',
    status: 'validated',
    artifactKind: 'agent-config',
    path: '.codex/agents/{name}.toml',
    fields: [
      'name',
      'description',
      'developer_instructions',
      'model',
      'model_reasoning_effort',
      'sandbox_mode',
    ],
    diagnosticCode: 'codex.surface.agent_definition.validated',
    summary: 'Project-scoped custom agents are standalone TOML files.',
    evidence:
      'OpenAI Codex Subagents docs: ~/.codex/agents/ and .codex/agents/ with required name, description, developer_instructions.',
  },
  {
    id: 'project-config-toml',
    target: 'config',
    status: 'validated',
    artifactKind: 'harness-config',
    path: '.codex/config.toml',
    fields: [
      'model',
      'model_reasoning_effort',
      'approval_policy',
      'sandbox_mode',
      'features',
      'mcp_servers',
      'skills.config',
      'agents',
    ],
    diagnosticCode: 'codex.surface.config.validated',
    summary: 'Codex supports project-scoped config TOML after trust.',
    evidence:
      'OpenAI Codex Configuration Reference: ~/.codex/config.toml and project .codex/config.toml overrides.',
  },
  {
    id: 'mcp-server-config',
    target: 'mcp-config',
    status: 'validated',
    artifactKind: 'mcp-config',
    path: '.codex/config.toml',
    fields: ['mcp_servers.<id>', 'url', 'command', 'args', 'env', 'tools'],
    diagnosticCode: 'codex.surface.mcp.validated',
    summary: 'MCP servers are configured through Codex config TOML.',
    evidence:
      'OpenAI Codex config docs describe mcp_servers and per-tool approval overrides.',
  },
  {
    id: 'repo-skills-directory',
    target: 'skill-directory',
    status: 'validated',
    artifactKind: 'skill',
    path: '.agents/skills/{skill}/SKILL.md',
    fields: ['SKILL.md', 'scripts/', 'references/', 'assets/'],
    diagnosticCode: 'codex.surface.skills.validated',
    summary: 'Repository skills are discovered from .agents/skills.',
    evidence:
      'OpenAI Codex Skills docs: repo skills are scanned from .agents/skills up to the repository root.',
  },
  {
    id: 'project-hooks-json',
    target: 'hook-config',
    status: 'validated',
    artifactKind: 'hook-config',
    path: '.codex/hooks.json',
    fields: [
      'SessionStart.command',
      'UserPromptSubmit.command',
      'PreToolUse.command',
      'PermissionRequest.command',
      'PostToolUse.command',
      'Stop.command',
    ],
    diagnosticCode: 'codex.surface.hooks_json.validated',
    summary: 'Codex supports project-local hooks.json command handlers.',
    evidence:
      'OpenAI Codex hooks docs describe hooks.json with SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, and Stop command handlers.',
  },
  {
    id: 'inline-hooks-table',
    target: 'hook-config',
    status: 'validated',
    artifactKind: 'hook-config',
    path: '.codex/config.toml',
    fields: [
      'hooks.SessionStart.command',
      'hooks.UserPromptSubmit.command',
      'hooks.PreToolUse.command',
      'hooks.PermissionRequest.command',
      'hooks.PostToolUse.command',
      'hooks.Stop.command',
    ],
    diagnosticCode: 'codex.surface.inline_hooks.validated',
    summary: 'Codex supports inline [hooks] configuration in TOML.',
    evidence:
      'OpenAI Codex configuration docs describe inline [hooks] settings gated by trusted project configuration.',
  },
  {
    id: 'features-hooks-toggle',
    target: 'hook-config',
    status: 'validated',
    artifactKind: 'hook-config',
    path: '.codex/config.toml',
    fields: ['features.hooks'],
    diagnosticCode: 'codex.surface.features_hooks.validated',
    summary: 'Codex hook loading is controlled by the features.hooks toggle.',
    evidence:
      'OpenAI Codex configuration docs require enabling [features].hooks before project hook configuration is active.',
  },
  {
    id: 'plugin-hooks-bundle',
    target: 'hook-config',
    status: 'validated',
    artifactKind: 'hook-config',
    path: '.codex/plugins/{plugin}/hooks.json',
    fields: ['features.plugin_hooks', 'plugin.hooks', 'plugin.trust_review'],
    diagnosticCode: 'codex.surface.plugin_hooks.validated',
    summary:
      'Codex plugin hook bundles are documented behind plugin hook feature and trust review gates.',
    evidence:
      'OpenAI Codex plugin docs describe bundled hook configuration requiring plugin_hooks enablement and trust review.',
  },
  {
    id: 'plugin-manifest-json',
    target: 'plugin-manifest',
    status: 'validated',
    artifactKind: 'manifest',
    path: '.codex-plugin/plugin.json',
    fields: [...CODEX_PLUGIN_MANIFEST_FIELDS],
    diagnosticCode: 'codex.surface.plugin_manifest.validated',
    summary:
      'Codex plugin packages are described by a plugin-root plugin.json manifest.',
    evidence:
      'OpenAI Codex plugin docs describe plugin.json with official fields including name, version, description, skills, mcpServers, apps, hooks, and interface.',
  },
  {
    id: 'plugin-skills-directory',
    target: 'skill-directory',
    status: 'validated',
    artifactKind: 'skill',
    path: '.codex-plugin/skills/{skill}/SKILL.md',
    fields: ['skills', './skills/'],
    diagnosticCode: 'codex.surface.plugin_skills.validated',
    summary:
      'Codex plugin packages can bundle skills under plugin-root skills/.',
    evidence:
      'OpenAI Codex plugin docs describe plugin-bundled skills referenced from plugin.json using plugin-root relative paths.',
  },
  {
    id: 'plugin-hooks-json',
    target: 'hook-config',
    status: 'validated',
    artifactKind: 'hook-config',
    path: '.codex-plugin/hooks/hooks.json',
    fields: ['hooks', './hooks/hooks.json'],
    diagnosticCode: 'codex.surface.plugin_hooks_json.validated',
    summary:
      'Codex plugin packages can bundle hook configuration under plugin-root hooks/.',
    evidence:
      'OpenAI Codex plugin docs describe hook bundle assets referenced from plugin.json and gated by plugin_hooks plus trust review.',
  },
  {
    id: 'plugin-mcp-json',
    target: 'mcp-config',
    status: 'validated',
    artifactKind: 'mcp-config',
    path: '.codex-plugin/.mcp.json',
    fields: ['mcpServers', './.mcp.json'],
    diagnosticCode: 'codex.surface.plugin_mcp_json.validated',
    summary:
      'Codex plugin packages can bundle MCP server definitions in plugin-root .mcp.json.',
    evidence:
      'OpenAI Codex plugin docs describe bundled .mcp.json server definitions referenced from plugin.json using plugin-root relative paths.',
  },
  {
    id: 'inline-hooks',
    target: 'hook-config',
    status: 'unknown',
    artifactKind: 'hook-config',
    fields: ['features.hooks', 'hooks'],
    diagnosticCode: 'codex.surface.hooks.unvalidated',
    summary:
      'Lifecycle hook availability is documented, but hook event shape and parity with OpenCode runtime hooks is not validated for this adapter.',
    evidence:
      'Codex config reference mentions hooks; this implementation has not validated exact event schemas for plugin parity.',
    fallback: 'diagnostic-only',
  },
  {
    id: 'per-agent-runtime-permissions',
    target: 'permission-control',
    status: 'unsupported',
    fields: ['per-agent tool allow/deny equivalent to OpenCode permissions'],
    diagnosticCode: 'codex.permission.memory.enforcement_gap',
    summary:
      'Codex sandbox and approval policy can constrain sessions, but OpenCode-style per-agent MCP/tool deny maps are not validated.',
    evidence:
      'Codex approvals/security docs cover sandbox and approval policies, not exact OpenCode per-agent permission maps.',
    fallback: 'instruction-only',
  },
  {
    id: 'programmatic-delegation-runtime',
    target: 'delegation-runtime',
    status: 'unsupported',
    fields: [
      'task API',
      'background task sessions',
      'tmux lifecycle hooks',
      'terminal-state detection',
      'same-session status probing',
      'result-quality retry accounting',
      'automatic subagent session close',
    ],
    diagnosticCode: 'codex.delegation.runtime.unsupported',
    summary:
      'Codex subagents are user/instruction-triggered; terminal-state detection, same-session status probing, retry accounting, and automatic subagent session close remain instruction-only because no OpenCode plugin task API parity is validated.',
    evidence:
      'Codex subagent guidance describes manual spawning and agent threads, not a validated runtime binding for terminal status, retry accounting, status payloads, or automatic close.',
    fallback: 'instruction-only',
  },
  {
    id: 'parent-context-injection',
    target: 'parent-context-injection',
    status: 'unknown',
    fields: ['parent session_id', 'project'],
    diagnosticCode: 'codex.context.parent_injection.unvalidated',
    summary:
      'No machine-enforced parent context injection mechanism is validated; prompts must instruct users to include parent session_id/project.',
    evidence:
      'No validated Codex surface in Phase 1 proves automatic parent context injection into spawned agents.',
    fallback: 'instruction-only',
  },
] as const satisfies readonly CodexSurfaceRecord[];

export function getCodexSurfaceRecords(): CodexSurfaceRecord[] {
  return CODEX_SURFACES.map((surface) => ({
    ...surface,
    fields: [...surface.fields],
  }));
}

export function getCodexSurface(id: string): CodexSurfaceRecord | undefined {
  return getCodexSurfaceRecords().find((surface) => surface.id === id);
}

export function getValidatedCodexArtifactTargets(): CodexSurfaceRecord[] {
  return getCodexSurfaceRecords().filter(
    (surface) => surface.status === 'validated' && surface.artifactKind,
  );
}

export function assertCodexSurfaceCanGenerate(
  id: string,
):
  | { ok: true; surface: CodexSurfaceRecord }
  | { ok: false; diagnostic: HarnessDiagnostic } {
  const surface = getCodexSurface(id);

  if (!surface) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'harness.surface_unvalidated',
        message: `Codex surface "${id}" is not registered and cannot generate artifacts.`,
        harness: 'codex',
        surface: id,
        fallback: 'diagnostic-only',
      },
    };
  }

  if (surface.status !== 'validated' || !surface.artifactKind) {
    return {
      ok: false,
      diagnostic: codexSurfaceDiagnostic(surface),
    };
  }

  return { ok: true, surface };
}

export function codexSurfaceDiagnostic(
  surface: CodexSurfaceRecord,
): HarnessDiagnostic {
  const severity = surface.status === 'unsupported' ? 'warning' : 'error';

  return {
    severity,
    code: surface.diagnosticCode,
    message: `${surface.summary} Artifact generation is disabled for this surface.`,
    harness: 'codex',
    surface: surface.id,
    fallback: surface.fallback ?? 'diagnostic-only',
  };
}

function normalizeCodexPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function codexPluginPackageDiagnostic(
  code: string,
  message: string,
  surface: string,
): HarnessDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    harness: 'codex',
    surface,
    fallback: 'diagnostic-only',
  };
}

function isPathUnderCodexPlugin(pathValue: string): boolean {
  const normalized = normalizeCodexPath(pathValue);
  const segments = normalized.split('/');
  return (
    !normalized.startsWith('/') &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !segments.includes('..') &&
    (normalized === '.codex-plugin' ||
      normalized === '.codex-plugin/' ||
      normalized.startsWith('.codex-plugin/'))
  );
}

function fieldAllowedForPluginSurface(
  surface: CodexSurfaceRecord,
  field: string,
): boolean {
  if (surface.id === 'plugin-manifest-json') {
    return CODEX_PLUGIN_MANIFEST_FIELDS.includes(
      field as (typeof CODEX_PLUGIN_MANIFEST_FIELDS)[number],
    );
  }

  return surface.fields.includes(field);
}

export function validateCodexPluginPackageSurface(input: {
  surfaceId: string;
  path?: string;
  fields?: readonly string[];
}):
  | { ok: true; surface: CodexSurfaceRecord }
  | { ok: false; diagnostics: HarnessDiagnostic[] } {
  const canGenerate = assertCodexSurfaceCanGenerate(input.surfaceId);
  if (!canGenerate.ok) {
    return {
      ok: false,
      diagnostics: [
        {
          ...canGenerate.diagnostic,
          code: 'codex.plugin.surface.unvalidated',
          message: `Codex plugin package surface "${input.surfaceId}" is not validated for .codex-plugin artifacts.`,
        },
      ],
    };
  }

  const diagnostics: HarnessDiagnostic[] = [];
  const surface = canGenerate.surface;

  if (!surface.path?.startsWith('.codex-plugin')) {
    diagnostics.push(
      codexPluginPackageDiagnostic(
        'codex.plugin.surface.unvalidated',
        `Codex surface "${input.surfaceId}" is validated, but not as a .codex-plugin package surface.`,
        input.surfaceId,
      ),
    );
  }

  if (input.path && !isPathUnderCodexPlugin(input.path)) {
    diagnostics.push(
      codexPluginPackageDiagnostic(
        'codex.plugin.path.unvalidated',
        `Codex plugin package path "${input.path}" must stay under .codex-plugin/.`,
        input.surfaceId,
      ),
    );
  }

  for (const field of input.fields ?? []) {
    if (!fieldAllowedForPluginSurface(surface, field)) {
      diagnostics.push(
        codexPluginPackageDiagnostic(
          'codex.plugin.field.unvalidated',
          `Codex plugin field "${field}" is not validated for surface "${input.surfaceId}".`,
          input.surfaceId,
        ),
      );
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, surface };
}

function isCodexHookEvent(event: string): event is CodexHookEvent {
  return CODEX_HOOK_EVENTS.includes(event as CodexHookEvent);
}

function codexHookDiagnostic(code: string, message: string): HarnessDiagnostic {
  return {
    severity: 'warning',
    code,
    message,
    harness: 'codex',
    surface: 'hook-config',
    fallback: 'diagnostic-only',
  };
}

function inferHookHandlerType(
  handler: CodexHookValidationInput['handler'],
): string | undefined {
  if (!handler) return undefined;
  if (typeof handler.type === 'string') return handler.type;
  if ('command' in handler) return 'command';
  if ('prompt' in handler) return 'prompt';
  if ('agent' in handler) return 'agent';
  return undefined;
}

export function validateCodexHookSurface(
  input: CodexHookValidationInput,
): CodexHookValidationResult {
  const diagnostics: HarnessDiagnostic[] = [];
  const handlerType = inferHookHandlerType(input.handler);

  if (!isCodexHookEvent(input.event)) {
    diagnostics.push(
      codexHookDiagnostic(
        'codex.hooks.event.unsupported',
        `Codex hook event "${input.event}" is not documented for this adapter.`,
      ),
    );
  }

  if (handlerType !== 'command') {
    diagnostics.push(
      codexHookDiagnostic(
        handlerType === 'prompt'
          ? 'codex.hooks.handler.prompt_unsupported'
          : handlerType === 'agent'
            ? 'codex.hooks.handler.agent_unsupported'
            : 'codex.hooks.handler.unsupported',
        `Codex hook handler "${handlerType ?? 'unknown'}" is not supported; only command handlers are validated.`,
      ),
    );
  }

  if (input.handler?.async === true) {
    diagnostics.push(
      codexHookDiagnostic(
        'codex.hooks.async.unsupported',
        'Async Codex hook execution is not validated for this adapter.',
      ),
    );
  }

  const unsupportedOutputField = input.outputFields?.find(
    (field) => !SUPPORTED_CODEX_HOOK_OUTPUT_FIELDS.includes(field as 'message'),
  );

  if (unsupportedOutputField) {
    diagnostics.push(
      codexHookDiagnostic(
        'codex.hooks.output_field.unsupported',
        `Codex hook output field "${unsupportedOutputField}" is not supported by the validated hook surface.`,
      ),
    );
  }

  if (input.interceptsToolExecution) {
    diagnostics.push(
      codexHookDiagnostic(
        'codex.hooks.tool_interception.unsupported',
        'Full tool interception is not supported; Codex hooks are diagnostic/config surfaces, not OpenCode runtime enforcement hooks.',
      ),
    );
  }

  if (diagnostics.length > 0 || !isCodexHookEvent(input.event)) {
    return { ok: false, diagnostics };
  }

  return { ok: true, event: input.event, handlerType: 'command' };
}
