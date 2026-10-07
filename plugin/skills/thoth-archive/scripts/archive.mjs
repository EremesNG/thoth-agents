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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseCanonicalSpec,
  preflightRequirementDeltas,
} from '../../thoth-sdd/scripts/durable-deltas.mjs';
import {
  assertNoSymlinkAncestors,
  resolveSddChangeLocation,
  validate,
} from '../../thoth-sdd/scripts/validate.mjs';

function localPath(root, path) {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(`Path escapes project: ${path}`);
  assertNoSymlinkAncestors(absolute);
  return absolute;
}

function bytes(path) {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Expected regular file: ${path}`);
  return readFileSync(path);
}

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertReviewedBaselines(root, updates, baselines) {
  const reviewed = new Map(
    baselines.map((baseline) => [baseline.path, baseline]),
  );
  for (const update of updates) {
    const path = relative(root, update.path).replaceAll('\\', '/');
    const baseline = reviewed.get(path);
    if (!baseline)
      throw new Error(`Missing reviewed canonical baseline: ${path}`);
    if (
      (baseline.state === 'absent' && update.before !== null) ||
      (baseline.state === 'present' &&
        (update.before === null || sha(update.before) !== baseline.sha256))
    )
      throw new Error(`Canonical plan differs from reviewed baseline: ${path}`);
  }
  if (reviewed.size !== updates.length)
    throw new Error(
      'Reviewed canonical baseline coverage does not match updates',
    );
}

function render(delta) {
  const [given, when, then] = delta.scenario;
  return `### Requirement: ${delta.title}\n\n${delta.statement}\n\n#### Scenario: ${delta.title}\n\n- **GIVEN** ${given}\n- **WHEN** ${when}\n- **THEN** ${then}`;
}

function planUpdates(root, deltas) {
  const groups = new Map();
  for (const delta of deltas)
    groups.set(delta.capability, [
      ...(groups.get(delta.capability) ?? []),
      delta,
    ]);
  return [...groups].map(([capability, changes]) => {
    const path = localPath(root, `.thoth/specs/${capability}/spec.md`);
    const before = bytes(path);
    const title = capability
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');
    const canonical = parseCanonicalSpec(
      before?.toString('utf8') ??
        `# ${title} Specification\n\n## Purpose\n\nDurable behavior for ${capability}.\n\n## Requirements\n`,
    );
    const checked = preflightRequirementDeltas({
      capability,
      present: before !== null,
      requirements: canonical.requirements,
      deltas: changes,
    });
    if (checked.errors.length)
      throw new Error(
        `${checked.errors[0].code}: ${checked.errors[0].message}`,
      );
    for (const delta of changes) {
      if (delta.operation === 'ADDED' || delta.operation === 'MODIFIED')
        canonical.requirements.set(delta.title, render(delta));
      else if (delta.operation === 'REMOVED')
        canonical.requirements.delete(delta.title);
      else if (delta.operation === 'RENAMED') {
        canonical.requirements = new Map(
          [...canonical.requirements].map(([name, block]) =>
            name === delta.previousTitle
              ? [delta.title, render(delta)]
              : [name, block],
          ),
        );
      }
    }
    const requirements = [...canonical.requirements.values()];
    const after = Buffer.from(
      `${canonical.prefix}${requirements.length ? `\n\n${requirements.join('\n\n')}` : ''}\n`,
    );
    return { path, before, after, capability };
  });
}

