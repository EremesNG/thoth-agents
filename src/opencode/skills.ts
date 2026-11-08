import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from '@opencode/plugin';
import type { SkillEditor } from '@opencode/plugin/promise/skill';
import { parse } from 'yaml';
import type { OpenCodeDependencies } from './context';

const ownedSkills = [
  'thoth-init',
  'thoth-sdd',
  'thoth-constitution',
  'thoth-archive',
  'plan-reviewer',
] as const;
type SkillInfo = Parameters<SkillEditor['add']>[0];

export async function registerSkills(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  // Read the complete bundle before registering: incomplete installs must not
  // silently expose only part of the workflow.
  const skills: SkillInfo[] = [];
  for (const id of ownedSkills) {
    const path = resolve(deps.packageRoot, 'skills', id, 'SKILL.md');
    try {
      const source = await readFile(path, 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(
        source,
      );
      if (!match) throw new Error('Missing YAML frontmatter');
      const metadata = parse(match[1]);
      if (
        metadata?.name !== id ||
        typeof metadata?.description !== 'string' ||
        !metadata.description.trim()
      ) {
        throw new Error(`Expected name ${id} and a non-empty description`);
      }
      skills.push({
        id,
        name: metadata.name,
        description: metadata.description,
        path,
        content: match[2].trim(),
      } as SkillInfo);
    } catch (cause) {
      throw new Error(
        `Cannot load bundled skill ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
  // OpenCode 2.2.5 discovers config skills after external plugin transforms;
  // same-ID config copies can shadow these package paths. The installer offers
  // a confirmed backup move rather than relying on plugin-side precedence.
  await ctx.skill.transform((editor) => {
    for (const skill of skills) {
      if (editor.get(skill.id))
        editor.update(skill.id, (existing) => {
          Object.assign(existing, skill);
        });
      else editor.add(skill);
    }
  });
}
