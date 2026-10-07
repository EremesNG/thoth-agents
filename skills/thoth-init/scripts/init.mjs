#!/usr/bin/env node
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = dirname(dirname(SCRIPT_PATH));
const BUNDLE_ROOT = dirname(SKILL_ROOT);
const THOTH_DIRECTORIES = [
  '.thoth',
  join('.thoth', 'changes'),
  join('.thoth', 'changes', 'archive'),
  join('.thoth', 'specs'),
];
const LEGACY_ACTIVE_PATHS = [
  join('openspec', 'changes'),
  join('openspec', 'specs'),
  join('openspec', 'memory', 'constitution.md'),
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

function lstatMaybe(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
    throw error;
  }
}

function assertNoSymlinkAncestors(path, label) {
  const absolute = resolve(path);
  const { root } = parse(absolute);
  let cursor = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (lstatMaybe(cursor)?.isSymbolicLink()) {
      throw new Error(`${label} has a symlinked ancestor: ${cursor}`);
    }
  }
}

function assertDirectory(path, label) {
  assertNoSymlinkAncestors(path, label);
  const stat = lstatMaybe(path);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
}

function assertRegularFile(path, label) {
  assertNoSymlinkAncestors(path, label);
  const stat = lstatMaybe(path);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }
}

function assertNoLegacyActiveStore(project) {
  const openspec = join(project, 'openspec');
  assertDirectory(openspec, 'Legacy OpenSpec path');
  for (const relativePath of LEGACY_ACTIVE_PATHS) {
    const target = join(project, relativePath);
    assertNoSymlinkAncestors(target, 'Legacy OpenSpec path');
    if (lstatMaybe(target)) {
      throw new Error(
        `Active legacy OpenSpec content requires explicit migration before init: ${target}`,
      );
    }
  }
}

function preflight(project) {
  assertNoSymlinkAncestors(project, 'Project root');
  const projectStat = lstatMaybe(project);
  if (
    !projectStat ||
    !projectStat.isDirectory() ||
    projectStat.isSymbolicLink()
  ) {
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
  if (!lstatMaybe(constitutionSource)) {
    throw new Error(
      `Bundled constitution template is missing: ${constitutionSource}`,
    );
  }

  for (const directory of THOTH_DIRECTORIES) {
    assertDirectory(join(project, directory), 'Thoth path');
  }

  const constitutionTarget = join(project, '.thoth', 'constitution.md');
  assertRegularFile(constitutionTarget, 'Thoth constitution path');
  assertNoLegacyActiveStore(project);

  return { constitutionSource, constitutionTarget };
}

function createDirectory(target, report) {
  if (lstatMaybe(target)) return;
  mkdirSync(target);
  report.created.push(target);
}

function writePreservingExisting(target, content, report) {
  if (lstatMaybe(target)) {
    report.preserved.push(target);
    return;
  }
  writeFileSync(target, content, { flag: 'wx' });
  report.created.push(target);
}

function initializeThoth(project, assets, report) {
  for (const directory of THOTH_DIRECTORIES) {
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
}

try {
  const options = parseArgs(process.argv.slice(2));
  const project = resolve(options.project);
  const assets = preflight(project);
  const report = {
    status: 'ready',
    project,
    created: [],
    preserved: [],
  };

  initializeThoth(project, assets, report);

  const output = options.json
    ? JSON.stringify(report)
    : `thoth-agents initialized .thoth governance in ${project}`;
  process.stdout.write(`${output}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
