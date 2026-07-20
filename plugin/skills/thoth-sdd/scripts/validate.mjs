#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';

function parseArgs(argv) {
  const values = { route: 'full', through: 'ready', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') values.json = true;
    else if (argument === '--change') values.change = argv[++index];
    else if (argument === '--route') values.route = argv[++index];
    else if (argument === '--through') values.through = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!values.change) throw new Error('--change is required');
  if (!['direct', 'accelerated', 'full'].includes(values.route)) {
    throw new Error('--route must be direct, accelerated, or full');
  }
  if (
    !['specify', 'plan', 'tasks', 'checklist', 'ready', 'closeout'].includes(
      values.through,
    )
  ) {
    throw new Error(
      '--through must be specify, plan, tasks, checklist, ready, or closeout',
    );
  }
  return values;
}

function issue(code, artifact, message) {
  return { code, artifact, message };
}

function readArtifact(root, relativePath, errors, required = true) {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    if (required) {
      errors.push(
        issue(
          'SDD-ARTIFACT-MISSING',
          relativePath,
          `Required artifact is missing: ${relativePath}`,
        ),
      );
    }
    return undefined;
  }
  return readFileSync(path, 'utf8');
}

function valuesFor(pattern, content) {
  return [...content.matchAll(pattern)].map((match) => match[1]);
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

function checkUniqueSequential(ids, prefix, artifact, errors) {
  if (new Set(ids).size !== ids.length) {
    errors.push(
      issue(
        `SDD-${prefix}-UNIQUE`,
        artifact,
        `${prefix} identifiers must be unique.`,
      ),
    );
  }
  const numbers = ids.map((id) => Number.parseInt(id, 10));
  if (numbers.some((value, index) => value !== index + 1)) {
    errors.push(
      issue(
        `SDD-${prefix}-SEQUENCE`,
        artifact,
        `${prefix} identifiers must start at 001 and remain sequential.`,
      ),
    );
  }
}

const CAPABILITY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseRequirementDelta(metadata) {
  if (metadata === 'INTERNAL') {
    return { operation: 'INTERNAL' };
  }

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

  return undefined;
}

function parseAffectedCapabilities(intentSection) {
  const match = /^\*\*Affected capabilities\*\*:\s*(.+)$/im.exec(
    intentSection ?? '',
  );
  if (!match) return undefined;
  const value = match[1].replace(/<br>\s*$/i, '').trim();
  if (/^None\.?$/i.test(value)) return [];
  const capabilities = valuesFor(/`([^`]+)`/g, value);
  return capabilities.length > 0 &&
    capabilities.every((item) => CAPABILITY_PATTERN.test(item))
    ? capabilities
    : undefined;
}

function contractCandidateLines(content, prefix) {
  const pattern = new RegExp(`^\\s*-\\s+(?:\\*\\*)?${prefix}\\b`, 'i');
  return content.split(/\r?\n/).filter((line) => pattern.test(line));
}

function validateSpec(content, errors) {
  const artifact = 'spec.md';
  const intentSection = sectionContent(content, 'Intent and scope');
  const affectedCapabilities = parseAffectedCapabilities(intentSection);
  if (
    intentSection === undefined ||
    !/^\*\*Why\*\*:\s*\S.+$/im.test(intentSection) ||
    !/^\*\*Impact\*\*:\s*\S.+$/im.test(intentSection) ||
    affectedCapabilities === undefined
  ) {
    errors.push(
      issue(
        'SDD-SPEC-INTENT',
        artifact,
        'Intent and scope must define Why, Impact, and valid affected capabilities or None.',
      ),
    );
  }

  const userStoriesSection = sectionContent(content, 'User stories');
  const edgeCasesSection = sectionContent(content, 'Edge cases');
  const functionalRequirementsSection = sectionContent(
    content,
    'Functional requirements',
  );
  const successCriteriaSection = sectionContent(content, 'Success criteria');
  const dependenciesSection = sectionContent(content, 'Dependencies');
  const missingSections = [
    ['User stories', userStoriesSection],
    ['Edge cases', edgeCasesSection],
    ['Functional requirements', functionalRequirementsSection],
    ['Success criteria', successCriteriaSection],
    ['Dependencies', dependenciesSection],
  ]
    .filter(([, section]) => section === undefined)
    .map(([heading]) => heading);
  if (missingSections.length > 0) {
    errors.push(
      issue(
        'SDD-SPEC-SECTIONS',
        artifact,
        `Canonical specification sections are missing: ${missingSections.join(', ')}.`,
      ),
    );
  }

  const storyMatches = [
    ...(userStoriesSection ?? '').matchAll(
      /^###\s+US(\d+)\s+-.*\(Priority:\s*P\d+\)/gim,
    ),
  ];
  const storyIds = storyMatches.map((match) => match[1]);
  const storyCoverage = new Set();
  if (storyIds.length === 0) {
    errors.push(
      issue(
        'SDD-SPEC-STORIES',
        artifact,
        'Add prioritized US# stories with an independent test and acceptance scenarios.',
      ),
    );
  } else {
    checkUniqueSequential(storyIds, 'STORY', artifact, errors);
    for (const [index, match] of storyMatches.entries()) {
      const start = match.index ?? 0;
      const next = storyMatches[index + 1]?.index;
      const end = next ?? userStoriesSection.length;
      const story = userStoriesSection.slice(start, end);
      if (!/\*\*Independent test\*\*:\s*\S.+/i.test(story)) {
        errors.push(
          issue(
            'SDD-SPEC-INDEPENDENCE',
            artifact,
            `US${match[1]} must describe an independent test.`,
          ),
        );
      }
      const covers = /^\*\*Covers\*\*:\s*(\S.+)$/im.exec(story);
      const coveredIds = covers?.[1].match(/\b(?:FR|SC)-\d{3}\b/g) ?? [];
      if (
        !coveredIds.some((id) => id.startsWith('FR-')) ||
        !coveredIds.some((id) => id.startsWith('SC-'))
      ) {
        errors.push(
          issue(
            'SDD-SPEC-STORY-COVERAGE',
            artifact,
            `US${match[1]} must map to its FR-### and SC-### contracts.`,
          ),
        );
      }
      for (const id of coveredIds) storyCoverage.add(id);
      if (
        !/\*\*Given\*\*[\s\S]+?\*\*When\*\*[\s\S]+?\*\*Then\*\*\s+\S/i.test(
          story,
        )
      ) {
        errors.push(
          issue(
            'SDD-SPEC-ACCEPTANCE',
            artifact,
            `US${match[1]} must include a Given/When/Then acceptance scenario.`,
          ),
        );
      }
    }
  }

  const functionalRequirements = [
    ...(functionalRequirementsSection ?? '').matchAll(
      /^- \*\*FR-(\d{3})\s+—\s+(.+?)\*\*:\s*`\[(.+?)\]`\s+(\S.+)$/gim,
    ),
  ];
  const successCriteria = [
    ...(successCriteriaSection ?? '').matchAll(
      /^- \*\*SC-(\d{3})\*\*\s+`\[(buildable|outcome)\]`:\s*(\S.+)$/gim,
    ),
  ];
  const frIds = functionalRequirements.map((match) => match[1]);
  const scIds = successCriteria.map((match) => match[1]);
  const rawFrCandidates = contractCandidateLines(content, 'FR');
  const rawScCandidates = contractCandidateLines(content, 'SC');
  if (rawFrCandidates.length !== functionalRequirements.length) {
    errors.push(
      issue(
        'SDD-SPEC-FR-FORMAT',
        artifact,
        'Every FR-### must use the canonical named requirement, delta metadata, and normative statement format.',
      ),
    );
  }
  if (frIds.length === 0) {
    errors.push(issue('SDD-SPEC-FR', artifact, 'Add FR-### requirements.'));
  } else {
    checkUniqueSequential(frIds, 'FR', artifact, errors);
    for (const match of functionalRequirements) {
      if (!/\b(?:MUST|SHALL)\b/.test(match[4])) {
        errors.push(
          issue(
            'SDD-SPEC-FR-NORMATIVE',
            artifact,
            `FR-${match[1]} must contain an observable MUST or SHALL statement.`,
          ),
        );
      }
      const delta = parseRequirementDelta(match[3]);
      if (!delta) {
        errors.push(
          issue(
            'SDD-SPEC-FR-DELTA',
            artifact,
            `FR-${match[1]} must declare INTERNAL, ADDED, MODIFIED, REMOVED, or RENAMED metadata.`,
          ),
        );
      } else if (
        delta.capability &&
        !affectedCapabilities?.includes(delta.capability)
      ) {
        errors.push(
          issue(
            'SDD-SPEC-CAPABILITY-COVERAGE',
            artifact,
            `FR-${match[1]} targets undeclared capability ${delta.capability}.`,
          ),
        );
      }
    }
  }
  if (rawScCandidates.length !== successCriteria.length) {
    errors.push(
      issue(
        'SDD-SPEC-SC-TYPE',
        artifact,
        'Every SC-### must be classified as buildable or outcome.',
      ),
    );
  }
  if (scIds.length === 0) {
    errors.push(
      issue('SDD-SPEC-SC', artifact, 'Add measurable SC-### criteria.'),
    );
  } else {
    checkUniqueSequential(scIds, 'SC', artifact, errors);
    const measurable =
      /(?:\b\d+(?:\.\d+)?\b|%|\b(?:all|every|none|zero|under|over|within|at least|at most|no more|fewer|pass(?:es)?|fail(?:s)?|accept(?:s)?|reject(?:s)?|preserve(?:s)?)\b)/i;
    if (successCriteria.some((match) => !measurable.test(match[3]))) {
      errors.push(
        issue(
          'SDD-SPEC-SC-MEASURABLE',
          artifact,
          'Every SC-### definition must state a structurally measurable outcome.',
        ),
      );
    }
  }
  if (!/^##\s+Assumptions\s*$/im.test(content)) {
    errors.push(
      issue('SDD-SPEC-ASSUMPTIONS', artifact, 'Add an Assumptions section.'),
    );
  }
  if (!/^##\s+Out of scope\s*$/im.test(content)) {
    errors.push(
      issue('SDD-SPEC-OUT-OF-SCOPE', artifact, 'Add an Out of scope section.'),
    );
  }

  const knownContracts = new Set([
    ...frIds.map((id) => `FR-${id}`),
    ...scIds.map((id) => `SC-${id}`),
  ]);
  const unknownCoverage = [...storyCoverage].filter(
    (id) => !knownContracts.has(id),
  );
  const uncoveredContracts = [...knownContracts].filter(
    (id) => !storyCoverage.has(id),
  );
  if (unknownCoverage.length > 0 || uncoveredContracts.length > 0) {
    errors.push(
      issue(
        'SDD-SPEC-STORY-COVERAGE',
        artifact,
        `Story traceability is incomplete. Unknown: ${unknownCoverage.join(', ') || 'none'}; uncovered: ${uncoveredContracts.join(', ') || 'none'}.`,
      ),
    );
  }

  return {
    storyIds,
    frIds,
    scIds,
    buildableScIds: successCriteria
      .filter((match) => match[2].toLowerCase() === 'buildable')
      .map((match) => match[1]),
    outcomeScIds: successCriteria
      .filter((match) => match[2].toLowerCase() === 'outcome')
      .map((match) => match[1]),
  };
}

