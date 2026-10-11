import {
  type ResultValidation,
  type ResultValidationOptions,
  validateResult,
} from '../../skills/thoth-sdd/scripts/validate-result.mjs';

/** Oracle gates only: validate the native result verbatim, never extract prose/fences. */
export function validateSpecialistTask(
  task: Record<string, unknown>,
  options: ResultValidationOptions = {},
): ResultValidation {
  if (task.agent !== 'thoth-oracle') {
    return {
      valid: false,
      issues: [
        {
          code: 'ROLE_MISMATCH',
          path: '/role',
          message: 'Only thoth-oracle tasks can supply gate approvals.',
        },
      ],
    };
  }
  return validateResult(String(task.result ?? ''), {
    ...options,
    role: 'oracle',
  });
}
