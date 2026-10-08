#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const packageName = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).name;

const requiredFiles = [
  'dist/index.ts',
  'README.md',
  'LICENSE',
  'package.json',
  'skills/subagents-configuration/SKILL.md',
];

const missing = requiredFiles.filter((relativePath) => {
  const absolutePath = join(root, relativePath);
  return !existsSync(absolutePath) || !statSync(absolutePath).isFile();
});

if (missing.length > 0) {
  console.error(`${packageName} package is missing required Pi resources:`);
  for (const relativePath of missing) console.error(`- ${relativePath}`);
  console.error('\nRefusing to pack/publish an incomplete npm package.');
  process.exit(1);
}

console.log(
  `${packageName} package resource check passed (${requiredFiles.length} files).`,
);
