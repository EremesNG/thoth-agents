import { z } from 'zod';
import { defineTool } from '../define-tool';
import { runSg } from './cli';
import { CLI_LANGUAGES } from './types';
import {
  formatReplaceResult,
  formatSearchResult,
  getEmptyResultHint,
} from './utils';

export const ast_grep_search = defineTool({
  showOutput: true,
  name: 'ast_grep_search',
  description:
    'Search code patterns across filesystem using AST-aware matching. Supports 25 languages. ' +
    'Use meta-variables: $VAR (single node), $$$ (multiple nodes). ' +
    'IMPORTANT: Patterns must be complete AST nodes (valid code). ' +
    "For functions, include params and body: 'export async function $NAME($$$) { $$$ }' not 'export async function $NAME'. " +
    "Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$)'",
  input: z.object({
    pattern: z
      .string()
      .describe(
        'AST pattern with meta-variables ($VAR, $$$). Must be complete AST node.',
      ),
    lang: z.enum(CLI_LANGUAGES).describe('Target language'),
    paths: z
      .array(z.string())
      .optional()
      .describe("Paths to search (default: ['.'])"),
    globs: z
      .array(z.string())
      .optional()
      .describe('Include/exclude globs (prefix ! to exclude)'),
    context: z.number().optional().describe('Context lines around match'),
  }),
  execute: async (args, context) => {
    try {
      const result = await runSg({
        signal: context.signal,
        pattern: args.pattern,
        lang: args.lang,
        paths: args.paths,
        globs: args.globs,
        context: args.context,
      });

      let output = formatSearchResult(result);

      if (result.matches.length === 0 && !result.error) {
        const hint = getEmptyResultHint(args.pattern, args.lang);
        if (hint) {
          output += `\n\n${hint}`;
        }
      }

      return output;
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

export const ast_grep_replace = defineTool({
  showOutput: true,
  name: 'ast_grep_replace',
  description:
    'Replace code patterns across filesystem with AST-aware rewriting. ' +
    'Dry-run by default. Use meta-variables in rewrite to preserve matched content. ' +
    "Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
  input: z.object({
    pattern: z.string().describe('AST pattern to match'),
    rewrite: z
      .string()
      .describe('Replacement pattern (can use $VAR from pattern)'),
    lang: z.enum(CLI_LANGUAGES).describe('Target language'),
    paths: z.array(z.string()).optional().describe('Paths to search'),
    globs: z.array(z.string()).optional().describe('Include/exclude globs'),
    dryRun: z
      .boolean()
      .optional()
      .describe('Preview changes without applying (default: true)'),
  }),
  execute: async (args, context) => {
    try {
      const result = await runSg({
        signal: context.signal,
        pattern: args.pattern,
        rewrite: args.rewrite,
        lang: args.lang,
        paths: args.paths,
        globs: args.globs,
        updateAll: args.dryRun === false,
      });
      return formatReplaceResult(result, args.dryRun !== false);
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});
