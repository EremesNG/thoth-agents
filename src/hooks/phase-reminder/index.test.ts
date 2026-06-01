import { describe, expect, test } from 'vitest';
import { LITE_INTERNAL_INITIATOR_MARKER } from '../../utils';
import {
  createPhaseReminderHook,
  PHASE_REMINDER,
  PHASE_REMINDER_SEPARATOR,
  stripPhaseReminder,
} from './index';

describe('createPhaseReminderHook', () => {
  test('prepends reminder for orchestrator sessions', async () => {
    const hook = createPhaseReminderHook();
    const output = {
      messages: [
        {
          info: { role: 'user', agent: 'orchestrator' },
          parts: [{ type: 'text', text: 'hello' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toBe(
      `${PHASE_REMINDER}${PHASE_REMINDER_SEPARATOR}hello`,
    );
    expect(PHASE_REMINDER).not.toContain('Context Packet');
    expect(PHASE_REMINDER).toContain('internal handoff');
    expect(PHASE_REMINDER).toContain('concrete scope, anchors, steps');
    expect(PHASE_REMINDER).toContain('write sub-agent prompts in English');
    expect(PHASE_REMINDER).toContain('split discovery into surgical probes');
    expect(PHASE_REMINDER).toContain(
      'after oracle returns [OKAY], give a deep approved-plan overview',
    );
  });

  test('skips non-orchestrator sessions', async () => {
    const hook = createPhaseReminderHook();
    const output = {
      messages: [
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'hello' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toBe('hello');
  });

  test('skips internal notification turns', async () => {
    const hook = createPhaseReminderHook();
    const output = {
      messages: [
        {
          info: { role: 'user' },
          parts: [
            {
              type: 'text',
              text: `[Background task "x" completed]\n${LITE_INTERNAL_INITIATOR_MARKER}`,
            },
          ],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toContain(
      LITE_INTERNAL_INITIATOR_MARKER,
    );
    expect(output.messages[0].parts[0].text).not.toContain(PHASE_REMINDER);
  });
});

describe('stripPhaseReminder', () => {
  test('removes the exact injected reminder prefix', () => {
    expect(
      stripPhaseReminder(
        `${PHASE_REMINDER}${PHASE_REMINDER_SEPARATOR}Real user request`,
      ),
    ).toBe('Real user request');
  });

  test('leaves unrelated text untouched', () => {
    expect(stripPhaseReminder('Real user request')).toBe('Real user request');
  });

  test('handles empty string', () => {
    expect(stripPhaseReminder('')).toBe('');
  });

  test('does not strip a user reminder without the full injected prefix', () => {
    const userTyped =
      '<reminder>remember this</reminder>\n\n---\n\nReal user request';

    expect(stripPhaseReminder(userTyped)).toBe(userTyped);
  });
});
