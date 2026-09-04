import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeCodeAdapter } from './adapters/claude-code';
import { codexAdapter } from './adapters/codex';
import { piAdapter } from './adapters/pi';
import { codexPluginRootArtifactPath } from './codex-plugin-paths';
import { THOTH_OWNED_SKILL_NAMES } from './core/owned-skills';
import type { HarnessArtifact, HarnessDiagnostic } from './types';

const SHARED_PLUGIN_ROOT = 'plugin';
const PI_ASSET_ROOT = 'pi';
const LEGACY_INTEGRATIONS_ROOT = 'integrations';
const LEGACY_INTEGRATION_ROOTS = [
  join(LEGACY_INTEGRATIONS_ROOT, 'codex'),
  join(LEGACY_INTEGRATIONS_ROOT, 'claude-code'),
] as const;
function writeArtifact(
  projectRoot: string,
  bundleRoot: string,
  artifact: HarnessArtifact,
  relativePath = artifact.path,
): string {
  const targetPath = join(projectRoot, bundleRoot, relativePath);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, String(artifact.content ?? ''));
  return targetPath;
}

function canonicalSkillsRoot(projectRoot: string): string {
  const candidates = [
    join(projectRoot, 'skills'),
    fileURLToPath(new URL('../../skills/', import.meta.url)),
    join(process.cwd(), 'skills'),
  ];
  const root = candidates.find((candidate) =>
    existsSync(join(candidate, 'thoth-init', 'SKILL.md')),
  );

  if (!root) {
    throw new Error('Could not locate the canonical bundled skills directory.');
  }
  return root;
}

function copySkillTree(
  source: string,
  target: string,
  written: string[],
): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source).sort()) {
    const sourcePath = join(source, entry);
    const targetPath = join(target, entry);
    if (statSync(sourcePath).isDirectory()) {
      copySkillTree(sourcePath, targetPath, written);
      continue;
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, readFileSync(sourcePath));
    written.push(targetPath);
  }
}

export interface GenerateIntegrationPackagesOptions {
  projectRoot: string;
}

export interface GenerateIntegrationPackagesResult {
  written: string[];
  diagnostics: HarnessDiagnostic[];
}

export type IntegrationDiagnosticLevel =
  | 'info'
  | 'warning'
  | 'capability-gap'
  | 'error';

export interface IntegrationDiagnosticReport {
  level: IntegrationDiagnosticLevel;
  code: string;
  message: string;
  fallback?: HarnessDiagnostic['fallback'];
  fatal: boolean;
}

function hasRecoverableFallback(diagnostic: HarnessDiagnostic): boolean {
  return (
    diagnostic.fallback === 'instruction-only' ||
    diagnostic.fallback === 'diagnostic-only'
  );
}

function integrationDiagnosticLevel(
  diagnostic: HarnessDiagnostic,
  fatal: boolean,
): IntegrationDiagnosticLevel {
  if (fatal) return 'error';
  if (diagnostic.severity === 'info') return 'info';
  if (hasRecoverableFallback(diagnostic)) return 'capability-gap';
  return 'warning';
}

export function prepareIntegrationDiagnostics(
  diagnostics: readonly HarnessDiagnostic[],
): IntegrationDiagnosticReport[] {
  const uniqueByCode = new Map<string, HarnessDiagnostic>();
  for (const diagnostic of diagnostics) {
    if (!uniqueByCode.has(diagnostic.code)) {
      uniqueByCode.set(diagnostic.code, diagnostic);
    }
  }

  return [...uniqueByCode.values()].map((diagnostic) => {
    const fatal =
      diagnostic.severity === 'error' && !hasRecoverableFallback(diagnostic);

    return {
      level: integrationDiagnosticLevel(diagnostic, fatal),
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.fallback ? { fallback: diagnostic.fallback } : {}),
      fatal,
    };
  });
}

