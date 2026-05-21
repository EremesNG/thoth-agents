/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { buildModelKeyAliases } from './model-key-normalization';

describe('model key normalization', () => {
  test('normalizes multi-segment chutes model ids', () => {
    const aliases = buildModelKeyAliases(
      'chutes/Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8-TEE',
    );

    expect(aliases).toContain('qwen/qwen3-coder-480b-a35b-instruct');
    expect(aliases).toContain('qwen3-coder-480b-a35b-instruct');
    expect(aliases).not.toContain('qwen3-coder-480b-a35b-instruct-fp8-tee');
  });

  test('treats spaces and hyphens as equivalent aliases', () => {
    const aliases = buildModelKeyAliases('Qwen3 Coder 480B A35B Instruct');
    expect(aliases).toContain('qwen3-coder-480b-a35b-instruct');
  });
});
