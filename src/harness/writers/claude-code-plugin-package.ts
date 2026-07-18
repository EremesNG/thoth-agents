import { createHash } from 'node:crypto';
import type { HarnessArtifact, HarnessDiagnostic } from '../types';

export const CLAUDE_PLUGIN_MANIFEST_FIELDS = [
  'name',
  'version',
  'description',
  'author',
] as const;

export interface ClaudeCodePluginAuthor {
  name?: string;
  email?: string;
  url?: string;
}

export interface ClaudeCodePluginManifest {
  name: string;
  version: string;
  description: string;
  author?: ClaudeCodePluginAuthor | string;
}

export interface ClaudeCodePluginPackageInput {
  manifest: ClaudeCodePluginManifest;
  /**
   * Already-rendered plugin component artifacts (subagents, `.mcp.json`,
   * `hooks/`, skills). Auto-discovered by Claude Code, so the manifest does not
   * reference them; the writer records their provenance.
   */
  componentArtifacts: HarnessArtifact[];
}

export interface ClaudeCodePluginPackageResult {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
}

interface PluginAssetProvenance {
  path: string;
  kind: HarnessArtifact['kind'];
  sha256: string;
}

const PLUGIN_MANIFEST_PATH = '.claude-plugin/plugin.json';
const PLUGIN_ASSETS_PATH = '.claude-plugin/.thoth-agents-plugin-assets.json';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Hash(content: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function withoutProviderAsset(artifact: HarnessArtifact): HarnessArtifact {
  if (!normalizePath(artifact.path).endsWith('.mcp.json')) return artifact;
  const content =
    typeof artifact.content === 'string'
      ? artifact.content
      : Buffer.from(artifact.content).toString('utf8');

  try {
    const parsed = JSON.parse(content) as {
      mcpServers?: Record<string, unknown>;
    };
    if (!parsed.mcpServers) return artifact;
    const { thoth_mem: _provider, ...mcpServers } = parsed.mcpServers;
    return { ...artifact, content: stableJson({ ...parsed, mcpServers }) };
  } catch {
    return artifact;
  }
}

function orderedManifest(
  manifest: ClaudeCodePluginManifest,
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const field of CLAUDE_PLUGIN_MANIFEST_FIELDS) {
    const value = manifest[field as keyof ClaudeCodePluginManifest];
    if (value !== undefined) ordered[field] = value;
  }
  return ordered;
}

function provenanceFor(
  artifact: HarnessArtifact,
): PluginAssetProvenance | undefined {
  const path = normalizePath(artifact.path);
  if (path.endsWith('/')) return undefined;
  const content =
    typeof artifact.content === 'string'
      ? artifact.content
      : Buffer.from(artifact.content).toString('utf8');
  return { path, kind: artifact.kind, sha256: sha256Hash(content) };
}

/**
 * Assemble the Claude Code plugin package: the deterministic `plugin.json`
 * manifest, an asset-provenance manifest, and the passed-through component
 * artifacts (sorted by path). First-class — no surface-validation gate.
 */
export function renderClaudeCodePluginPackage(
  input: ClaudeCodePluginPackageInput,
): ClaudeCodePluginPackageResult {
  const components = input.componentArtifacts
    .map(withoutProviderAsset)
    .sort((left, right) =>
      normalizePath(left.path).localeCompare(normalizePath(right.path)),
    );

  const provenance = components
    .map(provenanceFor)
    .filter((entry): entry is PluginAssetProvenance => entry !== undefined)
    .sort((left, right) => left.path.localeCompare(right.path));

  const manifestArtifact: HarnessArtifact = {
    harness: 'claude',
    kind: 'manifest',
    path: PLUGIN_MANIFEST_PATH,
    description: 'Deterministic Claude Code plugin package manifest.',
    content: stableJson(orderedManifest(input.manifest)),
  };

  const provenanceArtifact: HarnessArtifact = {
    harness: 'claude',
    kind: 'manifest',
    path: PLUGIN_ASSETS_PATH,
    description: 'Deterministic Claude Code plugin package asset provenance.',
    content: stableJson({ generatedBy: 'thoth-agents', assets: provenance }),
  };

  return {
    artifacts: [manifestArtifact, provenanceArtifact, ...components],
    diagnostics: [],
  };
}
