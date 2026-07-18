import type {
  ArtifactComparisonMetadata,
  ArtifactSnapshot,
} from './artifact-loader';
import {
  type ArtifactGovernanceFinding,
  type ArtifactGovernanceMode,
  type ArtifactGovernanceResult,
  createArtifactGovernanceResult,
} from './types';

const RECOGNIZED_PHASE_HEADER = /^## Phase \d+:\s+.+$/;
const TASK_LINE = /^- \[(.*?)\]\s+(.*)$/;
const TASK_NUMBERING = /^(\d+\.\d+)\s+.+$/;
const VERIFICATION_HEADER = /^\*\*Verification\*\*:\s*$/;
const VERIFICATION_RUN = /^- Run:\s+.+$/;
const VERIFICATION_EXPECTED = /^- Expected:\s+.+$/;
const ALLOWED_TASK_STATES = new Set([' ', 'x', '~', '-']);

// Optional, config-gated annotation markers (see src/skills/sdd-tasks/SKILL.md).
// Validated for well-formedness/placement ONLY when present; never mandated.
const CANONICAL_PARALLEL_MARKER = '[P]';
// A bracketed single-letter token in the canonical `[P]` slot (immediately
// after the `N.M` number). Used to detect malformed variants such as `[p]`.
const PARALLEL_MARKER_SLOT = /^\[[A-Za-z]\]/;
// Any USN-like token; canonical form is exactly `[USN-<digits>]`.
const USN_TOKEN = /\[USN-[^\]]*\]/g;
const CANONICAL_USN_TOKEN = /^\[USN-\d+\]$/;
// Priority label; canonical value is `P` followed by a positive integer.
const PRIORITY_LABEL = /(?:^|\s|\|)Priority:\s*(\S+)/;
const CANONICAL_PRIORITY_VALUE = /^P[1-9]\d*$/;

export interface ValidateTasksArtifactRequest {
  mode: ArtifactGovernanceMode;
  content: string;
  path?: string;
  persistence?: ValidateTasksArtifactPersistence;
}

export interface ValidateTasksArtifactPersistence {
  comparison: ArtifactComparisonMetadata;
  sources: Readonly<{
    prompt: ArtifactSnapshot | null;
    thothMem: ArtifactSnapshot | null;
    openspec: ArtifactSnapshot | null;
  }>;
}

export function validateTasksArtifact(
  request: ValidateTasksArtifactRequest,
): ArtifactGovernanceResult {
  const lines = request.content.split(/\r?\n/);
  const findings: ArtifactGovernanceFinding[] = [];

  let recognizedPhaseCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const trimmedLine = rawLine.trim();
    const lineNumber = index + 1;

    if (trimmedLine.startsWith('## ')) {
      if (RECOGNIZED_PHASE_HEADER.test(trimmedLine)) {
        recognizedPhaseCount += 1;
      } else {
        findings.push({
          code: 'tasks.unrecognized-phase-header',
          severity: 'error',
          message:
            'Phase headers must use the `## Phase N: Title` execution contract.',
          path: request.path,
          line: lineNumber,
        });
      }

      continue;
    }

    if (!isTopLevelTaskLine(rawLine)) {
      continue;
    }

    const taskMatch = TASK_LINE.exec(rawLine);

    if (taskMatch === null) {
      findings.push({
        code: 'tasks.missing-state',
        severity: 'error',
        message: 'Task checklist items must declare an allowed checkbox state.',
        path: request.path,
        line: lineNumber,
      });
      continue;
    }

    const [, state, taskBody] = taskMatch;

    if (state.length === 0) {
      findings.push({
        code: 'tasks.missing-state',
        severity: 'error',
        message: 'Task checklist items cannot omit their checkbox state.',
        path: request.path,
        line: lineNumber,
      });
    } else if (!ALLOWED_TASK_STATES.has(state)) {
      findings.push({
        code: 'tasks.invalid-state',
        severity: 'error',
        message:
          'Task checkbox state must be one of `[ ]`, `[x]`, `[~]`, or `[-]`.',
        path: request.path,
        line: lineNumber,
      });
    }

    const numberingMatch = TASK_NUMBERING.exec(taskBody);

    if (numberingMatch === null) {
      findings.push({
        code: 'tasks.malformed-numbering',
        severity: 'error',
        message:
          'Task checklist items must start with a numbered identifier like `2.1`.',
        path: request.path,
        line: lineNumber,
      });
    } else {
      inspectParallelMarker(
        numberingMatch[1],
        taskBody,
        lineNumber,
        request,
        findings,
      );
    }

    const verificationLines = collectVerificationLines(lines, index + 1);
    inspectAnnotationMarkers(
      taskBody,
      verificationLines,
      lineNumber,
      request,
      findings,
    );
    const verificationState = inspectVerificationBlock(verificationLines);

    if (!verificationState.hasHeader) {
      findings.push({
        code: 'tasks.missing-verification-block',
        severity: 'error',
        message:
          'Each task checklist item must include a `Verification` block.',
        path: request.path,
        line: lineNumber,
      });
      continue;
    }

    if (!verificationState.hasRun) {
      findings.push({
        code: 'tasks.missing-verification-run',
        severity: 'error',
        message: 'Verification blocks must include a `Run` command.',
        path: request.path,
        line: lineNumber,
      });
    }

    if (!verificationState.hasExpected) {
      findings.push({
        code: 'tasks.missing-verification-expected',
        severity: 'error',
        message: 'Verification blocks must include an `Expected` outcome.',
        path: request.path,
        line: lineNumber,
      });
    }
  }

  if (recognizedPhaseCount === 0) {
    findings.push({
      code: 'tasks.missing-phase-headers',
      severity: 'error',
      message:
        'tasks.md must include at least one recognized `## Phase N: Title` header.',
      path: request.path,
      line: 1,
    });
  }

  collectPersistenceFindings(request, findings);

  return createArtifactGovernanceResult({
    validator: 'tasks-validator',
    artifact: 'tasks.md',
    mode: request.mode,
    findings,
  });
}

