import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Api,
  Model,
  ThinkingLevel,
  ThinkingLevelMap,
} from '@earendil-works/pi-ai';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import {
  AcpConnection,
  type AcpOptions,
  type ConfigOption,
  type ConfigValue,
} from './acp/connection.js';

export type JunieEffort = 'low' | 'medium' | 'high';
export interface Catalog {
  version: 3;
  refreshedAt: string;
  models: { id: string; name: string; contextWindow?: number }[];
  efforts: JunieEffort[];
  contextWindow?: number;
}
export interface CatalogOptions extends AcpOptions {
  agentDir?: string;
}
const cacheFile = (agentDir: string) =>
  join(agentDir, 'junie-bridge/models.json');
export function readCatalog(agentDir = getAgentDir()): Catalog | undefined {
  try {
    const catalog = JSON.parse(
      readFileSync(cacheFile(agentDir), 'utf8'),
    ) as Catalog;
    if (
      catalog.version !== 3 ||
      !Array.isArray(catalog.models) ||
      !catalog.models.length ||
      !catalog.models.every(
        (m) =>
          typeof m.id === 'string' && m.id.length && typeof m.name === 'string',
      ) ||
      !Array.isArray(catalog.efforts) ||
      !catalog.efforts.every((e) => ['low', 'medium', 'high'].includes(e))
    )
      return;
    return catalog;
  } catch {
    return;
  }
}
export function parseCatalog(options: ConfigOption[]): Catalog {
  const values = (id: string): ConfigValue[] =>
    (options.find((option) => option.id === id)?.options ?? []).flatMap(
      (value) => ('options' in value ? value.options : [value]),
    );
  const models = [
    ...new Map(
      values('model')
        .filter(
          (v) => typeof v.value === 'string' && typeof v.name === 'string',
        )
        .map((v) => [v.value, { id: v.value, name: modelLabel(v) }]),
    ).values(),
  ];
  if (!models.length)
    throw new Error(
      'Junie returned no model config options; run `junie` and log in with your JetBrains Account.',
    );
  const efforts = values('effort')
    .map((v) => v.value)
    .filter((v): v is JunieEffort => ['low', 'medium', 'high'].includes(v));
  return { version: 3, refreshedAt: new Date().toISOString(), models, efforts };
}
/**
 * Junie ACP labels mixes with a generic preset name (`Normal`) and only names
 * the concrete model behind them in `_meta.jetbrains.air.modelDisplayName`.
 * Prefix and qualify those labels so a mix stays distinguishable from the real
 * model it currently routes to; plain models keep their ACP name.
 */
function modelLabel(value: ConfigValue): string {
  const optionName = value.name.trim() || value.value;
  const displayName = modelDisplayName(value);
  const mixed =
    value.value.startsWith('mix.') ||
    (displayName !== undefined && displayName !== optionName);
  if (!mixed) return optionName;
  return displayName
    ? `Junie ${optionName} (${displayName})`
    : `Junie ${optionName}`;
}
function modelDisplayName(value: ConfigValue): string | undefined {
  const displayName =
    value._meta?.jetbrains?.air?.modelDisplayName ??
    value._meta?.['jetbrains.air.modelDisplayName'];
  return typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : undefined;
}
export async function refreshCatalog(
  options: CatalogOptions = {},
): Promise<Catalog> {
  const connection = await AcpConnection.connect(options);
  let sessionId: string | undefined;
  let catalog: Catalog;
  try {
    const session = await connection.newSession(options.cwd ?? process.cwd());
    sessionId = session.sessionId;
    catalog = parseCatalog(session.configOptions ?? []);
    await connection.closeSession(sessionId);
    sessionId = undefined;
  } finally {
    try {
      if (sessionId) await connection.closeSession(sessionId);
    } finally {
      await connection.close();
    }
  }
  const directory = options.agentDir ?? getAgentDir();
  const previous = readCatalog(directory);
  for (const model of catalog.models) {
    const observed = previous?.models.find(
      (m) => m.id === model.id,
    )?.contextWindow;
    if (validContextWindow(observed)) model.contextWindow = observed;
  }
  writeCatalog(catalog, directory);
  return catalog;
}
function validContextWindow(size: number | undefined): size is number {
  return typeof size === 'number' && Number.isSafeInteger(size) && size > 0;
}
function writeCatalog(catalog: Catalog, directory: string): void {
  mkdirSync(join(directory, 'junie-bridge'), { recursive: true });
  const target = cacheFile(directory),
    temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(catalog, null, 2) + '\n', {
    mode: 0o600,
  });
  renameSync(temporary, target);
}
/** Returns the changed catalog so an interactive host can re-register immediately. */
export function recordContextWindow(
  id: string,
  size: number,
  agentDir = getAgentDir(),
): Catalog | undefined {
  if (!validContextWindow(size)) return;
  const catalog = readCatalog(agentDir);
  const model = catalog?.models.find((m) => m.id === id);
  if (!catalog || !model || model.contextWindow === size) return;
  model.contextWindow = size;
  writeCatalog(catalog, agentDir);
  return catalog;
}
export function effortToThinking(effort: JunieEffort): ThinkingLevel {
  return effort;
}
export function toJunieEffort(level?: ThinkingLevel): JunieEffort {
  if (level === 'high' || level === 'xhigh' || level === 'max') return 'high';
  return level === 'medium' ? 'medium' : 'low';
}
export function projectModels(catalog: Catalog): Model<Api>[] {
  const thinkingLevelMap: ThinkingLevelMap = {
    off: null,
    minimal: null,
    xhigh: null,
    max: null,
  };
  for (const level of ['low', 'medium', 'high'] as const)
    thinkingLevelMap[level] = catalog.efforts.includes(level) ? level : null;
  return catalog.models.map((model) => ({
    ...model,
    provider: 'junie',
    api: 'junie-bridge',
    baseUrl: 'junie-bridge://junie',
    reasoning: catalog.efforts.length > 0,
    thinkingLevelMap,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // Conservative fallback until Junie reports this model's actual capacity.
    contextWindow: validContextWindow(model.contextWindow)
      ? model.contextWindow
      : (catalog.contextWindow ?? 32000),
    maxTokens: 8192,
  }));
}
