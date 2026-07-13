import { describe, expect, test } from 'vitest';
import { renderClaudeCodeSubagent } from './claude-code-subagent';

describe('renderClaudeCodeSubagent', () => {
  test('renders deterministic frontmatter and body', () => {
    const output = renderClaudeCodeSubagent({
      name: 'explorer',
      description: 'Find workspace facts fast',
      tools: 'Read, Grep, Glob',
      model: 'sonnet',
      instructions: 'You are the explorer.',
    });

    expect(output).toBe(
      [
        '---',
        'name: explorer',
        // plain scalar: no YAML-significant characters
        'description: Find workspace facts fast',
        'model: sonnet',
        // quoted: contains commas
        'tools: "Read, Grep, Glob"',
        '---',
        '',
        'You are the explorer.',
        '',
      ].join('\n'),
    );
  });

  test('quotes descriptions that contain YAML-significant characters', () => {
    const output = renderClaudeCodeSubagent({
      name: 'oracle',
      description: 'Advice: diagnosis, review, and plan review',
      tools: 'Read, Grep, Glob',
      model: 'opus',
      instructions: 'body',
    });

    expect(output).toContain(
      'description: "Advice: diagnosis, review, and plan review"',
    );
  });

  test('escapes double quotes and backslashes in quoted scalars', () => {
    const output = renderClaudeCodeSubagent({
      name: 'oracle',
      description: 'Reviews "plans" and C:\\paths',
      tools: 'Read, Grep, Glob',
      model: 'opus',
      instructions: 'body',
    });

    expect(output).toContain(
      'description: "Reviews \\"plans\\" and C:\\\\paths"',
    );
    expect(output).toContain('model: opus');
  });

  test('keeps simple names unquoted', () => {
    const output = renderClaudeCodeSubagent({
      name: 'quick',
      description: 'desc',
      tools: 'Read, Edit, Write, Bash, Grep, Glob',
      model: 'inherit',
      instructions: 'body',
    });

    expect(output).toContain('name: quick');
    expect(output).toContain('model: inherit');
  });

  test('renders effort only when explicitly configured', () => {
    const explicit = renderClaudeCodeSubagent({
      name: 'deep',
      description: 'desc',
      model: 'opus',
      effort: 'max',
      instructions: 'body',
    });
    const inherited = renderClaudeCodeSubagent({
      name: 'deep',
      description: 'desc',
      model: 'opus',
      instructions: 'body',
    });

    expect(explicit).toContain('effort: max');
    expect(inherited).not.toMatch(/^effort:/m);
  });
});
