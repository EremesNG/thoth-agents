import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillRegistryEntry } from '../core/skills';
import type { HarnessArtifact, HarnessDiagnostic } from '../types';
import {
  collectSkillFiles,
  normalizeSkillPath,
  sha256Hash,
} from './fs-skill-collect';

export interface ClaudeCodeSkillLayoutInput {
  projectRoot: string;
  packageRoot?: string;
  skills: SkillRegistryEntry[];
}

export interface ClaudeCodeSkillLayoutResult {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
}

interface ManifestEntry {
  name: string;
  sourcePath: string;
  outputPath: string;
  sha256: string;
}

const SKILLS_BASE_PATH = 'skills';
const SKILLS_MANIFEST_PATH = 'skills/.thoth-agents-manifest.json';

/**
 * Copy the bundled skill registry into the Claude Code plugin `skills/` layout.
 * First-class: no surface gate. Records source provenance with content hashes.
 */
export function renderClaudeCodeSkillLayout(
  input: ClaudeCodeSkillLayoutInput,
): ClaudeCodeSkillLayoutResult {
  const artifacts: HarnessArtifact[] = [];
  const diagnostics: HarnessDiagnostic[] = [];
  const manifest: ManifestEntry[] = [];
  const sourceBaseRoot = input.packageRoot ?? input.projectRoot;

  for (const skill of [...input.skills].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const sourceRoot = path.join(sourceBaseRoot, skill.sourcePath);
    const files = collectSkillFiles(sourceRoot);

    if (files.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'claude-code.skill.source_missing',
        message: `Skipping Claude Code skill "${skill.name}" because source path "${skill.sourcePath}" was not found.`,
        harness: 'claude',
        surface: 'plugin-skills-directory',
        fallback: 'diagnostic-only',
      });
      continue;
    }

    for (const file of files) {
      const relative = normalizeSkillPath(path.relative(sourceRoot, file));
      const content = fs.readFileSync(file, 'utf8');
      const sourcePath = normalizeSkillPath(
        path.relative(sourceBaseRoot, file),
      );
      const outputPath = `${SKILLS_BASE_PATH}/${skill.name}/${relative}`;

      artifacts.push({
        harness: 'claude',
        kind: 'skill',
        path: outputPath,
        description: `Claude Code plugin-bundled skill artifact for ${skill.name}`,
        content,
      });
      manifest.push({
        name: skill.name,
        sourcePath,
        outputPath,
        sha256: sha256Hash(content),
      });
    }
  }

  artifacts.push({
    harness: 'claude',
    kind: 'manifest',
    path: SKILLS_MANIFEST_PATH,
    description:
      'Generated Claude Code plugin-bundled skill source manifest with source hashes.',
    content: `${JSON.stringify({ generatedBy: 'thoth-agents', skills: manifest }, null, 2)}\n`,
  });

  return { artifacts, diagnostics };
}
