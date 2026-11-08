import type { Plugin } from '@opencode/plugin';
import {
  ast_grep_replace,
  ast_grep_search,
  lsp_diagnostics,
  lsp_find_references,
  lsp_goto_definition,
  lsp_rename,
} from '../tools';
import type { OpenCodeDependencies } from './context';

export async function registerTools(
  ctx: Plugin.Context,
  _deps: OpenCodeDependencies,
): Promise<void> {
  // v2 exposes no host LSP configuration API. The standalone LSP client uses
  // its built-in defaults; do not independently re-read/merge host config files.
  await ctx.tool.transform((editor) => {
    editor.add(lsp_goto_definition);
    editor.add(lsp_find_references);
    editor.add(lsp_diagnostics);
    editor.add(lsp_rename);
    editor.add(ast_grep_search);
    editor.add(ast_grep_replace);
  });
}
