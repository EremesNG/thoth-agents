import { describe, expect, test } from 'bun:test';
import { resetServerCheck } from './tmux';

describe('tmux utils', () => {
  describe('resetServerCheck', () => {
    test('resetServerCheck is exported and is a function', () => {
      expect(typeof resetServerCheck).toBe('function');
    });

    test('resetServerCheck does not throw', () => {
      expect(() => resetServerCheck()).not.toThrow();
    });

    test('can be called multiple times', () => {
      expect(() => {
        resetServerCheck();
        resetServerCheck();
        resetServerCheck();
      }).not.toThrow();
    });
  });

  // Note: Testing getTmuxPath, spawnTmuxPane, and closeTmuxPane requires:
  // 1. Mocking Bun's spawn function
  // 2. Mocking file system operations
  // 3. Running in a tmux environment
  // 4. Mocking HTTP fetch for server checks
  //
  // These are better suited for integration tests rather than unit tests.
  // The current tests cover the simple, pure functions that don't require mocking.
});
