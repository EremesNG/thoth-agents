import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, posix, win32 } from 'node:path';
import { z } from 'zod';

const modelCatalogSourceSchema = z.enum(['remote', 'lkg', 'manual']);

const cachedModelOptionSchema = z
  .object({
    id: z.string().min(1),
    catalogId: z.string().min(1).optional(),
    label: z.string().min(1),
    provider: z.string().min(1),
    efforts: z.array(z.string().min(1)),
    source: modelCatalogSourceSchema,
  })
  .passthrough();

export const modelsDevCacheSchema = z
  .object({
    version: z.literal(1),
    etag: z.string().optional(),
    fetchedAt: z.string().datetime(),
    catalog: z
      .object({ models: z.array(cachedModelOptionSchema) })
      .passthrough(),
  })
  .passthrough();

export type ModelsDevCacheV1 = z.infer<typeof modelsDevCacheSchema>;

export interface ModelsDevCachePathOptions {
  platform?: NodeJS.Platform;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
}

export function resolveModelsDevCachePath(
  options: ModelsDevCachePathOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.homeDir ?? homedir();
  if (platform === 'win32') {
    const path = win32;
    const base =
      env.LOCALAPPDATA ?? env.APPDATA ?? path.join(home, 'AppData', 'Local');
    return path.join(base, 'thoth-agents', 'models-dev-v1.json');
  }
  const base = env.XDG_CACHE_HOME ?? posix.join(home, '.cache');
  return posix.join(base, 'thoth-agents', 'models-dev-v1.json');
}

export function readModelsDevCache(
  cachePath: string,
): ModelsDevCacheV1 | undefined {
  if (!existsSync(cachePath)) return undefined;
  try {
    const input: unknown = JSON.parse(readFileSync(cachePath, 'utf8'));
    const parsed = modelsDevCacheSchema.safeParse(input);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeModelsDevCacheAtomic(
  cachePath: string,
  cache: ModelsDevCacheV1,
): void {
  const validated = modelsDevCacheSchema.safeParse(cache);
  if (!validated.success) {
    throw new Error(`Invalid models.dev cache: ${validated.error.message}`);
  }
  mkdirSync(dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(validated.data, null, 2)}\n`,
    );
    renameSync(temporaryPath, cachePath);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}
