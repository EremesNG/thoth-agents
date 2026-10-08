#!/usr/bin/env node
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const packages = {
  'pi-subagents': { entry: 'index.ts' },
  'pi-todo': { entry: 'index.ts' },
  'pi-questions-user': { entry: 'src/index.ts' },
  'pi-background-tasks': {
    entry: 'src/index.ts',
    assets: ['src/windows-job-helper.ps1', 'src/windows-job-helper.cs'],
  },
  'pi-antigravity-bridge': { entry: 'extensions/index.ts' },
  'pi-claude-bridge': {
    entry: 'src/index.ts',
    // The SDK locates its native executable relative to its own module.
    external: ['@anthropic-ai/claude-agent-sdk'],
  },
  'pi-openai-fast': { entry: 'src/index.ts' },
  'pi-thoth-theme': { entry: 'src/index.ts' },
};

const requested = process.argv.slice(2);
const selected = requested.length ? requested : Object.keys(packages);
for (const name of selected) {
  if (!Object.hasOwn(packages, name)) {
    throw new Error(`Unknown Pi extension package: ${name}`);
  }
}

for (const name of selected) {
  const config = packages[name];
  const packageRoot = join(root, 'pi-packages', name);
  const dist = join(packageRoot, 'dist');
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await build({
    absWorkingDir: packageRoot,
    entryPoints: [config.entry],
    // Pi must transpile the bundle via jiti to apply its host SDK aliases.
    // A .js entry would use native imports and load duplicate SDK instances.
    outfile: join(dist, 'index.ts'),
    bundle: true,
    // This is generated JavaScript with a loader-required .ts suffix, not TS
    // source. Some package typechecks include every .ts file, including dist.
    banner: { js: '// @ts-nocheck' },
    format: 'esm',
    platform: 'node',
    target: 'node22',
    external: ['@earendil-works/*', 'typebox', ...(config.external ?? [])],
  });
  for (const asset of config.assets ?? []) {
    await copyFile(join(packageRoot, asset), join(dist, basename(asset)));
  }
  console.log(`Built ${name}/dist/index.ts`);
}
