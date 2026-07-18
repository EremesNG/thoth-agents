import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CONFIRMED_OPENAI_SUBAGENT_PRESET } from '../config';
import { SUPPORTED_HARNESSES } from './registry';

const PROVIDER_BOUNDARY_TARGETS = {
  documentationAndMetadata: [
    'package.json',
    'README.md',
    'AGENTS.md',
    'docs/installation.md',
    'docs/skills-and-mcps.md',
    'docs/sdd-pipeline.md',
    'docs/quick-reference.md',
    'docs/codex-install.md',
    'docs/claude-code-plugin-packaging.md',
    'docs/agent/index.md',
    'docs/agent/routing-cases.json',
    'docs/agent/architecture.md',
    'docs/agent/cli-installation.md',
    'docs/agent/harness-packaging.md',
    'docs/agent/runtime-integrations.md',
    'docs/agent/memory-governance.md',
    'docs/agent/sdd-and-skills.md',
    'docs/agent/agents-and-delegation.md',
  ],
  lifecycleFixtures: [
    'src/harness/__fixtures__/codex/agent-deep.toml',
    'src/harness/__fixtures__/codex/mcp.toml',
    'src/harness/__fixtures__/codex/skill-manifest.json',
  ],
  consumerSurfaces: [
    'src/harness/registry.ts',
    'src/harness/core/skills.ts',
    'src/harness/core/memory-governance.ts',
    'src/harness/adapters/opencode.ts',
    'src/harness/adapters/codex.ts',
    'src/harness/adapters/claude-code.ts',
    'src/harness/writers/codex-plugin-package.ts',
    'src/harness/writers/codex-toml.ts',
    'src/harness/writers/claude-code-plugin-package.ts',
    'src/hooks/index.ts',
    'src/mcp/index.ts',
  ],
} as const;

type TargetGroup = keyof typeof PROVIDER_BOUNDARY_TARGETS;
type Target = { group: TargetGroup; path: string; content: string };

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function normalizePath(path: string): string {
  return path.split(sep).join('/');
}

function flattenTargets(): Array<{ group: TargetGroup; path: string }> {
  return (
    Object.entries(PROVIDER_BOUNDARY_TARGETS) as Array<
      [TargetGroup, readonly string[]]
    >
  ).flatMap(([group, paths]) =>
    paths.map((path) => ({ group, path: normalizePath(path) })),
  );
}

