#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOP_KEYS = new Set([
  'version',
  'change',
  'agreement',
  'goal',
  'bounds',
  'decisions',
  'autonomy',
  'acceptance',
  'context',
  'units',
  'unitRefs',
  'durableUpdates',
  'verification',
]);
const UNIT_KEYS = new Set([
  'id',
  'output',
  'dependsOn',
  'reads',
  'writes',
  'resources',
  'owner',
  'checks',
  'acceptance',
  'baseline',
  'semantic',
]);
const RESULT_KEYS = new Set([
  'status',
  'reviewedBy',
  'reviewedAt',
  'evidence',
  'evidenceFingerprint',
  'inputFingerprint',
  'outputFingerprint',
  'definitionFingerprint',
]);
const BASELINE_KEYS = new Set(['status', 'capturedAt', 'paths']);
const BASELINE_PATH_KEYS = new Set(['path', 'state', 'fingerprint']);
const CHECKPOINT_KEYS = new Set([
  'version',
  'changeId',
  'unitId',
  'writer',
  'createdAt',
  'summary',
  'completed',
  'pending',
  'baseline',
  'checks',
  'nextAction',
  'readRefs',
  'agreementFingerprint',
  'unitFingerprint',
  'inputFingerprint',
  'outputFingerprint',
]);
const CHECK_RESULT_KEYS = new Set([
  'id',
  'command',
  'result',
  'inputFingerprint',
  'outputFingerprint',
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RAW_HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function error(message, line) {
  throw new Error(line ? `YAML line ${line}: ${message}` : message);
}

function splitFlow(value, line) {
  const parts = [];
  let quote = null;
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) error('unbalanced flow collection', line);
  }
  if (quote || depth !== 0) error('unterminated flow collection', line);
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function mappingSeparator(value) {
  let quote = null;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;
    else if (char === ':' && depth === 0) return index;
  }
  return -1;
}

function scalar(value, line) {
  const text = value.trim();
  if (text === '') return undefined;
  if (/(?:^|\s)(?:&|\*|!)[A-Za-z0-9_-]+|<<:/.test(text))
    error('aliases, anchors, merge keys, and tags are forbidden', line);
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) error('unterminated list', line);
    const body = text.slice(1, -1).trim();
    return body ? splitFlow(body, line).map((item) => scalar(item, line)) : [];
  }
  if (text.startsWith('{')) {
    if (!text.endsWith('}')) error('unterminated mapping', line);
    const result = {};
    const body = text.slice(1, -1).trim();
    for (const item of body ? splitFlow(body, line) : []) {
      const at = mappingSeparator(item);
      if (at < 1) error('invalid flow mapping entry', line);
      const key = item
        .slice(0, at)
        .trim()
        .replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
      if (Object.hasOwn(result, key)) error(`duplicate key ${key}`, line);
      result[key] = scalar(item.slice(at + 1), line);
    }
    return result;
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.startsWith('"')
      ? JSON.parse(text)
      : text.slice(1, -1).replaceAll("''", "'");
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function stripComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '#' && (index === 0 || /\s/.test(value[index - 1])))
      return value.slice(0, index);
  }
  return value;
}

export function parseRestrictedYaml(content, source = 'YAML') {
  if (/\t/.test(content)) error(`${source} contains tabs`);
  const lines = content.split(/\r?\n/).flatMap((raw, index) => {
    const clean = stripComment(raw).replace(/\s+$/, '');
    if (!clean.trim() || clean.trim() === '---') return [];
    if (/^\s*(?:&|\*|!|<<:)/.test(clean))
      error(`${source} uses forbidden YAML features`, index + 1);
    const indent = clean.match(/^ */)?.[0].length ?? 0;
    if (indent % 2 !== 0)
      error('indentation must use multiples of two spaces', index + 1);
    return [{ indent, text: clean.trimStart(), line: index + 1 }];
  });
  if (lines.length === 0) error(`${source} is empty`);

  function parseBlock(start, indent) {
    const first = lines[start];
    const list = first?.indent === indent && first.text.startsWith('-');
    const output = list ? [] : {};
    let index = start;
    while (index < lines.length) {
      const current = lines[index];
      if (current.indent < indent) break;
      if (current.indent > indent)
        error('unexpected indentation', current.line);
      if (list) {
        if (!current.text.startsWith('-'))
          error('cannot mix list and mapping entries', current.line);
        const rest = current.text.slice(1).trimStart();
        if (!rest) {
          if (!lines[index + 1] || lines[index + 1].indent <= indent)
            error('list item needs a value', current.line);
          const nested = parseBlock(index + 1, indent + 2);
          output.push(nested.value);
          index = nested.next;
          continue;
        }
        const separator = mappingSeparator(rest);
        if (separator > 0 && !rest.startsWith('{')) {
          const item = {};
          const key = rest.slice(0, separator).trim();
          if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key))
            error('invalid mapping key', current.line);
          const rawValue = rest.slice(separator + 1).trim();
          if (rawValue) item[key] = scalar(rawValue, current.line);
          else if (lines[index + 1]?.indent > indent) {
            const nested = parseBlock(index + 1, indent + 2);
            item[key] = nested.value;
            index = nested.next - 1;
          } else item[key] = null;
          index += 1;
          while (
            index < lines.length &&
            lines[index].indent === indent + 2 &&
            !lines[index].text.startsWith('-')
          ) {
            const child = lines[index];
            const at = mappingSeparator(child.text);
            if (at < 1) error('mapping entry requires a colon', child.line);
            const childKey = child.text.slice(0, at).trim();
            if (Object.hasOwn(item, childKey))
              error(`duplicate key ${childKey}`, child.line);
            const childValue = child.text.slice(at + 1).trim();
            if (childValue) {
              item[childKey] = scalar(childValue, child.line);
              index += 1;
            } else if (lines[index + 1]?.indent > child.indent) {
              const nested = parseBlock(index + 1, child.indent + 2);
              item[childKey] = nested.value;
              index = nested.next;
            } else {
              item[childKey] = null;
              index += 1;
            }
          }
          output.push(item);
          continue;
        }
        output.push(scalar(rest, current.line));
        index += 1;
        continue;
      }
      if (current.text.startsWith('-'))
        error('cannot mix mapping and list entries', current.line);
      const at = mappingSeparator(current.text);
      if (at < 1) error('mapping entry requires a colon', current.line);
      const key = current.text.slice(0, at).trim();
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key))
        error('invalid mapping key', current.line);
      if (Object.hasOwn(output, key))
        error(`duplicate key ${key}`, current.line);
      const rawValue = current.text.slice(at + 1).trim();
      if (rawValue) {
        output[key] = scalar(rawValue, current.line);
        index += 1;
      } else if (lines[index + 1]?.indent > indent) {
        const nested = parseBlock(index + 1, indent + 2);
        output[key] = nested.value;
        index = nested.next;
      } else {
        output[key] = null;
        index += 1;
      }
    }
    return { value: output, next: index };
  }

  if (lines[0].indent !== 0)
    error('document must start at indentation zero', lines[0].line);
  const parsed = parseBlock(0, 0);
  if (parsed.next !== lines.length)
    error('could not consume document', lines[parsed.next]?.line);
  return parsed.value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function digest(value, prefix = true) {
  const serialized =
    typeof value === 'string' || ArrayBuffer.isView(value)
      ? value
      : JSON.stringify(stable(value));
  const hex = createHash('sha256').update(serialized).digest('hex');
  return prefix ? `sha256:${hex}` : hex;
}

