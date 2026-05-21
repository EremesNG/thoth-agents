import type { Event, Model, Part, Session } from '@opencode-ai/sdk';
import type { ThothConfig } from '../../config';
import { createThothClient } from '../../thoth';
import { log } from '../../utils';
import {
  buildCompactionReminder,
  buildCompactorInstruction,
  buildMemoryInstructions,
  buildSaveNudge,
  FIRST_ACTION_INSTRUCTION,
} from './protocol';

type RootSessionLike = Pick<Session, 'id' | 'parentID'>;

function isRootSession(session: RootSessionLike): boolean {
  return !session.parentID;
}

function getSessionInfo(event: Event): RootSessionLike | null {
  const info = (event.properties as { info?: RootSessionLike } | undefined)
    ?.info;

  return info?.id ? info : null;
}

export interface CreateThothMemHookOptions {
  project: string;
  directory?: string;
  thoth?: ThothConfig;
  enabled?: boolean;
}

function isTextPart(part: Part): part is Extract<Part, { type: 'text' }> {
  return part.type === 'text';
}

function extractPromptText(parts: Part[]): string | null {
  const text = parts
    .filter(isTextPart)
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join('\n\n');

  return text.length > 0 ? text : null;
}

function appendInstruction(target: string, instruction: string): string {
  if (target.includes(instruction)) {
    return target;
  }

  return `${target}\n\n${instruction}`;
}

function stripPrivateTags(str: string): string {
  if (!str) {
    return '';
  }

  return str.replace(/<private>[\s\S]*?<\/private>/gi, '[REDACTED]').trim();
}

function truncate(str: string, max: number): string {
  if (!str) {
    return '';
  }

  return str.length > max ? `${str.slice(0, max)}...` : str;
}

function sanitizePromptText(text: string): string {
  return truncate(stripPrivateTags(text), 2000);
}

function isSessionSummaryTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();

  return (
    normalized === 'mem_session_summary' ||
    normalized.endsWith('.mem_session_summary') ||
    normalized.endsWith('_mem_session_summary')
  );
}

function isMemSaveTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return (
    normalized === 'mem_save' ||
    normalized.endsWith('.mem_save') ||
    normalized.endsWith('_mem_save')
  );
}

