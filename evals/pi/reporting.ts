import type { EvaluationResult } from './harness';
import { validateSpecialistTask } from './specialist-results';

function compact(value: unknown, limit = 600): string {
  const text =
    typeof value === 'string'
      ? value
      : (JSON.stringify(value) ?? 'unavailable');
  return text.length > limit ? `${text.slice(0, limit)}… [truncated]` : text;
}

/** Console-only diagnostics; default runs retain their summary-only output. */
export function reportVerboseEvaluation(
  result: EvaluationResult,
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = console.log,
): void {
  if (env.THOTH_EVAL_VERBOSE !== '1') return;
  log(
    `  Parent loaded skills: ${result.loadedSkills.map((skill) => skill.name).join(', ') || '(none)'}`,
  );
  log(
    '  Child sessions: repository package catalog and trusted disposable project skills; read evidence comes from native child sessions.',
  );
  log('  Parent tool calls (ordered):');
  for (const call of [...result.tools].sort((a, b) => a.start - b.start))
    log(`    #${call.start} ${call.name} ${compact(call.args)}`);
  log('  Scripted questions:');
  for (const question of result.questions) {
    for (const payload of question.payload.questions)
      log(
        `    #${question.at} header=${compact(payload.header)} options=${compact(payload.options)}`,
      );
    log(`      answer=${compact(question.answer)}`);
  }
  log('  Subagent tasks:');
  for (const call of result.subagents)
    log(
      `    dispatch #${call.start} agent=${compact(call.args.agent)} mode=${compact(call.args.mode)} skill-path-referenced=${/SKILL\.md\b/.test(String(call.args.task ?? '')) ? 'Yes' : 'No'} status=${call.isError ? 'error' : call.end === undefined ? 'unfinished' : 'returned'} result=${compact(call.result, 500)}`,
    );
  const latest = new Map<unknown, EvaluationResult['tasks'][number]>();
  for (const entry of result.tasks)
    latest.set(entry.task.id ?? entry.task.task_id ?? entry.task, entry);
  for (const { at, task } of latest.values()) {
    const dispatch = result.subagents.find(
      (call) => call.args.agent === task.agent,
    );
    const taskId = String(task.id ?? task.task_id ?? 'unavailable');
    if (task.agent === 'thoth-oracle' && result.expectedOracleReviewKind) {
      const validation = validateSpecialistTask(task, {
        reviewKind: result.expectedOracleReviewKind,
        recordSha256: result.recordSha256,
      });
      log(
        `      envelope-valid=${validation.valid ? 'Yes' : 'No'} issue-codes=${validation.issues.map((issue) => issue.code).join(', ') || '(none)'}`,
      );
      // Diagnostic-only parsing without expected options: an otherwise valid
      // wrong-kind/digest envelope must expose its judgment, never gain approval.
      const native = validateSpecialistTask(task);
      const review =
        native.valid && native.envelope.role === 'oracle'
          ? native.envelope.review
          : undefined;
      log(
        `      task=${taskId} review.kind=${review?.kind ?? 'unavailable'} verdict=${review?.verdict ?? 'unavailable'}`,
      );
    }
    if (task.agent === 'thoth-designer') {
      const reads = (result.childTools ?? []).filter(
        (call) => call.taskId === taskId && call.name === 'read',
      );
      if (!reads.length)
        log(`      task=${taskId} child-read-paths=(none recorded)`);
      for (const read of reads)
        log(
          `      task=${taskId} child-read-path=${String(read.args.path ?? 'unavailable')} completed=${read.completed} isError=${read.isError}`,
        );
    }
    log(
      `    #${at} agent=${compact(task.agent)} mode=${compact(task.mode ?? dispatch?.args.mode)} status=${compact(task.status)} result=${compact(task.result, 500)}`,
    );
  }
  log('  Native child tool calls:');
  for (const call of result.childTools ?? [])
    log(
      `    task=${call.taskId} ${call.name} ${compact(call.args)} completed=${call.completed} isError=${call.isError}`,
    );
  log(`  Written paths: ${compact(result.writtenPaths, 2000)}`);
  for (const change of result.changes) {
    log(`    #${change.at} ${change.path} (${change.kind})`);
    log(
      `      content excerpt: ${change.content === undefined ? (change.contentUnavailable ? '[unavailable: binary or oversized]' : '[no content]') : compact(change.content, 1500)}`,
    );
  }
  log(`  Final assistant text: ${compact(result.finalText, 4000)}`);
}

/** Map findings to runner outcomes without mistaking an inconclusive trace for a pass. */
export function reportEvaluationStatus(
  result: Pick<EvaluationResult, 'status' | 'reasons'>,
  skip: (reason: string) => void,
): void {
  const reason = result.reasons.join('; ') || result.status;
  if (result.status === 'INCONCLUSIVE') skip(reason);
  else if (result.status === 'FAIL') throw new Error(reason);
}