function confined(root, candidate, label = 'path') {
  const segments = typeof candidate === 'string' ? candidate.split('/') : [];
  if (segments.at(-1) === '') segments.pop();
  if (
    typeof candidate !== 'string' ||
    !candidate ||
    isAbsolute(candidate) ||
    candidate.includes('\\') ||
    segments.some(
      (segment) => segment === '..' || segment === '.' || segment === '',
    )
  ) {
    throw new Error(`${label} must be a safe relative path: ${candidate}`);
  }
  const target = resolve(root, candidate);
  const rel = relative(resolve(root), target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} must be a safe relative path: ${candidate}`);
  }
  let ancestor = resolve(root);
  for (const segment of segments) {
    ancestor = join(ancestor, segment);
    if (!existsSync(ancestor)) break;
    if (lstatSync(ancestor).isSymbolicLink())
      throw new Error(
        `${label} cannot traverse a symlink or reparse point: ${candidate}`,
      );
  }
  return target;
}

function assertKeys(record, allowed, label, issues) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    issues.push(issue('WORK-TYPE', label, `${label} must be a mapping.`));
    return false;
  }
  for (const key of Object.keys(record)) {
    if (!allowed.has(key))
      issues.push(
        issue(
          'WORK-UNKNOWN-KEY',
          label,
          `${label} contains unknown key ${key}.`,
        ),
      );
  }
  return true;
}

function issue(code, path, message) {
  return { code, path, message };
}

function requireString(record, key, path, issues) {
  if (typeof record?.[key] !== 'string' || !record[key].trim())
    issues.push(
      issue(
        'WORK-REQUIRED',
        path,
        `${path}.${key} must be a non-empty string.`,
      ),
    );
}

function requireHash(record, key, path, issues) {
  if (!HASH_PATTERN.test(record?.[key] ?? ''))
    issues.push(
      issue('WORK-TYPE', path, `${path}.${key} must be a SHA-256 fingerprint.`),
    );
}

function requireTimestamp(record, key, path, issues) {
  requireString(record, key, path, issues);
  if (
    typeof record?.[key] === 'string' &&
    Number.isNaN(Date.parse(record[key]))
  )
    issues.push(
      issue('WORK-TYPE', path, `${path}.${key} must be an ISO timestamp.`),
    );
}

function stringList(value, path, issues, required = true) {
  if (value === undefined && !required) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item)
  ) {
    issues.push(
      issue('WORK-TYPE', path, `${path} must be a list of non-empty strings.`),
    );
    return [];
  }
  return value;
}

function resultDefinition(result, path, issues) {
  if (!assertKeys(result, RESULT_KEYS, path, issues)) return;
  if (result.status !== 'accepted')
    issues.push(
      issue('WORK-RESULT-STATUS', path, `${path}.status must be accepted.`),
    );
  requireString(result, 'reviewedBy', path, issues);
  requireTimestamp(result, 'reviewedAt', path, issues);
  for (const key of [
    'evidenceFingerprint',
    'inputFingerprint',
    'outputFingerprint',
    'definitionFingerprint',
  ])
    requireHash(result, key, path, issues);
  const evidence = stringList(result.evidence, `${path}.evidence`, issues);
  if (evidence.length === 0)
    issues.push(
      issue(
        'WORK-EVIDENCE-MISSING',
        path,
        `${path}.evidence must not be empty.`,
      ),
    );
}

function verificationDefinition(verification, issues) {
  const path = 'verification';
  if (
    !assertKeys(
      verification,
      new Set([
        'reviewer',
        'verdict',
        'evidence',
        'evidenceFingerprint',
        'inputFingerprint',
        'outputFingerprint',
        'agreementFingerprint',
        'technicalFingerprint',
      ]),
      path,
      issues,
    )
  )
    return;
  if (verification.reviewer !== 'oracle')
    issues.push(
      issue('WORK-VERIFICATION', path, 'Verification reviewer must be oracle.'),
    );
  if (!['pass', 'fail'].includes(verification.verdict))
    issues.push(
      issue(
        'WORK-VERIFICATION',
        path,
        'Verification verdict must be pass or fail.',
      ),
    );
  for (const key of [
    'evidenceFingerprint',
    'inputFingerprint',
    'outputFingerprint',
    'agreementFingerprint',
    'technicalFingerprint',
  ])
    requireHash(verification, key, path, issues);
  const evidence = stringList(
    verification.evidence,
    `${path}.evidence`,
    issues,
  );
  if (evidence.length === 0)
    issues.push(
      issue(
        'WORK-EVIDENCE-MISSING',
        path,
        'verification.evidence must not be empty.',
      ),
    );
}

function normalizeAgreement(work) {
  return {
    goal: work.goal,
    bounds: work.bounds,
    autonomy: work.autonomy,
    acceptance: Array.isArray(work.acceptance)
      ? work.acceptance.map(({ result: _result, ...definition }) => definition)
      : work.acceptance,
    decisions: work.decisions ?? [],
    durableUpdates: work.durableUpdates ?? [],
  };
}

export function fingerprintWork(work) {
  return digest(normalizeAgreement(work));
}

export function fingerprintUnit(unit) {
  const { semantic: _semantic, ...definition } = unit;
  return digest(definition);
}

export function fingerprintAcceptance(acceptance) {
  const { result: _result, ...definition } = acceptance;
  return digest(definition);
}

export function fingerprintTechnical(work) {
  return digest({
    acceptance: (work.acceptance ?? []).map(
      ({ result: _result, ...definition }) => definition,
    ),
    units: (work.units ?? []).map(
      ({ semantic: _semantic, ...definition }) => definition,
    ),
  });
}

function resolveChange(options) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  if (options.changeId !== undefined && !ID_PATTERN.test(options.changeId))
    throw new Error('Change id is invalid.');
  const changeRoot = options.changeRoot
    ? resolve(options.changeRoot)
    : confined(
        projectRoot,
        `.thoth/changes/${options.changeId ?? ''}`,
        'change',
      );
  const rel = relative(projectRoot, changeRoot);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error('Change root must remain inside project root.');
  const normalized = rel.replaceAll('\\', '/');
  const identity = /^\.thoth\/changes\/([^/]+)$/.exec(normalized)?.[1];
  if (!identity || !ID_PATTERN.test(identity))
    throw new Error(
      'Change root must identify one .thoth/changes/<id> directory.',
    );
  if (options.changeId !== undefined && options.changeId !== identity)
    throw new Error('Change id must match the supplied change root.');
  return { projectRoot, changeRoot, changeId: identity };
}

function readYaml(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error(`Contract source must be a regular file: ${path}`);
  return parseRestrictedYaml(readFileSync(path, 'utf8'), path);
}

export function loadWork(options) {
  const { projectRoot, changeRoot } = resolveChange(options);
  const workPath = join(changeRoot, 'work.yaml');
  confined(
    projectRoot,
    relative(projectRoot, workPath).replaceAll('\\', '/'),
    'Work contract',
  );
  const raw = readYaml(workPath);
  if ((raw.units === undefined) === (raw.unitRefs === undefined))
    throw new Error('Declare exactly one of units or unitRefs.');
  const sourcePaths = [relative(projectRoot, workPath).replaceAll('\\', '/')];
  let units = raw.units;
  if (raw.unitRefs !== undefined) {
    if (!Array.isArray(raw.unitRefs))
      throw new Error('unitRefs must be a list.');
    const references = new Map();
    for (const reference of raw.unitRefs) {
      if (typeof reference !== 'string')
        throw new Error('Unit reference must be a safe relative path.');
      const match = /^\.thoth\/changes\/([^/]+)\/units\/([^/]+)\.yaml$/.exec(
        reference,
      );
      if (!match || match[1] !== raw.change?.id || !ID_PATTERN.test(match[2]))
        throw new Error(
          `Unit reference must be a safe relative path using .thoth/changes/<change>/units/<id>.yaml: ${reference}`,
        );
      if (references.has(match[2]))
        throw new Error(`Duplicate unit reference id: ${match[2]}`);
      references.set(match[2], reference);
    }
    const loadedUnits = new Map();
    const loadingUnits = new Set();
    const loadUnit = (id) => {
      if (loadingUnits.has(id))
        throw new Error(`Dependency cycle includes ${id}.`);
      if (loadedUnits.has(id)) return loadedUnits.get(id);
      const reference = references.get(id);
      if (!reference)
        throw new Error(`Required unit definition missing: ${id}`);
      const path = confined(projectRoot, reference, 'Unit reference');
      let unit;
      try {
        unit = readYaml(path);
      } catch (cause) {
        if (options.unitId !== undefined && cause?.code === 'ENOENT')
          throw new Error(`Required unit definition missing: ${id}`, {
            cause,
          });
        throw cause;
      }
      if (unit.id !== id)
        throw new Error(`Unit reference identity mismatch for ${id}.`);
      loadingUnits.add(id);
      loadedUnits.set(id, unit);
      sourcePaths.push(relative(projectRoot, path).replaceAll('\\', '/'));
      for (const dependency of unit.dependsOn ?? []) loadUnit(dependency);
      loadingUnits.delete(id);
      return unit;
    };
    if (options.unitId !== undefined) {
      if (!ID_PATTERN.test(options.unitId))
        throw new Error('Unit id is invalid.');
      loadUnit(options.unitId);
    } else {
      for (const id of references.keys()) loadUnit(id);
    }
    units = [...loadedUnits.values()];
  }
  return {
    projectRoot,
    changeRoot,
    path: workPath,
    sourcePaths,
    work: { ...raw, units },
  };
}

function validateUnit(unit, index, acceptanceIds, projectRoot, issues) {
  const path = `units[${index}]`;
  if (!assertKeys(unit, UNIT_KEYS, path, issues)) return;
  requireString(unit, 'id', path, issues);
  requireString(unit, 'output', path, issues);
  if (typeof unit.id === 'string' && !ID_PATTERN.test(unit.id))
    issues.push(issue('WORK-ID', path, 'Unit id is invalid.'));
  for (const key of ['dependsOn', 'reads', 'writes', 'resources', 'acceptance'])
    stringList(unit[key], `${path}.${key}`, issues);
  if (
    !unit.owner ||
    typeof unit.owner !== 'object' ||
    Array.isArray(unit.owner) ||
    Object.keys(unit.owner).some((key) => key !== 'role')
  )
    issues.push(
      issue('WORK-OWNER', path, 'Unit owner must contain only role.'),
    );
  else requireString(unit.owner, 'role', `${path}.owner`, issues);
  if (!Array.isArray(unit.checks) || unit.checks.length === 0)
    issues.push(issue('WORK-CHECKS', path, 'Unit must declare checks.'));
  else
    unit.checks.forEach((check, checkIndex) => {
      const checkPath = `${path}.checks[${checkIndex}]`;
      if (
        !assertKeys(
          check,
          new Set(['id', 'criterion', 'command']),
          checkPath,
          issues,
        )
      )
        return;
      requireString(check, 'id', checkPath, issues);
      requireString(check, 'criterion', checkPath, issues);
      if (check.command !== undefined && typeof check.command !== 'string')
        issues.push(
          issue(
            'WORK-TYPE',
            checkPath,
            'Documentary command must be a string.',
          ),
        );
    });
  if (!unit.baseline || !['captured', 'unknown'].includes(unit.baseline.status))
    issues.push(
      issue(
        'WORK-BASELINE',
        path,
        'Baseline status must be captured or unknown.',
      ),
    );
  else {
    assertKeys(unit.baseline, BASELINE_KEYS, `${path}.baseline`, issues);
    if (
      unit.baseline.paths !== undefined &&
      !Array.isArray(unit.baseline.paths)
    )
      issues.push(
        issue('WORK-BASELINE', path, 'Baseline paths must be a list.'),
      );
    const baselinePaths = Array.isArray(unit.baseline.paths)
      ? unit.baseline.paths
      : [];
    if (unit.baseline.status === 'unknown') {
      if (unit.baseline.capturedAt !== undefined || baselinePaths.length > 0)
        issues.push(
          issue(
            'WORK-BASELINE',
            path,
            'Unknown baseline cannot claim captured paths or time.',
          ),
        );
    } else {
      requireTimestamp(unit.baseline, 'capturedAt', `${path}.baseline`, issues);
      const expected = [...(unit.writes ?? [])].sort();
      const actual = baselinePaths.map((entry) => entry?.path).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        issues.push(
          issue(
            'WORK-BASELINE',
            path,
            'Captured baseline must cover every unit write exactly once.',
          ),
        );
    }
    for (const [baselineIndex, entry] of baselinePaths.entries()) {
      const baselinePath = `${path}.baseline.paths[${baselineIndex}]`;
      if (!assertKeys(entry, BASELINE_PATH_KEYS, baselinePath, issues))
        continue;
      requireString(entry, 'path', baselinePath, issues);
      if (!['preexisting', 'absent', 'unknown'].includes(entry.state))
        issues.push(
          issue(
            'WORK-BASELINE',
            baselinePath,
            'Baseline state must be preexisting, absent, or unknown.',
          ),
        );
      if (unit.baseline.status === 'captured' && entry.state === 'unknown')
        issues.push(
          issue(
            'WORK-BASELINE',
            baselinePath,
            'Captured baseline cannot use unknown path state.',
          ),
        );
      if (!HASH_PATTERN.test(entry.fingerprint ?? ''))
        issues.push(
          issue(
            'WORK-BASELINE',
            baselinePath,
            'Baseline fingerprint must be a SHA-256 snapshot identity.',
          ),
        );
    }
  }
  if (!unit.semantic || !['pending', 'accepted'].includes(unit.semantic.status))
    issues.push(
      issue(
        'WORK-SEMANTIC',
        path,
        'Semantic status must be pending or accepted.',
      ),
    );
  else {
    assertKeys(
      unit.semantic,
      new Set(['status', 'result']),
      `${path}.semantic`,
      issues,
    );
    if (unit.semantic.status === 'accepted')
      resultDefinition(unit.semantic.result, `${path}.semantic.result`, issues);
    else if (unit.semantic.result !== undefined)
      issues.push(
        issue(
          'WORK-SEMANTIC',
          path,
          'Pending semantic state cannot contain an acceptance result.',
        ),
      );
  }
  for (const id of unit.acceptance ?? [])
    if (!acceptanceIds.has(id))
      issues.push(
        issue('WORK-ACCEPTANCE-REF', path, `Unknown acceptance id ${id}.`),
      );
  for (const ref of [...(unit.reads ?? []), ...(unit.writes ?? [])]) {
    try {
      confined(projectRoot, ref, 'Unit path');
    } catch (cause) {
      issues.push(issue('WORK-UNSAFE-PATH', path, cause.message));
    }
  }
}

function validateDurable(update, index, projectRoot, issues) {
  const path = `durableUpdates[${index}]`;
  if (
    !assertKeys(
      update,
      new Set([
        'capability',
        'operation',
        'expectedDigest',
        'source',
        'sourceDigest',
        'target',
      ]),
      path,
      issues,
    )
  )
    return;
  requireString(update, 'capability', path, issues);
  if (
    typeof update.capability === 'string' &&
    !/^[a-z0-9][a-z0-9/-]*$/.test(update.capability)
  )
    issues.push(
      issue(
        'WORK-DURABLE-CAPABILITY',
        path,
        'Capability must be a safe lower-case slash-delimited id.',
      ),
    );
  if (!['add', 'replace', 'remove', 'rename'].includes(update.operation))
    issues.push(
      issue('WORK-DURABLE-OPERATION', path, 'Durable operation is invalid.'),
    );
  if (
    update.operation === 'add' &&
    (!update.source ||
      !RAW_HASH_PATTERN.test(update.sourceDigest ?? '') ||
      update.expectedDigest !== undefined)
  )
    issues.push(
      issue(
        'WORK-DURABLE-SHAPE',
        path,
        'Add requires source/sourceDigest and forbids expectedDigest.',
      ),
    );
  if (
    update.operation === 'replace' &&
    (!update.source ||
      !RAW_HASH_PATTERN.test(update.sourceDigest ?? '') ||
      !RAW_HASH_PATTERN.test(update.expectedDigest ?? ''))
  )
    issues.push(
      issue(
        'WORK-DURABLE-SHAPE',
        path,
        'Replace requires source/sourceDigest and a raw SHA-256 expectedDigest.',
      ),
    );
  if (
    update.operation === 'remove' &&
    (!RAW_HASH_PATTERN.test(update.expectedDigest ?? '') ||
      update.source ||
      update.target)
  )
    issues.push(
      issue('WORK-DURABLE-SHAPE', path, 'Remove requires only expectedDigest.'),
    );
  if (
    update.operation === 'rename' &&
    (!update.target ||
      !RAW_HASH_PATTERN.test(update.expectedDigest ?? '') ||
      (update.source && !RAW_HASH_PATTERN.test(update.sourceDigest ?? '')))
  )
    issues.push(
      issue(
        'WORK-DURABLE-SHAPE',
        path,
        'Rename requires target/expectedDigest and sourceDigest when source is supplied.',
      ),
    );
  if (update.source) {
    try {
      const source = confined(projectRoot, update.source, 'Durable source');
      if (!existsSync(source) || !statSync(source).isFile())
        issues.push(
          issue(
            'WORK-DURABLE-SOURCE',
            path,
            `Durable source is missing: ${update.source}`,
          ),
        );
      else if (digest(readFileSync(source), false) !== update.sourceDigest)
        issues.push(
          issue(
            'WORK-DURABLE-SOURCE-STALE',
            path,
            `Durable source digest is stale: ${update.source}`,
          ),
        );
    } catch (cause) {
      issues.push(issue('WORK-UNSAFE-PATH', path, cause.message));
    }
  }
}

function detectCycles(units, issues) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      issues.push(
        issue(
          'WORK-UNIT-CYCLE',
          `units.${id}`,
          `Dependency cycle includes ${id}.`,
        ),
      );
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dependency))
        issues.push(
          issue(
            'WORK-UNIT-DEPENDENCY',
            `units.${id}`,
            `Unknown dependency ${dependency}.`,
          ),
        );
      else visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
}

function freshness(projectRoot, inputs, outputs, result, path, issues) {
  let currentInputs;
  let currentOutputs;
  let evidenceFingerprint;
  try {
    currentInputs = fingerprintPaths({ projectRoot, paths: inputs });
    currentOutputs = fingerprintPaths({ projectRoot, paths: outputs });
    evidenceFingerprint = fingerprintPaths({
      projectRoot,
      paths: result.evidence ?? [],
    }).fingerprint;
  } catch (cause) {
    issues.push(issue('WORK-UNSAFE-PATH', path, cause.message));
    return;
  }
  if (
    result.inputFingerprint !== currentInputs.fingerprint ||
    result.outputFingerprint !== currentOutputs.fingerprint
  )
    issues.push(
      issue(
        'WORK-EVIDENCE-STALE',
        path,
        `${path} fingerprints do not match current relevant content and dirty state.`,
      ),
    );
  if (result.evidenceFingerprint !== evidenceFingerprint)
    issues.push(
      issue(
        'WORK-EVIDENCE-STALE',
        path,
        `${path} evidence fingerprint is stale.`,
      ),
    );
  for (const evidence of result.evidence ?? []) {
    try {
      const evidencePath = confined(projectRoot, evidence, 'Evidence path');
      if (!existsSync(evidencePath) || !statSync(evidencePath).isFile())
        issues.push(
          issue(
            'WORK-EVIDENCE-MISSING',
            path,
            `Evidence is missing: ${evidence}`,
          ),
        );
    } catch (cause) {
      issues.push(issue('WORK-UNSAFE-PATH', path, cause.message));
    }
  }
}

export function validateWork(options) {
  const loaded = loadWork(options);
  const { work, projectRoot } = loaded;
  const errors = [];
  const warnings = [];
  const acceptanceItems = Array.isArray(work.acceptance) ? work.acceptance : [];
  const unitItems = Array.isArray(work.units) ? work.units : [];
  const durableItems = Array.isArray(work.durableUpdates)
    ? work.durableUpdates
    : [];
  const contextItems = Array.isArray(work.context) ? work.context : [];
  const decisionItems = Array.isArray(work.decisions) ? work.decisions : [];
  assertKeys(work, TOP_KEYS, 'work', errors);
  for (const optionalList of ['decisions', 'context', 'durableUpdates']) {
    if (work[optionalList] !== undefined && !Array.isArray(work[optionalList]))
      errors.push(
        issue(
          'WORK-TYPE',
          optionalList,
          `${optionalList} must be a list when present.`,
        ),
      );
  }
  if (work.version !== 1)
    errors.push(issue('WORK-VERSION', 'version', 'version must equal 1.'));
  if (
    !work.change ||
    typeof work.change !== 'object' ||
    Array.isArray(work.change) ||
    Object.keys(work.change).some((key) => !['id', 'title'].includes(key))
  )
    errors.push(
      issue(
        'WORK-CHANGE',
        'change',
        'change must contain id and optional title.',
      ),
    );
  else {
    requireString(work.change, 'id', 'change', errors);
    if (work.change.title !== undefined)
      requireString(work.change, 'title', 'change', errors);
    if (work.change.id !== loaded.changeRoot.split(/[\\/]/).at(-1))
      errors.push(
        issue(
          'WORK-CHANGE-ID',
          'change.id',
          'change.id must match its directory.',
        ),
      );
  }
  requireString(work, 'goal', 'work', errors);
  if (
    !work.agreement ||
    typeof work.agreement !== 'object' ||
    Array.isArray(work.agreement) ||
    Object.keys(work.agreement).some(
      (key) =>
        ![
          'id',
          'status',
          'fingerprint',
          'source',
          'ref',
          'approvedBy',
          'approvedAt',
        ].includes(key),
    )
  )
    errors.push(
      issue(
        'WORK-AGREEMENT',
        'agreement',
        'agreement contains invalid fields.',
      ),
    );
  else {
    assertKeys(
      work.agreement,
      new Set([
        'id',
        'status',
        'fingerprint',
        'source',
        'ref',
        'approvedBy',
        'approvedAt',
      ]),
      'agreement',
      errors,
    );
    if (work.agreement.status !== 'approved')
      errors.push(
        issue(
          'WORK-AGREEMENT',
          'agreement.status',
          'agreement must be approved.',
        ),
      );
    for (const key of ['id', 'source', 'ref', 'approvedBy', 'approvedAt'])
      if (work.agreement[key] !== undefined)
        requireString(work.agreement, key, 'agreement', errors);
    if (work.agreement.approvedAt !== undefined)
      requireTimestamp(work.agreement, 'approvedAt', 'agreement', errors);
    if (
      !HASH_PATTERN.test(work.agreement.fingerprint ?? '') ||
      work.agreement.fingerprint !== fingerprintWork(work)
    )
      errors.push(
        issue(
          'WORK-AGREEMENT-STALE',
          'agreement.fingerprint',
          'Agreement fingerprint does not match the product contract.',
        ),
      );
  }
  for (const section of ['bounds', 'autonomy'])
    if (
      !work[section] ||
      typeof work[section] !== 'object' ||
      Array.isArray(work[section])
    )
      errors.push(
        issue('WORK-REQUIRED', section, `${section} must be a mapping.`),
      );
    else {
      const sectionKeys =
        section === 'bounds'
          ? ['include', 'exclude']
          : ['allowed', 'requiresApproval', 'forbidden'];
      assertKeys(work[section], new Set(sectionKeys), section, errors);
      for (const key of sectionKeys)
        stringList(work[section][key], `${section}.${key}`, errors);
    }
  if (!Array.isArray(work.units))
    errors.push(
      issue('WORK-UNIT-SOURCE', 'work', 'Declare units or unitRefs.'),
    );
  if (!Array.isArray(work.acceptance) || work.acceptance.length === 0)
    errors.push(
      issue(
        'WORK-ACCEPTANCE',
        'acceptance',
        'At least one acceptance criterion is required.',
      ),
    );
  const acceptanceIds = new Set();
  for (const [index, acceptance] of acceptanceItems.entries()) {
    const path = `acceptance[${index}]`;
    if (
      !assertKeys(
        acceptance,
        new Set(['id', 'criterion', 'inputs', 'outputs', 'checks', 'result']),
        path,
        errors,
      )
    )
      continue;
    requireString(acceptance, 'id', path, errors);
    requireString(acceptance, 'criterion', path, errors);
    if (typeof acceptance.id === 'string' && !ID_PATTERN.test(acceptance.id))
      errors.push(issue('WORK-ID', path, 'Acceptance id is invalid.'));
    if (acceptanceIds.has(acceptance.id))
      errors.push(
        issue(
          'WORK-DUPLICATE-ID',
          path,
          `Duplicate acceptance id ${acceptance.id}.`,
        ),
      );
    acceptanceIds.add(acceptance.id);
    for (const key of ['inputs', 'outputs', 'checks'])
      stringList(acceptance[key], `${path}.${key}`, errors);
    for (const ref of [
      ...(acceptance.inputs ?? []),
      ...(acceptance.outputs ?? []),
    ]) {
      try {
        confined(projectRoot, ref, 'Acceptance path');
      } catch (cause) {
        errors.push(issue('WORK-UNSAFE-PATH', path, cause.message));
      }
    }
    if (acceptance.result)
      resultDefinition(acceptance.result, `${path}.result`, errors);
  }
  const unitIds = new Set();
  for (const [index, unit] of unitItems.entries()) {
    validateUnit(unit, index, acceptanceIds, projectRoot, errors);
    if (unitIds.has(unit.id))
      errors.push(
        issue(
          'WORK-DUPLICATE-ID',
          `units[${index}]`,
          `Duplicate unit id ${unit.id}.`,
        ),
      );
    unitIds.add(unit.id);
  }
  detectCycles(unitItems, errors);
  for (const id of acceptanceIds)
    if (!unitItems.some((unit) => unit.acceptance?.includes(id)))
      errors.push(
        issue(
          'WORK-ACCEPTANCE-COVERAGE',
          'acceptance',
          `${id} is not covered by a unit.`,
        ),
      );
  for (const [index, update] of durableItems.entries())
    validateDurable(update, index, projectRoot, errors);
  for (const [index, topic] of contextItems.entries()) {
    const path = `context[${index}]`;
    if (
      !assertKeys(topic, new Set(['topic', 'path', 'relevantTo']), path, errors)
    )
      continue;
    requireString(topic, 'topic', path, errors);
    requireString(topic, 'path', path, errors);
    stringList(topic.relevantTo, `${path}.relevantTo`, errors);
    try {
      confined(projectRoot, topic.path, 'Context path');
    } catch (cause) {
      errors.push(issue('WORK-UNSAFE-PATH', path, cause.message));
    }
  }
  for (const [index, decision] of decisionItems.entries()) {
    const path = `decisions[${index}]`;
    if (
      !assertKeys(
        decision,
        new Set(['id', 'statement', 'rationale']),
        path,
        errors,
      )
    )
      continue;
    requireString(decision, 'id', path, errors);
    requireString(decision, 'statement', path, errors);
    requireString(decision, 'rationale', path, errors);
  }
  for (const [index, unit] of unitItems.entries()) {
    if (unit.semantic?.status === 'accepted' && unit.semantic.result) {
      freshness(
        projectRoot,
        unit.reads,
        unit.writes,
        unit.semantic.result,
        `units[${index}].semantic.result`,
        errors,
      );
      if (unit.semantic.result.definitionFingerprint !== fingerprintUnit(unit))
        errors.push(
          issue(
            'WORK-DEFINITION-STALE',
            `units[${index}].semantic.result`,
            `${unit.id} acceptance targets an older unit definition.`,
          ),
        );
      for (const dependency of unit.dependsOn ?? []) {
        const dependencyUnit = unitItems.find(
          (candidate) => candidate.id === dependency,
        );
        if (dependencyUnit?.semantic?.status !== 'accepted')
          errors.push(
            issue(
              'WORK-DEPENDENCY-PENDING',
              `units[${index}]`,
              `${unit.id} cannot be accepted before dependency ${dependency}.`,
            ),
          );
      }
    }
  }
  for (const [index, acceptance] of acceptanceItems.entries()) {
    if (acceptance.result) {
      freshness(
        projectRoot,
        acceptance.inputs,
        acceptance.outputs,
        acceptance.result,
        `acceptance[${index}].result`,
        errors,
      );
      if (
        acceptance.result.definitionFingerprint !==
        fingerprintAcceptance(acceptance)
      )
        errors.push(
          issue(
            'WORK-DEFINITION-STALE',
            `acceptance[${index}].result`,
            `${acceptance.id} acceptance targets an older criterion definition.`,
          ),
        );
    }
  }
  if (options.through === 'closeout') {
    for (const [index, unit] of unitItems.entries()) {
      if (unit.semantic?.status !== 'accepted')
        errors.push(
          issue(
            'WORK-UNIT-PENDING',
            `units[${index}]`,
            `${unit.id} is not root-accepted.`,
          ),
        );
      else if (!unit.semantic.result)
        errors.push(
          issue(
            'WORK-UNIT-PENDING',
            `units[${index}]`,
            `${unit.id} lacks root acceptance evidence.`,
          ),
        );
    }
    for (const [index, acceptance] of acceptanceItems.entries()) {
      if (!acceptance.result)
        errors.push(
          issue(
            'WORK-ACCEPTANCE-PENDING',
            `acceptance[${index}]`,
            `${acceptance.id} lacks root acceptance evidence.`,
          ),
        );
    }
    if (
      !work.verification ||
      work.verification.reviewer !== 'oracle' ||
      work.verification.verdict !== 'pass'
    )
      errors.push(
        issue(
          'WORK-VERIFICATION-MISSING',
          'verification',
          'Closeout requires documentary Oracle PASS verification.',
        ),
      );
    else {
      const { inputs, outputs } = workEvidencePaths(work);
      verificationDefinition(work.verification, errors);
      freshness(
        projectRoot,
        inputs,
        outputs,
        work.verification,
        'verification',
        errors,
      );
      if (
        work.verification.agreementFingerprint !== work.agreement.fingerprint ||
        work.verification.technicalFingerprint !== fingerprintTechnical(work)
      )
        errors.push(
          issue(
            'WORK-DEFINITION-STALE',
            'verification',
            'Oracle verification targets older agreement or technical definitions.',
          ),
        );
    }
  }
  const evidencePaths = workEvidencePaths(work);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    work,
    sourcePaths: loaded.sourcePaths,
    fingerprints: {
      agreement: fingerprintWork(work),
      inputs: fingerprintPaths({ projectRoot, paths: evidencePaths.inputs })
        .fingerprint,
      outputs: fingerprintPaths({ projectRoot, paths: evidencePaths.outputs })
        .fingerprint,
    },
  };
}

function gitProvenance(projectRoot, path) {
  const result = spawnSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', path],
    { cwd: projectRoot, encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) return 'outside-git';
  const marker = result.stdout.slice(0, 2);
  if (marker === '??') return 'untracked';
  if (marker.trim()) return 'dirty';
  return 'clean';
}

function fingerprintTarget(root, path) {
  const target = confined(root, path, 'Fingerprint path');
  if (!existsSync(target))
    return [
      {
        path,
        type: 'missing',
        digest: null,
        provenance: gitProvenance(root, path),
      },
    ];
  const stat = lstatSync(target);
  if (stat.isSymbolicLink())
    throw new Error(`Fingerprint path cannot be a symbolic link: ${path}`);
  if (stat.isFile())
    return [
      {
        path,
        type: 'file',
        digest: digest(readFileSync(target), false),
        provenance: gitProvenance(root, path),
      },
    ];
  if (!stat.isDirectory())
    throw new Error(
      `Fingerprint path must be a regular file, directory, or missing: ${path}`,
    );
  const changesRoot = join(root, '.thoth', 'changes');
  const relativeChanges = relative(target, changesRoot);
  if (
    relativeChanges === '' ||
    (!relativeChanges.startsWith('..') && !isAbsolute(relativeChanges))
  )
    throw new Error(
      'Fingerprint directories cannot contain .thoth/changes because evidence would self-invalidate.',
    );
  const stack = [target];
  const files = [];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Fingerprint directory contains a symbolic link: ${relative(root, child)}`,
        );
      if (entry.isDirectory()) stack.push(child);
      else if (entry.isFile())
        files.push(relative(root, child).replaceAll('\\', '/'));
    }
  }
  return files.sort().flatMap((file) => fingerprintTarget(root, file));
}

