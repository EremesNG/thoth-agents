import * as fs from 'node:fs';
import * as path from 'node:path';
import { stripJsonComments } from '../cli/config-io';
import { getConfigDir } from '../cli/paths';
import { type PluginConfig, PluginConfigSchema } from './schema';

const PROMPTS_DIR_NAME = 'thoth-agents';

/**
 * Load and validate plugin configuration from a specific file path.
 * Supports both .json and .jsonc formats (JSON with comments).
 * Returns null if the file doesn't exist, is invalid, or cannot be read.
 * Logs warnings for validation errors and unexpected read errors.
 *
 * @param configPath - Absolute path to the config file
 * @returns Validated config object, or null if loading failed
 */
function loadConfigFromPath(
  configPath: string,
  unsupportedKeyPaths: Set<string>,
): PluginConfig | null {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    // Use stripJsonComments to support JSONC format (comments and trailing commas)
    const rawConfig = JSON.parse(stripJsonComments(content));
    if (
      rawConfig !== null &&
      typeof rawConfig === 'object' &&
      ('preset' in rawConfig || 'presets' in rawConfig)
    ) {
      unsupportedKeyPaths.add(configPath);
    }
    const result = PluginConfigSchema.safeParse(rawConfig);

    if (!result.success) {
      console.warn(`[thoth-agents] Invalid config at ${configPath}:`);
      console.warn(result.error.format());
      return null;
    }

    return result.data;
  } catch (error) {
    // File doesn't exist or isn't readable - this is expected and fine
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      console.warn(
        `[thoth-agents] Error reading config from ${configPath}:`,
        error.message,
      );
    }
    return null;
  }
}

/**
 * Find existing config file path, preferring .jsonc over .json.
 * Checks for .jsonc first, then falls back to .json.
 *
 * @param basePath - Base path without extension (e.g., /path/to/thoth-agents)
 * @returns Path to existing config file, or null if neither exists
 */
function findConfigPath(basePath: string): string | null {
  const jsoncPath = `${basePath}.jsonc`;
  const jsonPath = `${basePath}.json`;

  // Prefer .jsonc over .json
  if (fs.existsSync(jsoncPath)) {
    return jsoncPath;
  }
  if (fs.existsSync(jsonPath)) {
    return jsonPath;
  }
  return null;
}

/**
 * Recursively merge two objects, with override values taking precedence.
 * For nested objects, merges recursively. For arrays and primitives, override replaces base.
 *
 * @param base - Base object to merge into
 * @param override - Override object whose values take precedence
 * @returns Merged object, or undefined if both inputs are undefined
 */
function deepMerge<T extends Record<string, unknown>>(
  base?: T,
  override?: T,
): T | undefined {
  if (!base) return override;
  if (!override) return base;

  const result = { ...base } as T;
  for (const key of Object.keys(override) as (keyof T)[]) {
    const baseVal = base[key];
    const overrideVal = override[key];

    if (
      typeof baseVal === 'object' &&
      baseVal !== null &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

/**
 * Load plugin configuration from user and project config files, merging them appropriately.
 *
 * Configuration is loaded from two locations:
 * 1. User config: $OPENCODE_CONFIG_DIR/thoth-agents.jsonc or .json,
 *    or ~/.config/opencode/thoth-agents.jsonc or .json (or $XDG_CONFIG_HOME)
 * 2. Project config: <directory>/.opencode/thoth-agents.jsonc or .json
 *
 * JSONC format is preferred over JSON (allows comments and trailing commas).
 * Project config takes precedence over user config. Nested objects (agents,
 * fallback, and harness generation options) are
 * deep-merged, while top-level arrays are replaced entirely
 * by project config.
 *
 * @param directory - Project directory to search for .opencode config
 * @returns Merged plugin configuration (empty object if no configs found)
 */
export function loadPluginConfig(directory: string): PluginConfig {
  const userConfigBasePath = path.join(getConfigDir(), 'thoth-agents');

  const projectConfigBasePath = path.join(
    directory,
    '.opencode',
    'thoth-agents',
  );

  // Find existing config files (preferring .jsonc over .json)
  const userConfigPath = findConfigPath(userConfigBasePath);
  const projectConfigPath = findConfigPath(projectConfigBasePath);

  const unsupportedKeyPaths = new Set<string>();
  let config: PluginConfig = userConfigPath
    ? (loadConfigFromPath(userConfigPath, unsupportedKeyPaths) ?? {})
    : {};

  const projectConfig = projectConfigPath
    ? loadConfigFromPath(projectConfigPath, unsupportedKeyPaths)
    : null;
  if (projectConfig) {
    config = {
      ...config,
      ...projectConfig,
      agents: deepMerge(config.agents, projectConfig.agents),
      fallback: deepMerge(config.fallback, projectConfig.fallback),
      codex: deepMerge(config.codex, projectConfig.codex),
      claudeCode: deepMerge(config.claudeCode, projectConfig.claudeCode),
    };
  }

  if (unsupportedKeyPaths.size > 0) {
    console.warn(
      `[thoth-agents] Config keys preset/presets are unsupported and ignored (${[...unsupportedKeyPaths].join(', ')}).`,
    );
  }

  return config;
}

/**
 * Load custom prompt for an agent from the prompts directory.
 * Checks for {agent}.md (replaces default) and {agent}_append.md (appends to default).
 *
 * @param agentName - Name of the agent (e.g., "orchestrator", "explorer")
 * @returns Object with prompt and/or appendPrompt if files exist
 */
export function loadAgentPrompt(agentName: string): {
  prompt?: string;
  appendPrompt?: string;
} {
  const promptsDir = path.join(getConfigDir(), PROMPTS_DIR_NAME);
  const result: { prompt?: string; appendPrompt?: string } = {};

  const readPrompt = (
    fileName: string,
    errorPrefix: string,
  ): string | undefined => {
    const promptPath = path.join(promptsDir, fileName);
    if (!fs.existsSync(promptPath)) return undefined;

    try {
      return fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
      console.warn(
        `[thoth-agents] ${errorPrefix} ${promptPath}:`,
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  };

  // Check for replacement prompt
  result.prompt = readPrompt(`${agentName}.md`, 'Error reading prompt file');

  // Check for append prompt
  result.appendPrompt = readPrompt(
    `${agentName}_append.md`,
    'Error reading append prompt file',
  );

  return result;
}
