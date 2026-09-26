#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateWork } from '../../thoth-work/scripts/work.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Archive is a bounded filesystem transaction, never an agent lifecycle owner.
function localPath(root, path) {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new Error(`Path escapes project: ${path}`);
  }
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink())
        throw new Error(`Symlink is not allowed: ${cursor}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return absolute;
}

function existingBytes(path) {
  if (!existsSync(path)) return null;
  if (!lstatSync(path).isFile())
    throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(path);
}

function planUpdates(projectRoot, updates) {
  const planned = new Map();
  const specification = (capability) => {
    if (
      typeof capability !== 'string' ||
      !/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)*$/.test(
        capability,
      )
    )
      throw new Error('Invalid capability');
    return localPath(projectRoot, `.thoth/specs/${capability}/spec.md`);
  };
  const add = (path, before, after) => {
    if (planned.has(path))
      throw new Error(`Overlapping durable update: ${path}`);
    planned.set(path, { path, before, after });
  };
  for (const update of updates) {
    const path = specification(update.capability);
    const before = existingBytes(path);
    if (update.operation === 'add') {
      if (before !== null)
        throw new Error(`Addition already exists: ${update.capability}`);
    } else if (before === null || digest(before) !== update.expectedDigest) {
      throw new Error(`Durable baseline changed: ${update.capability}`);
    }
    let content;
    if (update.source) {
      content = existingBytes(localPath(projectRoot, update.source));
      if (content === null || digest(content) !== update.sourceDigest)
        throw new Error(`Durable source changed: ${update.source}`);
    }
    if (update.operation === 'add' || update.operation === 'replace') {
      if (!content)
        throw new Error(
          'Addition/replacement requires reviewed source content',
        );
      add(path, before, content);
    } else if (update.operation === 'remove') {
      add(path, before, null);
    } else if (update.operation === 'rename') {
      const target = specification(update.target);
      if (existingBytes(target) !== null)
        throw new Error(`Rename target already exists: ${update.target}`);
      add(path, before, null);
      add(target, null, content ?? before);
    } else throw new Error(`Unknown durable operation: ${update.operation}`);
  }
  return [...planned.values()];
}

export function archiveWork({ projectRoot, changeRoot, date }) {
  projectRoot = resolve(projectRoot);
  if (
    !existsSync(projectRoot) ||
    !lstatSync(projectRoot).isDirectory() ||
    lstatSync(projectRoot).isSymbolicLink()
  )
    throw new Error('Project must be a real directory');
  changeRoot = localPath(projectRoot, changeRoot);
  if (dirname(changeRoot) !== join(projectRoot, '.thoth', 'changes'))
    throw new Error('Change must be an immediate child of .thoth/changes');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('Date must be a real ISO date');
  const archive = localPath(
    projectRoot,
    `.thoth/changes/archive/${date}-${basename(changeRoot)}`,
  );
  if (existsSync(archive))
    throw new Error('Archive destination already exists');
  const thoth = join(projectRoot, '.thoth');
  if (readdirSync(thoth).some((name) => name.startsWith('.archive-')))
    throw new Error(
      'An unfinished archive transaction requires inspection before retry',
    );
  const transaction = localPath(projectRoot, '.thoth/.archive-transaction');
  let updates = [];
  const createdDirectories = [];
  const makeParents = (path) => {
    if (existsSync(path)) {
      if (!lstatSync(path).isDirectory())
        throw new Error(`Expected directory: ${path}`);
      return;
    }
    makeParents(dirname(path));
    mkdirSync(path);
    createdDirectories.push(path);
  };
  // Acquire first: another completed archive may have changed reviewed inputs.
  mkdirSync(transaction);
  const applied = [];
  try {
    const result = validateWork({
      projectRoot,
      changeRoot,
      through: 'closeout',
    });
    if (!result.ok)
      throw new Error(
        `Closeout rejected: ${result.errors.map((error) => `${error.code}: ${error.message}`).join('; ')}`,
      );
    if (existsSync(archive))
      throw new Error('Archive destination already exists');
    updates = planUpdates(projectRoot, result.work.durableUpdates ?? []);
    // Preflight destination topology before any durable target changes.
    for (const path of [
      dirname(archive),
      ...updates.map((item) => dirname(item.path)),
    ]) {
      let cursor = path;
      while (!existsSync(cursor)) cursor = dirname(cursor);
      if (!lstatSync(cursor).isDirectory())
        throw new Error(`Expected directory: ${cursor}`);
    }
    writeFileSync(
      join(transaction, 'recovery.json'),
      `${JSON.stringify(
        {
          changeRoot,
          archive,
          updates: updates.map(({ path, before, after }, index) => ({
            backup: before === null ? null : `original-${index}`,
            path: relative(projectRoot, path),
            before: before?.toString('base64') ?? null,
            after: after?.toString('base64') ?? null,
          })),
        },
        null,
        2,
      )}\n`,
      { flag: 'wx' },
    );
    for (const [index, update] of updates.entries()) {
      localPath(projectRoot, update.path);
      makeParents(dirname(update.path));
      const record = {
        ...update,
        backup: join(transaction, `original-${index}`),
        captured: false,
        installed: false,
      };
      applied.push(record);
      if (update.before !== null) {
        // Capture the actual object before comparing: a prior check is not CAS.
        renameSync(update.path, record.backup);
        record.captured = true;
        if (!readFileSync(record.backup).equals(update.before))
          throw new Error(
            'Durable baseline changed during archive; displaced content preserved',
          );
      }
      if (update.after !== null) {
        const staged = join(transaction, `next-${index}`);
        writeFileSync(staged, update.after, { flag: 'wx' });
        // link fails if another writer created the destination; never clobber it.
        linkSync(staged, localPath(projectRoot, update.path));
        record.installed = true;
      }
    }
    if (process.env.THOTH_ARCHIVE_TEST_FAULT === 'after-updates')
      throw new Error('Injected archive fault: after-updates');
    for (const record of applied) {
      const current = existingBytes(record.path);
      if (
        (current === null) !== (record.after === null) ||
        (current && !current.equals(record.after))
      )
        throw new Error(
          'Concurrent durable edit detected; transaction retained',
        );
      if (record.captured && !readFileSync(record.backup).equals(record.before))
        throw new Error('Displaced original changed; transaction retained');
    }
    makeParents(dirname(archive));
    renameSync(changeRoot, archive);
  } catch (error) {
    const recoveryErrors = [];
    for (const [index, record] of [...applied].reverse().entries()) {
      try {
        if (record.installed) {
          const displaced = join(transaction, `rollback-${index}`);
          renameSync(localPath(projectRoot, record.path), displaced);
          if (!readFileSync(displaced).equals(record.after)) {
            linkSync(displaced, localPath(projectRoot, record.path));
            throw new Error(`Concurrent edit preserved at ${record.path}`);
          }
        }
        if (record.captured)
          linkSync(record.backup, localPath(projectRoot, record.path));
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError.message);
      }
    }
    for (const directory of createdDirectories.reverse()) {
      try {
        rmdirSync(directory);
      } catch (recoveryError) {
        if (recoveryError.code !== 'ENOTEMPTY')
          recoveryErrors.push(recoveryError.message);
      }
    }
    if (recoveryErrors.length === 0) rmSync(transaction, { recursive: true });
    throw new Error(
      error.message +
        (recoveryErrors.length
          ? '; recovery retained at ' +
            transaction +
            ': ' +
            recoveryErrors.join('; ')
          : ''),
    );
  }
  const warnings = [];
  try {
    rmSync(transaction, { recursive: true });
  } catch {
    warnings.push(
      `Archive complete; inspect retained transaction: ${transaction}`,
    );
  }
  return {
    status: 'archived',
    archive,
    originalChangeRoot: changeRoot,
    updated: updates.map(({ path }) =>
      relative(projectRoot, path).replaceAll('\\', '/'),
    ),
    warnings,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const options = {};
    for (let index = 2; index < process.argv.length; index++) {
      const argument = process.argv[index];
      if (argument === '--json') options.json = true;
      else if (['--project', '--change', '--date'].includes(argument))
        options[argument.slice(2)] = process.argv[++index];
      else throw new Error(`Unknown argument: ${argument}`);
    }
    if (!options.project || !options.change || !options.date)
      throw new Error('--project, --change and --date are required');
    const result = archiveWork({
      projectRoot: options.project,
      changeRoot: options.change,
      date: options.date,
    });
    process.stdout.write(
      `${options.json ? JSON.stringify(result) : result.archive}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