export function fingerprintPaths({ projectRoot, paths }) {
  const root = resolve(projectRoot);
  const entries = [...new Set(paths)]
    .sort()
    .flatMap((path) => fingerprintTarget(root, path));
  return { fingerprint: digest(entries), entries };
}

export function captureBaseline({ projectRoot, paths }) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string'))
    throw new Error('Baseline paths must be a list of safe relative paths.');
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length !== paths.length)
    throw new Error('Baseline paths must be unique.');
  return {
    status: 'captured',
    capturedAt: new Date().toISOString(),
    paths: uniquePaths.map((path) => {
      const target = confined(resolve(projectRoot), path, 'Baseline path');
      const state = existsSync(target) ? 'preexisting' : 'absent';
      return {
        path,
        state,
        fingerprint: fingerprintPaths({ projectRoot, paths: [path] })
          .fingerprint,
      };
    }),
  };
}

export function workEvidencePaths(work) {
  return {
    inputs: [
      ...new Set([
        ...(work.acceptance ?? []).flatMap((item) => item.inputs ?? []),
        ...(work.units ?? []).flatMap((item) => item.reads ?? []),
      ]),
    ].sort(),
    outputs: [
      ...new Set([
        ...(work.acceptance ?? []).flatMap((item) => item.outputs ?? []),
        ...(work.units ?? []).flatMap((item) => item.writes ?? []),
        ...(work.durableUpdates ?? []).flatMap((item) =>
          item.source ? [item.source] : [],
        ),
      ]),
    ].sort(),
  };
}

