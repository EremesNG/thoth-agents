import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface JunieModel {
  modelId: string;
  effortWireId?: string;
}

/** ACP session ids are flat directory names; reject separators and traversal. */
export function validJunieSessionId(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

/** Settings are undocumented: extract the model best-effort, never throw. */
export function junieModelSettings(value: unknown): JunieModel | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { modelId, effortWireId } = ((value as { model?: unknown }).model ??
    {}) as { modelId?: unknown; effortWireId?: unknown };
  if (typeof modelId !== 'string' || !modelId) return undefined;
  return {
    modelId,
    ...(typeof effortWireId === 'string' && effortWireId
      ? { effortWireId }
      : {}),
  };
}

/** Undocumented Junie files: never let unavailable telemetry fail inference. */
export async function readJunieModel(options: {
  sessionId: string;
  home?: string;
  debug?: (message: string) => void;
}): Promise<JunieModel | undefined> {
  try {
    if (!validJunieSessionId(options.sessionId))
      throw new Error('Invalid session id');
    const directory = join(
      options.home ?? process.env.JUNIE_HOME ?? join(homedir(), '.junie'),
      'sessions',
      options.sessionId,
    );
    const model = junieModelSettings(
      JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8')),
    );
    if (!model) throw new Error('Unsupported local model settings');
    return model;
  } catch (error) {
    options.debug?.(`Junie local model unavailable: ${String(error)}`);
    return undefined;
  }
}

/**
 * A positive charge must never read as free: four decimals above the rounding
 * floor, an explicit sub-floor marker below it, and no segment when unset.
 */
export function junieCostSegment(cost: number | undefined): string {
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0)
    return '';
  return cost >= 0.0001 ? ` · $${cost.toFixed(4)}` : ' · <$0.0001';
}

/**
 * Display-only line: the real Junie model behind Pi's provider model plus the
 * cost the bridge attributed to this turn's terminal Pi message.
 */
export function junieUsageLine(options: {
  piModel: string;
  junie: JunieModel;
  cost?: number;
}): string {
  const effort = options.junie.effortWireId
    ? ` (${options.junie.effortWireId})`
    : '';
  return `Junie · ${options.piModel} → ${options.junie.modelId}${effort}${junieCostSegment(options.cost)}`;
}
