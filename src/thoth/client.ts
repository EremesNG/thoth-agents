import { log } from '../utils/logger';

const DEFAULT_THOTH_HTTP_PORT = 7438;
const DEFAULT_THOTH_TIMEOUT_MS = 15_000;

type JsonRecord = Record<string, unknown>;

type ContextSession = {
  id?: string;
  project?: string;
  started_at?: string;
  summary?: string;
};

type ContextObservation = {
  id?: number;
  title?: string;
  content?: string;
  type?: string;
  created_at?: string;
};

type ContextPrompt = {
  id?: number;
  content?: string;
  created_at?: string;
};

type ContextStats = {
  sessions?: number;
  observations?: number;
  prompts?: number;
  projects?: string[];
};

export interface CreateThothClientOptions {
  project: string;
  directory?: string;
  httpPort?: number;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface ThothClient {
  readonly enabled: boolean;
  memContext(sessionId?: string, limit?: number): Promise<string | null>;
  memSessionStart(sessionId: string): Promise<boolean>;
  memSavePrompt(sessionId: string, content: string): Promise<boolean>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

function previewText(value: unknown, max: number): string | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatMemoryContext(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }

  const sessions = Array.isArray(response.sessions) ? response.sessions : [];
  const observations = Array.isArray(response.observations)
    ? response.observations
    : [];
  const prompts = Array.isArray(response.prompts) ? response.prompts : [];

  if (
    sessions.length === 0 &&
    observations.length === 0 &&
    prompts.length === 0
  ) {
    return null;
  }

  const lines = ['## Memory Context', ''];

  if (sessions.length > 0) {
    lines.push('### Recent Sessions');
    for (const rawSession of sessions as ContextSession[]) {
      const sessionId = normalizeText(rawSession.id) ?? 'unknown-session';
      const project = normalizeText(rawSession.project) ?? 'unknown-project';
      const startedAt = normalizeText(rawSession.started_at) ?? 'unknown';
      lines.push(`- [${sessionId}] (${project}) — started ${startedAt}`);

      const summary = previewText(rawSession.summary, 300);
      if (summary) {
        lines.push(`  Summary: ${summary}`);
      }
    }
    lines.push('');
  }

  if (observations.length > 0) {
    lines.push('### Recent Observations');
    for (const rawObservation of observations as ContextObservation[]) {
      const type = normalizeText(rawObservation.type) ?? 'manual';
      const title = normalizeText(rawObservation.title) ?? 'Untitled';
      const createdAt = normalizeText(rawObservation.created_at) ?? 'unknown';
      lines.push(`- [${type}] ${title} (${createdAt})`);

      const content = previewText(rawObservation.content, 300);
      if (content) {
        lines.push(`  ${content}`);
      }
    }
    lines.push('');
  }

  if (prompts.length > 0) {
    lines.push('### Recent Prompts');
    for (const rawPrompt of prompts as ContextPrompt[]) {
      const content = previewText(rawPrompt.content, 200);
      if (!content) {
        continue;
      }

      const createdAt = normalizeText(rawPrompt.created_at) ?? 'unknown';
      lines.push(`- ${content} (${createdAt})`);
    }
    lines.push('');
  }

  const stats = isRecord(response.stats)
    ? (response.stats as ContextStats)
    : undefined;
  if (stats) {
    lines.push('### Stats');
    lines.push(
      `- Sessions: ${typeof stats.sessions === 'number' ? stats.sessions : 0}, ` +
        `Observations: ${typeof stats.observations === 'number' ? stats.observations : 0}, ` +
        `Prompts: ${typeof stats.prompts === 'number' ? stats.prompts : 0}`,
    );
  }

  return lines.join('\n');
}

class HttpThothClient implements ThothClient {
  readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly project: string;
  private readonly directory?: string;

  constructor(options: CreateThothClientOptions) {
    this.enabled = options.enabled !== false;
    const port = options.httpPort ?? DEFAULT_THOTH_HTTP_PORT;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_THOTH_TIMEOUT_MS;
    this.project = options.project;
    this.directory = options.directory;
  }

  async memContext(sessionId?: string, limit = 10): Promise<string | null> {
    const params = new URLSearchParams({
      project: this.project,
      limit: String(limit),
    });

    if (sessionId) {
      params.set('session_id', sessionId);
    }

    const response = await this.httpGet(`/context?${params.toString()}`);
    return formatMemoryContext(response);
  }

  async memSessionStart(sessionId: string): Promise<boolean> {
    const response = await this.httpPost('/sessions', {
      id: sessionId,
      project: this.project,
      directory: this.directory,
    });

    return response !== null;
  }

  async memSavePrompt(sessionId: string, content: string): Promise<boolean> {
    const response = await this.httpPost('/prompts', {
      session_id: sessionId,
      content,
      project: this.project,
    });

    return response !== null;
  }

  private async httpPost(
    path: string,
    body: JsonRecord,
  ): Promise<unknown | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      log('[thoth] HTTP POST unavailable', {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async httpGet(path: string): Promise<unknown | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      log('[thoth] HTTP GET unavailable', {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export function createThothClient(
  options: CreateThothClientOptions,
): ThothClient {
  return new HttpThothClient(options);
}
