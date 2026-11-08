import type { Plugin } from '@opencode/plugin';
import { createOpenCodeInitCommand } from '../harness/opencode-init-command';
import type { OpenCodeDependencies } from './context';

export async function registerCommand(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  const command = createOpenCodeInitCommand({
    projectRoot: deps.directory,
    packageRoot: deps.packageRoot,
  });
  await ctx.command.transform((editor) => {
    editor.add({
      name: 'thoth-init',
      description: command.description,
      async execute({ sessionID, prompt, delivery }) {
        const args = prompt.text.trim();
        const text = command.template + (args ? `\n\n${args}` : '');
        await ctx.session.switchAgent({ sessionID, agent: 'orchestrator' });
        await ctx.session.prompt({ sessionID, text, delivery });
      },
    });
  });
}