async function readTargets(): Promise<Target[]> {
  const targets = flattenTargets();
  return Promise.all(
    targets.map(async ({ group, path }) => {
      const absolutePath = join(REPO_ROOT, ...path.split('/'));
      try {
        return { group, path, content: await readFile(absolutePath, 'utf8') };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Unable to read provider-boundary target ${path}: ${detail}`,
        );
      }
    }),
  );
}

const DELETED_PATH_RULES = [
  /(?:^|[`"'\s])src\/(?:thoth|hooks\/thoth-mem|mcp\/thoth|skills\/thoth-mem-agents)(?:[/`"'\s]|$)/i,
  /(?:\.codex-plugin|\.agents)\/skills\/thoth-mem-agents(?:[/`"'\s]|$)/i,
];

const LIFECYCLE_PROTOCOL_RULES = [
  /mem_(?:session|save|recall|context|get|project)\s*\(/i,
  /\b(?:bootstrap(?:s|ped|ping)?|capture(?:s|d|ing)?|recover(?:s|ed|ing)?|finali[sz](?:e|es|ed|ing)|close(?:s|d|ing)?)\b[^\n]{0,80}(?:thoth[-_]mem|provider|session)/i,
];

const BUNDLED_PROVIDER_RULES: Array<{
  appliesTo: readonly TargetGroup[];
  pattern: RegExp;
}> = [
  {
    appliesTo: [
      'documentationAndMetadata',
      'lifecycleFixtures',
      'consumerSurfaces',
    ],
    pattern:
      /bundled[^\n]{0,100}(?:thoth[-_]mem|thoth_mem|provider-owned|provider\s+(?:MCP|memory|server))/i,
  },
  {
    appliesTo: ['documentationAndMetadata', 'lifecycleFixtures'],
    pattern:
      /(?:MCP|server|local command)[^\n]{0,100}thoth_mem|thoth_mem[^\n]{0,100}(?:MCP|server|local command)/i,
  },
  {
    appliesTo: [
      'documentationAndMetadata',
      'lifecycleFixtures',
      'consumerSurfaces',
    ],
    pattern: /skills[\\/]thoth-mem-agents/i,
  },
];

describe('provider boundary', () => {
  test('keeps the Codex deep lifecycle fixture aligned with canonical defaults', async () => {
    const targets = await readTargets();
    const fixture = targets.find(
      ({ path }) => path === 'src/harness/__fixtures__/codex/agent-deep.toml',
    );

    expect(fixture?.content).toContain(
      `model = "${CONFIRMED_OPENAI_SUBAGENT_PRESET.deep.model}"`,
    );
    expect(fixture?.content).toContain(
      `model_reasoning_effort = "${CONFIRMED_OPENAI_SUBAGENT_PRESET.deep.effort}"`,
    );
  });

  test('reads the complete closed manifest and rejects deleted paths, bundled assets, and consumer protocols', async () => {
    const targets = await readTargets();
    expect(targets).toHaveLength(32);
    expect(
      targets.filter(({ group }) => group === 'documentationAndMetadata'),
    ).toHaveLength(18);
    expect(
      targets.filter(({ group }) => group === 'lifecycleFixtures'),
    ).toHaveLength(3);
    expect(
      targets.filter(({ group }) => group === 'consumerSurfaces'),
    ).toHaveLength(11);

    for (const target of targets) {
      for (const rule of DELETED_PATH_RULES) {
        expect(target.content, target.path).not.toMatch(rule);
      }
      for (const rule of LIFECYCLE_PROTOCOL_RULES) {
        expect(target.content, target.path).not.toMatch(rule);
      }
      for (const rule of BUNDLED_PROVIDER_RULES) {
        if (rule.appliesTo.includes(target.group)) {
          expect(target.content, target.path).not.toMatch(rule.pattern);
        }
      }
    }
  });

  test('preserves unrelated integrations, SDD semantics, and explicit external-provider references', async () => {
    const targets = await readTargets();
    const docs = targets.filter(
      ({ group }) => group === 'documentationAndMetadata',
    );
    const consumers = targets.filter(
      ({ group }) => group === 'consumerSurfaces',
    );

    expect(docs.some(({ content }) => /thoth-mem/i.test(content))).toBe(true);
    expect(
      docs.some(({ content }) =>
        /sdd\/\{(?:change|change-name)\}\//i.test(content),
      ),
    ).toBe(true);
    expect(
      consumers.some(
        ({ path, content }) =>
          path === 'src/hooks/index.ts' && /fallback|recovery/i.test(content),
      ),
    ).toBe(true);
    expect(
      consumers.some(
        ({ path, content }) =>
          path === 'src/mcp/index.ts' && /exa|context7|grep_app/i.test(content),
      ),
    ).toBe(true);
    expect(consumers.some(({ content }) => /sdd|OpenSpec/i.test(content))).toBe(
      true,
    );
    expect(
      consumers.some(({ content }) => /opencode|codex|claude/i.test(content)),
    ).toBe(true);
  });

  test('separates bundled research MCPs from externally supplied memory', async () => {
    const targets = await readTargets();
    const readme = targets.find(({ path }) => path === 'README.md');
    expect(readme).toBeDefined();

    const skillsAndMcps = readme?.content
      .split('## Skills And MCPs', 2)[1]
      ?.split('\n## ', 1)[0];
    expect(skillsAndMcps).toBeDefined();
    expect(skillsAndMcps).not.toMatch(
      /(?:docs research|public code search|research MCPs?)[^\n]{0,120}\blocal memory\b/i,
    );
    expect(skillsAndMcps).toMatch(
      /registers only its `exa`,\s*`context7`, and `grep_app` research MCPs/i,
    );
    expect(skillsAndMcps).toMatch(
      /memory is supplied and configured exclusively by the\s+independently installed external provider/i,
    );
  });

  test('keeps the documented agent selector aligned with the closed harness registry', async () => {
    const targets = await readTargets();
    const installation = targets.find(
      ({ path }) => path === 'docs/installation.md',
    );
    expect(installation).toBeDefined();
    expect(SUPPORTED_HARNESSES).toEqual(['opencode', 'codex', 'claude']);

    const documentedSelector = installation?.content.match(
      /`--agent=([^`]+)`\s*\|\s*Select the harness target explicitly/,
    )?.[1];
    expect(documentedSelector).toBe(SUPPORTED_HARNESSES.join('|'));
  });

  test('reports diagnostics with normalized repository-relative paths when a target cannot be read', async () => {
    const target = flattenTargets()[0];
    const absolutePath = join(REPO_ROOT, ...target.path.split('/'));
    expect(normalizePath(relative(REPO_ROOT, absolutePath))).toBe(target.path);
  });
});
