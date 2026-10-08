import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Native, independently evaluated module graphs, as with separately bundled cores. */
export async function isolatedCore(workPanelVersion = 1, registryVersion = 1) {
  const directory = await mkdtemp(join(tmpdir(), 'pi-core-copy-'));
  try {
    const sourceDirectory = new URL('../src/', import.meta.url);
    for (const name of await readdir(sourceDirectory)) {
      if (!name.endsWith('.ts')) continue;
      const source = (await readFile(new URL(name, sourceDirectory), 'utf8'))
        .replace(
          /export const WORK_PANEL_VERSION = 1 as const;/g,
          `export const WORK_PANEL_VERSION = ${workPanelVersion} as const;`,
        )
        .replace(
          'const RENDER_KIT_VERSION = 1;',
          `const RENDER_KIT_VERSION = ${registryVersion};`,
        )
        .replace(
          'const TOOL_DEFINITION_REGISTRY_VERSION = 1;',
          `const TOOL_DEFINITION_REGISTRY_VERSION = ${registryVersion};`,
        )
        .replace(/(['"])(\.\/[^'"]+)\.js\1/g, '$1$2.mjs$1')
        .replace(
          /(['"])(@earendil-works\/[^'"]+)\1/g,
          (_match, _quote, specifier) =>
            JSON.stringify(import.meta.resolve(specifier)),
        );
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      });
      await writeFile(
        join(directory, name.replace(/\.ts$/, '.mjs')),
        outputText,
      );
    }
    const core: typeof import('../src/index.js') = await import(
      pathToFileURL(join(directory, 'index.mjs')).href
    );
    return {
      core,
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
