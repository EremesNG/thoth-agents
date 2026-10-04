import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter as parseYamlFrontmatter } from '@earendil-works/pi-coding-agent';
import type {
  ModelRef,
  SubagentDefinition,
  SubagentDefinitionScope,
  SubagentMode,
  SubagentModelProfile,
  SubagentModelProfiles,
  SubagentSessionResources,
  SubagentsConfig,
  ThinkingEffort,
} from './types.js';

const DEFAULT_TOOLS = [
  'read',
  'memory_context',
  'memory_search',
  'memory_recall',
  'memory_get',
];
export const DEFAULT_LIFECYCLE_PASSTHROUGH = [
  '@thoth-agents/pi-claude-bridge',
  '@thoth-agents/pi-antigravity-bridge',
  '@thoth-agents/pi-background-tasks',
  '@thoth-agents/pi-openai-fast',
];
const DEFAULT_MAX_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_STALL_TIMEOUT_MS = 4 * 60 * 1000;
export const DEFAULT_ASK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BACKGROUND_HANDOFF_SHORTCUT = 'ctrl+h';
const DEFAULT_HISTORY_PANEL_SHORTCUT = 'ctrl+,';
const DEFAULT_DETAIL_CANCEL_SHORTCUT = 'x';
const DEFAULT_RENDER_DEBUG_LOG_PATH = path.join(
  os.tmpdir(),
  'pi-subagents-render.jsonl',
);
function sanitizeTools(tools: string[]): string[] {
  return tools.map(String).filter((tool) => !tool.startsWith('subagent_'));
}

interface ParsedFrontmatter {
  data: Record<string, any>;
  body: string;
  issues: string[];
}

const AMBIGUOUS_TOOLS_ISSUE =
  'choose either comma-separated inline tools or a multiline YAML tools list, not both';
const SUBAGENT_MODE_ISSUE =
  'subagent_mode must be exactly "task" or "background"';

