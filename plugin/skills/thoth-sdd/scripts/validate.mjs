#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function parseArgs(argv) {
  const values = { route: 'full', through: 'final', json: false };
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
    !['specify', 'plan', 'tasks', 'checklist', 'final'].includes(values.through)
  ) {
    throw new Error(
      '--through must be specify, plan, tasks, checklist, or final',
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

function definitionIds(content, prefix) {
  return valuesFor(
    new RegExp(`^- \\*\\*${prefix}-(\\d{3})\\*\\*:\\s*\\S`, 'gim'),
    content,
  );
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

function validateSpec(content, errors) {
  const artifact = 'spec.md';
  const storyMatches = [
    ...content.matchAll(/^###\s+US(\d+)\s+-.*\(Priority:\s*P\d+\)/gim),
  ];
  const storyIds = storyMatches.map((match) => match[1]);
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
      const functionalRequirements = /^##\s+Functional requirements\s*$/im.exec(
        content.slice(start),
      );
      const end =
        next ??
        (functionalRequirements?.index === undefined
          ? content.length
          : start + functionalRequirements.index);
      const story = content.slice(start, end);
      if (!/\*\*Independent test\*\*:\s*\S.+/i.test(story)) {
        errors.push(
          issue(
            'SDD-SPEC-INDEPENDENCE',
            artifact,
            `US${match[1]} must describe an independent test.`,
          ),
        );
      }
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

  const frIds = definitionIds(content, 'FR');
  const scIds = definitionIds(content, 'SC');
  if (frIds.length === 0) {
    errors.push(issue('SDD-SPEC-FR', artifact, 'Add FR-### requirements.'));
  } else {
    checkUniqueSequential(frIds, 'FR', artifact, errors);
  }
  if (scIds.length === 0) {
    errors.push(
      issue('SDD-SPEC-SC', artifact, 'Add measurable SC-### criteria.'),
    );
  } else {
    checkUniqueSequential(scIds, 'SC', artifact, errors);
    const successCriteria = [
      ...content.matchAll(/^- \*\*SC-\d{3}\*\*:\s*(.+)$/gim),
    ];
    const measurable =
      /(?:\b\d+(?:\.\d+)?\b|%|\b(?:all|every|none|zero|under|over|within|at least|at most|no more|fewer|pass(?:es)?|fail(?:s)?|accept(?:s)?|reject(?:s)?|preserve(?:s)?)\b)/i;
    if (successCriteria.some((match) => !measurable.test(match[1]))) {
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

  return { storyIds, frIds, scIds };
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
        ? { name: match[1].trim(), status: match[2].toUpperCase() }
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
      (preEntries.length === 0 || preEntries.some((entry) => !entry))) ||
    (post !== undefined &&
      (postEntries.length === 0 || postEntries.some((entry) => !entry)))
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

function validateTasks(content, errors, spec) {
  const artifact = 'tasks.md';
  const taskLines = content
    .split(/\r?\n/)
    .filter((line) => /^- \[[ x~]\]/.test(line));
  const taskShape =
    /^- \[[ x~]\] T(\d{3})(?: \[P\])?(?: \[US(\d+)\])? .+`[^`\r\n]+`(?: \| Verify: \S.+)?\s*$/;
  if (
    taskLines.length === 0 ||
    taskLines.some((line) => !taskShape.test(line))
  ) {
    errors.push(
      issue(
        'SDD-TASK-FORMAT',
        artifact,
        'Every task must use T### [P?] [US#?], a description, and an exact backticked path.',
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
      ...spec.scIds
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
  if (
    !/^##\s+Parallel execution examples\s*$/im.test(content) ||
    !/\[P\]/.test(content)
  ) {
    errors.push(
      issue(
        'SDD-TASK-PARALLEL',
        artifact,
        'Include [P] candidates and a concrete parallel execution example.',
      ),
    );
  }
}

function validateChecklist(content, errors, spec, requireComplete) {
  const artifact = 'checklists/requirements.md';
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
  const revalidation = sectionContent(content, 'Revalidation');
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
    initial === undefined ||
    revalidation === undefined ||
    !/^- \[[ x~]\] CHK\d{3}\b/im.test(revalidation)
  ) {
    errors.push(
      issue(
        'SDD-CHECKLIST-REVALIDATION',
        artifact,
        'Record both initial validation and revalidation.',
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

function validate({ change, route, through }) {
  const root = resolve(change);
  const errors = [];
  const warnings = [];

  if (route === 'direct') {
    return { valid: true, route, through, changeRoot: root, errors, warnings };
  }

  const spec = readArtifact(root, 'spec.md', errors);
  const requiresPlan = ['plan', 'checklist', 'tasks', 'final'].includes(
    through,
  );
  const requiresTasks = ['tasks', 'final'].includes(through);
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
      through === 'checklist' || through === 'final',
    );
  } else if (route === 'full' && through === 'final') {
    warnings.push({
      code: 'SDD-CHECKLIST-CONDITIONAL',
      artifact: 'checklists/requirements.md',
      message:
        'No requirements checklist exists; confirm that risk did not activate the conditional checklist gate.',
    });
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
