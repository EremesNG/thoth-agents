#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { codexAdapter } from '../harness/adapters/codex';
import { install } from './install';
import type {
  BooleanArg,
  CliParseResult,
  GenerateArgs,
  InstallArgs,
} from './types';

function parseInstallArgs(args: string[]): InstallArgs {
  const result: InstallArgs = {
    tui: true,
    agent: 'opencode',
  };

  for (const arg of args) {
    if (arg === '--no-tui') {
      result.tui = false;
    } else if (arg.startsWith('--tmux=')) {
      result.tmux = arg.split('=')[1] as BooleanArg;
    } else if (arg.startsWith('--skills=')) {
      result.skills = arg.split('=')[1] as BooleanArg;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--reset') {
      result.reset = true;
    } else if (arg.startsWith('--agent=')) {
      const agent = arg.split('=')[1];
      if (agent !== 'opencode' && agent !== 'codex') {
        throw new Error(
          `Unsupported install agent: ${agent}. Supported agents: opencode, codex.`,
        );
      }
      result.agent = agent;
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function parseGenerateArgs(args: string[]): CliParseResult {
  const result: Partial<GenerateArgs> = {};

  for (const arg of args) {
    if (arg.startsWith('--harness=')) {
      const harness = arg.split('=')[1];
      if (harness !== 'codex') {
        return {
          command: 'error',
          message: `Unsupported generate harness: ${harness}.`,
        };
      }
      result.harness = harness;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--output-root=')) {
      result.outputRoot = arg.split('=')[1];
    }
  }

  if (result.harness !== 'codex') {
    return {
      command: 'error',
      message: 'Codex generation requires --harness=codex.',
    };
  }

  return {
    command: 'generate',
    generateArgs: {
      harness: result.harness,
      dryRun: result.dryRun,
      outputRoot: result.outputRoot,
    },
  };
}

export function parseCliArgs(args: string[]): CliParseResult {
  if (args.length === 0 || args[0] === 'install') {
    const hasSubcommand = args[0] === 'install';
    try {
      const installArgs = parseInstallArgs(args.slice(hasSubcommand ? 1 : 0));
      return { command: 'install', installArgs };
    } catch (error) {
      return {
        command: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (args[0] === 'generate') {
    return parseGenerateArgs(args.slice(1));
  }

  if (args[0] === '-h' || args[0] === '--help') {
    return { command: 'help' };
  }

  return { command: 'error', message: `Unknown command: ${args[0]}` };
}

function printHelp(): void {
  console.log(`
thoth-agents installer (thoth-agents)

Usage: pnpm dlx thoth-agents install [OPTIONS]
       pnpm dlx thoth-agents generate --harness=codex --dry-run

Options:
  --tmux=yes|no          Enable tmux integration (yes/no)
  --skills=yes|no        Install recommended external skills
  --no-tui               Non-interactive mode
  --dry-run              Simulate install without writing files
  --reset                Repair managed installer-owned targets
  --agent=opencode|codex Select OpenCode plugin install (default) or Codex agent-pack setup
  -h, --help             Show this help message

Generate options:
  --harness=codex        Explicitly select Codex artifact generation
  --output-root=PATH     Override generation root metadata

thoth-agents installs the seven-agent roster, thoth-mem defaults,
native task delegation, and bundled SDD skills for OpenCode.

Bundled thoth-agents skills are always installed.
Use --skills=no to skip only recommended external skills.

The generated config uses OpenAI by default.
For alternative providers, see docs/provider-configurations.md.

Examples:
  pnpm dlx thoth-agents@latest install
  pnpm dlx thoth-agents@latest install --agent=opencode
  pnpm dlx thoth-agents@latest install --agent=codex
  pnpm dlx thoth-agents@latest install --agent=codex --dry-run
  pnpm dlx thoth-agents install --no-tui --tmux=no --skills=yes
  pnpm dlx thoth-agents install --dry-run
  pnpm dlx thoth-agents install --reset
  pnpm dlx thoth-agents generate --harness=codex --dry-run
`);
}

function printCodexGeneration(args: GenerateArgs): number {
  if (!args.dryRun) {
    console.error(
      'Codex generation is dry-run only in this MVP. Pass --dry-run.',
    );
    return 1;
  }

  const result = codexAdapter.render({
    projectRoot: process.cwd(),
    options: {
      dryRun: true,
      outputRoot: args.outputRoot,
      targetHarness: 'codex',
    },
  });

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.command === 'install') {
    const exitCode = await install(parsed.installArgs);
    process.exit(exitCode);
  } else if (parsed.command === 'generate') {
    process.exit(printCodexGeneration(parsed.generateArgs));
  } else if (parsed.command === 'help') {
    printHelp();
    process.exit(0);
  } else {
    console.error(parsed.message);
    console.error('Run with --help for usage information');
    process.exit(1);
  }
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
