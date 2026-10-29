import { describe, expect, it, vi } from 'vitest';
import {
  consumeInteractionResponse,
  consumeLatestInteractionRequest,
  interactionRequestFromCandidate,
  publishInteractionRequest,
  publishInteractionResponse,
  resolveInteractionRequest,
  sanitizeInteractionTransportText,
} from '../src/interaction-channel.js';

// Preserve the original implementation as the output-equivalence oracle.
function referenceSanitizeInteractionTransportText(text: string): string {
  if (!text) return text;
  return text.replace(
    /interaction_required:[^\r\n]*/g,
    '[interaction request hidden]',
  );
}

describe('generic subagent interaction channel', () => {
  it('publishes arbitrary interaction requests and responses by handle/request id', () => {
    const request = {
      type: 'interaction_required' as const,
      requestId: 'req-anything',
      kind: 'custom-form',
      origin: 'subagent',
      requester: { subagentName: 'analyst', taskId: 'task-1' },
      prompt: { title: 'Need a decision', message: 'Choose how to continue.' },
      payload: { form: { fields: [{ name: 'strategy', type: 'string' }] } },
      response: { expected: 'json' as const },
    };

    const published = publishInteractionRequest(request);
    expect(published.handle).toMatch(/^interaction_/);
    expect(resolveInteractionRequest(published.handle)).toEqual(request);
    expect(consumeLatestInteractionRequest({ origin: 'subagent' })).toEqual(
      request,
    );
    expect(resolveInteractionRequest(published.handle)).toBeUndefined();

    publishInteractionResponse({
      type: 'interaction_response',
      requestId: request.requestId,
      status: 'answered',
      value: { strategy: 'safe' },
    });
    expect(consumeInteractionResponse(request.requestId)).toMatchObject({
      type: 'interaction_response',
      requestId: 'req-anything',
      status: 'answered',
      value: { strategy: 'safe' },
    });
  });

  it('extracts nested generic interaction requests from arbitrary carriers', () => {
    const request = {
      type: 'interaction_required' as const,
      requestId: 'req-nested',
      kind: 'operator-decision',
      origin: 'subagent',
      prompt: {
        title: 'Need operator decision',
        message: 'Pick a rollout strategy.',
        choices: ['safe', 'fast'],
      },
      payload: { rollout: { environments: ['staging', 'prod'] } },
    };

    expect(
      interactionRequestFromCandidate({
        details: { interactionRequest: { payload: request } },
      }),
    ).toMatchObject(request);
  });

  it('matches the original sanitizer for adversarial transport text', () => {
    const marker = 'interaction_required:';
    const longText = 'streaming output 🙂\ud800\udfff '.repeat(50_000);
    const inputs = [
      '',
      'ordinary output without a marker',
      'interaction_required',
      'interaction_required :payload',
      'interaction-required:payload',
      'interaction_required\uff1apayload',
      'INTERACTION_REQUIRED:payload',
      'Interaction_required:payload',
      'interaction_Required:payload',
      marker,
      `${marker}payload`,
      `prefix ${marker}`,
      `prefix ${marker}payload suffix`,
      `${marker}${marker}payload`,
      `prefix ${marker}first ${marker}second`,
      `${marker}first\n${marker}second\n${marker}`,
      '🙂\ud800\udfff',
      longText,
      `${marker}${longText}`,
      `${longText}${marker}`,
      `${longText}${marker}payload\n${longText}${marker}`,
      `${marker}payload\n`.repeat(10_000),
    ];

    for (const separator of ['\n', '\r\n', '\r', '\u2028', '\u2029']) {
      inputs.push(
        `${separator}${marker}`,
        `${marker}payload${separator}safe text`,
        `safe text${separator}${marker}payload`,
        `${marker}first${separator}${marker}second${separator}tail`,
        `🙂\ud800${marker}\udfff${separator}🙂\udfff`,
      );
    }

    for (const [index, text] of inputs.entries()) {
      expect(sanitizeInteractionTransportText(text), `input ${index}`).toBe(
        referenceSanitizeInteractionTransportText(text),
      );
    }
  });

  it('returns marker-free text unchanged without calling replace', () => {
    const inputs = [
      '',
      'ordinary streaming output',
      'interaction_required',
      'interaction_required :payload',
      'INTERACTION_REQUIRED:payload',
      'Interaction_required:payload',
      'interaction_Required:payload',
      '🙂\ud800x\udfff\n\r\u2028\u2029',
      'streaming output\n'.repeat(100_000),
    ];
    const replace = vi.spyOn(String.prototype, 'replace');
    let results: string[];
    let replaceCalls: number;
    try {
      results = inputs.map(sanitizeInteractionTransportText);
      replaceCalls = replace.mock.calls.length;
    } finally {
      replace.mockRestore();
    }

    for (const [index, text] of inputs.entries()) {
      expect(results[index]).toBe(text);
    }
    expect(replaceCalls).toBe(0);
  });

  it('sanitizes generic interaction marker transport text', () => {
    const text = [
      'interaction_required:{"requestId":"req-1"}',
      'safe text',
    ].join('\n');

    expect(sanitizeInteractionTransportText(text)).toBe(
      ['[interaction request hidden]', 'safe text'].join('\n'),
    );
  });
});
