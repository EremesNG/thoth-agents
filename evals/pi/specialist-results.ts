import {
  type ResultValidationOptions,
  validateResult,
} from '../../skills/thoth-sdd/scripts/validate-result.mjs';

/** Validate the native task result verbatim. Prose/fence extraction is not validation. */
export function validateSpecialistTask(
  task: Record<string, unknown>,
  options: ResultValidationOptions = {},
) {
  const role = String(task.agent ?? '').replace(/^thoth-/, '');
  return validateResult(String(task.result ?? ''), {
    ...options,
    role: role as ResultValidationOptions['role'],
  });
}
