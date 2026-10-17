import { createInterface } from 'node:readline/promises';
import { detectRuntimeContext, isInteractiveRuntime } from './runtime';

export const CODEX_HOOK_CONSENT_PROMPT =
  'Trust thoth-agents SessionStart and SubagentStart hooks? Trusted hooks can run outside the sandbox. [y/N] ';

export async function requestCodexHookConsent(options: {
  trustHooks?: boolean;
  dryRun?: boolean;
}): Promise<boolean> {
  if (options.trustHooks) return true;
  if (options.dryRun || !isInteractiveRuntime(detectRuntimeContext()))
    return false;
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return /^(y|yes)$/i.test(
      (await prompt.question(CODEX_HOOK_CONSENT_PROMPT)).trim(),
    );
  } finally {
    prompt.close();
  }
}
