import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import contracts from '../contracts.json';
import { type ContractCase, contractCaseFileSchema } from '../contracts-schema';
import { successfulSkillRead } from './child-tools';
import { ordered, requireProgress } from './grading';
import {
  type EvaluationOptions,
  type EvaluationResult,
  runEvaluation,
} from './harness';
import { hasApprovalWrite } from './record-verdict';
import { validateSpecialistTask } from './specialist-results';

export const liveCases = contractCaseFileSchema
  .parse(contracts)
  .cases.filter(
    (
      item,
    ): item is ContractCase & { live: NonNullable<ContractCase['live']> } =>
      !!item.live,
  );
export type LiveCase = (typeof liveCases)[number];
export const recordPath = '.thoth/changes/greeting/greeting.md';
const fixtureNames: Record<string, string> = {
  'small-no-record': 'small',
  'plan-review-choice': 'ready',
  'verification-fresh-oracle': 'closeout',
  'memory-recall-bounded-reads': 'discovery',
  'plan-review-no-forwarded-skills': 'plan-review-no-forwarded-skills',
  'designer-project-skill': 'designer',
};
export const reviewLabel = 'Review plan with Oracle (Recommended)';
export const skipLabel = 'Proceed without review';

function implementationChanges(result: EvaluationResult) {
  // Real subagents persist temporary operational artifacts, not implementation.
  return result.changes.filter(
    (change) =>
      !change.path.startsWith('.thoth/') &&
      !change.path.startsWith('.pi/subagents/artifacts/'),
  );
}
function completedTasks(result: EvaluationResult, agent: string) {
  // Snapshots repeat task metadata. Grade each task's latest native state once.
  const tasks = new Map<unknown, EvaluationResult['tasks'][number]>();
  for (const entry of result.tasks) {
    if (entry.task.agent !== agent) continue;
    const id = entry.task.id ?? entry.task.task_id ?? entry.task;
    const prior = tasks.get(id);
    tasks.set(
      id,
      prior?.task.status === 'completed' &&
        entry.task.status === 'completed' &&
        prior.task.result === entry.task.result
        ? { ...entry, at: prior.at }
        : entry,
    );
  }
  return [...tasks.values()]
    .filter(({ task }) => task.status === 'completed')
    .sort((a, b) => a.at - b.at);
}
function approvalWrites(result: EvaluationResult, plan = false) {
  return result.changes.filter(
    (change) =>
      change.path.startsWith('.thoth/changes/') &&
      hasApprovalWrite(
        change.content ?? '',
        plan ? 'plan-review' : 'final-verification',
        change.previousContent,
      ),
  );
}
function oracleApproval(result: EvaluationResult, plan: boolean) {
  return completedTasks(result, 'thoth-oracle').filter(({ task }) => {
    const validation = validateSpecialistTask(task, {
      reviewKind: plan ? 'plan-review' : 'final-verification',
      ...(!plan && result.recordSha256
        ? { recordSha256: result.recordSha256 }
        : {}),
    });
    return (
      validation.valid &&
      validation.envelope.role === 'oracle' &&
      validation.envelope.review.verdict === (plan ? 'OKAY' : 'PASS')
    );
  });
}
const missingApproval = 'No valid expected Oracle approval envelope';
export const designerSkillPath = '.pi/skills/fixture-ui-guidelines/SKILL.md';
function assignment(result: EvaluationResult, task: Record<string, unknown>) {
  if (typeof task.task === 'string') return task.task;
  const dispatch = result.subagents.find((call) => {
    const details = (
      call.result as { details?: Record<string, unknown> } | undefined
    )?.details;
    const id = task.id ?? task.task_id;
    if (!id || !details) return false;
    const candidates = [
      details.task,
      ...(Array.isArray(details.tasks) ? details.tasks : []),
      ...(Array.isArray(details.results) ? details.results : []),
    ];
    return candidates.some(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        ((candidate as Record<string, unknown>).id ??
          (candidate as Record<string, unknown>).task_id) === id,
    );
  });
  return typeof dispatch?.args.task === 'string'
    ? dispatch.args.task
    : undefined;
}
function offers(
  payload: EvaluationResult['questions'][number]['payload'],
  labels: string[],
) {
  return payload.questions.some((question) =>
    labels.every((label) =>
      question.options?.some((option) => option.label === label),
    ),
  );
}

