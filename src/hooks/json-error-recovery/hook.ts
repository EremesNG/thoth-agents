import {
  appendErrorGuidance,
  type DelegationToolEvent,
} from '../delegate-task-retry/hook';

export const JSON_ERROR_TOOL_EXCLUDE_LIST = [
  'bash',
  'read',
  'glob',
  'webfetch',
  'grep_app_searchgithub',
  'exa_web_search_exa',
] as const;

export const JSON_ERROR_PATTERNS = [
  /json parse error/i,
  /failed to parse json/i,
  /invalid json/i,
  /malformed json/i,
  /unexpected end of json input/i,
  /syntaxerror:\s*unexpected token.*json/i,
  /json[^\n]*expected '\}'/i,
  /json[^\n]*unexpected eof/i,
] as const;

const JSON_ERROR_REMINDER_MARKER =
  '[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]';

export const JSON_ERROR_REMINDER = `
[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]

You sent invalid JSON arguments. The system could not parse your tool call.
STOP and do this NOW:

1. LOOK at the error message above to see what was expected vs what you sent.
2. CORRECT your JSON syntax (missing braces, unescaped quotes, trailing commas, etc).
3. RETRY the tool call with valid JSON.

DO NOT repeat the exact same invalid call.
`;

export function createJsonErrorRecoveryHook() {
  return async (event: DelegationToolEvent): Promise<void> => {
    if (event.tool !== 'subagent' || event.status !== 'error') return;
    const text = event.error.message;
    if (text.includes(JSON_ERROR_REMINDER_MARKER)) return;
    if (!JSON_ERROR_PATTERNS.some((pattern) => pattern.test(text))) return;
    appendErrorGuidance(event, JSON_ERROR_REMINDER);
  };
}
