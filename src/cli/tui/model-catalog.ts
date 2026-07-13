import { execFileSync } from 'node:child_process';
import type { HarnessId } from '../../harness/types';
import { loadModelsDevCatalog, type ModelOption } from '../model-catalog';
import { resolveOpenCodeEffort } from '../opencode-effort';

const MODEL_CATALOG_TIMEOUT_MS = 5_000;
const CODEX_DOCUMENTED_EFFORTS = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
]);
const CLAUDE_CODE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type { ModelOption } from '../model-catalog';

interface ModelCommandInvocation {
  command: string;
  args: string[];
  options: {
    encoding: 'utf8';
    shell?: boolean;
    stdio: ['ignore', 'pipe', 'ignore'];
    timeout: number;
  };
}

function parseOpenCodeModels(output: string): ModelOption[] {
  const seen = new Set<string>();
  const options: ModelOption[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-z0-9_-]+)\/([^\s{]+)/i);
    if (!match) continue;
    const id = `${match[1]}/${match[2]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({
      id,
      catalogId: id,
      label: id,
      provider: match[1] ?? 'unknown',
      efforts: [],
      source: 'manual',
    });
  }
  return options;
}

function isCodexOpenAiModelId(id: string): boolean {
  const match = id.match(/^gpt-(\d+)(?:[.-]|$)/);
  return match?.[1] !== undefined && Number(match[1]) >= 5;
}

function writableEfforts(
  harness: HarnessId,
  option: ModelOption,
): readonly string[] {
  if (harness === 'codex') {
    return option.efforts.filter((effort) =>
      CODEX_DOCUMENTED_EFFORTS.has(effort),
    );
  }
  if (harness === 'claude') {
    return option.efforts.filter((effort) =>
      (CLAUDE_CODE_EFFORTS as readonly string[]).includes(effort),
    );
  }
  return option.efforts.filter(
    (effort) =>
      resolveOpenCodeEffort({
        model: option.id,
        catalogId: option.catalogId,
        availableEfforts: option.efforts,
        effort: { kind: 'effort', value: effort },
      }).ok,
  );
}

export function effortChoicesForModel(
  option: ModelOption | undefined,
): readonly string[] {
  return ['inherit', ...(option?.efforts ?? [])];
}

export function getOpenCodeModelsInvocation(
  platform: typeof process.platform = process.platform,
): ModelCommandInvocation {
  const options: ModelCommandInvocation['options'] = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: MODEL_CATALOG_TIMEOUT_MS,
  };

  if (platform === 'win32') {
    return {
      command: 'opencode models',
      args: [],
      options: { ...options, shell: true },
    };
  }

  return { command: 'opencode', args: ['models'], options };
}

function getNativeOpenCodeOptions(): ModelOption[] {
  try {
    const invocation = getOpenCodeModelsInvocation();
    return parseOpenCodeModels(
      execFileSync(invocation.command, invocation.args, invocation.options),
    );
  } catch {
    return [];
  }
}

const CLAUDE_CODE_MODEL_OPTIONS: ModelOption[] = [
  { id: 'sonnet', label: 'sonnet', provider: 'anthropic' },
  { id: 'opus', label: 'opus', provider: 'anthropic' },
  { id: 'haiku', label: 'haiku', provider: 'anthropic' },
  {
    id: 'inherit',
    label: 'inherit (main session model)',
    provider: 'anthropic',
  },
].map((option) => ({
  ...option,
  efforts: option.id === 'inherit' ? [] : [...CLAUDE_CODE_EFFORTS],
  source: 'manual' as const,
}));

export async function getModelOptions(
  harness: HarnessId,
): Promise<ModelOption[]> {
  const native = harness === 'opencode' ? getNativeOpenCodeOptions() : [];
  const loaded = await loadModelsDevCatalog({ manual: native });

  if (harness === 'claude') {
    const aliases = CLAUDE_CODE_MODEL_OPTIONS.map((option) => ({
      ...option,
      efforts: [...option.efforts],
    }));
    const concrete = loaded.models
      .filter((option) => option.provider === 'anthropic')
      .map((option) => ({
        ...option,
        id: option.catalogId ?? option.id,
        efforts: writableEfforts(harness, option),
      }));
    return [...aliases, ...concrete];
  }

  if (harness === 'codex') {
    return loaded.models
      .filter(
        (option) =>
          option.provider === 'openai' && isCodexOpenAiModelId(option.id),
      )
      .map((option) => ({
        ...option,
        efforts: writableEfforts(harness, option),
      }));
  }

  const catalogById = new Map(
    loaded.models.map((option) => [option.catalogId ?? option.id, option]),
  );
  return native.map((option) => {
    const catalog = catalogById.get(option.catalogId ?? option.id);
    const enriched = catalog
      ? { ...catalog, id: option.id, catalogId: option.catalogId }
      : option;
    return { ...enriched, efforts: writableEfforts(harness, enriched) };
  });
}
