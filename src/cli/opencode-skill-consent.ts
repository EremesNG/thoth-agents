import { createInterface } from 'node:readline/promises';
import {
  getLegacyOpenCodeSkillBackupRoot,
  inspectLegacyOpenCodeSkills,
} from './owned-skills';
import { detectRuntimeContext, isInteractiveRuntime } from './runtime';

export async function requestOpenCodeSkillMoveConsent(options: {
  moveLegacyOpenCodeSkills?: boolean;
  dryRun?: boolean;
  homeDir?: string;
}): Promise<boolean> {
  if (options.dryRun) return false;
  if (options.moveLegacyOpenCodeSkills) return true;
  if (!isInteractiveRuntime(detectRuntimeContext())) return false;
  const copies = inspectLegacyOpenCodeSkills(options.homeDir);
  if (!copies.length) return false;
  console.log(
    copies.map(({ sourcePath }) => `Legacy skill: ${sourcePath}`).join('\n'),
  );
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return /^(y|yes)$/i.test(
      (
        await prompt.question(
          `Move these shadowing copies to a new backup under ${getLegacyOpenCodeSkillBackupRoot(options.homeDir)}? [y/N] `,
        )
      ).trim(),
    );
  } finally {
    prompt.close();
  }
}