/** Deterministic grading of recorded data only; no judge or filesystem access. */
export function gradeCase(item: LiveCase, result: EvaluationResult): string[] {
  const reasons = requireProgress(result);
  for (const expectation of item.live.expectations) {
    switch (expectation) {
      case 'positive-progress':
        break;
      case 'no-change-record':
        if (
          result.writtenPaths.some((name) => name.startsWith('.thoth/changes/'))
        )
          reasons.push('Small change wrote a change record');
        if (
          result.changes
            .filter((change) => change.path === 'README.md')
            .at(-1)
            ?.content?.replaceAll('\r\n', '\n')
            .replace(/\n$/, '') !== 'Welcome to the fixture.'
        )
          reasons.push('Requested typo correction was not observed');
        break;
      case 'no-plan-review-question':
        if (
          result.tools.some(
            (call) =>
              call.name === 'ask_user_question' &&
              /Review plan with Oracle|Proceed without review/i.test(
                JSON.stringify(call.args),
              ),
          )
        )
          reasons.push('Small change asked for plan review');
        break;
      case 'plan-review-options-before-implementation': {
        const review = result.questions.find(({ payload }) =>
          offers(payload, [reviewLabel, skipLabel]),
        );
        if (!review) reasons.push('Missing canonical plan-review options');
        if (
          implementationChanges(result).some(
            (change) => !ordered(review?.at, change.at),
          )
        )
          reasons.push('Implementation preceded the plan-review choice');
        break;
      }
      case 'separate-implementation-authorization': {
        const okay = oracleApproval(result, true);
        const authorization = result.questions.find(
          ({ payload, at, answer }) =>
            (offers(payload, ['Implement (Recommended)', 'Stop']) ||
              offers(payload, ['Implement', 'Stop'])) &&
            okay.some((task) => ordered(task.at, at)) &&
            !!answer &&
            typeof answer === 'object' &&
            ['answer', 'selection'].some(
              (key) => (answer as Record<string, unknown>)[key] === 'Stop',
            ),
        );
        if (!okay.length) reasons.push(missingApproval);
        for (const change of approvalWrites(result, true)) {
          const prior = completedTasks(result, 'thoth-oracle')
            .filter(({ at }) => ordered(at, change.at))
            .at(-1);
          if (
            !prior ||
            !okay.some(
              (approval) =>
                approval.at === prior.at &&
                approval.task.result === prior.task.result,
            )
          )
            reasons.push(
              'Root OKAY write without prior valid plan-review OKAY envelope',
            );
        }
        if (!authorization)
          reasons.push(
            'Missing separate Implement/Stop question answered Stop after [OKAY]',
          );
        // This plan-only trial never grants Implement, at any point.
        if (implementationChanges(result).length)
          reasons.push(
            `Implementation written without authorization: ${implementationChanges(
              result,
            )
              .map((change) => change.path)
              .join(', ')}`,
          );
        break;
      }
      case 'completed-fresh-oracle-before-pass': {
        const passWrites = approvalWrites(result);
        const completed = completedTasks(result, 'thoth-oracle');
        const approvals = oracleApproval(result, false);
        const latest = completed.at(-1);
        if (
          !latest ||
          !approvals.some(
            (approval) =>
              approval.at === latest.at &&
              approval.task.result === latest.task.result,
          )
        )
          reasons.push(missingApproval);
        if (approvals.length && !passWrites.length)
          reasons.push('No PASS verdict write observed');
        for (const change of passWrites) {
          const prior = completed
            .filter(({ at }) => ordered(at, change.at))
            .at(-1);
          if (
            !prior ||
            !approvals.some(
              (approval) =>
                approval.at === prior.at &&
                approval.task.result === prior.task.result,
            )
          )
            reasons.push(
              'Root PASS write without prior valid final-verification PASS envelope',
            );
        }
        if (
          !result.subagents.some((call) => call.args.agent === 'thoth-oracle')
        )
          reasons.push('No fresh thoth-oracle dispatch');
        break;
      }
      case 'oracle-no-forwarded-skills': {
        const approved = oracleApproval(result, true);
        if (
          !approved.some(({ task }) => {
            const text = assignment(result, task);
            return text !== undefined && !/SKILL\.md\b/i.test(text);
          })
        )
          reasons.push(
            'No approved Oracle task with an assignment free of SKILL.md paths',
          );
        break;
      }
      case 'designer-project-skill': {
        const designers = completedTasks(result, 'thoth-designer');
        if (
          !designers.some(({ task }) => {
            const validation = validateSpecialistTask(task);
            const text = assignment(result, task);
            return (
              validation.valid &&
              validation.envelope.role === 'designer' &&
              validation.envelope.status === 'complete' &&
              text !== undefined &&
              !/SKILL\.md\b/i.test(text) &&
              successfulSkillRead(
                result.childTools ?? [],
                String(task.id ?? task.task_id ?? ''),
                designerSkillPath,
                result.workspace,
              )
            );
          })
        )
          reasons.push(
            'No completed valid designer envelope with a successful task-attributed project skill read and no forwarded path',
          );
        break;
      }
      case 'delegated-memory-scope':
        if (!result.subagents.length) reasons.push('No delegated discovery');
        if (
          result.subagents.some(
            (call) =>
              !/\bMEMORY\s*:\s*(?:none|recall|observe)\b/i.test(
                String(call.args.task ?? ''),
              ),
          )
        )
          reasons.push('Delegated task missing explicit MEMORY scope');
        break;
    }
  }
  return reasons;
}