function existsNoFollow(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

export function archiveChange({ change, date, projectRoot }) {
  const changeRoot =
    projectRoot && !isAbsolute(change)
      ? resolve(projectRoot, change)
      : resolve(change);
  const location = resolveSddChangeLocation(changeRoot);
  if (location.archived)
    throw new Error('Only an active change can be archived');
  const { id, recordPath, projectRoot: locatedRoot } = location;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('Date must be a real ISO date');
  const root = locatedRoot;
  if (projectRoot && resolve(projectRoot) !== root)
    throw new Error('Project root does not match the change root');
  const target = localPath(root, `.thoth/changes/archive/${date}-${id}`);
  if (existsNoFollow(target))
    throw new Error('Archive destination already exists');
  if (
    readdirSync(join(root, '.thoth')).some((name) =>
      name.startsWith('.archive-'),
    )
  )
    throw new Error('An unfinished archive transaction requires inspection');
  const initial = validate({ change: changeRoot, through: 'closeout' });
  if (!initial.valid)
    throw new Error(
      `Closeout rejected: ${initial.errors.map((error) => error.code).join(', ')}`,
    );
  const transaction = localPath(root, '.thoth/.archive-transaction');
  mkdirSync(transaction); // Exclusive lock, followed by fresh validation under the lock.
  const applied = [];
  const created = [];
  let updates = [];
  const parents = (path) => {
    if (existsNoFollow(path)) {
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error(`Expected directory: ${path}`);
      return;
    }
    parents(dirname(path));
    mkdirSync(path);
    created.push(path);
  };
  try {
    const result = validate({ change: changeRoot, through: 'closeout' });
    if (!result.valid)
      throw new Error(
        `Closeout rejected: ${result.errors.map((error) => error.code).join(', ')}`,
      );
    updates = planUpdates(root, result.deltas);
    assertReviewedBaselines(root, updates, result.specBaselines ?? []);
    for (const path of [
      dirname(target),
      ...updates.map((item) => dirname(item.path)),
    ]) {
      let cursor = path;
      while (!existsNoFollow(cursor)) cursor = dirname(cursor);
      const stat = lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error(`Expected directory: ${cursor}`);
    }
    // A filesystem recovery journal, not a workflow report or agent state mirror.
    writeFileSync(
      join(transaction, 'recovery.json'),
      JSON.stringify({
        changeId: id,
        changeRoot,
        recordPath,
        target,
        originals: updates.map(({ path, before, after }) => ({
          path: relative(root, path),
          before: before?.toString('base64') ?? null,
          after: after.toString('base64'),
        })),
      }),
      { flag: 'wx' },
    );
    const latest = validate({ change: changeRoot, through: 'closeout' });
    if (!latest.valid)
      throw new Error(
        `Closeout rejected before mutation: ${latest.errors.map((error) => error.code).join(', ')}`,
      );
    assertReviewedBaselines(root, updates, latest.specBaselines ?? []);
    const reviewed = new Map(
      (latest.specBaselines ?? []).map((baseline) => [baseline.path, baseline]),
    );
    for (const [index, update] of updates.entries()) {
      localPath(root, update.path);
      parents(dirname(update.path));
      const path = relative(root, update.path).replaceAll('\\', '/');
      const baseline = reviewed.get(path);
      const actual = bytes(update.path);
      if (
        !baseline ||
        (baseline.state === 'absent' && actual !== null) ||
        (baseline.state === 'present' &&
          (actual === null || sha(actual) !== baseline.sha256))
      )
        throw new Error(`Reviewed canonical baseline changed: ${path}`);
      const item = {
        ...update,
        backup: join(transaction, `original-${index}`),
        installed: false,
        captured: false,
      };
      applied.push(item);
      if (update.before !== null) {
        renameSync(update.path, item.backup);
        item.captured = true;
        if (!readFileSync(item.backup).equals(update.before))
          throw new Error(
            'Durable baseline changed during archive; displaced original preserved',
          );
      }
      const staged = join(transaction, `next-${index}`);
      writeFileSync(staged, update.after, { flag: 'wx' });
      linkSync(staged, localPath(root, update.path));
      item.installed = true;
      if (
        process.env.THOTH_ARCHIVE_TEST_FAULT ===
          'after-first-canonical-write' &&
        index === 0
      )
        throw new Error('Injected archive fault');
    }
    for (const item of applied) {
      if (
        !bytes(item.path)?.equals(item.after) ||
        (item.captured && !readFileSync(item.backup).equals(item.before))
      )
        throw new Error(
          'Concurrent durable edit detected; transaction retained',
        );
    }
    parents(dirname(target));
    // Location is the durable archive status; move the verified record unchanged.
    renameSync(changeRoot, target);
  } catch (error) {
    const recoveryErrors = [];
    for (const [index, item] of [...applied].reverse().entries()) {
      try {
        if (item.installed) {
          const displaced = join(transaction, `rollback-${index}`);
          renameSync(item.path, displaced);
          if (!readFileSync(displaced).equals(item.after)) {
            linkSync(displaced, item.path);
            throw new Error(`Concurrent edit preserved: ${item.path}`);
          }
        }
        if (item.captured) linkSync(item.backup, item.path);
      } catch (recovery) {
        recoveryErrors.push(recovery.message);
      }
    }
    for (const path of created.reverse())
      try {
        rmdirSync(path);
      } catch (recovery) {
        if (recovery.code !== 'ENOTEMPTY')
          recoveryErrors.push(recovery.message);
      }
    if (!recoveryErrors.length) rmSync(transaction, { recursive: true });
    throw new Error(
      `${error.message}${recoveryErrors.length ? `; recovery retained at ${transaction}: ${recoveryErrors.join('; ')}` : ''}`,
    );
  }
  const warnings = [];
  try {
    rmSync(transaction, { recursive: true });
  } catch {
    warnings.push(`Inspect retained transaction: ${transaction}`);
  }
  const archivedRecordPath = join(target, `${id}.md`);
  return {
    status: 'archived',
    changeId: id,
    archivePath: target,
    recordPath: archivedRecordPath,
    archive: target,
    originalChangeRoot: changeRoot,
    updated: updates.map((item) =>
      relative(root, item.path).replaceAll('\\', '/'),
    ),
    specsUpdated: updates.map((item) => item.capability),
    warnings,
  };
}

export function archiveWork({ projectRoot, changeRoot, date }) {
  return archiveChange({ change: changeRoot, date, projectRoot });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i++) {
      if (process.argv[i] === '--json') options.json = true;
      else if (['--project', '--change', '--date'].includes(process.argv[i])) {
        const key = process.argv[i].slice(2);
        options[key === 'project' ? 'projectRoot' : key] = process.argv[++i];
      } else throw new Error(`Unknown argument: ${process.argv[i]}`);
    }
    if (!options.change || !options.date)
      throw new Error('--change and --date are required');
    const result = archiveChange(options);
    process.stdout.write(
      `${options.json ? JSON.stringify(result) : result.recordPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
