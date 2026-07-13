import { z } from 'zod';
import type {
  ModelOption,
  ModelsDevCatalogResult,
  NormalizedModelsDevCatalog,
} from './types';

const modelsDevModelSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    reasoning: z.boolean().optional(),
    reasoning_options: z.array(z.unknown()).optional(),
  })
  .passthrough();

const modelsDevProviderSchema = z
  .object({
    models: z.record(z.string(), modelsDevModelSchema),
  })
  .passthrough();

export const modelsDevCatalogSchema = z.record(
  z.string(),
  modelsDevProviderSchema,
);

export type ModelsDevCatalog = z.infer<typeof modelsDevCatalogSchema>;

const effortOptionSchema = z
  .object({
    type: z.literal('effort'),
    values: z.array(z.string().min(1)),
  })
  .passthrough();

function normalizedCatalogId(
  provider: string,
  modelKey: string,
  declaredId?: string,
): string {
  const candidate = (declaredId ?? modelKey).trim().toLowerCase();
  return candidate.includes('/') ? candidate : `${provider}/${candidate}`;
}

function runtimeModelId(provider: string, catalogId: string): string {
  const prefix = `${provider}/`;
  return catalogId.startsWith(prefix)
    ? catalogId.slice(prefix.length)
    : catalogId;
}

function effortValues(options: readonly unknown[] | undefined): string[] {
  const values = new Set<string>();
  for (const option of options ?? []) {
    const parsed = effortOptionSchema.safeParse(option);
    if (!parsed.success) continue;
    for (const value of parsed.data.values) {
      const normalized = value.trim();
      if (normalized) values.add(normalized);
    }
  }
  return [...values];
}

export function normalizeModelsDevCatalog(
  input: unknown,
): ModelsDevCatalogResult {
  const parsed = modelsDevCatalogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    };
  }

  const models: ModelOption[] = [];
  for (const [rawProvider, provider] of Object.entries(parsed.data)) {
    const providerId = rawProvider.trim().toLowerCase();
    for (const [modelKey, model] of Object.entries(provider.models)) {
      const catalogId = normalizedCatalogId(providerId, modelKey, model.id);
      const id = runtimeModelId(providerId, catalogId);
      models.push({
        id,
        catalogId,
        label: model.name ?? id,
        provider: providerId,
        efforts: effortValues(model.reasoning_options),
        source: 'remote',
      });
    }
  }

  return { ok: true, catalog: { models } satisfies NormalizedModelsDevCatalog };
}
