/** Canonical CommonJS runtime emitted into the Codex-only plugin hook directory. */
export function renderCodexHookScript(roleNames: readonly string[]): string {
  return `const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const roles = ${JSON.stringify(roleNames)};

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  let payload;
  if (input?.hook_event_name === 'SessionStart') {
    payload = 'root';
  } else if (input?.hook_event_name === 'SubagentStart' && roles.includes(input.agent_type)) {
    payload = input.agent_type;
  }
  if (payload) {
    const additionalContext = readFileSync(join(__dirname, 'payloads', payload + '.md'), 'utf8');
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: input.hook_event_name,
      additionalContext,
    } }));
  }
} catch {
  // Invalid input or unavailable payloads must never prevent a Codex session from starting.
}
`;
}
