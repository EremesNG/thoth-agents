import { claudeCodeSubagentType } from '../agents/prompt-dialects';

/** Standalone ESM runtime shared by the explicitly declared Claude and Codex hooks. */
export function renderGateHookScript(): string {
  return `import { readFileSync } from 'node:fs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (typeof input?.cwd === 'string') {
    const messages = [];
    let malformed = false;
    if (input.hook_event_name === 'UserPromptSubmit' && typeof input.prompt === 'string') {
      const lines = input.prompt.split(/\\r?\\n/);
      const frameStart = /^<agent-message from="([^"<>\\s]+)">$/;
      // Frames quoted later in an ordinary prompt are not hand-back deliveries.
      if (!frameStart.test(lines.find(line => line.trim() !== '') ?? '')) process.exit(0);
      // Scan the whole delivery before validating: a closer must not approve a report prefix.
      let frame;
      for (const line of lines) {
        const start = frameStart.exec(line);
        if (line.startsWith('<agent-message')) {
          if (frame || !start) malformed = true;
          if (start) {
            frame = { agent: start[1], text: '', raw: '', header: false, report: false };
            messages.push(frame);
          }
        } else if (line === '</agent-message>') {
          if (!frame?.report) malformed = true;
          frame = undefined;
        } else if (frame) {
          frame.raw += line + '\\n';
          if (!frame.report) {
            if (!frame.header) {
              frame.header = line.startsWith('[Subagent hand-back]');
              if (!frame.header) malformed = true;
            }
            if (/^[ \\t]/.test(line)) malformed = true;
            if (frame.header && line.endsWith('The report follows:')) frame.report = true;
          } else {
            if (line !== '' && !line.startsWith('  ')) malformed = true;
            frame.text += line.slice(2) + '\\n';
          }
        } else if (line.trim() !== '') {
          malformed = true;
        }
      }
      if (frame) malformed = true;
    } else if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'Agent' &&
        input.tool_input?.subagent_type === ${JSON.stringify(claudeCodeSubagentType('oracle'))} &&
        input.tool_response?.status === 'completed' &&
        Array.isArray(input.tool_response.content)) {
      const text = input.tool_response.content
        .filter(block => block?.type === 'text' && typeof block.text === 'string')
        .map(block => block.text).join('\\n');
      messages.push({ text, agent: input.tool_input.subagent_type });
    } else if (input.hook_event_name === 'PostToolUse' &&
               (input.tool_name === 'wait_agent' || input.tool_name === 'multi_agent_v1wait_agent') &&
               typeof input.tool_response === 'string') {
      // Codex serializes WaitAgentResult as JSON text; status keys are agent paths or thread IDs.
      const response = JSON.parse(input.tool_response);
      if (response?.status && typeof response.status === 'object' && !Array.isArray(response.status)) {
        for (const [agent, status] of Object.entries(response.status)) {
          if (typeof status?.completed === 'string') messages.push({ text: status.completed, agent });
        }
      }
    }
    const gates = messages.filter(({ text, raw }) =>
      (malformed ? raw ?? text : text).includes('\`\`\`thoth-result'));
    if (gates.length) {
      const { summarizeGateResult, formatGateVerdict } =
        await import('../skills/thoth-sdd/scripts/validate-result.mjs');
      // An empty envelope supplies the canonical ENVELOPE_FORMAT summary with no trusted fields.
      const framingFailure = malformed ? summarizeGateResult('') : undefined;
      const lines = gates.map(({ text, agent }) =>
        formatGateVerdict({ ...(framingFailure ?? summarizeGateResult(text, { cwd: input.cwd })), agent }));
      process.stdout.write(JSON.stringify({ hookSpecificOutput: {
        hookEventName: input.hook_event_name,
        additionalContext: lines.join('\\n'),
      } }));
    }
  }
} catch {
  // Delivery is additive: malformed input or unavailable validation must never block the event.
}
`;
}