function checkpointPaths(changeRoot, unitId) {
  if (!ID_PATTERN.test(unitId))
    throw new Error('Checkpoint unit id is invalid.');
  const directory = join(changeRoot, 'evidence', unitId);
  return {
    directory,
    path: join(directory, 'checkpoint.json'),
    previousPath: join(directory, 'checkpoint.previous.json'),
  };
}

function checkpointShape(parsed) {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).some((key) => !CHECKPOINT_KEYS.has(key)) ||
    Object.keys(parsed).length !== CHECKPOINT_KEYS.size ||
    parsed.version !== 1 ||
    typeof parsed.changeId !== 'string' ||
    !ID_PATTERN.test(parsed.changeId) ||
    typeof parsed.unitId !== 'string' ||
    !ID_PATTERN.test(parsed.unitId) ||
    typeof parsed.writer !== 'string' ||
    !parsed.writer.trim() ||
    typeof parsed.createdAt !== 'string' ||
    Number.isNaN(Date.parse(parsed.createdAt)) ||
    typeof parsed.summary !== 'string' ||
    !parsed.summary.trim() ||
    !Array.isArray(parsed.completed) ||
    parsed.completed.some((item) => typeof item !== 'string' || !item) ||
    !Array.isArray(parsed.pending) ||
    parsed.pending.some((item) => typeof item !== 'string' || !item) ||
    typeof parsed.nextAction !== 'string' ||
    !parsed.nextAction.trim() ||
    !Array.isArray(parsed.readRefs) ||
    parsed.readRefs.some((item) => typeof item !== 'string' || !item) ||
    !Array.isArray(parsed.checks) ||
    !HASH_PATTERN.test(parsed.inputFingerprint) ||
    !HASH_PATTERN.test(parsed.outputFingerprint) ||
    !HASH_PATTERN.test(parsed.agreementFingerprint) ||
    !HASH_PATTERN.test(parsed.unitFingerprint)
  )
    return false;
  if (
    !parsed.baseline ||
    typeof parsed.baseline !== 'object' ||
    Array.isArray(parsed.baseline) ||
    Object.keys(parsed.baseline).some((key) => !BASELINE_KEYS.has(key)) ||
    !['captured', 'unknown'].includes(parsed.baseline.status)
  )
    return false;
  const paths = parsed.baseline.paths ?? [];
  if (!Array.isArray(paths)) return false;
  if (
    parsed.baseline.status === 'unknown' &&
    (parsed.baseline.capturedAt !== undefined || paths.length > 0)
  )
    return false;
  if (
    parsed.baseline.status === 'captured' &&
    (typeof parsed.baseline.capturedAt !== 'string' ||
      !parsed.baseline.capturedAt ||
      Number.isNaN(Date.parse(parsed.baseline.capturedAt)) ||
      paths.length === 0)
  )
    return false;
  if (
    paths.some(
      (entry) =>
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        Object.keys(entry).some((key) => !BASELINE_PATH_KEYS.has(key)) ||
        typeof entry.path !== 'string' ||
        !['preexisting', 'absent'].includes(entry.state) ||
        !HASH_PATTERN.test(entry.fingerprint),
    )
  )
    return false;
  return parsed.checks.every(
    (check) =>
      check &&
      typeof check === 'object' &&
      !Array.isArray(check) &&
      Object.keys(check).length === CHECK_RESULT_KEYS.size &&
      Object.keys(check).every((key) => CHECK_RESULT_KEYS.has(key)) &&
      typeof check.id === 'string' &&
      check.id &&
      typeof check.command === 'string' &&
      check.command &&
      ['pass', 'fail'].includes(check.result) &&
      HASH_PATTERN.test(check.inputFingerprint) &&
      HASH_PATTERN.test(check.outputFingerprint),
  );
}