function parseInlineTools(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const DISALLOWED_TOOLS_ISSUE =
  'disallowed_tools must be a comma-separated string or YAML list of exact tool names (no globs or nested values)';
const UNSUPPORTED_YAML_ISSUE =
  'agent frontmatter does not support YAML anchors, aliases, merge keys or tags';

// Resolve the same YAML implementation as the SDK, including under pnpm's
// isolated dependency layout; the package does not add its own parser dependency.
const yaml = createRequire(
  import.meta.resolve('@earendil-works/pi-coding-agent'),
)('yaml') as typeof import('yaml');

function parseDisallowedTools(value: unknown): string[] | undefined {
  if (value === undefined || value === '') return [];
  const names = typeof value === 'string' ? value.split(',') : value;
  if (
    !Array.isArray(names) ||
    names.some(
      (name) =>
        typeof name !== 'string' || !/^[a-zA-Z0-9_.:-]+$/.test(name.trim()),
    )
  )
    return undefined;
  return [...new Set(names.map((name: string) => name.trim()))];
}

function parseYamlMapping(raw: string): Record<string, unknown> {
  const document = yaml.parseDocument(raw);
  // Inspect all keys and values before conversion can resolve aliases or tags.
  yaml.visit(document, (_key, node) => {
    if (
      yaml.isAlias(node) ||
      (yaml.isNode(node) && (node.anchor || node.tag)) ||
      (yaml.isPair(node) && yaml.isScalar(node.key) && node.key.value === '<<')
    )
      throw new Error(UNSUPPORTED_YAML_ISSUE);
  });
  if (document.errors.length) throw document.errors[0];
  if (!yaml.isMap(document.contents))
    throw new Error('Expected a YAML mapping');
  const { frontmatter: data, body } = parseYamlFrontmatter(`---\n${raw}\n---`);
  // Retain the SDK's delimiter rules, but never accept its truncated parse.
  if (body) throw new Error('Expected the entire YAML frontmatter');
  if (!isPlainObject(data)) throw new Error('Expected a YAML mapping');
  const denials = document.get('disallowed_tools', true);
  if (yaml.isScalar(denials) && denials.value === null && denials.source === '')
    data.disallowed_tools = [];
  return data;
}

function validateDefinitionFrontmatter(
  data: Record<string, unknown>,
): string[] {
  const issues: string[] = [];
  for (const field of [
    'name',
    'description',
    'effort',
    'thinking_level',
    'thinkingLevel',
  ]) {
    if (Object.hasOwn(data, field) && typeof data[field] !== 'string')
      issues.push(`${field} must be a YAML string`);
  }
  if (
    Object.hasOwn(data, 'model') &&
    typeof data.model !== 'string' &&
    !(
      isPlainObject(data.model) &&
      typeof data.model.provider === 'string' &&
      typeof data.model.id === 'string'
    )
  )
    issues.push(
      'model must be a string or a mapping with string provider and id',
    );
  if (Object.hasOwn(data, 'tools')) {
    if (
      typeof data.tools !== 'string' &&
      !(
        Array.isArray(data.tools) &&
        data.tools.every((tool) => typeof tool === 'string')
      )
    )
      issues.push(
        'tools must be a comma-separated string or YAML list of strings',
      );
    else if (
      typeof data.tools === 'string' &&
      parseInlineTools(data.tools).some((tool) => /\s/.test(tool))
    )
      issues.push(AMBIGUOUS_TOOLS_ISSUE);
  }
  return issues;
}

function parseFrontmatterWithIssues(text: string): ParsedFrontmatter {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---'))
    return { data: {}, body: text, issues: [] };
  if (!/^---[^\S\n]*(?:#[^\n]*)?(?:\n|$)/.test(normalized))
    return {
      data: {},
      body: text,
      issues: [
        'invalid YAML frontmatter opening; use --- followed only by whitespace or a comment',
      ],
    };
  const closing = /\n---[^\S\n]*(?:#[^\n]*)?(?=\n|$)/.exec(normalized);
  if (!closing)
    return {
      data: {},
      body: text,
      issues: ['unterminated YAML frontmatter; close it with ---'],
    };
  // Use the SDK's exact YAML slice: skipping the opening line can hide fields.
  const raw = normalized.slice(4, closing.index);
  const body = normalized
    .slice(closing.index + closing[0].length)
    .replace(/^\n/, '');
  try {
    const data = parseYamlMapping(raw);
    const issues = validateDefinitionFrontmatter(data);
    if (typeof data.tools === 'string')
      data.tools = parseInlineTools(data.tools);
    return { data, body, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {},
      body,
      issues: [
        `YAML frontmatter must parse as a mapping with unique keys: ${message}. For a wildcard, quote it: tools: "*"; for values containing ": ", quote the value (e.g. description: "worker: x")`,
      ],
    };
  }
}

export function parseFrontmatter(text: string): {
  data: Record<string, any>;
  body: string;
} {
  const { data, body } = parseFrontmatterWithIssues(text);
  return { data, body };
}

function agentDir(): string {
  return (
    process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent')
  );
}

function subagentsConfigPath(dir = agentDir()): string {
  return path.join(dir, 'subagents.json');
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function positiveNumber(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value: any, fallback: number): number {
  return Math.max(1, Math.floor(positiveNumber(value, fallback)));
}

export function parseModel(value: any): ModelRef | undefined {
  if (!value || value === 'default') return undefined;
  if (typeof value === 'string') {
    const separator = value.indexOf('/');
    if (separator === -1) return undefined;
    const provider = value.slice(0, separator).trim();
    const id = value.slice(separator + 1).trim();
    return provider && id ? { provider, id } : undefined;
  }
  if (
    isPlainObject(value) &&
    typeof value.provider === 'string' &&
    typeof value.id === 'string'
  ) {
    const provider = value.provider.trim();
    const id = value.id.trim();
    return provider && id ? { provider, id } : undefined;
  }
  return undefined;
}

const THINKING_EFFORTS = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export function parseEffort(value: any): ThinkingEffort | undefined {
  if (!value || value === 'default') return undefined;
  const effort = String(value).trim().toLowerCase();
  return THINKING_EFFORTS.has(effort) ? (effort as ThinkingEffort) : undefined;
}

function parseSessionResources(value: any): SubagentSessionResources {
  const resources = String(value ?? 'lean')
    .trim()
    .toLowerCase();
  return resources === 'full' ? 'full' : 'lean';
}

function parseLifecyclePassthrough(value: unknown): string[] {
  if (value === undefined) return [...DEFAULT_LIFECYCLE_PASSTHROUGH];
  if (!Array.isArray(value)) {
    console.warn(
      'subagents: lifecycle_passthrough must be an array of package names; ignored.',
    );
    return [];
  }
  const names = value.filter(
    (name): name is string => typeof name === 'string',
  );
  if (names.length !== value.length)
    console.warn(
      'subagents: non-string lifecycle_passthrough entries ignored.',
    );
  if (names.includes('thoth-agents'))
    console.warn(
      'subagents: lifecycle_passthrough cannot include thoth-agents (adaptive-root prompt injector); ignored.',
    );
  return names.filter((name) => name !== 'thoth-agents');
}

function parseDefaultMode(value: unknown): SubagentMode {
  const mode = String(value ?? 'background')
    .trim()
    .toLowerCase();
  return mode === 'task' ? 'task' : 'background';
}

function parseCtrlShortcut(value: any, fallback: string): string {
  const shortcut = String(value ?? fallback)
    .trim()
    .toLowerCase();
  return /^(?:ctrl\+(?:[a-z]|,)|ctrl\+shift\+[a-z])$/.test(shortcut)
    ? shortcut
    : fallback;
}

const SHORTCUT_MODIFIERS = new Set(['ctrl', 'shift', 'alt', 'super']);
const SHORTCUT_KEYS = new Set([
  'escape',
  'esc',
  'enter',
  'return',
  'tab',
  'space',
  'backspace',
  'delete',
  'insert',
  'clear',
  'home',
  'end',
  'pageup',
  'pagedown',
  'up',
  'down',
  'left',
  'right',
  '`',
  '-',
  '=',
  '[',
  ']',
  '\\',
  ';',
  "'",
  ',',
  '.',
  '/',
  '!',
  '@',
  '#',
  '$',
  '%',
  '^',
  '&',
  '*',
  '(',
  ')',
  '_',
  '+',
  '|',
  '~',
  '{',
  '}',
  ':',
  '<',
  '>',
  '?',
]);

function parseModifiedShortcut(value: any, fallback: string): string {
  const shortcut = String(value ?? fallback)
    .trim()
    .toLowerCase();
  const parts = shortcut.split('+');
  if (parts.length < 2) return fallback;
  const key = parts.at(-1) ?? '';
  const modifiers = parts.slice(0, -1);
  const hasValidModifiers =
    modifiers.length > 0 &&
    modifiers.every((modifier) => SHORTCUT_MODIFIERS.has(modifier));
  const hasValidKey =
    /^[a-z0-9]$/.test(key) ||
    /^f(?:[1-9]|1[0-2])$/.test(key) ||
    SHORTCUT_KEYS.has(key);
  return hasValidModifiers && hasValidKey ? shortcut : fallback;
}

function parseDetailShortcut(value: any): string {
  const shortcut = String(value ?? DEFAULT_DETAIL_CANCEL_SHORTCUT)
    .trim()
    .toLowerCase();
  if (/^[a-z]$/.test(shortcut)) return shortcut;
  return /^(?:ctrl\+(?:[a-z]|,)|ctrl\+shift\+[a-z])$/.test(shortcut)
    ? shortcut
    : DEFAULT_DETAIL_CANCEL_SHORTCUT;
}

function parseBackgroundHandoffShortcut(value: any): string {
  return parseCtrlShortcut(value, DEFAULT_BACKGROUND_HANDOFF_SHORTCUT);
}

function parseBoolean(value: any, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseRenderDebugPartial(value: unknown): {
  enabled?: boolean;
  path?: string;
} {
  if (!isPlainObject(value)) return {};
  const partial: { enabled?: boolean; path?: string } = {};
  if (value.enabled === true) partial.enabled = true;
  else if (value.enabled === false) partial.enabled = false;
  if (typeof value.path === 'string' && value.path.trim())
    partial.path = value.path.trim();
  return partial;
}

function parseRenderDebugConfig(
  globalRaw: Record<string, unknown>,
  projectRaw: Record<string, unknown>,
): SubagentsConfig['render_debug'] {
  const globalPartial = parseRenderDebugPartial(
    globalRaw.render_debug ?? globalRaw.renderDebug,
  );
  const projectPartial = parseRenderDebugPartial(
    projectRaw.render_debug ?? projectRaw.renderDebug,
  );
  const merged = { ...globalPartial, ...projectPartial };
  if (merged.enabled !== true) return undefined;
  return { enabled: true, path: merged.path ?? DEFAULT_RENDER_DEBUG_LOG_PATH };
}

function parseModelProfile(value: unknown): SubagentModelProfile | undefined {
  if (!isPlainObject(value)) return undefined;
  const profile: SubagentModelProfile = {};
  const model = parseModel(value.model);
  const effort = parseEffort(
    value.effort ?? value.thinking_level ?? value.thinkingLevel,
  );
  if (model) profile.model = model;
  if (effort) profile.effort = effort;
  return Object.keys(profile).length ? profile : undefined;
}

function parseModelProfiles(value: unknown): SubagentModelProfiles {
  if (!isPlainObject(value)) return {};
  const profiles: SubagentModelProfiles = {};
  for (const [name, rawProfile] of Object.entries(value)) {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) continue;
    const profile = parseModelProfile(rawProfile);
    if (profile) profiles[normalizedName] = profile;
  }
  return profiles;
}

function serializeModelRef(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}

function cleanProfile(
  profile: SubagentModelProfile,
): Record<string, string> | undefined {
  const cleaned: Record<string, string> = {};
  if (profile.model) cleaned.model = serializeModelRef(profile.model);
  if (profile.effort) cleaned.effort = profile.effort;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export function readSubagentsConfig(cwd: string): SubagentsConfig {
  const globalRaw = readJson(subagentsConfigPath());
  const projectRaw = readJson(path.join(cwd, '.pi', 'subagents.json'));
  const raw = { ...globalRaw, ...projectRaw };
  const globalModelProfiles = parseModelProfiles(globalRaw.model_profiles);
  const projectModelProfiles = parseModelProfiles(projectRaw.model_profiles);
  return {
    default_model: parseModel(raw.default_model),
    default_effort: parseEffort(
      raw.default_effort ?? raw.default_thinking_level ?? raw.thinkingLevel,
    ),
    default_mode: parseDefaultMode(raw.default_mode),
    model_profiles: { ...globalModelProfiles, ...projectModelProfiles },
    global_model_profiles: globalModelProfiles,
    project_model_profiles: projectModelProfiles,
    timeout_ms: positiveInteger(raw.timeout_ms, DEFAULT_TIMEOUT_MS),
    stall_timeout_ms: positiveInteger(
      raw.stall_timeout_ms,
      DEFAULT_STALL_TIMEOUT_MS,
    ),
    max_concurrency: positiveInteger(
      raw.max_concurrency,
      DEFAULT_MAX_CONCURRENCY,
    ),
    default_tools: sanitizeTools(
      Array.isArray(raw.default_tools)
        ? raw.default_tools.map(String)
        : DEFAULT_TOOLS,
    ),
    session_resources: parseSessionResources(
      raw.session_resources ?? raw.sessionResources,
    ),
    lifecycle_passthrough: parseLifecyclePassthrough(raw.lifecycle_passthrough),
    background_handoff_shortcut: parseBackgroundHandoffShortcut(
      raw.background_handoff_shortcut ?? raw.backgroundHandoffShortcut,
    ),
    history_panel_shortcut: parseModifiedShortcut(
      raw.history_panel_shortcut ?? raw.historyPanelShortcut,
      DEFAULT_HISTORY_PANEL_SHORTCUT,
    ),
    detail_cancel_shortcut: parseDetailShortcut(
      raw.detail_cancel_shortcut ?? raw.detailCancelShortcut,
    ),
    enable_ask_orchestrator: parseBoolean(raw.enable_ask_orchestrator, true),
    ask_timeout_ms:
      Number.isInteger(raw.ask_timeout_ms) && raw.ask_timeout_ms > 0
        ? raw.ask_timeout_ms
        : DEFAULT_ASK_TIMEOUT_MS,
    enable_continue: parseBoolean(
      raw.enable_continue ?? raw.enableContinue,
      false,
    ),
    debug: parseBoolean(raw.debug, false),
    render_debug: parseRenderDebugConfig(globalRaw, projectRaw),
  };
}

export function resolveEffectiveSubagentMode(input: {
  invocationMode?: SubagentMode;
  definition?: Pick<SubagentDefinition, 'subagent_mode'>;
  config?: Pick<SubagentsConfig, 'default_mode'>;
}): SubagentMode {
  return (
    input.invocationMode ??
    input.definition?.subagent_mode ??
    input.config?.default_mode ??
    'background'
  );
}

function projectSubagentsConfigPath(cwd: string): string {
  return path.join(cwd, '.pi', 'subagents.json');
}

function subagentsConfigPathForScope(input: {
  scope?: SubagentDefinitionScope;
  cwd?: string;
  agentDir?: string;
}): string {
  return input.scope === 'project' && input.cwd
    ? projectSubagentsConfigPath(input.cwd)
    : subagentsConfigPath(input.agentDir);
}

export function saveSubagentModelProfile(input: {
  agentName: string;
  profile: SubagentModelProfile;
  scope?: SubagentDefinitionScope;
  cwd?: string;
  agentDir?: string;
}): void {
  const file = subagentsConfigPathForScope(input);
  const root = readJson(file);
  const writableRoot: Record<string, unknown> = isPlainObject(root)
    ? { ...root }
    : {};
  const modelProfiles = isPlainObject(writableRoot.model_profiles)
    ? { ...writableRoot.model_profiles }
    : {};
  const agentName = input.agentName.trim().toLowerCase();
  const cleaned = cleanProfile(input.profile);
  if (agentName && cleaned) modelProfiles[agentName] = cleaned;
  if (Object.keys(modelProfiles).length)
    writableRoot.model_profiles = modelProfiles;
  else delete writableRoot.model_profiles;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(writableRoot, null, 2)}\n`, 'utf8');
}

export function saveGlobalSubagentModelProfile(input: {
  agentName: string;
  profile: SubagentModelProfile;
  agentDir?: string;
}): void {
  saveSubagentModelProfile({ ...input, scope: 'global' });
}

export function resetSubagentModelProfileField(input: {
  agentName: string;
  field: 'model' | 'effort';
  scope?: SubagentDefinitionScope;
  cwd?: string;
  agentDir?: string;
}): void {
  const file = subagentsConfigPathForScope(input);
  const root = readJson(file);
  const writableRoot: Record<string, unknown> = isPlainObject(root)
    ? { ...root }
    : {};
  const modelProfiles = isPlainObject(writableRoot.model_profiles)
    ? { ...writableRoot.model_profiles }
    : {};
  const agentName = input.agentName.trim().toLowerCase();
  const existing = isPlainObject(modelProfiles[agentName])
    ? { ...modelProfiles[agentName] }
    : {};
  delete existing[input.field];
  if (Object.keys(existing).length) modelProfiles[agentName] = existing;
  else delete modelProfiles[agentName];
  if (Object.keys(modelProfiles).length)
    writableRoot.model_profiles = modelProfiles;
  else delete writableRoot.model_profiles;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(writableRoot, null, 2)}\n`, 'utf8');
}

export function resetGlobalSubagentModelProfileField(input: {
  agentName: string;
  field: 'model' | 'effort';
  agentDir?: string;
}): void {
  resetSubagentModelProfileField({ ...input, scope: 'global' });
}

interface BlockedSubagentDefinition {
  name: string;
  filePath: string;
  issues: string[];
}

function loadSubagentsFromDir(
  dir: string,
  scope: SubagentDefinitionScope,
  onBlocked?: (blocked: BlockedSubagentDefinition) => void,
): SubagentDefinition[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .flatMap((file) => {
      const filePath = path.join(dir, file);
      const name = path.basename(file, '.md').trim().toLowerCase();
      let text: string;
      try {
        text = fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onBlocked?.({
          name,
          filePath,
          issues: [`could not read definition: ${message}`],
        });
        return [];
      }
      const { data, body, issues } = parseFrontmatterWithIssues(text);
      if (
        typeof data.name === 'string' &&
        data.name.trim().toLowerCase() !== name
      )
        issues.push(
          `name must match the filename identity "${name}"; rename the file to ${data.name.trim()}.md or change name to "${name}"`,
        );
      if (issues.length > 0) {
        onBlocked?.({ name, filePath, issues });
        return [];
      }
      const disallowedTools = parseDisallowedTools(data.disallowed_tools);
      if (!disallowedTools) {
        onBlocked?.({ name, filePath, issues: [DISALLOWED_TOOLS_ISSUE] });
        return [];
      }
      const description = String(data.description || `${name} subagent`).trim();
      const rawSubagentMode = data.subagent_mode;
      if (
        rawSubagentMode !== undefined &&
        rawSubagentMode !== 'task' &&
        rawSubagentMode !== 'background'
      ) {
        onBlocked?.({ name, filePath, issues: [SUBAGENT_MODE_ISSUE] });
        return [];
      }
      const tools = sanitizeTools(
        Array.isArray(data.tools) ? data.tools.map(String) : DEFAULT_TOOLS,
      );
      return [
        {
          name,
          description,
          filePath,
          instructions: body.trim(),
          model: parseModel(data.model),
          effort: parseEffort(
            data.effort ?? data.thinking_level ?? data.thinkingLevel,
          ),
          subagent_mode: rawSubagentMode,
          tools,
          disallowed_tools: disallowedTools,
          scope,
        },
      ];
    });
}

function agentsDirSources(cwd: string): Array<{
  scope: 'global' | 'project';
  kind: 'agents' | 'subagents';
  dir: string;
}> {
  const globalAgentDir = agentDir();
  return [
    {
      scope: 'global',
      kind: 'agents',
      dir: path.join(globalAgentDir, 'agents'),
    },
    {
      scope: 'global',
      kind: 'subagents',
      dir: path.join(globalAgentDir, 'subagents'),
    },
    { scope: 'project', kind: 'agents', dir: path.join(cwd, '.pi', 'agents') },
    {
      scope: 'project',
      kind: 'subagents',
      dir: path.join(cwd, '.pi', 'subagents'),
    },
  ];
}

function blockedSubagentWarning(blocked: BlockedSubagentDefinition): string {
  return `Subagent "${blocked.name}" in ${blocked.filePath} has invalid frontmatter: ${blocked.issues.join('; ')}. The subagent was not loaded.`;
}

export function subagentSourceWarnings(cwd: string): string[] {
  const warnings: string[] = [];
  const onBlocked = (blocked: BlockedSubagentDefinition) =>
    warnings.push(blockedSubagentWarning(blocked));
  for (const scope of ['global', 'project'] as const) {
    const sources = agentsDirSources(cwd).filter(
      (source) => source.scope === scope,
    );
    const agentsSource = sources.find((source) => source.kind === 'agents')!;
    const subagentsSource = sources.find(
      (source) => source.kind === 'subagents',
    )!;
    const agents = loadSubagentsFromDir(
      agentsSource.dir,
      agentsSource.scope,
      onBlocked,
    );
    const subagents = loadSubagentsFromDir(
      subagentsSource.dir,
      subagentsSource.scope,
      onBlocked,
    );
    const subagentNames = new Map(
      subagents.map((definition) => [definition.name, definition]),
    );
    for (const agent of agents) {
      const subagent = subagentNames.get(agent.name);
      if (!subagent) continue;
      warnings.push(
        `Duplicate subagent name "${agent.name}" found in ${scope} agents and subagents directories; using subagents definition (${subagent.filePath}).`,
      );
    }
  }
  return warnings;
}

export function loadSubagents(cwd: string): SubagentDefinition[] {
  const byName = new Map<string, SubagentDefinition>();
  for (const source of agentsDirSources(cwd)) {
    const blockedNames = new Set<string>();
    const definitions = loadSubagentsFromDir(
      source.dir,
      source.scope,
      (blocked) => blockedNames.add(blocked.name),
    );
    for (const agent of definitions) {
      if (!blockedNames.has(agent.name)) byName.set(agent.name, agent);
    }
    for (const name of blockedNames) byName.delete(name);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getSubagent(
  cwd: string,
  name: string,
): SubagentDefinition | undefined {
  return loadSubagents(cwd).find((a) => a.name === name.toLowerCase());
}
