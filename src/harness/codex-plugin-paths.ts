import { join } from 'node:path';

const CODEX_PLUGIN_ARTIFACT_PREFIX = '.codex-plugin/';

export function codexPluginRootArtifactPath(artifactPath: string): string {
  if (!artifactPath.startsWith(CODEX_PLUGIN_ARTIFACT_PREFIX)) {
    throw new Error(`Expected Codex plugin artifact path: ${artifactPath}`);
  }

  const relativePath = artifactPath.slice(CODEX_PLUGIN_ARTIFACT_PREFIX.length);

  if (relativePath === '.mcp.json') return relativePath;

  if (relativePath === 'plugin.json' || relativePath.startsWith('.')) {
    return join('.codex-plugin', relativePath);
  }

  return relativePath;
}
