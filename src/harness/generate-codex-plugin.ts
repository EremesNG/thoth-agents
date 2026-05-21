import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { codexAdapter } from './adapters/codex';
import { codexPluginRootArtifactPath } from './codex-plugin-paths';
import type { HarnessDiagnostic } from './types';

const REPO_PLUGIN_BUNDLE_PATH = join('plugins', 'EremesNG', 'thoth-agents');

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function repoMarketplaceContent(): string {
  return stableJson({
    name: 'thoth-agents-marketplace',
    interface: { displayName: 'thoth-agents Plugins' },
    plugins: [
      {
        name: 'thoth-agents',
        source: {
          source: 'local',
          path: './plugins/EremesNG/thoth-agents',
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

export interface GenerateCodexPluginPackageOptions {
  projectRoot: string;
}

export interface GenerateCodexPluginPackageResult {
  written: string[];
  diagnostics: HarnessDiagnostic[];
}

export function generateCodexPluginPackage({
  projectRoot,
}: GenerateCodexPluginPackageOptions): GenerateCodexPluginPackageResult {
  const render = codexAdapter.render({ projectRoot });
  const written: string[] = [];
  rmSync(join(projectRoot, REPO_PLUGIN_BUNDLE_PATH), {
    recursive: true,
    force: true,
  });

  for (const artifact of render.artifacts) {
    if (!artifact.path.startsWith('.codex-plugin/')) continue;

    const targetPath = join(
      projectRoot,
      REPO_PLUGIN_BUNDLE_PATH,
      codexPluginRootArtifactPath(artifact.path),
    );
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, String(artifact.content ?? ''));
    written.push(targetPath);
  }

  const marketplacePath = join(
    projectRoot,
    '.agents',
    'plugins',
    'marketplace.json',
  );
  mkdirSync(dirname(marketplacePath), { recursive: true });
  writeFileSync(marketplacePath, repoMarketplaceContent());
  written.push(marketplacePath);

  return { written, diagnostics: render.diagnostics };
}

if (import.meta.main) {
  const result = generateCodexPluginPackage({ projectRoot: process.cwd() });
  for (const path of result.written) console.log(`wrote ${path}`);
  for (const diagnostic of result.diagnostics) {
    console.warn(`${diagnostic.severity}: ${diagnostic.code}`);
  }
}
