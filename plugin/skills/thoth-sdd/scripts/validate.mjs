#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseCanonicalSpec,
  parseRequirementDelta,
  preflightRequirementDeltas,
} from './durable-deltas.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gates = [
  'explore',
  'specify',
  'clarify',
  'plan',
  'tasks',
  'checklist',
  'ready',
  'closeout',
];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const issue = (code, message, recordName = 'record') => ({
  code,
  artifact: recordName,
  message,
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function lstatMaybe(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
    throw error;
  }
}

export function isValidSddChangeId(id) {
  return (
    typeof id === 'string' &&
    slugPattern.test(id) &&
    !reservedWindowsName.test(id)
  );
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function assertNoSymlinkAncestors(path) {
  const absolute = resolve(path);
  const { root } = parse(absolute);
  let cursor = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (lstatMaybe(cursor)?.isSymbolicLink()) {
      fail('SDD-SYMLINK', `Symlinked path component is not allowed: ${cursor}`);
    }
  }
}

export function resolveSddChangeLocation(change) {
  const changeRoot = resolve(change);
  assertNoSymlinkAncestors(changeRoot);
  const parent = dirname(changeRoot);
  let projectRoot;
  let id;
  let archiveDate;
  let archived = false;

  if (
    basename(parent) === 'changes' &&
    basename(dirname(parent)) === '.thoth'
  ) {
    projectRoot = dirname(dirname(parent));
    id = basename(changeRoot);
  } else if (
    basename(parent) === 'archive' &&
    basename(dirname(parent)) === 'changes' &&
    basename(dirname(dirname(parent))) === '.thoth'
  ) {
    archived = true;
    projectRoot = dirname(dirname(dirname(dirname(changeRoot))));
    const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(basename(changeRoot));
    if (!match || !isIsoDate(match[1])) {
      fail(
        'SDD-CHANGE-PATH',
        'Archived change directory must use YYYY-MM-DD-<id>',
      );
    }
    archiveDate = match[1];
    id = match[2];
  } else {
    fail(
      'SDD-CHANGE-PATH',
      'Change must be an immediate .thoth/changes/<id> or dated archive child',
    );
  }

  if (!isValidSddChangeId(id)) {
    fail('SDD-CHANGE-ID', `Unsafe or reserved change ID: ${id}`);
  }
  const recordPath = join(changeRoot, `${id}.md`);
  assertNoSymlinkAncestors(recordPath);
  return { projectRoot, changeRoot, id, recordPath, archived, archiveDate };
}

function section(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^## ${escaped}\\s*$`, 'im').exec(text);
  if (!match) return undefined;
  const tail = text.slice(match.index + match[0].length);
  return tail.slice(0, /^## /m.exec(tail)?.index ?? tail.length).trim();
}

function localFile(root, name) {
  if (
    !name ||
    isAbsolute(name) ||
    name.includes('\\') ||
    !/^[a-zA-Z0-9_./-]+$/.test(name)
  )
    throw new Error('Invalid reviewed source path');
  const target = resolve(root, name);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error('Reviewed source escapes project');
  assertNoSymlinkAncestors(target);
  const stat = lstatMaybe(target);
  if (!stat?.isFile() || stat.isSymbolicLink())
    throw new Error('Reviewed source must be a regular file');
  return target;
}

function parseDeltas(text, errors, recordName) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 1 && lines[0] === '- None.') return [];
  const deltas = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = /^- `([^`]+)` \*\*(.+?)\*\* — (\S.+)$/.exec(line);
    const metadata = match && parseRequirementDelta(match[1]);
    if (
      !metadata ||
      metadata.operation === 'INTERNAL' ||
      !match[2].trim() ||
      !match[3].trim()
    ) {
      errors.push(
        issue('SDD-DELTA-FORMAT', `Invalid durable delta: ${line}`, recordName),
      );
      continue;
    }
    const scenario = /^ {2}- GIVEN (.+); WHEN (.+); THEN (.+)\.$/.exec(
      lines[index + 1] ?? '',
    );
    if (scenario) index++;
    if (
      metadata.operation !== 'REMOVED' &&
      (!scenario || scenario.slice(1).some((value) => !value.trim()))
    ) {
      errors.push(
        issue(
          'SDD-DELTA-SCENARIO',
          `Concrete GIVEN/WHEN/THEN scenario is required for ${match[2]}`,
          recordName,
        ),
      );
    }
    if (metadata.operation === 'REMOVED' && scenario) {
      errors.push(
        issue(
          'SDD-DELTA-SCENARIO',
          'Removed requirements do not define new scenarios',
          recordName,
        ),
      );
    }
    deltas.push({
      ...metadata,
      title: match[2],
      statement: match[3],
      scenario: scenario?.slice(1),
    });
  }
  if (!lines.length) {
    errors.push(
      issue(
        'SDD-DELTA-FORMAT',
        'Declare deltas or explicitly use - None.',
        recordName,
      ),
    );
  }
  return deltas;
}

function preflightDeltas(root, deltas, errors, warnings, recordName) {
  const groups = new Map();
  for (const delta of deltas)
    groups.set(delta.capability, [
      ...(groups.get(delta.capability) ?? []),
      delta,
    ]);
  for (const [capability, entries] of groups) {
    const path = join(root, '.thoth', 'specs', capability, 'spec.md');
    const present = Boolean(lstatMaybe(path));
    try {
      assertNoSymlinkAncestors(path);
      const stat = present ? lstatSync(path) : undefined;
      if (present && (!stat.isFile() || stat.isSymbolicLink()))
        throw new Error('Not a regular canonical specification');
      const requirements = present
        ? parseCanonicalSpec(readFileSync(path, 'utf8')).requirements
        : new Map();
      const result = preflightRequirementDeltas({
        capability,
        present,
        requirements,
        deltas: entries,
      });
      errors.push(
        ...result.errors.map((entry) =>
          issue(entry.code, entry.message, recordName),
        ),
      );
      warnings.push(...result.warnings);
    } catch (error) {
      errors.push(
        issue(
          'SDD-DELTA-BASELINE',
          `${capability}: ${error.message}`,
          recordName,
        ),
      );
    }
  }
}

function settled(text) {
  return (
    Boolean(text?.trim()) &&
    !/\b(?:pending|unresolved|unknown|ask|tbd|todo)\b/i.test(text)
  );
}

function coverageErrors(text, ids, errors, recordName) {
  const tasks = section(text, 'Tasks') ?? '';
  const rows = tasks
    .split(/\r?\n/)
    .filter((line) => /^- \[[^\]]*\]/.test(line));
  if (
    !rows.length ||
    rows.some(
      (line) =>
        !/^- \[[ x]\] AC-\d+: \S.+/.test(line) ||
        !settled(line.slice(line.indexOf(':') + 1)),
    ) ||
    ids.some((id) => !rows.some((line) => line.includes(` ${id}:`))) ||
    rows.some((line) => !ids.some((id) => line.includes(` ${id}:`)))
  ) {
    errors.push(
      issue(
        'SDD-TASK-COVERAGE',
        'Tasks must cover only known acceptance with concrete work',
        recordName,
      ),
    );
  }
  return rows;
}

export function validate({ change, through }) {
  if (!gates.includes(through)) throw new Error('Invalid SDD validation gate');
  const errors = [];
  const warnings = [];
  const specBaselines = [];
  let location;
  try {
    location = resolveSddChangeLocation(change);
    const rootStat = lstatMaybe(location.changeRoot);
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink())
      throw new Error('Change directory must be a regular directory');
    const entries = readdirSync(location.changeRoot);
    for (const entry of entries)
      if (entry !== `${location.id}.md`)
        errors.push(
          issue(
            'SDD-AUXILIARY-ARTIFACT',
            `Only ${location.id}.md is allowed in a change directory; found ${entry}`,
            `${location.id}.md`,
          ),
        );
  } catch (error) {
    const code = error.code?.startsWith('SDD-')
      ? error.code
      : 'SDD-CHANGE-PATH';
    return {
      valid: false,
      through,
      changeRoot: resolve(change),
      errors: [issue(code, error.message)],
      warnings,
      deltas: [],
    };
  }

  const { projectRoot, changeRoot, id, recordPath, archived, archiveDate } =
    location;
  let text;
  try {
    const stat = lstatMaybe(recordPath);
    if (!stat?.isFile() || stat.isSymbolicLink())
      throw new Error(`${id}.md must be a regular file`);
    text = readFileSync(recordPath, 'utf8');
  } catch (error) {
    errors.push(issue('SDD-CHANGE-MISSING', error.message, `${id}.md`));
    return {
      valid: false,
      through,
      projectRoot,
      changeRoot,
      changeId: id,
      recordPath,
      archived,
      archiveDate,
      errors,
      warnings,
      deltas: [],
    };
  }

  const recordName = `${id}.md`;
  if (
    !new RegExp(
      `^# Change: ${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
      'm',
    ).test(text) ||
    !/^\*\*Classification\*\*: substantial$/m.test(text) ||
    !/^\*\*Scope\*\*: (?:local|coordinated|cross-cutting)$/m.test(text) ||
    !/^\*\*Uncertainty\*\*: (?:low|medium|high)$/m.test(text) ||
    !/^\*\*Risk\*\*: (?:low|medium|high)$/m.test(text)
  ) {
    errors.push(
      issue(
        'SDD-HEADER',
        'Record identity, substantial classification, scope, uncertainty, and risk are required',
        recordName,
      ),
    );
  }
  const headingList = [...text.matchAll(/^## ([^\r\n]+)$/gm)].map((match) =>
    match[1].trim().toLowerCase(),
  );
  if (new Set(headingList).size !== headingList.length) {
    errors.push(
      issue(
        'SDD-DUPLICATE-SECTION',
        'Canonical record sections must be unique',
        recordName,
      ),
    );
  }

  const needed = [];
  if (through === 'explore') needed.push('Exploration');
  else needed.push('Exploration', 'Intent', 'Non-goals', 'Acceptance');
  if (
    ['clarify', 'plan', 'tasks', 'checklist', 'ready', 'closeout'].includes(
      through,
    )
  )
    needed.push('Clarifications', 'Decisions');
  if (['plan', 'tasks', 'checklist', 'ready', 'closeout'].includes(through))
    needed.push('Durable deltas', 'Plan');
  if (['tasks', 'ready', 'closeout'].includes(through)) needed.push('Tasks');
  for (const name of needed) {
    const content = section(text, name);
    if (!settled(content)) {
      errors.push(
        issue(
          'SDD-SECTION',
          `${name} is missing, incomplete, or unresolved`,
          recordName,
        ),
      );
    }
  }

  const acceptance = section(text, 'Acceptance') ?? '';
  const candidates = acceptance
    .split(/\r?\n/)
    .filter((line) => /^- AC-/.test(line));
  const clauses = candidates.map((line) => /^- (AC-\d+): (\S.+)$/.exec(line));
  if (
    !clauses.length ||
    clauses.some((match) => !match || !settled(match[2])) ||
    new Set(clauses.map((match) => match?.[1])).size !== clauses.length
  ) {
    errors.push(
      issue(
        'SDD-ACCEPTANCE',
        'Acceptance requires unique, concrete AC identifiers',
        recordName,
      ),
    );
  }
  const ids = clauses.filter(Boolean).map((match) => match[1]);
  if (['tasks', 'ready', 'closeout'].includes(through)) {
    const rows = coverageErrors(text, ids, errors, recordName);
    if (
      through === 'closeout' &&
      rows.some((line) => !line.startsWith('- [x]'))
    )
      errors.push(
        issue('SDD-TASK-INCOMPLETE', 'All tasks must be complete', recordName),
      );
  }
  if (
    ['clarify', 'plan', 'tasks', 'checklist', 'ready', 'closeout'].includes(
      through,
    )
  ) {
    for (const name of ['Clarifications', 'Decisions']) {
      if (!settled(section(text, name))) {
        errors.push(
          issue(
            'SDD-DECISION',
            'Material choices must be settled before classification proceeds',
            recordName,
          ),
        );
      }
    }
  }

  const deltaSection = section(text, 'Durable deltas');
  const deltas = deltaSection
    ? parseDeltas(deltaSection, errors, recordName)
    : [];
  if (
    deltaSection &&
    ['plan', 'tasks', 'checklist', 'ready', 'closeout'].includes(through)
  ) {
    preflightDeltas(projectRoot, deltas, errors, warnings, recordName);
  }

  if (through === 'closeout') {
    const auth = section(text, 'Authorization') ?? '';
    if (
      !/^\*\*Plan review\*\*: (?:SKIPPED|OKAY)$/m.test(auth) ||
      !/^\*\*Implementation\*\*: AUTHORIZED$/m.test(auth)
    ) {
      errors.push(
        issue(
          'SDD-AUTHORIZATION',
          'Plan-review disposition and separate implementation authorization are required',
          recordName,
        ),
      );
    }
    const verified = section(text, 'Verification') ?? '';
    const prefix = text.slice(
      0,
      /^## Verification\s*$/m.exec(text)?.index ?? text.length,
    );
    if (
      !/^\*\*Reviewer\*\*: oracle$/m.test(verified) ||
      !/^\*\*Independent from implementer\*\*: Yes$/m.test(verified) ||
      !/^\*\*Verdict\*\*: PASS$/m.test(verified)
    ) {
      errors.push(
        issue(
          'SDD-VERIFICATION',
          'Fresh independent Oracle PASS is required',
          recordName,
        ),
      );
    }
    if (!verified.includes(`**Reviewed record SHA-256**: ${sha(prefix)}`)) {
      errors.push(
        issue(
          'SDD-VERIFICATION-STALE',
          'Reviewed record does not match the pre-verification content',
          recordName,
        ),
      );
    }
    const rows = verified.split(/\r?\n/).filter((line) => /^- AC-/.test(line));
    if (
      rows.length !== ids.length ||
      ids.some(
        (id) =>
          !rows.some((row) =>
            new RegExp(
              `^- ${id}: PASS \\| (?!none|TBD)\\S.+ \\| (?!none|TBD)\\S.+$`,
              'i',
            ).test(row),
          ),
      )
    ) {
      errors.push(
        issue(
          'SDD-VERIFICATION-COVERAGE',
          'Every accepted outcome needs concrete PASS check and evidence',
          recordName,
        ),
      );
    }
    const sources = verified
      .split(/\r?\n/)
      .filter((line) => line.startsWith('- Source:'));
    if (!sources.length) {
      errors.push(
        issue(
          'SDD-VERIFICATION-SOURCE',
          'Reviewed source digests are required',
          recordName,
        ),
      );
    }
    const affectedSpecs = new Map(
      [...new Set(deltas.map((delta) => delta.capability))].map(
        (capability) => [`.thoth/specs/${capability}/spec.md`, capability],
      ),
    );
    const reviewedSources = [];
    for (const line of sources) {
      const match = /^- Source: ([^ |]+) \| sha256:([a-f0-9]{64})$/.exec(line);
      const absent = /^- Source: ([^ |]+) \| absent$/.exec(line);
      if (match) {
        const source = {
          line,
          path: match[1],
          state: 'present',
          sha256: match[2],
          valid: false,
        };
        reviewedSources.push(source);
        try {
          if (
            sha(readFileSync(localFile(projectRoot, source.path))) !==
            source.sha256
          )
            throw new Error('Missing, invalid or stale source');
          source.valid = true;
        } catch (error) {
          errors.push(
            issue(
              affectedSpecs.has(source.path)
                ? 'SDD-VERIFICATION-SPEC-BASELINE'
                : 'SDD-VERIFICATION-SOURCE',
              `${line}: ${error.message}`,
              recordName,
            ),
          );
        }
      } else if (absent && affectedSpecs.has(absent[1])) {
        reviewedSources.push({
          line,
          path: absent[1],
          state: 'absent',
          valid: true,
        });
      } else {
        errors.push(
          issue(
            'SDD-VERIFICATION-SOURCE',
            `${line}: Missing, invalid or stale source`,
            recordName,
          ),
        );
      }
    }
    for (const [specPath, capability] of affectedSpecs) {
      const entries = reviewedSources.filter(
        (source) => source.path === specPath,
      );
      if (entries.length !== 1) {
        errors.push(
          issue(
            'SDD-VERIFICATION-SPEC-BASELINE',
            `${specPath}: exactly one reviewed canonical baseline is required`,
            recordName,
          ),
        );
        continue;
      }
      const [baseline] = entries;
      const target = resolve(projectRoot, specPath);
      try {
        assertNoSymlinkAncestors(target);
        if (baseline.state === 'absent') {
          if (lstatMaybe(target))
            throw new Error(
              'Reviewed-absent canonical specification now exists',
            );
          let parent = dirname(target);
          while (
            parent !== projectRoot &&
            parent.startsWith(`${projectRoot}${sep}`)
          ) {
            const stat = lstatMaybe(parent);
            if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
              throw new Error(
                'Canonical specification parent is not a directory',
              );
            parent = dirname(parent);
          }
          specBaselines.push({ capability, path: specPath, state: 'absent' });
        } else if (baseline.valid) {
          specBaselines.push({
            capability,
            path: specPath,
            state: 'present',
            sha256: baseline.sha256,
          });
        }
      } catch (error) {
        errors.push(
          issue(
            'SDD-VERIFICATION-SPEC-BASELINE',
            `${specPath}: ${error.message}`,
            recordName,
          ),
        );
      }
    }
    if (!/^\*\*Archive\*\*: READY$/m.test(section(text, 'Closeout') ?? '')) {
      errors.push(
        issue('SDD-ARCHIVE-READINESS', 'Archive must be READY', recordName),
      );
    }
  }

  return {
    valid: errors.length === 0,
    through,
    projectRoot,
    changeRoot,
    changeId: id,
    recordPath,
    archived,
    archiveDate,
    errors,
    warnings,
    deltas,
    specBaselines,
  };
}

function args(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') options.json = true;
    else if (['--change', '--through'].includes(argv[i]))
      options[argv[i].slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.change || !options.through)
    throw new Error('--change and --through are required');
  return options;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const options = args(process.argv.slice(2));
    const result = validate(options);
    process.stdout.write(
      `${options.json ? JSON.stringify(result) : result.valid ? 'Substantial SDD record is structurally valid.' : result.errors.map((entry) => `${entry.code}: ${entry.message}`).join('\n')}\n`,
    );
    process.exitCode = result.valid ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
