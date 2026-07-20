#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = dirname(dirname(SCRIPT_PATH));
const BUNDLE_ROOT = dirname(SKILL_ROOT);
const OPEN_SPEC_DIRECTORIES = [
  'openspec',
  join('openspec', 'changes'),
  join('openspec', 'changes', 'archive'),
  join('openspec', 'specs'),
  join('openspec', 'memory'),
];

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--project') options.project = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.project) throw new Error('--project is required');
  return options;
}

function assertDirectory(path, label) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
}

function assertRegularFile(path, label) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }
}

function preflight(project) {
  assertDirectory(project, 'Project root');
  if (!existsSync(project)) {
    throw new Error(
      `--project must reference an existing project directory: ${project}`,
    );
  }

  const constitutionSource = join(
    BUNDLE_ROOT,
    'thoth-constitution',
    'templates',
    'constitution.md',
  );
  assertRegularFile(constitutionSource, 'Bundled constitution template');
  if (!existsSync(constitutionSource)) {
    throw new Error(
      `Bundled constitution template is missing: ${constitutionSource}`,
    );
  }

  for (const directory of OPEN_SPEC_DIRECTORIES) {
    assertDirectory(join(project, directory), 'OpenSpec path');
  }

  const constitutionTarget = join(
    project,
    'openspec',
    'memory',
    'constitution.md',
  );
  const manifestTarget = join(project, 'openspec', '.thoth-agents.json');
  assertRegularFile(constitutionTarget, 'OpenSpec constitution path');
  assertRegularFile(manifestTarget, 'OpenSpec manifest path');

  return {
    constitutionSource,
    constitutionTarget,
    manifestTarget,
  };
}

function createDirectory(target, report) {
  if (existsSync(target)) return;
  mkdirSync(target);
  report.created.push(target);
}

function writePreservingExisting(target, content, report) {
  if (existsSync(target)) {
    report.preserved.push(target);
    return;
  }
  writeFileSync(target, content);
  report.created.push(target);
}

function synchronizeManagedFile(target, content, report) {
  if (!existsSync(target)) {
    writeFileSync(target, content);
    report.created.push(target);
    return;
  }
  if (readFileSync(target, 'utf8') === content) {
    report.preserved.push(target);
    return;
  }
  writeFileSync(target, content);
  report.managed.push(target);
}

function synchronizeOpenSpec(project, assets, report) {
  for (const directory of OPEN_SPEC_DIRECTORIES) {
    createDirectory(join(project, directory), report);
  }

  const today = new Date().toISOString().slice(0, 10);
  writePreservingExisting(
    assets.constitutionTarget,
    readFileSync(assets.constitutionSource, 'utf8').replaceAll(
      'YYYY-MM-DD',
      today,
    ),
    report,
  );
  synchronizeManagedFile(
    assets.manifestTarget,
    `${JSON.stringify({ version: 1, initializedBy: 'thoth-agents' }, null, 2)}\n`,
    report,
  );
}

try {
  const options = parseArgs(process.argv.slice(2));
  const project = resolve(options.project);
  const assets = preflight(project);
  const report = {
    status: 'ready',
    project,
    created: [],
    managed: [],
    preserved: [],
  };

  synchronizeOpenSpec(project, assets, report);

  const output = options.json
    ? JSON.stringify(report)
    : `thoth-agents synchronized OpenSpec governance in ${project}`;
  process.stdout.write(`${output}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
