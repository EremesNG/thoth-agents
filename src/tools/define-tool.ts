import type { ToolContext } from '@opencode/plugin/promise/tool';
import type { z } from 'zod';

/** Adapt the existing text-producing tools to the host's v2 result contract. */
export function defineTool<Input extends z.ZodType>(definition: {
  name: string;
  description: string;
  input: Input;
  showOutput?: boolean;
  execute: (input: z.infer<Input>, context: ToolContext) => Promise<string>;
}) {
  return {
    name: definition.name,
    description: definition.description,
    input: definition.input,
    async execute(input: z.infer<Input>, context: ToolContext) {
      context.signal.throwIfAborted();
      let onAbort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(context.signal.reason);
        context.signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        const content = await Promise.race([
          definition.execute(input, context),
          aborted,
        ]);
        context.signal.throwIfAborted();
        if (definition.showOutput) {
          await context.progress({ output: content });
          context.signal.throwIfAborted();
          return { content, metadata: { output: content } };
        }
        return { content };
      } finally {
        context.signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