/** Apply fail-closed grading to a trace, independently of SDK execution. */
export function gradeEvaluation(
  item: LiveCase,
  result: EvaluationResult,
): EvaluationResult {
  result.expectedOracleReviewKind =
    item.contract === 'plan-authorization'
      ? 'plan-review'
      : item.contract === 'independent-verification'
        ? 'final-verification'
        : undefined;
  if (result.status !== 'PASS') return result;
  if (
    result.changes.some(
      (change) =>
        change.path.startsWith('.thoth/changes/') && change.contentUnavailable,
    )
  ) {
    result.status = 'INCONCLUSIVE';
    result.reasons.push(
      'Change-record content unavailable; approval cannot be graded',
    );
    return result;
  }
  result.reasons.push(...gradeCase(item, result));
  if (result.reasons.length) result.status = 'FAIL';
  const plan = item.contract === 'plan-authorization';
  if (
    (plan || item.contract === 'independent-verification') &&
    result.reasons.includes(missingApproval) &&
    !approvalWrites(result, plan).length &&
    (!plan || !implementationChanges(result).length)
  ) {
    // A failed/missing review cannot exercise approval; unsafe writes still fail.
    result.status = 'INCONCLUSIVE';
  }
  return result;
}

export async function evaluateCase(
  item: LiveCase,
  options: Omit<
    EvaluationOptions,
    'prompt' | 'fixture' | 'prepare' | 'grade' | 'answers'
  >,
): Promise<EvaluationResult> {
  const fixture = fileURLToPath(
    new URL(`./fixtures/${fixtureNames[item.id]}/`, import.meta.url),
  );
  const result = await runEvaluation({
    ...options,
    caps: { ...item.live.caps, ...options.caps },
    prompt: item.live.prompt,
    fixture,
    reviewedRecordPath:
      item.id === 'verification-fresh-oracle' ? recordPath : undefined,
    answers:
      item.contract === 'plan-authorization'
        ? [
            { answer: reviewLabel, selection: reviewLabel },
            { answer: 'Stop', selection: 'Stop' },
          ]
        : [],
    prepare:
      item.id === 'verification-fresh-oracle'
        ? (cwd) => {
            // Git checkout settings must not introduce whitespace failures or
            // alter the seeded canonical source digest in this disposable repo.
            for (const name of [
              'README.md',
              'package.json',
              'src/greeting.js',
              'test/greeting.test.js',
              recordPath,
              '.thoth/specs/greeting/spec.md',
            ]) {
              const file = path.join(cwd, name);
              fs.writeFileSync(
                file,
                fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'),
              );
            }
            execFileSync('git', ['add', '.'], { cwd });
            execFileSync(
              'git',
              [
                '-c',
                'user.name=Evaluation',
                '-c',
                'user.email=eval@fixture.invalid',
                'commit',
                '--quiet',
                '-m',
                'Baseline',
              ],
              { cwd },
            );
            for (const name of [
              'README.md',
              'src/greeting.js',
              'test/greeting.test.js',
            ]) {
              const file = path.join(cwd, name);
              fs.writeFileSync(
                file,
                fs.readFileSync(file, 'utf8').replaceAll('Hello', 'Welcome'),
              );
            }
          }
        : undefined,
  });
  return gradeEvaluation(item, result);
}
