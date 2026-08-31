import { createHash } from 'node:crypto';
import {
  CODEX_PLUGIN_MANIFEST_FIELDS,
  type CodexHookValidationInput,
  validateCodexHookSurface,
  validateCodexPluginPackageSurface,
} from '../adapters/codex-surfaces';
import type { HarnessArtifact, HarnessDiagnostic } from '../types';

export interface CodexPluginPackageAsset {
  surfaceId: string;
  manifestField: string;
  path: string;
  content?: string;
  hookDefinitions?: readonly CodexPluginHookDefinition[];
  description?: string;
  provenanceName?: string;
  sourcePath?: string;
}

export interface CodexPluginHookDefinition extends CodexHookValidationInput {
  matcher?: string;
  handler: CodexHookValidationInput['handler'] & { command?: unknown };
}

export interface CodexPluginPackageInput {
  manifest: Record<string, unknown>;
  assets?: CodexPluginPackageAsset[];
}

export interface CodexPluginPackageResult {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
}

interface PluginAssetProvenance {
  field: string;
  path: string;
  reference: string;
  name?: string;
  sourcePath?: string;
  sha256?: string;
}

const PLUGIN_MANIFEST_SURFACE_ID = 'plugin-manifest-json';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function stripProviderMcp(content: string | undefined): string | undefined {
  if (content === undefined) return undefined;

  try {
    const parsed = JSON.parse(content) as {
      mcpServers?: Record<string, unknown>;
    };
    if (!parsed.mcpServers) return content;
    const { thoth_mem: _provider, ...mcpServers } = parsed.mcpServers;
    return stableJson({ ...parsed, mcpServers });
  } catch {
    return content;
  }
}

function pluginRootReference(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  const relative = normalized.slice('.codex-plugin/'.length);
  return `./${relative}`;
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function orderManifestFields(
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const field of CODEX_PLUGIN_MANIFEST_FIELDS) {
    if (field in manifest) ordered[field] = manifest[field];
  }
  return ordered;
}

function fieldDiagnostic(field: string): HarnessDiagnostic {
  return {
    severity: 'error',
    code: 'codex.plugin.field.unvalidated',
    message: `Skipping unvalidated Codex plugin manifest field "${field}".`,
    harness: 'codex',
    surface: PLUGIN_MANIFEST_SURFACE_ID,
    fallback: 'diagnostic-only',
  };
}

function artifactKindForSurface(surfaceId: string): HarnessArtifact['kind'] {
  if (surfaceId === 'plugin-mcp-json') return 'mcp-config';
  return surfaceId === 'plugin-hooks-json' ? 'hook-config' : 'skill';
}

function codexHookPackageDiagnostic(
  code: string,
  message: string,
  severity: HarnessDiagnostic['severity'] = 'warning',
): HarnessDiagnostic {
  return {
    severity,
    code,
    message,
    harness: 'codex',
    surface: 'plugin-hooks-json',
    fallback: 'diagnostic-only',
  };
}

function normalizeHookDefinition(
  hook: CodexPluginHookDefinition,
): Record<string, unknown> {
  return {
    command: hook.handler.command,
    type: 'command',
  };
}

function renderHookDefinitions(
  hookDefinitions: readonly CodexPluginHookDefinition[],
): { content?: string; diagnostics: HarnessDiagnostic[] } {
  const diagnostics: HarnessDiagnostic[] = [];
  const hooksByEvent = new Map<string, Record<string, unknown>[]>();

  for (const hook of hookDefinitions) {
    const validation = validateCodexHookSurface(hook);
    if (!validation.ok) {
      diagnostics.push(...validation.diagnostics);
      continue;
    }

    const eventHooks = hooksByEvent.get(validation.event) ?? [];
    eventHooks.push({
      ...(hook.matcher !== undefined ? { matcher: hook.matcher } : {}),
      hooks: [normalizeHookDefinition(hook)],
    });
    hooksByEvent.set(validation.event, eventHooks);
  }

  if (hooksByEvent.size === 0) {
    diagnostics.push(
      codexHookPackageDiagnostic(
        'codex.plugin.hooks.none_packaged',
        'No Codex plugin hooks were packaged because no hook definitions passed existing Codex hook validation.',
        'info',
      ),
    );
    return { diagnostics };
  }

  const content = stableJson({
    hooks: Object.fromEntries(
      [...hooksByEvent.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([event, hooks]) => [event, hooks.map(stableValue)]),
    ),
  });

  return { content, diagnostics };
}

