import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

/** Character classes work in both Java and JavaScript regex engines. */
export function buildNativeToolHooks(platform: NodeJS.Platform) {
  // Junie PreToolUse reads permission decisions from hookSpecificOutput.
  const result = JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Use pi/bash for commands and pi/edit or pi/write for file changes.',
    },
  });
  return {
    hooks: {
      PreToolUse: [
        {
          matcher:
            '^([bB][aA][sS][hH]|[pP][oO][wW][eE][rR][sS][hH][eE][lL][lL]|[aA][pP][pP][lL][yY]_[pP][aA][tT][cC][hH]|[eE][dD][iI][tT]|[wW][rR][iI][tT][eE])$',
          hooks: [
            {
              type: 'command',
              command:
                platform === 'win32' ? `echo ${result}` : `echo '${result}'`,
              blockOnError: true,
            },
          ],
        },
      ],
    },
  };
}

/** Identical contents are shared across sessions; replace atomically if missing or stale. */
export function writeNativeToolHooks(agentDir = getAgentDir()): string {
  const directory = join(agentDir, 'junie-bridge');
  const path = join(directory, 'native-tool-hooks.json');
  const content = JSON.stringify(buildNativeToolHooks(process.platform));
  try {
    if (readFileSync(path, 'utf8') === content) return path;
  } catch {
    /* create it */
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return path;
}
