/**
 * Phase reminder to inject before each user message.
 * Keeps workflow instructions in the immediate attention window
 * to combat instruction-following degradation over long contexts.
 *
 * Research: "LLMs Get Lost In Multi-Turn Conversation" (arXiv:2505.06120)
 * shows ~40% compliance drop after 2-3 turns without reminders.
 *
 * Uses experimental.chat.messages.transform so it doesn't show in UI.
 */
import { LITE_INTERNAL_INITIATOR_MARKER } from '../../utils';

export const PHASE_REMINDER = `<reminder>Recall Workflow Rules:
Understand → split discovery into surgical probes with explorer/librarian → synthesize the decision and internal handoff → execute → verify.
If delegating, write sub-agent prompts in English and launch the specialist in the same turn you mention it. If multiple delegations are independent, emit all tool calls in a single response.
Before write-capable dispatch, give concrete scope, anchors, steps, non-goals, and verification.
In SDD, after oracle returns [OKAY], ask the user before implementation.</reminder>`;

interface MessageInfo {
  role: string;
  agent?: string;
  sessionID?: string;
}

interface MessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface MessageWithParts {
  info: MessageInfo;
  parts: MessagePart[];
}

/**
 * Creates the experimental.chat.messages.transform hook for phase reminder injection.
 * This hook runs right before sending to API, so it doesn't affect UI display.
 * Only injects for the orchestrator agent.
 */
export function createPhaseReminderHook() {
  return {
    'experimental.chat.messages.transform': async (
      _input: Record<string, never>,
      output: { messages: MessageWithParts[] },
    ): Promise<void> => {
      const { messages } = output;

      if (messages.length === 0) {
        return;
      }

      // Find the last user message
      let lastUserMessageIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === 'user') {
          lastUserMessageIndex = i;
          break;
        }
      }

      if (lastUserMessageIndex === -1) {
        return;
      }

      const lastUserMessage = messages[lastUserMessageIndex];

      // Only inject for orchestrator (or if no agent specified = main session)
      const agent = lastUserMessage.info.agent;
      if (agent && agent !== 'orchestrator') {
        return;
      }

      // Find the first text part
      const textPartIndex = lastUserMessage.parts.findIndex(
        (p) => p.type === 'text' && p.text !== undefined,
      );

      if (textPartIndex === -1) {
        return;
      }

      const originalText = lastUserMessage.parts[textPartIndex].text ?? '';
      if (originalText.includes(LITE_INTERNAL_INITIATOR_MARKER)) {
        return;
      }

      // Prepend the reminder to the existing text
      lastUserMessage.parts[textPartIndex].text =
        `${PHASE_REMINDER}\n\n---\n\n${originalText}`;
    },
  };
}
