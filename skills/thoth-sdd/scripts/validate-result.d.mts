import type {
  SpecialistResult,
  SpecialistRole,
  OracleReviewKind,
} from '../../../src/harness/core/result-contract';

export interface ResultValidationOptions {
  role?: SpecialistRole;
  reviewKind?: OracleReviewKind;
  recordSha256?: string;
  noRecord?: boolean;
}
export type ResultIssueCode =
  | 'ENVELOPE_FORMAT'
  | 'JSON_SYNTAX'
  | 'JSON_DUPLICATE_KEY'
  | 'REQUIRED_FIELD'
  | 'UNDECLARED_FIELD'
  | 'TYPE_MISMATCH'
  | 'INVALID_VALUE'
  | 'ROLE_MISMATCH'
  | 'REVIEW_KIND_MISMATCH'
  | 'EVIDENCE_ID_DUPLICATE'
  | 'EVIDENCE_REFERENCE'
  | 'VERDICT_MISMATCH'
  | 'VERDICT_STATUS'
  | 'BLOCKING_RISK'
  | 'RECORD_BINDING_REQUIRED'
  | 'RECORD_BINDING_FORBIDDEN'
  | 'RECORD_DIGEST_MISMATCH'
  | 'EXPECTATION_INVALID'
  | 'CLI_USAGE'
  | 'CLI_INPUT';
export interface ResultValidationIssue {
  code: ResultIssueCode;
  /** JSON Pointer; the empty string denotes the whole message/envelope. */
  path: string;
  message: string;
}
export type ResultValidation =
  | { valid: true; envelope: SpecialistResult; issues: [] }
  | { valid: false; envelope?: never; issues: ResultValidationIssue[] };
export function validateResult(
  message: string,
  options?: ResultValidationOptions,
): ResultValidation;
export const RESULT_VALIDATOR_USAGE: string;
