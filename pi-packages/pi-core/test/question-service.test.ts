import { afterEach, describe, expect, it } from 'vitest';
import {
  getQuestionService,
  type QuestionServiceHandle,
  type QuestionServiceProvider,
  registerQuestionService,
} from '../src/index.js';

const handles: QuestionServiceHandle[] = [];
const registryKey = Symbol.for('thoth-agents.pi-core.question-service.v1');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const provider = (): QuestionServiceProvider => ({
  async ask() {
    return { status: 'answered', answers: {} };
  },
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.withdraw();
  delete shared[registryKey];
});

describe('question service registry', () => {
  it.each([
    null,
    {},
    { entries: {} },
    { entries: [null] },
    { entries: [{ token: 'foreign', provider: provider() }] },
    { entries: [{ token: Symbol(), provider: null }] },
    { entries: [{ token: Symbol(), provider: { ask: 42 } }] },
    {
      get entries(): never {
        throw new Error('foreign accessor');
      },
    },
    {
      entries: [
        {
          token: Symbol(),
          provider: {
            get ask(): never {
              throw new Error('foreign provider accessor');
            },
          },
        },
      ],
    },
  ])('treats incompatible foreign records as unavailable without replacing them', (record) => {
    shared[registryKey] = record;
    expect(getQuestionService()).toBeUndefined();
    const handle = registerQuestionService(provider());
    handles.push(handle);
    expect(getQuestionService()).toBeUndefined();
    expect(() => handle.withdraw()).not.toThrow();
    expect(() => handle.withdraw()).not.toThrow();
    expect(shared[registryKey]).toBe(record);
  });

  it('resolves the latest live provider and restores the earlier owner on withdrawal', () => {
    const earlier = provider();
    const later = provider();
    const first = registerQuestionService(earlier);
    const second = registerQuestionService(later);
    handles.push(first, second);
    expect(getQuestionService()).toBe(later);
    second.withdraw();
    expect(getQuestionService()).toBe(earlier);
    second.withdraw();
    expect(getQuestionService()).toBe(earlier);
    first.withdraw();
    expect(getQuestionService()).toBeUndefined();
  });

  it('withdraws a hidden registration without removing the current provider', () => {
    const first = registerQuestionService(provider());
    const latest = provider();
    const second = registerQuestionService(latest);
    handles.push(first, second);
    first.withdraw();
    first.withdraw();
    expect(getQuestionService()).toBe(latest);
    second.withdraw();
    expect(getQuestionService()).toBeUndefined();
  });

  it('tracks registrations separately even when they publish the same provider', () => {
    const service = provider();
    const first = registerQuestionService(service);
    const second = registerQuestionService(service);
    handles.push(first, second);
    second.withdraw();
    expect(getQuestionService()).toBe(service);
    first.withdraw();
    expect(getQuestionService()).toBeUndefined();
  });

  it('shares registration and withdrawal across independently loaded copies', async () => {
    const copy = await import(
      `${new URL('../src/question-service.ts', import.meta.url).href}?copy`
    );
    const earlier = provider();
    const later = provider();
    const first = registerQuestionService(earlier);
    handles.push(first);
    expect(copy.getQuestionService()).toBe(earlier);
    const second = copy.registerQuestionService(later);
    handles.push(second);
    expect(getQuestionService()).toBe(later);
    expect(copy.getQuestionService()).toBe(later);
    second.withdraw();
    expect(copy.getQuestionService()).toBe(earlier);
    first.withdraw();
    expect(copy.getQuestionService()).toBeUndefined();
  });

  it('returns no provider when absent and resolves a registered provider unchanged', async () => {
    expect(getQuestionService()).toBeUndefined();
    const service = provider();
    handles.push(registerQuestionService(service));
    expect(getQuestionService()).toBe(service);
    await expect(
      getQuestionService()?.ask({}, { questions: [] }, {}),
    ).resolves.toEqual({
      status: 'answered',
      answers: {},
    });
  });
});
