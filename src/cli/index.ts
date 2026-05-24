#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runCliCommand } from './commands';
import { parseCliArgs } from './parser';
import { detectRuntimeContext } from './runtime';

export { parseCliArgs } from './parser';
export type { RuntimeContext } from './runtime';
export { detectRuntimeContext, isInteractiveRuntime } from './runtime';

async function main(): Promise<void> {
  const parsed = parseCliArgs(
    process.argv.slice(2),
    detectRuntimeContext(process),
  );
  process.exit(await runCliCommand(parsed));
}

const entrypointUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (import.meta.url === entrypointUrl) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
