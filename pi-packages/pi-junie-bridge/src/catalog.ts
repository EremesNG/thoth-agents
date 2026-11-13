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
export interface CatalogModel {
  /** Pi-visible id: the ACP tail, or the full ACP value when tails collide. */
  id: string;
  /** Exact ACP config value; always what Junie receives on the wire. */
  value: string;
  name: string;
  contextWindow?: number;
}
export interface Catalog {
  version: 4;
  refreshedAt: string;
  models: CatalogModel[];
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
      catalog.version !== 4 ||
      !Array.isArray(catalog.models) ||
      !catalog.models.length ||
      !catalog.models.every(
        (m) =>
          typeof m.id === 'string' &&
          m.id.length &&
          typeof m.value === 'string' &&
          m.value.length &&
          typeof m.name === 'string',
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
  const discovered = [
    ...new Map(
      values('model')
        .filter(
          (v) => typeof v.value === 'string' && typeof v.name === 'string',
        )
        .map((v) => [v.value, { value: v.value, name: modelLabel(v) }]),
    ).values(),
  ];
  if (!discovered.length)
    throw new Error(
      'Junie returned no model config options; run `junie` and log in with your JetBrains Account.',
    );
  const ids = assignModelIds(discovered.map((model) => model.value));
  const models = discovered.map((model) => ({
    id: ids.get(model.value) ?? model.value,
    value: model.value,
    name: model.name,
  }));
  const efforts = values('effort')
    .map((v) => v.value)
    .filter((v): v is JunieEffort => ['low', 'medium', 'high'].includes(v));
  return { version: 4, refreshedAt: new Date().toISOString(), models, efforts };
}
/**
 * Pi lists models by id, so the ACP value's last segment is what a person can
 * read (`v1:12:jetbrains-ai:gemini-3.7-flash` → `gemini-3.7-flash`). Mix presets
 * carry no scheme and stay untouched. A value that would end up empty keeps its
 * full form rather than becoming a nameless duplicate.
 */
export function shortModelId(value: string): string {
  const index = value.lastIndexOf(':');
  if (index < 0) return value;
  return value.slice(index + 1) || value;
}
/**
 * Distinct short ids for Pi; every value whose short form is ambiguous keeps its
 * full ACP value instead, so two models can never collapse into one entry.
 */
function assignModelIds(values: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const short = shortModelId(value);
    counts.set(short, (counts.get(short) ?? 0) + 1);
  }
  return new Map(
    values.map((value) => {
      const short = shortModelId(value);
      return [value, (counts.get(short) ?? 0) > 1 ? value : short];
    }),
  );
}
/**
 * The ACP value for a Pi model id. Either form resolves to the wire value, so a
 * record written before short ids (or one written by this version) keeps
 * working. Stale short ids must have a unique ACP tail; never guess when a
 * catalog is available. Without a catalog, Junie remains the validator.
 */
export function toAcpModelValue(id: string, catalog?: Catalog): string {
  const models = catalog?.models;
  if (!models) return id;
  const exact =
    models.find((model) => model.id === id) ??
    models.find((model) => model.value === id);
  if (exact) return exact.value;
  const tails = models.filter((model) => shortModelId(model.value) === id);
  if (tails.length === 1) return tails[0].value;
  if (tails.length > 1)
    throw new Error(`Ambiguous Junie model "${id}"; select a full model id.`);
  if (!id.includes(':') && id.startsWith('mix.')) return id;
  throw new Error(`Unknown Junie model "${id}"; refresh the model catalog.`);
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
    // Capacity is a property of the model, not of the id a version gave it.
    const observed = previous?.models.find(
      (m) => m.value === model.value,
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
/**
 * Returns the changed catalog so an interactive host can re-register
 * immediately. Keyed strictly by ACP value: a Pi id can be reassigned to a
 * different ACP value by a catalog refresh.
 */
export function recordContextWindow(
  value: string,
  size: number,
  agentDir = getAgentDir(),
): Catalog | undefined {
  if (!validContextWindow(size)) return;
  const catalog = readCatalog(agentDir);
  const model = catalog?.models.find((m) => m.value === value);
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
    id: model.id,
    name: model.name,
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
