import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createThothClient } from './client';

type FetchMock = ReturnType<typeof mock<typeof fetch>>;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function installFetchMock(impl?: typeof fetch): FetchMock {
  const fetchMock = mock(impl ?? (async () => jsonResponse({ ok: true })));
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

async function bodyOf(call: [input: RequestInfo | URL, init?: RequestInit]) {
  const init = call[1];
  if (!init?.body || typeof init.body !== 'string') {
    return null;
  }

  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('createThothClient', () => {
  const originalFetch = globalThis.fetch;
  const originalAbortSignalTimeout = AbortSignal.timeout;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = mock(() => new AbortController().signal);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalAbortSignalTimeout;
  });

  test('calls the correct HTTP endpoints with the expected payloads', async () => {
    const fetchMock = installFetchMock(async (input) => {
      const url = String(input);

      if (url.includes('/context')) {
        return jsonResponse({
          sessions: [
            {
              id: 'root-session',
              project: 'thoth-agents',
              started_at: '2026-03-25T10:00:00.000Z',
              summary: 'Recovered summary',
            },
          ],
          observations: [],
          prompts: [],
          stats: {
            sessions: 1,
            observations: 0,
            prompts: 0,
            projects: ['thoth-agents'],
          },
        });
      }

      return jsonResponse({ ok: true });
    });

    const thoth = createThothClient({
      project: 'thoth-agents',
      directory: '/workspace/thoth-agents',
      httpPort: 8456,
      timeoutMs: 25,
      enabled: true,
    });

    expect(await thoth.memSessionStart('root-session')).toBe(true);
    expect(await thoth.memSavePrompt('root-session', 'prompt body')).toBe(true);

    const context = await thoth.memContext('root-session', 7);

    expect(context).toContain('## Memory Context');
    expect(context).toContain('### Recent Sessions');
    expect(context).toContain('[root-session] (thoth-agents)');
    expect(context).toContain('Summary: Recovered summary');

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const sessionStartCall = fetchMock.mock.calls[0];
    expect(String(sessionStartCall?.[0])).toBe(
      'http://127.0.0.1:8456/sessions',
    );
    expect(await bodyOf(sessionStartCall as never)).toEqual({
      id: 'root-session',
      project: 'thoth-agents',
      directory: '/workspace/thoth-agents',
    });

    const promptCall = fetchMock.mock.calls[1];
    expect(String(promptCall?.[0])).toBe('http://127.0.0.1:8456/prompts');
    expect(await bodyOf(promptCall as never)).toEqual({
      session_id: 'root-session',
      content: 'prompt body',
      project: 'thoth-agents',
    });

    const contextCall = fetchMock.mock.calls[2];
    const contextUrl = new URL(String(contextCall?.[0]));
    expect(contextUrl.origin).toBe('http://127.0.0.1:8456');
    expect(contextUrl.pathname).toBe('/context');
    expect(contextUrl.searchParams.get('project')).toBe('thoth-agents');
    expect(contextUrl.searchParams.get('session_id')).toBe('root-session');
    expect(contextUrl.searchParams.get('limit')).toBe('7');
    expect(contextCall?.[1]).toEqual({
      signal: expect.any(AbortSignal),
    });
  });

  test('formats memory context into readable markdown', async () => {
    installFetchMock(async (input) => {
      const url = String(input);
      if (!url.includes('/context')) {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({
        sessions: [
          {
            id: 'session-1',
            project: 'thoth-agents',
            started_at: '2026-03-25T10:00:00.000Z',
            summary: 'Completed the refactor',
          },
        ],
        observations: [
          {
            id: 1,
            title: 'Observation title',
            content: `${'x'.repeat(300)}tail`,
            type: 'bugfix',
            created_at: '2026-03-25T11:00:00.000Z',
          },
        ],
        prompts: [
          {
            id: 1,
            content: `${'p'.repeat(200)}tail`,
            created_at: '2026-03-25T12:00:00.000Z',
          },
        ],
        stats: {
          sessions: 5,
          observations: 42,
          prompts: 100,
          projects: ['thoth-agents'],
        },
      });
    });

    const thoth = createThothClient({
      project: 'thoth-agents',
      timeoutMs: 25,
    });

    const context = await thoth.memContext('session-1', 3);

    expect(context).toBe(
      [
        '## Memory Context',
        '',
        '### Recent Sessions',
        '- [session-1] (thoth-agents) — started 2026-03-25T10:00:00.000Z',
        '  Summary: Completed the refactor',
        '',
        '### Recent Observations',
        `- [bugfix] Observation title (2026-03-25T11:00:00.000Z)`,
        `  ${'x'.repeat(300)}...`,
        '',
        '### Recent Prompts',
        `- ${'p'.repeat(200)}... (2026-03-25T12:00:00.000Z)`,
        '',
        '### Stats',
        '- Sessions: 5, Observations: 42, Prompts: 100',
      ].join('\n'),
    );
  });

  test('returns null for empty context payloads', async () => {
    installFetchMock(async () =>
      jsonResponse({
        sessions: [],
        observations: [],
        prompts: [],
        stats: {
          sessions: 0,
          observations: 0,
          prompts: 0,
          projects: [],
        },
      }),
    );

    const thoth = createThothClient({
      project: 'thoth-agents',
      timeoutMs: 25,
    });

    expect(await thoth.memContext()).toBeNull();
  });

  test('returns null or false when requests time out', async () => {
    installFetchMock(async () => {
      throw new DOMException('Timed out', 'AbortError');
    });

    const thoth = createThothClient({
      project: 'thoth-agents',
      timeoutMs: 25,
    });

    expect(await thoth.memContext()).toBeNull();
    expect(await thoth.memSessionStart('root-session')).toBe(false);
  });

  test('returns null or false when fetch fails or the server errors', async () => {
    const fetchMock = installFetchMock(async (input) => {
      const url = String(input);

      if (url.includes('/context')) {
        throw new Error('connect ECONNREFUSED');
      }

      return jsonResponse({ error: 'server error' }, 500);
    });

    const thoth = createThothClient({
      project: 'thoth-agents',
      timeoutMs: 25,
    });

    expect(await thoth.memContext()).toBeNull();
    expect(await thoth.memSavePrompt('root-session', 'hello')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('does not make HTTP requests when disabled', async () => {
    const fetchMock = installFetchMock();
    const thoth = createThothClient({
      project: 'thoth-agents',
      enabled: false,
      timeoutMs: 25,
    });

    expect(await thoth.memContext()).toBeNull();
    expect(await thoth.memSessionStart('root-session')).toBe(false);
    expect(await thoth.memSavePrompt('root-session', 'prompt')).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