function constitutionEntries(content) {
  if (content === undefined) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => /^- /.test(line))
    .map((line) => {
      const match =
        /^- (?:\*\*)?(.+?)(?:\*\*)?:\s*(PASS|JUSTIFIED EXCEPTION|FAIL)\s+[—-]\s+(\S.+)$/i.exec(
          line,
        );
      return match
        ? {
            name: match[1].trim(),
            status: match[2].toUpperCase(),
            evidence: match[3],
          }
        : undefined;
    });
}

function validatePlan(content, errors, constitution) {
  const pre = sectionContent(content, 'Constitution Check \\(pre-design\\)');
  const post = sectionContent(content, 'Constitution Check \\(post-design\\)');
  if (pre === undefined) {
    errors.push(
      issue(
        'SDD-PLAN-CONSTITUTION-PRE',
        'plan.md',
        'Record the pre-design Constitution Check.',
      ),
    );
  }
  if (post === undefined) {
    errors.push(
      issue(
        'SDD-PLAN-CONSTITUTION-POST',
        'plan.md',
        'Record the post-design Constitution Check.',
      ),
    );
  }

  const preEntries = constitutionEntries(pre);
  const postEntries = constitutionEntries(post);
  if (
    (pre !== undefined &&
      (preEntries.length === 0 ||
        preEntries.some(
          (entry) => !entry || !isConcreteEvidence(entry.evidence),
        ))) ||
    (post !== undefined &&
      (postEntries.length === 0 ||
        postEntries.some(
          (entry) => !entry || !isConcreteEvidence(entry.evidence),
        )))
  ) {
    errors.push(
      issue(
        'SDD-PLAN-CONSTITUTION-EVIDENCE',
        'plan.md',
        'Every Constitution Check entry must include a status and concrete evidence.',
      ),
    );
  }

  const preNames = preEntries
    .filter(Boolean)
    .map(({ name }) => name.toLowerCase());
  const postNames = postEntries
    .filter(Boolean)
    .map(({ name }) => name.toLowerCase());
  const expectedNames = constitution
    ? valuesFor(/^###\s+(?:\d+|[IVXLCDM]+)\.\s+(.+)$/gim, constitution).map(
        (name) => name.trim().toLowerCase(),
      )
    : [];
  const coverage = expectedNames.length > 0 ? expectedNames : preNames;
  if (
    coverage.some(
      (name) => !preNames.includes(name) || !postNames.includes(name),
    ) ||
    preNames.some((name) => !postNames.includes(name)) ||
    postNames.some((name) => !preNames.includes(name))
  ) {
    errors.push(
      issue(
        'SDD-PLAN-CONSTITUTION-COVERAGE',
        'plan.md',
        'Pre-design and post-design checks must cover the same active Constitution principles.',
      ),
    );
  }
  if (
    [...preEntries, ...postEntries]
      .filter(Boolean)
      .some(({ status }) => status === 'FAIL')
  ) {
    errors.push(
      issue(
        'SDD-PLAN-CONSTITUTION-FAIL',
        'plan.md',
        'A FAIL Constitution status blocks downstream task generation.',
      ),
    );
  }
}

