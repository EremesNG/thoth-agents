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
import { codexPluginRootArtifactPath } from './codex-plugin-paths';
import { THOTH_OWNED_SKILL_NAMES } from './core/owned-skills';
import {
  findRootPackageJsonPath,
  readPackageJsonVersion,
} from './core/package-version';
import type { HarnessArtifact, HarnessDiagnostic } from './types';

const SHARED_PLUGIN_ROOT = 'plugin';
const LEGACY_INTEGRATIONS_ROOT = 'integrations';
const LEGACY_INTEGRATION_ROOTS = [
  join(LEGACY_INTEGRATIONS_ROOT, 'codex'),
  join(LEGACY_INTEGRATIONS_ROOT, 'claude-code'),
] as const;
function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function codexMarketplaceContent(): string {
  return stableJson({
    name: 'thoth-agents-codex',
    interface: { displayName: 'thoth-agents Adaptive Orchestration' },
    plugins: [
      {
        name: 'thoth-agents',
        source: {
          source: 'local',
          path: './plugin',
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
        category: 'Productivity',
      },
    ],
  });
}

function claudeMarketplaceContent(version: string): string {
  return stableJson({
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    name: 'thoth-agents-claude',
    description:
      'Adaptive orchestration with seven roles and runtime-autonomous direct, accelerated, and full Spec Kit-compatible SDD routes.',
    owner: { name: 'thoth-agents maintainers' },
    plugins: [
      {
        name: 'thoth-agents',
        description:
          'Adaptive root orchestration, six specialist subagents, and a runtime-autonomous Spec Kit-compatible SDD bundle.',
        version,
        author: { name: 'thoth-agents maintainers' },
        source: './plugin',
        category: 'productivity',
        homepage: 'https://github.com/EremesNG/thoth-agents',
      },
    ],
  });
}

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
  const written: string[] = [];

  for (const relativeRoot of [
    SHARED_PLUGIN_ROOT,
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

  const version = readPackageJsonVersion(
    findRootPackageJsonPath([projectRoot]),
  );
  const codexMarketplacePath = join(
    projectRoot,
    '.agents',
    'plugins',
    'marketplace.json',
  );
  const claudeMarketplacePath = join(
    projectRoot,
    '.claude-plugin',
    'marketplace.json',
  );
  mkdirSync(dirname(codexMarketplacePath), { recursive: true });
  mkdirSync(dirname(claudeMarketplacePath), { recursive: true });
  writeFileSync(codexMarketplacePath, codexMarketplaceContent());
  writeFileSync(claudeMarketplacePath, claudeMarketplaceContent(version));
  written.push(codexMarketplacePath, claudeMarketplacePath);

  return {
    written: [...new Set(written)],
    diagnostics: [...codexRender.diagnostics, ...claudeRender.diagnostics],
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
