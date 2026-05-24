import { execFileSync } from 'node:child_process';
import type { HarnessId } from '../../harness/types';

const MODEL_CATALOG_TIMEOUT_MS = 5_000;
const MODELS_DEV_MAX_BUFFER = 8 * 1024 * 1024;

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

interface ModelCommandInvocation {
  command: string;
  args: string[];
  options: {
    encoding: 'utf8';
    maxBuffer?: number;
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
    options.push({ id, label: id, provider: match[1] ?? 'unknown' });
  }
  return options;
}

function parseModelsDevOpenAi(output: string): ModelOption[] {
  const catalog = JSON.parse(output) as {
    openai?: { models?: Record<string, { name?: string }> };
  };
  return Object.entries(catalog.openai?.models ?? {})
    .filter(([id]) => isCodexOpenAiModelId(id))
    .map(([id, model]) => ({
      id,
      label: model.name ?? id,
      provider: 'openai',
    }));
}

function isCodexOpenAiModelId(id: string): boolean {
  const match = id.match(/^gpt-(\d+)(?:[.-]|$)/);
  return match?.[1] !== undefined && Number(match[1]) >= 5;
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

  return {
    command: 'opencode',
    args: ['models'],
    options,
  };
}

function getModelsDevCatalog(): ModelOption[] {
  try {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        [
          'const controller = new AbortController();',
          `const timeout = setTimeout(() => controller.abort(), ${MODEL_CATALOG_TIMEOUT_MS});`,
          "if (typeof fetch !== 'function') {",
          "  console.error('fetch unavailable');",
          '  process.exit(1);',
          '}',
          "fetch('https://models.dev/api.json', { signal: controller.signal })",
          '  .then(async (response) => {',
          '    if (!response.ok) throw new Error(String(response.status));',
          '    const catalog = await response.json();',
          '    const models = catalog?.openai?.models ?? {};',
          '    return JSON.stringify({ openai: { models } });',
          '  })',
          '  .then((body) => {',
          '    clearTimeout(timeout);',
          '    process.stdout.write(body);',
          '  })',
          '  .catch((error) => { clearTimeout(timeout); console.error(error.message); process.exit(1); });',
        ].join('\n'),
      ],
      {
        encoding: 'utf8',
        maxBuffer: MODELS_DEV_MAX_BUFFER,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: MODEL_CATALOG_TIMEOUT_MS,
      },
    );
    return parseModelsDevOpenAi(output);
  } catch {
    return [];
  }
}

export function getModelOptions(harness: HarnessId): ModelOption[] {
  if (harness === 'codex') return getModelsDevCatalog();

  try {
    const invocation = getOpenCodeModelsInvocation();
    const output = execFileSync(
      invocation.command,
      invocation.args,
      invocation.options,
    );
    return parseOpenCodeModels(output);
  } catch {
    return [];
  }
}
