import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fallback required color keys from theme-json.d.ts (51 tokens)
const FALLBACK_REQUIRED_COLOR_KEYS = [
  'accent',
  'border',
  'borderAccent',
  'borderMuted',
  'success',
  'error',
  'warning',
  'muted',
  'dim',
  'text',
  'thinkingText',
  'selectedBg',
  'userMessageBg',
  'userMessageText',
  'customMessageBg',
  'customMessageText',
  'customMessageLabel',
  'toolPendingBg',
  'toolSuccessBg',
  'toolErrorBg',
  'toolTitle',
  'toolOutput',
  'mdHeading',
  'mdLink',
  'mdLinkUrl',
  'mdCode',
  'mdCodeBlock',
  'mdCodeBlockBorder',
  'mdQuote',
  'mdQuoteBorder',
  'mdHr',
  'mdListBullet',
  'toolDiffAdded',
  'toolDiffRemoved',
  'toolDiffContext',
  'syntaxComment',
  'syntaxKeyword',
  'syntaxFunction',
  'syntaxVariable',
  'syntaxString',
  'syntaxNumber',
  'syntaxType',
  'syntaxOperator',
  'syntaxPunctuation',
  'thinkingOff',
  'thinkingMinimal',
  'thinkingLow',
  'thinkingMedium',
  'thinkingHigh',
  'thinkingXhigh',
  'bashMode',
];

function getRequiredColorKeys(): string[] {
  const candidateSchemaPaths = [
    resolve(
      __dirname,
      '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-schema.json',
    ),
    resolve(
      __dirname,
      '../../pi-subagents/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-schema.json',
    ),
    resolve(
      __dirname,
      '../../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-schema.json',
    ),
  ];

  for (const p of candidateSchemaPaths) {
    if (existsSync(p)) {
      try {
        const schema = JSON.parse(readFileSync(p, 'utf-8'));
        if (Array.isArray(schema?.properties?.colors?.required)) {
          return schema.properties.colors.required;
        }
      } catch {
        // Fall through to fallback
      }
    }
  }

  return FALLBACK_REQUIRED_COLOR_KEYS;
}

function isValidColorValue(
  value: unknown,
  vars: Record<string, unknown> = {},
): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 255;
  }
  if (typeof value === 'string') {
    if (value === '') return true;
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
    if (/^ok(lch|hsl)\(/i.test(value)) return true;
    if (value in vars) return true;
  }
  return false;
}