function collectPersistenceFindings(
  request: ValidateTasksArtifactRequest,
  findings: ArtifactGovernanceFinding[],
): void {
  const persistence = request.persistence;

  if (!persistence) {
    return;
  }

  const { comparison } = persistence;

  const finding = createPersistenceFinding(comparison, request.path);

  if (finding) {
    findings.push(finding);
  }
}

function createPersistenceFinding(
  comparison: ArtifactComparisonMetadata,
  path: string | undefined,
): ArtifactGovernanceFinding | null {
  if (comparison.outcome === 'complete') {
    return null;
  }

  const metadata = {
    outcome: comparison.outcome,
    inspectableSource: comparison.inspectableSource,
    providerState: comparison.providerState,
    missingSources: comparison.missingSources.join(','),
  };

  switch (comparison.outcome) {
    case 'partial':
      return {
        code: 'persistence.hybrid-partial',
        severity: 'warning',
        message:
          'Hybrid persistence is incomplete because one required artifact source is unavailable.',
        path,
        metadata,
      };
    case 'unavailable':
      return {
        code: 'persistence.source-unavailable',
        severity: 'error',
        message:
          'The artifact is unavailable from every source required by the declared persistence mode.',
        path,
        metadata,
      };
    case 'diverged':
      return {
        code: 'persistence.hybrid-diverged',
        severity: 'warning',
        message:
          'Hybrid artifact snapshots diverged; neither source is selected for inspection.',
        path,
        metadata,
      };
  }
}

function inspectParallelMarker(
  numbering: string,
  taskBody: string,
  lineNumber: number,
  request: ValidateTasksArtifactRequest,
  findings: ArtifactGovernanceFinding[],
): void {
  // Anchor strictly to the canonical slot: the segment immediately after the
  // `N.M` number and its following whitespace. This prevents `[P]`-like tokens
  // elsewhere in the title from producing false positives.
  const afterNumbering = taskBody.slice(numbering.length).replace(/^\s+/, '');
  const slotMatch = PARALLEL_MARKER_SLOT.exec(afterNumbering);

  if (slotMatch === null) {
    return;
  }

  const token = slotMatch[0];

  if (
    token !== CANONICAL_PARALLEL_MARKER &&
    token.toUpperCase() === CANONICAL_PARALLEL_MARKER
  ) {
    findings.push({
      code: 'tasks.malformed-parallel-marker',
      severity: 'warning',
      message:
        'Parallel marker must be the canonical uppercase `[P]` placed after the task number.',
      path: request.path,
      line: lineNumber,
    });
  }
}

function inspectAnnotationMarkers(
  taskBody: string,
  subLines: readonly string[],
  lineNumber: number,
  request: ValidateTasksArtifactRequest,
  findings: ArtifactGovernanceFinding[],
): void {
  const segments = [taskBody, ...subLines];

  for (const segment of segments) {
    const usnMatches = segment.match(USN_TOKEN);

    if (usnMatches !== null) {
      for (const token of usnMatches) {
        if (!CANONICAL_USN_TOKEN.test(token)) {
          findings.push({
            code: 'tasks.malformed-usn-marker',
            severity: 'warning',
            message:
              'User-story marker must match the canonical `[USN-<n>]` form.',
            path: request.path,
            line: lineNumber,
          });
        }
      }
    }

    const priorityMatch = PRIORITY_LABEL.exec(segment);

    if (
      priorityMatch !== null &&
      !CANONICAL_PRIORITY_VALUE.test(priorityMatch[1])
    ) {
      findings.push({
        code: 'tasks.malformed-priority-marker',
        severity: 'warning',
        message:
          'Priority marker must use the canonical `Priority: P<n>` form (e.g. `P1`).',
        path: request.path,
        line: lineNumber,
      });
    }
  }
}

function isTopLevelTaskLine(line: string): boolean {
  return /^- /.test(line);
}

function collectVerificationLines(
  lines: readonly string[],
  startIndex: number,
): string[] {
  const block: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (line.startsWith('## ') || isTopLevelTaskLine(line)) {
      break;
    }

    if (line.trim().length > 0) {
      block.push(line.trim());
    }
  }

  return block;
}

function inspectVerificationBlock(lines: readonly string[]): {
  hasHeader: boolean;
  hasRun: boolean;
  hasExpected: boolean;
} {
  let hasHeader = false;
  let hasRun = false;
  let hasExpected = false;

  for (const line of lines) {
    if (VERIFICATION_HEADER.test(line)) {
      hasHeader = true;
      continue;
    }

    if (VERIFICATION_RUN.test(line)) {
      hasRun = true;
      continue;
    }

    if (VERIFICATION_EXPECTED.test(line)) {
      hasExpected = true;
    }
  }

  return {
    hasHeader,
    hasRun,
    hasExpected,
  };
}