function parseRawHookContent(content: string): {
  hookDefinitions: CodexPluginHookDefinition[];
  diagnostics: HarnessDiagnostic[];
} {
  const diagnostics: HarnessDiagnostic[] = [];
  const hookDefinitions: CodexPluginHookDefinition[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      hookDefinitions,
      diagnostics: [
        codexHookPackageDiagnostic(
          'codex.plugin.hooks.invalid_json',
          'Skipping Codex plugin hooks asset because hooks.json content is not valid JSON.',
        ),
      ],
    };
  }

  if (!isRecord(parsed)) {
    return {
      hookDefinitions,
      diagnostics: [
        codexHookPackageDiagnostic(
          'codex.plugin.hooks.invalid_shape',
          'Skipping Codex plugin hooks asset because hooks.json must be an object keyed by Codex hook event.',
        ),
      ],
    };
  }

  if (!isRecord(parsed.hooks)) {
    return {
      hookDefinitions,
      diagnostics: [
        codexHookPackageDiagnostic(
          'codex.plugin.hooks.invalid_shape',
          'Skipping Codex plugin hooks asset because hooks.json must contain a nested "hooks" object.',
        ),
      ],
    };
  }

  for (const [event, definitions] of Object.entries(parsed.hooks)) {
    if (!Array.isArray(definitions)) {
      diagnostics.push(
        codexHookPackageDiagnostic(
          'codex.plugin.hooks.invalid_shape',
          `Skipping Codex plugin hook event "${event}" because its value is not an array of matcher groups.`,
        ),
      );
      continue;
    }

    for (const group of definitions) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        diagnostics.push(
          codexHookPackageDiagnostic(
            'codex.plugin.hooks.invalid_shape',
            `Skipping Codex plugin hook event "${event}" entry because it is not a matcher group with a hooks array.`,
          ),
        );
        continue;
      }

      if (group.matcher !== undefined && typeof group.matcher !== 'string') {
        diagnostics.push(
          codexHookPackageDiagnostic(
            'codex.plugin.hooks.invalid_shape',
            `Skipping Codex plugin hook event "${event}" matcher group because matcher is not a string.`,
          ),
        );
        continue;
      }

      for (const definition of group.hooks) {
        if (!isRecord(definition)) {
          diagnostics.push(
            codexHookPackageDiagnostic(
              'codex.plugin.hooks.invalid_shape',
              `Skipping Codex plugin hook event "${event}" handler because it is not an object.`,
            ),
          );
          continue;
        }

        hookDefinitions.push({
          event,
          ...(typeof group.matcher === 'string'
            ? { matcher: group.matcher }
            : {}),
          handler: {
            type:
              typeof definition.type === 'string' ? definition.type : 'command',
            command: definition.command,
            async: definition.async,
          },
        });
      }
    }
  }

  return { hookDefinitions, diagnostics };
}

function resolveHookAssetContent(asset: CodexPluginPackageAsset): {
  content?: string;
  diagnostics: HarnessDiagnostic[];
} {
  if (asset.surfaceId !== 'plugin-hooks-json') {
    return { content: asset.content, diagnostics: [] };
  }

  const fromInput = asset.hookDefinitions
    ? { hookDefinitions: [...asset.hookDefinitions], diagnostics: [] }
    : asset.content !== undefined
      ? parseRawHookContent(asset.content)
      : { hookDefinitions: [], diagnostics: [] };
  const rendered = renderHookDefinitions(fromInput.hookDefinitions);

  return {
    content: rendered.content,
    diagnostics: [...fromInput.diagnostics, ...rendered.diagnostics],
  };
}