export function formatIntegrationDiagnostic(
  diagnostic: IntegrationDiagnosticReport,
): string {
  const label =
    diagnostic.level === 'capability-gap'
      ? 'capability-gap (non-fatal)'
      : diagnostic.level;
  const fallback =
    diagnostic.fallback && diagnostic.fallback !== 'none'
      ? ` [fallback: ${diagnostic.fallback}]`
      : '';
  return `${label}: ${diagnostic.code} — ${diagnostic.message}${fallback}`;
}

export function getIntegrationDiagnosticExitCode(
  diagnostics: readonly IntegrationDiagnosticReport[],
): 0 | 1 {
  return diagnostics.some((diagnostic) => diagnostic.fatal) ? 1 : 0;
}

export function generateIntegrationPackages({
  projectRoot,
}: GenerateIntegrationPackagesOptions): GenerateIntegrationPackagesResult {
  const codexRender = codexAdapter.render({ projectRoot });
  const claudeRender = claudeCodeAdapter.render({ projectRoot });
  const piRender = piAdapter.render({ projectRoot });
  const written: string[] = [];

  for (const relativeRoot of [
    SHARED_PLUGIN_ROOT,
    PI_ASSET_ROOT,
    ...LEGACY_INTEGRATION_ROOTS,
  ]) {
    rmSync(join(projectRoot, relativeRoot), { recursive: true, force: true });
  }
  const legacyIntegrationsRoot = join(projectRoot, LEGACY_INTEGRATIONS_ROOT);
  if (
    existsSync(legacyIntegrationsRoot) &&
    readdirSync(legacyIntegrationsRoot).length === 0
  ) {
    rmdirSync(legacyIntegrationsRoot);
  }

  for (const artifact of codexRender.artifacts) {
    if (!artifact.path.startsWith('.codex-plugin/')) continue;
    written.push(
      writeArtifact(
        projectRoot,
        SHARED_PLUGIN_ROOT,
        artifact,
        codexPluginRootArtifactPath(artifact.path),
      ),
    );
  }

  for (const artifact of claudeRender.artifacts) {
    written.push(writeArtifact(projectRoot, SHARED_PLUGIN_ROOT, artifact));
  }

  const skillsRoot = canonicalSkillsRoot(projectRoot);
  for (const skillName of THOTH_OWNED_SKILL_NAMES) {
    copySkillTree(
      join(skillsRoot, skillName),
      join(projectRoot, SHARED_PLUGIN_ROOT, 'skills', skillName),
      written,
    );
  }

  const piFiles: Record<string, string> = {};
  for (const artifact of piRender.artifacts) {
    const content = String(artifact.content);
    written.push(writeArtifact(projectRoot, PI_ASSET_ROOT, artifact));
    piFiles[artifact.path.replaceAll('\\', '/')] = createHash('sha256')
      .update(content)
      .digest('hex');
  }
  const provenance: HarnessArtifact = {
    harness: 'pi',
    kind: 'harness-config',
    path: '.thoth-agents-assets.json',
    description: 'Deterministic package-owned Pi specialist provenance.',
    content: `${JSON.stringify({ schemaVersion: 1, owner: 'thoth-agents', files: piFiles }, null, 2)}\n`,
  };
  written.push(writeArtifact(projectRoot, PI_ASSET_ROOT, provenance));

  return {
    written: [...new Set(written)],
    diagnostics: [
      ...codexRender.diagnostics,
      ...claudeRender.diagnostics,
      ...piRender.diagnostics,
    ],
  };
}

if (import.meta.main) {
  const result = generateIntegrationPackages({ projectRoot: process.cwd() });
  for (const path of result.written) console.log(`wrote ${path}`);
  const diagnostics = prepareIntegrationDiagnostics(result.diagnostics);
  for (const diagnostic of diagnostics) {
    const line = formatIntegrationDiagnostic(diagnostic);
    if (diagnostic.level === 'error') console.error(line);
    else if (diagnostic.level === 'info') console.info(line);
    else console.warn(line);
  }
  process.exitCode = getIntegrationDiagnosticExitCode(diagnostics);
}
