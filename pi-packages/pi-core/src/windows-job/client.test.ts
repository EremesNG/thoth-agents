import { describe, expect, it } from 'vitest';
import {
  JobLauncherUnavailable,
  parseMessage,
  quoteWindowsArg,
  responseError,
} from './client.js';

describe('Windows job protocol', () => {
  it('quotes empty, whitespace, embedded quotes and trailing backslashes using Windows argv rules', () => {
    expect(
      ['', 'hello', 'a b', 'a"b', 'a\\', 'a\\"b'].map(quoteWindowsArg),
    ).toEqual(['""', '"hello"', '"a b"', '"a\\"b"', '"a\\\\"', '"a\\\\\\"b"']);
  });
  it('rejects malformed protocol and preserves unsigned exit codes', () => {
    expect(
      parseMessage('{"event":"exit","key":"a","code":4294967295}'),
    ).toMatchObject({ code: 4294967295 });
    for (const line of [
      'no',
      'null',
      '{}',
      '{"event":"exit","key":"a","code":-1}',
    ])
      expect(() => parseMessage(line)).toThrow();
  });
  it('distinguishes target spawn errors from unavailable containment', () => {
    expect(
      responseError({ id: 1, error: 'missing file', kind: 'target', code: 2 }),
    ).not.toBeInstanceOf(JobLauncherUnavailable);
    expect(
      responseError({
        id: 1,
        error: 'assignment denied',
        kind: 'unavailable',
        code: 5,
      }),
    ).toBeInstanceOf(JobLauncherUnavailable);
  });
});
