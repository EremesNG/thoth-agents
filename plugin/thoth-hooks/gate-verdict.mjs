import { readFileSync } from 'node:fs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input?.hook_event_name === 'PostToolUse' && typeof input.cwd === 'string') {
    const messages = [];
    if (input.tool_name === 'Agent' &&
        input.tool_input?.subagent_type === "thoth-agents:oracle" &&
        input.tool_response?.status === 'completed' &&
        Array.isArray(input.tool_response.content)) {
      const text = input.tool_response.content
        .filter(block => block?.type === 'text' && typeof block.text === 'string')
        .map(block => block.text).join('\n');
      messages.push({ text, agent: input.tool_input.subagent_type });
    } else if ((input.tool_name === 'wait_agent' || input.tool_name === 'multi_agent_v1wait_agent') &&
               typeof input.tool_response === 'string') {
      // Codex serializes WaitAgentResult as JSON text; status keys are agent paths or thread IDs.
      const response = JSON.parse(input.tool_response);
      if (response?.status && typeof response.status === 'object' && !Array.isArray(response.status)) {
        for (const [agent, status] of Object.entries(response.status)) {
          if (typeof status?.completed === 'string') messages.push({ text: status.completed, agent });
        }
      }
    }
    const gates = messages.filter(({ text }) => text.includes('```thoth-result'));
    if (gates.length) {
      const { summarizeGateResult, formatGateVerdict } =
        await import('../skills/thoth-sdd/scripts/validate-result.mjs');
      const lines = gates.map(({ text, agent }) =>
        formatGateVerdict({ ...summarizeGateResult(text, { cwd: input.cwd }), agent }));
      process.stdout.write(JSON.stringify({ hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: lines.join('\n'),
      } }));
    }
  }
} catch {
  // Delivery is additive: malformed input or unavailable validation must never block the tool.
}
