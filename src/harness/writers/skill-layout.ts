import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertCodexSurfaceCanGenerate } from '../adapters/codex-surfaces';
import type { SkillRegistryEntry } from '../core/skills';
import type { HarnessArtifact, HarnessDiagnostic } from '../types';

export interface CodexSkillLayoutInput {
  projectRoot: string;
  packageRoot?: string;
  skills: SkillRegistryEntry[];
  surfaceId: string;
  outputMode?: CodexSkillOutputMode;
  outputModes?: readonly CodexSkillOutputMode[];
}

export interface CodexSkillLayoutResult {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
}

interface ManifestEntry {
  name: string;
  sourcePath: string;
  outputPath: string;
  sha256: string;
}

export type CodexSkillOutputMode = 'plugin-package' | 'repo-local-fallback';

const OUTPUT_MODE_CONFIG: Record<
  CodexSkillOutputMode,
  { basePath: string; manifestPath: string; surfaceId: string; label: string }
> = {
  'plugin-package': {
    basePath: '.codex-plugin/skills',
    manifestPath: '.codex-plugin/skills/.thoth-agents-manifest.json',
    surfaceId: 'plugin-skills-directory',
    label: 'plugin-bundled',
  },
  'repo-local-fallback': {
    basePath: '.agents/skills',
    manifestPath: '.agents/skills/.thoth-agents-manifest.json',
    surfaceId: 'repo-skills-directory',
    label: 'fallback .agents/skills',
  },
};

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function collectFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function sha256(content: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function resolveOutputModes(
  input: CodexSkillLayoutInput,
): CodexSkillOutputMode[] {
  const requested =
    input.outputModes ?? (input.outputMode ? [input.outputMode] : []);
  const modes: readonly CodexSkillOutputMode[] =
    requested.length > 0 ? requested : ['plugin-package'];
  return [...new Set(modes)];
}

function duplicateScopeDiagnostic(
  skillNames: string[],
  surfaceId: string,
): HarnessDiagnostic | undefined {
  if (skillNames.length === 0) return undefined;

  return {
    severity: 'warning',
    code: 'codex.skill.duplicate_scope_precedence_unverified',
    message:
      `Codex skills are selected for both plugin-bundled and fallback .agents/skills scopes: ${skillNames.join(', ')}. ` +
      'Plugin-bundled skills are the intended primary package content, but runtime precedence with fallback scopes is unresolved and must be validated before relying on ordering.',
    harness: 'codex',
    surface: surfaceId,
    fallback: 'diagnostic-only',
  };
}

export function renderCodexSkillLayout(
  input: CodexSkillLayoutInput,
): CodexSkillLayoutResult {
  const surface = assertCodexSurfaceCanGenerate(input.surfaceId);
  if (!surface.ok) {
    return { artifacts: [], diagnostics: [surface.diagnostic] };
  }

  const artifacts: HarnessArtifact[] = [];
  const diagnostics: HarnessDiagnostic[] = [];
  const outputModes = resolveOutputModes(input);

  for (const mode of outputModes) {
    const modeSurface = assertCodexSurfaceCanGenerate(
      OUTPUT_MODE_CONFIG[mode].surfaceId,
    );
    if (!modeSurface.ok) diagnostics.push(modeSurface.diagnostic);
  }

  const duplicateDiagnostic = duplicateScopeDiagnostic(
    outputModes.length > 1
      ? input.skills.map((skill) => skill.name).sort()
      : [],
    input.surfaceId,
  );
  if (duplicateDiagnostic) diagnostics.push(duplicateDiagnostic);

  const manifests = new Map<CodexSkillOutputMode, ManifestEntry[]>(
    outputModes.map((mode) => [mode, []]),
  );

  for (const skill of [...input.skills].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const sourceBaseRoot = input.packageRoot ?? input.projectRoot;
    const sourceRoot = path.join(sourceBaseRoot, skill.sourcePath);
    const files = collectFiles(sourceRoot);

    if (files.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'codex.skill.source_missing',
        message: `Skipping Codex skill "${skill.name}" because source path "${skill.sourcePath}" was not found.`,
        harness: 'codex',
        surface: input.surfaceId,
        fallback: 'diagnostic-only',
      });
      continue;
    }

    for (const file of files) {
      const relative = normalizePath(path.relative(sourceRoot, file));
      const content = fs.readFileSync(file, 'utf8');
      const sourcePath = normalizePath(path.relative(sourceBaseRoot, file));

      for (const mode of outputModes) {
        const config = OUTPUT_MODE_CONFIG[mode];
        const outputPath = `${config.basePath}/${skill.name}/${relative}`;

        artifacts.push({
          harness: 'codex',
          kind: 'skill',
          path: outputPath,
          description: `Codex ${config.label} skill artifact for ${skill.name}`,
          content,
        });
        manifests.get(mode)?.push({
          name: skill.name,
          sourcePath,
          outputPath,
          sha256: sha256(content),
        });
      }
    }
  }

  for (const mode of outputModes) {
    const config = OUTPUT_MODE_CONFIG[mode];
    artifacts.push({
      harness: 'codex',
      kind: 'manifest',
      path: config.manifestPath,
      description: `Generated Codex ${config.label} skill source manifest with source hashes.`,
      content: `${JSON.stringify({ generatedBy: 'thoth-agents', skills: manifests.get(mode) ?? [] }, null, 2)}\n`,
    });
  }

  return { artifacts, diagnostics };
}
