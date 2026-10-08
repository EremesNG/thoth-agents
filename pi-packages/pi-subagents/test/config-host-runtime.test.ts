import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let cwd: string;
let configPath: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-host-'));
  configPath = path.join(cwd, 'extension', 'config.mjs');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.pi', 'subagents'), { recursive: true });

  const source = fs.readFileSync(
    new URL('../src/config.ts', import.meta.url),
    'utf8',
  );
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  });
  // The host supplies the SDK import, but native import.meta.resolve remains
  // relative to the installed extension. Newer jiti versions also alias that
  // expression, so use native ESM to exercise hosts that do not.
  fs.writeFileSync(
    configPath,
    outputText.replace(
      /from (['"])@earendil-works\/pi-coding-agent\1/g,
      `from '${import.meta.resolve('@earendil-works/pi-coding-agent')}'`,
    ),
  );
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

function loadIsolatedDefinitions(env: NodeJS.ProcessEnv = {}) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { pathToFileURL } from 'node:url';
const config = await import(pathToFileURL(process.argv[2]).href);
console.log(JSON.stringify({
  definitions: config.loadSubagents(process.argv[1]),
  warnings: config.subagentSourceWarnings(process.argv[1]),
}));`,
        cwd,
        configPath,
      ],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          PI_CODING_AGENT_DIR: path.join(cwd, 'global-agent'),
          PI_PACKAGE_DIR: undefined,
          ...env,
        },
      },
    ),
  ) as { definitions: unknown[]; warnings: string[] };
}

function writeDefinition(name: string, fields: string) {
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents', `${name}.md`),
    `---\nname: ${name}\n${fields}\n---\n${name} instructions`,
  );
}

describe('host runtime frontmatter loading', () => {
  it('loads definitions without a sibling SDK while still rejecting unsafe YAML', () => {
    expect(() =>
      createRequire(configPath).resolve('@earendil-works/pi-coding-agent'),
    ).toThrow();
    writeDefinition(
      'worker',
      'tools: read, bash\ndisallowed_tools:\n  - ask_orchestrator',
    );
    writeDefinition('unsafe', 'tools: &tools [read]');

    const result = loadIsolatedDefinitions();

    expect(result.definitions).toEqual([
      expect.objectContaining({
        name: 'worker',
        tools: ['read', 'bash'],
        disallowed_tools: ['ask_orchestrator'],
        instructions: 'worker instructions',
      }),
    ]);
    expect(result.warnings).toEqual([
      expect.stringContaining(
        'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
      ),
    ]);
  });

  it('loads without host YAML and warns instead of accepting unvalidated frontmatter', () => {
    writeDefinition(
      'worker',
      'tools: read\ndisallowed_tools: ask_orchestrator',
    );
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'plain.md'),
      'Instructions without frontmatter',
    );

    const result = loadIsolatedDefinitions({ PI_PACKAGE_DIR: cwd });

    expect(result.definitions).toEqual([
      expect.objectContaining({
        name: 'plain',
        instructions: 'Instructions without frontmatter',
      }),
    ]);
    expect(result.warnings).toEqual([
      expect.stringContaining('YAML frontmatter validation is unavailable'),
    ]);
    expect(result.warnings[0]).toContain('Subagent "worker"');
    expect(result.warnings[0]).toContain('The subagent was not loaded.');
  });
});
