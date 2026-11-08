import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from '@opencode/plugin';
import { beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ast_grep_replace, ast_grep_search } from '../tools/ast-grep/tools';
import {
  lsp_diagnostics,
  lsp_find_references,
  lsp_goto_definition,
  lsp_rename,
} from '../tools/lsp/tools';
import type { OpenCodeDependencies } from './context';
import { registerTools } from './tools';

vi.mock('../tools/ast-grep/cli', () => ({ runSg: vi.fn() }));
vi.mock('../tools/lsp/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/lsp/utils')>()),
  withLspClient: vi.fn(),
  applyWorkspaceEdit: vi.fn(),
}));

import { runSg } from '../tools/ast-grep/cli';
import { applyWorkspaceEdit, withLspClient } from '../tools/lsp/utils';

const executionContext = () =>
  ({
    signal: new AbortController().signal,
    progress: vi.fn(async () => {}),
  }) as unknown as Parameters<typeof ast_grep_search.execute>[1];
beforeEach(() => vi.resetAllMocks());

test('registers all six JSON-Schema-representable, validating v2 tools', async () => {
  const add = vi.fn();
  await registerTools(
    {
      tool: {
        transform: async (edit: (editor: { add: typeof add }) => void) =>
          edit({ add }),
      },
    } as unknown as Plugin.Context,
    {} as OpenCodeDependencies,
  );
  expect(add.mock.calls.map(([tool]) => tool.name).sort()).toEqual([
    'ast_grep_replace',
    'ast_grep_search',
    'lsp_diagnostics',
    'lsp_find_references',
    'lsp_goto_definition',
    'lsp_rename',
  ]);
  for (const [tool] of add.mock.calls) {
    expect(z.toJSONSchema(tool.input).type).toBe('object');
    expect(tool.input.safeParse({}).success).toBe(false);
  }
  expect(
    lsp_goto_definition.input.safeParse({
      filePath: '/a.ts',
      line: 0,
      character: 0,
    }).success,
  ).toBe(false);
});

test('AST execution returns v2 content, progress and output metadata', async () => {
  vi.mocked(runSg).mockResolvedValue({
    matches: [],
    totalMatches: 0,
    truncated: false,
  });
  const context = executionContext();
  const result = await ast_grep_search.execute(
    { pattern: 'console.log($MSG)', lang: 'typescript' },
    context,
  );
  expect(result.content).toContain('No matches');
  expect(result.metadata).toEqual({ output: result.content });
  expect(context.progress).toHaveBeenCalledWith({ output: result.content });
  expect(runSg).toHaveBeenCalledWith(
    expect.objectContaining({ signal: context.signal }),
  );
});

test('LSP execution preserves definition formatting and errors', async () => {
  vi.mocked(withLspClient).mockResolvedValue(null);
  expect(
    await lsp_goto_definition.execute(
      { filePath: '/a.ts', line: 1, character: 0 },
      executionContext(),
    ),
  ).toEqual({ content: 'No definition found' });
  vi.mocked(withLspClient).mockRejectedValue(new Error('server missing'));
  expect(
    await lsp_goto_definition.execute(
      { filePath: '/a.ts', line: 1, character: 0 },
      executionContext(),
    ),
  ).toEqual({ content: 'Error: server missing' });
});

test('references, diagnostics and rename preserve their text results', async () => {
  vi.mocked(withLspClient).mockResolvedValue([
    {
      uri: pathToFileURL(resolve('a.ts')).href,
      range: {
        start: { line: 2, character: 3 },
        end: { line: 2, character: 4 },
      },
    },
  ]);
  const references = await lsp_find_references.execute(
    { filePath: '/a.ts', line: 1, character: 0 },
    executionContext(),
  );
  expect(references.content).toMatch(/a\.ts:3:3$/);
  vi.mocked(withLspClient).mockResolvedValue({
    items: [
      {
        severity: 1,
        message: 'broken',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      },
      {
        severity: 2,
        message: 'warning',
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 1 },
        },
      },
    ],
  });
  expect(
    await lsp_diagnostics.execute(
      { filePath: '/a.ts', severity: 'error' },
      executionContext(),
    ),
  ).toEqual({ content: 'error at 1:0: broken' });
  const edit = { changes: {} };
  vi.mocked(withLspClient).mockResolvedValue(edit);
  vi.mocked(applyWorkspaceEdit).mockReturnValue({
    success: true,
    filesModified: ['/a.ts'],
    totalEdits: 1,
    errors: [],
  });
  expect(
    await lsp_rename.execute(
      { filePath: '/a.ts', line: 1, character: 0, newName: 'renamed' },
      executionContext(),
    ),
  ).toEqual({ content: 'Applied 1 edit(s) to 1 file(s):\n  - /a.ts' });
  expect(applyWorkspaceEdit).toHaveBeenCalledWith(edit);
});

test.each([
  undefined,
  false,
])('AST replacement preserves dry-run default (%j)', async (dryRun) => {
  vi.mocked(runSg).mockResolvedValue({
    matches: [],
    totalMatches: 0,
    truncated: false,
  });
  const result = await ast_grep_replace.execute(
    { pattern: 'foo', rewrite: 'bar', lang: 'typescript', dryRun },
    executionContext(),
  );
  expect(result.content).toBe('No matches found for replacement.');
  expect(runSg).toHaveBeenCalledWith(
    expect.objectContaining({ updateAll: dryRun === false }),
  );
});

test('aborted tools never start work and interrupted renames never apply edits', async () => {
  const controller = new AbortController();
  controller.abort();
  const context = { ...executionContext(), signal: controller.signal };
  await expect(
    ast_grep_search.execute({ pattern: 'x', lang: 'typescript' }, context),
  ).rejects.toThrow();
  expect(runSg).not.toHaveBeenCalled();
  const inFlight = new AbortController();
  vi.mocked(withLspClient).mockImplementation(async () => {
    inFlight.abort();
    return null as never;
  });
  await expect(
    lsp_rename.execute(
      { filePath: '/a.ts', line: 1, character: 0, newName: 'renamed' },
      { ...executionContext(), signal: inFlight.signal },
    ),
  ).rejects.toThrow();
  expect(applyWorkspaceEdit).not.toHaveBeenCalled();
});