function resolveVarRef(
  value: string | number,
  vars: Record<string, unknown>,
  visited = new Set<string>(),
): string | number {
  if (
    typeof value === 'number' ||
    value === '' ||
    value.startsWith('#') ||
    /^ok(lch|hsl)\(/i.test(value)
  ) {
    return value;
  }
  if (visited.has(value)) {
    throw new Error(`Circular variable reference detected: ${value}`);
  }
  if (!(value in vars)) {
    throw new Error(`Variable reference not found in vars: ${value}`);
  }
  visited.add(value);
  const next = vars[value];
  if (typeof next !== 'string' && typeof next !== 'number') {
    throw new Error(`Invalid var target for ${value}: ${String(next)}`);
  }
  return resolveVarRef(next, vars, visited);
}

describe('Thoth theme JSON', () => {
  const themePath = resolve(__dirname, '../themes/thoth.json');
  const themeRaw = readFileSync(themePath, 'utf-8');
  const theme = JSON.parse(themeRaw);

  it('declares name "thoth" and appearance "dark"', () => {
    expect(theme.name).toBe('thoth');
    expect(theme.appearance).toBe('dark');
  });

  it('has a valid $schema reference', () => {
    expect(theme.$schema).toContain('theme-schema.json');
  });

  it('contains every required color key derived from schema/declaration', () => {
    const requiredKeys = getRequiredColorKeys();
    expect(requiredKeys.length).toBeGreaterThan(0);
    expect(theme.colors).toBeDefined();

    for (const key of requiredKeys) {
      expect(
        theme.colors,
        `Missing required color key: "${key}"`,
      ).toHaveProperty(key);
    }
  });

  it('includes optional keys thinkingMax, scrollbarTrack/Thumb, and searchMatchBg/Text', () => {
    expect(theme.colors).toHaveProperty('thinkingMax');
    expect(theme.colors).toHaveProperty('scrollbarTrack');
    expect(theme.colors).toHaveProperty('scrollbarThumb');
    expect(theme.colors).toHaveProperty('searchMatchBg');
    expect(theme.colors).toHaveProperty('searchMatchText');
  });

  it('includes export keys pageBg, cardBg, and infoBg', () => {
    expect(theme.export).toBeDefined();
    expect(theme.export).toHaveProperty('pageBg');
    expect(theme.export).toHaveProperty('cardBg');
    expect(theme.export).toHaveProperty('infoBg');
  });

  it('ensures each color and var is a valid hex, var reference, or 256-color integer', () => {
    const vars = theme.vars ?? {};

    for (const [varName, varVal] of Object.entries(vars)) {
      expect(
        isValidColorValue(varVal, vars),
        `Invalid var value for "${varName}": ${String(varVal)}`,
      ).toBe(true);
    }

    for (const [colorName, colorVal] of Object.entries(theme.colors)) {
      expect(
        isValidColorValue(colorVal, vars),
        `Invalid color value for "${colorName}": ${String(colorVal)}`,
      ).toBe(true);
    }

    for (const [exportName, exportVal] of Object.entries(theme.export)) {
      expect(
        isValidColorValue(exportVal, vars),
        `Invalid export color value for "${exportName}": ${String(exportVal)}`,
      ).toBe(true);
    }
  });

  it('resolves all variable references without circularity or missing keys', () => {
    const vars = theme.vars ?? {};

    for (const [colorName, colorVal] of Object.entries(theme.colors)) {
      if (typeof colorVal === 'string' || typeof colorVal === 'number') {
        const resolved = resolveVarRef(colorVal, vars);
        expect(
          typeof resolved === 'number' ||
            resolved === '' ||
            resolved.startsWith('#') ||
            /^ok(lch|hsl)\(/i.test(resolved),
          `Color "${colorName}" resolved to invalid terminal value: ${String(resolved)}`,
        ).toBe(true);
      }
    }

    for (const [exportName, exportVal] of Object.entries(theme.export)) {
      if (typeof exportVal === 'string' || typeof exportVal === 'number') {
        const resolved = resolveVarRef(exportVal, vars);
        expect(
          typeof resolved === 'number' ||
            resolved === '' ||
            resolved.startsWith('#') ||
            /^ok(lch|hsl)\(/i.test(resolved),
          `Export "${exportName}" resolved to invalid terminal value: ${String(resolved)}`,
        ).toBe(true);
      }
    }
  });

  it('progresses thinking levels from sand to bright gold and carnelian', () => {
    const vars = theme.vars ?? {};
    const thinkingLevels = [
      'thinkingOff',
      'thinkingMinimal',
      'thinkingLow',
      'thinkingMedium',
      'thinkingHigh',
      'thinkingXhigh',
      'thinkingMax',
    ];

    for (const level of thinkingLevels) {
      expect(theme.colors).toHaveProperty(level);
    }

    // High, Xhigh, Max should reach gold, bright gold, and carnelian
    expect(resolveVarRef(theme.colors.thinkingHigh, vars)).toBe(vars.gold);
    expect(resolveVarRef(theme.colors.thinkingXhigh, vars)).toBe(
      vars.brightGold,
    );
    expect(resolveVarRef(theme.colors.thinkingMax, vars)).toBe(vars.carnelian);
  });

  it('validates cleanly with Pi coding agent validateThemeJson if available', async () => {
    const candidateValidatorPaths = [
      resolve(
        __dirname,
        '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-json.js',
      ),
      resolve(
        __dirname,
        '../../pi-subagents/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-json.js',
      ),
      resolve(
        __dirname,
        '../../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-json.js',
      ),
    ];

    let validator: ((label: string, json: unknown) => unknown) | undefined;
    for (const p of candidateValidatorPaths) {
      if (existsSync(p)) {
        const mod = await import(pathToFileURL(p).href);
        if (typeof mod.validateThemeJson === 'function') {
          validator = mod.validateThemeJson;
          break;
        }
      }
    }

    if (validator) {
      expect(() => validator!('thoth', theme)).not.toThrow();
    }
  });
});
