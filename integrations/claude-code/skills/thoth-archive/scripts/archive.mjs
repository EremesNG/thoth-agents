#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--change') options.change = argv[++index];
    else if (argument === '--date') options.date = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.change) throw new Error('--change is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date ?? '')) {
    throw new Error('--date must use YYYY-MM-DD');
  }
  return options;
}

function assertArchivable(change) {
  for (const file of [
    'spec.md',
    'plan.md',
    'tasks.md',
    'verify-report.md',
    'archive-report.md',
  ]) {
    if (!existsSync(join(change, file)))
      throw new Error(`${file} is required before archive`);
  }
  const tasks = readFileSync(join(change, 'tasks.md'), 'utf8');
  if (/^- \[(?: |~)\] T\d{3}\b/m.test(tasks)) {
    throw new Error('All tasks must be complete before archive');
  }
  const verify = readFileSync(join(change, 'verify-report.md'), 'utf8');
  if (!/(?:verdict|status)\*{0,2}:?\s*(?:\*{0,2})PASS\b/i.test(verify)) {
    throw new Error('verify-report.md must record PASS before archive');
  }
  if (/\bCRITICAL\b[^\n]*(?:open|unresolved|fail)/i.test(verify)) {
    throw new Error('Unresolved CRITICAL verification findings block archive');
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const change = resolve(options.change);
  const changesRoot = dirname(change);
  if (basename(changesRoot) !== 'changes') {
    throw new Error(
      'Change must be an immediate child of an openspec/changes directory',
    );
  }
  assertArchivable(change);
  const archiveRoot = join(changesRoot, 'archive');
  const target = join(archiveRoot, `${options.date}-${basename(change)}`);
  if (existsSync(target))
    throw new Error(`Archive target already exists: ${target}`);
  mkdirSync(archiveRoot, { recursive: true });
  const reportPath = join(change, 'archive-report.md');
  const report = readFileSync(reportPath, 'utf8').replaceAll(
    'openspec/changes/archive/YYYY-MM-DD-[feature]/',
    `openspec/changes/archive/${options.date}-${basename(change)}/`,
  );
  writeFileSync(reportPath, report);
  renameSync(change, target);
  const result = { status: 'archived', archivePath: target };
  process.stdout.write(`${options.json ? JSON.stringify(result) : target}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
