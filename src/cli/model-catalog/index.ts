import {
  readModelsDevCache,
  resolveModelsDevCachePath,
  writeModelsDevCacheAtomic,
} from './cache';
import { normalizeModelsDevCatalog } from './models-dev';
import type { ModelOption } from './types';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const MODELS_DEV_MAX_BYTES = 8 * 1024 * 1024;
const MODELS_DEV_TIMEOUT_MS = 5_000;

export interface LoadModelsDevCatalogOptions {
  cachePath?: string;
  manual?: readonly ModelOption[];
  fetcher?: typeof fetch;
  now?: () => Date;
}

export interface LoadedModelCatalog {
  models: ModelOption[];
  source: 'remote' | 'lkg' | 'manual';
  stale: boolean;
  checkedAt: string;
  warnings: string[];
}

function ownsCatalogKey(model: ModelOption, key: string): boolean {
  const separator = key.indexOf('/');
  return separator > 0 && model.provider === key.slice(0, separator);
}

export function mergeModelCatalog(
  dynamic: readonly ModelOption[],
  manual: readonly ModelOption[],
): ModelOption[] {
  const merged = new Map<string, ModelOption>();
  for (const model of dynamic) {
    const key = model.catalogId ?? model.id;
    const existing = merged.get(key);
    if (
      existing &&
      ownsCatalogKey(existing, key) &&
      !ownsCatalogKey(model, key)
    ) {
      continue;
    }
    merged.set(key, model);
  }
  for (const model of manual) {
    const key = model.catalogId ?? model.id;
    if (!merged.has(key)) merged.set(key, model);
  }
  return [...merged.values()];
}

type LkgModelOption = Omit<ModelOption, 'efforts' | 'source'> & {
  efforts: string[];
  source: 'lkg';
};

function lkgModels(models: readonly ModelOption[]): LkgModelOption[] {
  return models.map((model) => ({
    ...model,
    efforts: [...model.efforts],
    source: 'lkg',
  }));
}

export async function loadModelsDevCatalog(
  options: LoadModelsDevCatalogOptions = {},
): Promise<LoadedModelCatalog> {
  const cachePath = options.cachePath ?? resolveModelsDevCachePath();
  const manual = options.manual ?? [];
  const fetcher = options.fetcher ?? fetch;
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const cached = readModelsDevCache(cachePath);
  const warnings: string[] = [];

  try {
    const headers = new Headers({ Accept: 'application/json' });
    if (cached?.etag) headers.set('If-None-Match', cached.etag);
    const response = await fetcher(MODELS_DEV_URL, {
      headers,
      signal: AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS),
    });
    if (response.status === 304) {
      if (!cached)
        throw new Error('models.dev returned 304 without an LKG cache');
      return {
        models: mergeModelCatalog(lkgModels(cached.catalog.models), manual),
        source: 'lkg',
        stale: false,
        checkedAt,
        warnings,
      };
    }
    if (!response.ok)
      throw new Error(`models.dev returned HTTP ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MODELS_DEV_MAX_BYTES) {
      throw new Error('models.dev response exceeded the maximum size');
    }
    const input: unknown = JSON.parse(text);
    const normalized = normalizeModelsDevCatalog(input);
    if (!normalized.ok) {
      throw new Error(
        `models.dev validation failed: ${normalized.issues.join('; ')}`,
      );
    }
    const remoteModels = normalized.catalog.models.map((model) => ({
      ...model,
      source: 'remote' as const,
    }));
    writeModelsDevCacheAtomic(cachePath, {
      version: 1,
      ...(response.headers.get('etag')
        ? { etag: response.headers.get('etag') ?? undefined }
        : {}),
      fetchedAt: checkedAt,
      catalog: { models: lkgModels(remoteModels) },
    });
    return {
      models: mergeModelCatalog(remoteModels, manual),
      source: 'remote',
      stale: false,
      checkedAt,
      warnings,
    };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  if (cached) {
    return {
      models: mergeModelCatalog(lkgModels(cached.catalog.models), manual),
      source: 'lkg',
      stale: true,
      checkedAt,
      warnings,
    };
  }
  return {
    models: [...manual],
    source: 'manual',
    stale: true,
    checkedAt,
    warnings,
  };
}

export {
  readModelsDevCache,
  resolveModelsDevCachePath,
  writeModelsDevCacheAtomic,
} from './cache';
export type {
  ModelCatalogSource,
  ModelOption,
  ModelsDevCatalogResult,
  NormalizedModelsDevCatalog,
} from './types';
