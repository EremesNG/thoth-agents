#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const CAPABILITY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEST_FAULTS = new Set(
  (process.env.THOTH_ARCHIVE_TEST_FAULT ?? '')
    .split(',')
    .map((fault) => fault.trim())
    .filter(Boolean),
);

function injectFault(stage) {
  if (TEST_FAULTS.has(stage)) {
    throw new Error(`Injected archive fault: ${stage}`);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function attemptRecovery(errors, label, operation) {
  try {
    operation();
  } catch (error) {
    errors.push(`${label}: ${errorMessage(error)}`);
  }
}

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

function sectionContent(content, heading) {
  const expression = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const match = expression.exec(content);
  if (!match || match.index === undefined) return undefined;
  const start = match.index + match[0].length;
  const remainder = content.slice(start);
  const nextHeading = /^##\s+/m.exec(remainder);
  return remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
}

function contractCandidateLines(content, prefix) {
  const pattern = new RegExp(`^\\s*-\\s+(?:\\*\\*)?${prefix}\\b`, 'i');
  return content.split(/\r?\n/).filter((line) => pattern.test(line));
}

function assertSequentialContractIds(ids, prefix) {
  const valid =
    new Set(ids).size === ids.length &&
    ids.every(
      (id, index) => id === `${prefix}-${String(index + 1).padStart(3, '0')}`,
    );
  if (!valid) {
    throw new Error(`${prefix}-### identifiers must be unique and sequential`);
  }
}

function parseComplianceMatrix(content) {
  const matrix = sectionContent(content, 'Compliance matrix') ?? '';
  const candidates = matrix
    .split(/\r?\n/)
    .filter((line) => /^\s*\|\s*(?:FR|SC)-/i.test(line));
  const entries = [
    ...matrix.matchAll(
      /^\|\s*((?:FR|SC)-\d{3})(?:\s+`?\[(?:buildable|outcome)\]`?)?\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(PASS|RISK|FAIL)\s*\|\s*$/gim,
    ),
  ].map((match) => ({
    id: match[1].toUpperCase(),
    evidence: match[2],
    check: match[3],
    result: match[4].toUpperCase(),
  }));
  return { entries, malformed: candidates.length !== entries.length };
}

function isConcreteEvidence(value) {
  const normalized = value.replaceAll('`', '').trim();
  return (
    normalized.length > 0 &&
    !/^\[.*\]$/.test(normalized) &&
    !/^(?:N\/?A|NONE|PENDING|TBD|NOT YET|-)[.!]?$/i.test(normalized)
  );
}

function hasExplicitResidualRisk(content, id) {
  const residualRisks = sectionContent(content, 'Residual risks') ?? '';
  const match = new RegExp(`^-\\s+${id}\\s*:\\s*(\\S.*)$`, 'im').exec(
    residualRisks,
  );
  return match !== null && isConcreteEvidence(match[1]);
}

function hasBlockingCriticalFinding(content) {
  const findings = sectionContent(content, 'Findings') ?? '';
  return findings.split(/\r?\n/).some((line) => {
    if (!/\bCRITICAL\b/i.test(line)) return false;
    if (/\bRESOLVED\b/i.test(line)) return false;
    return !/\b(?:NO|ZERO)\s+(?:OPEN\s+)?CRITICAL\b/i.test(line);
  });
}

function hasConcreteReviewDimensions(content) {
  const dimensions = sectionContent(content, 'Review dimensions') ?? '';
  return ['Completeness', 'Correctness', 'Coherence'].every((dimension) => {
    const match = new RegExp(
      `^-\\s*\\*\\*${dimension}\\*\\*:\\s*(\\S.*)$`,
      'im',
    ).exec(dimensions);
    return match !== null && isConcreteEvidence(match[1]);
  });
}

function assertVerifyCloseout(verify, contract) {
  if (
    !/^\*\*Reviewer\*\*:\s*oracle(?:<br>)?\s*$/im.test(verify) ||
    !/^\*\*Independent from implementer\*\*:\s*Yes(?:<br>)?\s*$/im.test(verify)
  ) {
    throw new Error(
      'verify-report.md requires an independent oracle reviewer before archive',
    );
  }
  if (!/^\*\*Verdict\*\*:\s*PASS\s*$/im.test(verify)) {
    throw new Error('verify-report.md must record PASS before archive');
  }
  if (hasBlockingCriticalFinding(verify)) {
    throw new Error('Unresolved CRITICAL verification findings block archive');
  }

  if (!hasConcreteReviewDimensions(verify)) {
    throw new Error(
      'verify-report.md must record completeness, correctness, and coherence review dimensions',
    );
  }

  const matrix = parseComplianceMatrix(verify);
  const knownIds = new Set([
    ...contract.frIds,
    ...contract.buildableScIds,
    ...contract.outcomeScIds,
  ]);
  const rowIds = matrix.entries.map(({ id }) => id);
  const duplicateIds = rowIds.filter(
    (id, index) => rowIds.indexOf(id) !== index,
  );
  const unknownIds = rowIds.filter((id) => !knownIds.has(id));
  const failedIds = matrix.entries
    .filter(({ result }) => result === 'FAIL')
    .map(({ id }) => id);
  if (
    matrix.malformed ||
    duplicateIds.length > 0 ||
    unknownIds.length > 0 ||
    failedIds.length > 0
  ) {
    throw new Error(
      'Compliance matrix must contain canonical rows with unique known requirement IDs and no FAIL results',
    );
  }
  const rows = new Map(matrix.entries.map((entry) => [entry.id, entry]));
  const missingEvidence = [
    ...contract.frIds,
    ...contract.buildableScIds,
  ].filter((id) => {
    const row = rows.get(id);
    return (
      row?.result !== 'PASS' ||
      !isConcreteEvidence(row.evidence) ||
      !isConcreteEvidence(row.check)
    );
  });
  if (missingEvidence.length > 0) {
    throw new Error(
      `Verification evidence is missing for: ${missingEvidence.join(', ')}`,
    );
  }

  const unresolvedOutcomes = contract.outcomeScIds.filter((id) => {
    const row = rows.get(id);
    if (!row) return true;
    if (row.result === 'PASS') {
      return (
        !isConcreteEvidence(row.evidence) || !isConcreteEvidence(row.check)
      );
    }
    return row.result !== 'RISK' || !hasExplicitResidualRisk(verify, id);
  });
  if (unresolvedOutcomes.length > 0) {
    throw new Error(
      `Outcome verification disposition is missing for: ${unresolvedOutcomes.join(', ')}`,
    );
  }
}

function assertArchivable(change, contract) {
  for (const file of [
    'spec.md',
    'plan.md',
    'tasks.md',
    'verify-report.md',
    'archive-report.md',
  ]) {
    if (!existsSync(join(change, file))) {
      throw new Error(`${file} is required before archive`);
    }
  }

  const tasks = readFileSync(join(change, 'tasks.md'), 'utf8');
  if (/^- \[(?: |~)\] T\d{3}\b/m.test(tasks)) {
    throw new Error('All tasks must be complete before archive');
  }

  const verify = readFileSync(join(change, 'verify-report.md'), 'utf8');
  assertVerifyCloseout(verify, contract);

  const report = readFileSync(join(change, 'archive-report.md'), 'utf8');
  if (!/^\*\*Status\*\*:\s*READY(?:<br>)?\s*$/im.test(report)) {
    throw new Error('archive-report.md must record READY before archive');
  }
  if (!/^\*\*Oracle verdict\*\*:\s*PASS(?:<br>)?\s*$/im.test(report)) {
    throw new Error('archive-report.md must record oracle PASS before archive');
  }
  if (
    !/^\*\*Archive path\*\*:\s*`openspec\/changes\/archive\/YYYY-MM-DD-\[feature\]\/`(?:<br>)?\s*$/im.test(
      report,
    )
  ) {
    throw new Error('archive-report.md must retain the dated archive target');
  }
  if (
    !/verify-report\.md/i.test(
      sectionContent(report, 'Verification lineage') ?? '',
    )
  ) {
    throw new Error('archive-report.md must retain verification lineage');
  }
  if (
    !/^- Pending: archive applies declared durable deltas transactionally\.\s*$/im.test(
      sectionContent(report, 'Canonical specification sync') ?? '',
    )
  ) {
    throw new Error(
      'archive-report.md must include the pending canonical specification sync',
    );
  }
  return report;
}

function parseDeltaMetadata(metadata) {
  if (metadata === 'INTERNAL') return { operation: 'INTERNAL' };

  const change = /^(ADDED|MODIFIED|REMOVED)\s+(\S+)$/.exec(metadata);
  if (change && CAPABILITY_PATTERN.test(change[2])) {
    return { operation: change[1], capability: change[2] };
  }

  const rename = /^RENAMED\s+(\S+)\s+FROM\s+(.+)$/.exec(metadata);
  if (
    rename &&
    CAPABILITY_PATTERN.test(rename[1]) &&
    rename[2].trim().length > 0
  ) {
    return {
      operation: 'RENAMED',
      capability: rename[1],
      previousTitle: rename[2].trim(),
    };
  }

  throw new Error(`Invalid requirement delta metadata: [${metadata}]`);
}

function parseStoryScenarios(spec) {
  const userStories = sectionContent(spec, 'User stories');
  if (userStories === undefined) {
    throw new Error('spec.md must contain a canonical User stories section');
  }
  const stories = [
    ...userStories.matchAll(
      /^###\s+US(\d+)\s+-\s+(.+?)\s+\(Priority:\s*P\d+\)\s*$/gim,
    ),
  ];
  const scenariosByRequirement = new Map();

  for (const [index, storyMatch] of stories.entries()) {
    const start = storyMatch.index ?? 0;
    const nextStory = stories[index + 1]?.index;
    const end = nextStory ?? userStories.length;
    const story = userStories.slice(start, end);
    const covers =
      /^\*\*Covers\*\*:\s*(.+)$/im.exec(story)?.[1].match(/\bFR-\d{3}\b/g) ??
      [];
    const scenarios = [
      ...story.matchAll(
        /^\d+\.\s+\*\*Given\*\*\s+(.+?),\s+\*\*When\*\*\s+(.+?),\s+\*\*Then\*\*\s+(.+?)\.?\s*$/gim,
      ),
    ].map((scenario, scenarioIndex) => ({
      title: `US${storyMatch[1]} - ${storyMatch[2].trim()} ${scenarioIndex + 1}`,
      given: scenario[1].trim(),
      when: scenario[2].trim(),
      result: scenario[3].trim(),
    }));

    for (const requirementId of covers) {
      const current = scenariosByRequirement.get(requirementId) ?? [];
      current.push(...scenarios);
      scenariosByRequirement.set(requirementId, current);
    }
  }

  return scenariosByRequirement;
}

function parseChangeSpec(spec) {
  const scenariosByRequirement = parseStoryScenarios(spec);
  const functionalRequirementsSection = sectionContent(
    spec,
    'Functional requirements',
  );
  const successCriteriaSection = sectionContent(spec, 'Success criteria');
  if (functionalRequirementsSection === undefined) {
    throw new Error(
      'spec.md must contain a canonical Functional requirements section',
    );
  }
  if (successCriteriaSection === undefined) {
    throw new Error(
      'spec.md must contain a canonical Success criteria section',
    );
  }
  const functionalRequirements = [
    ...functionalRequirementsSection.matchAll(
      /^- \*\*(FR-\d{3})\s+—\s+(.+?)\*\*:\s*`\[(.+?)\]`\s+(\S.+)$/gim,
    ),
  ];
  const rawFrCandidates = contractCandidateLines(spec, 'FR');
  if (
    functionalRequirements.length === 0 ||
    rawFrCandidates.length !== functionalRequirements.length
  ) {
    throw new Error(
      'Every FR-### must use the canonical named requirement, delta metadata, and normative statement format',
    );
  }
  assertSequentialContractIds(
    functionalRequirements.map((match) => match[1]),
    'FR',
  );

  const successCriteria = [
    ...successCriteriaSection.matchAll(
      /^- \*\*(SC-\d{3})\*\*\s+`\[(buildable|outcome)\]`:\s*(\S.+)$/gim,
    ),
  ];
  const rawScCandidates = contractCandidateLines(spec, 'SC');
  if (
    successCriteria.length === 0 ||
    rawScCandidates.length !== successCriteria.length
  ) {
    throw new Error(
      'Every SC-### must be classified as buildable or outcome before archive',
    );
  }
  assertSequentialContractIds(
    successCriteria.map((match) => match[1]),
    'SC',
  );

  const deltas = [];
  for (const match of functionalRequirements) {
    const metadata = parseDeltaMetadata(match[3]);
    if (metadata.operation === 'INTERNAL') continue;
    const scenarios = scenariosByRequirement.get(match[1]) ?? [];
    if (scenarios.length === 0) {
      throw new Error(
        `${match[1]} must map to at least one acceptance scenario before archive`,
      );
    }
    deltas.push({
      title: match[2].trim(),
      statement: match[4].trim(),
      scenarios,
      ...metadata,
    });
  }
  return {
    deltas,
    frIds: functionalRequirements.map((match) => match[1]),
    buildableScIds: successCriteria
      .filter((match) => match[2].toLowerCase() === 'buildable')
      .map((match) => match[1]),
    outcomeScIds: successCriteria
      .filter((match) => match[2].toLowerCase() === 'outcome')
      .map((match) => match[1]),
  };
}

function parseCanonicalSpec(content) {
  const headings = [...content.matchAll(/^### Requirement:\s+(.+?)\s*$/gm)];
  const requirements = new Map();
  const prefix =
    headings.length === 0
      ? content.trimEnd()
      : content.slice(0, headings[0].index).trimEnd();

  for (const [index, heading] of headings.entries()) {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? content.length;
    const title = heading[1].trim();
    if (requirements.has(title)) {
      throw new Error(`Canonical specification repeats requirement: ${title}`);
    }
    requirements.set(title, content.slice(start, end).trim());
  }

  return { prefix, requirements };
}

function newCanonicalSpec(capability) {
  const title = capability
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
  return parseCanonicalSpec(
    `# ${title} Specification\n\n## Purpose\n\nDurable behavioral contract for \`${capability}\`.\n\n## Requirements\n`,
  );
}

function renderRequirement(delta) {
  const scenarios = delta.scenarios
    .map(
      (scenario) =>
        `#### Scenario: ${scenario.title}\n\n- **GIVEN** ${scenario.given}\n- **WHEN** ${scenario.when}\n- **THEN** ${scenario.result}`,
    )
    .join('\n\n');
  return `### Requirement: ${delta.title}\n\n${delta.statement}\n\n${scenarios}`;
}

function renderCanonicalSpec(canonical) {
  const requirements = [...canonical.requirements.values()];
  return `${canonical.prefix}${requirements.length > 0 ? `\n\n${requirements.join('\n\n')}` : ''}\n`;
}

function planCanonicalUpdates(specRoot, deltas) {
  const byCapability = new Map();
  for (const delta of deltas) {
    const capability = delta.capability;
    if (!CAPABILITY_PATTERN.test(capability)) {
      throw new Error(`Invalid capability: ${capability}`);
    }
    const current = byCapability.get(capability) ?? [];
    current.push(delta);
    byCapability.set(capability, current);
  }

  const updates = [];
  for (const [capability, capabilityDeltas] of byCapability) {
    const path = join(specRoot, capability, 'spec.md');
    const present = existsSync(path);
    const canonical = present
      ? parseCanonicalSpec(readFileSync(path, 'utf8'))
      : newCanonicalSpec(capability);

    for (const delta of capabilityDeltas) {
      if (delta.operation === 'ADDED') {
        if (canonical.requirements.has(delta.title)) {
          throw new Error(
            `${capability} already contains requirement: ${delta.title}`,
          );
        }
        canonical.requirements.set(delta.title, renderRequirement(delta));
        continue;
      }

      if (!present) {
        throw new Error(
          `${capability} has no canonical specification for ${delta.operation}`,
        );
      }

      if (delta.operation === 'RENAMED') {
        if (!canonical.requirements.has(delta.previousTitle)) {
          throw new Error(
            `${capability} does not contain requirement: ${delta.previousTitle}`,
          );
        }
        if (
          delta.previousTitle !== delta.title &&
          canonical.requirements.has(delta.title)
        ) {
          throw new Error(
            `${capability} already contains requirement: ${delta.title}`,
          );
        }
        const entries = [...canonical.requirements.entries()];
        canonical.requirements = new Map(
          entries.map(([title, block]) =>
            title === delta.previousTitle
              ? [delta.title, renderRequirement(delta)]
              : [title, block],
          ),
        );
        continue;
      }

      if (!canonical.requirements.has(delta.title)) {
        throw new Error(
          `${capability} does not contain requirement: ${delta.title}`,
        );
      }
      if (delta.operation === 'MODIFIED') {
        canonical.requirements.set(delta.title, renderRequirement(delta));
      } else if (delta.operation === 'REMOVED') {
        canonical.requirements.delete(delta.title);
      }
    }

    updates.push({ path, content: renderCanonicalSpec(canonical), capability });
  }
  return updates;
}

function stageCanonicalUpdates(updates) {
  const transactionId = `${process.pid}-${Date.now()}`;
  const staged = [];
  const createdDirectories = [];
  try {
    for (const update of updates) {
      const directory = dirname(update.path);
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true });
        createdDirectories.push(directory);
      }
      const stagePath = join(
        directory,
        `.spec.md.thoth-stage-${transactionId}`,
      );
      writeFileSync(stagePath, update.content);
      staged.push({ ...update, stagePath });
    }
    return { staged, createdDirectories, transactionId };
  } catch (error) {
    try {
      rollbackCanonicalUpdates({ staged, createdDirectories, applied: [] });
    } catch (recoveryError) {
      throw new Error(
        `${errorMessage(error)}; staging recovery failed: ${errorMessage(recoveryError)}`,
      );
    }
    throw error;
  }
}

function applyCanonicalUpdates(transaction) {
  const applied = [];
  try {
    for (const item of transaction.staged) {
      const backupPath = `${item.path}.thoth-backup-${transaction.transactionId}`;
      const hadOriginal = existsSync(item.path);
      if (hadOriginal) {
        renameSync(item.path, backupPath);
      }
      applied.push({ ...item, backupPath, hadOriginal });
      if (hadOriginal) injectFault('after-original-backup');
      renameSync(item.stagePath, item.path);
      if (applied.length === 1) injectFault('after-first-canonical-write');
    }
    return { ...transaction, applied };
  } catch (error) {
    try {
      rollbackCanonicalUpdates({ ...transaction, applied });
    } catch (recoveryError) {
      throw new Error(
        `${errorMessage(error)}; canonical recovery failed: ${errorMessage(recoveryError)}`,
      );
    }
    throw error;
  }
}

function rollbackCanonicalUpdates(transaction) {
  const recoveryErrors = [];
  for (const item of [...(transaction.applied ?? [])].reverse()) {
    attemptRecovery(recoveryErrors, `remove ${item.path}`, () =>
      rmSync(item.path, { force: true }),
    );
    if (item.hadOriginal) {
      if (existsSync(item.backupPath)) {
        attemptRecovery(recoveryErrors, `restore ${item.path}`, () =>
          renameSync(item.backupPath, item.path),
        );
      } else {
        recoveryErrors.push(`restore ${item.path}: backup is missing`);
      }
    }
  }
  for (const item of transaction.staged ?? []) {
    attemptRecovery(recoveryErrors, `remove ${item.stagePath}`, () =>
      rmSync(item.stagePath, { force: true }),
    );
  }
  for (const directory of [
    ...(transaction.createdDirectories ?? []),
  ].reverse()) {
    if (existsSync(directory)) {
      attemptRecovery(recoveryErrors, `remove ${directory}`, () =>
        rmdirSync(directory),
      );
    }
  }
  if (recoveryErrors.length > 0) {
    throw new Error(recoveryErrors.join('; '));
  }
}

function finalizeCanonicalUpdates(transaction) {
  const warnings = [];
  for (const item of transaction.applied ?? []) {
    if (!item.hadOriginal) continue;
    try {
      rmSync(item.backupPath, { force: true });
    } catch (error) {
      warnings.push(
        `Archived successfully but could not remove backup ${item.backupPath}: ${errorMessage(error)}`,
      );
    }
  }
  return warnings;
}

function archivedReport(report, options, changeName, updatedCapabilities) {
  const sync =
    updatedCapabilities.length === 0
      ? '- None: no durable behavior delta.'
      : `- Updated: ${updatedCapabilities.map((item) => `\`${item}\``).join(', ')}.`;
  return report
    .replace(/^\*\*Status\*\*:\s*READY\b/im, '**Status**: ARCHIVED')
    .replaceAll(
      'openspec/changes/archive/YYYY-MM-DD-[feature]/',
      `openspec/changes/archive/${options.date}-${changeName}/`,
    )
    .replace(
      /^- Pending: archive applies declared durable deltas transactionally\.\s*$/im,
      sync,
    );
}

function recoverArchiveFailure(reportPath, originalReport, transaction) {
  const recoveryErrors = [];
  attemptRecovery(recoveryErrors, 'report recovery failed', () => {
    injectFault('report-restore');
    writeFileSync(reportPath, originalReport);
  });
  attemptRecovery(recoveryErrors, 'canonical recovery failed', () =>
    rollbackCanonicalUpdates(transaction),
  );
  return recoveryErrors;
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
  if (!existsSync(join(change, 'spec.md'))) {
    throw new Error('spec.md is required before archive');
  }
  const contract = parseChangeSpec(
    readFileSync(join(change, 'spec.md'), 'utf8'),
  );
  const originalReport = assertArchivable(change, contract);

  const archiveRoot = join(changesRoot, 'archive');
  const changeName = basename(change);
  const target = join(archiveRoot, `${options.date}-${changeName}`);
  if (existsSync(target)) {
    throw new Error(`Archive target already exists: ${target}`);
  }

  const specRoot = join(dirname(changesRoot), 'specs');
  const updates = planCanonicalUpdates(specRoot, contract.deltas);
  const updatedCapabilities = updates
    .map((update) => update.capability)
    .sort((left, right) => left.localeCompare(right));
  const reportPath = join(change, 'archive-report.md');
  const transaction = applyCanonicalUpdates(stageCanonicalUpdates(updates));

  try {
    writeFileSync(
      reportPath,
      archivedReport(originalReport, options, changeName, updatedCapabilities),
    );
    injectFault('after-report-write');
    mkdirSync(archiveRoot, { recursive: true });
    injectFault('before-change-move');
    renameSync(change, target);
  } catch (error) {
    const recoveryErrors = recoverArchiveFailure(
      reportPath,
      originalReport,
      transaction,
    );
    if (recoveryErrors.length > 0) {
      const cause = errorMessage(error);
      throw new Error(`${cause}; ${recoveryErrors.join('; ')}`);
    }
    throw error;
  }
  const warnings = finalizeCanonicalUpdates(transaction);

  const result = {
    status: 'archived',
    archivePath: target,
    specsUpdated: updatedCapabilities,
    warnings,
  };
  process.stdout.write(`${options.json ? JSON.stringify(result) : target}\n`);
} catch (error) {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
}
