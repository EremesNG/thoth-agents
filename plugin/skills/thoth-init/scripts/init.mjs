#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = dirname(dirname(SCRIPT_PATH));
const BUNDLE_ROOT = dirname(SKILL_ROOT);
const OWNED_SKILL_NAMES = [
  'thoth-init',
  'thoth-sdd',
  'thoth-constitution',
  'thoth-archive',
];

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--project') options.project = argv[++index];
    else if (argument === '--harness') options.harness = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.project) throw new Error('--project is required');
  if (!['opencode', 'codex', 'claude'].includes(options.harness)) {
    throw new Error('--harness must be opencode, codex, or claude');
  }
  return options;
}

function copyMissing(source, target, report) {
  if (!existsSync(source)) return;
  const sourceStat = statSync(source);
  if (sourceStat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyMissing(join(source, entry), join(target, entry), report);
    }
    return;
  }
  if (existsSync(target)) {
    report.skipped.push(target);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { errorOnExist: true });
  report.created.push(target);
}

function writeMissing(target, content, report) {
  if (existsSync(target)) {
    report.skipped.push(target);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  report.created.push(target);
}

function installConstitution(project, report) {
  const target = join(project, 'openspec', 'memory', 'constitution.md');
  const template = join(
    BUNDLE_ROOT,
    'thoth-constitution',
    'templates',
    'constitution.md',
  );
  if (!existsSync(template)) return;
  const today = new Date().toISOString().slice(0, 10);
  writeMissing(
    target,
    readFileSync(template, 'utf8').replaceAll('YYYY-MM-DD', today),
    report,
  );
}

function installGovernance(project, report) {
  installConstitution(project, report);
  const templatesRoot = join(BUNDLE_ROOT, 'thoth-sdd', 'templates');
  if (existsSync(templatesRoot)) {
    for (const entry of readdirSync(templatesRoot)) {
      copyMissing(
        join(templatesRoot, entry),
        join(project, 'openspec', 'templates', entry),
        report,
      );
    }
  }
  writeMissing(
    join(project, 'openspec', '.thoth-agents.json'),
    `${JSON.stringify({ version: 1, initializedBy: 'thoth-agents' }, null, 2)}\n`,
    report,
  );
}

function installOpenCode(project, report) {
  for (const skillName of OWNED_SKILL_NAMES) {
    copyMissing(
      join(BUNDLE_ROOT, skillName),
      join(project, '.agents', 'skills', skillName),
      report,
    );
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const project = resolve(options.project);
  mkdirSync(project, { recursive: true });
  const report = {
    status: 'ready',
    harness: options.harness,
    project,
    created: [],
    managed: [],
    skipped: [],
  };

  installGovernance(project, report);
  if (options.harness === 'opencode') installOpenCode(project, report);

  const output = options.json
    ? JSON.stringify(report)
    : `thoth-agents initialized ${project} for ${options.harness}`;
  process.stdout.write(`${output}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
