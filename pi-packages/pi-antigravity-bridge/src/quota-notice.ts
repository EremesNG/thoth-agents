// Quota-exhaustion notice detection (upstream 9d20772, issue #16). agy streams
// the account's quota notice as plain agent text and ends the turn OK, so the
// provider reclassifies a notice-only outcome into a pi error instead of a
// successful reply (provider failover never fired otherwise).
//
// The errorMessage wording is load-bearing: pi-ai's isRetryableAssistantError
// (installed 1.6.0: dist/utils/retry.js) gates failover and classifies
// "quota exceeded" / "billing" wording as NON-retryable, so the message
// carries the retryable marker "rate limit" while staying clear of every
// non-retryable pattern. The raw upstream notice is never echoed in the
// message, so upstream copy drift cannot poison the classification.

import type { TurnOutcome } from "./driver-types.js";

/** Reset interval parsed from the notice, e.g. "153h38m14s". */
export interface QuotaNotice {
	resetsIn?: string;
}

// Whole attested notice forms only (upstream 9d20772 test corpus plus the
// observed agy text): an optional "⚠" and one EXPLICITLY ENUMERATED
// account-quota headline ("Individual quota reached", "Daily quota reached",
// each with optional "for this model"; "Quota exhausted"), then only the
// known notice sentences in order. No generic "<word> quota ..." prefix:
// "Storage quota limit reached." or "Disk quota exceeded." are ordinary text. Any other trailing
// text makes the whole response ordinary prose, so keyword-laden answers
// ("Quota exceeded. That is a common quota error ...") never match.
const DURATION = String.raw`(?:\d+h)?(?:\d+m)?\d+s`;
const NOTICE_PATTERN = new RegExp(
	String.raw`^(?:⚠\s*)?(?:individual\s+quota\s+reached(?:\s+for\s+this\s+model)?|daily\s+quota\s+reached(?:\s+for\s+this\s+model)?|quota\s+exhausted)\s*[.!]?` +
		String.raw`(?:\s+Please\s+upgrade\s+your\s+subscription\s+to\s+increase\s+your\s+limits\.?)?` +
		String.raw`(?:\s+Try\s+again\s+tomorrow\.?)?` +
		String.raw`(?:\s+Resets?\s+in\s+(${DURATION})\.?)?$`,
	"i",
);
const NOTICE_MAX_CHARS = 400;

/** Classify a settled driver response as a quota-exhaustion notice.
 *  Conservative by design: false negatives keep a normal reply, false
 *  positives would turn real answers into errors. */
export function detectQuotaNotice(response: string): QuotaNotice | undefined {
	const trimmed = response.trim();
	if (trimmed.length === 0 || trimmed.length > NOTICE_MAX_CHARS) return undefined;
	const match = NOTICE_PATTERN.exec(trimmed);
	if (!match) return undefined;
	return match[1] ? { resetsIn: match[1] } : {};
}

/** Retryable-classified pi errorMessage for a detected notice. */
export function quotaErrorMessage(notice: QuotaNotice): string {
	const reset = notice.resetsIn ? `; resets in ${notice.resetsIn}` : "";
	return `agy rate limit (ResourceExhausted): Antigravity quota exhausted${reset}`;
}

/** Shared final-outcome classification for both transports and both
 *  settlement sites (main and late-result redelivery). `sawNonTextActivity`
 *  is tracked over the WHOLE underlying handle, never reset at parked or
 *  replay delivery boundaries. Pure: the caller applies it before fallback
 *  output and before any binding/watermark mutation. */
export function classifyQuotaOutcome(
	outcome: Pick<TurnOutcome, "status" | "aborted" | "response">,
	sawNonTextActivity: boolean,
): QuotaNotice | undefined {
	if (outcome.status !== "OK" || outcome.aborted || sawNonTextActivity) return undefined;
	return detectQuotaNotice(outcome.response);
}
