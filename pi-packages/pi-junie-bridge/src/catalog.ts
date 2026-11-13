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
  version: 1;
  refreshedAt: string;
  models: { id: string; name: string }[];
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
      catalog.version !== 1 ||
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
        .map((v) => [v.value, { id: v.value, name: v.name }]),
    ).values(),
  ];
  if (!models.length)
    throw new Error(
      'Junie returned no model config options; run `junie` and log in with your JetBrains Account.',
    );
  const efforts = values('effort')
    .map((v) => v.value)
    .filter((v): v is JunieEffort => ['low', 'medium', 'high'].includes(v));
  return { version: 1, refreshedAt: new Date().toISOString(), models, efforts };
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
  mkdirSync(join(directory, 'junie-bridge'), { recursive: true });
  const target = cacheFile(directory),
    temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(catalog, null, 2) + '\n', {
    mode: 0o600,
  });
  renameSync(temporary, target);
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
    contextWindow: catalog.contextWindow ?? 32000,
    maxTokens: 8192,
  }));
}