function parseCheckpoint(path, expected = {}) {
  confined(
    expected.projectRoot,
    relative(expected.projectRoot, path).replaceAll('\\', '/'),
    'Checkpoint candidate',
  );
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !checkpointShape(parsed) ||
    parsed.changeId !== expected.changeId ||
    parsed.unitId !== expected.unitId ||
    parsed.agreementFingerprint !== expected.agreementFingerprint ||
    parsed.unitFingerprint !== expected.unitFingerprint ||
    digest(parsed.baseline) !== digest(expected.baseline)
  )
    throw new Error('Checkpoint shape is invalid.');
  for (const reference of parsed.readRefs)
    confined(expected.projectRoot, reference, 'Checkpoint read reference');
  for (const entry of parsed.baseline.paths ?? [])
    confined(expected.projectRoot, entry.path, 'Checkpoint baseline path');
  return parsed;
}

export function createCheckpoint(options) {
  const { projectRoot, changeRoot, changeId } = resolveChange(options);
  const loaded = loadWork({
    projectRoot,
    changeRoot,
    unitId: options.unitId,
  });
  const unit = loaded.work.units.find(
    (candidate) => candidate.id === options.unitId,
  );
  if (!unit) throw new Error(`Unknown checkpoint unit: ${options.unitId}`);
  if (loaded.work.change?.id !== changeId)
    throw new Error('Checkpoint change id must match its directory.');
  if (
    loaded.work.agreement?.status !== 'approved' ||
    loaded.work.agreement?.fingerprint !== fingerprintWork(loaded.work)
  )
    throw new Error(
      'Checkpoint creation requires a current approved agreement.',
    );
  if (typeof options.writer !== 'string' || !options.writer.trim())
    throw new Error('Checkpoint writer must be a non-empty native identity.');
  if (typeof options.summary !== 'string' || !options.summary.trim())
    throw new Error('Checkpoint summary must be non-empty.');
  const unitFingerprint = fingerprintUnit(unit);
  const inputFingerprint = fingerprintPaths({
    projectRoot,
    paths: unit.reads,
  }).fingerprint;
  const outputFingerprint = fingerprintPaths({
    projectRoot,
    paths: unit.writes,
  }).fingerprint;
  const stringArray = (value, label) => {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string' || !item)
    )
      throw new Error(`${label} must be a list of strings.`);
    return value;
  };
  const checks = options.checks ?? [];
  if (!Array.isArray(checks))
    throw new Error('Checkpoint checks must be a list.');
  for (const check of checks) {
    const declared = unit.checks.find((item) => item.id === check?.id);
    if (
      !declared ||
      !check ||
      typeof check !== 'object' ||
      Array.isArray(check) ||
      Object.keys(check).length !== CHECK_RESULT_KEYS.size ||
      Object.keys(check).some((key) => !CHECK_RESULT_KEYS.has(key)) ||
      typeof check.command !== 'string' ||
      !check.command ||
      !['pass', 'fail'].includes(check.result) ||
      check.inputFingerprint !== inputFingerprint ||
      check.outputFingerprint !== outputFingerprint ||
      (declared.command !== undefined && declared.command !== check.command)
    )
      throw new Error(`Checkpoint check result is invalid: ${check?.id ?? ''}`);
  }
  if (typeof options.nextAction !== 'string' || !options.nextAction.trim())
    throw new Error('Checkpoint next action must be non-empty.');
  const paths = checkpointPaths(changeRoot, options.unitId);
  confined(
    projectRoot,
    relative(projectRoot, paths.path).replaceAll('\\', '/'),
    'Checkpoint path',
  );
  mkdirSync(paths.directory, { recursive: true });
  const checkpoint = {
    version: 1,
    changeId,
    unitId: options.unitId,
    writer: options.writer,
    createdAt: new Date().toISOString(),
    summary: options.summary,
    completed: stringArray(options.completed ?? [], 'Checkpoint completed'),
    pending: stringArray(options.pending ?? [], 'Checkpoint pending'),
    baseline: unit.baseline,
    checks,
    nextAction: options.nextAction,
    readRefs: stringArray(options.readRefs ?? [], 'Checkpoint read refs'),
    agreementFingerprint: loaded.work.agreement.fingerprint,
    unitFingerprint,
    inputFingerprint,
    outputFingerprint,
  };
  if (!checkpointShape(checkpoint))
    throw new Error('Checkpoint shape is invalid.');
  const temporary = join(
    paths.directory,
    `.checkpoint.${process.pid}.${Date.now()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(checkpoint, null, 2)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (existsSync(paths.path)) {
      let currentIsValid = false;
      try {
        parseCheckpoint(paths.path, {
          projectRoot,
          changeId,
          unitId: unit.id,
          agreementFingerprint: loaded.work.agreement.fingerprint,
          unitFingerprint,
          baseline: unit.baseline,
        });
        currentIsValid = true;
      } catch {
        /* discard torn latest, retain valid previous */
      }
      if (currentIsValid) {
        if (existsSync(paths.previousPath)) unlinkSync(paths.previousPath);
        renameSync(paths.path, paths.previousPath);
      } else {
        unlinkSync(paths.path);
      }
    }
    renameSync(temporary, paths.path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return { ...paths, checkpoint };
}

export function readCheckpoint(options) {
  const { changeRoot, changeId, unitId, projectRoot } = options;
  if (!projectRoot) throw new Error('Checkpoint reads require projectRoot.');
  const resolved = resolveChange({ projectRoot, changeRoot, changeId });
  const loaded = loadWork({
    projectRoot: resolved.projectRoot,
    changeRoot: resolved.changeRoot,
    unitId,
  });
  const unit = loaded.work.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Unknown checkpoint unit: ${unitId}`);
  const agreementFingerprint = fingerprintWork(loaded.work);
  const paths = checkpointPaths(resolved.changeRoot, unitId);
  for (const [status, path] of [
    ['valid', paths.path],
    ['fallback', paths.previousPath],
  ]) {
    if (!existsSync(path)) continue;
    try {
      const checkpoint = parseCheckpoint(path, {
        projectRoot: resolved.projectRoot,
        changeId: resolved.changeId,
        unitId,
        agreementFingerprint,
        unitFingerprint: fingerprintUnit(unit),
        baseline: unit.baseline,
      });
      const freshness = {
        inputs:
          fingerprintPaths({ projectRoot, paths: unit.reads }).fingerprint ===
          checkpoint.inputFingerprint,
        outputs:
          fingerprintPaths({ projectRoot, paths: unit.writes }).fingerprint ===
          checkpoint.outputFingerprint,
        lineage: true,
        baseline: checkpoint.baseline.status,
      };
      return { status, path, checkpoint, freshness };
    } catch {
      /* try bounded fallback */
    }
  }
  return { status: 'missing', path: paths.path };
}

