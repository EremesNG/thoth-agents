import { expect, test } from 'vitest';
import { createPermissionGate } from '../src/permissions.js';

const request = {
  toolCall: {
    title: 'Run tests',
    kind: 'execute',
    rawInput: { command: 'pnpm test' },
    locations: [{ path: '/repo' }],
    content: [{ type: 'diff', path: '/file', oldText: 'old', newText: 'new' }],
  },
  options: [
    { optionId: 'yes', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'no', name: 'Reject', kind: 'reject_once' },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
  ],
};
const selected = (optionId: string) => ({
  outcome: { outcome: 'selected', optionId },
});
test.each([
  ['Allow once', 'yes'],
  ['Reject', 'no'],
  ['Always allow', 'always'],
])('maps explicit %s choice to Junie option id', async (choice, id) => {
  const gate = createPermissionGate();
  const result = await gate.request(request, {
    ui: {
      select: async (title, options) => {
        expect(title).toContain('Run tests');
        expect(title).toContain('execute');
        expect(title).toContain('pnpm test');
        expect(title).toContain('/repo');
        expect(title).toContain('/file');
        expect(options).toEqual(['Allow once', 'Reject', 'Always allow']);
        return choice;
      },
    },
  });
  expect(result).toEqual(selected(id));
});
test('headless and dismissed requests reject once, or cancel when no rejection option exists', async () => {
  const gate = createPermissionGate();
  expect(await gate.request(request)).toEqual(selected('no'));
  expect(
    await gate.request(request, { ui: { select: async () => undefined } }),
  ).toEqual(selected('no'));
  expect(
    await gate.request({ ...request, options: [request.options[0]] }),
  ).toEqual({ outcome: { outcome: 'cancelled' } });
});
test('timeout and abort reject, abort the dialog, and release the queue', async () => {
  const gate = createPermissionGate({ timeoutMs: 20 });
  let dialogSignal: AbortSignal | undefined;
  const ui = {
    select: async (
      _title: string,
      _options: string[],
      options?: { signal?: AbortSignal },
    ) => {
      dialogSignal = options?.signal;
      return new Promise<string | undefined>(() => {});
    },
  };
  expect(await gate.request(request, { ui })).toEqual(selected('no'));
  expect(dialogSignal?.aborted).toBe(true);
  const controller = new AbortController();
  const pending = gate.request(request, { ui, signal: controller.signal });
  controller.abort();
  expect(await pending).toEqual(selected('no'));
  expect(
    await gate.request(request, { ui: { select: async () => 'Allow once' } }),
  ).toEqual(selected('yes'));
});
test('dialogs are serialized and queued aborted requests never display', async () => {
  const gate = createPermissionGate();
  let finish!: (choice: string) => void;
  const shown: string[] = [];
  const first = gate.request(request, {
    ui: {
      select: async () => {
        shown.push('first');
        return new Promise<string>((resolve) => (finish = resolve));
      },
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  const controller = new AbortController();
  const second = gate.request(request, {
    signal: controller.signal,
    ui: {
      select: async () => {
        shown.push('second');
        return 'Allow once';
      },
    },
  });
  controller.abort();
  const third = gate.request(request, {
    ui: {
      select: async () => {
        shown.push('third');
        return 'Reject';
      },
    },
  });
  expect(shown).toEqual(['first']);
  finish('Allow once');
  expect(await first).toEqual(selected('yes'));
  expect(await second).toEqual(selected('no'));
  expect(await third).toEqual(selected('no'));
  expect(shown).toEqual(['first', 'third']);
});