export function renderCodexPluginPackage(
  input: CodexPluginPackageInput,
): CodexPluginPackageResult {
  const artifacts: HarnessArtifact[] = [];
  const diagnostics: HarnessDiagnostic[] = [];
  const manifest: Record<string, unknown> = {};
  const provenance: PluginAssetProvenance[] = [];

  for (const field of Object.keys(input.manifest)) {
    if (
      !CODEX_PLUGIN_MANIFEST_FIELDS.includes(
        field as (typeof CODEX_PLUGIN_MANIFEST_FIELDS)[number],
      )
    ) {
      diagnostics.push(fieldDiagnostic(field));
    }
  }

  const manifestValidation = validateCodexPluginPackageSurface({
    surfaceId: PLUGIN_MANIFEST_SURFACE_ID,
    path: '.codex-plugin/plugin.json',
    fields: Object.keys(input.manifest).filter((field) =>
      CODEX_PLUGIN_MANIFEST_FIELDS.includes(
        field as (typeof CODEX_PLUGIN_MANIFEST_FIELDS)[number],
      ),
    ),
  });
  if (!manifestValidation.ok)
    diagnostics.push(...manifestValidation.diagnostics);

  for (const field of CODEX_PLUGIN_MANIFEST_FIELDS) {
    if (field in input.manifest)
      manifest[field] = stableValue(input.manifest[field]);
  }

  for (const asset of [...(input.assets ?? [])].sort((left, right) =>
    normalizePath(left.path).localeCompare(normalizePath(right.path)),
  )) {
    const assetPath = normalizePath(asset.path);
    const validation = validateCodexPluginPackageSurface({
      surfaceId: asset.surfaceId,
      path: assetPath,
      fields: [asset.manifestField],
    });

    if (!validation.ok) {
      diagnostics.push(...validation.diagnostics);
      continue;
    }

    const hookContent = resolveHookAssetContent(asset);
    diagnostics.push(...hookContent.diagnostics);
    if (asset.surfaceId === 'plugin-hooks-json' && !hookContent.content) {
      continue;
    }

    const rawAssetContent = hookContent.content ?? asset.content;
    const assetContent =
      asset.surfaceId === 'plugin-mcp-json'
        ? stripProviderMcp(rawAssetContent)
        : rawAssetContent;
    const reference = pluginRootReference(assetPath);
    manifest[asset.manifestField] = reference;

    if (assetContent !== undefined && !assetPath.endsWith('/')) {
      artifacts.push({
        harness: 'codex',
        kind: artifactKindForSurface(asset.surfaceId),
        path: assetPath,
        description:
          asset.description ?? `Codex plugin asset for ${asset.manifestField}`,
        content: assetContent,
      });
    }

    provenance.push({
      field: asset.manifestField,
      path: assetPath,
      reference,
      ...(asset.provenanceName ? { name: asset.provenanceName } : {}),
      ...(asset.sourcePath
        ? { sourcePath: normalizePath(asset.sourcePath) }
        : {}),
      ...(assetContent !== undefined ? { sha256: sha256(assetContent) } : {}),
    });
  }

  artifacts.push({
    harness: 'codex',
    kind: 'manifest',
    path: '.codex-plugin/plugin.json',
    description: 'Deterministic Codex plugin package manifest.',
    content: stableJson(orderManifestFields(manifest)),
  });
  artifacts.push({
    harness: 'codex',
    kind: 'manifest',
    path: '.codex-plugin/.thoth-agents-plugin-assets.json',
    description: 'Deterministic Codex plugin package asset provenance.',
    content: stableJson({
      generatedBy: 'thoth-agents',
      assets: provenance.sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    }),
  });

  return { artifacts, diagnostics };
}