export function projectResumeContext(options) {
  const loaded = loadWork({ ...options, unitId: options.unitId });
  const unit = loaded.work.units.find(
    (candidate) => candidate.id === options.unitId,
  );
  if (!unit) throw new Error(`Unknown unit ${options.unitId}.`);
  const maxBytes = options.maxBytes ?? 16_384;
  let contextBytes = 0;
  const context = (loaded.work.context ?? [])
    .filter((topic) => topic.relevantTo?.includes(unit.id))
    .map((topic) => {
      const path = confined(loaded.projectRoot, topic.path, 'Context path');
      contextBytes += statSync(path).size;
      if (contextBytes > maxBytes)
        throw new Error(
          'Projected resume context exceeds maxBytes; narrow topic files or raise the explicit bound.',
        );
      const content = readFileSync(path, 'utf8');
      return { topic: topic.topic, path: topic.path, content };
    });
  const checkpoint = readCheckpoint({
    projectRoot: loaded.projectRoot,
    changeRoot: loaded.changeRoot,
    unitId: unit.id,
  });
  const semanticResult =
    unit.semantic?.status === 'accepted' ? unit.semantic.result : undefined;
  const checkpointFreshness = checkpoint.checkpoint
    ? {
        content: {
          inputs: checkpoint.freshness.inputs,
          outputs: checkpoint.freshness.outputs,
        },
        evidence:
          checkpoint.checkpoint.checks.length === 0
            ? null
            : checkpoint.checkpoint.checks.every(
                (check) =>
                  check.result === 'pass' &&
                  check.inputFingerprint ===
                    fingerprintPaths({
                      projectRoot: loaded.projectRoot,
                      paths: unit.reads,
                    }).fingerprint &&
                  check.outputFingerprint ===
                    fingerprintPaths({
                      projectRoot: loaded.projectRoot,
                      paths: unit.writes,
                    }).fingerprint,
              ),
        lineage: checkpoint.freshness.lineage,
        baseline: checkpoint.checkpoint.baseline.status,
      }
    : null;
  if (checkpointFreshness)
    checkpointFreshness.resumable =
      checkpointFreshness.content.inputs &&
      checkpointFreshness.content.outputs &&
      checkpointFreshness.lineage &&
      checkpointFreshness.baseline === 'captured';
  const dependencyIds = new Set();
  const collectDependencies = (candidate) => {
    for (const dependencyId of candidate.dependsOn ?? []) {
      if (dependencyIds.has(dependencyId)) continue;
      const dependency = loaded.work.units.find(
        (item) => item.id === dependencyId,
      );
      if (!dependency)
        throw new Error(`Required unit definition missing: ${dependencyId}`);
      dependencyIds.add(dependencyId);
      collectDependencies(dependency);
    }
  };
  collectDependencies(unit);
  const dependencies = [...dependencyIds].map((dependencyId) => {
    const dependency = loaded.work.units.find(
      (candidate) => candidate.id === dependencyId,
    );
    const result =
      dependency.semantic?.status === 'accepted'
        ? dependency.semantic.result
        : undefined;
    return {
      id: dependency.id,
      acceptance: result ? 'accepted' : 'pending',
      output: dependency.output,
      writes: dependency.writes,
      freshness: result
        ? {
            content:
              fingerprintPaths({
                projectRoot: loaded.projectRoot,
                paths: dependency.reads,
              }).fingerprint === result.inputFingerprint &&
              fingerprintPaths({
                projectRoot: loaded.projectRoot,
                paths: dependency.writes,
              }).fingerprint === result.outputFingerprint,
            evidence:
              fingerprintPaths({
                projectRoot: loaded.projectRoot,
                paths: result.evidence,
              }).fingerprint === result.evidenceFingerprint,
            lineage:
              result.definitionFingerprint === fingerprintUnit(dependency),
          }
        : null,
    };
  });
  const projection = {
    change: loaded.work.change,
    goal: loaded.work.goal,
    bounds: loaded.work.bounds,
    autonomy: loaded.work.autonomy,
    unit,
    lineage: {
      agreementFingerprint: fingerprintWork(loaded.work),
      unitFingerprint: fingerprintUnit(unit),
    },
    acceptance: loaded.work.acceptance.filter((item) =>
      unit.acceptance.includes(item.id),
    ),
    dependencies,
    context,
    checkpoint,
    freshness: checkpointFreshness,
    semanticFreshness: semanticResult
      ? {
          inputs:
            fingerprintPaths({
              projectRoot: loaded.projectRoot,
              paths: unit.reads,
            }).fingerprint === semanticResult.inputFingerprint,
          outputs:
            fingerprintPaths({
              projectRoot: loaded.projectRoot,
              paths: unit.writes,
            }).fingerprint === semanticResult.outputFingerprint,
          evidence:
            fingerprintPaths({
              projectRoot: loaded.projectRoot,
              paths: semanticResult.evidence,
            }).fingerprint === semanticResult.evidenceFingerprint,
          lineage:
            semanticResult.definitionFingerprint === fingerprintUnit(unit),
        }
      : null,
    liveness: 'unknown',
    blocking: { writes: unit.writes, resources: unit.resources },
  };
  const serialized = JSON.stringify(projection);
  if (Buffer.byteLength(serialized) > maxBytes)
    throw new Error(
      'Projected resume context exceeds maxBytes; narrow topic files or raise the explicit bound.',
    );
  return projection;
}

