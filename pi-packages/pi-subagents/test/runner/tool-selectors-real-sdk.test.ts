import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { expandToolPatterns } from '../../src/tool-patterns.js';

it('loads and executes a root-inactive extension tool in a selected child session', async () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-tool-selector-'),
  );
  const agentDir = path.join(fixtureRoot, 'agent');
  const cwd = path.join(fixtureRoot, 'workspace');
  const extensionDir = path.join(agentDir, 'extensions');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, 'inactive-tool.ts'),
    `export default function (pi) {
      pi.registerTool({
        name: 'inactive_fixture_tool',
        label: 'Inactive fixture tool',
        description: 'Returns a marker from the loaded extension implementation.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => ({ content: [{ type: 'text', text: 'executed by child extension' }] }),
      });
    }`,
  );
  fs.writeFileSync(
    path.join(agentDir, 'settings.json'),
    JSON.stringify({
      extensions: [path.join(extensionDir, 'inactive-tool.ts')],
    }),
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;

  let rootSession: any;
  let childSession: any;
  try {
    const {
      DefaultResourceLoader,
      SessionManager,
      createAgentSession,
      getAgentDir,
    } = await import('@earendil-works/pi-coding-agent');
    const createLoader = async () => {
      const loader = new DefaultResourceLoader({
        cwd,
        agentDir: getAgentDir(),
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });
      await loader.reload();
      return loader;
    };

    const root = await createAgentSession({
      cwd,
      resourceLoader: await createLoader(),
      sessionManager: SessionManager.inMemory(cwd),
    });
    rootSession = root.session;
    rootSession.setActiveToolsByName([]);
    const registeredNames = rootSession
      .getAllTools()
      .map((tool: { name: string }) => tool.name);
    const rootActiveNames = rootSession.getActiveToolNames();
    expect(rootActiveNames).not.toContain('inactive_fixture_tool');

    const selectedTools = expandToolPatterns(
      ['*'],
      rootActiveNames,
      registeredNames,
    );
    expect(
      selectedTools,
      JSON.stringify({ agentDir, errors: root.extensionsResult.errors }),
    ).toContain('inactive_fixture_tool');

    const child = await createAgentSession({
      cwd,
      resourceLoader: await createLoader(),
      sessionManager: SessionManager.inMemory(cwd),
      tools: selectedTools,
    });
    childSession = child.session;
    expect(childSession.getActiveToolNames()).toContain(
      'inactive_fixture_tool',
    );

    const tool = childSession.getToolDefinition('inactive_fixture_tool');
    expect(tool).toBeDefined();
    const result = await tool!.execute(
      'fixture-call',
      {},
      undefined,
      undefined,
      {} as any,
    );
    expect(result.content).toContainEqual({
      type: 'text',
      text: 'executed by child extension',
    });
  } finally {
    await childSession?.dispose?.();
    await rootSession?.dispose?.();
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
