#!/usr/bin/env node

/**
 * Generates a JSON Schema from the Zod PluginConfigSchema.
 * Run as part of the build step so the schema stays in sync with the source.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PluginConfigSchema } from '../src/config/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const outputPath = join(rootDir, 'thoth-agents.schema.json');

const schema = z.toJSONSchema(PluginConfigSchema, {
  // Use 'input' so defaulted fields are optional in the schema,
  // matching how users actually write their config files
  io: 'input',
});

const jsonSchema = {
  ...schema,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'thoth-agents',
  description: 'Configuration schema for thoth-agents plugin for OpenCode',
};

const json = JSON.stringify(jsonSchema, null, 2);
writeFileSync(outputPath, `${json}\n`);

const biomeBin = join(
  rootDir,
  'node_modules',
  '@biomejs',
  'biome',
  'bin',
  'biome',
);
const formatResult = spawnSync(
  process.execPath,
  [biomeBin, 'format', outputPath, '--write'],
  {
    stdio: 'inherit',
  },
);

if (formatResult.error) {
  console.error(formatResult.error.message);
  process.exit(1);
}

if (formatResult.status !== 0) {
  process.exit(formatResult.status ?? 1);
}

console.log(`✅ Schema written to ${outputPath}`);