function args(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) result._.push(value);
    else {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) result[key] = true;
      else {
        result[key] = next;
        index += 1;
      }
    }
  }
  return result;
}

function main(argv) {
  const options = args(argv);
  const command = options._[0];
  const projectRoot = resolve(options.project ?? process.cwd());
  const common = {
    projectRoot,
    changeRoot: options.change ? resolve(options.change) : undefined,
    changeId: options.id,
  };
  let output;
  if (command === 'validate')
    output = validateWork({ ...common, through: options.through ?? 'ready' });
  else if (command === 'resume')
    output = projectResumeContext({
      ...common,
      unitId: options.unit,
      maxBytes: options['max-bytes'] ? Number(options['max-bytes']) : undefined,
    });
  else if (command === 'baseline')
    output = captureBaseline({
      projectRoot,
      paths: options.paths ? options.paths.split(',').filter(Boolean) : [],
    });
  else if (command === 'fingerprint') {
    const loaded = loadWork(common);
    if (options.kind === 'agreement')
      output = { fingerprint: fingerprintWork(loaded.work) };
    else {
      const subject = options.unit
        ? loaded.work.units.find((item) => item.id === options.unit)
        : loaded.work.acceptance.find((item) => item.id === options.acceptance);
      if (!subject)
        throw new Error('Fingerprint requires a known --unit or --acceptance.');
      output = fingerprintPaths({
        projectRoot,
        paths:
          options.kind === 'inputs'
            ? (subject.reads ?? subject.inputs)
            : (subject.writes ?? subject.outputs),
      });
    }
  } else if (command === 'checkpoint') {
    if (options.read)
      output = readCheckpoint({
        projectRoot,
        changeRoot:
          common.changeRoot ??
          join(projectRoot, '.thoth', 'changes', common.changeId),
        unitId: options.unit,
      });
    else
      output = createCheckpoint({
        ...common,
        unitId: options.unit,
        writer: options.writer,
        summary: options.summary,
        completed: options.completed
          ? options.completed.split(',').filter(Boolean)
          : [],
        pending: options.pending
          ? options.pending.split(',').filter(Boolean)
          : [],
        checks: options['check-results']
          ? JSON.parse(options['check-results'])
          : [],
        nextAction: options['next-action'],
        readRefs: options['read-refs']
          ? options['read-refs'].split(',').filter(Boolean)
          : [],
      });
  } else
    throw new Error(
      'Usage: work.mjs validate|resume|fingerprint|baseline|checkpoint --project <root> --change <path>|--id <change>',
    );
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output?.ok === false) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exitCode = 1;
  }
}