function exactTaskPath(line) {
  const description = line.split(' | Verify:', 1)[0];
  const spans = [...description.matchAll(/`([^`\r\n]+)`/g)];
  if (spans.length !== 1) return undefined;

  const rawPath = spans[0][1].trim().replaceAll('\\', '/');
  if (
    rawPath.length === 0 ||
    /^\[.*\]$/.test(rawPath) ||
    /[*?[\]{}]/.test(rawPath) ||
    rawPath.startsWith('!') ||
    rawPath === '~' ||
    rawPath.startsWith('~/') ||
    rawPath.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/i.test(rawPath)
  ) {
    return undefined;
  }

  const normalized = posix.normalize(rawPath);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    return undefined;
  }
  return normalized.toLowerCase();
}

function validateTasks(content, errors, spec) {
  const artifact = 'tasks.md';
  const taskLines = content
    .split(/\r?\n/)
    .filter((line) => /^- \[[ x~]\]/.test(line));
  const taskShape =
    /^- \[[ x~]\] T(\d{3})(?: \[P\])?(?: \[US(\d+)\])? .+`[^`\r\n]+`(?: \| Verify: \S.+)?\s*$/;
  if (
    taskLines.length === 0 ||
    taskLines.some((line) => !taskShape.test(line) || !exactTaskPath(line))
  ) {
    errors.push(
      issue(
        'SDD-TASK-FORMAT',
        artifact,
        'Every task must use T### [P?] [US#?], a description, and exactly one literal repository-relative path.',
      ),
    );
  }
  const parsedTasks = taskLines
    .map((line) => ({ line, match: taskShape.exec(line) }))
    .filter(({ match }) => match !== null);
  if (parsedTasks.length > 0) {
    const taskIds = parsedTasks.map(({ match }) => match[1]);
    checkUniqueSequential(taskIds, 'TASK', artifact, errors);
  }
  if (
    taskLines.length > 0 &&
    taskLines.some((line) => !/ \| Verify: \S.+\s*$/.test(line))
  ) {
    errors.push(
      issue(
        'SDD-TASK-VERIFICATION',
        artifact,
        'Every task must state an observable Verify outcome.',
      ),
    );
  }

  if (spec) {
    const storyTags = new Set(
      parsedTasks
        .map(({ match }) => match[2])
        .filter((value) => value !== undefined),
    );
    const missing = [
      ...spec.storyIds
        .filter((id) => !storyTags.has(String(Number.parseInt(id, 10))))
        .map((id) => `US${Number.parseInt(id, 10)}`),
      ...spec.frIds
        .filter(
          (id) => !new RegExp(`\\bFR-${id}\\b`).test(taskLines.join('\n')),
        )
        .map((id) => `FR-${id}`),
      ...spec.buildableScIds
        .filter(
          (id) => !new RegExp(`\\bSC-${id}\\b`).test(taskLines.join('\n')),
        )
        .map((id) => `SC-${id}`),
    ];
    const unknownStories = [...storyTags]
      .filter(
        (id) =>
          !spec.storyIds.some(
            (storyId) =>
              Number.parseInt(storyId, 10) === Number.parseInt(id, 10),
          ),
      )
      .map((id) => `US${id}`);
    if (missing.length > 0 || unknownStories.length > 0) {
      errors.push(
        issue(
          'SDD-TASK-COVERAGE',
          artifact,
          `Task coverage is incomplete. Missing: ${missing.join(', ') || 'none'}; unknown stories: ${unknownStories.join(', ') || 'none'}.`,
        ),
      );
    }
  }
  if (!/^##\s+MVP scope\s*$/im.test(content)) {
    errors.push(
      issue(
        'SDD-TASK-MVP',
        artifact,
        'Identify the independently testable MVP.',
      ),
    );
  }
  if (!/^##\s+Dependencies\s*$/im.test(content)) {
    errors.push(
      issue('SDD-TASK-DEPENDENCIES', artifact, 'Document task dependencies.'),
    );
  }
  const parallelSection = sectionContent(
    content,
    'Parallel execution(?: examples)?',
  );
  const taskRecords = parsedTasks.map(({ line, match }) => ({
    id: `T${match[1]}`,
    parallel: /\[P\]/.test(line),
    path: exactTaskPath(line),
  }));
  const tasksById = new Map(taskRecords.map((task) => [task.id, task]));
  const hasParallelTask = taskRecords.some((task) => task.parallel);
  const parallelLines = (parallelSection ?? '')
    .split(/\r?\n/)
    .map((line) => [line, [...new Set(line.match(/\bT\d{3}\b/g) ?? [])]])
    .filter(([, ids]) => ids.length >= 2);
  const referencedTaskIds = new Set(parallelLines.flatMap(([, ids]) => ids));
  const hasParallelExample = parallelLines.length > 0;
  const noParallelMatch = /^-\s+None:\s*(\S.*)$/im.exec(parallelSection ?? '');
  const explainsNoParallelWork =
    noParallelMatch !== null && isConcreteEvidence(noParallelMatch[1]);
  const pathsOverlap = (left, right) =>
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`);
  const unknownReferences = [...referencedTaskIds].filter(
    (id) => !tasksById.has(id),
  );
  const omittedParallelTasks = taskRecords
    .filter((task) => task.parallel && !referencedTaskIds.has(task.id))
    .map((task) => task.id);
  const examplesWithoutParallelTask = parallelLines.some(
    ([, ids]) => !ids.some((id) => tasksById.get(id)?.parallel),
  );
  const overlappingExamples = parallelLines.some(([, ids]) => {
    const paths = ids.map((id) => tasksById.get(id)?.path);
    if (paths.some((path) => path === undefined)) return true;
    return paths.some((path, index) =>
      paths.slice(index + 1).some((other) => pathsOverlap(path, other)),
    );
  });
  if (
    parallelSection === undefined ||
    (explainsNoParallelWork && hasParallelExample) ||
    (hasParallelTask &&
      (!hasParallelExample ||
        explainsNoParallelWork ||
        unknownReferences.length > 0 ||
        omittedParallelTasks.length > 0 ||
        examplesWithoutParallelTask ||
        overlappingExamples)) ||
    (!hasParallelTask && !explainsNoParallelWork)
  ) {
    errors.push(
      issue(
        'SDD-TASK-PARALLEL',
        artifact,
        'Document existing [P] tasks with non-overlapping paths, or explain why no safe parallel work exists.',
      ),
    );
  }
}

function validateChecklist(content, errors, spec, requireComplete) {
  const artifact = 'checklists/requirements.md';
  const activationMatch = /^\*\*Activation reason\*\*:\s*(\S.*)$/im.exec(
    content,
  );
  if (activationMatch === null || !isConcreteEvidence(activationMatch[1])) {
    errors.push(
      issue(
        'SDD-CHECKLIST-ACTIVATION',
        artifact,
        'Record the concrete risk or ambiguity that activated the checklist.',
      ),
    );
  }
  const checklistLines = content
    .split(/\r?\n/)
    .filter((line) => /^- \[[ x~]\]/.test(line));
  const checklistShape = /^- \[([ x~])\] CHK(\d{3})\b.+$/i;
  const parsed = checklistLines
    .map((line) => checklistShape.exec(line))
    .filter((match) => match !== null);
  if (
    checklistLines.length === 0 ||
    checklistLines.some((line) => !checklistShape.test(line))
  ) {
    errors.push(
      issue(
        'SDD-CHECKLIST-ID',
        artifact,
        'Checklist items must use CHK### IDs.',
      ),
    );
  }
  if (parsed.length > 0) {
    checkUniqueSequential(
      parsed.map((match) => match[2]),
      'CHECKLIST',
      artifact,
      errors,
    );
  }
  if (requireComplete && parsed.some((match) => match[1] !== 'x')) {
    errors.push(
      issue(
        'SDD-CHECKLIST-INCOMPLETE',
        artifact,
        'Final validation requires every checklist item to be complete.',
      ),
    );
  }
  const initial = sectionContent(content, 'Initial validation');
  const domainLenses = sectionContent(content, 'Domain lenses');
  const revalidation = sectionContent(content, 'Revalidation');
  const noopRevalidationMatch =
    revalidation === undefined
      ? null
      : /^-\s+Not required:\s*(\S.*)$/im.exec(revalidation);
  const explicitNoopRevalidation =
    noopRevalidationMatch !== null &&
    isConcreteEvidence(noopRevalidationMatch[1]);
  const hasRevalidationItems =
    revalidation !== undefined &&
    /^- \[[ x~]\] CHK\d{3}\b/im.test(revalidation);
  const hasDomainItems =
    domainLenses !== undefined &&
    /^- \[[ x~]\] CHK\d{3}\b/im.test(domainLenses);
  const noDomainLensesMatch =
    domainLenses === undefined
      ? null
      : /^-\s+None:\s*(\S.*)$/im.exec(domainLenses);
  const explicitNoDomainLenses =
    noDomainLensesMatch !== null && isConcreteEvidence(noDomainLensesMatch[1]);
  const missingDimensions = [
    'Completeness',
    'Clarity',
    'Consistency',
    'Measurability',
    'Coverage',
  ].filter(
    (dimension) => !new RegExp(`\\[${dimension}\\]`, 'i').test(initial ?? ''),
  );
  if (missingDimensions.length > 0) {
    errors.push(
      issue(
        'SDD-CHECKLIST-TAXONOMY',
        artifact,
        `Missing requirement-quality dimensions: ${missingDimensions.join(', ')}.`,
      ),
    );
  }
  if (
    domainLenses === undefined ||
    (!hasDomainItems && !explicitNoDomainLenses) ||
    (hasDomainItems && explicitNoDomainLenses)
  ) {
    errors.push(
      issue(
        'SDD-CHECKLIST-DOMAIN-LENSES',
        artifact,
        'Add applicable domain-lens checks or an evidence-backed None decision.',
      ),
    );
  }
  if (
    initial === undefined ||
    revalidation === undefined ||
    (!hasRevalidationItems && !explicitNoopRevalidation) ||
    (hasRevalidationItems && explicitNoopRevalidation)
  ) {
    errors.push(
      issue(
        'SDD-CHECKLIST-REVALIDATION',
        artifact,
        'Record initial validation plus checked revalidation or an evidence-backed no-op.',
      ),
    );
  }
  if (spec) {
    const missing = [
      ...spec.storyIds
        .filter(
          (id) =>
            !new RegExp(`\\bUS${Number.parseInt(id, 10)}\\b`).test(content),
        )
        .map((id) => `US${Number.parseInt(id, 10)}`),
      ...spec.frIds
        .filter((id) => !new RegExp(`\\bFR-${id}\\b`).test(content))
        .map((id) => `FR-${id}`),
      ...spec.scIds
        .filter((id) => !new RegExp(`\\bSC-${id}\\b`).test(content))
        .map((id) => `SC-${id}`),
    ];
    if (missing.length > 0) {
      errors.push(
        issue(
          'SDD-CHECKLIST-COVERAGE',
          artifact,
          `Checklist coverage is missing: ${missing.join(', ')}.`,
        ),
      );
    }
  }
}

function validateCloseoutTasks(content, errors) {
  if (/^- \[(?: |~)\] T\d{3}\b/m.test(content)) {
    errors.push(
      issue(
        'SDD-CLOSEOUT-TASKS',
        'tasks.md',
        'Closeout requires every task to be complete.',
      ),
    );
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

function validateVerifyReport(content, errors, spec) {
  const artifact = 'verify-report.md';
  if (
    !/^\*\*Reviewer\*\*:\s*oracle(?:<br>)?\s*$/im.test(content) ||
    !/^\*\*Independent from implementer\*\*:\s*Yes(?:<br>)?\s*$/im.test(content)
  ) {
    errors.push(
      issue(
        'SDD-VERIFY-INDEPENDENCE',
        artifact,
        'Closeout requires an oracle reviewer independent from the implementer.',
      ),
    );
  }
  if (!/^\*\*Verdict\*\*:\s*PASS\s*$/im.test(content)) {
    errors.push(
      issue(
        'SDD-VERIFY-VERDICT',
        artifact,
        'Closeout requires an explicit PASS verdict.',
      ),
    );
  }
  if (hasBlockingCriticalFinding(content)) {
    errors.push(
      issue(
        'SDD-VERIFY-CRITICAL',
        artifact,
        'Unresolved CRITICAL verification findings block closeout.',
      ),
    );
  }

  if (!hasConcreteReviewDimensions(content)) {
    errors.push(
      issue(
        'SDD-VERIFY-DIMENSIONS',
        artifact,
        'Oracle must judge completeness, correctness, and coherence separately.',
      ),
    );
  }

  const matrix = parseComplianceMatrix(content);
  const knownIds = new Set([
    ...spec.frIds.map((id) => `FR-${id}`),
    ...spec.scIds.map((id) => `SC-${id}`),
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
    errors.push(
      issue(
        'SDD-VERIFY-MATRIX',
        artifact,
        `Compliance matrix rows must be canonical, unique, known, and non-FAIL. Duplicates: ${[...new Set(duplicateIds)].join(', ') || 'none'}; unknown: ${[...new Set(unknownIds)].join(', ') || 'none'}; failed: ${[...new Set(failedIds)].join(', ') || 'none'}.`,
      ),
    );
  }
  const rows = new Map(matrix.entries.map((entry) => [entry.id, entry]));
  const required = [
    ...spec.frIds.map((id) => `FR-${id}`),
    ...spec.buildableScIds.map((id) => `SC-${id}`),
  ];
  const missing = required.filter((id) => {
    const row = rows.get(id);
    return (
      row?.result !== 'PASS' ||
      !isConcreteEvidence(row.evidence) ||
      !isConcreteEvidence(row.check)
    );
  });
  if (missing.length > 0) {
    errors.push(
      issue(
        'SDD-VERIFY-COVERAGE',
        artifact,
        `Verification evidence is missing for: ${missing.join(', ')}.`,
      ),
    );
  }

  const unresolvedOutcomes = spec.outcomeScIds
    .map((id) => `SC-${id}`)
    .filter((id) => {
      const row = rows.get(id);
      if (!row) return true;
      if (row.result === 'PASS') {
        return (
          !isConcreteEvidence(row.evidence) || !isConcreteEvidence(row.check)
        );
      }
      return row.result !== 'RISK' || !hasExplicitResidualRisk(content, id);
    });
  if (unresolvedOutcomes.length > 0) {
    errors.push(
      issue(
        'SDD-VERIFY-OUTCOME',
        artifact,
        `Outcome criteria require observed PASS evidence or an explicit residual RISK: ${unresolvedOutcomes.join(', ')}.`,
      ),
    );
  }
}

function validateArchiveReport(content, errors) {
  const artifact = 'archive-report.md';
  const valid =
    /^\*\*Status\*\*:\s*READY(?:<br>)?\s*$/im.test(content) &&
    /^\*\*Oracle verdict\*\*:\s*PASS(?:<br>)?\s*$/im.test(content) &&
    /^\*\*Archive path\*\*:\s*`openspec\/changes\/archive\/YYYY-MM-DD-\[feature\]\/`(?:<br>)?\s*$/im.test(
      content,
    ) &&
    /verify-report\.md/i.test(
      sectionContent(content, 'Verification lineage') ?? '',
    ) &&
    /^- Pending: archive applies declared durable deltas transactionally\.\s*$/im.test(
      sectionContent(content, 'Canonical specification sync') ?? '',
    );
  if (!valid) {
    errors.push(
      issue(
        'SDD-ARCHIVE-REPORT',
        artifact,
        'Archive report must be READY with oracle PASS, lineage, sync status, and the dated target placeholder.',
      ),
    );
  }
}

function validate({ change, route, through }) {
  const root = resolve(change);
  const errors = [];
  const warnings = [];

  if (route === 'direct') {
    return { valid: true, route, through, changeRoot: root, errors, warnings };
  }

  const spec = readArtifact(root, 'spec.md', errors);
  const requiresPlan = [
    'plan',
    'checklist',
    'tasks',
    'ready',
    'closeout',
  ].includes(through);
  const requiresTasks = ['tasks', 'ready', 'closeout'].includes(through);
  const plan = requiresPlan ? readArtifact(root, 'plan.md', errors) : undefined;
  const tasks = requiresTasks
    ? readArtifact(root, 'tasks.md', errors)
    : undefined;
  const checklist = readArtifact(
    root,
    'checklists/requirements.md',
    errors,
    through === 'checklist',
  );

  const specContract =
    spec === undefined ? undefined : validateSpec(spec, errors);
  const constitution = readArtifact(
    join(root, '..', '..'),
    'memory/constitution.md',
    errors,
    requiresPlan,
  );
  if (plan !== undefined) validatePlan(plan, errors, constitution);
  if (tasks !== undefined) validateTasks(tasks, errors, specContract);
  if (checklist !== undefined) {
    validateChecklist(
      checklist,
      errors,
      specContract,
      ['checklist', 'ready', 'closeout'].includes(through),
    );
  } else if (route === 'full' && ['ready', 'closeout'].includes(through)) {
    warnings.push({
      code: 'SDD-CHECKLIST-CONDITIONAL',
      artifact: 'checklists/requirements.md',
      message:
        'No requirements checklist exists; confirm that risk did not activate the conditional checklist gate.',
    });
  }

  if (
    through === 'closeout' &&
    tasks !== undefined &&
    specContract !== undefined
  ) {
    validateCloseoutTasks(tasks, errors);
    const verifyReport = readArtifact(root, 'verify-report.md', errors);
    const archiveReport = readArtifact(root, 'archive-report.md', errors);
    if (verifyReport !== undefined) {
      validateVerifyReport(verifyReport, errors, specContract);
    }
    if (archiveReport !== undefined) {
      validateArchiveReport(archiveReport, errors);
    }
  }

  return {
    valid: errors.length === 0,
    route,
    through,
    changeRoot: root,
    errors,
    warnings,
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = validate(options);
  const output = options.json
    ? JSON.stringify(report)
    : report.valid
      ? 'SDD artifacts are structurally valid.'
      : report.errors
          .map((error) => `${error.code} (${error.artifact}): ${error.message}`)
          .join('\n');
  process.stdout.write(`${output}\n`);
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