export function createThothMemHook(options: CreateThothMemHookOptions) {
  const enabled = options.enabled !== false;
  const thoth = createThothClient({
    project: options.project,
    directory: options.directory,
    httpPort: options.thoth?.http_port,
    timeoutMs: options.thoth?.timeout,
    enabled,
  });

  const trackedRootSessions = new Set<string>();
  const needsCompactionFollowUp = new Set<string>();
  const sessionCreatedAt = new Map<string, number>();
  const lastMemSaveAt = new Map<string, number>();
  const nudgePending = new Set<string>();

  function isTrackedRootSession(sessionId?: string): sessionId is string {
    return typeof sessionId === 'string' && trackedRootSessions.has(sessionId);
  }

  function shouldInjectSaveNudge(sessionId: string): boolean {
    if (nudgePending.has(sessionId)) {
      return false;
    }
    if (needsCompactionFollowUp.has(sessionId)) {
      return false;
    }

    const createdAt = sessionCreatedAt.get(sessionId);
    if (!createdAt || Date.now() - createdAt < 5 * 60 * 1000) {
      return false;
    }

    const lastSave = lastMemSaveAt.get(sessionId);
    if (lastSave && Date.now() - lastSave < 15 * 60 * 1000) {
      return false;
    }

    nudgePending.add(sessionId);
    return true;
  }

  async function handleSessionCreated(session: RootSessionLike): Promise<void> {
    if (!enabled || !isRootSession(session)) {
      return;
    }

    const started = await thoth.memSessionStart(session.id);
    if (started) {
      trackedRootSessions.add(session.id);
      sessionCreatedAt.set(session.id, Date.now());
    } else {
      log('[thoth] session start unavailable, skipping tracking:', session.id);
    }
  }

  function handleSessionCompacted(session: RootSessionLike): void {
    if (!enabled || !isRootSession(session) || !session.id) {
      return;
    }

    needsCompactionFollowUp.add(session.id);
  }

  function handleSessionDeleted(session: RootSessionLike): void {
    trackedRootSessions.delete(session.id);
    needsCompactionFollowUp.delete(session.id);
    sessionCreatedAt.delete(session.id);
    lastMemSaveAt.delete(session.id);
    nudgePending.delete(session.id);
  }

  return {
    event: async ({ event }: { event: Event }): Promise<void> => {
      switch (event.type) {
        case 'session.created': {
          const session = getSessionInfo(event);
          if (!session) {
            break;
          }

          await handleSessionCreated(session);
          break;
        }
        case 'session.compacted': {
          const session = getSessionInfo(event);
          if (!session) {
            break;
          }

          handleSessionCompacted(session);
          break;
        }
        case 'session.deleted': {
          const session = getSessionInfo(event);
          if (!session) {
            break;
          }

          handleSessionDeleted(session);
          break;
        }
      }
    },

    'chat.message': async (
      input: { sessionID: string },
      output: {
        parts: Part[];
        message: { summary?: { title?: string; body?: string } };
      },
    ): Promise<void> => {
      void output.message;

      if (!enabled) {
        return;
      }

      if (!isTrackedRootSession(input.sessionID)) {
        return;
      }

      const promptText = extractPromptText(output.parts);
      if (!promptText) {
        return;
      }

      const sanitizedPromptText = sanitizePromptText(promptText);
      if (!sanitizedPromptText || sanitizedPromptText.length <= 10) {
        return;
      }

      await thoth.memSavePrompt(input.sessionID, sanitizedPromptText);
    },

    'experimental.chat.system.transform': async (
      input: { sessionID?: string; model: Model },
      output: { system: string[] },
    ): Promise<void> => {
      void input.model;

      if (!enabled || !input.sessionID) {
        return;
      }

      if (!isTrackedRootSession(input.sessionID)) {
        return;
      }

      const memoryInstructions = buildMemoryInstructions(
        input.sessionID,
        options.project,
      );
      const compactionReminder = needsCompactionFollowUp.has(input.sessionID)
        ? buildCompactionReminder(input.sessionID)
        : null;
      const saveNudge = shouldInjectSaveNudge(input.sessionID)
        ? buildSaveNudge()
        : null;

      if (output.system.length === 0) {
        let systemPrompt = memoryInstructions;
        if (compactionReminder) {
          systemPrompt = appendInstruction(systemPrompt, compactionReminder);
        }
        if (saveNudge) {
          systemPrompt = appendInstruction(systemPrompt, saveNudge);
        }
        output.system.push(systemPrompt);
        return;
      }

      const lastIndex = output.system.length - 1;
      let updatedSystemPrompt = appendInstruction(
        output.system[lastIndex],
        memoryInstructions,
      );

      if (compactionReminder) {
        updatedSystemPrompt = appendInstruction(
          updatedSystemPrompt,
          compactionReminder,
        );
      }

      if (saveNudge) {
        updatedSystemPrompt = appendInstruction(updatedSystemPrompt, saveNudge);
      }

      output.system[lastIndex] = updatedSystemPrompt;
    },

    'experimental.session.compacting': async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ): Promise<void> => {
      void output.prompt;

      if (!enabled) {
        return;
      }

      if (!isTrackedRootSession(input.sessionID)) {
        return;
      }

      needsCompactionFollowUp.add(input.sessionID);

      output.context.push(buildCompactorInstruction(options.project));
      output.context.push(FIRST_ACTION_INSTRUCTION);

      const memoryContext = await thoth.memContext(input.sessionID);
      if (memoryContext) {
        output.context.push(memoryContext);
      }
    },

    'tool.execute.after': async (
      input: {
        tool: string;
        sessionID: string;
        callID: string;
        args: unknown;
      },
      output: {
        title: string;
        output: string;
        metadata: unknown;
      },
    ): Promise<void> => {
      void input.callID;
      void input.args;
      void output.title;
      void output.output;
      void output.metadata;

      if (!enabled) {
        return;
      }

      if (isMemSaveTool(input.tool)) {
        lastMemSaveAt.set(input.sessionID, Date.now());
        nudgePending.delete(input.sessionID);
      }

      if (isSessionSummaryTool(input.tool)) {
        needsCompactionFollowUp.delete(input.sessionID);
      }
    },
  };
}
